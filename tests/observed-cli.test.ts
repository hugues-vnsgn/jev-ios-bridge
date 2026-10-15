import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile, readFile, symlink, cp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { BRIDGE_VERSION } from '../src/version.js';
import { type PublicObservation, parseCli, allocation, snapshot, actionSnapshot, operationError, errorCode, replyKind, fixtureEvents, traceOracle, publicAuthority, publicPolicy } from './fixtures/public-contention.js';
import { Admission } from '../src/device/admission.js';
import { setupPublicFixture, fixtureCalls, actionRequest } from './fixtures/observed-cli-server.js';

export async function publicFixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'jev-public-'));
  const fixture = await setupPublicFixture(root);
  t.after(async () => { if (process.env.HOST_EVIDENCE_DIR) { const archive = join(process.env.HOST_EVIDENCE_DIR, root.split('/').at(-1)!); await mkdir(archive, { recursive: true }); await cp(root, join(archive, 'public'), { recursive: true }); await cp(fixture.root, join(archive, 'backend'), { recursive: true }); } await fixture.cleanup(); await rm(root, { recursive: true, force: true }); });
  const observations: PublicObservation[] = [];
  const command = (options: Omit<Parameters<typeof childCommand>[0], 'root' | 'observations'>) => childCommand({ root, observations, ...options });
  return { ...fixture, root, backendRoot: fixture.root, observations, command };
}
function childCommand({ root, observations, command, argument, mode = 'observed', wait, enabled = '1', signalExit = false }: { root: string; observations: PublicObservation[]; command: string; argument: string; mode?: string; wait?: number; enabled?: string; signalExit?: boolean }) {
  let input: unknown = command === 'observed-report' || command === 'observed-cancel' ? { actionId: argument } : { allocationId: argument };
  if (command === 'observed-allocate' || command === 'observed-action') { try { input = JSON.parse(readFileSync(argument, 'utf8')); } catch { input = null; } }
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, NODE_NO_WARNINGS: '1', JEV_EXPERIMENTAL_OBSERVED: enabled, OBSERVED_FIXTURE_MODE: mode };
  const child = spawn(process.execPath, ['--import', 'tsx', 'tests/fixtures/observed-cli-server.ts', root, command, argument, ...(wait === undefined ? [] : [String(wait)])], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', bytes => { stdout += bytes; }); child.stderr.on('data', bytes => { stderr += bytes; });
  const result = new Promise<{code:number|null;stdout:string;stderr:string;reply:ReturnType<typeof parseCli>; signal: NodeJS.Signals | null; actor: number}>((done, reject) => {
    child.once('error', reject);
    child.once('close', async (code, signal) => {
      try {
        await writeFile(join(root, `cli-${child.pid}.json`), JSON.stringify({ command, argument, actor: child.pid, code, signal, stdout, stderr }), { mode: 0o600 });
        const reply = parseCli({ code, signal, stdout, stderr, signalExit }); observations.push({ operation: command, argument: input, reply });
        done({ code, signal, actor: child.pid!, stdout, stderr, reply });
      } catch (error) { reject(error); }
    });
  });
  const cap = setTimeout(() => child.kill('SIGKILL'), 20000); void result.finally(() => clearTimeout(cap)).catch(() => {});
  return { child, result };
}
async function prepare(t: TestContext) {
  const f = await publicFixture(t); const path = join(f.root, 'prepare.json'); await writeFile(path, JSON.stringify(f.request('one')));
  const result = await f.command({ command: 'observed-allocate', argument: path }).result;
  assert.equal(result.code, 0, result.stdout + result.stderr); assert.equal(snapshot(result.reply).outcome, 'prepared'); assert.equal(snapshot(result.reply).state, 'ready');
  return { ...f, allocationId: allocation(result.reply).allocationId, prepared: allocation(result.reply) };
}
for (const [mode, outcome, code, touches] of [['observed', 'outcome_observed', 0, 1], ['already', 'already_satisfied', 0, 0], ['refused', 'refused', 3, 0], ['inconclusive', 'inconclusive', 2, 1], ['unresolved', null, 2, 0]] as const) {
  test(`separate allocation/action CLI processes render ${mode} with exact exit and no relaunch`, { timeout: 15000 }, async t => {
    const f = await prepare(t); const path = join(f.root, 'action.json');
    await writeFile(path, JSON.stringify(actionRequest(f.allocationId)));
    const before = fixtureCalls(f.root).filter(value => value !== 'open');
    const result = await f.command({ command: 'observed-action', argument: path, mode: mode === 'unresolved' ? 'unresolved' : mode }).result;
    assert.equal(result.code, code, result.stdout + result.stderr); assert.equal(snapshot(result.reply).outcome, outcome);
    assert.equal(snapshot(result.reply).authority, mode === 'unresolved' ? 'unconfirmed' : 'committed');
    assert.equal(actionSnapshot(result.reply).disposition, 'started');
    const after = fixtureCalls(f.root).filter(value => value !== 'open').slice(before.length);
    assert.equal(after.filter(value => value === 'touch').length, mode === 'unresolved' ? 1 : touches);
    assert.ok(after.every(value => !['create', 'boot', 'install', 'launch-app', 'window'].includes(value)), JSON.stringify(after));
    assert.ok(!result.stdout.includes('Private vendor'));
    if (mode !== 'unresolved') {
      const retrieved = await f.command({ command: 'observed-action', argument: path, mode: mode }).result;
      assert.equal(snapshot(retrieved.reply).outcome, outcome); assert.equal(actionSnapshot(retrieved.reply).disposition, 'retrieved');
      assert.deepEqual(fixtureCalls(f.root).filter(value => value !== 'open').slice(before.length), after);
      const conflictPath = join(f.root, 'conflict.json'); await writeFile(conflictPath, JSON.stringify({ ...actionRequest(f.allocationId), timeoutMs: 6000 }));
      const conflict = await f.command({ command: 'observed-action', argument: conflictPath }).result;
      assert.equal(conflict.code, 3); assert.equal(errorCode(conflict.reply), 'ACTION_ID_CONFLICT');
      assert.deepEqual(fixtureCalls(f.root).filter(value => value !== 'open').slice(before.length), after);
    }
  });
}
test('disabled CLI refuses new effects, retains ready reads/cancel/retire, and uses exact flag', async t => {
  const f = await prepare(t);
  for (const enabled of ['0', 'true', 'yes', '']) {
    const refused = await f.command({ command: 'observed-action', argument: '/missing/request.json', mode: 'observed', enabled: enabled }).result;
    assert.equal(refused.code, 3); assert.equal(errorCode(refused.reply), 'OBSERVED_DISABLED');
  }
  const read = await f.command({ command: 'observed-allocation', argument: f.allocationId, mode: 'observed', wait: 0, enabled: '0' }).result;
  assert.equal(read.code, 0); assert.equal(snapshot(read.reply).state, 'ready');
  const cancel = await f.command({ command: 'observed-allocation-cancel', argument: f.allocationId, mode: 'observed', enabled: '0' }).result;
  assert.equal(cancel.code, 0); assert.equal(snapshot(cancel.reply).outcome, 'retired_unused');
  const retire = await f.command({ command: 'observed-retire', argument: f.allocationId, mode: 'observed', enabled: '0' }).result;
  assert.deepEqual(retire.reply, cancel.reply);
});
test('invalid config blocks fresh ready action but preserves immutable retrieval/conflict and reads', async t => {
  const f = await prepare(t); const path = join(f.root, 'action.json'); await writeFile(path, JSON.stringify(actionRequest(f.allocationId)));
  await writeFile(f.configPath, '{bad', { mode: 0o600 });
  const calls = fixtureCalls(f.root).filter(value => value !== 'open');
  const blocked = await f.command({ command: 'observed-action', argument: path }).result;
  assert.equal(errorCode(blocked.reply), 'CONFIGURATION_ERROR'); assert.equal(operationError(blocked.reply).acceptance, 'no');
  assert.deepEqual(fixtureCalls(f.root).filter(value => value !== 'open'), calls);
  assert.equal(snapshot((await f.command({ command: 'observed-allocation', argument: f.allocationId }).result).reply).state, 'ready');
  const original = await readFile(join(f.home, 'Library/Application Support/jev-ios-bridge/allocation.json'), 'utf8'); assert.equal(original, '{bad');
  await writeFile(f.configPath, JSON.stringify({ version: 1 }), { mode: 0o600 });
  const observed = await f.command({ command: 'observed-action', argument: path, mode: 'already' }).result; assert.equal(snapshot(observed.reply).outcome, 'already_satisfied');
  await writeFile(f.configPath, '{bad', { mode: 0o600 });
  assert.equal(snapshot((await f.command({ command: 'observed-action', argument: path }).result).reply).outcome, 'already_satisfied');
  await writeFile(path, JSON.stringify({ ...actionRequest(f.allocationId), timeoutMs: 6000 }));
  assert.equal(errorCode((await f.command({ command: 'observed-action', argument: path }).result).reply), 'ACTION_ID_CONFLICT');
  assert.equal(snapshot((await f.command({ command: 'observed-cancel', argument: 'one', mode: 'observed', enabled: '0' }).result).reply).outcome, 'already_satisfied');
  assert.equal(snapshot((await f.command({ command: 'observed-retire', argument: f.allocationId, mode: 'observed', enabled: '0' }).result).reply).outcome, 'action_completed');
});

async function untilCall(root: string, operation: string, offset = 0) {
  const end=Date.now()+5000;
  while(!fixtureCalls(root).slice(offset).includes(operation)) { assert.ok(Date.now()<end,'Missing fake milestone '+operation);await new Promise(done=>setTimeout(done,20)); }
}
async function untilReadWait(root: string, pid: number) {
  const end = Date.now() + 5000;
  while (true) {
    try { assert.equal(await readFile(join(root, `read-wait-${pid}`), 'utf8'), 'ready'); return; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    assert.ok(Date.now() < end, 'Missing read-wait readiness milestone');
    await new Promise(done => setTimeout(done, 20));
  }
}
for(const [signal,code] of [['SIGINT',130],['SIGTERM',143]] as const) {
  test(`CLI ${signal} revokes owned action and returns ${code} without late input`,{timeout:15000},async t=>{
    const f=await prepare(t);const path=join(f.root,'action.json');await writeFile(path,JSON.stringify({...actionRequest(f.allocationId),timeoutMs:60000}));
    const before=fixtureCalls(f.root).length;
    const worker=f.command({ command: 'observed-action', argument: path, mode: 'pending', enabled: '1', signalExit: true });
    await untilCall(f.root,'snapshot-ui',before);
    const started=Date.now();worker.child.kill(signal);const stopped=await worker.result;
    assert.equal(stopped.code,code);assert.ok(Date.now()-started<6500);
    const current=await f.command({ command: 'observed-report', argument: 'one', mode: 'observed', wait: 0, enabled: '0' }).result;
    assert.equal(snapshot(current.reply).cancellationRequested,true);
    if(snapshot(current.reply).authority==='committed') {assert.equal(snapshot(current.reply).outcome,'inconclusive');assert.equal(actionSnapshot(current.reply).admission,'quarantined');}
    else {assert.equal(snapshot(current.reply).outcome,null);assert.equal(snapshot(current.reply).state,'unresolved');assert.ok(['active','quarantined','unknown'].includes(actionSnapshot(current.reply).admission));}
    assert.notEqual(actionSnapshot(current.reply).actionAttempted,true);assert.notEqual(actionSnapshot(current.reply).actionAcknowledged,true);
    assert.equal(fixtureCalls(f.root).slice(before).filter(value=>value==='touch').length,0);
  });
  test(`CLI ${signal} stops only a read wait with ${code}`,{timeout:20000},async t=>{
    const f=await prepare(t);const path=join(f.root,'action.json');await writeFile(path,JSON.stringify({...actionRequest(f.allocationId),timeoutMs:60000}));
    const before=fixtureCalls(f.root).length;const worker=f.command({ command: 'observed-action', argument: path, mode: 'pending', enabled: '1', signalExit: true });
    t.after(async()=>{if(worker.child.exitCode===null){worker.child.kill('SIGTERM');await worker.result;}});
    await untilCall(f.root,'snapshot-ui',before);
    const initial=(await f.command({ command: 'observed-report', argument: 'one', mode: 'observed', wait: 0, enabled: '0' }).result).reply;
    const waiting=f.command({ command: 'observed-report', argument: 'one', mode: 'observed', wait: 45000, enabled: '0', signalExit: true });
    await untilReadWait(f.root, waiting.child.pid!);waiting.child.kill(signal);const stopped=await waiting.result;
    assert.equal(stopped.code,code);assert.equal(errorCode(stopped.reply),'WAIT_CANCELLED');
    const current=(await f.command({ command: 'observed-report', argument: 'one', mode: 'observed', wait: 0, enabled: '0' }).result).reply;
    assert.deepEqual(current,initial);assert.equal(snapshot(current).cancellationRequested,false);assert.equal(worker.child.exitCode,null);
    assert.equal(fixtureCalls(f.root).slice(before).filter(value=>value==='touch').length,0);
    worker.child.kill('SIGTERM');await worker.result;
  });
}
test('CLI shutdown cancels only owned active preparation and leaves ready parked stock intact',{timeout:15000},async t=>{
  const f=await publicFixture(t);const path=join(f.root,'prepare.json');await writeFile(path,JSON.stringify(f.request('one')));
  const child=f.command({ command: 'observed-allocate', argument: path, mode: 'pending-preparation', enabled: '1', signalExit: true });await untilCall(f.root,'boot');
  child.child.kill('SIGTERM');const stopped=await child.result;assert.equal(stopped.code,143);
  if(snapshot(stopped.reply).authority==='committed'){assert.equal(snapshot(stopped.reply).state,'quarantined');assert.equal(snapshot(stopped.reply).outcome,'uncertain');}
  else {assert.equal(snapshot(stopped.reply).outcome,null);assert.ok(['preparing','quarantined'].includes(snapshot(stopped.reply).state));}
  assert.equal(allocation(stopped.reply).reservation.capacityHeld,true);assert.equal(snapshot(stopped.reply).cancellationRequested,true);
  assert.equal(fixtureCalls(f.root).filter(value=>['install','launch-app','touch'].includes(value)).length,0);
  const read=(await f.command({ command: 'observed-allocation', argument: allocation(stopped.reply).allocationId, mode: 'observed', wait: 0, enabled: '0' }).result).reply;
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

test('concurrent CLI preparation has complete closed public authority', { timeout: 20000 }, async t => {
  const f = await publicFixture(t); const request = f.request('one'); const path = join(f.root, 'prepare.json'); await writeFile(path, JSON.stringify(request));
  const observations = await Promise.all([0,1].map(async () => ({ request, result: await f.command({ command: 'observed-allocate', argument: path }).result })));
  publicPolicy({ observations: observations.map(o => ({ operation: 'observed-allocate', request: o.request, reply: o.result.reply })) });
  const events = fixtureEvents(f.root); traceOracle({ events, actors: observations.map(o => o.result.actor) });
  publicAuthority({ admission: Admission.forTesting({ root: f.store, backend: 'fake', initialize: false }), requests: observations.map(o => o.request), observations: f.observations, events });
});
test('concurrent CLI action has complete closed public authority', { timeout: 20000 }, async t => {
  const f = await prepare(t); const admission = Admission.forTesting({ root: f.store, backend: 'fake', initialize: false }); const baseline = admission.readAllocation(f.allocationId)!;
  const request = actionRequest(f.allocationId); const path = join(f.root, 'action.json'); await writeFile(path, JSON.stringify(request));
  const observations = await Promise.all([0,1].map(async () => ({ request, result: await f.command({ command: 'observed-action', argument: path }).result })));
  publicPolicy({ observations: observations.map(o => ({ operation: 'observed-action', request: o.request, reply: o.result.reply })) });
  const events = fixtureEvents(f.root); traceOracle({ events, actors: [...new Set(events.map(e => e.actor))] }); publicAuthority({ admission, requests: [f.request('one')], baseline, action: request, observations: f.observations, events });
});
test('ordered independent CLI duplicates retain useful preparation and one action', { timeout: 20000 }, async t => {
  const f = await prepare(t); const admission = Admission.forTesting({ root: f.store, backend: 'fake', initialize: false }); const baseline = admission.readAllocation(f.allocationId)!;
  const preparePath = join(f.root, 'prepare.json'); const duplicate = await f.command({ command: 'observed-allocate', argument: preparePath }).result; assert.deepEqual(allocation(duplicate.reply), f.prepared);
  const calls = fixtureCalls(f.root).filter(op => op !== 'open'); for (const operation of ['create','boot','install','launch-app']) assert.equal(calls.filter(op => op === operation).length, 1);
  const conflictPath = join(f.root, 'prepare-conflict.json'); await writeFile(conflictPath, JSON.stringify({ ...f.request('one'), timeoutMs: 6000 }));
  const conflict = await f.command({ command: 'observed-allocate', argument: conflictPath }).result; assert.equal(conflict.code, 3); assert.equal(errorCode(conflict.reply), 'ACTION_ID_CONFLICT'); assert.deepEqual(admission.readAllocation(f.allocationId), baseline); assert.deepEqual(fixtureCalls(f.root).filter(op => op !== 'open'), calls);
  const request = actionRequest(f.allocationId); const path = join(f.root, 'action.json'); await writeFile(path, JSON.stringify(request));
  const first = await f.command({ command: 'observed-action', argument: path }).result; assert.equal(first.code, 0); assert.equal(actionSnapshot(first.reply).outcome, 'outcome_observed'); assert.equal(actionSnapshot(first.reply).disposition, 'started');
  const repeated = await f.command({ command: 'observed-action', argument: path }).result; assert.equal(repeated.code, 0); assert.equal(actionSnapshot(repeated.reply).disposition, 'retrieved'); assert.equal(actionSnapshot(repeated.reply).outcome, 'outcome_observed');
  const after = fixtureCalls(f.root).filter(op => op !== 'open').slice(calls.length); assert.equal(after.filter(op => op === 'touch').length, 1); assert.equal(after.filter(op => op === 'snapshot-ui').length, 2); assert.ok(after.every(op => !['create','boot','install','launch-app','window'].includes(op)));
  const terminal = admission.readAction('one'); const beforeRead = fixtureCalls(f.root).filter(op => op !== 'open'); const disabled = await f.command({ command: 'observed-report', argument: 'one', mode: 'observed', wait: 0, enabled: '0' }).result; assert.equal(actionSnapshot(disabled.reply).outcome, 'outcome_observed'); assert.deepEqual(admission.readAction('one'), terminal); assert.deepEqual(fixtureCalls(f.root).filter(op => op !== 'open'), beforeRead);
  const events = fixtureEvents(f.root); traceOracle({ events, actors: [...new Set(events.map(e => e.actor))] }); publicAuthority({ admission, requests: [f.request('one')], baseline, action: request, observations: f.observations, events, requireOutcome: 'action_completed' });
});

test('CLI strict request files reject malformed, versioned, extra and oversized inputs without opening authority', async t => {
  const f = await publicFixture(t); const path = join(f.root, 'invalid.json');
  for (const [text, code] of [['{bad', 'INVALID_REQUEST'], ['{"version":2}', 'UNSUPPORTED_VERSION'], [JSON.stringify({ ...actionRequest('ABCDEF00-0000-4000-8000-000000000099'), admissionRoot: '/secret' }), 'INVALID_REQUEST'], [' '.repeat(65537), 'INVALID_REQUEST']] as const) {
    await writeFile(path, text); const result = await f.command({ command: 'observed-action', argument: path }).result;
    assert.equal(result.code, 3); assert.equal(errorCode(result.reply), code); assert.equal(operationError(result.reply).acceptanceKind, 'action'); assert.equal(operationError(result.reply).acceptance, 'no');
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

for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]] as const) {
  test(`CLI ${signal} exits after bounded close despite an unsettled fake active resource`, { timeout: 15000 }, async t => {
    const f = await prepare(t); const path = join(f.root, 'resource-action.json'); await writeFile(path, JSON.stringify({ ...actionRequest(f.allocationId), timeoutMs: 60000 }));
    const before = fixtureCalls(f.root).length; const worker = f.command({ command: 'observed-action', argument: path, mode: 'pending-resource', enabled: '1', signalExit: true });
    try {
      await untilCall(f.root, 'resource-live', before); const start = Date.now(); worker.child.kill(signal);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const stopped = await Promise.race([worker.result, new Promise<null>(done => { timer = setTimeout(() => done(null), 6500); })]);
      clearTimeout(timer); assert.ok(stopped, 'CLI remains alive after its finalization budget'); assert.equal(stopped.code, code); assert.ok(Date.now() - start < 6500);
      assert.equal(stopped.stdout.trim().split('\n').length, 1);
      if (replyKind(stopped.reply) === 'observed-operation-error') assert.equal(errorCode(stopped.reply), 'WAIT_CANCELLED');
      else assert.equal(snapshot(stopped.reply).cancellationRequested, true);
      const current = (await f.command({ command: 'observed-report', argument: 'one', mode: 'observed', wait: 0, enabled: '0' }).result).reply;
      assert.equal(snapshot(current).cancellationRequested, true); assert.notEqual(actionSnapshot(current).actionAttempted, true); assert.notEqual(actionSnapshot(current).actionAcknowledged, true);
      if (snapshot(current).authority === 'committed') { assert.equal(snapshot(current).outcome, 'inconclusive'); assert.equal(actionSnapshot(current).admission, 'quarantined'); }
      else { assert.equal(snapshot(current).outcome, null); assert.equal(current.state, 'unresolved'); }
      assert.equal(fixtureCalls(f.root).slice(before).filter(value => value === 'touch').length, 0);
    } finally { if (worker.child.exitCode === null) { worker.child.kill('SIGKILL'); await worker.result; } }
  });
}
