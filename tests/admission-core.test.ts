import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtempSync, rmSync, realpathSync, mkdirSync, lstatSync, readFileSync, statSync, chmodSync, symlinkSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Admission, canonicalDevice, type AdmissionRequest, type FenceRequest, type RecoveryClaim } from '../src/device/admission.js';

import { messageSchema, commandSchema, faultSchema, requireAcquisition, type CoreReply, type CommandInput, type Acquisition, type Finalization, type Control } from './fixtures/admission-core-protocol.js';

const device = 'abcdef00-0000-4000-8000-000000000001';
const request = (id: string, udid = device): AdmissionRequest => ({ device: udid, attempt: { kind: 'observed', id }, digest: 'digest', intent: { tap: 'button' } });

test('admission startup has no process effects and the first ownership use reads its incarnation once', t => {
  const { root } = fixture(t);
  const child = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import childProcess from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    const calls = [];
    childProcess.execFileSync = (...args) => { calls.push(args); return 'recorded-process-start'; };
    syncBuiltinESMExports();
    const { Admission, canonicalDevice } = await import('./src/device/admission.ts');
    const admission = Admission.forTesting({ root: process.argv[1], backend: 'fake', initialize: false });
    canonicalDevice(process.argv[2]);
    assert.equal(calls.length, 0, 'Startup and validation must not read a process');
    const first = admission.acquire({ device: process.argv[2], attempt: { kind: 'legacy', id: 'first' }, digest: 'same', intent: {} });
    const second = admission.acquire({ device: 'abcdef00-0000-4000-8000-000000000002', attempt: { kind: 'legacy', id: 'second' }, digest: 'same', intent: {} });
    assert.equal(first.kind, 'acquired');
    assert.equal(second.kind, 'acquired');
    assert.deepEqual(first.claim.identity.process, second.claim.identity.process);
    assert.equal(first.claim.identity.process.incarnation, 'recorded-process-start');
    assert.equal(calls.length, 1, 'Ownership must reuse one process incarnation');
    assert.equal(calls[0][0], '/bin/ps');
  `, root, device], { cwd: process.cwd(), env: { PATH: process.env.PATH ?? '' }, encoding: 'utf8', timeout: 10_000 });
  assert.equal(child.status, 0, child.stderr);
});

test('different host timezones cannot turn a live owner into an abandoned generation',t=>{
  const {root,admission}=fixture(t);
  const acquired=admission.acquire(request('timezone-owner'));
  if(acquired.kind!=='acquired')assert.fail('Expected owner');
  for(const timezone of ['UTC','Pacific/Honolulu']) {
    const child=spawnSync(process.execPath,['--import',import.meta.resolve('tsx'),'--input-type=module','-e',`
      import {Admission} from './src/device/admission.ts';
      const admission=Admission.forTesting({root:process.argv[1],backend:'fake',initialize:false});
      console.log(JSON.stringify(admission.acquire({device:process.argv[2],attempt:{kind:'legacy',id:process.argv[3]},digest:'same',intent:{}})));
    `,root,device,timezone],{cwd:process.cwd(),env:{PATH:process.env.PATH??'',TZ:timezone,LC_ALL:'C'},encoding:'utf8',timeout:5000});
    assert.equal(child.status,0,child.stderr);
    assert.deepEqual(JSON.parse(child.stdout),{kind:'refused',reason:'DEVICE_BUSY'});
  }
  assert.equal(admission.readAttempt(request('timezone-owner').attempt)?.state,'active');
});

test('dispatch records a component and outstanding command before sending, then settles once', async t => {
  const { admission } = fixture(t);
  const acquired = admission.acquire(request('record-before-send'));
  if (acquired.kind !== 'acquired') assert.fail('Expected owner');
  const owner = acquired.claim.identity;
  const session = acquired.claim.bindDriver('fake');
  await session.dispatch('capture', async () => {
    const generation = admission.readGeneration(owner);
    assert.equal(generation.commands.length, 1);
    assert.equal(generation.commands[0]?.state, 'outstanding');
    assert.equal(generation.components.length, 1);
    assert.equal(generation.commands[0]?.componentId, generation.components[0]?.id);
    assert.equal(generation.inventoryUnknownReason, null);
  });
  assert.equal(admission.readGeneration(owner).commands[0]?.state, 'settled');
});

test('closure makes outstanding commands uncertain and late replies only append observations', async t => {
  const { admission } = fixture(t);
  const acquired = admission.acquire(request('close-outstanding'));
  if (acquired.kind !== 'acquired') assert.fail('Expected owner');
  const session = acquired.claim.bindDriver('fake');
  let complete!: () => void;
  const pending = session.dispatch('capture', () => new Promise<void>(resolve => { complete = resolve; }));
  const terminal = { outcome: 'inconclusive' as const, disposition: 'quarantined' as const, payload: {}, evidenceRefs: [] };
  assert.equal(acquired.claim.finalize(terminal).authority, 'committed');
  const closed = admission.readGeneration(acquired.claim.identity);
  assert.equal(closed.commands[0]?.state, 'uncertain');
  assert.equal(typeof closed.dispatchClosedAt, 'number');
  const capacity = admission.readAllocationCapacity();
  complete(); await pending;
  const late = admission.readGeneration(acquired.claim.identity);
  assert.equal(late.commands[0]?.state, 'uncertain');
  assert.deepEqual(late.observations.map(observation => observation.commandId), [closed.commands[0]?.id]);
  assert.deepEqual(admission.readAttempt(request('close-outstanding').attempt)?.terminal, terminal);
  assert.deepEqual(admission.readAllocationCapacity(), capacity);
  assert.equal(admission.inspect(device)?.state, 'quarantined');
});

test('a generation-bound receipt frees an inconclusive lease without changing its outcome', async t => {
  const { root } = fixture(t);
  const admission = Admission.forTesting({ root, backend: 'fake', ownerLiveness: () => 'dead' });
  const acquired = admission.acquire(request('evidenced-release'));
  if (acquired.kind !== 'acquired') assert.fail('Expected owner');
  const claim = acquired.claim;
  claim.registerComponent({ id: 'stream', kind: 'host-process', process: { pid: 123456, incarnation: 'start-one' } });
  const issued = claim.issue({ requestId: 'read-1', componentId: 'stream', operation: 'capture', payload: {} });
  assert.equal(issued.kind, 'issued');
  const candidate = { outcome: 'inconclusive' as const, disposition: 'quarantined' as const, payload: {}, evidenceRefs: [] };
  assert.equal(claim.closeDispatch(candidate).authority, 'committed');
  const before = admission.readAttempt(claim.identity.attempt);
  const capacity = admission.readAllocationCapacity();
  const proof: FenceRequest = { requestId: 'stop-1', kind: 'stop', commands: [issued.command.id],
    components: [{ componentId: 'stream', proof: { kind: 'host-process-exited', process: { pid: 123456, incarnation: 'start-one' }, evidenceRefs: ['/evidence/stream-exited.json'] } }] };
  const receipt = admission.submitFence(claim.identity, proof);
  assert.equal(receipt.owner.token, claim.identity.token);
  assert.equal(admission.inspect(device)?.state, 'available');
  assert.deepEqual(admission.readAttempt(claim.identity.attempt), before);
  assert.deepEqual(admission.readAllocationCapacity(), capacity);
  assert.equal(admission.readGeneration(claim.identity).commands[0]?.state, 'uncertain');
  const bytes = readFileSync(join(root, 'admission.sqlite'));
  assert.deepEqual(admission.submitFence(claim.identity, proof), receipt);
  assert.deepEqual(readFileSync(join(root, 'admission.sqlite')), bytes);
});

test('receipt refusals follow the specified order and change no records', async t => {
  const { root, admission } = fixture(t);
  const acquired = admission.acquire(request('ordered-fence'));
  if (acquired.kind !== 'acquired') assert.fail('Expected owner');
  const claim = acquired.claim;
  const session = claim.bindDriver('fake');
  await session.dispatch('capture', async () => {});
  const generation = admission.readGeneration(claim.identity);
  const command = generation.commands[0]!;
  const proof: FenceRequest = { requestId: 'ordered-stop', kind: 'stop', commands: [],
    components: [{ componentId: command.componentId!, proof: { kind: 'completed-command', commandId: command.id } }] };
  const unchanged = (owner: typeof claim.identity, receipt: FenceRequest, code: string) => {
    const before = readFileSync(join(root, 'admission.sqlite'));
    assert.throws(() => admission.submitFence(owner, receipt), { code });
    assert.deepEqual(readFileSync(join(root, 'admission.sqlite')), before);
  };
  unchanged({ ...claim.identity, generation: 999 }, { ...proof, components: [] }, 'STALE_OWNER');
  unchanged(claim.identity, { ...proof, components: [] }, 'UNBOUND_PROOF');
  unchanged(claim.identity, { ...proof, kind: 'maintenance-lift' }, 'NOT_COVERABLE');
  unchanged(claim.identity, proof, 'DISPATCH_OPEN');
  claim.closeDispatch({ outcome: 'inconclusive', disposition: 'quarantined', payload: {}, evidenceRefs: [] });
  unchanged(claim.identity, { ...proof, components: [{ ...proof.components[0]!, proof: { kind: 'completed-command', commandId: 'unrelated' } }] }, 'COVERAGE_INCOMPLETE');
  assert.equal(admission.submitFence(claim.identity, proof).requestId, 'ordered-stop');
  const next = admission.acquire(request('after-fence'));
  if (next.kind !== 'acquired') assert.fail('Expected successor');
  unchanged(claim.identity, { ...proof, requestId: 'stale-stop' }, 'STALE_OWNER');
});

test('first emulator admission checks live provenance against legacy names and stores admitted attributes', t => {
  const { root, admission } = fixture(t);
  const provenance = { avdName: 'Pixel_Private', avdId: 'Pixel_Private', directory: { device: '1', inode: '42' },
    version: { value: '36.2.0', source: 'running-sdk-binary' as const }, process: { pid: 123456, startedAt: 'start' } };
  const input: AdmissionRequest = { ...request('provenance', '/private/avds/Pixel.avd'), category: 'android-emulator', provenance };
  const db = new DatabaseSync(join(root,'admission.sqlite'));
  try { db.prepare("INSERT INTO quarantines(id,legacy_name,kind,cause,created_at,evidence) VALUES ('old-name','PIXEL_PRIVATE','historical','legacy-lease',1,'{}')").run(); }
  finally { db.close(); }
  const before = readFileSync(join(root,'admission.sqlite'));
  assert.deepEqual(admission.acquire(input), { kind: 'refused', reason: 'DEVICE_QUARANTINED' });
  assert.deepEqual(readFileSync(join(root,'admission.sqlite')), before);
  const accepted = admission.acquire({ ...input, attempt: { kind: 'legacy', id: 'different-name' }, provenance: { ...provenance, avdName: 'Another_Private' } });
  if (accepted.kind !== 'acquired') assert.fail('Expected unrelated emulator');
  assert.deepEqual(admission.readDeviceAttributes({ category: 'android-emulator', value: input.device }), { ...provenance, avdName: 'Another_Private' });
});

test('unknown inventory, missing command coverage and unknown creation retain their refusal codes', t => {
  const { admission } = fixture(t);
  for (const [suffix, uncertainty, expected] of [['missing', null, 'COMMANDS_UNFENCED'], ['inventory', 'probe-gap', 'COVERAGE_UNKNOWN'], ['creation', 'unknown-creation', 'NOT_COVERABLE']] as const) {
    const input = request(`coverage-${suffix}`, `ABCDEF00-0000-4000-8000-00000000000${suffix==='missing'?3:suffix==='inventory'?4:5}`);
    const acquired = admission.acquire(input);
    if (acquired.kind !== 'acquired') assert.fail('Expected owner');
    acquired.claim.registerComponent({ id: suffix, kind: 'host-process', process: { pid: 123456, incarnation: 'start' } });
    acquired.claim.issue({ requestId: suffix, componentId: suffix, operation: 'read', payload: {} });
    if (uncertainty) acquired.claim.markInventoryUnknown(uncertainty);
    acquired.claim.closeDispatch({ outcome: 'inconclusive', disposition: 'quarantined', payload: {}, evidenceRefs: [] });
    assert.throws(() => admission.submitFence(acquired.claim.identity, { requestId: suffix, kind: 'stop', commands: [],
      components: [{ componentId: suffix, proof: { kind: 'host-process-exited', process: { pid: 123456, incarnation: 'start' }, evidenceRefs: ['/evidence/exit.json'] } }] }), { code: expected });
  }
});

test('a stored receipt with typed proof different from staged membership cannot cover quarantine', async t => {
  const { root, admission } = fixture(t);
  const acquired = admission.acquire(request('staged-membership'));
  if (acquired.kind !== 'acquired') assert.fail('Expected owner');
  await acquired.claim.bindDriver('fake').dispatch('capture', async () => {});
  acquired.claim.closeDispatch({ outcome: 'inconclusive', disposition: 'quarantined', payload: {}, evidenceRefs: [] });
  const command = admission.readGeneration(acquired.claim.identity).commands[0]!;
  const proof: FenceRequest = { requestId: 'staged-stop', kind: 'stop', components: [{ componentId: command.componentId!,
    proof: { kind: 'completed-command', commandId: command.id } }], commands: [] };
  const { createHash } = await import('node:crypto');
  const payload=JSON.stringify(proof);
  const db=new DatabaseSync(join(root,'admission.sqlite'));
  try {
    const generation=String(db.prepare('SELECT id FROM owner_generations WHERE token=?').get(acquired.claim.identity.token)?.id);
    db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
    db.prepare('INSERT INTO fence_components VALUES (?,?,?,?)').run('forged',generation,command.componentId!,JSON.stringify({kind:'completed-command',commandId:'different'}));
    db.prepare("INSERT INTO fence_receipts VALUES (?,?, 'ios-simulator',?,?,?,'stop',1,?)").run('forged',generation,device.toUpperCase(),proof.requestId,createHash('sha256').update(payload).digest('hex'),payload);
    db.exec('COMMIT');
  } finally { db.close(); }
  const before=readFileSync(join(root,'admission.sqlite'));
  assert.throws(()=>admission.submitFence(acquired.claim.identity,proof),{code:'UNBOUND_PROOF'});
  assert.deepEqual(readFileSync(join(root,'admission.sqlite')),before);
  assert.equal(admission.inspect(device)?.state,'quarantined');
});

test('identical command issue after a lost COMMIT retrieves permission without issuing again', t => {
  const { root } = fixture(t); let lose = true;
  const admission=Admission.forTesting({root,backend:'fake',fault(point,operation){if(lose&&point==='afterCommit'&&operation==='authorize'){lose=false;throw new Error('reply lost');}}});
  const acquired=admission.acquire(request('lost-issue'));
  if(acquired.kind!=='acquired') assert.fail('Expected owner');
  acquired.claim.registerComponent({id:'command-source',kind:'one-shot',operation:'capture'});
  const command={requestId:'stable-request',componentId:'command-source',operation:'capture',payload:{request:'same'}};
  assert.throws(()=>acquired.claim.issue(command),{code:'STATE_UNAVAILABLE'});
  const before=readFileSync(join(root,'admission.sqlite'));
  const retry=acquired.claim.issue(command);
  assert.equal(retry.kind,'retrieved');
  assert.equal(retry.command.state,'outstanding');
  assert.deepEqual(readFileSync(join(root,'admission.sqlite')),before);
  assert.throws(()=>acquired.claim.issue({...command,payload:{request:'changed'}}),{code:'INVALID_REQUEST'});
  assert.throws(()=>acquired.claim.issue({...command,requestId:'new-request'}),{code:'DISPATCH_CLOSED'});
});

test('admission recovers a dead owner and one durable claimant alone sweeps before a successor admits', async t => {
  const { root } = fixture(t);
  const dead=Admission.forTesting({root,backend:'fake',process:{pid:999999,incarnation:'dead-owner'}});
  const old=dead.acquire(request('dead-at-admission'));
  if(old.kind!=='acquired') assert.fail('Expected owner');
  old.claim.registerComponent({id:'old-stream',kind:'host-process',process:{pid:111111,incarnation:'dead-stream'}});
  old.claim.issue({requestId:'old-read',componentId:'old-stream',operation:'read',payload:{}});
  const recovery=Admission.forTesting({root,backend:'fake',ownerLiveness:owner=>[999999,111111].includes(owner.pid)?'dead':'alive'});
  let release!:()=>void, entered!:()=>void;
  const paused=new Promise<void>(resolve=>{release=resolve;});
  const started=new Promise<void>(resolve=>{entered=resolve;});
  let effects=0,losingEffects=0;
  const next=recovery.acquireWithRecovery(request('recovering-successor'),async claim=>{
    assert.equal(recovery.readAttempt(old.claim.identity.attempt)?.terminal?.outcome,'inconclusive');
    assert.equal(recovery.inspect(device)?.state,'quarantined');
    await claim.dispatch('sweep',async()=>{effects++;entered();await paused;});
    const generation=recovery.readGeneration(old.claim.identity);
    return {requestId:'recovery-stop',kind:'stop',commands:generation.commands.filter(command=>command.state!=='settled').map(command=>command.id),
      components:generation.components.map(component=>component.id==='old-stream'
        ?{componentId:component.id,proof:{kind:'host-process-exited' as const,process:{pid:111111,incarnation:'dead-stream'},evidenceRefs:['/evidence/stream-exited.json']}}
        :{componentId:component.id,proof:{kind:'completed-command' as const,commandId:generation.commands.find(command=>command.componentId===component.id)!.id}})};
  });
  await started;
  const otherHandle=Admission.forTesting({root,backend:'fake',ownerLiveness:owner=>[999999,111111].includes(owner.pid)?'dead':'alive'});
  for (const contender of [recovery,otherHandle]) {
    const competitor=await contender.acquireWithRecovery(request('recovering-successor'),async()=>{losingEffects++;throw new Error('Must not sweep');});
    assert.deepEqual(competitor,{kind:'refused',reason:'DEVICE_QUARANTINED'});
  }
  assert.equal(losingEffects,0);
  release();
  const acquired=await next;
  assert.equal(acquired.kind,'acquired');
  assert.equal(effects,1);
  assert.equal(recovery.readAttempt(old.claim.identity.attempt)?.terminal?.outcome,'inconclusive');
  assert.equal(recovery.readGeneration(old.claim.identity).commands[0]?.state,'uncertain');
  assert.equal(recovery.readGeneration(old.claim.identity).recoveries[0]?.closure,'accepted');
});

test('admission retrieves a recovery claim after its COMMIT reply is lost across same-process handles', async t => {
  const { root } = fixture(t);
  const dead = Admission.forTesting({ root, backend: 'fake', process: { pid: 999999, incarnation: 'dead-owner' } });
  const old = dead.acquire(request('lost-recovery-claim'));
  if (old.kind !== 'acquired') assert.fail('Expected owner');
  let lost = false, sweeps = 0;
  const first = Admission.forTesting({ root, backend: 'fake', ownerLiveness: owner => owner.pid === 999999 ? 'dead' : 'alive',
    fault(point, operation) {
      if (!lost && point === 'afterCommit' && operation === 'claimRecovery') { lost = true; throw new Error('Lost claim COMMIT reply'); }
    } });
  const sweep = async (): Promise<FenceRequest> => { sweeps++; return { requestId: 'recovered-stop', kind: 'stop', commands: [], components: [] }; };
  await assert.rejects(first.acquireWithRecovery(request('lost-claim-successor'), sweep), { code: 'STATE_UNAVAILABLE' });
  const committed = first.readGeneration(old.claim.identity).recoveries;
  assert.equal(committed.length, 1);
  assert.equal(committed[0]?.closedAt, null);
  assert.equal(sweeps, 0);
  const retry = Admission.forTesting({ root, backend: 'fake', ownerLiveness: owner => owner.pid === 999999 ? 'dead' : 'alive' });
  assert.equal((await retry.acquireWithRecovery(request('lost-claim-successor'), sweep)).kind, 'acquired');
  assert.equal(sweeps, 1);
  const recovered = retry.readGeneration(old.claim.identity).recoveries;
  assert.deepEqual(recovered.map(claim => claim.id), committed.map(claim => claim.id));
  assert.deepEqual(recovered.map(claim => claim.closure), ['accepted']);
});

test('admission can retry a refused sweep of the same generation from another handle in the same process', async t => {
  const { root } = fixture(t);
  const dead = Admission.forTesting({ root, backend: 'fake', process: { pid: 999999, incarnation: 'dead-owner' } });
  const old = dead.acquire(request('refused-recovery'));
  if (old.kind !== 'acquired') assert.fail('Expected owner');
  const first = Admission.forTesting({ root, backend: 'fake', ownerLiveness: owner => owner.pid === 999999 ? 'dead' : 'alive' });
  let sweeps = 0;
  const refused = await first.acquireWithRecovery(request('retry-refused-successor'), async () => {
    sweeps++;
    return { requestId: 'refused-stop', kind: 'maintenance-lift', commands: [], components: [] };
  });
  assert.deepEqual(refused, { kind: 'refused', reason: 'DEVICE_QUARANTINED' });
  assert.deepEqual(first.readGeneration(old.claim.identity).recoveries.map(claim => claim.closure), ['refused']);
  const retry = Admission.forTesting({ root, backend: 'fake', ownerLiveness: owner => owner.pid === 999999 ? 'dead' : 'alive' });
  const acquired = await retry.acquireWithRecovery(request('retry-refused-successor'), async () => {
    sweeps++;
    return { requestId: 'accepted-stop', kind: 'stop', commands: [], components: [] };
  });
  assert.equal(acquired.kind, 'acquired');
  assert.equal(sweeps, 2);
  assert.deepEqual(retry.readGeneration(old.claim.identity).recoveries.map(claim => claim.closure), ['refused', 'accepted']);
  assert.equal(retry.readAttempt(old.claim.identity.attempt)?.terminal?.outcome, 'inconclusive');
});

test('a lost recovery claim reply remains retrievable when the claim replaced a dead claimant', async t => {
  const { root } = fixture(t);
  const dead = Admission.forTesting({ root, backend: 'fake', process: { pid: 999999, incarnation: 'dead-owner' } });
  const old = dead.acquire(request('dead-claimant-retry'));
  if (old.kind !== 'acquired') assert.fail('Expected owner');
  const abandoned = Admission.forTesting({ root, backend: 'fake', process: { pid: 888888, incarnation: 'dead-claimant' }, ownerLiveness: () => 'dead' });
  abandoned.acquire(request('abandoned-recovery'));
  assert.equal(abandoned.claimRecovery(old.claim.identity, 'abandoned-claim').kind, 'claimed');
  const recovery = Admission.forTesting({ root, backend: 'fake', ownerLiveness: owner => [999999, 888888].includes(owner.pid) ? 'dead' : 'alive',
    fault(point, operation) { if (point === 'afterCommit' && operation === 'claimRecovery') throw new Error('Lost replacement claim reply'); } });
  const sweep = async (): Promise<FenceRequest> => ({ requestId: 'replacement-stop', kind: 'stop', commands: [], components: [] });
  await assert.rejects(recovery.acquireWithRecovery(request('replacement-successor'), sweep), { code: 'STATE_UNAVAILABLE' });
  const retry = Admission.forTesting({ root, backend: 'fake', ownerLiveness: owner => [999999, 888888].includes(owner.pid) ? 'dead' : 'alive' });
  assert.equal((await retry.acquireWithRecovery(request('replacement-successor'), sweep)).kind, 'acquired');
  assert.deepEqual(retry.readGeneration(old.claim.identity).recoveries.map(claim => claim.closure), ['abandoned', 'accepted']);
});

test('retrying recovery never replays a sweep command whose authorization COMMIT reply was lost', async t => {
  const { root } = fixture(t);
  const dead = Admission.forTesting({ root, backend: 'fake', process: { pid: 999999, incarnation: 'dead-owner' } });
  const old = dead.acquire(request('lost-sweep-authorization'));
  if (old.kind !== 'acquired') assert.fail('Expected owner');
  old.claim.registerComponent({ id: 'stop-client', kind: 'one-shot', operation: 'stop' });
  const admission = Admission.forTesting({ root, backend: 'fake', ownerLiveness: owner => owner.pid === 999999 ? 'dead' : 'alive',
    fault(point, operation) { if (point === 'afterCommit' && operation === 'authorize') throw new Error('Lost authorization reply'); } });
  let effects = 0;
  const sweep = async (claim: RecoveryClaim): Promise<FenceRequest> => {
    await claim.dispatch({ requestId: 'stop-once', componentId: 'stop-client', operation: 'stop', payload: {} }, async () => { effects++; });
    assert.fail('An ambiguous command cannot supply completion proof');
  };
  assert.deepEqual(await admission.acquireWithRecovery(request('sweep-retry-successor'), sweep), { kind: 'refused', reason: 'DEVICE_QUARANTINED' });
  const commands = admission.readGeneration(old.claim.identity).commands;
  assert.equal(commands.length, 1);
  assert.equal(commands[0]?.state, 'uncertain');
  const retry = Admission.forTesting({ root, backend: 'fake', ownerLiveness: owner => owner.pid === 999999 ? 'dead' : 'alive' });
  assert.deepEqual(await retry.acquireWithRecovery(request('sweep-retry-successor'), sweep), { kind: 'refused', reason: 'DEVICE_QUARANTINED' });
  assert.deepEqual(retry.readGeneration(old.claim.identity).commands, commands);
  assert.deepEqual(retry.readGeneration(old.claim.identity).recoveries.map(claim => claim.closure), ['refused', 'refused']);
  assert.equal(effects, 0);
  assert.equal(retry.inspect(device)?.state, 'quarantined');
});

test('a reused component PID is not exit evidence while a reused owner PID permits recovery', t => {
  const {root}=fixture(t);
  const original=Admission.forTesting({root,backend:'fake',process:{pid:999999,incarnation:'old-start'}});
  const acquired=original.acquire(request('reused-component'));
  if(acquired.kind!=='acquired')assert.fail('Expected owner');
  acquired.claim.registerComponent({id:'reused-process',kind:'host-process',process:{pid:123456,incarnation:'original-start'}});
  acquired.claim.issue({requestId:'read',componentId:'reused-process',operation:'read',payload:{}});
  const recovery=Admission.forTesting({root,backend:'fake',ownerLiveness:()=> 'dead',componentLiveness:()=> 'reused'});
  assert.deepEqual(recovery.acquire(request('reused-successor')),{kind:'refused',reason:'DEVICE_QUARANTINED'});
  const command=recovery.readGeneration(acquired.claim.identity).commands[0]!;
  assert.throws(()=>recovery.submitFence(acquired.claim.identity,{requestId:'reused-stop',kind:'stop',commands:[command.id],
    components:[{componentId:'reused-process',proof:{kind:'host-process-exited',process:{pid:123456,incarnation:'original-start'},evidenceRefs:['/evidence/old-pid.json']}}]}),{code:'COVERAGE_INCOMPLETE'});
});

test('a dead recovery claimant is closed once and a new claimant can retry the same generation', t => {
  const {root}=fixture(t);
  const owner=Admission.forTesting({root,backend:'fake',process:{pid:999999,incarnation:'gone'}});
  const acquired=owner.acquire(request('claimant-death'));
  if(acquired.kind!=='acquired')assert.fail('Expected owner');
  const first=Admission.forTesting({root,backend:'fake',process:{pid:888888,incarnation:'first-claimant'},ownerLiveness:()=> 'dead'});
  first.acquire(request('first-recovery-attempt'));
  const claim=first.claimRecovery(acquired.claim.identity,'first-claim');
  assert.equal(claim.kind,'claimed');
  const second=Admission.forTesting({root,backend:'fake',ownerLiveness:()=> 'dead'});
  const next=second.claimRecovery(acquired.claim.identity,'second-claim');
  assert.equal(next.kind,'claimed');
  if(next.kind!=='claimed')assert.fail('Expected successor claimant');
  assert.deepEqual(second.readGeneration(acquired.claim.identity).recoveries.map(recovery=>recovery.closure),['abandoned',null]);
  if(claim.kind==='claimed')assert.throws(()=>claim.claim.close(),{code:'STALE_OWNER'});
  next.claim.close();
  next.claim.close();
  assert.deepEqual(second.readGeneration(acquired.claim.identity).recoveries.map(recovery=>recovery.closure),['abandoned','refused']);
});

for(const point of ['beforeCommit','afterCommit'] as const) {
  test(`closure and receipt retries at ${point} retrieve committed history without replay`,async t=>{
    const {root}=fixture(t);
    let operationToLose='closure';
    const admission=Admission.forTesting({root,backend:'fake',fault(at,operation){
      if(operationToLose!=='none'&&at===point&&operation===(operationToLose==='closure'?'finalize':'receipt')){operationToLose='none';throw new Error('lost reply');}
    }});
    const acquired=admission.acquire(request(`retry-${point}`));
    if(acquired.kind!=='acquired')assert.fail('Expected owner');
    let effects=0;
    await acquired.claim.bindDriver('fake').dispatch('capture',async()=>{effects++;});
    const candidate={outcome:'inconclusive' as const,disposition:'quarantined' as const,payload:{},evidenceRefs:[]};
    assert.equal(acquired.claim.closeDispatch(candidate).authority,'unconfirmed');
    assert.equal(acquired.claim.closeDispatch(candidate).authority,'committed');
    const command=admission.readGeneration(acquired.claim.identity).commands[0]!;
    const proof:FenceRequest={requestId:'retry-stop',kind:'stop',components:[{componentId:command.componentId!,proof:{kind:'completed-command',commandId:command.id}}],commands:[]};
    operationToLose='receipt';
    assert.throws(()=>admission.submitFence(acquired.claim.identity,proof),{code:'STATE_UNAVAILABLE'});
    const receipt=admission.submitFence(acquired.claim.identity,proof);
    const before=readFileSync(join(root,'admission.sqlite'));
    assert.deepEqual(admission.submitFence(acquired.claim.identity,proof),receipt);
    assert.deepEqual(readFileSync(join(root,'admission.sqlite')),before);
    assert.equal(effects,1);
    assert.equal(admission.readAttempt(acquired.claim.identity.attempt)?.terminal?.outcome,'inconclusive');
    assert.equal(admission.inspect(device)?.state,'available');
  });
}

for(const kind of ['historical','exclusion'] as const) test(`a stop receipt never lifts an imported ${kind} quarantine`,async t=>{
  const {root,admission}=fixture(t);
  const acquired=admission.acquire(request(`forbidden-${kind}`));
  if(acquired.kind!=='acquired')assert.fail('Expected owner');
  await acquired.claim.bindDriver('fake').dispatch('capture',async()=>{});
  acquired.claim.closeDispatch({outcome:'inconclusive',disposition:'quarantined',payload:{},evidenceRefs:[]});
  const db=new DatabaseSync(join(root,'admission.sqlite'));
  try{db.prepare('INSERT INTO quarantines(id,platform,device,kind,cause,created_at,evidence) VALUES (?,?,?,?,?,?,?)').run('imported','ios-simulator',device.toUpperCase(),kind,'imported-uncertainty',1,'{}');}finally{db.close();}
  const command=admission.readGeneration(acquired.claim.identity).commands[0]!;
  const before=readFileSync(join(root,'admission.sqlite'));
  assert.throws(()=>admission.submitFence(acquired.claim.identity,{requestId:'forbidden-stop',kind:'stop',commands:[],components:[{componentId:command.componentId!,proof:{kind:'completed-command',commandId:command.id}}]}),{code:'NOT_COVERABLE'});
  assert.deepEqual(readFileSync(join(root,'admission.sqlite')),before);
});

test('receipt membership compares mixed-case component identities consistently',t=>{
  const {root}=fixture(t);
  const admission=Admission.forTesting({root,backend:'fake',componentLiveness:()=> 'exited'});
  const acquired=admission.acquire(request('mixed-membership'));
  if(acquired.kind!=='acquired')assert.fail('Expected owner');
  for(const id of ['A','a'])acquired.claim.registerComponent({id,kind:'host-process',process:{pid:123456,incarnation:id}});
  acquired.claim.closeDispatch({outcome:'inconclusive',disposition:'quarantined',payload:{},evidenceRefs:[]});
  admission.submitFence(acquired.claim.identity,{requestId:'mixed-stop',kind:'stop',commands:[],components:['a','A'].map(id=>({componentId:id,
    proof:{kind:'host-process-exited',process:{pid:123456,incarnation:id},evidenceRefs:['/evidence/exited.json']}}))});
  assert.equal(admission.inspect(device)?.state,'available');
});

test('a later claimant can fence a failed sweep through its recorded host component',async t=>{
  const {root}=fixture(t);
  const original=Admission.forTesting({root,backend:'fake',process:{pid:999999,incarnation:'gone'}});
  const acquired=original.acquire(request('retry-sweep'));
  if(acquired.kind!=='acquired')assert.fail('Expected owner');
  const admission=Admission.forTesting({root,backend:'fake',ownerLiveness:owner=>owner.pid===999999?'dead':'alive',componentLiveness:()=> 'exited'});
  admission.acquire(request('recover-sweep'));
  const first=admission.claimRecovery(acquired.claim.identity,'first-sweep');
  if(first.kind!=='claimed')assert.fail('Expected claimant');
  first.claim.registerComponent({id:'sweep-process',kind:'host-process',process:{pid:123456,incarnation:'sweep-start'}});
  await assert.rejects(first.claim.dispatch({requestId:'failed-sweep',componentId:'sweep-process',operation:'sweep',payload:{}},async()=>{throw new Error('lost sweep reply');}));
  first.claim.close();
  const second=admission.claimRecovery(acquired.claim.identity,'second-sweep');
  if(second.kind!=='claimed')assert.fail('Expected retry claimant');
  await second.claim.dispatch('sweep',async()=>{});
  const generation=admission.readGeneration(acquired.claim.identity);
  const uncertain=generation.commands.find(command=>command.componentId==='sweep-process')!;
  assert.equal(uncertain.state,'uncertain');
  second.claim.submitFence({requestId:'retry-sweep-stop',kind:'stop',commands:[uncertain.id],components:generation.components.map(component=>component.id==='sweep-process'
    ?{componentId:component.id,proof:{kind:'host-process-exited',process:{pid:123456,incarnation:'sweep-start'},evidenceRefs:['/evidence/sweep-exit.json']}}
    :{componentId:component.id,proof:{kind:'completed-command',commandId:generation.commands.find(command=>command.componentId===component.id)!.id}})});
  assert.equal(admission.inspect(device)?.state,'available');
  assert.equal(admission.readGeneration(acquired.claim.identity).commands.find(command=>command.id===uncertain.id)?.state,'uncertain');
});
test('device identity normalization preserves the category and its value semantics', () => {
  assert.deepEqual(canonicalDevice({ category: 'ios-simulator', value: device }), {
    category: 'ios-simulator', value: 'ABCDEF00-0000-4000-8000-000000000001',
  });
  assert.deepEqual(canonicalDevice({ category: 'android-emulator', value: '/private/avds/Pixel.avd' }), {
    category: 'android-emulator', value: '/private/avds/Pixel.avd',
  });
  assert.deepEqual(canonicalDevice({ category: 'android-phone', value: device }), {
    category: 'android-phone', value: 'abcdef00-0000-4000-8000-000000000001',
  });
  assert.equal(canonicalDevice(device), 'ABCDEF00-0000-4000-8000-000000000001');
});

test('reserved iOS phone identities refuse before simulator UUID validation', () => {
  for (const value of ['00008140-001234567890001E', device]) {
    assert.throws(() => canonicalDevice({ category: 'ios-phone', value }), { code: 'CATEGORY_NOT_ENABLED' });
  }
});

test('device identities reject unresolved emulator names and malformed identity pairs', () => {
  for (const value of ['Pixel.avd', '/private/avds/../Pixel.avd', '/private/avds/Pixel.avd\0']) {
    assert.throws(() => canonicalDevice({ category: 'android-emulator', value }), { code: 'INVALID_REQUEST' });
  }
  for (const raw of ['null', '{}', '{"category":"watch","value":"id"}', '{"category":"android-phone","value":""}', '{"category":"android-phone","value":"id","extra":true}']) {
    assert.throws(() => canonicalDevice(JSON.parse(raw)), { code: 'INVALID_REQUEST' });
  }
});

function fixture(t: TestContext) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'admission-core-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, admission: Admission.forTesting({ root, backend: 'fake' }) };
}
test('fresh fake stores are initialized at schema 3 through the upgrade chain', t => {
  const { root } = fixture(t);
  const db = new DatabaseSync(join(root, 'admission.sqlite'));
  try {
    assert.equal(db.prepare('SELECT schema_version FROM metadata').get()?.schema_version, 3);
    assert.equal(db.prepare("SELECT count(*) AS total FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get()?.total, 19);
    assert.equal(db.prepare("SELECT count(*) AS total FROM upgrades").get()?.total, 0);
    assert.equal(db.prepare("SELECT count(*) AS total FROM pragma_table_info('devices') WHERE name='state'").get()?.total, 0);
  } finally { db.close(); }
});

test('admission requests and retrieved owners retain their explicit device category', t => {
  const { admission } = fixture(t);
  const input = { ...request('category-aware'), category: 'ios-simulator' as const };
  const result = admission.acquire(input);
  assert.equal(result.kind, 'acquired');
  if (result.kind !== 'acquired') return;
  assert.equal(result.claim.identity.category, 'ios-simulator');
  assert.equal(admission.readAttempt(input.attempt)?.category, 'ios-simulator');
  assert.equal(admission.inspect(device)?.category, 'ios-simulator');
});

test('reserved and unknown request categories refuse without recording an attempt', t => {
  const { admission, root } = fixture(t);
  const before = readFileSync(join(root, 'admission.sqlite'));
  assert.throws(() => admission.acquire({ ...request('reserved'), category: 'ios-phone' }), { code: 'CATEGORY_NOT_ENABLED' });
  assert.throws(() => admission.acquire(JSON.parse(JSON.stringify({ ...request('unknown'), category: 'watch' }))), { code: 'INVALID_REQUEST' });
  assert.equal(admission.readAttempt(request('reserved').attempt), undefined);
  assert.deepEqual(readFileSync(join(root, 'admission.sqlite')), before);
});

test('an owner from another category cannot recover a matching device value', t => {
  const { admission, root } = fixture(t);
  const result = admission.acquire(request('owner-category'));
  assert.equal(result.kind, 'acquired');
  if (result.kind !== 'acquired') return;
  const recovery = Admission.forTesting({ root, backend: 'fake', ownerLiveness: () => 'dead' });
  const before = readFileSync(join(root, 'admission.sqlite'));
  assert.throws(() => recovery.quarantineAbandoned({ ...result.claim.identity, category: 'android-phone' }, 'wrong category'), { code: 'STALE_OWNER' });
  assert.deepEqual(readFileSync(join(root, 'admission.sqlite')), before);
});

test('the same device value in different categories has independent owners', t => {
  const { admission } = fixture(t);
  const simulator=admission.acquire({ ...request('simulator-pair'), category: 'ios-simulator' });
  const phone=admission.acquire({ ...request('phone-pair',device.toUpperCase()), category: 'android-phone' });
  assert.equal(simulator.kind,'acquired');
  assert.equal(phone.kind,'acquired');
  if(simulator.kind!=='acquired'||phone.kind!=='acquired') return;
  assert.notEqual(simulator.claim.identity.token,phone.claim.identity.token);
  assert.deepEqual(admission.inspect({category:'ios-simulator',value:device})?.owner,simulator.claim.identity);
  assert.deepEqual(admission.inspect({category:'android-phone',value:device.toUpperCase()})?.owner,phone.claim.identity);
});

test('atomic admission canonicalizes identity; competing readers preserve the owner and terminal is authoritative', t => {
  const { admission } = fixture(t);
  const result = admission.acquire(request('one'));
  assert.equal(result.kind, 'acquired');
  if (result.kind !== 'acquired') return;
  const before = admission.inspect(device);
  assert.equal(admission.acquire(request('two', device.toUpperCase())).kind, 'refused');
  assert.deepEqual(admission.inspect(device), before);
  assert.equal(admission.readAttempt(request('one').attempt)?.state, 'active');
  assert.equal(result.claim.finalize({ outcome: 'observed', disposition: 'available', payload: { visible: true }, evidenceRefs: [] }).authority, 'committed');
  assert.equal(admission.inspect(device)?.state, 'available');
  assert.equal(admission.readAttempt(request('one').attempt)?.terminal?.outcome, 'observed');
});

test('recovery checks the full recorded process incarnation, preserving a live independent owner', t => {
  const { root, admission } = fixture(t);
  const result = admission.acquire(request('live'));
  assert.equal(result.kind, 'acquired');
  if (result.kind !== 'acquired') return;
  const recovery = Admission.forTesting({ root, backend: 'fake', ownerLiveness: () => 'dead' });
  assert.throws(() => recovery.quarantineAbandoned({ ...result.claim.identity, process: { pid: 123, incarnation: 'wrong' } }, 'mismatched process'), { code: 'STALE_OWNER' });
  assert.equal(admission.inspect(device)?.state, 'active');
});

test('failed underlying work closes further authorization even when its caller catches the rejection', async t => {
  const { admission } = fixture(t);
  const result = admission.acquire(request('failed-operation'));
  assert.equal(result.kind, 'acquired');
  if (result.kind !== 'acquired') return;
  const session = result.claim.bindDriver('fake');
  await assert.rejects(session.dispatch('launch', async () => { throw new Error('reply lost'); }), /reply lost/);
  let calls = 0;
  assert.throws(() => session.dispatch('capture', async () => { calls++; }), { code: 'DISPATCH_CLOSED' });
  assert.equal(calls, 0);
});

test('same identity cannot smuggle changed intent under a reused digest', t => {
  const { admission } = fixture(t);
  admission.acquire(request('immutable'));
  assert.deepEqual(admission.acquire({ ...request('immutable'), intent: { tap: 'different' } }), { kind: 'refused', reason: 'ACTION_ID_CONFLICT' });
});

test('foreign cancellation persists and prevents dispatch, while an already authorized late result cannot promote quarantine', async t => {
  const { root, admission } = fixture(t);
  const result = admission.acquire(request('cancel-race'));
  assert.equal(result.kind, 'acquired');
  if (result.kind !== 'acquired') return;
  const session = result.claim.bindDriver('fake');
  let complete!: () => void;
  const pending = session.dispatch('tap', () => new Promise<void>(resolve => { complete = resolve; }));
  Admission.forTesting({ root, backend: 'fake' }).cancel(request('cancel-race').attempt);
  assert.equal(admission.readGeneration(result.claim.identity).commands[0]?.state,'uncertain');
  assert.equal(typeof admission.readGeneration(result.claim.identity).dispatchClosedAt,'number');
  let followups = 0;
  assert.throws(() => session.dispatch('capture', async () => { followups++; }), { code: 'DISPATCH_CLOSED' });
  assert.throws(() => result.claim.finalize({ outcome: 'observed', disposition: 'available', payload: {}, evidenceRefs: [] }), { code: 'OPERATIONS_UNSETTLED' });
  const terminal = { outcome: 'inconclusive' as const, disposition: 'quarantined' as const, payload: { reason: 'cancelled' }, evidenceRefs: [] };
  assert.equal(result.claim.finalize(terminal).authority, 'committed');
  complete(); await pending;
  assert.equal(admission.inspect(device)?.state, 'quarantined');
  assert.deepEqual(admission.readAttempt(request('cancel-race').attempt)?.terminal, terminal);
  assert.equal(followups, 0);
});

test('cancel before acquisition, pre-effect cancellation, and exactly one tap are enforced', async t => {
  const { admission } = fixture(t);
  const controller = new AbortController(); controller.abort();
  assert.deepEqual(admission.acquire({ ...request('pre'), signal: controller.signal }), { kind: 'refused', reason: 'CANCELLED' });
  assert.equal(admission.inspect(device), undefined);
  const active = admission.acquire(request('cancel-before-effects'));
  assert.equal(active.kind, 'acquired');
  if (active.kind !== 'acquired') return;
  active.claim.cancel();
  assert.throws(() => active.claim.bindDriver('fake'), { code: 'DISPATCH_CLOSED' });
  assert.equal(active.claim.finalize({ outcome: 'refused', disposition: 'available', payload: {}, evidenceRefs: [] }).authority, 'committed');
  const next = admission.acquire(request('one-tap'));
  assert.equal(next.kind, 'acquired');
  if (next.kind !== 'acquired') return;
  const session = next.claim.bindDriver('fake');
  assert.throws(() => next.claim.bindDriver('fake'), { code: 'DISPATCH_CLOSED' });
  let taps = 0;
  await session.dispatch('tap', async () => { taps++; });
  assert.throws(() => session.dispatch('tap', async () => { taps++; }), { code: 'DISPATCH_CLOSED' });
  assert.equal(taps, 1);
});

for (const point of ['beforeCommit', 'afterCommit'] as const) {
  test(`terminal ${point} failure never publishes its candidate and fresh reads resolve the whole transaction`, t => {
    const { root, admission } = fixture(t);
    const faulty = Admission.forTesting({ root, backend: 'fake', fault(at, operation) { if (at === point && operation === 'finalize') throw new Error('injected commit fault'); } });
    const result = faulty.acquire(request('commit-fault'));
    assert.equal(result.kind, 'acquired');
    if (result.kind !== 'acquired') return;
    assert.deepEqual(result.claim.finalize({ outcome: 'observed', disposition: 'available', payload: { exact: 'committed only' }, evidenceRefs: ['evidence'] }), { authority: 'unconfirmed', reason: 'FINALIZATION_UNCONFIRMED' });
    assert.throws(() => result.claim.bindDriver('fake'), { code: 'DISPATCH_CLOSED' });
    const attempt = admission.readAttempt(request('commit-fault').attempt);
    assert.equal(attempt?.state, point === 'beforeCommit' ? 'active' : 'terminal');
    assert.equal(admission.inspect(device)?.state, point === 'beforeCommit' ? 'active' : 'available');
    assert.equal(attempt?.terminal?.payload && (attempt.terminal.payload as {exact: string}).exact, point === 'beforeCommit' ? undefined : 'committed only');
  });
}

type CoreExit = { code: number | null; signal: NodeJS.Signals | null; stderr: string; faultOutput: string };
type Pending = { id: number; operation: CommandInput['operation']; resolve: (reply: CoreReply) => void; reject: (error: Error) => void };
type ActorState = { sequence: number; errors: string[]; pending: Pending | undefined; closed: Promise<CoreExit>; termination: 'none' | 'deadline' | 'teardown' };
const actors = new WeakMap<ChildProcess, ActorState>();
async function worker({ t, root, faultOperation = '', faultPoint = '', control }: { t: TestContext; root: string; faultOperation?: string; faultPoint?: string; control?: Control }) {
  const child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), fileURLToPath(new URL('./fixtures/admission-core-worker.ts', import.meta.url)), root, faultOperation, faultPoint, ...(control ? [JSON.stringify(control)] : [])],
    { cwd: tmpdir(), stdio: ['ignore','ignore','pipe','ipc','pipe'], env: { PATH: process.env.PATH, HOME: process.env.HOME!, TMPDIR: process.env.TMPDIR!, NODE_NO_WARNINGS: '1' } });
  let faultOutput = ''; child.stdio[4]!.on('data', chunk => { faultOutput += chunk; });
  let stderr = ''; child.stderr!.on('data', chunk => { stderr += chunk; });
  const errors: string[] = []; let readySeen = false;
  const closed = new Promise<CoreExit>(resolve => child.once('close', (code, signal) => { const state = actors.get(child)!; state.pending?.reject(new Error('Worker exited before reply: ' + stderr)); state.pending = undefined; resolve({ code, signal, stderr, faultOutput }); }));
  const state: ActorState = { sequence: 0, errors, pending: undefined, closed, termination: 'none' }; actors.set(child, state);
  const ready = new Promise<void>((resolve, reject) => {
    child.on('message', raw => {
      const parsed = messageSchema.safeParse(raw);
      if (!parsed.success) { errors.push(parsed.error.message); state.pending?.reject(new Error(parsed.error.message)); state.pending = undefined; return; }
      const value = parsed.data;
      if (value.actor !== child.pid) { errors.push('Wrong actor'); state.pending?.reject(new Error('Wrong actor')); state.pending = undefined; return; }
      if (value.type === 'ready') { if (readySeen) errors.push('Duplicate ready'); readySeen = true; resolve(); return; }
      const pending = state.pending;
      if (!readySeen || !pending || pending.id !== value.requestId || pending.operation !== value.operation) { errors.push('Unmatched or duplicate reply'); pending?.reject(new Error('Unmatched reply')); state.pending = undefined; return; }
      state.pending = undefined; pending.resolve(value);
    });
    child.once('error', reject); child.once('exit', () => { if (!readySeen) reject(new Error('Worker exited before ready: ' + stderr)); });
  });
  const cap = setTimeout(() => { state.termination = 'deadline'; child.kill('SIGKILL'); }, 10000);
  void closed.then(() => clearTimeout(cap));
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) { state.termination = 'teardown'; child.kill('SIGKILL'); } await closed; clearTimeout(cap); });
  await ready; return child;
}
function sendUnanswered({ child, command }: { child: ChildProcess; command: CommandInput }) {
  const state = actors.get(child)!; assert.equal(state.pending, undefined); assert.deepEqual(state.errors, []);
  const requestId = ++state.sequence; child.send(commandSchema.parse({ ...command, requestId })); return requestId;
}
function exchange({ child, command }: { child: ChildProcess; command: Exclude<CommandInput, { operation: 'exit' }> }): Promise<CoreReply> {
  const state = actors.get(child)!; assert.equal(state.pending, undefined); assert.deepEqual(state.errors, []); assert.equal(child.exitCode, null); assert.equal(child.signalCode, null);
  const requestId = ++state.sequence;
  return new Promise((resolve, reject) => { state.pending = { id: requestId, operation: command.operation, resolve, reject }; child.send(commandSchema.parse({ ...command, requestId })); });
}
type BusinessAcquisition = Exclude<Acquisition, { kind: 'state-unavailable' | 'unexpected-error' }>;
function reply({ child, message }: { child: ChildProcess; message: Extract<CommandInput, { operation: 'acquire' }> }): Promise<BusinessAcquisition>;
function reply({ child, message }: { child: ChildProcess; message: Extract<CommandInput, { operation: 'finalize' }> }): Promise<Finalization>;
async function reply({ child, message }: { child: ChildProcess; message: Exclude<CommandInput, { operation: 'exit' }> }) {
  const value = await exchange({ child, command: message });
  if (value.result.kind === 'state-unavailable' || value.result.kind === 'unexpected-error') throw new Error(JSON.stringify(value.result));
  if (value.operation === 'acquire') return value.result;
  if (value.operation === 'finalize') { assert.equal(value.result.kind, 'finalized'); if (value.result.kind !== 'finalized') throw new Error('Invalid finalization'); return value.result.finalization; }
  throw new Error('Use exchange for dispatch receipts');
}
async function closeActor(child: ChildProcess) {
  const state = actors.get(child)!; sendUnanswered({ child, command: { operation: 'exit' } }); const exited = await state.closed;
  assert.equal(exited.code, 0, exited.stderr); assert.equal(exited.signal, null); assert.deepEqual(state.errors, []);
}
async function entered(path: string) { const deadline = Date.now() + 5000; while (!existsSync(path)) { assert.ok(Date.now() < deadline, 'Missing lock barrier'); await new Promise(resolve => setTimeout(resolve,5)); } }
const success = { outcome: 'observed' as const, disposition: 'available' as const, payload: { visible: true }, evidenceRefs: [] };

type AcquireReply = Extract<CoreReply, { operation: 'acquire' }>;
async function acquire({ child, request: input, policy = 'strict' }: { child: ChildProcess; request: AdmissionRequest; policy?: 'strict' | 'contention' }): Promise<AcquireReply> {
  const value = await exchange({ child, command: { operation: 'acquire', request: input } }); assert.equal(value.operation, 'acquire');
  if (value.operation !== 'acquire') throw new Error('Wrong operation'); requireAcquisition({ result: value.result, policy }); return value;
}
function coreAuthority({ admission, contenders, activity = [], terminal }: { admission: Admission; contenders: { request: AdmissionRequest; reply: AcquireReply }[]; activity?: CoreReply[]; terminal?: typeof success }) {
  for (const { request: input, reply: receipt } of contenders) {
    if (receipt.result.kind !== 'acquired') continue;
    assert.deepEqual(receipt.result.owner.attempt, input.attempt, 'Acquired owner must match its submitted attempt');
    assert.equal(receipt.result.owner.device, input.device.toUpperCase(), 'Acquired owner must match its submitted device');
    assert.equal(receipt.result.owner.process.pid, receipt.actor, 'Acquired owner must belong to its actor process');
  }
  const snapshots = contenders.map(({ request: input }) => ({ request: input, view: admission.readAttempt(input.attempt) }));
  const present = snapshots.filter(row => row.view !== undefined); assert.ok(present.length <= 1, 'At most one authoritative attempt');
  const deviceView = admission.inspect(device);
  const last = new Map<number, CoreReply>();
  for (const value of [...contenders.map(c => c.reply), ...activity]) {
    assert.notEqual(value.result.kind, 'unexpected-error');
    const previous = last.get(value.actor); if (!previous || value.requestId > previous.requestId) last.set(value.actor, value);
  }
  assert.ok([...last.values()].reduce((sum, r) => sum + r.effects, 0) <= 1, 'At most one effect');
  assert.ok([...last.values()].reduce((sum, r) => sum + r.entries.length, 0) <= 1, 'At most one callback entry');
  if (present.length === 0) {
    assert.equal(deviceView, undefined); assert.ok(contenders.every(c => c.reply.result.kind === 'state-unavailable'));
    for (const value of last.values()) { assert.equal(value.effects, 0); assert.deepEqual(value.entries, []); assert.deepEqual(value.authorizations, []); }
    return undefined;
  }
  const { request: input, view } = present[0]!; assert.ok(view);
  assert.deepEqual(view.identity, input.attempt); assert.equal(view.device, input.device.toUpperCase()); assert.equal(view.digest, input.digest); assert.deepEqual(view.intent, input.intent);
  assert.deepEqual(view.owner.attempt, input.attempt); assert.equal(view.owner.device, view.device); assert.equal(view.owner.generation, 1); assert.ok(view.owner.token); assert.ok(view.owner.process.incarnation);
  const ownerReply = contenders.find(c => c.request.attempt.id === input.attempt.id)!.reply;
  assert.equal(view.owner.process.pid, ownerReply.actor);
  assert.ok(ownerReply.result.kind === 'acquired' || ownerReply.result.kind === 'state-unavailable');
  for (const contender of contenders) {
    const result = contender.reply.result;
    if (result.kind === 'acquired') assert.deepEqual(result.owner, view.owner);
    else if (result.kind === 'refused') { assert.equal(result.reason, 'DEVICE_BUSY'); assert.notDeepEqual(contender.request.attempt, view.identity); }
    else assert.equal(result.kind, 'state-unavailable');
  }
  for (const value of last.values()) {
    assert.equal(value.effects, value.entries.length);
    for (const entry of value.entries) { assert.equal(entry.authorizationSeenAtEntry, true, 'Unauthorized callback entry'); assert.deepEqual(entry.owner, view.owner); assert.ok(value.authorizations.some(owner => JSON.stringify(owner) === JSON.stringify(entry.owner))); }
    for (const owner of value.authorizations) assert.deepEqual(owner, view.owner);
    if (value.actor !== view.owner.process.pid) { assert.equal(value.effects, 0); assert.deepEqual(value.entries, []); assert.deepEqual(value.authorizations, []); }
  }
  assert.equal(view.cancellationRequested, false); assert.ok(deviceView); assert.equal(deviceView.generation, view.owner.generation);
  if (terminal) { assert.equal(view.state, 'terminal'); assert.deepEqual(view.terminal, terminal); assert.equal(deviceView.state, 'available'); assert.equal(deviceView.owner, null); }
  else { assert.equal(view.state, 'active'); assert.equal(view.terminal, null); assert.equal(deviceView.state, 'active'); assert.deepEqual(deviceView.owner, view.owner); }
  return view;
}
test('controlled core storage refusal reconciles both attempts without replay', async t => {
  const { root, admission } = fixture(t); const held = join(root, 'entered'); const release = join(root, 'release');
  const first = await worker({ t, root, control: { kind: 'hold', operation: 'acquire', point: 'beforeCommit', entered: held, release } });
  const firstReply = acquire({ child: first, request: request('holder') }); await entered(held);
  const second = await worker({ t, root });
  const lost = await acquire({ child: second, request: request('waiter'), policy: 'contention' });
  writeFileSync(release, 'release'); const won = await firstReply;
  assert.throws(() => requireAcquisition({ result: lost.result }), /state-unavailable/); assert.equal(lost.result.kind, 'state-unavailable');
  const finished = await exchange({ child: first, command: { operation: 'finalize', terminal: success } });
  assert.equal(finished.operation, 'finalize'); assert.equal(finished.result.kind, 'finalized');
  if (finished.operation !== 'finalize' || finished.result.kind !== 'finalized') throw new Error('Finalization failed'); assert.equal(finished.result.finalization.authority, 'committed');
  await Promise.all([closeActor(first), closeActor(second)]);
  coreAuthority({ admission, contenders: [{ request: request('holder'), reply: won }, { request: request('waiter'), reply: lost }], activity: [finished], terminal: success });
});
test('unconfirmed core acquisition retains committed owner after normal exit without retry', async t => {
  const { root, admission } = fixture(t); const input = request('ambiguous');
  const child = await worker({ t, root, control: { kind: 'unavailable', operation: 'acquire', point: 'afterCommit' } });
  const result = await acquire({ child, request: input, policy: 'contention' }); assert.equal(result.result.kind, 'state-unavailable');
  await closeActor(child);
  const view = coreAuthority({ admission, contenders: [{ request: input, reply: result }] }); assert.ok(view); assert.equal(view.state, 'active'); assert.equal(view.terminal, null);
  assert.equal(result.effects, 0); assert.equal(result.entries.length, 0);
});
for (const firstKind of ['observed', 'legacy'] as const) {
  test(`independent ${firstKind} and competing owner serialize acquisition without sabotaging the winner`, async t => {
    const { root, admission } = fixture(t); const firstRequest = request('first'); firstRequest.attempt.kind = firstKind;
    const secondRequest = request('second'); secondRequest.attempt.kind = firstKind === 'observed' ? 'legacy' : 'observed';
    const first = await worker({ t, root }); const second = await worker({ t, root });
    const [firstReply, secondReply] = await Promise.all([acquire({ child: first, request: firstRequest, policy: 'contention' }), acquire({ child: second, request: secondRequest, policy: 'contention' })]);
    if ([firstReply,secondReply].every(r => r.result.kind !== 'state-unavailable')) assert.deepEqual([firstReply.result.kind,secondReply.result.kind].sort(), ['acquired','refused']);
    await Promise.all([closeActor(first),closeActor(second)]);
    coreAuthority({ admission, contenders: [{ request: firstRequest, reply: firstReply }, { request: secondRequest, reply: secondReply }] });
  });
  test(`ordered independent ${firstKind} winner is useful, exclusive and completable`, async t => {
    const { root, admission } = fixture(t); const firstRequest = request('first'); firstRequest.attempt.kind = firstKind;
    const secondRequest = request('second'); secondRequest.attempt.kind = firstKind === 'observed' ? 'legacy' : 'observed';
    const first = await worker({ t, root }); const firstReply = await acquire({ child: first, request: firstRequest }); assert.equal(firstReply.result.kind, 'acquired');
    const second = await worker({ t, root }); const secondReply = await acquire({ child: second, request: secondRequest }); assert.equal(secondReply.result.kind, 'refused'); if (secondReply.result.kind !== 'refused') throw new Error('Missing refusal'); assert.equal(secondReply.result.reason, 'DEVICE_BUSY');
    const effect = await exchange({ child: first, command: { operation: 'dispatch' } }); assert.equal(effect.result.kind, 'dispatched'); assert.equal(effect.effects, 1); assert.equal(secondReply.effects, 0);
    const finished = await exchange({ child: first, command: { operation: 'finalize', terminal: success } });
    assert.ok(finished.operation === 'finalize' && finished.result.kind === 'finalized'); assert.equal(finished.result.finalization.authority, 'committed');
    await Promise.all([closeActor(first),closeActor(second)]);
    coreAuthority({ admission, contenders: [{ request: firstRequest, reply: firstReply }, { request: secondRequest, reply: secondReply }], activity: [effect,finished], terminal: success });
  });
}

test('real dead child stays active on reads and admission recovers it without reclaiming uncertainty', async t => {
  const { root, admission } = fixture(t);
  const child = await worker({ t, root });
  const acquired = await reply({ child, message: { operation: 'acquire', request: request('child') } });
  assert.equal(acquired.kind, 'acquired'); assert.ok(acquired.kind === 'acquired');
  assert.equal(admission.quarantineAbandoned(acquired.owner, 'still live'), false);
  await closeActor(child);
  assert.equal(admission.inspect(device)?.state, 'active');
  assert.deepEqual(admission.acquire(request('successor')), { kind: 'refused', reason: 'DEVICE_QUARANTINED' });
  assert.equal(admission.quarantineAbandoned(acquired.owner, 'owner exited'), true);
  assert.equal(admission.inspect(device)?.state, 'quarantined');
  assert.equal(admission.readAttempt(request('child').attempt)?.terminal?.outcome, 'inconclusive');
  assert.deepEqual(admission.acquire(request('successor')), { kind: 'refused', reason: 'DEVICE_QUARANTINED' });
});

for (const operation of ['acquire', 'finalize'] as const) for (const point of ['beforeCommit', 'afterCommit']) {
  test(`child death ${operation} ${point} leaves only atomic authority`, async t => {
    const { root, admission } = fixture(t);
    const child = await worker({ t, root, faultOperation: operation, faultPoint: point });
    if (operation === 'finalize') assert.equal((await reply({ child, message: { operation: 'acquire', request: request('killed') } })).kind, 'acquired');
    const requestId = sendUnanswered({ child, command: operation === 'acquire' ? { operation, request: request('killed') } : { operation, terminal: success } });
    const state = actors.get(child)!; const exited = await state.closed;
    assert.deepEqual(state.errors, [], 'Fault command must not return a receipt or protocol error');
    assert.equal(state.termination, 'none', 'Fault death must precede deadline or teardown termination');
    assert.equal(exited.code, null, exited.stderr); assert.equal(exited.signal, 'SIGKILL');
    assert.deepEqual(faultSchema.parse(JSON.parse(exited.faultOutput)), { type: 'fault', requestId, actor: child.pid, operation, point }, 'Death must occur at the correlated fault cutpoint');
    const attempt = admission.readAttempt(request('killed').attempt);
    const disposition = admission.inspect(device);
    if (operation === 'acquire' && point === 'beforeCommit') { assert.equal(attempt, undefined); assert.equal(disposition, undefined); }
    else if (operation === 'finalize' && point === 'afterCommit') { assert.deepEqual(attempt?.terminal, success); assert.equal(disposition?.state, 'available'); }
    else { assert.equal(attempt?.state, 'active'); assert.equal(attempt?.terminal, null); assert.equal(disposition?.state, 'active'); }
  });
}

test('status is physically read-only and duplicate retrieval does not change the active store', t => {
  const { root, admission } = fixture(t);
  admission.acquire(request('poll'));
  const path = join(root, 'admission.sqlite'); const before = readFileSync(path); const mtime = statSync(path).mtimeMs;
  for (let i = 0; i < 5; i++) { admission.inspect(device); admission.readAttempt(request('poll').attempt); }
  assert.deepEqual(readFileSync(path), before); assert.equal(statSync(path).mtimeMs, mtime);
  assert.equal(admission.acquire(request('poll')).kind, 'retrieved');
  assert.deepEqual(readFileSync(path), before); assert.equal(statSync(path).mtimeMs, mtime);
});

test('initialized store missing its database cannot silently recreate or resolve a terminal', t => {
  const { root, admission } = fixture(t);
  const acquired = admission.acquire(request('removed'));
  if (acquired.kind !== 'acquired') assert.fail('Expected acquisition');
  unlinkSync(join(root, 'admission.sqlite'));
  assert.throws(() => admission.readAttempt(request('removed').attempt), { code: 'STATE_UNAVAILABLE' });
  assert.throws(() => Admission.forTesting({ root, backend: 'fake' }), { code: 'STATE_UNAVAILABLE' });
  assert.equal(acquired.claim.finalize(success).authority, 'unconfirmed');
  assert.throws(() => statSync(join(root, 'admission.sqlite')), { code: 'ENOENT' });
});

for (const corruption of ['schema', 'inactive', 'marker', 'database', 'permissions', 'symlink']) {
  test(`unsafe ${corruption} storage fails closed`, t => {
    const { root, admission } = fixture(t);
    const path = join(root, 'admission.sqlite');
    if (corruption === 'schema' || corruption === 'inactive') {
      const db = new DatabaseSync(path);
      try {
        if(corruption==='schema') {
          assert.throws(()=>db.exec('UPDATE metadata SET schema_version=999'),/Schema version must advance by one/);
          db.exec('UPDATE metadata SET schema_version=schema_version+1');
        } else {
          assert.throws(()=>db.exec("UPDATE metadata SET migration_manifest='{}'"),/Immutable metadata binding/);
          db.exec("DROP TRIGGER metadata_binding_immutable; UPDATE metadata SET migration_manifest='{}'");
        }
      } finally { db.close(); }
    } else if (corruption === 'marker') { writeFileSync(join(root, 'installation.json'), '{}'); }
    else if (corruption === 'database') { writeFileSync(path, 'corrupt SQLite'); }
    else if (corruption === 'permissions') { chmodSync(path, 0o644); }
    else { const alias = `${root}-alias`; symlinkSync(root, alias); t.after(() => unlinkSync(alias)); assert.throws(() => Admission.forTesting({ root: alias, backend: 'fake', initialize: false }), { code: 'STATE_UNAVAILABLE' }); return; }
    assert.throws(() => admission.acquire(request('unsafe')), { code: 'STATE_UNAVAILABLE' });
    assert.throws(() => admission.readAttempt(request('unsafe').attempt), { code: 'STATE_UNAVAILABLE' });
  });
}

test('bounded SQLite contention refuses acquisition while preserving the incumbent', t => {
  const { root, admission } = fixture(t);
  admission.acquire(request('incumbent'));
  const db = new DatabaseSync(join(root, 'admission.sqlite'));
  try {
    db.exec('BEGIN IMMEDIATE');
    const start = performance.now();
    assert.throws(() => admission.acquire(request('blocked')), { code: 'STATE_UNAVAILABLE' });
    assert.ok(performance.now() - start < 1500, 'Writer wait must be bounded');
    assert.equal(admission.inspect(device)?.owner?.attempt.id, 'incumbent');
  } finally { db.exec('ROLLBACK'); db.close(); }
});

test('ambiguous dispatch authorization revokes the local session before a caller can issue a follow-up', t => {
  const { root } = fixture(t);
  let fault = true;
  const admission = Admission.forTesting({ root, backend: 'fake', fault(point, operation) { if (fault && point === 'afterCommit' && operation === 'authorize') { fault = false; throw new Error('reply lost'); } } });
  const result = admission.acquire(request('dispatch-ambiguity'));
  if (result.kind !== 'acquired') assert.fail('Expected acquisition');
  const session = result.claim.bindDriver('fake'); let calls = 0;
  assert.throws(() => session.dispatch('launch', async () => { calls++; }), { code: 'STATE_UNAVAILABLE' });
  assert.throws(() => session.dispatch('capture', async () => { calls++; }), { code: 'DISPATCH_CLOSED' });
  assert.equal(calls, 0);
});

test('late owner and stale fencing cannot overwrite a successor or change immutable terminals', t => {
  const { root, admission } = fixture(t);
  const first = admission.acquire(request('first-generation'));
  if (first.kind !== 'acquired') assert.fail('Expected acquisition');
  assert.throws(() => { first.claim.identity.token = 'replacement'; }, TypeError);
  assert.equal(first.claim.finalize(success).authority, 'committed');
  const next = admission.acquire(request('second-generation'));
  if (next.kind !== 'acquired') assert.fail('Expected acquisition');
  assert.equal(next.claim.identity.generation, first.claim.identity.generation + 1);
  assert.notEqual(next.claim.identity.token, first.claim.identity.token);
  const recovery = Admission.forTesting({ root, backend: 'fake', ownerLiveness: () => 'dead' });
  assert.throws(() => recovery.quarantineAbandoned({ ...next.claim.identity, token: first.claim.identity.token }, 'stale token'), { code: 'STALE_OWNER' });
  assert.throws(() => recovery.quarantineAbandoned({ ...next.claim.identity, generation: first.claim.identity.generation }, 'stale generation'), { code: 'STALE_OWNER' });
  assert.throws(() => first.claim.cancel(), { code: 'STALE_OWNER' });
  assert.throws(() => first.claim.finalize({ ...success, payload: { changed: true } }), { code: 'STALE_OWNER' });
  assert.equal(first.claim.finalize(success).authority, 'committed');
  assert.equal(admission.inspect(device)?.owner?.attempt.id, 'second-generation');
  assert.equal(admission.readAttempt(request('first-generation').attempt)?.terminal?.outcome, 'observed');
});

test('unknown liveness remains busy; quarantine on one device does not prevent independent admission', t => {
  const { root, admission } = fixture(t);
  const first = admission.acquire(request('quarantine'));
  if (first.kind !== 'acquired') assert.fail('Expected acquisition');
  const uncertain = Admission.forTesting({ root, backend: 'fake', ownerLiveness: () => 'unknown' });
  assert.equal(uncertain.quarantineAbandoned(first.claim.identity, 'uncertain'), false);
  assert.equal(admission.inspect(device)?.state, 'active');
  first.claim.finalize({ outcome: 'inconclusive', disposition: 'quarantined', payload: {}, evidenceRefs: [] });
  const other = 'ABCDEF00-0000-4000-8000-000000000002';
  assert.equal(admission.acquire(request('different-business-action', other)).kind, 'acquired');
  assert.deepEqual(admission.acquire(request('quarantine', other)), { kind: 'refused', reason: 'ACTION_ID_CONFLICT' });
});

test('test capability is refused by real backend attachment and device aliases are rejected', t => {
  const { admission } = fixture(t);
  assert.throws(() => admission.assertBackend('real'), { code: 'STATE_UNAVAILABLE' });
  for (const alias of ['booted', 'iPhone', ` ${device}`, `${device}/path`]) assert.throws(() => admission.acquire(request('bad', alias)), { code: 'INVALID_REQUEST' });
  const acquired = admission.acquire(request('valid'));
  if (acquired.kind !== 'acquired') assert.fail('Expected acquisition');
  assert.throws(() => acquired.claim.bindDriver('real'), { code: 'STATE_UNAVAILABLE' });
});

test('legacy scripted attempts retain multiple taps while observed attempts remain single submission', async t => {
  const { admission } = fixture(t);
  const acquired = admission.acquire({ ...request('legacy-script'), attempt: { kind: 'legacy', id: 'legacy-script' } });
  if (acquired.kind !== 'acquired') assert.fail('Expected acquisition');
  const session = acquired.claim.bindDriver('fake'); let calls = 0;
  await session.dispatch('tap', async () => { calls++; });
  await session.dispatch('tap', async () => { calls++; });
  assert.equal(calls, 2);
  assert.equal(acquired.claim.finalize({ ...success, outcome: 'completed' }).authority, 'committed');
});

test('opening a store with a changed journal policy refuses rather than silently rewriting it', t => {
  const { root, admission } = fixture(t);
  const db = new DatabaseSync(join(root, 'admission.sqlite'));
  db.exec('PRAGMA journal_mode=WAL'); db.close();
  assert.throws(() => admission.inspect(device), { code: 'STATE_UNAVAILABLE' });
});

for (const point of ['beforeCommit', 'afterCommit'] as const) {
  test(`signal cancellation survives a ${point} cancellation write failure and late tap settlement`, async t => {
    const { root, admission } = fixture(t);
    const controller = new AbortController();
    const faulty = Admission.forTesting({ root, backend: 'fake', fault(at, operation) {
      if (at === point && operation === 'cancel') throw new Error('cancel persistence failed');
    } });
    const acquired = faulty.acquire({ ...request('cancel-persistence'), signal: controller.signal });
    if (acquired.kind !== 'acquired') assert.fail('Expected acquisition');
    const session = acquired.claim.bindDriver('fake');
    let settle!: () => void;
    const pending = session.dispatch('tap', () => new Promise<void>(resolve => { settle = resolve; }));
    controller.abort();
    assert.throws(() => session.dispatch('capture', async () => {}), { code: 'DISPATCH_CLOSED' });
    settle(); await pending;
    assert.throws(() => acquired.claim.finalize(success), { code: 'OPERATIONS_UNSETTLED' });
    assert.equal(admission.inspect(device)?.state, 'active');
    assert.equal(admission.readAttempt(request('cancel-persistence').attempt)?.terminal, null);
    const cancelled = { outcome: 'inconclusive' as const, disposition: 'quarantined' as const, payload: { reason: 'cancelled' }, evidenceRefs: [] };
    assert.equal(acquired.claim.finalize(cancelled).authority, 'committed');
    assert.equal(admission.inspect(device)?.state, 'quarantined');
    assert.equal(admission.readAttempt(request('cancel-persistence').attempt)?.cancellationRequested, true);
    assert.deepEqual(admission.readAttempt(request('cancel-persistence').attempt)?.terminal, cancelled);
  });
}

for (const suffix of ['-journal', '-wal', '-shm']) {
  for (const unsafeKind of ['permissions', 'symlink', 'directory']) {
    test(`unsafe SQLite ${suffix} ${unsafeKind} is refused before SQLite can consume or rewrite it`, t => {
      const { root, admission } = fixture(t);
      const path = join(root, `admission.sqlite${suffix}`);
      const target = join(root, 'sidecar-target');
      const bytes = Buffer.alloc(512, 0);
      if (unsafeKind === 'permissions') { writeFileSync(path, bytes, { mode: 0o644 }); }
      else if (unsafeKind === 'symlink') { writeFileSync(target, bytes, { mode: 0o600 }); symlinkSync(target, path); }
      else { mkdirSync(path, { mode: 0o700 }); }
      const before = lstatSync(path);
      assert.throws(() => admission.inspect(device), { code: 'STATE_UNAVAILABLE' });
      assert.throws(() => admission.acquire(request('unsafe-sidecar')), { code: 'STATE_UNAVAILABLE' });
      const after = lstatSync(path);
      assert.equal(after.ino, before.ino);
      assert.equal(after.mode, before.mode);
      if (unsafeKind !== 'directory') assert.deepEqual(readFileSync(path), bytes);
    });
  }
}

test('SQLite creates its transaction journal with private permissions', t => {
  const { root } = fixture(t);
  let witnessedJournal = false;
  const admission = Admission.forTesting({ root, backend: 'fake', fault(point, operation) {
    if (point === 'beforeCommit' && operation === 'acquire') {
      const journal = lstatSync(join(root, 'admission.sqlite-journal'));
      assert.equal(journal.mode & 0o777, 0o600);
      assert.equal(journal.uid, process.getuid!());
      assert.equal(journal.isFile(), true);
      assert.equal(journal.isSymbolicLink(), false);
      witnessedJournal = true;
    }
  } });
  assert.equal(admission.acquire(request('private-journal')).kind, 'acquired');
  assert.equal(witnessedJournal, true);
});
