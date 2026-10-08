import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { BRIDGE_VERSION } from '../src/version.js';
import { setupPublicFixture, fixtureCalls, actionRequest } from './fixtures/observed-cli-server.js';

export async function publicFixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'jev-public-'));
  const fixture = await setupPublicFixture(root);
  t.after(async () => { await fixture.cleanup(); await rm(root, { recursive: true, force: true }); });
  return { ...fixture, root, backendRoot: fixture.root };
}
function childCommand(root: string, command: string, argument: string, mode = 'observed', wait?: number, enabled = '1') {
  const env = { ...process.env, JEV_EXPERIMENTAL_OBSERVED: enabled, OBSERVED_FIXTURE_MODE: mode }; delete (env as NodeJS.ProcessEnv).TYPESAFE_API_KEY;
  const child = spawn(process.execPath, ['--import', 'tsx', 'tests/fixtures/observed-cli-server.ts', root, command, argument, ...(wait === undefined ? [] : [String(wait)])], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', bytes => { stdout += bytes; }); child.stderr.on('data', bytes => { stderr += bytes; });
  const result = new Promise<{code:number|null;stdout:string;stderr:string;reply:any}>(done => child.once('exit', code => {
    const lines = stdout.trim().split('\n'); assert.equal(lines.length, 1, stdout); done({ code, stdout, stderr, reply: JSON.parse(lines[0]!) });
  }));
  return { child, result };
}
async function prepare(t: TestContext) {
  const f = await publicFixture(t); const path = join(f.root, 'prepare.json'); await writeFile(path, JSON.stringify(f.request('one')));
  const result = await childCommand(f.root, 'observed-allocate', path).result;
  assert.equal(result.code, 0, result.stdout + result.stderr); assert.equal(result.reply.outcome, 'prepared'); assert.equal(result.reply.state, 'ready');
  return { ...f, allocationId: result.reply.allocationId, prepared: result.reply };
}
for (const [mode, outcome, code, touches] of [['observed', 'outcome_observed', 0, 1], ['already', 'already_satisfied', 0, 0], ['refused', 'refused', 3, 0], ['inconclusive', 'inconclusive', 2, 1], ['unresolved', null, 2, 0]] as const) {
  test(`separate allocation/action CLI processes render ${mode} with exact exit and no relaunch`, { timeout: 15000 }, async t => {
    const f = await prepare(t); const path = join(f.root, 'action.json');
    await writeFile(path, JSON.stringify(actionRequest(f.allocationId)));
    const before = fixtureCalls(f.root).filter(value => value !== 'open');
    const result = await childCommand(f.root, 'observed-action', path, mode === 'unresolved' ? 'unresolved' : mode).result;
    assert.equal(result.code, code, result.stdout + result.stderr); assert.equal(result.reply.outcome, outcome);
    assert.equal(result.reply.authority, mode === 'unresolved' ? 'unconfirmed' : 'committed');
    assert.equal(result.reply.disposition, 'started');
    const after = fixtureCalls(f.root).filter(value => value !== 'open').slice(before.length);
    assert.equal(after.filter(value => value === 'touch').length, mode === 'unresolved' ? 1 : touches);
    assert.ok(after.every(value => !['create', 'boot', 'install', 'launch-app', 'window'].includes(value)), JSON.stringify(after));
    assert.ok(!result.stdout.includes('Private vendor'));
    if (mode !== 'unresolved') {
      const retrieved = await childCommand(f.root, 'observed-action', path, mode).result;
      assert.equal(retrieved.reply.outcome, outcome); assert.equal(retrieved.reply.disposition, 'retrieved');
      assert.deepEqual(fixtureCalls(f.root).filter(value => value !== 'open').slice(before.length), after);
      const conflictPath = join(f.root, 'conflict.json'); await writeFile(conflictPath, JSON.stringify({ ...actionRequest(f.allocationId), timeoutMs: 6000 }));
      const conflict = await childCommand(f.root, 'observed-action', conflictPath).result;
      assert.equal(conflict.code, 3); assert.equal(conflict.reply.code, 'ACTION_ID_CONFLICT');
      assert.deepEqual(fixtureCalls(f.root).filter(value => value !== 'open').slice(before.length), after);
    }
  });
}
test('disabled CLI refuses new effects, retains ready reads/cancel/retire, and uses exact flag', async t => {
  const f = await prepare(t);
  for (const enabled of ['0', 'true', 'yes', '']) {
    const refused = await childCommand(f.root, 'observed-action', '/missing/request.json', 'observed', undefined, enabled).result;
    assert.equal(refused.code, 3); assert.equal(refused.reply.code, 'OBSERVED_DISABLED');
  }
  const read = await childCommand(f.root, 'observed-allocation', f.allocationId, 'observed', 0, '0').result;
  assert.equal(read.code, 0); assert.equal(read.reply.state, 'ready');
  const cancel = await childCommand(f.root, 'observed-allocation-cancel', f.allocationId, 'observed', undefined, '0').result;
  assert.equal(cancel.code, 0); assert.equal(cancel.reply.outcome, 'retired_unused');
  const retire = await childCommand(f.root, 'observed-retire', f.allocationId, 'observed', undefined, '0').result;
  assert.deepEqual(retire.reply, cancel.reply);
});
test('invalid config blocks fresh ready action but preserves immutable retrieval/conflict and reads', async t => {
  const f = await prepare(t); const path = join(f.root, 'action.json'); await writeFile(path, JSON.stringify(actionRequest(f.allocationId)));
  await writeFile(f.configPath, '{bad', { mode: 0o600 });
  const calls = fixtureCalls(f.root).filter(value => value !== 'open');
  const blocked = await childCommand(f.root, 'observed-action', path).result;
  assert.equal(blocked.reply.code, 'CONFIGURATION_ERROR'); assert.equal(blocked.reply.acceptance, 'no');
  assert.deepEqual(fixtureCalls(f.root).filter(value => value !== 'open'), calls);
  assert.equal((await childCommand(f.root, 'observed-allocation', f.allocationId).result).reply.state, 'ready');
  const original = await readFile(join(f.home, 'Library/Application Support/jev-ios-bridge/allocation.json'), 'utf8'); assert.equal(original, '{bad');
  await writeFile(f.configPath, JSON.stringify({ version: 1 }), { mode: 0o600 });
  const observed = await childCommand(f.root, 'observed-action', path, 'already').result; assert.equal(observed.reply.outcome, 'already_satisfied');
  await writeFile(f.configPath, '{bad', { mode: 0o600 });
  assert.equal((await childCommand(f.root, 'observed-action', path).result).reply.outcome, 'already_satisfied');
  await writeFile(path, JSON.stringify({ ...actionRequest(f.allocationId), timeoutMs: 6000 }));
  assert.equal((await childCommand(f.root, 'observed-action', path).result).reply.code, 'ACTION_ID_CONFLICT');
  assert.equal((await childCommand(f.root, 'observed-cancel', 'one', 'observed', undefined, '0').result).reply.outcome, 'already_satisfied');
  assert.equal((await childCommand(f.root, 'observed-retire', f.allocationId, 'observed', undefined, '0').result).reply.outcome, 'action_completed');
});

async function untilCall(root: string, operation: string, offset = 0) {
  const end=Date.now()+5000;
  while(!fixtureCalls(root).slice(offset).includes(operation)) { assert.ok(Date.now()<end,'Missing fake milestone '+operation);await new Promise(done=>setTimeout(done,20)); }
}
for(const [signal,code] of [['SIGINT',130],['SIGTERM',143]] as const) {
  test(`CLI ${signal} revokes owned action and returns ${code} without late input`,{timeout:15000},async t=>{
    const f=await prepare(t);const path=join(f.root,'action.json');await writeFile(path,JSON.stringify({...actionRequest(f.allocationId),timeoutMs:60000}));
    const before=fixtureCalls(f.root).length;
    const worker=childCommand(f.root,'observed-action',path,'pending');
    await untilCall(f.root,'snapshot-ui',before);
    const started=Date.now();worker.child.kill(signal);const stopped=await worker.result;
    assert.equal(stopped.code,code);assert.ok(Date.now()-started<6500);
    const current=await childCommand(f.root,'observed-report','one','observed',0,'0').result;
    assert.equal(current.reply.cancellationRequested,true);
    if(current.reply.authority==='committed') {assert.equal(current.reply.outcome,'inconclusive');assert.equal(current.reply.admission,'quarantined');}
    else {assert.equal(current.reply.outcome,null);assert.equal(current.reply.state,'unresolved');assert.ok(['active','quarantined','unknown'].includes(current.reply.admission));}
    assert.notEqual(current.reply.actionAttempted,true);assert.notEqual(current.reply.actionAcknowledged,true);
    assert.equal(fixtureCalls(f.root).slice(before).filter(value=>value==='touch').length,0);
  });
  test(`CLI ${signal} stops only a read wait with ${code}`,{timeout:20000},async t=>{
    const f=await prepare(t);const path=join(f.root,'action.json');await writeFile(path,JSON.stringify({...actionRequest(f.allocationId),timeoutMs:60000}));
    const before=fixtureCalls(f.root).length;const worker=childCommand(f.root,'observed-action',path,'pending');
    t.after(async()=>{if(worker.child.exitCode===null){worker.child.kill('SIGTERM');await worker.result;}});
    await untilCall(f.root,'snapshot-ui',before);
    const initial=(await childCommand(f.root,'observed-report','one','observed',0,'0').result).reply;
    const waiting=childCommand(f.root,'observed-report','one','observed',45000,'0');
    await new Promise(done=>setTimeout(done,350));waiting.child.kill(signal);const stopped=await waiting.result;
    assert.equal(stopped.code,code);assert.equal(stopped.reply.code,'WAIT_CANCELLED');
    const current=(await childCommand(f.root,'observed-report','one','observed',0,'0').result).reply;
    assert.deepEqual(current,initial);assert.equal(current.cancellationRequested,false);assert.equal(worker.child.exitCode,null);
    assert.equal(fixtureCalls(f.root).slice(before).filter(value=>value==='touch').length,0);
    worker.child.kill('SIGTERM');await worker.result;
  });
}
test('CLI shutdown cancels only owned active preparation and leaves ready parked stock intact',{timeout:15000},async t=>{
  const f=await publicFixture(t);const path=join(f.root,'prepare.json');await writeFile(path,JSON.stringify(f.request('one')));
  const child=childCommand(f.root,'observed-allocate',path,'pending-preparation');await untilCall(f.root,'boot');
  child.child.kill('SIGTERM');const stopped=await child.result;assert.equal(stopped.code,143);
  if(stopped.reply.authority==='committed'){assert.equal(stopped.reply.state,'quarantined');assert.equal(stopped.reply.outcome,'uncertain');}
  else {assert.equal(stopped.reply.outcome,null);assert.ok(['preparing','quarantined'].includes(stopped.reply.state));}
  assert.equal(stopped.reply.reservation.capacityHeld,true);assert.equal(stopped.reply.cancellationRequested,true);
  assert.equal(fixtureCalls(f.root).filter(value=>['install','launch-app','touch'].includes(value)).length,0);
  const read=(await childCommand(f.root,'observed-allocation',stopped.reply.allocationId,'observed',0,'0').result).reply;
  assert.deepEqual(read,stopped.reply);
});
test('actual CLI offline invalid/disabled argument errors are one safe JSON record without a key',async t=>{
  const root=await mkdtemp(join(tmpdir(),'jev-public-offline-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const env={...process.env,JEV_EXPERIMENTAL_OBSERVED:'0'};delete (env as NodeJS.ProcessEnv).TYPESAFE_API_KEY;
  for(const args of [['observed-action','/never-read','--json'],['observed-report','unsafe/id','--json'],['observed-allocation','bad','--json'],['observed-report','one','--json','--wait-ms','NaN'],['observed-action','/never-read','--json','--unknown-secret','private-value']]) {
    const child=spawn(process.execPath,['--import','tsx','src/cli.ts',...args],{env,cwd:process.cwd(),stdio:['ignore','pipe','pipe']});let stdout='';let stderr='';child.stdout.on('data',bytes=>{stdout+=bytes;});child.stderr.on('data',bytes=>{stderr+=bytes;});
    const code=await new Promise<number|null>(done=>child.once('exit',done));assert.equal(code,3);assert.equal(stdout.trim().split('\n').length,1);const reply=JSON.parse(stdout);
    assert.equal(reply.kind,'observed-operation-error');assert.ok(['OBSERVED_DISABLED','INVALID_REQUEST'].includes(reply.code));assert.ok(!stdout.includes('private-value'));assert.ok(!stderr.includes('private-value'));
  }
});

test('legacy command arguments named like observed commands retain legacy error rendering', async () => {
  const env = { ...process.env, JEV_EXPERIMENTAL_OBSERVED: '0' }; delete (env as NodeJS.ProcessEnv).TYPESAFE_API_KEY;
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'run', 'observed-action', '--json', '--unknown'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', bytes => { stdout += bytes; }); child.stderr.on('data', bytes => { stderr += bytes; });
  const code = await new Promise<number | null>(done => child.once('exit', done));
  assert.equal(code, 3); assert.equal(stdout, ''); assert.match(stderr, /Unknown option/);
});

test('concurrent preparation and action CLI retries share one durable owner and no repeated backend work', { timeout: 20000 }, async t => {
  const f = await publicFixture(t); const preparePath = join(f.root, 'prepare.json'); const request = f.request('one');
  await writeFile(preparePath, JSON.stringify(request));
  const allocations = await Promise.all([childCommand(f.root, 'observed-allocate', preparePath).result, childCommand(f.root, 'observed-allocate', preparePath).result]);
  assert.ok(allocations.every(value => value.reply.outcome === 'prepared' || (value.code === 2 && value.reply.state === 'preparing')), JSON.stringify(allocations));
  assert.equal(allocations[0]!.reply.allocationId, allocations[1]!.reply.allocationId);
  const allocationId = allocations[0]!.reply.allocationId;
  const prepared = await childCommand(f.root, 'observed-allocation', allocationId).result; assert.equal(prepared.reply.outcome, 'prepared');
  const calls = fixtureCalls(f.root).filter(value => value !== 'open'); assert.equal(calls.filter(value => value === 'create').length, 1);
  assert.equal(calls.filter(value => value === 'boot').length, 1); assert.equal(calls.filter(value => value === 'install').length, 1); assert.equal(calls.filter(value => value === 'launch-app').length, 1);
  const repeated = await childCommand(f.root, 'observed-allocate', preparePath).result; assert.equal(repeated.reply.allocationId, allocationId);
  assert.deepEqual(fixtureCalls(f.root).filter(value => value !== 'open'), calls);
  const conflictPath = join(f.root, 'prepare-conflict.json'); await writeFile(conflictPath, JSON.stringify({ ...request, timeoutMs: 6000 }));
  const conflict = await childCommand(f.root, 'observed-allocate', conflictPath).result; assert.equal(conflict.code, 3); assert.equal(conflict.reply.code, 'ACTION_ID_CONFLICT');
  assert.deepEqual(fixtureCalls(f.root).filter(value => value !== 'open'), calls);
  const actionPath = join(f.root, 'action.json'); await writeFile(actionPath, JSON.stringify(actionRequest(allocationId)));
  const actions = await Promise.all([childCommand(f.root, 'observed-action', actionPath).result, childCommand(f.root, 'observed-action', actionPath).result]);
  assert.ok(actions.every(value => value.code === 0 && value.reply.outcome === 'outcome_observed'), JSON.stringify(actions));
  assert.deepEqual(actions.map(value => value.reply.disposition).sort(), ['retrieved', 'started']);
  const after = fixtureCalls(f.root).filter(value => value !== 'open').slice(calls.length);
  assert.equal(after.filter(value => value === 'touch').length, 1); assert.equal(after.filter(value => value === 'snapshot-ui').length, 2);
  assert.ok(after.every(value => !['create', 'boot', 'install', 'launch-app', 'window'].includes(value)));
});

test('CLI strict request files reject malformed, versioned, extra and oversized inputs without opening authority', async t => {
  const f = await publicFixture(t); const path = join(f.root, 'invalid.json');
  for (const [text, code] of [['{bad', 'INVALID_REQUEST'], ['{"version":2}', 'UNSUPPORTED_VERSION'], [JSON.stringify({ ...actionRequest('ABCDEF00-0000-4000-8000-000000000099'), admissionRoot: '/secret' }), 'INVALID_REQUEST'], [' '.repeat(65537), 'INVALID_REQUEST']] as const) {
    await writeFile(path, text); const result = await childCommand(f.root, 'observed-action', path).result;
    assert.equal(result.code, 3); assert.equal(result.reply.code, code); assert.equal(result.reply.acceptanceKind, 'action'); assert.equal(result.reply.acceptance, 'no');
  }
  assert.deepEqual(fixtureCalls(f.root), []);
});

test('CLI executes through a bin symlink and its internal import remains inert', async t => {
  const root = await mkdtemp(join(tmpdir(), 'jev-public-bin-')); t.after(() => rm(root, { recursive: true, force: true }));
  const link = join(root, 'jev-ios-bridge'); await symlink(resolve('src/cli.ts'), link);
  const env = { ...process.env, JEV_EXPERIMENTAL_OBSERVED: '0' }; delete (env as NodeJS.ProcessEnv).TYPESAFE_API_KEY;
  for (const args of [['--import', 'tsx', link, '--version'], ['--import', 'tsx', '--input-type=module', '-e', "await import('./src/cli.ts'); process.stdout.write('imported\\n')"]]) {
    const child = spawn(process.execPath, args, { env, stdio: ['ignore', 'pipe', 'pipe'] }); let stdout = ''; let stderr = '';
    child.stdout.on('data', bytes => { stdout += bytes; }); child.stderr.on('data', bytes => { stderr += bytes; });
    const code = await new Promise<number | null>(done => child.once('exit', done));
    assert.equal(code, 0, stderr); assert.equal(stdout, args.includes('--version') ? BRIDGE_VERSION + '\n' : 'imported\n');
  }
});
