import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Admission } from '../src/device/admission.js';
import { migrateAdmissionForTesting, type MigrationDeclaration } from '../src/device/admission-migration.js';
import { ObservedActionJournal } from '../src/experimental/observed-journal.js';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { runAdmissionMaintenance } from '../src/device/admission-maintenance.js';

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
  const journal = new ObservedActionJournal(source);
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
    const journal = new ObservedActionJournal(source);
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
  const journal = new ObservedActionJournal(f.options.defaultRoots.journal);
  for (const udid of [device, device.toLowerCase()]) await (await journal.begin({ deviceId: udid, actionId: 'alias', intent: {} })).complete(historicalResult);
  migrateAdmissionForTesting(declaration, f.options);
  assert.equal(f.open().readImportedAction('alias')?.outcome, 'outcome_observed');
  assert.equal(f.open().readImportedAction('alias')?.records.length, 4);
  const conflict = fixture(t);
  const journal2 = new ObservedActionJournal(conflict.options.defaultRoots.journal);
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
  await new ObservedActionJournal(f.options.defaultRoots.journal).begin({ deviceId: device, actionId: 'appeared-later', intent: {} });
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
    const journal = new ObservedActionJournal(source);
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
  await (await new ObservedActionJournal(extra).begin({ deviceId: device, actionId: 'extra', intent: {} })).uncertain('lost');
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
  await (await new ObservedActionJournal(f.options.defaultRoots.journal).begin({ deviceId: device, actionId: 'private', intent: {} })).complete(historicalResult);
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
  const journal = new ObservedActionJournal(f.options.defaultRoots.journal);
  await (await journal.begin({ deviceId: device, actionId: 'conflict', intent: { tap: 'one' } })).complete(historicalResult);
  await (await journal.begin({ deviceId: device.toLowerCase(), actionId: 'conflict', intent: { tap: 'two' } })).complete(historicalResult);
  migrateAdmissionForTesting(declaration, f.options);
  assert.equal(f.open().readImportedAction('conflict')?.outcome, 'inconclusive');
  assert.equal(f.open().inspect(device)?.state, 'quarantined');
});

test('a completed casing alias cannot finish the same action intent in another historical directory', async t => {
  const f = fixture(t);
  const journal = new ObservedActionJournal(f.options.defaultRoots.journal);
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
