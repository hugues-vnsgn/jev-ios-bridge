import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { Admission } from '../src/device/admission.js';
import type { MigrationDeclaration } from '../src/device/admission-migration.js';
import { importAdmissionForTesting } from '../src/device/admission-import.js';

const uuid = 'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE';
const declaration: MigrationDeclaration = { version: 1, writersStopped: true, historicalRootsDeclaredOrExcluded: true,
  additionalJournalRoots: [], additionalLeaseRoots: [], excludedDevices: [] };
function fixture(t: test.TestContext) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'jev-import-')));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const root = join(directory, 'admission');
  mkdirSync(root, { mode: 0o700 });
  const admission = Admission.forTesting({ root, backend: 'fake' });
  const leases = join(directory, 'leases');
  mkdirSync(leases, { mode: 0o700 });
  return { root, admission, backend: 'fake' as const, defaultRoots: { leases, journal: join(directory, 'journal') } };
}
function lease(root: string, name: string, pid = 2147483647) {
  const path = join(root, name.toUpperCase() + '.lock');
  writeFileSync(path, JSON.stringify({ pid, token: 'legacy-token', deviceId: name, createdAt: '2026-01-01T00:00:00Z', ownedProcesses: ['old automation'] }), { mode: 0o600 });
  return path;
}
function storeFiles(path: string): unknown {
  return readdirSync(path, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name)).map(entry => [entry.name,entry.isDirectory()?storeFiles(join(path,entry.name)):readFileSync(join(path,entry.name)).toString('hex')]);
}
const digest = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

test('UUID lease imports as historical quarantine without changing its source', t => {
  const options = fixture(t);
  const path = lease(options.defaultRoots.leases, uuid.toLowerCase());
  const before = digest(path);
  const receipt = importAdmissionForTesting(declaration, options);
  assert.equal(receipt.kind, 'import');
  assert.equal(receipt.quarantines.length, 1);
  assert.equal(options.admission.inspect(uuid)?.state, 'quarantined');
  assert.equal(digest(path), before);
  assert.deepEqual(importAdmissionForTesting(declaration, options), receipt);
});

test('name lease blocks matching emulators and phones and later files get a new receipt', t => {
  const options = fixture(t);
  lease(options.defaultRoots.leases, 'Pixel_9');
  const db = new DatabaseSync(join(options.root, 'admission.sqlite'));
  db.prepare("INSERT INTO devices(platform,device,generation,attributes) VALUES ('android-emulator','/tmp/Pixel_9.avd',0,?)").run(JSON.stringify({ avdName: 'pixel_9' }));
  db.close();
  const first = importAdmissionForTesting(declaration, options);
  assert.equal(first.quarantines.length, 1);
  for (const [category, device, intent] of [
    ['android-emulator', '/tmp/Pixel_9.avd', { avdName: 'pixel_9' }],
    ['android-phone', 'pixel_9', {}],
  ] as const) {
    assert.deepEqual(options.admission.acquire({ category, device, intent, attempt: { kind: 'legacy', id: category }, digest: 'test' }),
      { kind: 'refused', reason: 'DEVICE_QUARANTINED' });
  }
  lease(options.defaultRoots.leases, uuid);
  const next = importAdmissionForTesting(declaration, options);
  assert.notEqual(next.id, first.id);
  assert.equal(next.quarantines.length, 1);
  assert.equal(next.skipped.length, 1);
  assert.deepEqual(importAdmissionForTesting(declaration, options), next);
});

test('a live holder refuses with HOLDER_ALIVE and zero store changes', t => {
  const options = fixture(t);
  lease(options.defaultRoots.leases, uuid, process.pid);
  const before = digest(join(options.root, 'admission.sqlite'));
  assert.throws(() => importAdmissionForTesting(declaration, options), { code: 'IMPORT_REFUSED', reason: 'HOLDER_ALIVE' });
  assert.equal(digest(join(options.root, 'admission.sqlite')), before);
});

test('changed imported source refuses with SOURCE_CONFLICT and no new receipt', t => {
  const options = fixture(t);
  const path = lease(options.defaultRoots.leases, uuid);
  importAdmissionForTesting(declaration, options);
  writeFileSync(path, readFileSync(path, 'utf8').replace('legacy-token', 'changed-token'));
  const before = digest(join(options.root, 'admission.sqlite'));
  assert.throws(() => importAdmissionForTesting(declaration, options), { code: 'IMPORT_REFUSED', reason: 'SOURCE_CONFLICT' });
  assert.equal(digest(join(options.root, 'admission.sqlite')), before);
});

test('newly declared journal history imports with v1 outcomes and remains retrievable', t => {
  const options = fixture(t), root = options.defaultRoots.journal;
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  const directory = join(root, hash(uuid));
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const record = { deviceId: uuid, actionId: 'old-action', intent: { tap: 'button' } };
  writeFileSync(join(directory, hash('old-action') + '.intent.json'), JSON.stringify({ ...record, status: 'in-flight' }), { mode: 0o600 });
  writeFileSync(join(directory, hash('old-action') + '.result.json'), JSON.stringify({ ...record, status: 'completed', result: {
    status: 'outcome_observed', actionAttempted: true, actionAcknowledged: true, observations: 1,
  } }), { mode: 0o600 });
  const receipt = importAdmissionForTesting(declaration, options);
  assert.equal(receipt.importedActions.length, 1);
  assert.equal(options.admission.readImportedAction('old-action')?.outcome, 'outcome_observed');
  assert.equal(receipt.sources.length, 2);
});

test('preflight lists planned quarantines and leaves every store file unchanged', async t => {
  const options = fixture(t);
  lease(options.defaultRoots.leases, 'Pixel_9');
  const { preflightAdmissionForTesting } = await import('../src/device/admission-import.js');
  const before = digest(join(options.root, 'admission.sqlite'));
  const files = storeFiles(options.root);
  const report = preflightAdmissionForTesting(declaration, options);
  assert.deepEqual(storeFiles(options.root), files);
  assert.equal(report.ready, true);
  assert.equal(report.store.schemaVersion, 3);
  assert.equal(report.leases.length, 1);
  assert.deepEqual(report.plannedQuarantines[0]?.target, { kind: 'name', name: 'PIXEL_9' });
  assert.equal(digest(join(options.root, 'admission.sqlite')), before);
});

test('preflight reports a writer and import repeats discovery before mutation', async t => {
  const options = fixture(t);
  const { preflightAdmissionForTesting } = await import('../src/device/admission-import.js');
  const host = () => ({ processes: [{ pid: 42, startedAt: '2026-10-19', role: 'bridge' as const }], handles: [], installs: [], failures: [] });
  const before = digest(join(options.root, 'admission.sqlite'));
  const report = preflightAdmissionForTesting(declaration, { ...options, host });
  assert.equal(report.ready, false);
  assert.deepEqual(report.checks.find(check => check.name === 'processes'), { name: 'processes', passed: false });
  assert.throws(() => importAdmissionForTesting(declaration, { ...options, host }), { code: 'STATE_UNAVAILABLE' });
  assert.equal(digest(join(options.root, 'admission.sqlite')), before);
});

test('checked import recovery returns to the old state or retrieves the committed receipt', async t => {
  const { recoverImportAdmissionForTesting } = await import('../src/device/admission-import.js');
  for (const point of ['backupVerified', 'afterCommit'] as const) {
    const options = fixture(t);
    lease(options.defaultRoots.leases, uuid);
    assert.throws(() => importAdmissionForTesting(declaration, { ...options, checkpoint: at => { if (at === point) throw new Error('simulated interruption'); } }));
    const recovered = recoverImportAdmissionForTesting(declaration, options);
    assert.equal(recovered.kind, 'import-recovery');
    assert.equal(recovered.receiptId === null, point === 'backupVerified');
    const receipt = importAdmissionForTesting(declaration, options);
    if (point === 'afterCommit') assert.equal(receipt.id, recovered.receiptId);
    assert.equal(options.admission.inspect(uuid)?.state, 'quarantined');
  }
});

test('unsafe, unreadable and inconsistent sources each return one import reason without writes', async t => {
  const { symlinkSync } = await import('node:fs');
  for (const reason of ['SOURCE_UNSAFE', 'SOURCE_UNREADABLE', 'SOURCE_INCONSISTENT'] as const) {
    const options = fixture(t);
    let input = declaration;
    if (reason === 'SOURCE_UNSAFE') {
      const path = lease(options.defaultRoots.leases, uuid);
      symlinkSync(path, join(options.defaultRoots.leases, 'OTHER.lock'));
    } else if (reason === 'SOURCE_UNREADABLE') {
      input = { ...declaration, additionalLeaseRoots: [join(options.root, '..', 'missing')] };
    } else writeFileSync(join(options.defaultRoots.leases, uuid + '.lock'), '{bad json', { mode: 0o600 });
    const before = digest(join(options.root, 'admission.sqlite'));
    assert.throws(() => importAdmissionForTesting(input, options), { code: 'IMPORT_REFUSED', reason });
    assert.equal(digest(join(options.root, 'admission.sqlite')), before);
  }
});

test('preflight reports imported sources as skipped rather than new quarantines', async t => {
  const options = fixture(t);
  lease(options.defaultRoots.leases, uuid);
  importAdmissionForTesting(declaration, options);
  const { preflightAdmissionForTesting } = await import('../src/device/admission-import.js');
  const files = storeFiles(options.root);
  const report = preflightAdmissionForTesting(declaration, options);
  assert.deepEqual(storeFiles(options.root), files);
  assert.equal(report.ready, true);
  assert.equal(report.plannedQuarantines.length, 0);
});

test('recovery retries its own committed journal event exactly once', async t => {
  const { recoverImportAdmissionForTesting } = await import('../src/device/admission-import.js');
  const options = fixture(t);
  lease(options.defaultRoots.leases, uuid);
  assert.throws(() => importAdmissionForTesting(declaration, { ...options, checkpoint: at => { if (at === 'afterCommit') throw new Error('interrupt'); } }));
  assert.throws(() => recoverImportAdmissionForTesting(declaration, { ...options, checkpoint: at => { if (at === 'recoveryCommitted') throw new Error('interrupt'); } }));
  const recovered = recoverImportAdmissionForTesting(declaration, options);
  assert.equal(recovered.kind, 'import-recovery');
  assert.equal(importAdmissionForTesting(declaration, options).id, recovered.receiptId);
});

test('recovery refuses unrelated store changes and leaves its guard in place', async t => {
  const { recoverImportAdmissionForTesting } = await import('../src/device/admission-import.js');
  const options = fixture(t);
  lease(options.defaultRoots.leases, uuid);
  assert.throws(() => importAdmissionForTesting(declaration, { ...options, checkpoint: at => { if (at === 'afterCommit') throw new Error('interrupt'); } }));
  const db=new DatabaseSync(join(options.root,'admission.sqlite'));
  db.prepare("INSERT INTO transitions(kind,attempt_id,event,detail,time) VALUES ('maintenance','unrelated','other','{}',1)").run();
  db.close();
  const before=storeFiles(options.root);
  assert.throws(()=>recoverImportAdmissionForTesting(declaration,options),{code:'STATE_UNAVAILABLE'});
  assert.deepEqual(storeFiles(options.root),before);
});

test('host discovery reports process start times and plugin versions without exposing command arguments', async t => {
  const options=fixture(t), home=join(options.root,'..','home');
  mkdirSync(join(home,'.codex'),{recursive:true,mode:0o700});
  const plugin=join(options.root,'..','plugin');
  mkdirSync(plugin,{mode:0o700});
  writeFileSync(join(plugin,'package.json'),JSON.stringify({name:'jev-ios-bridge',version:'1.3.0'}),{mode:0o600});
  writeFileSync(join(home,'.codex/config.toml'),'[mcp_servers.jev-ios-bridge]\ncommand = "node"\nargs = ["'+plugin+'/dist/mcp/index.js"]\n',{mode:0o600});
  const { discoverAdmissionHost }=await import('../src/device/admission-import.js');
  const report=discoverAdmissionHost({root:options.root,home,project:join(options.root,'..'),command:command=>({status:command==='ps'?0:1,stdout:command==='ps'?' 987 Mon Oct 19 12:00:00 2026 node '+plugin+'/dist/mcp/index.js --credential do-not-print\n':'',stderr:''})});
  assert.equal(report.processes[0]?.pid,987);
  assert.equal(report.processes[0]?.startedAt,'Mon Oct 19 12:00:00 2026');
  assert.equal(report.installs[0]?.version,'1.3.0');
  assert.doesNotMatch(JSON.stringify(report),/do-not-print/);
});

test('a leftover lease makes newly declared completed journal history inconclusive', t => {
  const options=fixture(t),hash=(value:string)=>createHash('sha256').update(value).digest('hex');
  lease(options.defaultRoots.leases,uuid);
  const directory=join(options.defaultRoots.journal,hash(uuid));
  mkdirSync(directory,{recursive:true,mode:0o700});
  const record={deviceId:uuid,actionId:'uncertain-action',intent:{tap:'button'}};
  writeFileSync(join(directory,hash(record.actionId)+'.intent.json'),JSON.stringify({...record,status:'in-flight'}),{mode:0o600});
  writeFileSync(join(directory,hash(record.actionId)+'.result.json'),JSON.stringify({...record,status:'completed',result:{status:'outcome_observed',actionAttempted:true,actionAcknowledged:true,observations:1}}),{mode:0o600});
  importAdmissionForTesting(declaration,options);
  assert.equal(options.admission.readImportedAction(record.actionId)?.outcome,'inconclusive');
});

test('an unfinished lowercase journal UUID creates an exact canonical quarantine', t => {
  const options=fixture(t),hash=(value:string)=>createHash('sha256').update(value).digest('hex'),device=uuid.toLowerCase();
  const directory=join(options.defaultRoots.journal,hash(device));
  mkdirSync(directory,{recursive:true,mode:0o700});
  writeFileSync(join(directory,'claim.json'),JSON.stringify({deviceId:device,actionId:'unfinished',intent:{tap:'button'}}),{mode:0o600});
  const receipt=importAdmissionForTesting(declaration,options);
  assert.equal(receipt.quarantines.length,1);
  assert.equal(options.admission.inspect(uuid)?.state,'quarantined');
  assert.equal(options.admission.readImportedAction('unfinished')?.outcome,'inconclusive');
});

test('checked import recovery handles a real child death with a hot rollback journal', async t => {
  const { spawnSync }=await import('node:child_process');
  const { recoverImportAdmissionForTesting }=await import('../src/device/admission-import.js');
  const options=fixture(t);
  lease(options.defaultRoots.leases,uuid);
  const childOptions={root:options.root,backend:options.backend,defaultRoots:options.defaultRoots};
  const code=`import {importAdmissionForTesting} from './src/device/admission-import.ts';importAdmissionForTesting(${JSON.stringify(declaration)},{...${JSON.stringify(childOptions)},checkpoint:point=>{if(point==='beforeCommit')process.kill(process.pid,'SIGKILL');}});`;
  const env={...process.env};delete env.TYPESAFE_API_KEY;
  const child=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',code],{env,encoding:'utf8',timeout:10000});
  assert.equal(child.signal,'SIGKILL',child.stderr);
  const recovered=recoverImportAdmissionForTesting(declaration,options);
  assert.equal(recovered.receiptId,null);
  assert.equal(importAdmissionForTesting(declaration,options).quarantines.length,1);
});

test('preflight refuses old or unknown reachable installs and accepts admission-era installs', async t => {
  const { preflightAdmissionForTesting }=await import('../src/device/admission-import.js');
  const options=fixture(t);
  for(const [version,ready] of [['1.3.0',false],[null,false],['1.4.0',true]] as const) {
    const report=preflightAdmissionForTesting(declaration,{...options,host:()=>({processes:[],handles:[],installs:[{source:'fixture-plugin',version}],failures:[]})});
    assert.equal(report.ready,ready);
    assert.equal(report.checks.find(check=>check.name==='installs')?.passed,ready);
  }
});

test('an unreadable journal directory uses SOURCE_UNREADABLE without changing the store', async t => {
  const { chmodSync }=await import('node:fs');
  const options=fixture(t),directory=join(options.defaultRoots.journal,'a'.repeat(64));
  mkdirSync(directory,{recursive:true,mode:0o700});
  const before=storeFiles(options.root);
  chmodSync(directory,0);
  try {assert.throws(()=>importAdmissionForTesting(declaration,options),{code:'IMPORT_REFUSED',reason:'SOURCE_UNREADABLE'});}
  finally {chmodSync(directory,0o700);}
  assert.deepEqual(storeFiles(options.root),before);
});

test('TMPDIR-style parent aliases resolve to canonical lease sources without accepting a symlink root', async t => {
  const { symlinkSync }=await import('node:fs');
  const options=fixture(t),alias=join(options.root,'..','tmp-alias');
  symlinkSync(join(options.root,'..'),alias,'dir');
  const path=lease(options.defaultRoots.leases,uuid);
  const receipt=importAdmissionForTesting(declaration,{...options,defaultRoots:{...options.defaultRoots,leases:join(alias,'leases')}});
  assert.equal(receipt.sources[0]?.path,path);
  assert.equal(options.admission.inspect(uuid)?.state,'quarantined');
  const linkedRoot=join(options.root,'..','linked-leases');
  symlinkSync(options.defaultRoots.leases,linkedRoot,'dir');
  assert.throws(()=>importAdmissionForTesting(declaration,{...options,defaultRoots:{...options.defaultRoots,leases:linkedRoot}}),{code:'IMPORT_REFUSED',reason:'SOURCE_UNSAFE'});
});
