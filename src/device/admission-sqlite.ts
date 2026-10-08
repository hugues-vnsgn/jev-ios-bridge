import { isDeepStrictEqual } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { closeSync, constants, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod/v4';
import type { AdmissionDependencies, AdmissionRequest, AdmissionResult, AttemptIdentity, AttemptView, DeviceView, OwnerIdentity, OwnerProcess, TerminalCandidate } from './admission.js';
import type { ImportedObservedAction, MigrationImport, MigrationReceipt, MigrationTestOptions } from './admission-migration.js';

export class AdmissionError extends Error {
  constructor(readonly code: 'STATE_UNAVAILABLE' | 'INVALID_REQUEST' | 'STALE_OWNER' | 'DISPATCH_CLOSED' | 'OPERATIONS_UNSETTLED', message: string) {
    super(message);
    this.name = 'AdmissionError';
  }
}

export type StoreOptions = AdmissionDependencies & { root: string; mode: 'production' | 'test' };
const declarationSchema = z.strictObject({
  version: z.literal(1), writersStopped: z.literal(true), historicalRootsDeclaredOrExcluded: z.literal(true),
  additionalJournalRoots: z.array(z.string().min(1)).max(100), additionalLeaseRoots: z.array(z.string().min(1)).max(100),
  excludedDevices: z.array(z.string().regex(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i)).max(10000),
});
export type MigrationDeclaration = z.infer<typeof declarationSchema>;
export function parseMigrationDeclaration(raw: unknown): MigrationDeclaration {
  const result = declarationSchema.safeParse(raw);
  if (!result.success) throw new AdmissionError('INVALID_REQUEST', 'A version 1 maintenance declaration with stopped writers and declared historical roots is required');
  return result.data;
}
const receiptSchema = z.strictObject({
  version: z.literal(1), installationId: z.string().uuid(), declaration: declarationSchema,
  sources: z.array(z.strictObject({ kind: z.enum(['journal', 'leases']), root: z.string().refine(isAbsolute), present: z.boolean(),
    requestedRoots: z.array(z.string().refine(isAbsolute)).min(1),
    files: z.array(z.strictObject({ path: z.string().refine(isAbsolute), sha256: z.string().regex(/^[\da-f]{64}$/) })) })).min(2),
  importedActions: z.number().int().nonnegative(), retainedDevices: z.number().int().nonnegative(), ignoredNonIosLeases: z.number().int().nonnegative(),
});
function migrationReceipt(meta: Row, mode: StoreOptions['mode']): MigrationReceipt | undefined {
  const raw: unknown = JSON.parse(meta.migration_manifest);
  if (mode === 'test' && isDeepStrictEqual(raw, { testFixture: true })) return undefined;
  const receipt = receiptSchema.safeParse(raw);
  if (!receipt.success || receipt.data.installationId !== meta.installation_id) throw new AdmissionError('STATE_UNAVAILABLE', 'A valid completed offline migration is required');
  return receipt.data;
}
type Row = Record<string, any>;
const schemaVersion = 1;
const schema = `
CREATE TABLE metadata (singleton INTEGER PRIMARY KEY CHECK(singleton=1), schema_version INTEGER NOT NULL, root TEXT NOT NULL, installation_id TEXT NOT NULL, mode TEXT NOT NULL, migration_manifest TEXT);
CREATE TABLE devices (device TEXT PRIMARY KEY, platform TEXT NOT NULL DEFAULT 'ios-simulator' CHECK(platform='ios-simulator'), state TEXT NOT NULL CHECK(state IN ('active','available','quarantined')), generation INTEGER NOT NULL, token TEXT, kind TEXT, attempt_id TEXT, reason TEXT);
CREATE TABLE attempts (kind TEXT NOT NULL, id TEXT NOT NULL, device TEXT NOT NULL REFERENCES devices(device), digest TEXT NOT NULL, intent TEXT NOT NULL, token TEXT NOT NULL, generation INTEGER NOT NULL, pid INTEGER NOT NULL, incarnation TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('active','terminal')), cancelled INTEGER NOT NULL DEFAULT 0, attached INTEGER NOT NULL DEFAULT 0, terminal TEXT, PRIMARY KEY(kind,id));
CREATE TABLE commands (id TEXT PRIMARY KEY, kind TEXT NOT NULL, attempt_id TEXT NOT NULL, token TEXT NOT NULL, generation INTEGER NOT NULL, operation TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('outstanding','settled','uncertain')), FOREIGN KEY(kind,attempt_id) REFERENCES attempts(kind,id));
CREATE TABLE transitions (sequence INTEGER PRIMARY KEY, kind TEXT NOT NULL, attempt_id TEXT NOT NULL, event TEXT NOT NULL, detail TEXT NOT NULL, time INTEGER NOT NULL);
CREATE TABLE imported_actions (id TEXT PRIMARY KEY, allocation_id TEXT NOT NULL UNIQUE, device TEXT NOT NULL REFERENCES devices(device), record TEXT NOT NULL);
`;
function unavailable(error: unknown): AdmissionError {
  return error instanceof AdmissionError ? error : new AdmissionError('STATE_UNAVAILABLE', `Admission storage unavailable: ${error instanceof Error ? error.message : String(error)}`);
}
function secure(path: string, directory: boolean): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile()) || (stat.mode & 0o077) !== 0 || (stat.uid !== process.getuid?.())) throw new AdmissionError('STATE_UNAVAILABLE', 'Unsafe admission path');
}
function secureSidecars(databasePath: string): void {
  // SQLite may recover, truncate or delete a journal while opening/reading the
  // database. Refuse unsafe existing files before allowing that consumption.
  for (const suffix of ['-journal', '-wal', '-shm']) {
    try { secure(`${databasePath}${suffix}`, false); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}
function rootPath(root: string): string {
  if (!isAbsolute(root) || resolve(root) !== root || realpathSync(root) !== root) throw new AdmissionError('STATE_UNAVAILABLE', 'Admission root must be a canonical absolute path');
  secure(root, true); return root;
}
function syncPath(path: string): void {
  const fd = openSync(path, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
function absent(path: string): boolean {
  try { lstatSync(path); return false; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true; throw error; }
}
function configure(db: DatabaseSync): void {
  db.exec('PRAGMA busy_timeout=250; PRAGMA foreign_keys=ON; PRAGMA synchronous=EXTRA; PRAGMA fullfsync=ON;');
  if (db.prepare('PRAGMA journal_mode').get()?.journal_mode !== 'delete') {
    throw new AdmissionError('STATE_UNAVAILABLE', 'Admission requires DELETE journal mode');
  }
}
function key(identity: AttemptIdentity): [string, string] { return [identity.kind, identity.id]; }
function owner(row: Row): OwnerIdentity { return { device: row.device, attempt: { kind: row.kind, id: row.id }, token: row.token, generation: row.generation, process: { pid: row.pid, incarnation: row.incarnation } }; }
function view(row: Row): AttemptView { return { identity: { kind: row.kind, id: row.id }, device: row.device, digest: row.digest, intent: JSON.parse(row.intent), owner: owner(row), state: row.state, cancellationRequested: !!row.cancelled, terminal: row.terminal === null ? null : JSON.parse(row.terminal) }; }

/** Internal adapter. Migration/allocation add typed operations here; no SQL escape hatch. */
export class AdmissionSqlite {
  private readonly root: string;
  constructor(private readonly options: StoreOptions, private readonly migrationToken?: string) {
    try { this.root = rootPath(options.root); this.read(() => undefined); } catch (error) { throw unavailable(error); }
  }
  /** The scanner receives no database access; only this adapter installs authoritative state. */
  static migrate(options: StoreOptions, scan: () => MigrationImport, checkpoint?: MigrationTestOptions['checkpoint']): MigrationReceipt {
    let guarded = false;
    let existingStore = false;
    let completed = false;
    const guard = join(options.root, 'migration.lock');
    const token = randomUUID();
    try {
      if (!isAbsolute(options.root) || resolve(options.root) !== options.root) throw new AdmissionError('STATE_UNAVAILABLE', 'Migration requires a canonical absolute root');
      mkdirSync(options.root, { recursive: true, mode: 0o700 });
      rootPath(options.root);
      writeFileSync(guard, JSON.stringify({ token }), { flag: 'wx', mode: 0o600 });
      guarded = true; syncPath(guard); syncPath(options.root);
      const initialFiles = readdirSync(options.root).filter(name => name !== 'migration.lock');
      existingStore = initialFiles.length > 0;
      checkpoint?.('guarded');
      const plan = scan();
      if (initialFiles.length) {
        const previous = new AdmissionSqlite(options, token).activation();
        if (!isDeepStrictEqual(previous.declaration, plan.declaration) || !isDeepStrictEqual(previous.sources, plan.sources)) throw new AdmissionError('STATE_UNAVAILABLE', 'Initialized admission cannot be reimported from changed sources');
        completed = true;
        return previous;
      }
      const installationId = randomUUID();
      const marker = join(options.root, 'installation.json');
      writeFileSync(marker, JSON.stringify({ version: 1, root: options.root, installationId }), { flag: 'wx', mode: 0o600 });
      syncPath(marker); syncPath(options.root); checkpoint?.('markerWritten');
      const path = join(options.root, 'admission.sqlite');
      secureSidecars(path);
      const fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600); closeSync(fd);
      const receipt: MigrationReceipt = { version: 1, installationId, declaration: plan.declaration, sources: plan.sources,
        importedActions: plan.actions.length, retainedDevices: plan.devices.filter(device => device.uncertain).length, ignoredNonIosLeases: plan.ignoredNonIosLeases };
      const db = new DatabaseSync(path);
      try {
        configure(db); db.exec('BEGIN IMMEDIATE'); db.exec(schema);
        for (const device of plan.devices) db.prepare('INSERT INTO devices(device,state,generation,reason) VALUES (?,?,0,?)').run(device.device, device.uncertain ? 'quarantined' : 'available', device.reason);
        for (const action of plan.actions) {
          const record: ImportedObservedAction = { ...action, allocationId: randomUUID().toUpperCase() };
          db.prepare('INSERT INTO imported_actions VALUES (?,?,?,?)').run(record.actionId, record.allocationId, record.device, JSON.stringify(record));
        }
        db.prepare('INSERT INTO metadata VALUES (1,?,?,?,?,?)').run(schemaVersion, options.root, installationId, options.mode, JSON.stringify(receipt));
        checkpoint?.('beforeCommit'); db.exec('COMMIT'); checkpoint?.('afterCommit');
      } finally { db.close(); }
      syncPath(options.root);
      completed = true;
      return receipt;
    } catch (error) { throw unavailable(error); }
    finally {
      if (guarded && (!existingStore || completed)) {
        // A crashed importer leaves its guard behind. Never reclaim another guard.
        if (JSON.parse(readFileSync(guard, 'utf8')).token === token) { unlinkSync(guard); syncPath(options.root); }
      }
    }
  }
  /** Fixture activation is explicitly test-only; production activation belongs to offline migration. */
  static initializeTestStore(root: string): void {
    try {
      rootPath(root);
      if (!absent(join(root, 'migration.lock'))) throw new AdmissionError('STATE_UNAVAILABLE', 'Offline migration guard prevents fixture initialization');
      const marker = join(root, 'installation.json');
      try { lstatSync(marker); return; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      const installationId = randomUUID();
      const path = join(root, 'admission.sqlite');
      secureSidecars(path);
      const fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600); closeSync(fd);
      const db = new DatabaseSync(path);
      try {
        configure(db); db.exec('BEGIN IMMEDIATE'); db.exec(schema);
        db.prepare('INSERT INTO metadata VALUES (1,?,?,?,?,?)').run(schemaVersion, root, installationId, 'test', JSON.stringify({ testFixture: true })); db.exec('COMMIT');
      } finally { db.close(); }
      writeFileSync(marker, JSON.stringify({ version: 1, root, installationId }), { flag: 'wx', mode: 0o600 });
      const markerFd = openSync(marker, 'r'); try { fsyncSync(markerFd); } finally { closeSync(markerFd); }
      const rootFd = openSync(root, 'r'); try { fsyncSync(rootFd); } finally { closeSync(rootFd); }
    } catch (error) { throw unavailable(error); }
  }
  private open(): DatabaseSync {
    rootPath(this.root);
    const guard = join(this.root, 'migration.lock');
    if (!absent(guard)) {
      secure(guard, false);
      if (!this.migrationToken || JSON.parse(readFileSync(guard, 'utf8')).token !== this.migrationToken) throw new AdmissionError('STATE_UNAVAILABLE', 'Offline migration is in progress or requires operator review');
    }
    const markerPath = join(this.root, 'installation.json'); const path = join(this.root, 'admission.sqlite');
    secure(markerPath, false); secure(path, false);
    secureSidecars(path);
    const db = new DatabaseSync(path);
    try {
      configure(db);
      return db;
    } catch (error) { db.close(); throw error; }
  }
  private validate(db: DatabaseSync): void {
    const marker = JSON.parse(readFileSync(join(this.root, 'installation.json'), 'utf8'));
    const meta = db.prepare('SELECT * FROM metadata WHERE singleton=1').get() as Row | undefined;
    if (!meta || meta.schema_version !== schemaVersion || marker.version !== 1 ||
      marker.root !== this.root || meta.root !== this.root || meta.installation_id !== marker.installationId ||
      meta.mode !== this.options.mode || !meta.migration_manifest) {
      throw new AdmissionError('STATE_UNAVAILABLE', 'Admission identity/schema/migration mismatch');
    }
    migrationReceipt(meta, this.options.mode);
  }
  activation(): MigrationReceipt {
    return this.read(db => {
      const receipt = migrationReceipt(db.prepare('SELECT * FROM metadata WHERE singleton=1').get() as Row, this.options.mode);
      if (!receipt) throw new AdmissionError('STATE_UNAVAILABLE', 'A completed offline migration is required');
      return receipt;
    });
  }
  readImportedAction(actionId: string): ImportedObservedAction | undefined {
    return this.read(db => { const row = db.prepare('SELECT record FROM imported_actions WHERE id=?').get(actionId); return row ? JSON.parse(row.record as string) : undefined; });
  }
  readImportedAllocation(allocationId: string): ImportedObservedAction | undefined {
    return this.read(db => { const row = db.prepare('SELECT record FROM imported_actions WHERE allocation_id=?').get(allocationId); return row ? JSON.parse(row.record as string) : undefined; });
  }
  private read<T>(operation: (db: DatabaseSync) => T): T {
    let db: DatabaseSync | undefined;
    try { db = this.open(); db.exec('BEGIN'); this.validate(db); const result = operation(db); db.exec('COMMIT'); return result; }
    catch (error) { throw unavailable(error); }
    finally { db?.close(); }
  }
  private write<T>(name: string, operation: (db: DatabaseSync) => T): T {
    let db: DatabaseSync | undefined;
    try {
      db = this.open(); db.exec('BEGIN IMMEDIATE'); this.validate(db); const result = operation(db);
      this.options.fault?.('beforeCommit', name); db.exec('COMMIT'); this.options.fault?.('afterCommit', name); return result;
    } catch (error) { try { db?.exec('ROLLBACK'); } catch {} throw unavailable(error); }
    finally { db?.close(); }
  }
  private event(db: DatabaseSync, identity: AttemptIdentity, event: string, detail: unknown = null): void {
    db.prepare('INSERT INTO transitions(kind,attempt_id,event,detail,time) VALUES (?,?,?,?,?)').run(...key(identity), event, JSON.stringify(detail), this.options.now?.() ?? Date.now());
  }
  private owned(db: DatabaseSync, expected: OwnerIdentity): Row {
    const row = db.prepare('SELECT * FROM attempts WHERE kind=? AND id=?').get(...key(expected.attempt)) as Row | undefined;
    const device = db.prepare('SELECT * FROM devices WHERE device=?').get(expected.device) as Row | undefined;
    if (!row || !device || row.state !== 'active' || device.state !== 'active' || row.device !== expected.device || row.pid !== expected.process.pid || row.incarnation !== expected.process.incarnation || row.token !== expected.token || row.generation !== expected.generation || device.token !== expected.token || device.generation !== expected.generation) throw new AdmissionError('STALE_OWNER', 'Claim no longer owns admission');
    return row;
  }
  acquire(request: AdmissionRequest, process: OwnerProcess): Exclude<AdmissionResult, { kind: 'acquired' }> | { kind: 'acquired'; owner: OwnerIdentity } {
    const intent = JSON.stringify(request.intent);
    if (intent === undefined) throw new AdmissionError('INVALID_REQUEST', 'Intent must be JSON');
    return this.write('acquire', db => {
      if (request.attempt.kind !== 'legacy' && db.prepare('SELECT id FROM imported_actions WHERE id=?').get(request.attempt.id)) return { kind: 'refused', reason: 'ACTION_ID_CONFLICT' };
      const existing = db.prepare('SELECT * FROM attempts WHERE kind=? AND id=?').get(...key(request.attempt)) as Row | undefined;
      if (existing) return existing.digest === request.digest && existing.device === request.device && isDeepStrictEqual(JSON.parse(existing.intent), JSON.parse(intent)) ? { kind: 'retrieved', attempt: view(existing) } : { kind: 'refused', reason: 'ACTION_ID_CONFLICT' };
      const device = db.prepare('SELECT * FROM devices WHERE device=?').get(request.device) as Row | undefined;
      if (device && device.state !== 'available') return { kind: 'refused', reason: device.state === 'quarantined' ? 'DEVICE_QUARANTINED' : 'DEVICE_BUSY' };
      const generation = (device?.generation ?? 0) + 1; const token = randomUUID();
      db.prepare("INSERT INTO devices(device,state,generation,token,kind,attempt_id) VALUES (?,'active',?,?,?,?) ON CONFLICT(device) DO UPDATE SET state='active',generation=excluded.generation,token=excluded.token,kind=excluded.kind,attempt_id=excluded.attempt_id,reason=NULL").run(request.device, generation, token, ...key(request.attempt));
      db.prepare("INSERT INTO attempts(kind,id,device,digest,intent,token,generation,pid,incarnation,state) VALUES (?,?,?,?,?,?,?,?,?,'active')").run(...key(request.attempt), request.device, request.digest, intent, token, generation, process.pid, process.incarnation);
      this.event(db, request.attempt, 'acquired');
      return { kind: 'acquired', owner: { device: request.device, attempt: request.attempt, token, generation, process } };
    });
  }
  inspect(device: string): DeviceView | undefined {
    return this.read(db => {
      const row = db.prepare('SELECT * FROM devices WHERE device=?').get(device) as Row | undefined;
      if (!row) return undefined;
      const attempt = row.token ? db.prepare('SELECT * FROM attempts WHERE kind=? AND id=?').get(row.kind, row.attempt_id) as Row | undefined : undefined;
      return { device, state: row.state, generation: row.generation, owner: attempt ? owner(attempt) : null, reason: row.reason };
    });
  }
  readAttempt(identity: AttemptIdentity): AttemptView | undefined { return this.read(db => { const row = db.prepare('SELECT * FROM attempts WHERE kind=? AND id=?').get(...key(identity)) as Row | undefined; return row ? view(row) : undefined; }); }
  attach(expected: OwnerIdentity, backend: 'real' | 'fake'): void {
    if (backend === 'real' && this.options.mode === 'test') throw new AdmissionError('STATE_UNAVAILABLE', 'Real backend cannot attach a test store');
    this.write('attach', db => { const row = this.owned(db, expected); if (row.cancelled || row.attached) throw new AdmissionError('DISPATCH_CLOSED', 'Driver already attached or cancelled'); db.prepare('UPDATE attempts SET attached=1 WHERE kind=? AND id=?').run(...key(expected.attempt)); });
  }
  cancel(identity: AttemptIdentity, expected?: OwnerIdentity): AttemptView | undefined {
    return this.write('cancel', db => {
      if (expected) this.owned(db, expected);
      const row = db.prepare('SELECT * FROM attempts WHERE kind=? AND id=?').get(...key(identity)) as Row | undefined;
      if (!row) return undefined;
      if (row.state === 'active' && !row.cancelled) { db.prepare('UPDATE attempts SET cancelled=1 WHERE kind=? AND id=?').run(...key(identity)); this.event(db, identity, 'cancelled'); row.cancelled = 1; }
      return view(row);
    });
  }
  authorize(expected: OwnerIdentity, operation: string): string {
    return this.write('authorize', db => {
      const row = this.owned(db, expected);
      if (!row.attached || row.cancelled || db.prepare("SELECT id FROM commands WHERE kind=? AND attempt_id=? AND state='uncertain'").get(...key(expected.attempt))) throw new AdmissionError('DISPATCH_CLOSED', 'Dispatch is cancelled or unattached');
      if (expected.attempt.kind === 'observed' && operation === 'tap' && db.prepare("SELECT id FROM commands WHERE kind=? AND attempt_id=? AND operation='tap'").get(...key(expected.attempt))) throw new AdmissionError('DISPATCH_CLOSED', 'Tap already authorized');
      const id = randomUUID(); db.prepare("INSERT INTO commands VALUES (?,?,?,?,?,?,'outstanding')").run(id, ...key(expected.attempt), expected.token, expected.generation, operation); this.event(db, expected.attempt, 'authorized', { id, operation }); return id;
    });
  }
  settle(expected: OwnerIdentity, command: string, success: boolean): void {
    this.write('settle', db => {
      db.prepare("UPDATE commands SET state=? WHERE id=? AND token=? AND generation=? AND state='outstanding'").run(success ? 'settled' : 'uncertain', command, expected.token, expected.generation);
      this.event(db, expected.attempt, 'settled', { command, success });
    });
  }
  finalize(expected: OwnerIdentity, candidate: TerminalCandidate, cancellationRequested = false): AttemptView {
    return this.write('finalize', db => {
      const existing = db.prepare('SELECT * FROM attempts WHERE kind=? AND id=?').get(...key(expected.attempt)) as Row | undefined;
      if (existing?.state === 'terminal' && existing.token === expected.token && existing.generation === expected.generation && existing.terminal === JSON.stringify(candidate)) return view(existing);
      const row = this.owned(db, expected);
      if (cancellationRequested && !row.cancelled) {
        db.prepare('UPDATE attempts SET cancelled=1 WHERE kind=? AND id=?').run(...key(expected.attempt));
        this.event(db, expected.attempt, 'cancelled');
        row.cancelled = 1;
      }
      const unfinished = db.prepare("SELECT id FROM commands WHERE kind=? AND attempt_id=? AND state!='settled'").get(...key(expected.attempt));
      const dispatched = db.prepare('SELECT id FROM commands WHERE kind=? AND attempt_id=?').get(...key(expected.attempt));
      if (candidate.disposition === 'available' && (unfinished || candidate.outcome === 'inconclusive' || (row.cancelled && (dispatched || candidate.outcome !== 'refused')))) throw new AdmissionError('OPERATIONS_UNSETTLED', 'Cannot make uncertain or cancelled work available');
      if (candidate.disposition === 'quarantined' && candidate.outcome !== 'inconclusive') throw new AdmissionError('INVALID_REQUEST', 'Quarantine requires inconclusive outcome');
      return this.terminal(db, row, candidate);
    });
  }
  private terminal(db: DatabaseSync, row: Row, candidate: TerminalCandidate): AttemptView {
    const terminal = JSON.stringify(candidate);
    db.prepare("UPDATE attempts SET state='terminal',terminal=? WHERE kind=? AND id=?").run(terminal, row.kind, row.id);
    db.prepare('UPDATE devices SET state=?,token=NULL,reason=? WHERE device=?').run(candidate.disposition, candidate.disposition === 'quarantined' ? 'uncertain' : null, row.device);
    this.event(db, { kind: row.kind, id: row.id }, 'terminal', candidate);
    return view({ ...row, state: 'terminal', terminal });
  }
  quarantineAbandoned(expected: OwnerIdentity, reason: string): boolean {
    return this.write('recover', db => { const row = this.owned(db, expected); this.terminal(db, row, { outcome: 'inconclusive', disposition: 'quarantined', payload: { reason }, evidenceRefs: [] }); return true; });
  }
}
