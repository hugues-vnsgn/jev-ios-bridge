import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readdirSync, readlinkSync, realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { z } from 'zod/v4';
import { admissionRoot, canonicalDevice } from './admission.js';
import { isDeepStrictEqual } from 'node:util';
import { AdmissionError, AdmissionSqlite, parseMigrationDeclaration, type MigrationDeclaration } from './admission-sqlite.js';

/** These booleans are operational assertions, never proof that an old writer is fenced. */
export { parseMigrationDeclaration, type MigrationDeclaration } from './admission-sqlite.js';
export type MigrationSource = { kind: 'journal' | 'leases'; root: string; present: boolean; files: { path: string; sha256: string }[] };
export type ImportedObservedAction = {
  actionId: string; allocationId: string; device: string; readOnly: true;
  outcome: 'outcome_observed' | 'already_satisfied' | 'refused' | 'inconclusive';
  records: { path: string; sha256: string; record: unknown }[];
};
export type MigrationReceipt = {
  version: 1; installationId: string; declaration: MigrationDeclaration; sources: MigrationSource[];
  importedActions: number; retainedDevices: number; ignoredNonIosLeases: number;
};
export type MigrationImport = {
  declaration: MigrationDeclaration; sources: MigrationSource[];
  devices: { device: string; uncertain: boolean; reason: string | null }[];
  actions: Omit<ImportedObservedAction, 'allocationId'>[]; ignoredNonIosLeases: number;
};
type DefaultRoots = { journal: string; leases: string };
const protectedDevices = ['73997430-DB8A-48C8-8146-12320CE6AEFE', '2FE383F2-2D0F-4286-8797-D3ACEFCD6220',
  '6A8C5F93-F59A-456B-B157-10642209B734', '0E42FDE2-5E09-42D3-9876-9EF0037FCBE7'];
export type MigrationTestOptions = {
  root: string; backend: 'fake'; defaultRoots: DefaultRoots;
  checkpoint?: (point: 'guarded' | 'markerWritten' | 'beforeCommit' | 'afterCommit') => void;
};

function sourceRoot(kind: MigrationSource['kind'], path: string, required: boolean): MigrationSource {
  if (!isAbsolute(path)) throw new AdmissionError('INVALID_REQUEST', 'Historical roots must be absolute');
  const absolute = resolve(path);
  try {
    const stat = lstatSync(absolute);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new AdmissionError('STATE_UNAVAILABLE', 'Unsafe historical root');
    const root = realpathSync(absolute);
    return { kind, root, present: true, files: [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || required) throw error;
    return { kind, root: canonicalLocation(absolute), present: false, files: [] };
  }
}
function canonicalLocation(path: string, links = 0): string {
  if (links > 40) throw new AdmissionError('STATE_UNAVAILABLE', 'Historical path separation cannot be established');
  let stat: ReturnType<typeof lstatSync>;
  try { stat = lstatSync(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return join(canonicalLocation(dirname(path), links), basename(path));
  }
  // Resolving a dangling link's intended location does not validate it as a
  // source. The guarded scanner still rejects the link itself.
  if (stat.isSymbolicLink()) return canonicalLocation(resolve(dirname(path), readlinkSync(path)), links + 1);
  return realpathSync(path);
}
type RecordObject = Record<string, unknown>;
type HistoricalRecord = ImportedObservedAction['records'][number];
type HistoricalAction = {
  actionId: string; device: string; records: HistoricalRecord[];
  intents: { directory: string; value: unknown }[]; results: { directory: string; value: RecordObject }[];
};
const hash = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
function object(value: unknown): value is RecordObject { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function unsafeSource(): never { throw new AdmissionError('STATE_UNAVAILABLE', 'Historical state is corrupt, conflicting or unattributable; activation refused'); }
function readRecord(path: string, source: MigrationSource, allowMalformed = false): HistoricalRecord {
  // A recognized filename can still name a FIFO or be replaced after lstat.
  // Open without waiting for a writer, then validate the actual descriptor.
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 16 * 1024 * 1024) unsafeSource();
    const bytes = readFileSync(fd);
    const sha256 = hash(bytes);
    source.files.push({ path, sha256 });
    let record: unknown = null;
    try { record = JSON.parse(bytes.toString('utf8')); } catch { if (!allowMalformed) unsafeSource(); }
    return { path, sha256, record };
  } finally { closeSync(fd); }
}
function readLeases(source: MigrationSource, devices: Map<string, boolean>): number {
  let nonIos = 0;
  for (const name of readdirSync(source.root).sort()) {
    const match = /^(.*)\.lock(?:\.[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.tmp)?$/i.exec(name);
    if (!match?.[1]) unsafeSource();
    const rawIdentity = match[1];
    const { record } = readRecord(join(source.root, name), source, true);
    let device: string | undefined;
    try { device = canonicalDevice(rawIdentity); } catch { /* A well-formed non-UUID lease belongs outside iOS admission. */ }
    const valid = object(record) && Number.isSafeInteger(record.pid) && (record.pid as number) > 0
      && typeof record.token === 'string' && record.token.length > 0 && typeof record.deviceId === 'string'
      && typeof record.createdAt === 'string' && Number.isFinite(Date.parse(record.createdAt))
      && (record.runId === undefined || typeof record.runId === 'string')
      && (record.ownedProcesses === undefined || (Array.isArray(record.ownedProcesses) && record.ownedProcesses.every(value => typeof value === 'string')));
    if (object(record) && typeof record.deviceId === 'string' && record.deviceId.toUpperCase() !== rawIdentity.toUpperCase()) unsafeSource();
    if (!device) {
      if (!valid) unsafeSource();
      nonIos++; continue;
    }
    // PID death never establishes release. A live old holder contradicts the
    // declared quiescence; malformed and dead holders retain this UUID instead.
    if (valid) {
      try { process.kill(record.pid as number, 0); throw new AdmissionError('STATE_UNAVAILABLE', 'A live historical iOS lease prevents offline activation'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
    }
    devices.set(device, true);
  }
  return nonIos;
}
function identity(record: unknown): { device: string; rawDevice: string; actionId: string; record: RecordObject } {
  if (!object(record) || typeof record.deviceId !== 'string' || typeof record.actionId !== 'string'
    || !record.actionId.length || record.actionId.length > 1024 || !Object.hasOwn(record, 'intent')) unsafeSource();
  return { device: canonicalDevice(record.deviceId), rawDevice: record.deviceId, actionId: record.actionId, record };
}
const resultSchema = z.object({
  status: z.enum(['outcome_observed', 'already_satisfied', 'refused', 'inconclusive']),
  actionAttempted: z.boolean(), actionAcknowledged: z.boolean(), observations: z.number().int().nonnegative(),
});
function completedOutcome(result: RecordObject): ImportedObservedAction['outcome'] {
  const parsed = resultSchema.safeParse(result.result);
  if (!parsed.success || result.status !== 'completed') return 'inconclusive';
  const value = parsed.data;
  if (value.actionAcknowledged && !value.actionAttempted) return 'inconclusive';
  if (value.status === 'outcome_observed' && (!value.actionAttempted || !value.actionAcknowledged)) return 'inconclusive';
  if ((value.status === 'already_satisfied' || value.status === 'refused') && (value.actionAttempted || value.actionAcknowledged)) return 'inconclusive';
  return value.status;
}
function readJournal(source: MigrationSource, actions: Map<string, HistoricalAction>, devices: Map<string, boolean>): void {
  for (const directoryName of readdirSync(source.root).sort()) {
    const directory = join(source.root, directoryName);
    const stat = lstatSync(directory);
    if (!/^[a-f\d]{64}$/.test(directoryName) || !stat.isDirectory() || stat.isSymbolicLink()) unsafeSource();
    const names = readdirSync(directory).sort();
    if (!names.length) unsafeSource();
    for (const name of names) {
      const publishedName = name.replace(/\.[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.tmp$/i, '');
      const temporary = publishedName !== name;
      const match = /^([a-f\d]{64})\.(intent|result)\.json$/.exec(publishedName);
      if (!match && !['claim.json', 'quarantine.json'].includes(publishedName)) unsafeSource();
      const sourceRecord = readRecord(join(directory, name), source);
      if (publishedName === 'quarantine.json') {
        const record = sourceRecord.record;
        if (!object(record) || typeof record.deviceId !== 'string' || hash(record.deviceId) !== directoryName) unsafeSource();
        devices.set(canonicalDevice(record.deviceId), true);
        continue;
      }
      const parsed = identity(sourceRecord.record);
      if (hash(parsed.rawDevice) !== directoryName || (match && hash(parsed.actionId) !== match[1])) unsafeSource();
      let action = actions.get(parsed.actionId);
      if (action && action.device !== parsed.device) unsafeSource();
      if (!action) {
        action = { actionId: parsed.actionId, device: parsed.device, records: [], intents: [], results: [] };
        actions.set(parsed.actionId, action);
      }
      devices.set(parsed.device, devices.get(parsed.device) ?? false);
      action.records.push(sourceRecord);
      if (temporary || publishedName === 'claim.json') devices.set(parsed.device, true);
      if (match?.[2] === 'intent' && parsed.record.status === 'in-flight') action.intents.push({ directory, value: parsed.record.intent });
      else if (match?.[2] === 'result') action.results.push({ directory, value: parsed.record });
      else devices.set(parsed.device, true);
    }
  }
}
function sourceRoots(declaration: MigrationDeclaration, defaults: DefaultRoots): MigrationSource[] {
  const roots = [sourceRoot('journal', defaults.journal, false), sourceRoot('leases', defaults.leases, false)];
  for (const path of declaration.additionalJournalRoots) roots.push(sourceRoot('journal', path, true));
  for (const path of declaration.additionalLeaseRoots) roots.push(sourceRoot('leases', path, true));
  return roots.filter((source, index) => roots.findIndex(other => other.root === source.root && other.kind === source.kind) === index);
}
function collect(declaration: MigrationDeclaration, defaults: DefaultRoots): MigrationImport {
  const sources = sourceRoots(declaration, defaults);
  const actions = new Map<string, HistoricalAction>();
  const devices = new Map<string, boolean>();
  let ignoredNonIosLeases = 0;
  for (const source of sources) {
    if (!source.present) continue;
    if (source.kind === 'journal') readJournal(source, actions, devices);
    else ignoredNonIosLeases += readLeases(source, devices);
  }
  for (const action of actions.values()) {
    if (!action.intents.length || !action.results.length || action.results.some(result => completedOutcome(result.value) === 'inconclusive')
      || action.intents.some(intent => !isDeepStrictEqual(intent.value, action.intents[0]!.value)
        || !action.results.some(result => result.directory === intent.directory))
      || action.results.some(result => !action.intents.some(intent => intent.directory === result.directory)
        || !isDeepStrictEqual(result.value.intent, action.intents[0]?.value) || !isDeepStrictEqual(result.value.result, action.results[0]!.value.result))) devices.set(action.device, true);
  }
  const imported: MigrationImport['actions'] = [...actions.values()].map(action => ({ actionId: action.actionId, device: action.device, readOnly: true,
    outcome: devices.get(action.device) ? 'inconclusive' : completedOutcome(action.results[0]!.value), records: action.records }));
  const exclusions = new Set([...protectedDevices, ...declaration.excludedDevices.map(canonicalDevice)]);
  for (const excluded of exclusions) devices.set(excluded, true);
  return { declaration, sources, devices: [...devices].map(([device, uncertain]) => ({ device, uncertain,
    reason: exclusions.has(device) ? 'protected-device' : uncertain ? 'historical-uncertainty' : null })), actions: imported, ignoredNonIosLeases };
}
function migrate(raw: unknown, root: string, mode: 'test' | 'production', defaults: DefaultRoots, checkpoint?: MigrationTestOptions['checkpoint']): MigrationReceipt {
  const declaration = parseMigrationDeclaration(raw);
  try {
    if (!isAbsolute(root)) throw new AdmissionError('STATE_UNAVAILABLE', 'Admission root must be absolute');
    const destination = canonicalLocation(root);
    // Only establish separation here. Source existence/type/readability belongs
    // inside the migration guard, so a failed rerun closes initialized admission.
    // Check both spelling and resolved location to avoid writing into a source.
    const paths = [defaults.journal, defaults.leases, ...declaration.additionalJournalRoots, ...declaration.additionalLeaseRoots];
    for (const path of paths) {
      if (!isAbsolute(path)) throw new AdmissionError('INVALID_REQUEST', 'Historical roots must be absolute');
      for (const location of [resolve(path), canonicalLocation(resolve(path))]) {
        if (location === destination || location.startsWith(destination + sep) || destination.startsWith(location + sep)) unsafeSource();
      }
    }
    return AdmissionSqlite.migrate({ root, mode }, () => collect(declaration, defaults), checkpoint);
  } catch (error) {
    if (error instanceof AdmissionError) throw error;
    throw new AdmissionError('STATE_UNAVAILABLE', 'Offline migration could not safely read or initialize storage');
  }
}
export function migrateAdmission(raw: unknown): MigrationReceipt {
  return migrate(raw, admissionRoot(), 'production', {
    journal: join(homedir(), 'Library/Application Support/jev-ios-bridge/observed-actions'),
    leases: join(tmpdir(), 'jev-ios-bridge-device-locks'),
  });
}
/** Isolated stores remain test-mode stores; this cannot activate a real backend. */
export function migrateAdmissionForTesting(raw: unknown, options: MigrationTestOptions): MigrationReceipt {
  if (options.backend !== 'fake') throw new AdmissionError('INVALID_REQUEST', 'Migration tests require a fake backend');
  return migrate(raw, options.root, 'test', options.defaultRoots, options.checkpoint);
}
