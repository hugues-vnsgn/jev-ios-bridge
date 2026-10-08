import { isDeepStrictEqual } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { closeSync, constants, fsyncSync, lstatSync, openSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import type { AdmissionDependencies, AdmissionRequest, AdmissionResult, AttemptIdentity, AttemptView, DeviceView, OwnerIdentity, OwnerProcess, TerminalCandidate } from './admission.js';

export class AdmissionError extends Error {
  constructor(readonly code: 'STATE_UNAVAILABLE' | 'INVALID_REQUEST' | 'STALE_OWNER' | 'DISPATCH_CLOSED' | 'OPERATIONS_UNSETTLED', message: string) {
    super(message);
    this.name = 'AdmissionError';
  }
}

export type StoreOptions = AdmissionDependencies & { root: string; mode: 'production' | 'test' };
type Row = Record<string, any>;
const schemaVersion = 1;
const schema = `
CREATE TABLE metadata (singleton INTEGER PRIMARY KEY CHECK(singleton=1), schema_version INTEGER NOT NULL, root TEXT NOT NULL, installation_id TEXT NOT NULL, mode TEXT NOT NULL, migration_manifest TEXT);
CREATE TABLE devices (device TEXT PRIMARY KEY, platform TEXT NOT NULL DEFAULT 'ios-simulator' CHECK(platform='ios-simulator'), state TEXT NOT NULL CHECK(state IN ('active','available','quarantined')), generation INTEGER NOT NULL, token TEXT, kind TEXT, attempt_id TEXT, reason TEXT);
CREATE TABLE attempts (kind TEXT NOT NULL, id TEXT NOT NULL, device TEXT NOT NULL REFERENCES devices(device), digest TEXT NOT NULL, intent TEXT NOT NULL, token TEXT NOT NULL, generation INTEGER NOT NULL, pid INTEGER NOT NULL, incarnation TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('active','terminal')), cancelled INTEGER NOT NULL DEFAULT 0, attached INTEGER NOT NULL DEFAULT 0, terminal TEXT, PRIMARY KEY(kind,id));
CREATE TABLE commands (id TEXT PRIMARY KEY, kind TEXT NOT NULL, attempt_id TEXT NOT NULL, token TEXT NOT NULL, generation INTEGER NOT NULL, operation TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('outstanding','settled','uncertain')), FOREIGN KEY(kind,attempt_id) REFERENCES attempts(kind,id));
CREATE TABLE transitions (sequence INTEGER PRIMARY KEY, kind TEXT NOT NULL, attempt_id TEXT NOT NULL, event TEXT NOT NULL, detail TEXT NOT NULL, time INTEGER NOT NULL);
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
  constructor(private readonly options: StoreOptions) {
    try { this.root = rootPath(options.root); this.read(() => undefined); } catch (error) { throw unavailable(error); }
  }
  /** Fixture activation is explicitly test-only; production activation belongs to offline migration. */
  static initializeTestStore(root: string): void {
    try {
      rootPath(root);
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
