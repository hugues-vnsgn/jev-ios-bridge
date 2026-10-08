import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readdirSync, readlinkSync, realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { z } from 'zod/v4';
import { admissionRoot, canonicalDevice } from './admission.js';
import { isDeepStrictEqual } from 'node:util';
import { AdmissionError, AdmissionSqlite, parseMigrationDeclaration } from './admission-sqlite.js';
/** These booleans are operational assertions, never proof that an old writer is fenced. */
export { parseMigrationDeclaration } from './admission-sqlite.js';
const protectedDevices = ['73997430-DB8A-48C8-8146-12320CE6AEFE', '2FE383F2-2D0F-4286-8797-D3ACEFCD6220',
    '6A8C5F93-F59A-456B-B157-10642209B734', '0E42FDE2-5E09-42D3-9876-9EF0037FCBE7'];
function sourceRoot(kind, path, required) {
    if (!isAbsolute(path))
        throw new AdmissionError('INVALID_REQUEST', 'Historical roots must be absolute');
    const absolute = resolve(path);
    try {
        const stat = lstatSync(absolute);
        if (!stat.isDirectory() || stat.isSymbolicLink())
            throw new AdmissionError('STATE_UNAVAILABLE', 'Unsafe historical root');
        const root = realpathSync(absolute);
        return { kind, root, requestedRoots: [absolute], present: true, files: [] };
    }
    catch (error) {
        if (error.code !== 'ENOENT' || required)
            throw error;
        return { kind, root: canonicalLocation(absolute), requestedRoots: [absolute], present: false, files: [] };
    }
}
function canonicalLocation(path, links = 0) {
    if (links > 40)
        throw new AdmissionError('STATE_UNAVAILABLE', 'Historical path separation cannot be established');
    let stat;
    try {
        stat = lstatSync(path);
    }
    catch (error) {
        if (error.code !== 'ENOENT')
            throw error;
        return join(canonicalLocation(dirname(path), links), basename(path));
    }
    // Resolving a dangling link's intended location does not validate it as a
    // source. The guarded scanner still rejects the link itself.
    if (stat.isSymbolicLink())
        return canonicalLocation(resolve(dirname(path), readlinkSync(path)), links + 1);
    return realpathSync(path);
}
const hash = (value) => createHash('sha256').update(value).digest('hex');
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function unsafeSource() { throw new AdmissionError('STATE_UNAVAILABLE', 'Historical state is corrupt, conflicting or unattributable; activation refused'); }
function readRecord(path, source, allowMalformed = false) {
    // A recognized filename can still name a FIFO or be replaced after lstat.
    // Open without waiting for a writer, then validate the actual descriptor.
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
        const stat = fstatSync(fd);
        if (!stat.isFile() || stat.size > 16 * 1024 * 1024)
            unsafeSource();
        const bytes = readFileSync(fd);
        const sha256 = hash(bytes);
        source.files.push({ path, sha256 });
        let record = null;
        try {
            record = JSON.parse(bytes.toString('utf8'));
        }
        catch {
            if (!allowMalformed)
                unsafeSource();
        }
        return { path, sha256, record };
    }
    finally {
        closeSync(fd);
    }
}
function readLeases(source, devices) {
    let nonIos = 0;
    for (const name of readdirSync(source.root).sort()) {
        const match = /^(.*)\.lock(?:\.[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.tmp)?$/i.exec(name);
        if (!match?.[1])
            unsafeSource();
        const rawIdentity = match[1];
        const { record } = readRecord(join(source.root, name), source, true);
        let device;
        try {
            device = canonicalDevice(rawIdentity);
        }
        catch { /* A well-formed non-UUID lease belongs outside iOS admission. */ }
        const valid = object(record) && Number.isSafeInteger(record.pid) && record.pid > 0
            && typeof record.token === 'string' && record.token.length > 0 && typeof record.deviceId === 'string'
            && typeof record.createdAt === 'string' && Number.isFinite(Date.parse(record.createdAt))
            && (record.runId === undefined || typeof record.runId === 'string')
            && (record.ownedProcesses === undefined || (Array.isArray(record.ownedProcesses) && record.ownedProcesses.every(value => typeof value === 'string')));
        if (object(record) && typeof record.deviceId === 'string' && record.deviceId.toUpperCase() !== rawIdentity.toUpperCase())
            unsafeSource();
        if (!device) {
            if (!valid)
                unsafeSource();
            nonIos++;
            continue;
        }
        // PID death never establishes release. A live old holder contradicts the
        // declared quiescence; malformed and dead holders retain this UUID instead.
        if (valid) {
            try {
                process.kill(record.pid, 0);
                throw new AdmissionError('STATE_UNAVAILABLE', 'A live historical iOS lease prevents offline activation');
            }
            catch (error) {
                if (error.code !== 'ESRCH')
                    throw error;
            }
        }
        devices.set(device, true);
    }
    return nonIos;
}
function identity(record) {
    if (!object(record) || typeof record.deviceId !== 'string' || typeof record.actionId !== 'string'
        || !record.actionId.length || record.actionId.length > 1024 || !Object.hasOwn(record, 'intent'))
        unsafeSource();
    return { device: canonicalDevice(record.deviceId), rawDevice: record.deviceId, actionId: record.actionId, record };
}
const resultSchema = z.object({
    status: z.enum(['outcome_observed', 'already_satisfied', 'refused', 'inconclusive']),
    actionAttempted: z.boolean(), actionAcknowledged: z.boolean(), observations: z.number().int().nonnegative(),
});
function completedOutcome(result) {
    const parsed = resultSchema.safeParse(result.result);
    if (!parsed.success || result.status !== 'completed')
        return 'inconclusive';
    const value = parsed.data;
    if (value.actionAcknowledged && !value.actionAttempted)
        return 'inconclusive';
    if (value.status === 'outcome_observed' && (!value.actionAttempted || !value.actionAcknowledged))
        return 'inconclusive';
    if ((value.status === 'already_satisfied' || value.status === 'refused') && (value.actionAttempted || value.actionAcknowledged))
        return 'inconclusive';
    return value.status;
}
function readJournal(source, actions, devices) {
    for (const directoryName of readdirSync(source.root).sort()) {
        const directory = join(source.root, directoryName);
        const stat = lstatSync(directory);
        if (!/^[a-f\d]{64}$/.test(directoryName) || !stat.isDirectory() || stat.isSymbolicLink())
            unsafeSource();
        const names = readdirSync(directory).sort();
        if (!names.length)
            unsafeSource();
        for (const name of names) {
            const publishedName = name.replace(/\.[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.tmp$/i, '');
            const temporary = publishedName !== name;
            const match = /^([a-f\d]{64})\.(intent|result)\.json$/.exec(publishedName);
            if (!match && !['claim.json', 'quarantine.json'].includes(publishedName))
                unsafeSource();
            const sourceRecord = readRecord(join(directory, name), source);
            if (publishedName === 'quarantine.json') {
                const record = sourceRecord.record;
                if (!object(record) || typeof record.deviceId !== 'string' || hash(record.deviceId) !== directoryName)
                    unsafeSource();
                devices.set(canonicalDevice(record.deviceId), true);
                continue;
            }
            const parsed = identity(sourceRecord.record);
            if (hash(parsed.rawDevice) !== directoryName || (match && hash(parsed.actionId) !== match[1]))
                unsafeSource();
            let action = actions.get(parsed.actionId);
            if (action && action.device !== parsed.device)
                unsafeSource();
            if (!action) {
                action = { actionId: parsed.actionId, device: parsed.device, records: [], intents: [], results: [] };
                actions.set(parsed.actionId, action);
            }
            devices.set(parsed.device, devices.get(parsed.device) ?? false);
            action.records.push(sourceRecord);
            if (temporary || publishedName === 'claim.json')
                devices.set(parsed.device, true);
            if (match?.[2] === 'intent' && parsed.record.status === 'in-flight')
                action.intents.push({ directory, value: parsed.record.intent });
            else if (match?.[2] === 'result')
                action.results.push({ directory, value: parsed.record });
            else
                devices.set(parsed.device, true);
        }
    }
}
function sourceRoots(declaration, defaults) {
    const roots = [sourceRoot('journal', defaults.journal, false), sourceRoot('leases', defaults.leases, false)];
    for (const path of declaration.additionalJournalRoots)
        roots.push(sourceRoot('journal', path, true));
    for (const path of declaration.additionalLeaseRoots)
        roots.push(sourceRoot('leases', path, true));
    const sources = [];
    for (const source of roots) {
        const existing = sources.find(other => other.root === source.root && other.kind === source.kind);
        if (existing)
            existing.requestedRoots = [...new Set([...existing.requestedRoots, ...source.requestedRoots])];
        else
            sources.push(source);
    }
    return sources;
}
function collect(declaration, defaults) {
    const sources = sourceRoots(declaration, defaults);
    const actions = new Map();
    const devices = new Map();
    let ignoredNonIosLeases = 0;
    for (const source of sources) {
        if (!source.present)
            continue;
        if (source.kind === 'journal')
            readJournal(source, actions, devices);
        else
            ignoredNonIosLeases += readLeases(source, devices);
    }
    for (const action of actions.values()) {
        if (!action.intents.length || !action.results.length || action.results.some(result => completedOutcome(result.value) === 'inconclusive')
            || action.intents.some(intent => !isDeepStrictEqual(intent.value, action.intents[0].value)
                || !action.results.some(result => result.directory === intent.directory))
            || action.results.some(result => !action.intents.some(intent => intent.directory === result.directory)
                || !isDeepStrictEqual(result.value.intent, action.intents[0]?.value) || !isDeepStrictEqual(result.value.result, action.results[0].value.result)))
            devices.set(action.device, true);
    }
    const imported = [...actions.values()].map(action => ({ actionId: action.actionId, device: action.device, readOnly: true,
        outcome: devices.get(action.device) ? 'inconclusive' : completedOutcome(action.results[0].value), records: action.records }));
    const exclusions = new Set([...protectedDevices, ...declaration.excludedDevices.map(canonicalDevice)]);
    for (const excluded of exclusions)
        devices.set(excluded, true);
    return { declaration, sources, devices: [...devices].map(([device, uncertain]) => ({ device, uncertain,
            reason: exclusions.has(device) ? 'protected-device' : uncertain ? 'historical-uncertainty' : null })), actions: imported, ignoredNonIosLeases };
}
function separate(source, destination) {
    if (source === destination || source.startsWith(destination + sep) || destination.startsWith(source + sep))
        unsafeSource();
}
function sourceRequests(declaration, defaults) {
    return [
        ...[defaults.journal, ...declaration.additionalJournalRoots].map(path => ({ kind: 'journal', path })),
        ...[defaults.leases, ...declaration.additionalLeaseRoots].map(path => ({ kind: 'leases', path })),
    ];
}
function verifyPriorSeparation(root, mode, declaration, requests) {
    // Read only the known admission destination, never a historical source. A
    // validated prior manifest can justify closing this authority, not importing
    // via a cached path or proving that inaccessible source topology is unchanged.
    const previous = new AdmissionSqlite({ root, mode }).activation();
    if (!isDeepStrictEqual(previous.declaration, declaration))
        unsafeSource();
    const expected = [...new Set(requests.map(source => JSON.stringify([source.kind, resolve(source.path)])))].sort();
    const recorded = [...new Set(previous.sources.flatMap(source => source.requestedRoots.map(path => JSON.stringify([source.kind, path]))))].sort();
    if (!isDeepStrictEqual(expected, recorded))
        unsafeSource();
    for (const source of previous.sources) {
        if (resolve(source.root) !== source.root)
            unsafeSource();
        separate(source.root, root);
    }
}
function migrate(raw, root, mode, defaults, checkpoint) {
    const declaration = parseMigrationDeclaration(raw);
    try {
        if (!isAbsolute(root))
            throw new AdmissionError('STATE_UNAVAILABLE', 'Admission root must be absolute');
        const destination = canonicalLocation(root);
        const requests = sourceRequests(declaration, defaults);
        let resolutionFailed = false;
        for (const { path } of requests) {
            if (!isAbsolute(path))
                throw new AdmissionError('INVALID_REQUEST', 'Historical roots must be absolute');
            separate(resolve(path), destination);
            let location;
            try {
                location = canonicalLocation(resolve(path));
            }
            catch {
                resolutionFailed = true;
                continue;
            }
            // Successful overlap detection always refuses without writing a guard,
            // even when another source has already failed resolution.
            separate(location, destination);
        }
        if (resolutionFailed) {
            verifyPriorSeparation(root, mode, declaration, requests);
            return AdmissionSqlite.migrate({ root, mode }, () => unsafeSource(), checkpoint);
        }
        return AdmissionSqlite.migrate({ root, mode }, () => collect(declaration, defaults), checkpoint);
    }
    catch (error) {
        if (error instanceof AdmissionError)
            throw error;
        throw new AdmissionError('STATE_UNAVAILABLE', 'Offline migration could not safely read or initialize storage');
    }
}
export function migrateAdmission(raw) {
    return migrate(raw, admissionRoot(), 'production', {
        journal: join(homedir(), 'Library/Application Support/jev-ios-bridge/observed-actions'),
        leases: join(tmpdir(), 'jev-ios-bridge-device-locks'),
    });
}
/** Isolated stores remain test-mode stores; this cannot activate a real backend. */
export function migrateAdmissionForTesting(raw, options) {
    if (options.backend !== 'fake')
        throw new AdmissionError('INVALID_REQUEST', 'Migration tests require a fake backend');
    return migrate(raw, options.root, 'test', options.defaultRoots, options.checkpoint);
}
