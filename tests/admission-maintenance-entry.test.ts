import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test, { type TestContext } from 'node:test';
import { runAdmissionMaintenance } from '../src/device/admission-maintenance.js';
import { migrateAdmissionForTesting } from '../src/device/admission-migration.js';
import { AdmissionError } from '../src/device/admission.js';
import { upgradeAdmissionForTesting } from '../src/device/admission-upgrade.js';
import { preflightAdmissionForTesting, type HostInventory } from '../src/device/admission-import.js';
import { DatabaseSync } from 'node:sqlite';

const entry = realpathSync(resolve('src/device/admission-maintenance.ts'));
const upgradeDeclaration = { version: 1, kind: 'upgrade', from: 2, to: 3, writersStopped: true };
function upgradeFixture(t: TestContext) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'jev-upgrade-gate-')));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const options = { root: join(directory, 'admission'), backend: 'fake' as const,
    defaultRoots: { journal: join(directory, 'journal'), leases: join(directory, 'leases') } };
  migrateAdmissionForTesting({ version: 1, writersStopped: true, historicalRootsDeclaredOrExcluded: true,
    additionalJournalRoots: [], additionalLeaseRoots: [], excludedDevices: [] }, { ...options, schemaVersion: 2 });
  return { directory, options };
}
function storeFiles(root: string): Record<string, string> {
  return Object.fromEntries(readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile()).map(entry => {
      const path = join(entry.parentPath, entry.name);
      return [path, readFileSync(path).toString('base64')];
    }));
}
const emptyHost = (): HostInventory => ({ processes: [], handles: [], installs: [], failures: [] });
for (const [name, inventory] of [
  ['bridge', { ...emptyHost(), processes: [{ pid: 99, startedAt: 'fixture', role: 'bridge' }] }],
  ['mcp', { ...emptyHost(), processes: [{ pid: 99, startedAt: 'fixture', role: 'mcp' }] }],
  ['open-handles', { ...emptyHost(), handles: [{ pid: 99, path: 'fixture/admission.sqlite' }] }],
  ['old-install', { ...emptyHost(), installs: [{ source: 'fixture', version: '1.3.0' }] }],
  ['unknown-install', { ...emptyHost(), installs: [{ source: 'fixture', version: null }] }],
  ['discovery', { ...emptyHost(), failures: ['process-discovery'] }],
] satisfies [string, HostInventory][]) {
  test(`direct upgrade refuses ${name} before changing the fixture store`, t => {
    const { options } = upgradeFixture(t);
    const before = storeFiles(options.root);
    const withHost = { ...options, host: () => inventory };
    assert.throws(() => upgradeAdmissionForTesting(upgradeDeclaration, withHost), { code: 'STATE_UNAVAILABLE' });
    assert.deepEqual(storeFiles(options.root), before);
  });
}
test('maintenance upgrade lists active attempt identities with UPGRADE_BLOCKED and changes no store files', t => {
  const { directory, options } = upgradeFixture(t);
  const device = 'ABCDEF00-0000-4000-8000-000000000001';
  const db = new DatabaseSync(join(options.root, 'admission.sqlite'));
  try {
    db.prepare("INSERT INTO devices(device,state,generation,token,kind,attempt_id) VALUES (?,'active',1,'active-token','observed','entry-active')").run(device);
    db.prepare("INSERT INTO attempts(kind,id,device,digest,intent,token,generation,pid,incarnation,state) VALUES ('observed','entry-active',?,'digest','{}','active-token',1,?,'fixture-incarnation','active')").run(device, process.pid);
  } finally { db.close(); }
  const before = storeFiles(options.root);
  const path = join(directory, 'upgrade.json');
  writeFileSync(path, JSON.stringify(upgradeDeclaration), { mode: 0o600 });
  let output = '';
  assert.equal(runAdmissionMaintenance(['upgrade', path], { write: value => { output += value; } }, options), 3, output);
  const error = JSON.parse(output);
  assert.equal(error.code, 'UPGRADE_BLOCKED');
  assert.match(error.message, /observed.*entry-active/);
  assert.throws(() => upgradeAdmissionForTesting(upgradeDeclaration, options), error => {
    assert.ok(error instanceof AdmissionError);
    assert.equal(error.code, 'UPGRADE_BLOCKED');
    assert.match(error.message, /observed.*entry-active/);
    return true;
  });
  assert.deepEqual(storeFiles(options.root), before);
});

for (const kind of ['malformed', 'live'] as const) {
  test(`maintenance upgrade preserves ${kind} source leases and upgrades despite source refusal`, t => {
    const { directory, options } = upgradeFixture(t);
    mkdirSync(options.defaultRoots.leases, { mode: 0o700 });
    const leasePath = join(options.defaultRoots.leases, 'ABCDEF00-0000-4000-8000-000000000001.lock');
    const bytes = kind === 'malformed' ? '{bad JSON' : JSON.stringify({ pid: process.pid, token: 'fixture',
      deviceId: 'ABCDEF00-0000-4000-8000-000000000001', createdAt: '2026-10-19T00:00:00.000Z' });
    writeFileSync(leasePath, bytes, { mode: 0o600 });
    const report = preflightAdmissionForTesting(undefined, options);
    assert.equal(report.ready, false);
    assert.equal(report.sourceRefusal?.reason, kind === 'malformed' ? 'SOURCE_INCONSISTENT' : 'HOLDER_ALIVE');
    const path = join(directory, 'upgrade.json');
    writeFileSync(path, JSON.stringify(upgradeDeclaration), { mode: 0o600 });
    let output = '';
    assert.equal(runAdmissionMaintenance(['upgrade', path], { write: value => { output += value; } }, options), 0, output);
    const receipt = JSON.parse(output);
    assert.equal(receipt.kind, 'upgrade');
    assert.equal(receipt.to, 3);
    assert.deepEqual(receipt.preserved.before, receipt.preserved.after);
    assert.equal(readFileSync(leasePath, 'utf8'), bytes);
    assert.equal(upgradeAdmissionForTesting(upgradeDeclaration, options).id, receipt.id);
  });
}
test('import refusals carry exactly one closed reason', () => {
  const refusal=new AdmissionError('IMPORT_REFUSED','Legacy source is unsafe','SOURCE_UNSAFE');
  assert.equal(refusal.code,'IMPORT_REFUSED');
  assert.equal(refusal.reason,'SOURCE_UNSAFE');
  for(const reason of [undefined,'UNKNOWN',['SOURCE_UNSAFE','HOLDER_ALIVE']]) {
    assert.throws(()=>Reflect.construct(AdmissionError,['IMPORT_REFUSED','bad refusal',reason]),/exactly one import refusal reason/);
  }
});

test('maintenance upgrade prints a preserved-record receipt and backup for a schema 2 fixture', t => {
  const directory=realpathSync(mkdtempSync(join(tmpdir(),'jev-upgrade-entry-')));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const options={root:join(directory,'admission'),backend:'fake' as const,defaultRoots:{journal:join(directory,'journal'),leases:join(directory,'leases')}};
  migrateAdmissionForTesting({version:1,writersStopped:true,historicalRootsDeclaredOrExcluded:true,additionalJournalRoots:[],additionalLeaseRoots:[],excludedDevices:[]},{...options,schemaVersion:2});
  const path=join(directory,'upgrade.json');
  writeFileSync(path,JSON.stringify({version:1,kind:'upgrade',from:2,to:3,writersStopped:true}),{mode:0o600});
  let output='';
  assert.equal(runAdmissionMaintenance(['upgrade',path],{write:value=>{output+=value;}},options),0,output);
  const receipt=JSON.parse(output);
  assert.equal(receipt.kind,'upgrade');
  assert.deepEqual(receipt.preserved.before,receipt.preserved.after);
  assert.equal(receipt.to,3);
  assert.equal(typeof receipt.backup.path,'string');
});

function child(args: string[]) {
  const env = { ...process.env };
  delete env.TYPESAFE_API_KEY;
  delete env.NODE_OPTIONS;
  delete env.NODE_NO_WARNINGS;
  return spawnSync(process.execPath, ['--import', 'tsx', ...args], {
    cwd: process.cwd(), env, encoding: 'utf8', timeout: 5000,
  });
}
function help(path: string) {
  const result = child([path, '--help']);
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^Usage: node dist\/device\/admission-maintenance\.js migrate <declaration\.json>\n/);
  assert.match(result.stdout, /no destination override/);
  assert.match(result.stdout, /Sources are never rewritten or deleted/);
}

test('maintenance direct canonical entry prints offline help', () => help(entry));

test('maintenance file symlink entry prints the same offline help', t => {
  const root = mkdtempSync(join(tmpdir(), 'jev-maintenance-entry-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'package.json'), '{"type":"module"}', { mode: 0o600 });
  const alias = join(root, 'maintenance.ts');
  symlinkSync(entry, alias);
  help(alias);
});

test('maintenance directory alias entry prints the same offline help', t => {
  const root = mkdtempSync(join(tmpdir(), 'jev-maintenance-directory-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const alias = join(root, 'device');
  symlinkSync(dirname(entry), alias, 'dir');
  help(join(alias, 'admission-maintenance.ts'));
});

for (const hostEntry of [undefined, '/nonexistent/jev-maintenance-import-host.mjs']) {
  test(`maintenance import stays inert with ${hostEntry ? 'missing' : 'no'} host entry`, () => {
    const code = `process.argv[1] = ${JSON.stringify(hostEntry) ?? 'undefined'}; await import(${JSON.stringify(pathToFileURL(entry).href)}); process.stdout.write('import-inert\\n');`;
    const result = child(['--input-type=module', '-e', code]);
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'import-inert\n');
  });
}

test('maintenance preflight and status are read-only and upgrade repeats host checks', t => {
  const directory=realpathSync(mkdtempSync(join(tmpdir(),'jev-preflight-entry-')));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const options={root:join(directory,'admission'),backend:'fake' as const,defaultRoots:{journal:join(directory,'journal'),leases:join(directory,'leases')}};
  migrateAdmissionForTesting({version:1,writersStopped:true,historicalRootsDeclaredOrExcluded:true,additionalJournalRoots:[],additionalLeaseRoots:[],excludedDevices:[]},{...options,schemaVersion:2});
  let output='';
  assert.equal(runAdmissionMaintenance(['preflight'],{write:value=>{output+=value;}},options),0,output);
  assert.equal(JSON.parse(output).ready,true);
  const path=join(directory,'upgrade.json');
  writeFileSync(path,JSON.stringify({version:1,kind:'upgrade',from:2,to:3,writersStopped:true}),{mode:0o600});
  output='';
  const host=()=>({processes:[],handles:[{pid:99,path:join(options.root,'admission.sqlite')}],installs:[],failures:[]});
  assert.equal(runAdmissionMaintenance(['upgrade',path],{write:value=>{output+=value;}},{...options,host}),3,output);
  assert.equal(JSON.parse(output).code,'STATE_UNAVAILABLE');
  output='';
  assert.equal(runAdmissionMaintenance(['status'],{write:value=>{output+=value;}},options),0,output);
  assert.equal(JSON.parse(output).schemaVersion,2);
});
