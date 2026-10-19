import { isDeepStrictEqual } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { reservationSchema, type AllocationCapacity, type AllocationRecord, type AllocationReservationInput, type AllocationOwner, type AllocationRefusal, type AllocationReason, actionBindingSchema, type ActionBinding, type ActionRecordView, type ActionEvidence } from './admission-allocation.js';
import { closeSync, constants, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod/v4';
import type { StagedArtifact } from '../observed/artifact.js';
import type { CreationResult } from '../observed/create-source.js';
import type { DeviceCategory, AdmissionDependencies, AdmissionRequest, AdmissionResult, AttemptIdentity, AttemptView, DeviceView, OwnerIdentity, OwnerProcess, TerminalCandidate } from './admission.js';
import { BRIDGE_VERSION } from '../version.js';
import type { UpgradeDeclaration, UpgradeReceipt, UpgradeRecovery, UpgradeCheckpoint, PreservedRecords } from './admission-upgrade.js';
import { IMPORT_REFUSAL_REASONS, type ImportRefusalReason } from '../scripted/vocabulary.js';
import type { ImportedObservedAction, MigrationImport, MigrationReceipt, MigrationTestOptions } from './admission-migration.js';

type AdmissionErrorCode = 'STATE_UNAVAILABLE' | 'INVALID_REQUEST' | 'CATEGORY_NOT_ENABLED' | 'UPGRADE_BLOCKED' | 'IMPORT_REFUSED' | 'STALE_OWNER' | 'DISPATCH_CLOSED' | 'OPERATIONS_UNSETTLED';
export class AdmissionError extends Error {
  readonly reason?: ImportRefusalReason;
  constructor(code: Exclude<AdmissionErrorCode,'IMPORT_REFUSED'>, message: string);
  constructor(code: 'IMPORT_REFUSED', message: string, reason: ImportRefusalReason);
  constructor(readonly code: AdmissionErrorCode, message: string, reason?: ImportRefusalReason) {
    super(message);
    this.name = 'AdmissionError';
    if(code==='IMPORT_REFUSED') {
      const parsed=z.enum(IMPORT_REFUSAL_REASONS).safeParse(reason);
      if(!parsed.success) throw new TypeError('Expected exactly one import refusal reason');
      this.reason=parsed.data;
    }
  }
}

export type StoreOptions = AdmissionDependencies & { root: string; mode: 'production' | 'test'; fixtureSchemaVersion?: 2 | 3 };
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
const schemaVersion = 3;
const schema2 = `
CREATE TABLE metadata (singleton INTEGER PRIMARY KEY CHECK(singleton=1), schema_version INTEGER NOT NULL, root TEXT NOT NULL, installation_id TEXT NOT NULL, mode TEXT NOT NULL, migration_manifest TEXT);
CREATE TABLE devices (device TEXT PRIMARY KEY, platform TEXT NOT NULL DEFAULT 'ios-simulator' CHECK(platform='ios-simulator'), state TEXT NOT NULL CHECK(state IN ('active','available','quarantined')), generation INTEGER NOT NULL, token TEXT, kind TEXT, attempt_id TEXT, reason TEXT);
CREATE TABLE attempts (kind TEXT NOT NULL, id TEXT NOT NULL, device TEXT NOT NULL REFERENCES devices(device), digest TEXT NOT NULL, intent TEXT NOT NULL, token TEXT NOT NULL, generation INTEGER NOT NULL, pid INTEGER NOT NULL, incarnation TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('active','parked','terminal')), cancelled INTEGER NOT NULL DEFAULT 0, attached INTEGER NOT NULL DEFAULT 0, terminal TEXT, PRIMARY KEY(kind,id));
CREATE TABLE commands (id TEXT PRIMARY KEY, kind TEXT NOT NULL, attempt_id TEXT NOT NULL, token TEXT NOT NULL, generation INTEGER NOT NULL, operation TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('outstanding','settled','uncertain')), FOREIGN KEY(kind,attempt_id) REFERENCES attempts(kind,id));
CREATE TABLE transitions (sequence INTEGER PRIMARY KEY, kind TEXT NOT NULL, attempt_id TEXT NOT NULL, event TEXT NOT NULL, detail TEXT NOT NULL, time INTEGER NOT NULL);
CREATE TABLE allocations (id TEXT PRIMARY KEY, action_id TEXT NOT NULL UNIQUE, device TEXT UNIQUE, inventory_id TEXT UNIQUE, record TEXT NOT NULL, checksum TEXT NOT NULL);
CREATE TABLE unknown_creation (singleton INTEGER PRIMARY KEY CHECK(singleton=1), allocation_id TEXT NOT NULL REFERENCES allocations(id));
CREATE TABLE imported_actions (id TEXT PRIMARY KEY, allocation_id TEXT NOT NULL UNIQUE, device TEXT NOT NULL REFERENCES devices(device), record TEXT NOT NULL);
`;

const categoryCheck = "CHECK(platform IN ('ios-simulator','android-emulator','android-phone','ios-phone'))";
const pairCheck = 'CHECK((platform IS NULL)=(device IS NULL))';
const nonempty = (column: string) => `CHECK(length(${column})>0)`;
const json = (column: string) => `CHECK(json_valid(${column}))`;
const hashCheck = (column: string) => `CHECK(length(${column})=64 AND ${column} NOT GLOB '*[^0-9a-f]*')`;
const schema3 = `
CREATE TABLE metadata(singleton INTEGER PRIMARY KEY CHECK(singleton=1), schema_version INTEGER NOT NULL CHECK(schema_version>0), root TEXT NOT NULL, installation_id TEXT NOT NULL, mode TEXT NOT NULL CHECK(mode IN ('production','test')), migration_manifest TEXT NOT NULL ${json('migration_manifest')});
CREATE TABLE devices(platform TEXT NOT NULL ${categoryCheck}, device TEXT NOT NULL ${nonempty('device')}, generation INTEGER NOT NULL CHECK(generation>=0), lease_generation_id TEXT REFERENCES owner_generations(id) DEFERRABLE INITIALLY DEFERRED, attributes TEXT NOT NULL DEFAULT '{}' ${json('attributes')}, PRIMARY KEY(platform,device));
CREATE UNIQUE INDEX devices_one_lease ON devices(lease_generation_id) WHERE lease_generation_id IS NOT NULL;
CREATE TABLE allocations(id TEXT PRIMARY KEY, action_id TEXT NOT NULL UNIQUE, device TEXT, inventory_id TEXT UNIQUE, record TEXT NOT NULL ${json('record')}, checksum TEXT NOT NULL ${hashCheck('checksum')}, platform TEXT ${categoryCheck}, ${pairCheck}, UNIQUE(platform,device));
CREATE TABLE owner_generations(id TEXT PRIMARY KEY, owner_kind TEXT NOT NULL CHECK(owner_kind IN ('device','allocation','parked')), platform TEXT ${categoryCheck}, device TEXT, allocation_id TEXT REFERENCES allocations(id), attempt_kind TEXT, attempt_id TEXT, token TEXT NOT NULL ${nonempty('token')}, generation INTEGER NOT NULL CHECK(generation>0), pid INTEGER NOT NULL CHECK(pid>=0), incarnation TEXT NOT NULL ${nonempty('incarnation')}, created_at INTEGER CHECK(created_at>=0), inventory_unknown_reason TEXT, dispatch_closed_at INTEGER CHECK(dispatch_closed_at>=0), UNIQUE(token,generation), UNIQUE(id,token,generation), ${pairCheck}, CHECK((attempt_kind IS NULL)=(attempt_id IS NULL)), CHECK((owner_kind='device' AND platform IS NOT NULL AND attempt_kind IS NOT NULL AND pid>0) OR (owner_kind='allocation' AND allocation_id IS NOT NULL AND platform IS NULL AND attempt_kind IS NULL AND pid>0) OR (owner_kind='parked' AND allocation_id IS NOT NULL AND platform IS NOT NULL AND attempt_kind IS NULL AND pid=0 AND incarnation='parked')), FOREIGN KEY(platform,device) REFERENCES devices(platform,device) DEFERRABLE INITIALLY DEFERRED, FOREIGN KEY(attempt_kind,attempt_id) REFERENCES attempts(kind,id) DEFERRABLE INITIALLY DEFERRED);
CREATE TABLE attempts(kind TEXT NOT NULL CHECK(kind IN ('observed','legacy','preparation')), id TEXT NOT NULL, device TEXT NOT NULL, digest TEXT NOT NULL, intent TEXT NOT NULL ${json('intent')}, token TEXT NOT NULL, generation INTEGER NOT NULL, pid INTEGER NOT NULL CHECK(pid>0), incarnation TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('active','parked','terminal')), cancelled INTEGER NOT NULL DEFAULT 0 CHECK(cancelled IN (0,1)), attached INTEGER NOT NULL DEFAULT 0 CHECK(attached IN (0,1)), terminal TEXT CHECK(terminal IS NULL OR (json_valid(terminal) AND json_extract(terminal,'$.outcome') IS NOT NULL AND json_extract(terminal,'$.outcome') IN ('observed','completed','refused','inconclusive'))), platform TEXT NOT NULL ${categoryCheck}, owner_generation_id TEXT NOT NULL, transport TEXT ${json('transport')}, PRIMARY KEY(kind,id), FOREIGN KEY(platform,device) REFERENCES devices(platform,device), FOREIGN KEY(owner_generation_id,token,generation) REFERENCES owner_generations(id,token,generation) DEFERRABLE INITIALLY DEFERRED);
CREATE TABLE components(id TEXT PRIMARY KEY, owner_generation_id TEXT NOT NULL REFERENCES owner_generations(id), platform TEXT ${categoryCheck}, device TEXT, allocation_id TEXT REFERENCES allocations(id), kind TEXT NOT NULL ${nonempty('kind')}, declaration TEXT NOT NULL ${json('declaration')}, registered_at INTEGER NOT NULL CHECK(registered_at>=0), ${pairCheck}, CHECK(platform IS NOT NULL OR allocation_id IS NOT NULL), UNIQUE(owner_generation_id,id), UNIQUE(id,owner_generation_id), FOREIGN KEY(platform,device) REFERENCES devices(platform,device));
CREATE TABLE commands(id TEXT PRIMARY KEY, kind TEXT, attempt_id TEXT, token TEXT NOT NULL, generation INTEGER NOT NULL, operation TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('outstanding','settled','uncertain')), platform TEXT ${categoryCheck}, device TEXT, owner_generation_id TEXT NOT NULL, allocation_id TEXT REFERENCES allocations(id), component_id TEXT, recovery_claim_id TEXT REFERENCES recovery_claims(id), origin TEXT NOT NULL CHECK(origin IN ('legacy','native')), request_id TEXT, request_digest TEXT ${hashCheck('request_digest')}, ${pairCheck}, CHECK((kind IS NULL)=(attempt_id IS NULL)), CHECK(kind IS NOT NULL OR allocation_id IS NOT NULL), CHECK(origin='legacy' OR (component_id IS NOT NULL AND request_id IS NOT NULL AND request_digest IS NOT NULL)), UNIQUE(owner_generation_id,request_id), UNIQUE(id,owner_generation_id), UNIQUE(id,owner_generation_id,component_id), FOREIGN KEY(kind,attempt_id) REFERENCES attempts(kind,id), FOREIGN KEY(owner_generation_id,token,generation) REFERENCES owner_generations(id,token,generation), FOREIGN KEY(component_id,owner_generation_id) REFERENCES components(id,owner_generation_id), FOREIGN KEY(platform,device) REFERENCES devices(platform,device));
CREATE TABLE transitions(sequence INTEGER PRIMARY KEY, kind TEXT NOT NULL, attempt_id TEXT NOT NULL, event TEXT NOT NULL, detail TEXT NOT NULL ${json('detail')}, time INTEGER NOT NULL CHECK(time>=0), owner_generation_id TEXT REFERENCES owner_generations(id), command_id TEXT, CHECK(event!='late-reply' OR (owner_generation_id IS NOT NULL AND command_id IS NOT NULL)), FOREIGN KEY(command_id,owner_generation_id) REFERENCES commands(id,owner_generation_id));
CREATE VIEW maintenance_journal AS SELECT sequence,attempt_id AS guard_token,event,detail,time FROM transitions WHERE kind='maintenance';
CREATE TABLE component_observations(id TEXT PRIMARY KEY, owner_generation_id TEXT NOT NULL, component_id TEXT NOT NULL, observed_at INTEGER NOT NULL CHECK(observed_at>=0), payload TEXT NOT NULL ${json('payload')}, FOREIGN KEY(component_id,owner_generation_id) REFERENCES components(id,owner_generation_id));
CREATE TABLE fence_receipts(id TEXT PRIMARY KEY, owner_generation_id TEXT NOT NULL REFERENCES owner_generations(id), platform TEXT NOT NULL ${categoryCheck}, device TEXT NOT NULL, request_id TEXT NOT NULL, request_digest TEXT NOT NULL ${hashCheck('request_digest')}, kind TEXT NOT NULL CHECK(kind='stop'), accepted_at INTEGER NOT NULL CHECK(accepted_at>=0), payload TEXT NOT NULL ${json('payload')}, UNIQUE(owner_generation_id,request_id), UNIQUE(id,owner_generation_id), FOREIGN KEY(platform,device) REFERENCES devices(platform,device));
CREATE UNIQUE INDEX receipts_one_stop ON fence_receipts(owner_generation_id) WHERE kind='stop';
CREATE TABLE fence_components(receipt_id TEXT NOT NULL, owner_generation_id TEXT NOT NULL, component_id TEXT NOT NULL, evidence TEXT NOT NULL ${json('evidence')}, PRIMARY KEY(receipt_id,component_id), FOREIGN KEY(receipt_id,owner_generation_id) REFERENCES fence_receipts(id,owner_generation_id) DEFERRABLE INITIALLY DEFERRED, FOREIGN KEY(component_id,owner_generation_id) REFERENCES components(id,owner_generation_id));
CREATE TABLE fence_commands(receipt_id TEXT NOT NULL, owner_generation_id TEXT NOT NULL, command_id TEXT NOT NULL, component_id TEXT NOT NULL, PRIMARY KEY(receipt_id,command_id), FOREIGN KEY(receipt_id,owner_generation_id) REFERENCES fence_receipts(id,owner_generation_id) DEFERRABLE INITIALLY DEFERRED, FOREIGN KEY(command_id,owner_generation_id,component_id) REFERENCES commands(id,owner_generation_id,component_id), FOREIGN KEY(receipt_id,component_id) REFERENCES fence_components(receipt_id,component_id));
CREATE TABLE import_receipts(id TEXT PRIMARY KEY, guard_token TEXT NOT NULL UNIQUE, request_digest TEXT NOT NULL ${hashCheck('request_digest')}, declaration_digest TEXT NOT NULL ${hashCheck('declaration_digest')}, source_set_digest TEXT NOT NULL ${hashCheck('source_set_digest')}, time INTEGER NOT NULL CHECK(time>=0), binary_version TEXT NOT NULL, declaration TEXT NOT NULL ${json('declaration')}, backup_path TEXT NOT NULL, backup_sha256 TEXT NOT NULL ${hashCheck('backup_sha256')}, installation_backup_path TEXT NOT NULL, installation_backup_sha256 TEXT NOT NULL ${hashCheck('installation_backup_sha256')}, payload TEXT NOT NULL ${json('payload')}, UNIQUE(declaration_digest,source_set_digest));
CREATE TABLE import_sources(path TEXT NOT NULL, sha256 TEXT NOT NULL ${hashCheck('sha256')}, kind TEXT NOT NULL CHECK(kind IN ('lease','journal')), first_receipt_id TEXT NOT NULL REFERENCES import_receipts(id), evidence TEXT NOT NULL ${json('evidence')}, PRIMARY KEY(path,sha256));
CREATE TABLE quarantines(id TEXT PRIMARY KEY, platform TEXT ${categoryCheck}, device TEXT, legacy_name TEXT, kind TEXT NOT NULL CHECK(kind IN ('native','historical','exclusion')), cause TEXT NOT NULL ${nonempty('cause')}, created_at INTEGER NOT NULL CHECK(created_at>=0), owner_generation_id TEXT REFERENCES owner_generations(id), evidence TEXT NOT NULL ${json('evidence')}, source_path TEXT, source_sha256 TEXT ${hashCheck('source_sha256')}, covering_receipt_id TEXT, ${pairCheck}, CHECK((platform IS NOT NULL AND legacy_name IS NULL) OR (platform IS NULL AND legacy_name IS NOT NULL AND length(legacy_name)>0 AND legacy_name=upper(legacy_name) AND kind='historical')), CHECK((kind='native' AND owner_generation_id IS NOT NULL) OR (kind!='native' AND owner_generation_id IS NULL)), CHECK((source_path IS NULL)=(source_sha256 IS NULL)), FOREIGN KEY(platform,device) REFERENCES devices(platform,device), FOREIGN KEY(source_path,source_sha256) REFERENCES import_sources(path,sha256), FOREIGN KEY(covering_receipt_id,owner_generation_id) REFERENCES fence_receipts(id,owner_generation_id));
CREATE UNIQUE INDEX quarantine_one_native ON quarantines(owner_generation_id) WHERE kind='native';
CREATE UNIQUE INDEX quarantine_one_cover ON quarantines(covering_receipt_id) WHERE covering_receipt_id IS NOT NULL;
CREATE INDEX quarantine_device ON quarantines(platform,device) WHERE covering_receipt_id IS NULL;
CREATE INDEX quarantine_legacy_name ON quarantines(legacy_name COLLATE NOCASE) WHERE covering_receipt_id IS NULL;
CREATE TABLE recovery_claims(id TEXT PRIMARY KEY, owner_generation_id TEXT NOT NULL REFERENCES owner_generations(id), platform TEXT NOT NULL ${categoryCheck}, device TEXT NOT NULL, claimant_token TEXT NOT NULL ${nonempty('claimant_token')}, claimant_process TEXT NOT NULL ${json('claimant_process')}, request_id TEXT NOT NULL, request_digest TEXT NOT NULL ${hashCheck('request_digest')}, created_at INTEGER NOT NULL CHECK(created_at>=0), closed_at INTEGER CHECK(closed_at>=0), closure TEXT CHECK(closure IN ('accepted','refused','abandoned')), accepted_receipt_id TEXT, UNIQUE(owner_generation_id,request_id), CHECK((closed_at IS NULL AND closure IS NULL AND accepted_receipt_id IS NULL) OR (closed_at IS NOT NULL AND closure IS NOT NULL AND ((closure='accepted' AND accepted_receipt_id IS NOT NULL) OR (closure IN ('refused','abandoned') AND accepted_receipt_id IS NULL)))), FOREIGN KEY(platform,device) REFERENCES devices(platform,device), FOREIGN KEY(accepted_receipt_id,owner_generation_id) REFERENCES fence_receipts(id,owner_generation_id));
CREATE UNIQUE INDEX recovery_one_open ON recovery_claims(owner_generation_id) WHERE closed_at IS NULL;
CREATE UNIQUE INDEX recovery_one_accepted ON recovery_claims(owner_generation_id) WHERE closure='accepted';
CREATE TABLE upgrades(id TEXT PRIMARY KEY, guard_token TEXT NOT NULL UNIQUE, from_version INTEGER NOT NULL CHECK(from_version>0), to_version INTEGER NOT NULL CHECK(to_version=from_version+1), binary_version TEXT NOT NULL, time INTEGER NOT NULL CHECK(time>=0), declaration TEXT NOT NULL ${json('declaration')}, declaration_digest TEXT NOT NULL ${hashCheck('declaration_digest')}, backup_path TEXT NOT NULL, backup_sha256 TEXT NOT NULL ${hashCheck('backup_sha256')}, installation_backup_path TEXT NOT NULL, installation_backup_sha256 TEXT NOT NULL ${hashCheck('installation_backup_sha256')}, preserved TEXT NOT NULL ${json('preserved')}, UNIQUE(from_version,to_version));
CREATE TABLE unknown_creation(singleton INTEGER PRIMARY KEY CHECK(singleton=1), allocation_id TEXT NOT NULL REFERENCES allocations(id));
CREATE TABLE imported_actions(id TEXT PRIMARY KEY, allocation_id TEXT NOT NULL UNIQUE, device TEXT NOT NULL, record TEXT NOT NULL ${json('record')}, platform TEXT NOT NULL ${categoryCheck}, FOREIGN KEY(platform,device) REFERENCES devices(platform,device));
CREATE INDEX commands_owner ON commands(owner_generation_id);
CREATE INDEX attempts_device ON attempts(platform,device);
CREATE INDEX components_owner ON components(owner_generation_id);
CREATE VIEW device_state AS SELECT d.*, CASE WHEN g.owner_kind='parked' THEN NULL ELSE g.token END AS token,COALESCE(g.attempt_kind,(SELECT kind FROM attempts a WHERE a.owner_generation_id=g.id AND a.state='active' LIMIT 1)) AS kind,COALESCE(g.attempt_id,(SELECT id FROM attempts a WHERE a.owner_generation_id=g.id AND a.state='active' LIMIT 1)) AS attempt_id,
 CASE WHEN EXISTS(SELECT 1 FROM quarantines q WHERE q.platform=d.platform AND q.device=d.device AND q.covering_receipt_id IS NULL) THEN 'quarantined' WHEN d.lease_generation_id IS NOT NULL THEN 'active' ELSE 'available' END AS state,
 (SELECT cause FROM quarantines q WHERE q.platform=d.platform AND q.device=d.device AND q.covering_receipt_id IS NULL ORDER BY created_at,id LIMIT 1) AS reason
 FROM devices d LEFT JOIN owner_generations g ON g.id=d.lease_generation_id;
`;
const immutable = (table: string) => ['UPDATE','DELETE'].map(operation => `CREATE TRIGGER ${table}_no_${operation.toLowerCase()} BEFORE ${operation} ON ${table} BEGIN SELECT RAISE(ABORT,'Immutable ${table}'); END;`).join('\n');
const freeze = (table: string, columns: string[]) => `CREATE TRIGGER ${table}_binding_immutable BEFORE UPDATE ON ${table} WHEN ${columns.map(column => `NEW.${column} IS NOT OLD.${column}`).join(' OR ')} BEGIN SELECT RAISE(ABORT,'Immutable ${table} binding'); END;`;
const noDelete = (table: string) => `CREATE TRIGGER ${table}_no_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'Cannot delete ${table}'); END;`;
const sameTarget = (ownerId: string) => `EXISTS(SELECT 1 FROM owner_generations o LEFT JOIN allocations a ON a.id=o.allocation_id WHERE o.id=${ownerId} AND ((o.platform=NEW.platform AND o.device=NEW.device) OR (o.owner_kind='allocation' AND a.platform=NEW.platform AND a.device=NEW.device)))`;
function schema3Triggers(db: DatabaseSync): void {
  for (const table of ['components','component_observations','fence_receipts','fence_components','fence_commands','transitions','upgrades','import_receipts','import_sources','imported_actions']) db.exec(immutable(table));
  for (const table of ['devices','attempts','commands','owner_generations','quarantines','recovery_claims','metadata']) db.exec(noDelete(table));
  for (const [table,columns] of [
    ['metadata',['singleton','root','installation_id','mode','migration_manifest']],
    ['devices',['platform','device']],
    ['attempts',['kind','id','platform','device','digest','intent','token','generation','pid','incarnation','owner_generation_id','transport']],
    ['commands',['id','kind','attempt_id','token','generation','operation','platform','device','owner_generation_id','allocation_id','component_id','recovery_claim_id','origin','request_id','request_digest']],
    ['owner_generations',['id','owner_kind','platform','device','allocation_id','attempt_kind','attempt_id','token','generation','pid','incarnation','created_at']],
    ['quarantines',['id','platform','device','legacy_name','kind','cause','created_at','owner_generation_id','evidence','source_path','source_sha256']],
    ['recovery_claims',['id','owner_generation_id','platform','device','claimant_token','claimant_process','request_id','request_digest','created_at']],
  ] as [string,string[]][]) db.exec(freeze(table,columns));
  db.exec(`
CREATE TRIGGER metadata_version_forward BEFORE UPDATE OF schema_version ON metadata WHEN NEW.schema_version!=OLD.schema_version+1 BEGIN SELECT RAISE(ABORT,'Schema version must advance by one'); END;
CREATE TRIGGER devices_generation_monotonic BEFORE UPDATE ON devices WHEN NEW.generation<OLD.generation BEGIN SELECT RAISE(ABORT,'Generation cannot decrease'); END;
CREATE TRIGGER attempts_terminal_once BEFORE UPDATE ON attempts WHEN OLD.terminal IS NOT NULL AND NEW.terminal IS NOT OLD.terminal BEGIN SELECT RAISE(ABORT,'Terminal outcome is immutable'); END;
CREATE TRIGGER commands_disposition_once BEFORE UPDATE ON commands WHEN OLD.state!='outstanding' BEGIN SELECT RAISE(ABORT,'Command disposition is immutable'); END;
CREATE TRIGGER owner_generations_closure_once BEFORE UPDATE ON owner_generations WHEN OLD.dispatch_closed_at IS NOT NULL AND NEW.dispatch_closed_at IS NOT OLD.dispatch_closed_at BEGIN SELECT RAISE(ABORT,'Dispatch closure is immutable'); END;
CREATE TRIGGER owner_generations_unknown_once BEFORE UPDATE ON owner_generations WHEN OLD.inventory_unknown_reason IS NOT NULL AND NEW.inventory_unknown_reason IS NOT OLD.inventory_unknown_reason BEGIN SELECT RAISE(ABORT,'Inventory uncertainty is immutable'); END;
CREATE TRIGGER quarantines_cover_once BEFORE UPDATE ON quarantines WHEN OLD.covering_receipt_id IS NOT NULL OR NEW.covering_receipt_id IS NULL OR OLD.kind!='native' BEGIN SELECT RAISE(ABORT,'Quarantine cannot be covered'); END;
CREATE TRIGGER recovery_claims_close_once BEFORE UPDATE ON recovery_claims WHEN OLD.closed_at IS NOT NULL OR NEW.closed_at IS NULL BEGIN SELECT RAISE(ABORT,'Recovery claim closure is immutable'); END;
CREATE TRIGGER components_before_closure BEFORE INSERT ON components WHEN (SELECT dispatch_closed_at FROM owner_generations WHERE id=NEW.owner_generation_id) IS NOT NULL BEGIN SELECT RAISE(ABORT,'Dispatch is closed'); END;
CREATE TRIGGER commands_before_closure BEFORE INSERT ON commands WHEN NEW.origin='native' AND (SELECT dispatch_closed_at FROM owner_generations WHERE id=NEW.owner_generation_id) IS NOT NULL BEGIN SELECT RAISE(ABORT,'Dispatch is closed'); END;
`);
  for (const operation of ['INSERT','UPDATE']) db.exec(`CREATE TRIGGER devices_pointer_${operation.toLowerCase()} BEFORE ${operation} ON devices WHEN NEW.lease_generation_id IS NOT NULL AND NOT ${sameTarget('NEW.lease_generation_id')} BEGIN SELECT RAISE(ABORT,'Lease pointer names another device'); END;`);
  for (const table of ['fence_receipts','recovery_claims','quarantines']) db.exec(`CREATE TRIGGER ${table}_target BEFORE INSERT ON ${table} WHEN NEW.owner_generation_id IS NOT NULL AND NOT ${sameTarget('NEW.owner_generation_id')} BEGIN SELECT RAISE(ABORT,'Owner generation names another device'); END;`);
  for(const table of ['attempts','commands','components']) {
    const allocation=table==='attempts'?'1':`(NEW.allocation_id IS NULL OR NEW.allocation_id=o.allocation_id)`;
    const preIdentity=table==='attempts'?'0':`(NEW.platform IS NULL AND NEW.allocation_id IS NOT NULL AND NEW.allocation_id=o.allocation_id)`;
    const attempt=table==='components'?'1':table==='attempts'
      ? "((o.owner_kind='device' AND NEW.kind=o.attempt_kind AND NEW.id=o.attempt_id) OR (o.owner_kind='allocation' AND NEW.kind='preparation' AND NEW.id=o.allocation_id))"
      : "((NEW.kind IS NULL AND NEW.allocation_id=o.allocation_id) OR (NEW.kind=o.attempt_kind AND NEW.attempt_id=o.attempt_id) OR (o.owner_kind='allocation' AND NEW.kind='preparation' AND NEW.attempt_id=o.allocation_id))";
    db.exec(`CREATE TRIGGER ${table}_owner_target BEFORE INSERT ON ${table} WHEN NOT EXISTS(SELECT 1 FROM owner_generations o LEFT JOIN allocations a ON a.id=o.allocation_id WHERE o.id=NEW.owner_generation_id AND ${allocation} AND ${attempt} AND (${preIdentity} OR (o.platform=NEW.platform AND o.device=NEW.device) OR (o.owner_kind='allocation' AND a.platform=NEW.platform AND a.device=NEW.device))) BEGIN SELECT RAISE(ABORT,'Owner generation target mismatch'); END;`);
  }
  db.exec("CREATE TRIGGER commands_recovery_binding BEFORE INSERT ON commands WHEN NEW.recovery_claim_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM recovery_claims r WHERE r.id=NEW.recovery_claim_id AND r.owner_generation_id=NEW.owner_generation_id) BEGIN SELECT RAISE(ABORT,'Recovery claim target mismatch'); END;");
  for (const table of ['fence_components','fence_commands']) db.exec(`CREATE TRIGGER ${table}_sealed BEFORE INSERT ON ${table} WHEN EXISTS(SELECT 1 FROM fence_receipts WHERE id=NEW.receipt_id) BEGIN SELECT RAISE(ABORT,'Receipt membership is sealed'); END;`);
}
const baseTables = ['metadata','devices','attempts','commands','transitions','allocations','unknown_creation','imported_actions'] as const;
function rows(db: DatabaseSync, table: string): Row[] { return db.prepare(`SELECT * FROM ${table}`).all(); }
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
function generationId(token: string, generation: number): string { return sha(JSON.stringify([token,generation])); }
function step2to3(db: DatabaseSync, time: number): { historical: number; exclusion: number } {
  const active = db.prepare("SELECT kind,id FROM attempts WHERE state='active' ORDER BY kind,id").all();
  if (active.length) throw new AdmissionError('UPGRADE_BLOCKED', `Active attempts block upgrade: ${JSON.stringify(active)}`);
  const old = Object.fromEntries(baseTables.map(table => [table,rows(db,table)]));
  for (const table of ['commands','attempts','imported_actions','unknown_creation','allocations','devices','transitions','metadata']) db.exec(`DROP TABLE ${table}`);
  db.exec(schema3);
  const put = (table: string, row: Row) => {
    const columns = Object.keys(row);
    db.prepare(`INSERT INTO ${table}(${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...columns.map(column => row[column]));
  };
  for (const row of old.metadata!) put('metadata',row);
  for (const row of old.devices!) put('devices',{platform:'ios-simulator',device:row.device,generation:row.generation,lease_generation_id:null,attributes:'{}'});
  for (const row of old.allocations!) put('allocations',{...row,platform:row.device===null?null:'ios-simulator'});
  const owners = new Map<string,Row>();
  const remember = (row: Row) => { const previous=owners.get(row.id); if (previous && !isDeepStrictEqual(previous,row)) throw new AdmissionError('STATE_UNAVAILABLE','Conflicting historical owner binding'); owners.set(row.id,row); };
  for (const row of old.attempts!) {
    const allocation=old.allocations!.find(a => row.kind==='preparation'?a.id===row.id:row.kind==='observed'&&a.action_id===row.id);
    remember({id:generationId(row.token,row.generation),owner_kind:'device',platform:'ios-simulator',device:row.device,allocation_id:allocation?.id??null,attempt_kind:row.kind,attempt_id:row.id,token:row.token,generation:row.generation,pid:row.pid,incarnation:row.incarnation,created_at:null,inventory_unknown_reason:'schema2-inventory',dispatch_closed_at:time});
  }
  for (const allocation of old.allocations!) {
    const record: AllocationRecord=JSON.parse(allocation.record); const o=record.owner; const id=generationId(o.token,o.generation);
    if (!owners.has(id)) remember({id,owner_kind:o.process.pid===0&&o.process.incarnation==='parked'?'parked':'allocation',platform:o.process.pid===0?'ios-simulator':null,device:o.process.pid===0?record.device:null,allocation_id:allocation.id,attempt_kind:null,attempt_id:null,token:o.token,generation:o.generation,pid:o.process.pid,incarnation:o.process.incarnation,created_at:record.createdAt,inventory_unknown_reason:o.process.pid===0?null:'schema2-inventory',dispatch_closed_at:o.process.pid===0||!['preparing','executing'].includes(record.state)?time:null});
  }
  for (const row of owners.values()) put('owner_generations',row);
  for (const row of old.attempts!) put('attempts',{...row,platform:'ios-simulator',owner_generation_id:generationId(row.token,row.generation),transport:null});
  for (const row of old.commands!) {
    const attempt=old.attempts!.find(a=>a.kind===row.kind&&a.id===row.attempt_id);
    if (!attempt) throw new AdmissionError('STATE_UNAVAILABLE','Command has no historical attempt');
    const allocation=old.allocations!.find(a=>row.kind==='preparation'?a.id===row.attempt_id:row.kind==='observed'&&a.action_id===row.attempt_id);
    put('commands',{...row,platform:'ios-simulator',device:attempt.device,owner_generation_id:generationId(row.token,row.generation),allocation_id:allocation?.id??null,component_id:null,recovery_claim_id:null,origin:'legacy',request_id:null,request_digest:null});
  }
  for (const row of old.transitions!) put('transitions',{...row,owner_generation_id:null,command_id:null});
  for (const row of old.unknown_creation!) put('unknown_creation',row);
  for (const row of old.imported_actions!) put('imported_actions',{...row,platform:'ios-simulator'});
  const counts={historical:0,exclusion:0};
  for (const row of old.devices!) {
    if (row.state==='quarantined') {
      const kind=row.reason==='protected-device'?'exclusion':'historical'; counts[kind]++;
      put('quarantines',{id:sha(JSON.stringify(['schema3',old.metadata![0]!.installation_id,'ios-simulator',row.device,kind])),platform:'ios-simulator',device:row.device,legacy_name:null,kind,cause:row.reason??'historical-uncertainty',created_at:time,owner_generation_id:null,evidence:JSON.stringify({version:1,sourceSchema:2,state:row.state,reason:row.reason,timeMeaning:'conversion'}),source_path:null,source_sha256:null,covering_receipt_id:null});
    }
    if (row.state==='active') {
      const parked=old.allocations!.map(a=>JSON.parse(a.record) as AllocationRecord).find(a=>a.state==='ready'&&a.device===row.device&&a.owner.generation===row.generation);
      if (!parked) throw new AdmissionError('STATE_UNAVAILABLE','Active device has no parked allocation');
      db.prepare('UPDATE devices SET lease_generation_id=? WHERE platform=? AND device=?').run(generationId(parked.owner.token,parked.owner.generation),'ios-simulator',row.device);
    }
  }
  if(counts.historical+counts.exclusion!==old.devices!.filter(row=>row.state==='quarantined').length) throw new AdmissionError('STATE_UNAVAILABLE','Quarantine conversion count mismatch');
  schema3Triggers(db);
  db.exec('UPDATE metadata SET schema_version=3 WHERE singleton=1');
  return counts;
}


function databaseSnapshot(db: DatabaseSync, excludedSequence?: number): string {
  const tables=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
  return JSON.stringify({schema,tables:tables.map(table=>({name:table.name,rows:rows(db,String(table.name)).filter(row=>table.name!=='transitions'||row.sequence!==excludedSequence).map(row=>JSON.stringify(row)).sort()}))});
}
function preservedRecords(db: DatabaseSync, version: number): PreservedRecords {
  const queries: Record<string,string>={
    metadata:'SELECT singleton,root,installation_id,mode,migration_manifest FROM metadata ORDER BY singleton',
    devices:version===2?'SELECT platform,device,state,generation,reason FROM devices ORDER BY platform,device':`SELECT platform,device,state,generation,CASE WHEN state='quarantined' THEN (SELECT CASE WHEN json_extract(q.evidence,'$.sourceSchema')=2 THEN json_extract(q.evidence,'$.reason') ELSE q.cause END FROM quarantines q WHERE q.platform=d.platform AND q.device=d.device AND q.covering_receipt_id IS NULL ORDER BY created_at,id LIMIT 1) ELSE NULL END AS reason FROM device_state d ORDER BY platform,device`,
    attempts:'SELECT kind,id,device,digest,intent,token,generation,pid,incarnation,state,cancelled,attached,terminal FROM attempts ORDER BY kind,id',
    commands:'SELECT id,kind,attempt_id,token,generation,operation,state FROM commands ORDER BY id',
    transitions:'SELECT sequence,kind,attempt_id,event,detail,time FROM transitions ORDER BY sequence',
    allocations:'SELECT id,action_id,device,inventory_id,record,checksum FROM allocations ORDER BY id',
    unknown_creation:'SELECT singleton,allocation_id FROM unknown_creation ORDER BY singleton',
    imported_actions:'SELECT id,allocation_id,device,record FROM imported_actions ORDER BY id',
  };
  return Object.fromEntries(Object.entries(queries).map(([name,query])=>{const values=db.prepare(query).all();return [name,{count:values.length,digest:sha(JSON.stringify(values))}];}));
}
const backupSchema=z.strictObject({path:z.string(),sha256:z.string().regex(/^[a-f0-9]{64}$/),installationPath:z.string(),installationSha256:z.string().regex(/^[a-f0-9]{64}$/)});
const upgradeGuardSchema=z.strictObject({version:z.literal(1),kind:z.literal('upgrade'),token:z.string().uuid(),installationId:z.string().uuid(),from:z.literal(2),to:z.literal(3),declarationDigest:z.string().regex(/^[a-f0-9]{64}$/),time:z.number().int().nonnegative(),backup:z.union([z.null(),backupSchema]),backupDirectory:z.string(),sourceFingerprint:z.string().regex(/^[a-f0-9]{64}$/),afterFingerprint:z.string().regex(/^[a-f0-9]{64}$/).optional()});
type UpgradeGuard=z.infer<typeof upgradeGuardSchema>;
function maintenanceDatabase(options: StoreOptions, token?: string): DatabaseSync {
  rootPath(options.root);
  const lock=join(options.root,'migration.lock');
  if(!absent(lock)) {secure(lock,false); const guard=z.object({token:z.string()}).safeParse(JSON.parse(readFileSync(lock,'utf8'))); if(!guard.success||guard.data.token!==token) throw new AdmissionError('STATE_UNAVAILABLE','Offline maintenance guard prevents opening the store');}
  const markerPath=join(options.root,'installation.json'), path=join(options.root,'admission.sqlite');
  secure(markerPath,false);secure(path,false);secureSidecars(path);
  const marker=z.strictObject({version:z.literal(1),root:z.string(),installationId:z.string().uuid()}).parse(JSON.parse(readFileSync(markerPath,'utf8')));
  const db=new DatabaseSync(path);
  try {
    configure(db); const meta=db.prepare('SELECT * FROM metadata WHERE singleton=1').get() as Row|undefined;
    if(!meta||marker.root!==options.root||meta.root!==options.root||meta.installation_id!==marker.installationId||meta.mode!==options.mode) throw new AdmissionError('STATE_UNAVAILABLE','Admission installation identity mismatch');
    migrationReceipt(meta,options.mode);return db;
  } catch(error){db.close();throw unavailable(error);}
}
function saveGuard(root: string, guard: UpgradeGuard, fresh=false): void {
  const path=join(root,'migration.lock');
  if(!fresh) {secure(path,false);if(JSON.parse(readFileSync(path,'utf8')).token!==guard.token) throw new AdmissionError('STATE_UNAVAILABLE','Maintenance guard changed');}
  writeFileSync(path,JSON.stringify(guard),{flag:fresh?'wx':'w',mode:0o600});syncPath(path);syncPath(root);
}
function removeUpgradeGuard(root: string, token: string): void {
  const path=join(root,'migration.lock');secure(path,false);
  if(JSON.parse(readFileSync(path,'utf8')).token!==token) throw new AdmissionError('STATE_UNAVAILABLE','Maintenance guard changed');
  unlinkSync(path);syncPath(root);
}
function upgradeReceipt(row: Row): UpgradeReceipt {
  const stored=JSON.parse(row.preserved);
  return {version:1,kind:'upgrade',id:row.id,guardToken:row.guard_token,from:row.from_version,to:row.to_version,binaryVersion:row.binary_version,time:row.time,declaration:JSON.parse(row.declaration),backup:{path:row.backup_path,sha256:row.backup_sha256,installationPath:row.installation_backup_path,installationSha256:row.installation_backup_sha256},preserved:{before:stored.before,after:stored.after},quarantines:stored.quarantines};
}
function completedUpgrade(db: DatabaseSync, declaration: UpgradeDeclaration, token?: string): UpgradeReceipt {
  const row=db.prepare('SELECT * FROM upgrades WHERE from_version=? AND to_version=?').get(declaration.from,declaration.to) as Row|undefined;
  if(!row||!isDeepStrictEqual(JSON.parse(row.declaration),declaration)||row.declaration_digest!==sha(JSON.stringify(declaration))||(token!==undefined&&row.guard_token!==token)) throw new AdmissionError('STATE_UNAVAILABLE','Completed upgrade declaration or guard conflicts');
  return upgradeReceipt(row);
}
function runUpgrade(options: StoreOptions, declaration: UpgradeDeclaration, checkpoint?: (point: UpgradeCheckpoint)=>void): UpgradeReceipt {
  let db:DatabaseSync|undefined;
  try {
    db=maintenanceDatabase(options);
    const version=Number(db.prepare('SELECT schema_version FROM metadata').get()?.schema_version);
    if(version===declaration.to) return completedUpgrade(db,declaration);
    if(version!==declaration.from) throw new AdmissionError('STATE_UNAVAILABLE',`Store schema ${version}; expected ${declaration.from} for admission-maintenance upgrade`);
    const active=db.prepare("SELECT kind,id FROM attempts WHERE state='active' ORDER BY kind,id").all();
    if(active.length) throw new AdmissionError('UPGRADE_BLOCKED',`Active attempts block upgrade: ${JSON.stringify(active)}`);
    const token=randomUUID(), time=options.now?.()??Date.now(), directory=join(options.root,'backups',token);
    const installationId=String(db.prepare('SELECT installation_id FROM metadata').get()?.installation_id);
    let guard:UpgradeGuard={version:1,kind:'upgrade',token,installationId,from:2,to:3,declarationDigest:sha(JSON.stringify(declaration)),time,backup:null,backupDirectory:directory,sourceFingerprint:sha(databaseSnapshot(db))};
    saveGuard(options.root,guard,true);checkpoint?.('guarded');
    mkdirSync(join(options.root,'backups'),{mode:0o700,recursive:true});secure(join(options.root,'backups'),true);
    mkdirSync(directory,{mode:0o700});secure(directory,true);
    const backupPath=join(directory,'admission.sqlite'), installationPath=join(directory,'installation.json');
    const previousMask=process.umask(0o077);
    try {db.prepare('VACUUM INTO ?').run(backupPath);} finally {process.umask(previousMask);}
    secure(backupPath,false);
    writeFileSync(installationPath,readFileSync(join(options.root,'installation.json')),{flag:'wx',mode:0o600});
    syncPath(backupPath);syncPath(installationPath);syncPath(directory);syncPath(join(options.root,'backups'));syncPath(options.root);
    const backupDb=new DatabaseSync(backupPath,{readOnly:true});
    try { if(Number(backupDb.prepare('SELECT schema_version FROM metadata').get()?.schema_version)!==2||sha(databaseSnapshot(backupDb))!==guard.sourceFingerprint) throw new AdmissionError('STATE_UNAVAILABLE','Backup verification failed'); }finally{backupDb.close();}
    const backup={path:backupPath,sha256:sha(readFileSync(backupPath)),installationPath,installationSha256:sha(readFileSync(installationPath))};
    guard={...guard,backup};saveGuard(options.root,guard);checkpoint?.('backupVerified');
    db.exec('BEGIN IMMEDIATE');
    if(sha(databaseSnapshot(db))!==guard.sourceFingerprint) throw new AdmissionError('STATE_UNAVAILABLE','Store changed after backup');
    const before=preservedRecords(db,2), quarantines=step2to3(db,time), after=preservedRecords(db,3);
    if(!isDeepStrictEqual(before,after)) throw new AdmissionError('STATE_UNAVAILABLE','Preserved logical records changed during upgrade');
    const receipt:UpgradeReceipt={version:1,kind:'upgrade',id:randomUUID(),guardToken:token,from:2,to:3,binaryVersion:BRIDGE_VERSION,time,declaration,backup,preserved:{before,after},quarantines};
    db.prepare('INSERT INTO upgrades VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(receipt.id,token,2,3,BRIDGE_VERSION,time,JSON.stringify(declaration),guard.declarationDigest,backup.path,backup.sha256,backup.installationPath,backup.installationSha256,JSON.stringify({...receipt.preserved,quarantines}));
    guard={...guard,afterFingerprint:sha(databaseSnapshot(db))};saveGuard(options.root,guard);
    checkpoint?.('beforeCommit');db.exec('COMMIT');checkpoint?.('afterCommit');
    removeUpgradeGuard(options.root,token);return receipt;
  } catch(error){try{db?.exec('ROLLBACK');}catch{}throw unavailable(error);}finally{db?.close();}
}
function recoverUpgrade(options:StoreOptions,declaration:UpgradeDeclaration,checkpoint?:(point:UpgradeCheckpoint)=>void):UpgradeRecovery {
  let db:DatabaseSync|undefined;
  try {
    const lock=join(options.root,'migration.lock');rootPath(options.root);secure(lock,false);
    const guard=upgradeGuardSchema.parse(JSON.parse(readFileSync(lock,'utf8')));
    if(guard.from!==declaration.from||guard.to!==declaration.to||guard.declarationDigest!==sha(JSON.stringify(declaration))||guard.backupDirectory!==join(options.root,'backups',guard.token)) throw new AdmissionError('STATE_UNAVAILABLE','Upgrade recovery declaration or backup conflicts');
    const backup=guard.backup;
    if(backup!==null) {
      if(backup.path!==join(guard.backupDirectory,'admission.sqlite')||backup.installationPath!==join(guard.backupDirectory,'installation.json')) throw new AdmissionError('STATE_UNAVAILABLE','Upgrade backup path conflicts');
      secure(join(options.root,'backups'),true);secure(guard.backupDirectory,true);secure(backup.path,false);secure(backup.installationPath,false);
      if(sha(readFileSync(backup.path))!==backup.sha256||sha(readFileSync(backup.installationPath))!==backup.installationSha256||!readFileSync(backup.installationPath).equals(readFileSync(join(options.root,'installation.json')))) throw new AdmissionError('STATE_UNAVAILABLE','Upgrade backup hash or installation changed');
      const backupDb=new DatabaseSync(backup.path,{readOnly:true});
      try {if(Number(backupDb.prepare('SELECT schema_version FROM metadata').get()?.schema_version)!==2||sha(databaseSnapshot(backupDb))!==guard.sourceFingerprint)throw new AdmissionError('STATE_UNAVAILABLE','Recorded backup does not match source');}finally{backupDb.close();}
    }
    db=maintenanceDatabase(options,guard.token);db.exec('BEGIN IMMEDIATE');
    const meta=db.prepare('SELECT * FROM metadata').get() as Row;
    if(meta.installation_id!==guard.installationId)throw new AdmissionError('STATE_UNAVAILABLE','Recovery installation mismatch');
    const version=Number(meta.schema_version);
    let receiptId:string|null=null;
    if(version===3&&backup!==null) {const receipt=completedUpgrade(db,declaration,guard.token);if(!isDeepStrictEqual(receipt.backup,backup))throw new AdmissionError('STATE_UNAVAILABLE','Recovery receipt backup mismatch');receiptId=receipt.id;}
    else if(version!==2)throw new AdmissionError('STATE_UNAVAILABLE',`Cannot recover schema ${version}`);
    const result:UpgradeRecovery={version:1,kind:'upgrade-recovery',guardToken:guard.token,schemaVersion:version,receiptId};
    const detail={...result,declarationDigest:guard.declarationDigest,installationId:guard.installationId};
    const events=db.prepare("SELECT * FROM transitions WHERE kind='maintenance' AND attempt_id=? AND event='upgrade-recovered'").all(guard.token);
    if(events.length>1||events.some(row=>!isDeepStrictEqual(JSON.parse(String(row.detail)),detail)))throw new AdmissionError('STATE_UNAVAILABLE','Recovery journal conflicts');
    const fingerprint=sha(databaseSnapshot(db,events[0]?.sequence as number|undefined));
    if(fingerprint!==(version===2?guard.sourceFingerprint:guard.afterFingerprint))throw new AdmissionError('STATE_UNAVAILABLE','Store differs from the checked recovery state');
    if(!events.length)db.prepare("INSERT INTO transitions(kind,attempt_id,event,detail,time) VALUES ('maintenance',?,'upgrade-recovered',?,?)").run(guard.token,JSON.stringify(detail),guard.time);
    db.exec('COMMIT');checkpoint?.('recoveryCommitted');checkpoint?.('beforeGuardRemoval');removeUpgradeGuard(options.root,guard.token);return result;
  }catch(error){try{db?.exec('ROLLBACK');}catch{}throw unavailable(error);}finally{db?.close();}
}

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
function owner(row: Row): OwnerIdentity { return { category: row.platform ?? 'ios-simulator', device: row.device, attempt: { kind: row.kind, id: row.id }, token: row.token, generation: row.generation, process: { pid: row.pid, incarnation: row.incarnation } }; }
function view(row: Row): AttemptView { return { identity: { kind: row.kind, id: row.id }, category: row.platform ?? 'ios-simulator', device: row.device, digest: row.digest, intent: JSON.parse(row.intent), owner: owner(row), state: row.state, cancellationRequested: !!row.cancelled, terminal: row.terminal === null ? null : JSON.parse(row.terminal) }; }

/** Internal adapter. Migration/allocation add typed operations here; no SQL escape hatch. */
export class AdmissionSqlite {
  private readonly root: string;
  constructor(private readonly options: StoreOptions, private readonly migrationToken?: string) {
    try { this.root = rootPath(options.root); this.read(() => undefined); } catch (error) { throw unavailable(error); }
  }
  static upgrade(options: StoreOptions, declaration: UpgradeDeclaration, checkpoint?: (point: UpgradeCheckpoint) => void): UpgradeReceipt { return runUpgrade(options,declaration,checkpoint); }
  static recoverUpgrade(options: StoreOptions, declaration: UpgradeDeclaration, checkpoint?: (point: UpgradeCheckpoint) => void): UpgradeRecovery { return recoverUpgrade(options,declaration,checkpoint); }
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
        const db = maintenanceDatabase(options, token);
        let version: number;
        try { version = Number(db.prepare('SELECT schema_version FROM metadata WHERE singleton=1').get()?.schema_version); }
        finally { db.close(); }
        if (version !== schemaVersion) {
          completed = true;
          throw new AdmissionError('STATE_UNAVAILABLE', `Store schema ${version}; this binary requires schema ${schemaVersion}. Run admission-maintenance upgrade <declaration>`);
        }
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
        configure(db); db.exec('BEGIN IMMEDIATE'); db.exec(schema2);
        for (const device of plan.devices) db.prepare('INSERT INTO devices(device,state,generation,reason) VALUES (?,?,0,?)').run(device.device, device.uncertain ? 'quarantined' : 'available', device.reason);
        for (const action of plan.actions) {
          const record: ImportedObservedAction = { ...action, allocationId: randomUUID().toUpperCase() };
          db.prepare('INSERT INTO imported_actions VALUES (?,?,?,?)').run(record.actionId, record.allocationId, record.device, JSON.stringify(record));
        }
        db.prepare('INSERT INTO metadata VALUES (1,?,?,?,?,?)').run(2, options.root, installationId, options.mode, JSON.stringify(receipt));
        if (options.mode !== 'test' || options.fixtureSchemaVersion !== 2) step2to3(db, options.now?.() ?? Date.now());
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
        configure(db); db.exec('BEGIN IMMEDIATE'); db.exec(schema2);
        db.prepare('INSERT INTO metadata VALUES (1,?,?,?,?,?)').run(2, root, installationId, 'test', JSON.stringify({ testFixture: true })); step2to3(db, 0); db.exec('COMMIT');
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
    if(meta && meta.schema_version!==schemaVersion) throw new AdmissionError('STATE_UNAVAILABLE',`Store schema ${meta.schema_version}; this binary requires schema ${schemaVersion}. Use admission-maintenance upgrade <declaration> with the matching binary.`);
    if (!meta || marker.version !== 1 ||
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
    const device = db.prepare('SELECT * FROM device_state WHERE platform=? AND device=?').get(expected.category,expected.device) as Row | undefined;
    if (device?.platform !== expected.category || (row?.platform ?? 'ios-simulator') !== expected.category) throw new AdmissionError('STALE_OWNER', 'Claim belongs to another device category');
    if (!row || !device || row.state !== 'active' || device.state !== 'active' || row.device !== expected.device || row.pid !== expected.process.pid || row.incarnation !== expected.process.incarnation || row.token !== expected.token || row.generation !== expected.generation || device.token !== expected.token || device.generation !== expected.generation) throw new AdmissionError('STALE_OWNER', 'Claim no longer owns admission');
    return row;
  }
  private insertOwner(db: DatabaseSync, identity: OwnerIdentity, allocationId: string | null = null): string {
    const id=generationId(identity.token,identity.generation);
    if(!db.prepare('SELECT id FROM owner_generations WHERE id=?').get(id)) db.prepare("INSERT INTO owner_generations(id,owner_kind,platform,device,allocation_id,attempt_kind,attempt_id,token,generation,pid,incarnation,created_at,inventory_unknown_reason) VALUES (?,'device',?,?,?,?,?,?,?,?,?,?, 'legacy-inventory')").run(id,identity.category,identity.device,allocationId,identity.attempt.kind,identity.attempt.id,identity.token,identity.generation,identity.process.pid,identity.process.incarnation,this.options.now?.()??Date.now());
    return id;
  }
  private allocationOwner(db: DatabaseSync, record: AllocationRecord): void {
    const o=record.owner,id=generationId(o.token,o.generation);
    if(db.prepare('SELECT id FROM owner_generations WHERE id=?').get(id)) return;
    const parked=o.process.pid===0&&o.process.incarnation==='parked';
    db.prepare('INSERT INTO owner_generations(id,owner_kind,platform,device,allocation_id,token,generation,pid,incarnation,created_at,inventory_unknown_reason,dispatch_closed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(id,parked?'parked':'allocation',parked?'ios-simulator':null,parked?record.device:null,record.allocationId,o.token,o.generation,o.process.pid,o.process.incarnation,record.createdAt,parked?null:'legacy-inventory',parked?this.options.now?.()??Date.now():null);
  }
  acquire(request: AdmissionRequest, process: OwnerProcess): Exclude<AdmissionResult, { kind: 'acquired' }> | { kind: 'acquired'; owner: OwnerIdentity } {
    const category=request.category??'ios-simulator';
    const intent = JSON.stringify(request.intent);
    if (intent === undefined) throw new AdmissionError('INVALID_REQUEST', 'Intent must be JSON');
    return this.write('acquire', db => {
      if (request.attempt.kind !== 'legacy' && db.prepare('SELECT id FROM imported_actions WHERE id=?').get(request.attempt.id)) return { kind: 'refused', reason: 'ACTION_ID_CONFLICT' };
      const existing = db.prepare('SELECT * FROM attempts WHERE kind=? AND id=?').get(...key(request.attempt)) as Row | undefined;
      if (existing) return existing.digest === request.digest && existing.platform===category && existing.device === request.device && isDeepStrictEqual(JSON.parse(existing.intent), JSON.parse(intent)) ? { kind: 'retrieved', attempt: view(existing) } : { kind: 'refused', reason: 'ACTION_ID_CONFLICT' };
      const guard = this.creationGuard(db);
      if (guard) return guard;
      if ((category==='ios-simulator'&&protectedDevices.has(request.device)) || db.prepare('SELECT id FROM allocations WHERE platform=? AND device=?').get(category,request.device)) return { kind: 'refused', reason: 'DEVICE_QUARANTINED' };
      const stored=db.prepare('SELECT * FROM device_state WHERE platform=? AND device=?').get(category,request.device) as Row|undefined;
      const legacyName=category==='android-phone'?request.device:category==='android-emulator'&&stored?JSON.parse(stored.attributes).avdName:undefined;
      if(legacyName&&db.prepare('SELECT id FROM quarantines WHERE legacy_name=? COLLATE NOCASE AND covering_receipt_id IS NULL').get(legacyName)) return {kind:'refused',reason:'DEVICE_QUARANTINED'};
      if (request.attempt.kind !== 'legacy' && db.prepare('SELECT id FROM allocations WHERE action_id=?').get(request.attempt.id)) return { kind: 'refused', reason: 'ACTION_ID_CONFLICT' };
      if (stored && stored.state !== 'available') return { kind: 'refused', reason: stored.state === 'quarantined' ? 'DEVICE_QUARANTINED' : 'DEVICE_BUSY' };
      const generation = (stored?.generation ?? 0) + 1; const token = randomUUID();
      db.prepare('INSERT INTO devices(platform,device,generation) VALUES (?,?,?) ON CONFLICT(platform,device) DO UPDATE SET generation=excluded.generation').run(category,request.device,generation);
      const identity:OwnerIdentity={category,device:request.device,attempt:request.attempt,token,generation,process};
      const ownerId=this.insertOwner(db,identity);
      db.prepare("INSERT INTO attempts(kind,id,device,digest,intent,token,generation,pid,incarnation,state,platform,owner_generation_id) VALUES (?,?,?,?,?,?,?,?,?,'active',?,?)").run(...key(request.attempt),request.device,request.digest,intent,token,generation,process.pid,process.incarnation,category,ownerId);
      db.prepare('UPDATE devices SET lease_generation_id=? WHERE platform=? AND device=?').run(ownerId,category,request.device);
      this.event(db, request.attempt, 'acquired');
      return { kind: 'acquired', owner: identity };
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
    db.prepare('UPDATE allocations SET device=?,platform=?,record=?,checksum=? WHERE id=?').run(record.device,record.device?'ios-simulator':null,data,createHash('sha256').update(data).digest('hex'),record.allocationId);
    this.allocationOwner(db,record);
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
      if (!device || protectedDevices.has(device) || db.prepare("SELECT id FROM allocations WHERE platform='ios-simulator' AND device=?").get(device) || db.prepare("SELECT device FROM devices WHERE platform='ios-simulator' AND device=?").get(device)) {
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
      if (db.prepare("SELECT device FROM devices WHERE platform='ios-simulator' AND device=?").get(record.device)) {
        record.state = 'retained'; record.phase = 'terminal'; record.outcome = 'refused'; record.reason = 'ADMISSION_REFUSED'; this.saveAllocation(db, record);
        return { kind: 'refused', reason: 'ADMISSION_REFUSED' };
      }
      const attempt: AttemptIdentity = { kind: 'preparation', id: record.allocationId };
      const identity: OwnerIdentity = { category: 'ios-simulator', device: record.device, attempt, token: expected.token, generation: expected.generation, process: expected.process };
      db.prepare('INSERT INTO devices(platform,device,generation) VALUES (?,?,?)').run('ios-simulator',record.device,expected.generation);
      const ownerId=this.insertOwner(db,identity,record.allocationId);
      db.prepare("INSERT INTO attempts(kind,id,device,digest,intent,token,generation,pid,incarnation,state,platform,owner_generation_id) VALUES (?,?,?,?,?,?,?,?,?,'active',?,?)").run(...key(attempt),record.device,record.preparationDigest,JSON.stringify(record.preparation),expected.token,expected.generation,expected.process.pid,expected.process.incarnation,'ios-simulator',ownerId);
      db.prepare('UPDATE devices SET lease_generation_id=? WHERE platform=? AND device=?').run(ownerId,'ios-simulator',record.device);
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
  private deviceView(db: DatabaseSync, device: string, category: DeviceCategory='ios-simulator'): DeviceView | null {
    const row = db.prepare('SELECT * FROM device_state WHERE platform=? AND device=?').get(category,device) as Row | undefined;
    if (!row) return null;
    const attempt = row.token ? db.prepare('SELECT * FROM attempts WHERE kind=? AND id=?').get(row.kind, row.attempt_id) as Row | undefined : undefined;
    return { category: row.platform, device, state: row.state, generation: row.generation, owner: attempt ? owner(attempt) : null, reason: row.reason };
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
      db.prepare('UPDATE owner_generations SET dispatch_closed_at=? WHERE id=? AND dispatch_closed_at IS NULL').run(now,generationId(expected.token,expected.generation));
      this.saveAllocation(db,record);
      db.prepare('UPDATE devices SET generation=?,lease_generation_id=? WHERE platform=? AND device=?').run(record.owner.generation,generationId(record.owner.token,record.owner.generation),expected.category,expected.device); this.event(db, expected.attempt, 'parked'); return record;
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
      const device = db.prepare("SELECT * FROM device_state WHERE platform='ios-simulator' AND device=?").get(record.device!) as Row | undefined;
      if (!device || device.state !== 'active' || device.token !== null || device.generation !== record.owner.generation || record.cancellationRequested) throw new AdmissionError('STATE_UNAVAILABLE', 'Parked admission is inconsistent');
      const attempt: AttemptIdentity = { kind: 'observed', id: binding.actionId };
      const token = randomUUID(); const generation = record.owner.generation + 1;
      const identity: OwnerIdentity = { category: 'ios-simulator', device: record.device!, attempt, token, generation, process };
      record.owner = { allocationId: record.allocationId, token, generation, process };
      record.state = 'executing'; record.phase = 'action'; record.outcome = null;
      record.actionDigest = binding.actionDigest; record.actionRequest = binding.request;
      record.actionEvidence = { ...binding.evidence, observations: [], observationCount: 0, actionAttempted: false, actionAcknowledged: false, state: 'running', terminal: null, exportStatus: 'pending' };
      const ownerId=this.insertOwner(db,identity,record.allocationId);
      db.prepare("INSERT INTO attempts(kind,id,device,digest,intent,token,generation,pid,incarnation,state,platform,owner_generation_id) VALUES (?,?,?,?,?,?,?,?,?,'active',?,?)").run(...key(attempt),record.device,binding.actionDigest,JSON.stringify(binding.request),token,generation,process.pid,process.incarnation,'ios-simulator',ownerId);
      db.prepare('UPDATE devices SET generation=?,lease_generation_id=? WHERE platform=? AND device=?').run(generation,ownerId,'ios-simulator',record.device);
      this.saveAllocation(db, record); this.event(db, attempt, 'consumed'); return { kind: 'consumed', owner: identity, allocation: record };
    });
  }
  private retireReady(db: DatabaseSync, record: AllocationRecord, reason: 'READY_EXPIRED' | 'RETAINED_UNUSED'): void {
    record.state = 'retained'; record.phase = 'terminal'; record.outcome = 'retired_unused'; record.reason = reason;
    db.prepare("UPDATE devices SET lease_generation_id=NULL WHERE platform='ios-simulator' AND device=? AND generation=?").run(record.device,record.owner.generation);
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
  readAllocationCapacity(): AllocationCapacity {
    return this.read(db => {
      const capacity: AllocationCapacity = { heldAllocations: 0, reservedBytes: 0 };
      for (const row of db.prepare('SELECT id FROM allocations').all()) {
        const record = this.allocation(db, row.id as string);
        if (!record || typeof record.capacityHeld !== 'boolean' || !Number.isSafeInteger(record.reservationBytes) || record.reservationBytes <= 0) {
          throw new AdmissionError('STATE_UNAVAILABLE', 'Invalid allocation capacity record');
        }
        if (record.capacityHeld) {
          if (capacity.heldAllocations >= Number.MAX_SAFE_INTEGER || record.reservationBytes > Number.MAX_SAFE_INTEGER - capacity.reservedBytes) {
            throw new AdmissionError('STATE_UNAVAILABLE', 'Allocation capacity exceeds safe integer range');
          }
          capacity.heldAllocations++;
          capacity.reservedBytes += record.reservationBytes;
        }
      }
      return capacity;
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
        if (protectedDevices.has(input.source.udid) || db.prepare("SELECT id FROM allocations WHERE inventory_id=? OR (platform='ios-simulator' AND device=?)").get(input.source.inventoryId, input.source.udid)
          || db.prepare("SELECT device FROM devices WHERE platform='ios-simulator' AND device=?").get(input.source.udid)) return { kind: 'refused', reason: 'INVENTORY_INELIGIBLE' };
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
      db.prepare('INSERT INTO allocations(id,action_id,device,inventory_id,record,checksum,platform) VALUES (?,?,?,?,?,?,?)').run(allocationId,input.actionId,allocation.device,input.source.kind==='supplied'?input.source.inventoryId:null,data,createHash('sha256').update(data).digest('hex'),allocation.device?'ios-simulator':null);
      this.allocationOwner(db,allocation);
      this.event(db, { kind: 'preparation', id: allocationId }, 'reserved');
      return { kind: 'reserved', allocation };
    });
  }
  inspect(device: string, category: DeviceCategory='ios-simulator'): DeviceView | undefined { return this.read(db => this.deviceView(db, device,category) ?? undefined); }
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
      const id = randomUUID(); db.prepare("INSERT INTO commands(id,kind,attempt_id,token,generation,operation,state,platform,device,owner_generation_id,origin) VALUES (?,?,?,?,?,?,'outstanding',?,?,?,'legacy')").run(id,...key(expected.attempt),expected.token,expected.generation,operation,expected.category,expected.device,generationId(expected.token,expected.generation)); this.event(db, expected.attempt, 'authorized', { id, operation }); return id;
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
      if (existing?.state === 'terminal' && existing.platform===expected.category && existing.token === expected.token && existing.generation === expected.generation && existing.terminal === JSON.stringify(candidate)) return view(existing);
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
    db.prepare('UPDATE owner_generations SET dispatch_closed_at=? WHERE id=? AND dispatch_closed_at IS NULL').run(this.options.now?.()??Date.now(),row.owner_generation_id);
    if(candidate.disposition==='quarantined') db.prepare("INSERT INTO quarantines(id,platform,device,kind,cause,created_at,evidence) VALUES (?,?,?,'historical','uncertain',?,?)").run(randomUUID(),row.platform,row.device,this.options.now?.()??Date.now(),JSON.stringify({version:1,legacyLifecycle:true,token:row.token,generation:row.generation}));
    db.prepare('UPDATE devices SET lease_generation_id=NULL WHERE platform=? AND device=?').run(row.platform,row.device);
    this.event(db, { kind: row.kind, id: row.id }, 'terminal', candidate);
    return view({ ...row, state: 'terminal', terminal });
  }
  quarantineAbandoned(expected: OwnerIdentity, reason: string): boolean {
    return this.write('recover', db => { const row = this.owned(db, expected); this.terminal(db, row, { outcome: 'inconclusive', disposition: 'quarantined', payload: { reason }, evidenceRefs: [] }); return true; });
  }
}
