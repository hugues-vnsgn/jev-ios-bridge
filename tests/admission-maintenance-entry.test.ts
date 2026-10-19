import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { runAdmissionMaintenance } from '../src/device/admission-maintenance.js';
import { migrateAdmissionForTesting } from '../src/device/admission-migration.js';
import { AdmissionError } from '../src/device/admission.js';

const entry = realpathSync(resolve('src/device/admission-maintenance.ts'));
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
