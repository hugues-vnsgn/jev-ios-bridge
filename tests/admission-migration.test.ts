import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Admission } from '../src/device/admission.js';
import { migrateAdmissionForTesting, type MigrationDeclaration } from '../src/device/admission-migration.js';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { runAdmissionMaintenance } from '../src/device/admission-maintenance.js';
import type { AllocationRecord } from '../src/device/admission-allocation.js';

/** Test-only historical disk format, compared with the pinned original writer before its retirement. */
class HistoricalJournalFixture {
  constructor(private readonly root: string) {}
  async begin(value: { deviceId: string; actionId: string; intent: unknown }) {
    const input = JSON.parse(JSON.stringify(value)) as typeof value;
    const directory = join(this.root, digest(input.deviceId));
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const put = (name: string, record: unknown) => writeFileSync(join(directory, name), JSON.stringify(record), { mode: 0o600, flag: 'wx' });
    put('claim.json', { ...input, token: randomUUID() });
    put(`${digest(input.actionId)}.intent.json`, { ...input, status: 'in-flight' });
    const finish = (status: 'completed' | 'uncertain', result: unknown) => {
      if (status === 'uncertain') put('quarantine.json', { deviceId: input.deviceId, reason: String(result) });
      put(`${digest(input.actionId)}.result.json`, { ...input, status,
        ...(status === 'completed' ? { result } : { reason: String(result) }) });
      unlinkSync(join(directory, 'claim.json'));
    };
    return { complete: async (result: unknown) => finish('completed', result), uncertain: async (reason: string) => finish('uncertain', reason) };
  }
}

const declaration: MigrationDeclaration = {
  version: 1, writersStopped: true, historicalRootsDeclaredOrExcluded: true,
  additionalJournalRoots: [], additionalLeaseRoots: [], excludedDevices: [],
};
const device = 'ABCDEF00-0000-4000-8000-000000000001';
const otherDevice = 'ABCDEF00-0000-4000-8000-000000000002';
const historicalResult = { status: 'outcome_observed', actionAttempted: true, actionAcknowledged: true, observations: 2 };
const digest = (value: string): string => createHash('sha256').update(value).digest('hex');
function journalDirectory(root: string, udid = device): string { return join(root, digest(udid)); }
function put(path: string, value: unknown): void { writeFileSync(path, JSON.stringify(value), { mode: 0o600 }); }
function fixture(t: TestContext) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'admission-migration-')));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const root = join(directory, 'admission');
  const options = { root, backend: 'fake' as const,
    defaultRoots: { journal: join(directory, 'journal'), leases: join(directory, 'leases') } };
  return { directory, root, options, open: () => Admission.forTesting({ root, backend: 'fake', initialize: false }) };
}

const upgradeDeclaration = { version: 1, kind: 'upgrade', from: 2, to: 3, writersStopped: true } as const;

function crashMaintenance(f: ReturnType<typeof fixture>, operation: 'upgrade' | 'recover', milestone: string): void {
  const child = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'),
    fileURLToPath(new URL('./fixtures/admission-migration/crash-worker.ts', import.meta.url)),
    f.root, f.options.defaultRoots.journal, f.options.defaultRoots.leases, milestone, operation], { encoding: 'utf8', timeout: 5000 });
  assert.equal(child.signal, 'SIGKILL', child.stderr);
  assert.equal(child.error, undefined, 'The child must reach the requested maintenance checkpoint before its deadline');
}

test('offline migration rerun refuses schema 2 without leaving its guard and permits upgrade', async t => {
  const f = fixture(t);
  migrateAdmissionForTesting(declaration, { ...f.options, schemaVersion: 2 });
  assert.throws(() => migrateAdmissionForTesting(declaration, f.options), { code: 'STATE_UNAVAILABLE' });
  assert.equal(existsSync(join(f.root, 'migration.lock')), false);
  const { upgradeAdmissionForTesting } = await import('../src/device/admission-upgrade.js');
  assert.equal(upgradeAdmissionForTesting(upgradeDeclaration, { root: f.root, backend: 'fake' }).to, 3);
});

for (const milestone of ['guarded', 'backupVerified']) {
  test(`offline schema upgrade death at ${milestone} recovers unchanged schema 2 and permits upgrade`, async t => {
    const f = fixture(t);
    migrateAdmissionForTesting(declaration, { ...f.options, schemaVersion: 2 });
    crashMaintenance(f, 'upgrade', milestone);
    const guard = JSON.parse(readFileSync(join(f.root, 'migration.lock'), 'utf8'));
    assert.equal(guard.backup === null, milestone === 'guarded');
    assert.throws(f.open, { code: 'STATE_UNAVAILABLE' });
    const { recoverAdmissionUpgradeForTesting, upgradeAdmissionForTesting } = await import('../src/device/admission-upgrade.js');
    const result = recoverAdmissionUpgradeForTesting(upgradeDeclaration, { root: f.root, backend: 'fake' });
    assert.deepEqual(result, { version: 1, kind: 'upgrade-recovery', guardToken: guard.token, schemaVersion: 2, receiptId: null });
    assert.equal(existsSync(join(f.root, 'migration.lock')), false);
    const recovered = new DatabaseSync(join(f.root, 'admission.sqlite'));
    try {
      assert.equal(recovered.prepare('SELECT schema_version FROM metadata').get()?.schema_version, 2);
      const events = recovered.prepare("SELECT attempt_id,event,detail FROM transitions WHERE kind='maintenance'").all();
      assert.equal(events.length, 1);
      assert.deepEqual({ ...events[0] }, { attempt_id: guard.token, event: 'upgrade-recovered', detail: JSON.stringify({ ...result, declarationDigest: guard.declarationDigest, installationId: guard.installationId }) });
    } finally { recovered.close(); }
    assert.equal(upgradeAdmissionForTesting(upgradeDeclaration, { root: f.root, backend: 'fake' }).to, 3);
  });
}

test('offline schema upgrade death before commit retains authority until checked clean-old recovery', async t => {
  const f = fixture(t);
  migrateAdmissionForTesting(declaration, { ...f.options, schemaVersion: 2 });
  crashMaintenance(f, 'upgrade', 'beforeCommit');
  const guard = readFileSync(join(f.root, 'migration.lock'), 'utf8');
  assert.throws(f.open, { code: 'STATE_UNAVAILABLE' });
  const { upgradeAdmissionForTesting, recoverAdmissionUpgradeForTesting } = await import('../src/device/admission-upgrade.js');
  assert.throws(() => upgradeAdmissionForTesting(upgradeDeclaration, { root: f.root, backend: 'fake' }), { code: 'STATE_UNAVAILABLE' });
  assert.equal(readFileSync(join(f.root, 'migration.lock'), 'utf8'), guard);
  const result = recoverAdmissionUpgradeForTesting(upgradeDeclaration, { root: f.root, backend: 'fake' });
  assert.deepEqual(result, { version: 1, kind: 'upgrade-recovery', guardToken: JSON.parse(guard).token, schemaVersion: 2, receiptId: null });
  assert.equal(existsSync(join(f.root, 'migration.lock')), false);
  const old = new DatabaseSync(join(f.root, 'admission.sqlite'));
  try {
    assert.equal(old.prepare('SELECT schema_version FROM metadata').get()?.schema_version, 2);
    assert.equal(old.prepare("SELECT count(*) AS count FROM transitions WHERE kind='maintenance'").get()?.count, 1);
  } finally { old.close(); }
  assert.equal(upgradeAdmissionForTesting(upgradeDeclaration, { root: f.root, backend: 'fake' }).to, 3);
});

test('offline schema upgrade death after commit recovers the matching receipt without another upgrade', async t => {
  const f = fixture(t);
  migrateAdmissionForTesting(declaration, { ...f.options, schemaVersion: 2 });
  crashMaintenance(f, 'upgrade', 'afterCommit');
  const guard = readFileSync(join(f.root, 'migration.lock'), 'utf8');
  assert.throws(f.open, { code: 'STATE_UNAVAILABLE' });
  const committed = new DatabaseSync(join(f.root, 'admission.sqlite'));
  let receiptId: string;
  try {
    assert.equal(committed.prepare('SELECT schema_version FROM metadata').get()?.schema_version, 3);
    receiptId = String(committed.prepare('SELECT id FROM upgrades').get()?.id);
    assert.equal(committed.prepare('SELECT count(*) AS count FROM upgrades').get()?.count, 1);
  } finally { committed.close(); }
  const { upgradeAdmissionForTesting, recoverAdmissionUpgradeForTesting } = await import('../src/device/admission-upgrade.js');
  const result = recoverAdmissionUpgradeForTesting(upgradeDeclaration, { root: f.root, backend: 'fake' });
  assert.deepEqual(result, { version: 1, kind: 'upgrade-recovery', guardToken: JSON.parse(guard).token, schemaVersion: 3, receiptId });
  assert.equal(existsSync(join(f.root, 'migration.lock')), false);
  assert.equal(upgradeAdmissionForTesting(upgradeDeclaration, { root: f.root, backend: 'fake' }).id, receiptId);
  const recovered = new DatabaseSync(join(f.root, 'admission.sqlite'));
  try {
    assert.equal(recovered.prepare('SELECT count(*) AS count FROM upgrades').get()?.count, 1);
    assert.equal(recovered.prepare("SELECT count(*) AS count FROM transitions WHERE kind='maintenance'").get()?.count, 1);
  } finally { recovered.close(); }
});

test('offline schema clean-old recovery retries its own committed maintenance event exactly once', async t => {
  const f = fixture(t);
  migrateAdmissionForTesting(declaration, { ...f.options, schemaVersion: 2 });
  crashMaintenance(f, 'upgrade', 'beforeCommit');
  const guard = readFileSync(join(f.root, 'migration.lock'), 'utf8');
  crashMaintenance(f, 'recover', 'recoveryCommitted');
  assert.equal(readFileSync(join(f.root, 'migration.lock'), 'utf8'), guard);
  const interrupted = new DatabaseSync(join(f.root, 'admission.sqlite'));
  let event: Record<string, unknown>;
  try {
    event = { ...interrupted.prepare("SELECT * FROM transitions WHERE kind='maintenance'").get() };
    assert.equal(event.attempt_id, JSON.parse(guard).token);
    assert.equal(interrupted.prepare("SELECT count(*) AS count FROM transitions WHERE kind='maintenance'").get()?.count, 1);
  } finally { interrupted.close(); }
  const { recoverAdmissionUpgradeForTesting } = await import('../src/device/admission-upgrade.js');
  assert.deepEqual(recoverAdmissionUpgradeForTesting(upgradeDeclaration, { root: f.root, backend: 'fake' }),
    { version: 1, kind: 'upgrade-recovery', guardToken: JSON.parse(guard).token, schemaVersion: 2, receiptId: null });
  const recovered = new DatabaseSync(join(f.root, 'admission.sqlite'));
  try {
    assert.deepEqual({ ...recovered.prepare("SELECT * FROM transitions WHERE kind='maintenance'").get() }, event);
    assert.equal(recovered.prepare("SELECT count(*) AS count FROM transitions WHERE kind='maintenance'").get()?.count, 1);
  } finally { recovered.close(); }
  assert.equal(existsSync(join(f.root, 'migration.lock')), false);
});

test('offline schema clean-new recovery retries before guard removal without changing the receipt', async t => {
  const f = fixture(t);
  migrateAdmissionForTesting(declaration, { ...f.options, schemaVersion: 2 });
  crashMaintenance(f, 'upgrade', 'afterCommit');
  const guard = readFileSync(join(f.root, 'migration.lock'), 'utf8');
  crashMaintenance(f, 'recover', 'beforeGuardRemoval');
  assert.equal(readFileSync(join(f.root, 'migration.lock'), 'utf8'), guard);
  const interrupted = new DatabaseSync(join(f.root, 'admission.sqlite'));
  let receipt: Record<string, unknown>;
  let event: Record<string, unknown>;
  try {
    receipt = { ...interrupted.prepare('SELECT * FROM upgrades').get() };
    event = { ...interrupted.prepare("SELECT * FROM transitions WHERE kind='maintenance'").get() };
  } finally { interrupted.close(); }
  const { recoverAdmissionUpgradeForTesting } = await import('../src/device/admission-upgrade.js');
  assert.deepEqual(recoverAdmissionUpgradeForTesting(upgradeDeclaration, { root: f.root, backend: 'fake' }),
    { version: 1, kind: 'upgrade-recovery', guardToken: JSON.parse(guard).token, schemaVersion: 3, receiptId: receipt.id });
  const recovered = new DatabaseSync(join(f.root, 'admission.sqlite'));
  try {
    assert.deepEqual({ ...recovered.prepare('SELECT * FROM upgrades').get() }, receipt);
    assert.deepEqual({ ...recovered.prepare("SELECT * FROM transitions WHERE kind='maintenance'").get() }, event);
    assert.equal(recovered.prepare("SELECT count(*) AS count FROM transitions WHERE kind='maintenance'").get()?.count, 1);
  } finally { recovered.close(); }
  assert.equal(existsSync(join(f.root, 'migration.lock')), false);
});

test('offline schema recovery refuses another committed event after its own recovery and retains the guard', async t => {
  const f = fixture(t);
  migrateAdmissionForTesting(declaration, { ...f.options, schemaVersion: 2 });
  crashMaintenance(f, 'upgrade', 'beforeCommit');
  crashMaintenance(f, 'recover', 'recoveryCommitted');
  const guard = readFileSync(join(f.root, 'migration.lock'), 'utf8');
  const changed = new DatabaseSync(join(f.root, 'admission.sqlite'));
  try {
    changed.prepare("INSERT INTO transitions(kind,attempt_id,event,detail,time) VALUES ('maintenance','another-token','unrelated-event','{}',1)").run();
  } finally { changed.close(); }
  const { recoverAdmissionUpgradeForTesting } = await import('../src/device/admission-upgrade.js');
  assert.throws(() => recoverAdmissionUpgradeForTesting(upgradeDeclaration, { root: f.root, backend: 'fake' }), { code: 'STATE_UNAVAILABLE' });
  assert.equal(readFileSync(join(f.root, 'migration.lock'), 'utf8'), guard);
  const refused = new DatabaseSync(join(f.root, 'admission.sqlite'));
  try {
    assert.equal(refused.prepare('SELECT schema_version FROM metadata').get()?.schema_version, 2);
    assert.equal(refused.prepare("SELECT count(*) AS count FROM transitions WHERE kind='maintenance'").get()?.count, 2);
  } finally { refused.close(); }
});

test('offline schema openers refuse older and newer versions without changing the stored version', t => {
  for (const actualVersion of [2, 4]) {
    const f = fixture(t);
    migrateAdmissionForTesting(declaration, { ...f.options, schemaVersion: actualVersion === 2 ? 2 : 3 });
    if (actualVersion === 4) {
      const future = new DatabaseSync(join(f.root, 'admission.sqlite'));
      try { future.exec('UPDATE metadata SET schema_version=4'); } finally { future.close(); }
    }
    assert.throws(f.open, error => {
      assert.ok(error instanceof Error);
      assert.equal('code' in error && error.code, 'STATE_UNAVAILABLE');
      assert.match(error.message, new RegExp(`schema.*${actualVersion}.*(?:expected|requires).*3`, 'i'));
      assert.match(error.message, /admission-maintenance upgrade/);
      return true;
    });
    const unchanged = new DatabaseSync(join(f.root, 'admission.sqlite'));
    try { assert.equal(unchanged.prepare('SELECT schema_version FROM metadata').get()?.schema_version, actualVersion); }
    finally { unchanged.close(); }
  }
});

test('offline schema upgrade preserves terminal strings and command dispositions without inventing stop evidence', async t => {
  const f = fixture(t);
  migrateAdmissionForTesting(declaration, { ...f.options, schemaVersion: 2 });
  const intent = '{ "tap": "original-selector", "order": [2, 1] }';
  const terminal = '{ "outcome": "completed", "disposition": "available", "payload": { "original": true }, "evidenceRefs": [] }';
  const detail = '{ "original": "spacing remains" }';
  const old = new DatabaseSync(join(f.root, 'admission.sqlite'));
  try {
    old.prepare("INSERT INTO devices(device,state,generation) VALUES (?,'available',2)").run(device);
    old.prepare("INSERT INTO devices(device,state,generation,reason) VALUES (?,'quarantined',3,'historical-cause')").run(otherDevice);
    old.prepare("INSERT INTO attempts(kind,id,device,digest,intent,token,generation,pid,incarnation,state,cancelled,attached,terminal) VALUES ('legacy','terminal-upgrade',?,'original-digest',?,'terminal-token',2,?,'original-incarnation','terminal',1,1,?)").run(device, intent, process.pid, terminal);
    for (const state of ['outstanding', 'settled', 'uncertain']) {
      old.prepare("INSERT INTO commands VALUES (?,'legacy','terminal-upgrade','terminal-token',2,'capture',?)").run(`command-${state}`, state);
    }
    old.prepare("INSERT INTO transitions(sequence,kind,attempt_id,event,detail,time) VALUES (42,'legacy','terminal-upgrade','original-event',?,123)").run(detail);
  } finally { old.close(); }
  const { upgradeAdmissionForTesting } = await import('../src/device/admission-upgrade.js');
  const receipt = upgradeAdmissionForTesting(upgradeDeclaration, { root: f.root, backend: 'fake', now: () => 456 });
  assert.deepEqual(receipt.preserved.before, receipt.preserved.after);
  assert.equal(receipt.preserved.after.attempts?.count, 1);
  assert.equal(receipt.preserved.after.commands?.count, 3);
  assert.deepEqual(receipt.quarantines, { historical: 1, exclusion: 4 });
  const upgraded = new DatabaseSync(join(f.root, 'admission.sqlite'));
  try {
    assert.deepEqual({ ...upgraded.prepare('SELECT intent,terminal,digest,cancelled,attached FROM attempts WHERE id=?').get('terminal-upgrade') },
      { intent, terminal, digest: 'original-digest', cancelled: 1, attached: 1 });
    assert.deepEqual(upgraded.prepare('SELECT id,state,operation,origin,component_id,request_id,request_digest FROM commands ORDER BY id').all().map(row => ({ ...row })),
      ['outstanding', 'settled', 'uncertain'].map(state => ({ id: `command-${state}`, state, operation: 'capture', origin: 'legacy', component_id: null, request_id: null, request_digest: null })));
    assert.deepEqual({ ...upgraded.prepare('SELECT sequence,event,detail,time FROM transitions WHERE sequence=42').get() },
      { sequence: 42, event: 'original-event', detail, time: 123 });
    assert.deepEqual({ ...upgraded.prepare('SELECT inventory_unknown_reason FROM owner_generations WHERE token=?').get('terminal-token') },
      { inventory_unknown_reason: 'schema2-inventory' });
    assert.deepEqual({ ...upgraded.prepare('SELECT kind,cause,created_at FROM quarantines WHERE device=?').get(otherDevice) },
      { kind: 'historical', cause: 'historical-cause', created_at: 456 });
    for (const table of ['components', 'component_observations', 'fence_receipts', 'recovery_claims']) {
      assert.equal(upgraded.prepare(`SELECT count(*) AS count FROM ${table}`).get()?.count, 0);
    }
  } finally { upgraded.close(); }
  assert.deepEqual(f.open().inspect(device), { category: 'ios-simulator', device, state: 'available', generation: 2, owner: null, reason: null });
  assert.equal(f.open().inspect(otherDevice)?.state, 'quarantined');
});

test('offline schema SQL constraints preserve authority bindings and permit only one command disposition', async t => {
  const f = fixture(t);
  const journal = new HistoricalJournalFixture(f.options.defaultRoots.journal);
  await (await journal.begin({ deviceId: device, actionId: 'immutable-import', intent: {} })).complete(historicalResult);
  migrateAdmissionForTesting(declaration, { ...f.options, schemaVersion: 2 });
  const old = new DatabaseSync(join(f.root, 'admission.sqlite'));
  try {
    old.prepare('UPDATE devices SET generation=2 WHERE device=?').run(device);
    old.prepare("INSERT INTO attempts(kind,id,device,digest,intent,token,generation,pid,incarnation,state,terminal) VALUES ('legacy','immutable-attempt',?,'original','{}','immutable-token',2,?,'fixture','terminal',?)").run(device, process.pid, '{"outcome":"completed"}');
    old.exec("INSERT INTO commands VALUES ('immutable-command','legacy','immutable-attempt','immutable-token',2,'capture','outstanding')");
    old.exec("INSERT INTO transitions VALUES (1,'legacy','immutable-attempt','original','{}',1)");
  } finally { old.close(); }
  const { upgradeAdmissionForTesting } = await import('../src/device/admission-upgrade.js');
  upgradeAdmissionForTesting(upgradeDeclaration, { root: f.root, backend: 'fake', now: () => 100 });
  const db = new DatabaseSync(join(f.root, 'admission.sqlite'));
  try {
    db.exec('PRAGMA foreign_keys=ON');
    const refused: [string, string][] = [
      ['metadata', "UPDATE metadata SET migration_manifest='{}'"],
      ['metadata', 'UPDATE metadata SET schema_version=5'],
      ['metadata', 'UPDATE metadata SET schema_version=2'],
      ['metadata', 'DELETE FROM metadata'],
      ['devices', `UPDATE devices SET device='different' WHERE device='${device}'`],
      ['devices', `UPDATE devices SET generation=1 WHERE device='${device}'`],
      ['devices', `DELETE FROM devices WHERE device='${device}'`],
      ['attempts', "UPDATE attempts SET intent='{\"changed\":true}' WHERE id='immutable-attempt'"],
      ['attempts', "UPDATE attempts SET terminal='{\"outcome\":\"inconclusive\"}' WHERE id='immutable-attempt'"],
      ['attempts', "DELETE FROM attempts WHERE id='immutable-attempt'"],
      ['commands', "UPDATE commands SET operation='tap' WHERE id='immutable-command'"],
      ['commands', "DELETE FROM commands WHERE id='immutable-command'"],
      ['owner_generations', "UPDATE owner_generations SET token='replacement' WHERE token='immutable-token'"],
      ['owner_generations', "UPDATE owner_generations SET inventory_unknown_reason=NULL WHERE token='immutable-token'"],
      ['owner_generations', "UPDATE owner_generations SET dispatch_closed_at=101 WHERE token='immutable-token'"],
      ['owner_generations', "DELETE FROM owner_generations WHERE token='immutable-token'"],
      ['imported_actions', 'UPDATE imported_actions SET record=record'],
      ['imported_actions', 'DELETE FROM imported_actions'],
      ['upgrades', 'UPDATE upgrades SET time=time'],
      ['upgrades', 'DELETE FROM upgrades'],
      ['transitions', 'UPDATE transitions SET detail=detail'],
      ['transitions', 'DELETE FROM transitions'],
      ['quarantines', 'UPDATE quarantines SET cause=\'changed\''],
      ['quarantines', 'DELETE FROM quarantines'],
    ];
    for (const [table, statement] of refused) {
      const before = db.prepare(`SELECT * FROM ${table}`).all();
      assert.ok(before.length > 0, `${table} must contain the authoritative row under test`);
      assert.throws(() => db.exec(statement), Error, statement);
      assert.deepEqual(db.prepare(`SELECT * FROM ${table}`).all(), before, statement);
    }
    db.exec("UPDATE commands SET state='settled' WHERE id='immutable-command'");
    assert.equal(db.prepare("SELECT state FROM commands WHERE id='immutable-command'").get()?.state, 'settled');
    assert.throws(() => db.exec("UPDATE commands SET state='uncertain' WHERE id='immutable-command'"), Error);
    assert.equal(db.prepare("SELECT state FROM commands WHERE id='immutable-command'").get()?.state, 'settled');
    db.prepare('UPDATE devices SET generation=3 WHERE device=?').run(device);
    assert.equal(db.prepare('SELECT generation FROM devices WHERE device=?').get(device)?.generation, 3);
    db.exec('UPDATE metadata SET schema_version=4');
    assert.equal(db.prepare('SELECT schema_version FROM metadata').get()?.schema_version, 4);
  } finally { db.close(); }
});

function releaseSchemaFixture(t: TestContext): DatabaseSync {
  const f = fixture(t);
  migrateAdmissionForTesting(declaration, f.options);
  const db = new DatabaseSync(join(f.root, 'admission.sqlite'));
  t.after(() => db.close());
  db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
  const generations: [string, string][] = [['generation-a', device], ['generation-b', otherDevice]];
  for (const [id, target] of generations) {
    db.prepare("INSERT INTO devices(platform,device,generation,attributes) VALUES ('ios-simulator',?,1,'{}')").run(target);
    db.prepare("INSERT INTO owner_generations(id,owner_kind,platform,device,attempt_kind,attempt_id,token,generation,pid,incarnation) VALUES (?,'device','ios-simulator',?,'legacy',?,?,1,?,'fixture')").run(id, target, id, `${id}-token`, process.pid);
    db.prepare("INSERT INTO attempts(kind,id,platform,device,digest,intent,owner_generation_id,token,generation,pid,incarnation,state) VALUES ('legacy',?,'ios-simulator',?,'fixture','{}',?,?,1,?,'fixture','active')").run(id, target, id, `${id}-token`, process.pid);
  }
  db.exec('COMMIT');
  return db;
}

test('offline schema recovery claims close once and retry without accepting another generation receipt', t => {
  const db = releaseSchemaFixture(t);
  const receipt = db.prepare("INSERT INTO fence_receipts(id,owner_generation_id,platform,device,request_id,request_digest,kind,accepted_at,payload) VALUES (?,?,'ios-simulator',?,? ,?,'stop',1,'{\"version\":1}')");
  receipt.run('receipt-a', 'generation-a', device, 'stop-a', 'a'.repeat(64));
  receipt.run('receipt-b', 'generation-b', otherDevice, 'stop-b', 'b'.repeat(64));
  const claim = (id: string) => db.prepare("INSERT INTO recovery_claims(id,owner_generation_id,platform,device,claimant_token,claimant_process,request_id,request_digest,created_at) VALUES (?,'generation-a','ios-simulator',?,?,'{\"pid\":1,\"incarnation\":\"fixture\"}',?,?,1)").run(id, device, `${id}-token`, id, 'c'.repeat(64));
  claim('claim-1');
  assert.throws(() => claim('claim-2'), /UNIQUE/);
  db.exec("UPDATE recovery_claims SET closed_at=2,closure='refused' WHERE id='claim-1'");
  assert.throws(() => db.exec("UPDATE recovery_claims SET closure='abandoned' WHERE id='claim-1'"), /immutable/);
  claim('claim-2');
  assert.throws(() => db.exec("UPDATE recovery_claims SET closed_at=3,closure='accepted',accepted_receipt_id='receipt-b' WHERE id='claim-2'"), /FOREIGN KEY/);
  assert.deepEqual({ ...db.prepare("SELECT closed_at,closure,accepted_receipt_id FROM recovery_claims WHERE id='claim-2'").get() },
    { closed_at: null, closure: null, accepted_receipt_id: null });
  db.exec("UPDATE recovery_claims SET closed_at=3,closure='accepted',accepted_receipt_id='receipt-a' WHERE id='claim-2'");
  claim('claim-3');
  assert.throws(() => db.exec("UPDATE recovery_claims SET closed_at=4,closure='accepted',accepted_receipt_id='receipt-a' WHERE id='claim-3'"), /UNIQUE/);
  db.exec("UPDATE recovery_claims SET closed_at=4,closure='abandoned' WHERE id='claim-3'");
  assert.throws(() => db.exec("DELETE FROM recovery_claims WHERE id='claim-1'"), /Cannot delete/);
  assert.deepEqual(db.prepare('SELECT id,closure,accepted_receipt_id FROM recovery_claims ORDER BY id').all().map(row => ({ ...row })),
    [{ id: 'claim-1', closure: 'refused', accepted_receipt_id: null },
      { id: 'claim-2', closure: 'accepted', accepted_receipt_id: 'receipt-a' },
      { id: 'claim-3', closure: 'abandoned', accepted_receipt_id: null }]);
});

test('offline schema component target must match its owner generation', t => {
  const db = releaseSchemaFixture(t);
  const component = db.prepare("INSERT INTO components(id,owner_generation_id,platform,device,kind,declaration,registered_at) VALUES (?,'generation-a','ios-simulator',?,'fixture','{\"version\":1}',1)");
  component.run('matching-component', device);
  assert.throws(() => component.run('wrong-device-component', otherDevice), Error);
  assert.deepEqual(db.prepare('SELECT id,device FROM components').all().map(row => ({ ...row })),
    [{ id: 'matching-component', device }]);
});

for (const kind of ['native', 'historical', 'exclusion']) {
  test(`offline schema refuses an already covered ${kind} quarantine on insert`, t => {
    const db = releaseSchemaFixture(t);
    db.prepare("INSERT INTO fence_receipts VALUES ('receipt-a','generation-a','ios-simulator',?,'stop-a',?,'stop',1,'{}')").run(device, 'a'.repeat(64));
    const before = db.prepare('SELECT * FROM quarantines ORDER BY id').all();
    assert.throws(() => db.prepare('INSERT INTO quarantines(id,platform,device,kind,cause,created_at,owner_generation_id,evidence,covering_receipt_id) VALUES (?,\'ios-simulator\',?,?,\'fixture\',1,?,\'{}\',?)')
      .run(`precovered-${kind}`, device, kind, kind === 'native' ? 'generation-a' : null, kind === 'native' ? 'receipt-a' : 'nonexistent-receipt'), /Quarantine must start uncovered/);
    assert.deepEqual(db.prepare('SELECT * FROM quarantines ORDER BY id').all(), before);
    assert.equal(db.prepare('SELECT state FROM device_state WHERE device=?').get(device)?.state, 'available');
  });
}

test('offline schema CHECK forbids covered non-native quarantines even without the insert trigger', t => {
  const db = releaseSchemaFixture(t);
  db.exec('DROP TRIGGER quarantines_start_uncovered');
  for (const kind of ['historical', 'exclusion']) {
    assert.throws(() => db.prepare("INSERT INTO quarantines(id,platform,device,kind,cause,created_at,evidence,covering_receipt_id) VALUES (?,'ios-simulator',?,?,'fixture',1,'{}','nonexistent-receipt')")
      .run(`precovered-${kind}`, device, kind), /CHECK constraint failed/);
  }
  assert.equal(db.prepare('SELECT count(*) AS count FROM quarantines WHERE device=?').get(device)?.count, 0);
});

test('offline schema stop receipt membership binds one generation and seals on receipt insertion', t => {
  const db = releaseSchemaFixture(t);
  const component = db.prepare("INSERT INTO components(id,owner_generation_id,platform,device,kind,declaration,registered_at) VALUES (?,?,'ios-simulator',?,'fixture','{\"version\":1}',1)");
  component.run('component-a', 'generation-a', device);
  component.run('component-extra', 'generation-a', device);
  component.run('component-b', 'generation-b', otherDevice);
  const command = db.prepare("INSERT INTO commands(id,kind,attempt_id,token,generation,operation,state,platform,device,owner_generation_id,component_id,origin,request_id,request_digest) VALUES (?,'legacy',?,?,1,'capture','uncertain','ios-simulator',?,?,?,'native',?,?)");
  command.run('command-a', 'generation-a', 'generation-a-token', device, 'generation-a', 'component-a', 'command-request-a', 'a'.repeat(64));
  command.run('command-b', 'generation-b', 'generation-b-token', otherDevice, 'generation-b', 'component-b', 'command-request-b', 'b'.repeat(64));
  const member = db.prepare("INSERT INTO fence_components VALUES (?,'generation-a',?,'{\"version\":1}')");
  assert.throws(() => member.run('wrong-owner-receipt', 'component-b'), /FOREIGN KEY/);
  db.exec('BEGIN IMMEDIATE');
  member.run('uncommitted-receipt', 'component-a');
  assert.throws(() => db.exec("INSERT INTO fence_commands VALUES ('uncommitted-receipt','generation-a','command-b','component-a')"), /FOREIGN KEY/);
  db.exec('ROLLBACK');
  db.exec('BEGIN IMMEDIATE');
  member.run('receipt-a', 'component-a');
  db.exec("INSERT INTO fence_commands VALUES ('receipt-a','generation-a','command-a','component-a')");
  const receipt = db.prepare("INSERT INTO fence_receipts VALUES (?,'generation-a','ios-simulator',?,?,?,'stop',2,'{\"version\":1}')");
  receipt.run('receipt-a', device, 'stop-request-a', 'a'.repeat(64));
  db.exec('COMMIT');
  assert.throws(() => member.run('receipt-a', 'component-extra'), /sealed/);
  assert.throws(() => db.exec("UPDATE fence_components SET evidence='{}' WHERE receipt_id='receipt-a'"), /Immutable/);
  assert.throws(() => db.exec("DELETE FROM fence_commands WHERE receipt_id='receipt-a'"), /Immutable/);
  assert.throws(() => receipt.run('second-stop', device, 'another-request', 'b'.repeat(64)), /UNIQUE/);
  assert.throws(() => receipt.run('wrong-device', otherDevice, 'different-request', 'c'.repeat(64)), /another device/);
  assert.deepEqual(db.prepare('SELECT receipt_id,component_id FROM fence_components').all().map(row => ({ ...row })),
    [{ receipt_id: 'receipt-a', component_id: 'component-a' }]);
  assert.deepEqual(db.prepare('SELECT receipt_id,command_id FROM fence_commands').all().map(row => ({ ...row })),
    [{ receipt_id: 'receipt-a', command_id: 'command-a' }]);
  db.exec("INSERT INTO quarantines(id,platform,device,kind,cause,created_at,owner_generation_id,evidence) VALUES ('native-a','ios-simulator','" + device + "','native','fixture',1,'generation-a','{\"version\":1}')");
  assert.throws(() => db.exec("INSERT INTO quarantines(id,platform,device,kind,cause,created_at,owner_generation_id,evidence) VALUES ('duplicate-native','ios-simulator','" + device + "','native','fixture',1,'generation-a','{\"version\":1}')"), /UNIQUE/);
  db.exec("UPDATE quarantines SET covering_receipt_id='receipt-a' WHERE id='native-a'");
  assert.throws(() => db.exec("UPDATE quarantines SET covering_receipt_id=NULL WHERE id='native-a'"), /cannot be covered/);
  assert.equal(db.prepare("SELECT covering_receipt_id FROM quarantines WHERE id='native-a'").get()?.covering_receipt_id, 'receipt-a');
});

test('offline schema upgrade preserves parked allocations and the host unknown-creation guard', async t => {
  const f = fixture(t);
  migrateAdmissionForTesting(declaration, { ...f.options, schemaVersion: 2 });
  const allocationId = 'ABCDEF00-0000-4000-8000-000000000010';
  const unknownId = 'ABCDEF00-0000-4000-8000-000000000011';
  const hash = 'a'.repeat(64);
  const parked: AllocationRecord = {
    allocationId, actionId: 'parked-upgrade', preparationDigest: hash, preparation: { version: 1, actionId: 'parked-upgrade' },
    appBundleId: 'dev.fixture', source: { kind: 'create', deviceTypeId: 'fixture-device', runtimeId: 'fixture-runtime' },
    inspectedContentDigest: hash, artifactBytes: 100, configVersion: 1, configDigest: hash,
    budgets: { maxRetainedAllocations: 8, maxConcurrentPreparations: 2, reservationBytesPerAllocation: 800, maxReservedBytes: 6400,
      minFreeBytes: 2000, maxArtifactBytes: 200, createTimeoutMs: 60000, bootTimeoutMs: 120000, installTimeoutMs: 120000,
      launchTimeoutMs: 30000, readinessTimeoutMs: 30000, readyTtlMs: 300000, timeoutMs: 360000 },
    evidenceDirectory: '/isolated/evidence/parked', intendedName: `jev-observed-${allocationId}`,
    staged: { stagedPath: '/isolated/staged/Fixture.app', contentDigest: hash, bytes: 100, maxBytes: 200,
      metadata: { bundleId: 'dev.fixture', executable: 'Fixture', architecture: 'arm64', minimumOSVersion: '27.0', build: { id: 'build', origin: 'fixture' } } },
    device, creationReceipt: { status: 'created', udid: device, provenance: { kind: 'simctl-create', allocationId,
      name: `jev-observed-${allocationId}`, deviceTypeId: 'fixture-device', runtimeId: 'fixture-runtime' } },
    actionDigest: null, actionRequest: null, state: 'ready', phase: 'parked', reason: null, outcome: 'prepared',
    capacityHeld: true, reservationBytes: 800, cancellationRequested: false,
    owner: { allocationId, token: 'parked-token', generation: 2, process: { pid: 0, incarnation: 'parked' } },
    createdAt: 100, readyAt: 200, expiresAt: 300200, readinessEvidence: ['/isolated/readiness.json'],
    evidenceRefs: ['/isolated/preparation.json'], actionEvidence: null, hostCreationBlocked: false,
  };
  const unknown: AllocationRecord = { ...parked, allocationId: unknownId, actionId: 'unknown-upgrade',
    preparation: { version: 1, actionId: 'unknown-upgrade' }, intendedName: `jev-observed-${unknownId}`,
    device: null, creationReceipt: null, state: 'preparing', phase: 'creating', outcome: null,
    owner: { allocationId: unknownId, token: 'unknown-token', generation: 1, process: { pid: process.pid, incarnation: 'fixture' } },
    readyAt: null, expiresAt: null, readinessEvidence: [], evidenceRefs: [] };
  const recordStrings = [parked, unknown].map(record => JSON.stringify(record, null, 2));
  const old = new DatabaseSync(join(f.root, 'admission.sqlite'));
  try {
    old.prepare("INSERT INTO devices(device,state,generation) VALUES (?,'active',2)").run(device);
    old.prepare("INSERT INTO attempts(kind,id,device,digest,intent,token,generation,pid,incarnation,state) VALUES ('preparation',?,?,?,'{}','preparation-token',1,?,'fixture','parked')").run(allocationId, device, hash, process.pid);
    for (const [index, record] of [parked, unknown].entries()) {
      const text = recordStrings[index]!;
      old.prepare('INSERT INTO allocations VALUES (?,?,?,NULL,?,?)').run(record.allocationId, record.actionId, record.device, text, digest(text));
    }
    old.prepare('INSERT INTO unknown_creation VALUES (1,?)').run(unknownId);
  } finally { old.close(); }
  const { upgradeAdmissionForTesting } = await import('../src/device/admission-upgrade.js');
  const receipt = upgradeAdmissionForTesting(upgradeDeclaration, { root: f.root, backend: 'fake', now: () => 250 });
  assert.deepEqual(receipt.preserved.before, receipt.preserved.after);
  assert.equal(receipt.preserved.after.allocations?.count, 2);
  assert.equal(receipt.preserved.after.unknown_creation?.count, 1);
  assert.deepEqual(f.open().readAllocation(allocationId.toLowerCase()), { ...parked, hostCreationBlocked: true });
  assert.deepEqual(f.open().readAllocation(unknownId), { ...unknown, hostCreationBlocked: true });
  assert.deepEqual(f.open().acquire({ device: otherDevice, attempt: { kind: 'legacy', id: 'blocked-after-upgrade' }, digest: hash, intent: {} }),
    { kind: 'refused', reason: 'HOST_CREATION_UNRESOLVED', blockingAllocationId: unknownId });
  const upgraded = new DatabaseSync(join(f.root, 'admission.sqlite'));
  try {
    assert.deepEqual(upgraded.prepare('SELECT record,checksum FROM allocations ORDER BY id').all().map(row => ({ ...row })),
      recordStrings.map(record => ({ record, checksum: digest(record) })));
    assert.deepEqual(upgraded.prepare('SELECT token,owner_kind,inventory_unknown_reason,dispatch_closed_at FROM owner_generations ORDER BY token').all().map(row => ({ ...row })),
      [{ token: 'parked-token', owner_kind: 'parked', inventory_unknown_reason: null, dispatch_closed_at: 250 },
        { token: 'preparation-token', owner_kind: 'device', inventory_unknown_reason: 'schema2-inventory', dispatch_closed_at: 250 },
        { token: 'unknown-token', owner_kind: 'allocation', inventory_unknown_reason: 'schema2-inventory', dispatch_closed_at: null }]);
    assert.equal(upgraded.prepare('SELECT count(*) AS count FROM components').get()?.count, 0);
    assert.deepEqual({ ...upgraded.prepare('SELECT singleton,allocation_id FROM unknown_creation').get() }, { singleton: 1, allocation_id: unknownId });
  } finally { upgraded.close(); }
});

test('offline schema upgrade refuses active attempt identities without settling or changing them', async t => {
  const f = fixture(t);
  migrateAdmissionForTesting(declaration, { ...f.options, schemaVersion: 2 });
  const db = new DatabaseSync(join(f.root, 'admission.sqlite'));
  try {
    db.prepare("INSERT INTO devices(device,state,generation,token,kind,attempt_id) VALUES (?,'active',1,'active-token','observed','active-upgrade')").run(device);
    db.prepare("INSERT INTO attempts(kind,id,device,digest,intent,token,generation,pid,incarnation,state) VALUES ('observed','active-upgrade',?,'original-digest','{}','active-token',1,?,'fixture-incarnation','active')").run(device, process.pid);
  } finally { db.close(); }
  const { upgradeAdmissionForTesting } = await import('../src/device/admission-upgrade.js');
  assert.throws(() => upgradeAdmissionForTesting(upgradeDeclaration, { root: f.root, backend: 'fake' }), error => {
    assert.ok(error instanceof Error);
    assert.equal('code' in error && error.code, 'UPGRADE_BLOCKED');
    assert.match(error.message, /observed.*active-upgrade/);
    return true;
  });
  const unchanged = new DatabaseSync(join(f.root, 'admission.sqlite'));
  try {
    assert.equal(unchanged.prepare('SELECT schema_version FROM metadata').get()?.schema_version, 2);
    assert.deepEqual({ ...unchanged.prepare('SELECT state,terminal,token FROM attempts WHERE id=?').get('active-upgrade') },
      { state: 'active', terminal: null, token: 'active-token' });
    assert.equal(unchanged.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name='upgrades'").get()?.count, 0);
  } finally { unchanged.close(); }
});

test('offline schema 2 upgrade preserves imported records, original strings and verified private backup on retry', async t => {
  const f = fixture(t);
  const journal = new HistoricalJournalFixture(f.options.defaultRoots.journal);
  await (await journal.begin({ deviceId: device.toLowerCase(), actionId: 'preserved-import', intent: { tap: 'original-selector' } })).complete(historicalResult);
  const migration = migrateAdmissionForTesting(declaration, { ...f.options, schemaVersion: 2 });
  const originalMarker = readFileSync(join(f.root, 'installation.json'));
  const original = new DatabaseSync(join(f.root, 'admission.sqlite'));
  let importedRecord: string;
  let originalManifest: string;
  try {
    assert.equal(original.prepare('SELECT schema_version FROM metadata').get()?.schema_version, 2);
    importedRecord = String(original.prepare('SELECT record FROM imported_actions WHERE id=?').get('preserved-import')?.record);
    originalManifest = String(original.prepare('SELECT migration_manifest FROM metadata').get()?.migration_manifest);
  } finally { original.close(); }
  rmSync(f.options.defaultRoots.journal, { recursive: true });
  const { upgradeAdmissionForTesting } = await import('../src/device/admission-upgrade.js');
  const receipt = upgradeAdmissionForTesting(upgradeDeclaration, { root: f.root, backend: 'fake', now: () => 1720000000000 });
  assert.equal(receipt.kind, 'upgrade');
  assert.equal(receipt.from, 2);
  assert.equal(receipt.to, 3);
  assert.deepEqual(receipt.declaration, upgradeDeclaration);
  assert.deepEqual(receipt.preserved.after, receipt.preserved.before);
  assert.equal(receipt.preserved.before.imported_actions?.count, 1);
  assert.match(receipt.preserved.before.imported_actions?.digest ?? '', /^[0-9a-f]{64}$/);
  assert.deepEqual(f.open().readImportedAction('preserved-import'), JSON.parse(importedRecord));
  assert.deepEqual(f.open().activation(), migration);
  const upgraded = new DatabaseSync(join(f.root, 'admission.sqlite'));
  try {
    assert.equal(upgraded.prepare('SELECT schema_version FROM metadata').get()?.schema_version, 3);
    assert.equal(upgraded.prepare('SELECT record FROM imported_actions WHERE id=?').get('preserved-import')?.record, importedRecord);
    assert.equal(upgraded.prepare('SELECT migration_manifest FROM metadata').get()?.migration_manifest, originalManifest);
  } finally { upgraded.close(); }
  assert.equal(lstatSync(join(f.root, 'backups')).mode & 0o777, 0o700);
  for (const path of [receipt.backup.path, receipt.backup.installationPath]) {
    assert.equal(lstatSync(path).mode & 0o777, 0o600);
  }
  assert.equal(createHash('sha256').update(readFileSync(receipt.backup.path)).digest('hex'), receipt.backup.sha256);
  assert.deepEqual(readFileSync(receipt.backup.installationPath), originalMarker);
  assert.equal(createHash('sha256').update(originalMarker).digest('hex'), receipt.backup.installationSha256);
  const backup = new DatabaseSync(receipt.backup.path, { readOnly: true });
  try {
    assert.equal(backup.prepare('SELECT schema_version FROM metadata').get()?.schema_version, 2);
    assert.equal(backup.prepare('SELECT record FROM imported_actions WHERE id=?').get('preserved-import')?.record, importedRecord);
  } finally { backup.close(); }
  assert.equal(existsSync(join(f.root, 'migration.lock')), false);
  assert.deepEqual(upgradeAdmissionForTesting(upgradeDeclaration, { root: f.root, backend: 'fake' }), receipt);
});

test('explicit offline initialization enables admission and persists its operator declaration', t => {
  const f = fixture(t);
  assert.throws(f.open, { code: 'STATE_UNAVAILABLE' });
  const receipt = migrateAdmissionForTesting(declaration, f.options);
  const admission = f.open();
  assert.deepEqual(admission.activation(), receipt);
  assert.deepEqual(receipt.declaration, declaration);
  assert.equal(receipt.importedActions, 0);
  assert.equal(receipt.sources.length, 2);
  assert.ok(receipt.sources.every(source => !source.present));
  assert.deepEqual(migrateAdmissionForTesting(declaration, f.options), receipt);
  assert.throws(() => admission.assertBackend('real'), { code: 'STATE_UNAVAILABLE' });
});

test('completed historical actions retain original records and one read-only allocation identity without replay', async t => {
  const f = fixture(t);
  const source = f.options.defaultRoots.journal;
  const journal = new HistoricalJournalFixture(source);
  await (await journal.begin({ deviceId: device.toLowerCase(), actionId: 'old-action', intent: { tap: 'old-selector' } })).complete(historicalResult);
  const deviceDirectory = join(source, readdirSync(source)[0]!);
  const sourceBytes = readdirSync(deviceDirectory).map(name => [name, readFileSync(join(deviceDirectory, name)).toString('hex')]);
  const receipt = migrateAdmissionForTesting(declaration, f.options);
  assert.equal(receipt.importedActions, 1);
  const admission = f.open();
  const imported = admission.readImportedAction('old-action');
  assert.ok(imported);
  assert.equal(imported.device, device);
  assert.equal(imported.readOnly, true);
  assert.equal(imported.outcome, 'outcome_observed');
  assert.match(imported.allocationId, /^[0-9A-F-]{36}$/);
  assert.equal('digest' in imported, false);
  assert.equal('prepared' in imported, false);
  assert.equal(imported.records.length, 2);
  assert.ok(imported.records.some(source => (source.record as { result?: unknown }).result !== undefined));
  assert.deepEqual(f.open().readImportedAllocation(imported.allocationId.toLowerCase()), imported);
  for (const kind of ['observed', 'preparation'] as const) {
    assert.deepEqual(admission.acquire({ attempt: { kind, id: 'old-action' }, device: otherDevice, digest: 'new', intent: {} }),
      { kind: 'refused', reason: 'ACTION_ID_CONFLICT' });
  }
  assert.equal(admission.inspect(otherDevice), undefined);
  assert.deepEqual(migrateAdmissionForTesting(declaration, f.options), receipt);
  assert.deepEqual(f.open().readImportedAction('old-action'), imported);
  assert.deepEqual(readdirSync(deviceDirectory).map(name => [name, readFileSync(join(deviceDirectory, name)).toString('hex')]), sourceBytes);
});

for (const uncertainty of ['quarantine', 'claim', 'unfinished', 'temporary'] as const) {
  test(`${uncertainty} in a casing alias overrides apparent completion without changing sources`, async t => {
    const f = fixture(t);
    const source = f.options.defaultRoots.journal;
    const journal = new HistoricalJournalFixture(source);
    await (await journal.begin({ deviceId: device.toLowerCase(), actionId: 'old', intent: {} })).complete(historicalResult);
    const directory = journalDirectory(source);
    mkdirSync(directory, { mode: 0o700 });
    if (uncertainty === 'quarantine') put(join(directory, 'quarantine.json'), { deviceId: device, reason: 'retained' });
    if (uncertainty === 'claim') put(join(directory, 'claim.json'), { deviceId: device, actionId: 'old', intent: {}, token: 'old-token' });
    if (uncertainty === 'unfinished') put(join(directory, `${digest('other-old')}.intent.json`), { deviceId: device, actionId: 'other-old', intent: {}, status: 'in-flight' });
    if (uncertainty === 'temporary') put(join(directory, `${digest('old')}.result.json.00000000-0000-4000-8000-000000000010.tmp`), { deviceId: device, actionId: 'old', intent: {}, status: 'completed', result: historicalResult });
    const before = treeBytes(source);
    migrateAdmissionForTesting(declaration, f.options);
    const admission = f.open();
    assert.equal(admission.readImportedAction('old')?.outcome, 'inconclusive');
    assert.equal(admission.inspect(device)?.state, 'quarantined');
    assert.deepEqual(admission.acquire({ attempt: { kind: 'legacy', id: 'new' }, device, digest: 'new', intent: {} }), { kind: 'refused', reason: 'DEVICE_QUARANTINED' });
    assert.equal(admission.acquire({ attempt: { kind: 'legacy', id: 'different' }, device: otherDevice, digest: 'new', intent: {} }).kind, 'acquired');
    assert.deepEqual(treeBytes(source), before);
  });
}
function treeBytes(root: string): unknown[] {
  return readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).map(entry =>
    [entry.name, entry.isDirectory() ? treeBytes(join(root, entry.name)) : readFileSync(join(root, entry.name)).toString('hex')]);
}

test('well-formed case aliases consolidate clean completion and conflicting device bindings refuse activation', async t => {
  const f = fixture(t);
  const journal = new HistoricalJournalFixture(f.options.defaultRoots.journal);
  for (const udid of [device, device.toLowerCase()]) await (await journal.begin({ deviceId: udid, actionId: 'alias', intent: {} })).complete(historicalResult);
  migrateAdmissionForTesting(declaration, f.options);
  assert.equal(f.open().readImportedAction('alias')?.outcome, 'outcome_observed');
  assert.equal(f.open().readImportedAction('alias')?.records.length, 4);
  const conflict = fixture(t);
  const journal2 = new HistoricalJournalFixture(conflict.options.defaultRoots.journal);
  for (const udid of [device, otherDevice]) await (await journal2.begin({ deviceId: udid, actionId: 'duplicate', intent: {} })).complete(historicalResult);
  const before = treeBytes(conflict.options.defaultRoots.journal);
  assert.throws(() => migrateAdmissionForTesting(declaration, conflict.options), { code: 'STATE_UNAVAILABLE' });
  assert.throws(conflict.open, { code: 'STATE_UNAVAILABLE' });
  assert.deepEqual(treeBytes(conflict.options.defaultRoots.journal), before);
});

for (const lease of ['dead', 'malformed', 'temporary', 'live'] as const) {
  test(`${lease} legacy iOS lease is never reclaimed and cannot authorize effects`, t => {
    const f = fixture(t);
    const source = f.options.defaultRoots.leases;
    mkdirSync(source, { mode: 0o700 });
    const path = join(source, `${device}.lock${lease === 'temporary' ? '.00000000-0000-4000-8000-000000000010.tmp' : ''}`);
    if (lease === 'malformed') writeFileSync(path, '{partial', { mode: 0o600 });
    else if (lease === 'live') put(path, { pid: process.pid, token: 'old', deviceId: device, createdAt: new Date().toISOString() });
    else {
      const child = spawnSync(process.execPath, ['--input-type=module', '-e',
        "import {writeFileSync} from 'node:fs'; writeFileSync(process.argv[1], JSON.stringify({pid:process.pid,token:'old',deviceId:process.argv[2],createdAt:new Date().toISOString()}),{mode:0o600});", path, device], { encoding: 'utf8' });
      assert.equal(child.status, 0, child.stderr);
    }
    const before = treeBytes(source);
    if (lease === 'live') {
      assert.throws(() => migrateAdmissionForTesting(declaration, f.options), { code: 'STATE_UNAVAILABLE' });
      assert.throws(f.open, { code: 'STATE_UNAVAILABLE' });
    } else {
      migrateAdmissionForTesting(declaration, f.options);
      assert.equal(f.open().inspect(device)?.state, 'quarantined');
    }
    assert.deepEqual(treeBytes(source), before);
  });
}

test('matching non-UUID lease records remain untouched without becoming iOS claims; unattributable records close activation', t => {
  const f = fixture(t);
  mkdirSync(f.options.defaultRoots.leases, { mode: 0o700 });
  const path = join(f.options.defaultRoots.leases, 'PIXEL_TEST.lock');
  put(path, { pid: process.pid, token: 'old', deviceId: 'pixel_test', createdAt: new Date().toISOString(), ownedProcesses: ['agent'] });
  const before = treeBytes(f.options.defaultRoots.leases);
  assert.equal(migrateAdmissionForTesting(declaration, f.options).ignoredNonIosLeases, 1);
  assert.deepEqual(treeBytes(f.options.defaultRoots.leases), before);
  const malformed = fixture(t);
  mkdirSync(malformed.options.defaultRoots.leases, { mode: 0o700 });
  writeFileSync(join(malformed.options.defaultRoots.leases, 'mystery.lock'), '{broken');
  assert.throws(() => migrateAdmissionForTesting(declaration, malformed.options), { code: 'STATE_UNAVAILABLE' });
  assert.throws(malformed.open, { code: 'STATE_UNAVAILABLE' });
});

test('protected study devices and declared exclusions remain unavailable even with no historical files', t => {
  const f = fixture(t);
  migrateAdmissionForTesting({ ...declaration, excludedDevices: [device.toLowerCase()] }, f.options);
  for (const udid of [device, '73997430-DB8A-48C8-8146-12320CE6AEFE', '2FE383F2-2D0F-4286-8797-D3ACEFCD6220',
    '6A8C5F93-F59A-456B-B157-10642209B734', '0E42FDE2-5E09-42D3-9876-9EF0037FCBE7']) {
    assert.equal(f.open().inspect(udid)?.state, 'quarantined');
  }
});

test('unquiesced or incomplete root declarations refuse before installation; explicit missing roots are not empty', t => {
  for (const field of ['writersStopped', 'historicalRootsDeclaredOrExcluded']) {
    const f = fixture(t);
    assert.throws(() => migrateAdmissionForTesting({ ...declaration, [field]: false }, f.options), { code: 'INVALID_REQUEST' });
    assert.equal(existsSync(f.root), false);
  }
  const f = fixture(t);
  assert.throws(() => migrateAdmissionForTesting({ ...declaration, additionalJournalRoots: [join(f.directory, 'missing')] }, f.options), { code: 'STATE_UNAVAILABLE' });
  assert.throws(f.open, { code: 'STATE_UNAVAILABLE' });
});

test('migration guard blocks existing handles and independent readers; a stranded guard is never reclaimed', t => {
  const f = fixture(t);
  migrateAdmissionForTesting(declaration, f.options);
  const admission = f.open();
  const acquired = admission.acquire({ attempt: { kind: 'legacy', id: 'owner' }, device, digest: 'one', intent: {} });
  assert.equal(acquired.kind, 'acquired');
  if (acquired.kind !== 'acquired') return;
  const session = acquired.claim.bindDriver('fake');
  let calls = 0;
  migrateAdmissionForTesting(declaration, { ...f.options, checkpoint(point) {
    if (point !== 'guarded') return;
    assert.throws(() => admission.inspect(device), { code: 'STATE_UNAVAILABLE' });
    assert.throws(() => admission.activation(), { code: 'STATE_UNAVAILABLE' });
    assert.throws(() => session.dispatch('launch', async () => { calls++; }), { code: 'STATE_UNAVAILABLE' });
    assert.throws(() => migrateAdmissionForTesting(declaration, f.options), { code: 'STATE_UNAVAILABLE' });
    const child = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), '--input-type=module', '-e',
      `import {Admission} from ${JSON.stringify(new URL('../src/device/admission.ts', import.meta.url).href)}; try { Admission.forTesting({root:process.argv[1],backend:'fake',initialize:false}); process.exit(1); } catch(e) { process.exit(e.code === 'STATE_UNAVAILABLE' ? 0 : 2); }`, f.root], { encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
  } });
  assert.equal(calls, 0);
  assert.equal(admission.inspect(device)?.state, 'active');
  const guard = join(f.root, 'migration.lock');
  put(guard, { token: 'crashed-importer' });
  assert.throws(() => migrateAdmissionForTesting(declaration, f.options), { code: 'STATE_UNAVAILABLE' });
  assert.equal(readFileSync(guard, 'utf8'), JSON.stringify({ token: 'crashed-importer' }));
});

for (const failure of ['markerWritten', 'beforeCommit', 'afterCommit'] as const) {
  test(`interrupted ${failure} installation never recreates missing authority`, t => {
    const f = fixture(t);
    assert.throws(() => migrateAdmissionForTesting(declaration, { ...f.options, checkpoint(point) { if (point === failure) throw new Error('injected'); } }), { code: 'STATE_UNAVAILABLE' });
    if (failure === 'afterCommit') {
      const receipt = f.open().activation();
      assert.deepEqual(migrateAdmissionForTesting(declaration, f.options), receipt);
    } else {
      assert.throws(f.open, { code: 'STATE_UNAVAILABLE' });
      assert.throws(() => migrateAdmissionForTesting(declaration, f.options), { code: 'STATE_UNAVAILABLE' });
    }
  });
}

test('activation revalidates persisted manifest and rejects missing initialized storage on every operation', t => {
  const f = fixture(t);
  migrateAdmissionForTesting(declaration, f.options);
  const admission = f.open();
  const db = new DatabaseSync(join(f.root, 'admission.sqlite'));
  assert.throws(() => db.prepare('UPDATE metadata SET migration_manifest=?').run('{}'), /Immutable metadata binding/);
  db.exec('DROP TRIGGER metadata_binding_immutable');
  db.prepare('UPDATE metadata SET migration_manifest=?').run('{}'); db.close();
  assert.throws(() => admission.acquire({ attempt: { kind: 'legacy', id: 'bad-manifest' }, device, digest: 'one', intent: {} }), { code: 'STATE_UNAVAILABLE' });
  assert.throws(() => admission.inspect(device), { code: 'STATE_UNAVAILABLE' });
  assert.throws(f.open, { code: 'STATE_UNAVAILABLE' });
  unlinkSync(join(f.root, 'admission.sqlite'));
  assert.throws(() => migrateAdmissionForTesting(declaration, f.options), { code: 'STATE_UNAVAILABLE' });
  assert.equal(existsSync(join(f.root, 'admission.sqlite')), false);
});

test('changed historical sources on a rerun retain the migration guard and block previously activated handles', async t => {
  const f = fixture(t);
  migrateAdmissionForTesting(declaration, f.options);
  const admission = f.open();
  await new HistoricalJournalFixture(f.options.defaultRoots.journal).begin({ deviceId: device, actionId: 'appeared-later', intent: {} });
  const bytes = treeBytes(f.options.defaultRoots.journal);
  assert.throws(() => migrateAdmissionForTesting(declaration, f.options), { code: 'STATE_UNAVAILABLE' });
  assert.throws(() => admission.activation(), { code: 'STATE_UNAVAILABLE' });
  assert.throws(f.open, { code: 'STATE_UNAVAILABLE' });
  assert.deepEqual(treeBytes(f.options.defaultRoots.journal), bytes);
});

test('migration refuses an admission root inside a source before changing source bytes', t => {
  const f = fixture(t);
  mkdirSync(f.options.defaultRoots.journal, { mode: 0o700 });
  const root = join(f.options.defaultRoots.journal, 'admission');
  assert.throws(() => migrateAdmissionForTesting(declaration, { ...f.options, root }), { code: 'STATE_UNAVAILABLE' });
  assert.deepEqual(readdirSync(f.options.defaultRoots.journal), []);
});

for (const corruption of ['invalid-json', 'wrong-hash', 'symbolic-link', 'unexpected-file', 'empty-directory'] as const) {
  test(`${corruption} historical input refuses activation with source bytes unchanged`, async t => {
    const f = fixture(t);
    const source = f.options.defaultRoots.journal;
    const journal = new HistoricalJournalFixture(source);
    await (await journal.begin({ deviceId: device, actionId: 'old', intent: {} })).complete(historicalResult);
    const path = join(journalDirectory(source), `${digest('old')}.intent.json`);
    if (corruption === 'invalid-json') writeFileSync(path, '{');
    if (corruption === 'wrong-hash') put(path, { deviceId: otherDevice, actionId: 'old', intent: {}, status: 'in-flight' });
    if (corruption === 'symbolic-link') { unlinkSync(path); symlinkSync(join(journalDirectory(source), `${digest('old')}.result.json`), path); }
    if (corruption === 'unexpected-file') put(join(source, 'unknown.json'), {});
    if (corruption === 'empty-directory') mkdirSync(journalDirectory(source, otherDevice));
    const before = treeBytes(source);
    assert.throws(() => migrateAdmissionForTesting(declaration, f.options), { code: 'STATE_UNAVAILABLE' });
    assert.throws(f.open, { code: 'STATE_UNAVAILABLE' });
    assert.deepEqual(treeBytes(source), before);
  });
}

test('explicit additional roots are imported, deduplicated and recorded without weakening defaults', async t => {
  const f = fixture(t);
  const extra = join(f.directory, 'other-home-journal');
  await (await new HistoricalJournalFixture(extra).begin({ deviceId: device, actionId: 'extra', intent: {} })).uncertain('lost');
  const input = { ...declaration, additionalJournalRoots: [extra, extra] };
  const receipt = migrateAdmissionForTesting(input, f.options);
  assert.equal(receipt.sources.length, 3);
  assert.equal(f.open().readImportedAction('extra')?.outcome, 'inconclusive');
});

test('an unsafe source file cannot be bypassed by a malformed default root declaration', t => {
  const f = fixture(t);
  const target = join(f.directory, 'elsewhere');
  mkdirSync(target);
  symlinkSync(target, f.options.defaultRoots.journal);
  assert.throws(() => migrateAdmissionForTesting(declaration, f.options), { code: 'STATE_UNAVAILABLE' });
  assert.throws(f.open, { code: 'STATE_UNAVAILABLE' });
});

test('offline maintenance accepts only an explicit declaration file and emits a persisted receipt', t => {
  const f = fixture(t);
  const path = join(f.directory, 'declaration.json');
  put(path, declaration);
  const output: string[] = [];
  const io = { write: (value: string) => { output.push(value); } };
  assert.equal(runAdmissionMaintenance(['migrate', path], io, f.options), 0);
  assert.deepEqual(JSON.parse(output.pop()!), f.open().activation());
  assert.equal(runAdmissionMaintenance(['migrate', path, '--root', f.root], io, f.options), 3);
  assert.equal(JSON.parse(output.pop()!).code, 'INVALID_REQUEST');
  put(path, { ...declaration, writersStopped: false, secretExtra: 'never-display-this' });
  assert.equal(runAdmissionMaintenance(['migrate', path], io, f.options), 3);
  assert.equal(output.join('').includes('never-display-this'), false);
});

test('unreadable source and permissive or mismatched initialized storage remain closed', async t => {
  const f = fixture(t);
  await (await new HistoricalJournalFixture(f.options.defaultRoots.journal).begin({ deviceId: device, actionId: 'private', intent: {} })).complete(historicalResult);
  const path = join(journalDirectory(f.options.defaultRoots.journal), `${digest('private')}.intent.json`);
  chmodSync(path, 0o000);
  try { assert.throws(() => migrateAdmissionForTesting(declaration, f.options), { code: 'STATE_UNAVAILABLE' }); }
  finally { chmodSync(path, 0o600); }
  migrateAdmissionForTesting(declaration, f.options);
  const admission = f.open();
  const marker = join(f.root, 'installation.json');
  chmodSync(marker, 0o644);
  assert.throws(() => admission.activation(), { code: 'STATE_UNAVAILABLE' });
  chmodSync(marker, 0o600);
  const original = JSON.parse(readFileSync(marker, 'utf8'));
  put(marker, { ...original, installationId: 'different-installation' });
  assert.throws(() => admission.inspect(device), { code: 'STATE_UNAVAILABLE' });
});

test('conflicting attributable historical results cannot establish an observed outcome', async t => {
  const f = fixture(t);
  const journal = new HistoricalJournalFixture(f.options.defaultRoots.journal);
  await (await journal.begin({ deviceId: device, actionId: 'conflict', intent: { tap: 'one' } })).complete(historicalResult);
  await (await journal.begin({ deviceId: device.toLowerCase(), actionId: 'conflict', intent: { tap: 'two' } })).complete(historicalResult);
  migrateAdmissionForTesting(declaration, f.options);
  assert.equal(f.open().readImportedAction('conflict')?.outcome, 'inconclusive');
  assert.equal(f.open().inspect(device)?.state, 'quarantined');
});

test('a completed casing alias cannot finish the same action intent in another historical directory', async t => {
  const f = fixture(t);
  const journal = new HistoricalJournalFixture(f.options.defaultRoots.journal);
  await (await journal.begin({ deviceId: device, actionId: 'split-terminal', intent: {} })).complete(historicalResult);
  const directory = journalDirectory(f.options.defaultRoots.journal, device.toLowerCase());
  mkdirSync(directory, { mode: 0o700 });
  put(join(directory, `${digest('split-terminal')}.intent.json`), { deviceId: device.toLowerCase(), actionId: 'split-terminal', intent: {}, status: 'in-flight' });
  migrateAdmissionForTesting(declaration, f.options);
  assert.equal(f.open().readImportedAction('split-terminal')?.outcome, 'inconclusive');
  assert.equal(f.open().inspect(device)?.state, 'quarantined');
});

for (const milestone of ['markerWritten', 'beforeCommit', 'afterCommit']) {
  test(`real importer death at ${milestone} retains its guard instead of authorizing a replacement`, t => {
    const f = fixture(t);
    const child = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'),
      fileURLToPath(new URL('./fixtures/admission-migration/crash-worker.ts', import.meta.url)),
      f.root, f.options.defaultRoots.journal, f.options.defaultRoots.leases, milestone], { encoding: 'utf8' });
    assert.equal(child.signal, 'SIGKILL', child.stderr);
    const guard = readFileSync(join(f.root, 'migration.lock'), 'utf8');
    assert.throws(f.open, { code: 'STATE_UNAVAILABLE' });
    assert.throws(() => migrateAdmissionForTesting(declaration, f.options), { code: 'STATE_UNAVAILABLE' });
    assert.equal(readFileSync(join(f.root, 'migration.lock'), 'utf8'), guard);
  });
}

for (const failure of ['unsafe-root', 'dangling-root', 'missing-declared-root', 'unreadable-root'] as const) {
  test(`initialized admission stays closed after ${failure} prevents an offline rerun`, t => {
    const f = fixture(t);
    const extra = join(f.directory, 'declared-journal');
    if (failure === 'missing-declared-root') mkdirSync(extra, { mode: 0o700 });
    const input = failure === 'missing-declared-root' ? { ...declaration, additionalJournalRoots: [extra] } : declaration;
    migrateAdmissionForTesting(input, f.options);
    const admission = f.open();
    const source = f.options.defaultRoots.journal;
    if (failure === 'unsafe-root') { const elsewhere = join(f.directory, 'elsewhere'); mkdirSync(elsewhere); symlinkSync(elsewhere, source); }
    if (failure === 'dangling-root') symlinkSync(join(f.directory, 'missing-target'), source);
    if (failure === 'missing-declared-root') rmSync(extra, { recursive: true });
    if (failure === 'unreadable-root') { mkdirSync(source); chmodSync(source, 0o000); }
    try {
      assert.throws(() => migrateAdmissionForTesting(input, f.options), { code: 'STATE_UNAVAILABLE' });
      assert.throws(() => admission.acquire({ device, attempt: { kind: 'legacy', id: 'after-refused-rerun' }, digest: 'new', intent: {} }), { code: 'STATE_UNAVAILABLE' });
      assert.throws(f.open, { code: 'STATE_UNAVAILABLE' });
      assert.equal(existsSync(join(f.root, 'migration.lock')), true);
    } finally { if (failure === 'unreadable-root') chmodSync(source, 0o700); }
    if (failure === 'unsafe-root' || failure === 'dangling-root') assert.equal(lstatSync(source).isSymbolicLink(), true);
    if (failure === 'missing-declared-root') assert.equal(existsSync(extra), false);
    if (failure === 'unreadable-root') assert.deepEqual(readdirSync(source), []);
  });
}

test('a recognized lease FIFO refuses within the child deadline without reading a device or retaining a fresh guard', t => {
  const f = fixture(t);
  mkdirSync(f.options.defaultRoots.leases, { mode: 0o700 });
  const fifo = join(f.options.defaultRoots.leases, `${device}.lock`);
  const created = spawnSync('mkfifo', [fifo], { encoding: 'utf8' });
  assert.equal(created.status, 0, created.stderr);
  const child = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), '--input-type=module', '-e',
    `import {migrateAdmissionForTesting} from ${JSON.stringify(new URL('../src/device/admission-migration.ts', import.meta.url).href)};
    try { migrateAdmissionForTesting(JSON.parse(process.argv[1]), JSON.parse(process.argv[2])); process.exit(1); }
    catch(error) { process.stdout.write(String(error.code)); process.exit(error.code === 'STATE_UNAVAILABLE' ? 3 : 2); }`,
    JSON.stringify(declaration), JSON.stringify(f.options)], { encoding: 'utf8', timeout: 2000, killSignal: 'SIGKILL' });
  assert.equal(child.signal, null, 'The importer must refuse the FIFO before the 2-second deadline');
  assert.equal(child.status, 3, child.stderr);
  assert.equal(child.stdout, 'STATE_UNAVAILABLE');
  assert.equal(lstatSync(fifo).isFIFO(), true);
  assert.equal(existsSync(join(f.root, 'migration.lock')), false);
  assert.throws(f.open, { code: 'STATE_UNAVAILABLE' });
});

test('root separation and destination safety refuse without placing a guard inside a source or unsafe directory', t => {
  const f = fixture(t);
  migrateAdmissionForTesting(declaration, f.options);
  symlinkSync(f.root, f.options.defaultRoots.journal);
  const before = treeBytes(f.root);
  assert.throws(() => migrateAdmissionForTesting(declaration, f.options), { code: 'STATE_UNAVAILABLE' });
  assert.deepEqual(treeBytes(f.root), before);
  assert.equal(existsSync(join(f.root, 'migration.lock')), false);
  const unsafe = fixture(t);
  mkdirSync(unsafe.root, { mode: 0o755 });
  assert.throws(() => migrateAdmissionForTesting(declaration, unsafe.options), { code: 'STATE_UNAVAILABLE' });
  assert.deepEqual(readdirSync(unsafe.root), []);
});

test('an inaccessible ancestor of a declared source closes initialized admission on rerun', t => {
  const f = fixture(t);
  const parent = join(f.directory, 'historical-parent');
  const journal = join(parent, 'journal');
  mkdirSync(journal, { recursive: true, mode: 0o700 });
  const input = { ...declaration, additionalJournalRoots: [journal] };
  migrateAdmissionForTesting(input, f.options);
  const admission = f.open();
  const before = treeBytes(parent);
  chmodSync(parent, 0o000);
  try {
    assert.throws(() => migrateAdmissionForTesting(input, f.options), { code: 'STATE_UNAVAILABLE' });
    assert.throws(() => admission.acquire({ device, attempt: { kind: 'legacy', id: 'after-ancestor-failure' }, digest: 'new', intent: {} }), { code: 'STATE_UNAVAILABLE' });
    assert.throws(f.open, { code: 'STATE_UNAVAILABLE' });
    assert.equal(existsSync(join(f.root, 'migration.lock')), true);
  } finally { chmodSync(parent, 0o700); }
  assert.deepEqual(treeBytes(parent), before);
});

test('a readable source overlap still prevents guard writes when another declared source is inaccessible', t => {
  const f = fixture(t);
  const parent = join(f.directory, 'historical-parent');
  const journal = join(parent, 'journal');
  const redirected = join(f.directory, 'redirected');
  mkdirSync(journal, { recursive: true, mode: 0o700 });
  mkdirSync(redirected, { mode: 0o700 });
  const input = { ...declaration, additionalJournalRoots: [journal, redirected] };
  migrateAdmissionForTesting(input, f.options);
  rmSync(redirected, { recursive: true });
  symlinkSync(f.root, redirected);
  const before = treeBytes(f.root);
  chmodSync(parent, 0o000);
  try { assert.throws(() => migrateAdmissionForTesting(input, f.options), { code: 'STATE_UNAVAILABLE' }); }
  finally { chmodSync(parent, 0o700); }
  assert.deepEqual(treeBytes(f.root), before);
  assert.equal(existsSync(join(f.root, 'migration.lock')), false);
});
