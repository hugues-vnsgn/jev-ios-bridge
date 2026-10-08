import { isDeepStrictEqual } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { reservationSchema, type AllocationRecord, type AllocationReservationInput, type AllocationOwner, type AllocationRefusal, type AllocationReason, actionBindingSchema, type ActionBinding, type ActionRecordView, type ActionEvidence } from './admission-allocation.js';
import { closeSync, constants, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod/v4';
import type { StagedArtifact } from '../observed/artifact.js';
import type { CreationResult } from '../observed/create-source.js';
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
const protectedDevices = new Set(['73997430-DB8A-48C8-8146-12320CE6AEFE','2FE383F2-2D0F-4286-8797-D3ACEFCD6220','6A8C5F93-F59A-456B-B157-10642209B734','0E42FDE2-5E09-42D3-9876-9EF0037FCBE7']);
const schemaVersion = 2;
const schema = `
CREATE TABLE metadata (singleton INTEGER PRIMARY KEY CHECK(singleton=1), schema_version INTEGER NOT NULL, root TEXT NOT NULL, installation_id TEXT NOT NULL, mode TEXT NOT NULL, migration_manifest TEXT);
CREATE TABLE devices (device TEXT PRIMARY KEY, platform TEXT NOT NULL DEFAULT 'ios-simulator' CHECK(platform='ios-simulator'), state TEXT NOT NULL CHECK(state IN ('active','available','quarantined')), generation INTEGER NOT NULL, token TEXT, kind TEXT, attempt_id TEXT, reason TEXT);
CREATE TABLE attempts (kind TEXT NOT NULL, id TEXT NOT NULL, device TEXT NOT NULL REFERENCES devices(device), digest TEXT NOT NULL, intent TEXT NOT NULL, token TEXT NOT NULL, generation INTEGER NOT NULL, pid INTEGER NOT NULL, incarnation TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('active','parked','terminal')), cancelled INTEGER NOT NULL DEFAULT 0, attached INTEGER NOT NULL DEFAULT 0, terminal TEXT, PRIMARY KEY(kind,id));
CREATE TABLE commands (id TEXT PRIMARY KEY, kind TEXT NOT NULL, attempt_id TEXT NOT NULL, token TEXT NOT NULL, generation INTEGER NOT NULL, operation TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('outstanding','settled','uncertain')), FOREIGN KEY(kind,attempt_id) REFERENCES attempts(kind,id));
CREATE TABLE transitions (sequence INTEGER PRIMARY KEY, kind TEXT NOT NULL, attempt_id TEXT NOT NULL, event TEXT NOT NULL, detail TEXT NOT NULL, time INTEGER NOT NULL);
CREATE TABLE allocations (id TEXT PRIMARY KEY, action_id TEXT NOT NULL UNIQUE, device TEXT UNIQUE, inventory_id TEXT UNIQUE, record TEXT NOT NULL, checksum TEXT NOT NULL);
CREATE TABLE unknown_creation (singleton INTEGER PRIMARY KEY CHECK(singleton=1), allocation_id TEXT NOT NULL REFERENCES allocations(id));
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
      const guard = this.creationGuard(db);
      if (guard) return guard;
      if (protectedDevices.has(request.device) || db.prepare('SELECT id FROM allocations WHERE device=?').get(request.device)) return { kind: 'refused', reason: 'DEVICE_QUARANTINED' };
      if (request.attempt.kind !== 'legacy' && db.prepare('SELECT id FROM allocations WHERE action_id=?').get(request.attempt.id)) return { kind: 'refused', reason: 'ACTION_ID_CONFLICT' };
      const device = db.prepare('SELECT * FROM devices WHERE device=?').get(request.device) as Row | undefined;
      if (device && device.state !== 'available') return { kind: 'refused', reason: device.state === 'quarantined' ? 'DEVICE_QUARANTINED' : 'DEVICE_BUSY' };
      const generation = (device?.generation ?? 0) + 1; const token = randomUUID();
      db.prepare("INSERT INTO devices(device,state,generation,token,kind,attempt_id) VALUES (?,'active',?,?,?,?) ON CONFLICT(device) DO UPDATE SET state='active',generation=excluded.generation,token=excluded.token,kind=excluded.kind,attempt_id=excluded.attempt_id,reason=NULL").run(request.device, generation, token, ...key(request.attempt));
      db.prepare("INSERT INTO attempts(kind,id,device,digest,intent,token,generation,pid,incarnation,state) VALUES (?,?,?,?,?,?,?,?,?,'active')").run(...key(request.attempt), request.device, request.digest, intent, token, generation, process.pid, process.incarnation);
      this.event(db, request.attempt, 'acquired');
      return { kind: 'acquired', owner: { device: request.device, attempt: request.attempt, token, generation, process } };
    });
  }
  private allocation(db: DatabaseSync, id: string): AllocationRecord | undefined {
    const row = db.prepare('SELECT record,checksum FROM allocations WHERE id=?').get(id);
    if (!row) return undefined;
    if (createHash('sha256').update(row.record as string).digest('hex') !== row.checksum) throw new AdmissionError('STATE_UNAVAILABLE', 'Allocation record checksum mismatch');
    const record = JSON.parse(row.record as string) as AllocationRecord;
    record.hostCreationBlocked = !!db.prepare('SELECT allocation_id FROM unknown_creation WHERE singleton=1').get();
    return record;
  }
  private saveAllocation(db: DatabaseSync, record: AllocationRecord): void {
    const data = JSON.stringify(record);
    db.prepare('UPDATE allocations SET device=?,record=?,checksum=? WHERE id=?').run(record.device, data, createHash('sha256').update(data).digest('hex'), record.allocationId);
  }
  private creationGuard(db: DatabaseSync): { kind: 'refused'; reason: 'HOST_CREATION_UNRESOLVED'; blockingAllocationId: string } | undefined {
    const row = db.prepare('SELECT allocation_id FROM unknown_creation WHERE singleton=1').get();
    return row ? { kind: 'refused', reason: 'HOST_CREATION_UNRESOLVED', blockingAllocationId: row.allocation_id as string } : undefined;
  }
  private ownedAllocation(db: DatabaseSync, expected: AllocationOwner): AllocationRecord {
    const record = this.allocation(db, expected.allocationId);
    if (!record || !isDeepStrictEqual(record.owner, expected) || !['preparing','executing'].includes(record.state)) throw new AdmissionError('STALE_OWNER', 'Allocation ownership changed');
    return record;
  }
  private preparing(db: DatabaseSync, expected: AllocationOwner): AllocationRecord {
    const record = this.ownedAllocation(db, expected);
    if (record.state !== 'preparing' || record.cancellationRequested || (this.options.now?.() ?? Date.now()) >= record.createdAt + record.budgets.timeoutMs) throw new AdmissionError('DISPATCH_CLOSED', 'Preparation dispatch is closed');
    return record;
  }
  stageAllocation(expected: AllocationOwner, artifact: StagedArtifact): AllocationRecord {
    return this.write('stageAllocation', db => {
      const record = this.preparing(db, expected);
      if (record.phase !== 'reserved' || record.staged) throw new AdmissionError('DISPATCH_CLOSED', 'Artifact binding is write-once');
      if (!isAbsolute(artifact.stagedPath) || artifact.stagedPath.length > 4096 || artifact.contentDigest !== record.inspectedContentDigest
        || artifact.bytes !== record.artifactBytes || artifact.maxBytes !== record.budgets.maxArtifactBytes || artifact.metadata.bundleId !== record.appBundleId) throw new AdmissionError('INVALID_REQUEST', 'Staged artifact does not match inspected content');
      record.staged = structuredClone(artifact); this.saveAllocation(db, record); return record;
    });
  }
  startCreation(expected: AllocationOwner): void {
    this.write('startCreation', db => {
      const record = this.preparing(db, expected);
      if (record.source.kind !== 'create' || record.phase !== 'reserved' || !record.staged || record.device) throw new AdmissionError('DISPATCH_CLOSED', 'Creation is not authorized');
      if (this.creationGuard(db)) throw new AdmissionError('DISPATCH_CLOSED', 'Unknown creation blocks new work');
      record.phase = 'creating'; record.hostCreationBlocked = true;
      db.prepare('INSERT INTO unknown_creation VALUES (1,?)').run(record.allocationId);
      this.saveAllocation(db, record); this.event(db, { kind: 'preparation', id: record.allocationId }, 'creation-authorized');
    });
  }
  recordCreation(expected: AllocationOwner, receipt: CreationResult): CreationResult {
    return this.write('recordCreation', db => {
      const record = this.allocation(db, expected.allocationId);
      const unknown: CreationResult = { status: 'unknown', reason: 'CREATE_UNCONFIRMED' };
      if (!record || !isDeepStrictEqual(record.owner, expected) || record.state !== 'preparing' || record.phase !== 'creating' || record.cancellationRequested) return unknown;
      const valid = receipt.status === 'created' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(receipt.udid)
        && receipt.provenance.kind === 'simctl-create' && receipt.provenance.allocationId === record.allocationId
        && receipt.provenance.name === record.intendedName && receipt.provenance.deviceTypeId === record.source.deviceTypeId && receipt.provenance.runtimeId === record.source.runtimeId;
      const device = valid && receipt.status === 'created' ? receipt.udid.toUpperCase() : null;
      if (!device || protectedDevices.has(device) || db.prepare('SELECT id FROM allocations WHERE device=?').get(device) || db.prepare('SELECT device FROM devices WHERE device=?').get(device)) {
        record.state = 'quarantined'; record.phase = 'terminal'; record.reason = 'CREATE_UNCONFIRMED'; record.outcome = 'uncertain';
        record.creationReceipt = unknown; this.saveAllocation(db, record); return unknown;
      }
      record.device = device; record.creationReceipt = { ...receipt, udid: device } as CreationResult; record.phase = 'admitting'; record.hostCreationBlocked = false;
      this.saveAllocation(db, record);
      const deleted = db.prepare('DELETE FROM unknown_creation WHERE allocation_id=?').run(record.allocationId);
      if (deleted.changes !== 1) throw new AdmissionError('STATE_UNAVAILABLE', 'Creation guard is missing');
      this.event(db, { kind: 'preparation', id: record.allocationId }, 'creation-receipt', { device });
      return record.creationReceipt;
    });
  }
  admitAllocation(expected: AllocationOwner): { kind: 'admitted'; owner: OwnerIdentity } | AllocationRefusal {
    return this.write('admitAllocation', db => {
      const record = this.preparing(db, expected); const guard = this.creationGuard(db); if (guard) return guard;
      if (!record.device || !record.staged || !['reserved','admitting'].includes(record.phase)) throw new AdmissionError('DISPATCH_CLOSED', 'Preparation cannot admit');
      if (db.prepare("SELECT id FROM attempts WHERE kind='preparation' AND id=?").get(record.allocationId)) throw new AdmissionError('DISPATCH_CLOSED', 'Preparation already admitted');
      if (db.prepare('SELECT device FROM devices WHERE device=?').get(record.device)) {
        record.state = 'retained'; record.phase = 'terminal'; record.outcome = 'refused'; record.reason = 'ADMISSION_REFUSED'; this.saveAllocation(db, record);
        return { kind: 'refused', reason: 'ADMISSION_REFUSED' };
      }
      const attempt: AttemptIdentity = { kind: 'preparation', id: record.allocationId };
      const identity: OwnerIdentity = { device: record.device, attempt, token: expected.token, generation: expected.generation, process: expected.process };
      db.prepare("INSERT INTO devices(device,state,generation,token,kind,attempt_id) VALUES (?,'active',?,?,?,?)").run(record.device, expected.generation, expected.token, ...key(attempt));
      db.prepare("INSERT INTO attempts(kind,id,device,digest,intent,token,generation,pid,incarnation,state) VALUES (?,?,?,?,?,?,?,?,?,'active')").run(...key(attempt), record.device, record.preparationDigest, JSON.stringify(record.preparation), expected.token, expected.generation, expected.process.pid, expected.process.incarnation);
      record.phase = 'admitting'; this.saveAllocation(db, record); this.event(db, attempt, 'acquired'); return { kind: 'admitted', owner: identity };
    });
  }
  failAllocation(expected: AllocationOwner, reason: AllocationReason, evidenceRefs: string[]): AllocationRecord {
    return this.write('failAllocation', db => {
      const record = this.ownedAllocation(db, expected);
      if (record.state !== 'preparing') throw new AdmissionError('DISPATCH_CLOSED', 'Preparation has ended');
      const attempt = db.prepare("SELECT * FROM attempts WHERE kind='preparation' AND id=?").get(record.allocationId) as Row | undefined;
      const unfinished = db.prepare("SELECT id FROM commands WHERE kind='preparation' AND attempt_id=? AND state!='settled'").get(record.allocationId);
      const dispatched = db.prepare("SELECT id FROM commands WHERE kind='preparation' AND attempt_id=?").get(record.allocationId);
      const uncertain = record.phase === 'creating' || !!unfinished || (record.cancellationRequested && !!dispatched)
        || ['PREPARATION_UNCONFIRMED','CREATE_UNCONFIRMED','READINESS_FAILED'].includes(reason);
      record.state = uncertain ? 'quarantined' : 'retained'; record.outcome = uncertain ? 'uncertain' : 'refused'; record.reason = reason;
      if (record.phase === 'reserved' && !dispatched && !attempt) record.capacityHeld = false;
      record.phase = 'terminal'; record.evidenceRefs = [...evidenceRefs]; this.saveAllocation(db, record);
      if (attempt) this.terminal(db, attempt, { outcome: uncertain ? 'inconclusive' : 'refused', disposition: uncertain ? 'quarantined' : 'available', payload: { reason }, evidenceRefs });
      return record;
    });
  }
  private attemptAllocation(db: DatabaseSync, identity: AttemptIdentity): AllocationRecord | undefined {
    if (identity.kind === 'legacy') return undefined;
    const row = db.prepare(identity.kind === 'preparation' ? 'SELECT id FROM allocations WHERE id=?' : 'SELECT id FROM allocations WHERE action_id=?').get(identity.id);
    return row ? this.allocation(db, row.id as string) : undefined;
  }
  changeAllocation(id: string, operation: 'cancel' | 'retire'): { kind: 'retrieved'; allocation: AllocationRecord } | AllocationRefusal {
    return this.write(`${operation}Allocation`, db => {
      const record = this.allocation(db, id); if (!record) return { kind: 'refused', reason: 'ALLOCATION_NOT_FOUND' };
      if (record.state === 'executing' || (operation === 'retire' && record.state === 'preparing')) return { kind: 'refused', reason: 'ALLOCATION_BUSY' };
      if (record.state === 'ready') {
        if (operation === 'cancel') record.cancellationRequested = true;
        this.retireReady(db, record, 'RETAINED_UNUSED');
      } else if (operation === 'cancel' && record.state === 'preparing' && !record.cancellationRequested) {
        record.cancellationRequested = true; this.saveAllocation(db, record);
        db.prepare("UPDATE attempts SET cancelled=1 WHERE kind='preparation' AND id=? AND state='active'").run(id);
        this.event(db, { kind: 'preparation', id }, 'cancelled');
      }
      return { kind: 'retrieved', allocation: record };
    });
  }
  quarantineAbandonedAllocation(expected: AllocationOwner): boolean {
    return this.write('recoverAllocation', db => {
      const record = this.ownedAllocation(db, expected);
      const identity: AttemptIdentity = { kind: record.state === 'executing' ? 'observed' : 'preparation', id: record.state === 'executing' ? record.actionId : record.allocationId };
      const row = db.prepare('SELECT * FROM attempts WHERE kind=? AND id=?').get(...key(identity)) as Row | undefined;
      record.state = 'quarantined'; record.phase = 'terminal'; record.reason = 'PREPARATION_UNCONFIRMED'; record.outcome = 'uncertain';
      this.saveAllocation(db, record);
      if (row) this.terminal(db, row, { outcome: 'inconclusive', disposition: 'quarantined', payload: { reason: 'OWNER_LOST' }, evidenceRefs: record.evidenceRefs });
      this.event(db, identity, 'abandoned'); return true;
    });
  }
  private deviceView(db: DatabaseSync, device: string): DeviceView | null {
    const row = db.prepare('SELECT * FROM devices WHERE device=?').get(device) as Row | undefined;
    if (!row) return null;
    const attempt = row.token ? db.prepare('SELECT * FROM attempts WHERE kind=? AND id=?').get(row.kind, row.attempt_id) as Row | undefined : undefined;
    return { device, state: row.state, generation: row.generation, owner: attempt ? owner(attempt) : null, reason: row.reason };
  }
  listActiveAllocations(): AllocationRecord[] {
    return this.read(db => db.prepare('SELECT id FROM allocations ORDER BY rowid').all()
      .map(row => this.allocation(db, row.id as string)!)
      .filter(record => record.state === 'preparing' || record.state === 'executing'));
  }
  readAction(actionId: string): ActionRecordView | undefined {
    return this.read(db => {
      const historical = db.prepare('SELECT record FROM imported_actions WHERE id=?').get(actionId);
      if (historical) { const action = JSON.parse(historical.record as string) as ImportedObservedAction; return { kind: 'imported', action, admission: this.deviceView(db, action.device) }; }
      const row = db.prepare('SELECT id FROM allocations WHERE action_id=?').get(actionId);
      if (!row) return undefined;
      const allocation = this.allocation(db, row.id as string)!;
      const attempt = db.prepare("SELECT * FROM attempts WHERE kind='observed' AND id=?").get(actionId) as Row | undefined;
      return { kind: 'allocation', allocation, attempt: attempt ? view(attempt) : null, admission: allocation.device ? this.deviceView(db, allocation.device) : null };
    });
  }
  parkAllocation(expected: OwnerIdentity, readinessEvidence: string[], evidenceRefs: string[]): AllocationRecord {
    return this.write('parkAllocation', db => {
      const row = this.owned(db, expected); const record = this.attemptAllocation(db, expected.attempt);
      if (!record || expected.attempt.kind !== 'preparation' || record.state !== 'preparing' || row.cancelled || record.cancellationRequested || !row.attached
        || (this.options.now?.() ?? Date.now()) >= record.createdAt + record.budgets.timeoutMs) throw new AdmissionError('DISPATCH_CLOSED', 'Preparation cannot park');
      this.evidencePaths(readinessEvidence); this.evidencePaths(evidenceRefs, true);
      if (db.prepare("SELECT id FROM commands WHERE kind=? AND attempt_id=? AND state!='settled'").get(...key(expected.attempt))) throw new AdmissionError('OPERATIONS_UNSETTLED', 'Preparation operations are unsettled');
      for (const operation of ['boot','install','launch','readiness']) {
        if (!db.prepare("SELECT id FROM commands WHERE kind=? AND attempt_id=? AND operation=? AND state='settled'").get(...key(expected.attempt), operation)) throw new AdmissionError('OPERATIONS_UNSETTLED', 'Preparation readiness is incomplete');
      }
      const now = this.options.now?.() ?? Date.now();
      record.state = 'ready'; record.phase = 'parked'; record.outcome = 'prepared'; record.readyAt = now; record.expiresAt = now + record.budgets.readyTtlMs;
      record.readinessEvidence = [...readinessEvidence]; record.evidenceRefs = [...new Set([...evidenceRefs, ...readinessEvidence])];
      record.owner = { ...record.owner, token: randomUUID(), generation: expected.generation + 1, process: { pid: 0, incarnation: 'parked' } };
      db.prepare("UPDATE attempts SET state='parked',attached=0 WHERE kind=? AND id=?").run(...key(expected.attempt));
      db.prepare('UPDATE devices SET token=NULL,generation=?,kind=NULL,attempt_id=NULL WHERE device=?').run(record.owner.generation, expected.device);
      this.saveAllocation(db, record); this.event(db, expected.attempt, 'parked'); return record;
    });
  }
  consumeAllocation(binding: ActionBinding, process: OwnerProcess): { kind: 'consumed'; owner: OwnerIdentity; allocation: AllocationRecord } | { kind: 'retrieved'; allocation: AllocationRecord } | AllocationRefusal {
    const parsed = actionBindingSchema.safeParse(binding);
    if (!parsed.success) throw new AdmissionError('INVALID_REQUEST', 'Invalid internal action binding');
    binding = parsed.data;
    return this.write('consumeAllocation', db => {
      const byAction = db.prepare('SELECT id FROM allocations WHERE action_id=?').get(binding.actionId);
      if (byAction && byAction.id !== binding.allocationId) return { kind: 'refused', reason: 'ACTION_ID_CONFLICT' };
      if (db.prepare('SELECT id FROM imported_actions WHERE id=? OR allocation_id=?').get(binding.actionId, binding.allocationId)) return { kind: 'refused', reason: 'ACTION_ID_CONFLICT' };
      const record = this.allocation(db, binding.allocationId);
      if (!record) return { kind: 'refused', reason: 'ALLOCATION_NOT_FOUND' };
      if (record.actionId !== binding.actionId || record.appBundleId !== binding.appBundleId) return { kind: 'refused', reason: 'ACTION_ID_CONFLICT' };
      if (record.actionDigest !== null) return record.actionDigest === binding.actionDigest && isDeepStrictEqual(record.actionRequest, binding.request)
        ? { kind: 'retrieved', allocation: record } : { kind: 'refused', reason: 'ACTION_ID_CONFLICT' };
      if (record.state !== 'ready') return { kind: 'refused', reason: 'ALLOCATION_NOT_READY' };
      const guard = this.creationGuard(db); if (guard) return guard;
      if (record.expiresAt === null || (this.options.now?.() ?? Date.now()) >= record.expiresAt) {
        this.retireReady(db, record, 'READY_EXPIRED'); return { kind: 'refused', reason: 'READY_EXPIRED' };
      }
      const device = db.prepare('SELECT * FROM devices WHERE device=?').get(record.device!) as Row | undefined;
      if (!device || device.state !== 'active' || device.token !== null || device.generation !== record.owner.generation || record.cancellationRequested) throw new AdmissionError('STATE_UNAVAILABLE', 'Parked admission is inconsistent');
      const attempt: AttemptIdentity = { kind: 'observed', id: binding.actionId };
      const token = randomUUID(); const generation = record.owner.generation + 1;
      const identity: OwnerIdentity = { device: record.device!, attempt, token, generation, process };
      record.owner = { allocationId: record.allocationId, token, generation, process };
      record.state = 'executing'; record.phase = 'action'; record.outcome = null;
      record.actionDigest = binding.actionDigest; record.actionRequest = binding.request;
      record.actionEvidence = { ...binding.evidence, observations: [], observationCount: 0, actionAttempted: false, actionAcknowledged: false, state: 'running', terminal: null, exportStatus: 'pending' };
      db.prepare("INSERT INTO attempts(kind,id,device,digest,intent,token,generation,pid,incarnation,state) VALUES (?,?,?,?,?,?,?,?,?,'active')").run(...key(attempt), record.device, binding.actionDigest, JSON.stringify(binding.request), token, generation, process.pid, process.incarnation);
      db.prepare('UPDATE devices SET token=?,generation=?,kind=?,attempt_id=? WHERE device=?').run(token, generation, ...key(attempt), record.device);
      this.saveAllocation(db, record); this.event(db, attempt, 'consumed'); return { kind: 'consumed', owner: identity, allocation: record };
    });
  }
  private retireReady(db: DatabaseSync, record: AllocationRecord, reason: 'READY_EXPIRED' | 'RETAINED_UNUSED'): void {
    record.state = 'retained'; record.phase = 'terminal'; record.outcome = 'retired_unused'; record.reason = reason;
    db.prepare("UPDATE devices SET state='available',token=NULL,kind=NULL,attempt_id=NULL WHERE device=? AND token IS NULL AND generation=?").run(record.device, record.owner.generation);
    this.saveAllocation(db, record); this.event(db, { kind: 'preparation', id: record.allocationId }, 'retired', { reason });
  }
  private evidencePaths(refs: string[], empty = false): void {
    if (!Array.isArray(refs) || (!empty && !refs.length) || refs.some(ref => typeof ref !== 'string' || !isAbsolute(ref) || ref.length > 4096 || ref.includes('\0'))) throw new AdmissionError('INVALID_REQUEST', 'Evidence requires absolute local pointers');
  }
  private runningAction(db: DatabaseSync, expected: OwnerIdentity): AllocationRecord {
    this.owned(db, expected);
    const record = this.attemptAllocation(db, expected.attempt);
    if (expected.attempt.kind !== 'observed' || !record || record.state !== 'executing' || !record.actionEvidence || record.actionEvidence.state !== 'running' || record.cancellationRequested) throw new AdmissionError('DISPATCH_CLOSED', 'Action progress is closed');
    return record;
  }
  recordObservation(expected: OwnerIdentity, refs: string[]): AllocationRecord {
    this.evidencePaths(refs);
    return this.write('recordObservation', db => {
      const record = this.runningAction(db, expected); const evidence = record.actionEvidence!;
      if (refs.every(ref => evidence.observations.includes(ref))) return record;
      if (refs.some(ref => evidence.observations.includes(ref))) throw new AdmissionError('INVALID_REQUEST', 'Partial duplicate observation');
      evidence.observationCount++; evidence.observations.push(...refs); record.evidenceRefs.push(...refs);
      this.saveAllocation(db, record); return record;
    });
  }
  recordActionReceipt(expected: OwnerIdentity, flags: Pick<ActionEvidence, 'actionAttempted' | 'actionAcknowledged'>): AllocationRecord {
    return this.write('recordActionReceipt', db => {
      const record = this.runningAction(db, expected); const evidence = record.actionEvidence!;
      const command = db.prepare("SELECT state FROM commands WHERE kind=? AND attempt_id=? AND operation='tap'").get(...key(expected.attempt));
      if (![true,false,null].includes(flags.actionAttempted) || ![true,false,null].includes(flags.actionAcknowledged)
        || (flags.actionAcknowledged === true && (flags.actionAttempted !== true || command?.state !== 'settled'))
        || (command && flags.actionAttempted === false) || (!command && (flags.actionAttempted !== false || flags.actionAcknowledged !== false))
        || (evidence.actionAttempted === true && flags.actionAttempted !== true) || (evidence.actionAcknowledged === true && flags.actionAcknowledged !== true)) throw new AdmissionError('INVALID_REQUEST', 'Action receipt contradicts dispatch facts');
      evidence.actionAttempted = flags.actionAttempted; evidence.actionAcknowledged = flags.actionAcknowledged;
      this.saveAllocation(db, record); return record;
    });
  }
  beginActionFinalization(expected: OwnerIdentity): AllocationRecord {
    return this.write('beginActionFinalization', db => {
      this.owned(db, expected); const record = this.attemptAllocation(db, expected.attempt);
      if (expected.attempt.kind !== 'observed' || !record?.actionEvidence || record.state !== 'executing') throw new AdmissionError('DISPATCH_CLOSED', 'Action is not active');
      record.actionEvidence.state = 'finalizing'; this.saveAllocation(db, record); return record;
    });
  }
  recordActionExport(actionId: string, result: { status: 'complete'; terminal: string } | { status: 'failed' }): AllocationRecord {
    if (result.status === 'complete') this.evidencePaths([result.terminal]);
    return this.write('recordActionExport', db => {
      const row = db.prepare('SELECT id FROM allocations WHERE action_id=?').get(actionId); const record = row ? this.allocation(db, row.id as string) : undefined;
      if (!record?.actionEvidence || record.actionEvidence.state !== 'terminal') throw new AdmissionError('DISPATCH_CLOSED', 'Only a committed action can be exported');
      if (record.actionEvidence.exportStatus === 'complete') {
        if (result.status === 'complete' && result.terminal !== record.actionEvidence.terminal) throw new AdmissionError('INVALID_REQUEST', 'Terminal export pointer is immutable');
        return record;
      }
      record.actionEvidence.exportStatus = result.status;
      if (result.status === 'complete') record.actionEvidence.terminal = result.terminal;
      this.saveAllocation(db, record); return record;
    });
  }
  readAllocation(id: string): AllocationRecord | undefined { return this.read(db => this.allocation(db, id)); }
  readAllocationForAction(actionId: string): AllocationRecord | undefined {
    return this.read(db => { const row = db.prepare('SELECT id FROM allocations WHERE action_id=?').get(actionId); return row ? this.allocation(db, row.id as string) : undefined; });
  }
  reserveAllocation(input: AllocationReservationInput, process: OwnerProcess): { kind: 'reserved'; allocation: AllocationRecord } | { kind: 'retrieved'; allocation: AllocationRecord } | AllocationRefusal {
    const parsed = reservationSchema.safeParse(input);
    if (!parsed.success) throw new AdmissionError('INVALID_REQUEST', 'Invalid internal allocation reservation');
    input = parsed.data;
    return this.write('reserveAllocation', db => {
      const existing = db.prepare('SELECT id FROM allocations WHERE action_id=?').get(input.actionId);
      if (existing) {
        const record = this.allocation(db, existing.id as string)!;
        return record.preparationDigest === input.preparationDigest && isDeepStrictEqual(record.preparation, input.preparation)
          && isDeepStrictEqual(record.source, input.source) && record.appBundleId === input.appBundleId
          ? { kind: 'retrieved', allocation: record } : { kind: 'refused', reason: 'ACTION_ID_CONFLICT' };
      }
      if (db.prepare('SELECT id FROM imported_actions WHERE id=?').get(input.actionId)
        || db.prepare("SELECT id FROM attempts WHERE kind!='legacy' AND id=?").get(input.actionId)) return { kind: 'refused', reason: 'ACTION_ID_CONFLICT' };
      const guard = this.creationGuard(db); if (guard) return guard;
      if (input.source.kind === 'supplied') {
        if (protectedDevices.has(input.source.udid) || db.prepare('SELECT id FROM allocations WHERE inventory_id=? OR device=?').get(input.source.inventoryId, input.source.udid)
          || db.prepare('SELECT device FROM devices WHERE device=?').get(input.source.udid)) return { kind: 'refused', reason: 'INVENTORY_INELIGIBLE' };
      }
      const all = db.prepare('SELECT id FROM allocations').all().map(row => this.allocation(db, row.id as string)!);
      const held = all.filter(a => a.capacityHeld); const bytes = held.reduce((sum, a) => sum + a.reservationBytes, 0);
      const b = input.budgets;
      if (held.length >= b.maxRetainedAllocations || all.filter(a => a.state === 'preparing').length >= b.maxConcurrentPreparations
        || bytes + b.reservationBytesPerAllocation > b.maxReservedBytes) return { kind: 'refused', reason: 'BUDGET_EXHAUSTED' };
      if (input.artifactBytes > b.maxArtifactBytes) return { kind: 'refused', reason: 'ARTIFACT_INVALID' };
      if (input.storage.simulatorFreeBytes - bytes - b.reservationBytesPerAllocation < b.minFreeBytes
        || input.storage.stagingFreeBytes - bytes - b.reservationBytesPerAllocation - input.artifactBytes < b.minFreeBytes) return { kind: 'refused', reason: 'STORAGE_UNAVAILABLE' };
      const allocationId = randomUUID().toUpperCase();
      const { storage: _storage, ...binding } = input;
      const allocation: AllocationRecord = { ...binding, allocationId, intendedName: `jev-observed-${allocationId}`, staged: null,
        device: input.source.kind === 'supplied' ? input.source.udid : null, creationReceipt: null, actionDigest: null, actionRequest: null,
        state: 'preparing', phase: 'reserved', reason: null, outcome: null, capacityHeld: true, reservationBytes: b.reservationBytesPerAllocation,
        cancellationRequested: false, owner: { allocationId, token: randomUUID(), generation: 1, process },
        createdAt: this.options.now?.() ?? Date.now(), readyAt: null, expiresAt: null, readinessEvidence: [], evidenceRefs: [], actionEvidence: null, hostCreationBlocked: false };
      const data = JSON.stringify(allocation);
      db.prepare('INSERT INTO allocations VALUES (?,?,?,?,?,?)').run(allocationId, input.actionId, allocation.device, input.source.kind === 'supplied' ? input.source.inventoryId : null, data, createHash('sha256').update(data).digest('hex'));
      this.event(db, { kind: 'preparation', id: allocationId }, 'reserved');
      return { kind: 'reserved', allocation };
    });
  }
  inspect(device: string): DeviceView | undefined { return this.read(db => this.deviceView(db, device) ?? undefined); }
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
      const allocation = this.attemptAllocation(db, identity);
      if (allocation && row.state === 'active' && row.cancelled && !allocation.cancellationRequested) { allocation.cancellationRequested = true; this.saveAllocation(db, allocation); }
      return view(row);
    });
  }
  authorize(expected: OwnerIdentity, operation: string): string {
    return this.write('authorize', db => {
      const row = this.owned(db, expected);
      if (!row.attached || row.cancelled || db.prepare("SELECT id FROM commands WHERE kind=? AND attempt_id=? AND state='uncertain'").get(...key(expected.attempt))) throw new AdmissionError('DISPATCH_CLOSED', 'Dispatch is cancelled or unattached');
      if (expected.attempt.kind === 'observed' && operation === 'tap' && db.prepare("SELECT id FROM commands WHERE kind=? AND attempt_id=? AND operation='tap'").get(...key(expected.attempt))) throw new AdmissionError('DISPATCH_CLOSED', 'Tap already authorized');
      const allocation = this.attemptAllocation(db, expected.attempt);
      if (allocation) {
        if (allocation.cancellationRequested || (expected.attempt.kind === 'preparation' && (this.options.now?.() ?? Date.now()) >= allocation.createdAt + allocation.budgets.timeoutMs) || (expected.attempt.kind === 'observed' && allocation.actionEvidence?.state !== 'running')) throw new AdmissionError('DISPATCH_CLOSED', 'Allocation dispatch closed');
        if (expected.attempt.kind === 'preparation') {
          const stages = ['boot','install','launch']; const index = stages.indexOf(operation);
          if (index >= 0) {
            if (db.prepare('SELECT id FROM commands WHERE kind=? AND attempt_id=? AND operation=?').get(...key(expected.attempt), operation)) throw new AdmissionError('DISPATCH_CLOSED', 'Preparation stage already authorized');
            if (index > 0 && !db.prepare("SELECT id FROM commands WHERE kind=? AND attempt_id=? AND operation=? AND state='settled'").get(...key(expected.attempt), stages[index - 1]!)) throw new AdmissionError('DISPATCH_CLOSED', 'Preparation stage out of order');
            allocation.phase = (['booting','installing','launching'] as const)[index]!;
          } else if (operation === 'readiness') {
            if (!db.prepare("SELECT id FROM commands WHERE kind=? AND attempt_id=? AND operation='launch' AND state='settled'").get(...key(expected.attempt))) throw new AdmissionError('DISPATCH_CLOSED', 'Launch is not settled');
            allocation.phase = 'readiness';
          }
        } else if (operation === 'tap' && allocation.actionEvidence) {
          // COMMIT grants permission, not proof that the backend was entered.
          allocation.actionEvidence.actionAttempted = null; allocation.actionEvidence.actionAcknowledged = null;
        }
        this.saveAllocation(db, allocation);
      }
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
    const allocation = this.attemptAllocation(db, { kind: row.kind, id: row.id });
    if (allocation) {
      if (row.kind === 'preparation' && !['refused','inconclusive'].includes(candidate.outcome)) throw new AdmissionError('INVALID_REQUEST', 'Preparation parks rather than publishes an action outcome');
      if (row.kind === 'observed' && allocation.actionEvidence) {
        const evidence = allocation.actionEvidence;
        const payload = candidate.payload as { outcome?: unknown; reason?: unknown } | null;
        if (candidate.outcome === 'observed' && !(evidence.observationCount > 0 && payload?.reason === null
          && ((payload.outcome === 'outcome_observed' && evidence.actionAttempted === true && evidence.actionAcknowledged === true)
            || (payload.outcome === 'already_satisfied' && evidence.actionAttempted === false && evidence.actionAcknowledged === false)))) throw new AdmissionError('INVALID_REQUEST', 'Observed success contradicts durable evidence');
        if (candidate.outcome === 'refused' && (evidence.actionAttempted !== false || evidence.actionAcknowledged !== false)) throw new AdmissionError('INVALID_REQUEST', 'Refusal cannot follow input authorization');
        if (candidate.outcome === 'completed') throw new AdmissionError('INVALID_REQUEST', 'Observed action requires an observed outcome');
        evidence.state = 'terminal';
      }
      allocation.state = candidate.disposition === 'quarantined' ? 'quarantined' : 'retained'; allocation.phase = 'terminal';
      allocation.outcome = candidate.disposition === 'quarantined' ? 'uncertain' : candidate.outcome === 'refused' ? 'refused' : 'action_completed';
      allocation.evidenceRefs = [...new Set([...allocation.evidenceRefs, ...candidate.evidenceRefs])];
      allocation.cancellationRequested = !!row.cancelled || allocation.cancellationRequested;
      this.saveAllocation(db, allocation);
    }
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
