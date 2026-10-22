import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Admission, type AdmissionRequest, type FenceRequest } from '../src/device/admission.js';
const device = 'abcdef00-0000-4000-8000-000000000001';
const request = (id: string): AdmissionRequest => ({ device, attempt: { kind: 'legacy', id }, digest: id, intent: {} });
function fixture(t: TestContext) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'admission-core-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, admission: Admission.forTesting({ root, backend: 'fake' }) };
}

test('structured dispatch binds its native component and retains the query reply for stop evidence', async t => {
  const { admission } = fixture(t);
  const acquired = admission.acquire(request('bound-query'));
  if (acquired.kind !== 'acquired') assert.fail('Expected owner');
  acquired.claim.registerComponent({ id: 'query', kind: 'one-shot', operation: 'process-list' });
  const session = acquired.claim.bindDriver('fake');
  const reply = { stdout: 'PID NAME ARGS\n1 init init\n', stderr: '', exitCode: 0 };
  await session.dispatch({ requestId: 'query-1', componentId: 'query', operation: 'process-list', payload: {}, recordResult: true }, async () => reply);
  const generation = admission.readGeneration(acquired.claim.identity);
  assert.equal(generation.commands[0]?.componentId, 'query');
  assert.deepEqual(generation.componentObservations.map(item => item.payload), [{ commandId: generation.commands[0]!.id, result: reply }]);
});

test('component start observations append under the owner and cannot be rebound', t => {
  const { admission } = fixture(t);
  const acquired = admission.acquire(request('component-start'));
  if (acquired.kind !== 'acquired') assert.fail('Expected owner');
  acquired.claim.registerComponent({ id: 'adb-native', kind: 'adb-command', serial: 'emulator-5554', args: ['-s','emulator-5554','shell','sleep','11'] });
  acquired.claim.observeComponent('adb-native', { kind: 'host-start', process: { pid: 714, incarnation: 'first' } });
  acquired.claim.observeComponent('adb-native', { kind: 'host-start', process: { pid: 714, incarnation: 'first' } });
  assert.throws(() => acquired.claim.observeComponent('adb-native', { kind: 'host-start', process: { pid: 714, incarnation: 'second' } }), { code: 'INVALID_REQUEST' });
  assert.equal(admission.readGeneration(acquired.claim.identity).componentObservations.length, 1);
});

test('L2 kill-adb recovery requires a recorded process-list reply and the exact host incarnation', async t => {
  const { root } = fixture(t);
  const admission = Admission.forTesting({ root, backend: 'fake', initialize: false, componentLiveness: () => 'exited', ownerLiveness: () => 'dead' });
  const acquired = admission.acquire({ ...request('adb-owner'), category: 'android-phone', device: 'hardware' });
  if (acquired.kind !== 'acquired') assert.fail('Expected owner');
  acquired.claim.registerComponent({ id: 'adb-old', kind: 'adb-command', serial: 'usb', args: ['-s','usb','shell','sleep','11'] });
  acquired.claim.observeComponent('adb-old', { kind: 'host-start', process: { pid: 714, incarnation: 'original' } });
  acquired.claim.issue({ requestId: 'sleep', componentId: 'adb-old', operation: 'adb', payload: {} });
  const result = await admission.acquireWithRecovery({ ...request('adb-next'), category: 'android-phone', device: 'hardware' }, async claim => {
    claim.registerComponent({ id: 'ps', kind: 'adb-command', serial: 'usb', args: ['-s','usb','shell','ps','-A','-o','PID,NAME,ARGS'] });
    await claim.dispatch({ requestId: 'ps', componentId: 'ps', operation: 'adb', payload: {}, recordResult: true }, async () => ({ exitCode: 0, stdout: 'PID NAME ARGS\n1 init init\n', stderr: '' }));
    const view = admission.readGeneration(acquired.claim.identity);
    const query = view.commands.find(command => command.requestId === 'ps')!;
    return { requestId: 'receipt', kind: 'stop', commands: view.commands.filter(command => command.state !== 'settled').map(command => command.id), components: [
      { componentId: 'adb-old', proof: { kind: 'adb-stopped', process: { pid: 714, incarnation: 'original' }, commandId: query.id } },
      { componentId: 'ps', proof: { kind: 'completed-command', commandId: query.id } },
    ] };
  });
  assert.equal(result.kind, 'acquired');
  assert.equal(admission.readAttempt(acquired.claim.identity.attempt)?.terminal?.outcome, 'inconclusive');
});

test('L3 kill-agent requires stop evidence for agent, stream and forward components', async t => {
  const { root } = fixture(t);
  const admission = Admission.forTesting({ root, backend: 'fake', initialize: false, componentLiveness: () => 'exited' });
  const acquired = admission.acquire({ ...request('agent-components'), category: 'android-phone', device: 'hardware' });
  if (acquired.kind !== 'acquired') assert.fail('Expected owner');
  const claim = acquired.claim;
  claim.registerComponent({ id: 'agent', kind: 'android-agent', serial: 'usb', classpath: '/data/local/tmp/jev-ios-bridge-agent.dex', className: 'com.mobilenext.mobilecli.DeviceServer' });
  claim.observeComponent('agent', { kind: 'agent-start', pid: 71, startTime: '12345' });
  claim.registerComponent({ id: 'stream', kind: 'android-stream', serial: 'usb', args: ['-s','usb','logcat'] });
  claim.observeComponent('stream', { kind: 'host-start', process: { pid: 72, incarnation: 'original-stream' } });
  claim.registerComponent({ id: 'forward', kind: 'android-forward', serial: 'usb', local: 'tcp:49526', remote: 'localabstract:mobilecli-server' });
  const session = claim.bindDriver('fake');
  const queries = [
    { id: 'agent-query', args: ['-s','usb','shell', "'cat' '/proc/71/stat'"], result: { exitCode: 1, stdout: '', stderr: 'cat: No such file or directory\n' } },
    { id: 'forward-query', args: ['forward','--list'], result: { exitCode: 0, stdout: '', stderr: '' } },
  ];
  for (const query of queries) {
    claim.registerComponent({ id: query.id, kind: 'adb-command', serial: 'usb', args: query.args });
    await session.dispatch({ requestId: query.id, componentId: query.id, operation: 'adb', payload: {}, recordResult: true }, async () => query.result);
  }
  claim.closeDispatch({ outcome: 'inconclusive', disposition: 'quarantined', payload: {}, evidenceRefs: [] });
  const view = admission.readGeneration(claim.identity);
  const commandId = (component: string) => view.commands.find(command => command.componentId === component)!.id;
  const components: FenceRequest['components'] = [
    { componentId: 'agent', proof: { kind: 'android-component-stopped', commandId: commandId('agent-query') } },
    { componentId: 'forward', proof: { kind: 'android-component-stopped', commandId: commandId('forward-query') } },
    ...queries.map(query => ({ componentId: query.id, proof: { kind: 'completed-command' as const, commandId: commandId(query.id) } })),
  ];
  assert.throws(() => admission.submitFence(claim.identity, { requestId: 'missing-stream', kind: 'stop', components, commands: [] }), { code: 'COVERAGE_INCOMPLETE' });
  components.push({ componentId: 'stream', proof: { kind: 'android-stream-exited', process: { pid: 72, incarnation: 'original-stream' } } });
  admission.submitFence(claim.identity, { requestId: 'all-components', kind: 'stop', components, commands: [] });
  assert.equal(admission.inspect({ category: 'android-phone', value: 'hardware' })?.state, 'available');
});

test('post-admission identity queries each authorize before spawn and settle on completion', { timeout: 5000 }, async t => {
  const { FakeAdb } = await import('./fixtures/android-device.js');
  const { AndroidOwnership } = await import('../src/device/android/ownership.js');
  const { admission } = fixture(t);
  const acquired = admission.acquire({ ...request('probe-commands'), category: 'android-phone', device: 'hardware' });
  if (acquired.kind !== 'acquired') assert.fail('Expected owner');
  const ownership = new AndroidOwnership(admission, acquired.claim, 'emulator-5554', 'fake');
  const adb = new FakeAdb({ serial: 'emulator-5554', avd: 'jev-actions-api31' });
  const probe = adb.identityProbe.withRecorder!(async (file, args, effect) => {
    return ownership.probe(file, args, async () => {
      const commands = ownership.view().commands;
      assert.equal(commands.at(-1)?.state, 'outstanding');
      return effect();
    });
  });
  await probe.android(AbortSignal.timeout(3000), 'emulator-5554');
  assert.ok(ownership.view().commands.length >= 6);
  assert.ok(ownership.view().commands.every(command => command.state === 'settled'));
  ownership.finish();
  assert.equal(admission.inspect({ category: 'android-phone', value: 'hardware' })?.state, 'available');
});

test('phone hardware key excludes USB and wireless owners while recording transport and exact intent', t => {
  const { admission, root } = fixture(t);
  const intent = { identity: { category: 'android-phone', value: 'hardware', transport: { serial: 'hardware', state: 'device' }, probeReplies: { hardwareSerial: 'hardware\r\n' } }, profile: { name: 'phone', source: 'project' } };
  const first = admission.acquire({ ...request('usb'), category: 'android-phone', device: 'hardware', transport: { serial: 'hardware', state: 'device' }, intent });
  if (first.kind !== 'acquired') assert.fail('Expected USB owner');
  assert.deepEqual(admission.readAttempt(first.claim.identity.attempt)?.intent, intent);
  assert.deepEqual(admission.acquire({ ...request('wifi'), category: 'android-phone', device: 'hardware', transport: { serial: '192.0.2.1:5555', state: 'device' } }), { kind: 'refused', reason: 'DEVICE_BUSY' });
  const db = new DatabaseSync(join(root, 'admission.sqlite'));
  try { assert.equal(JSON.parse(String(db.prepare('SELECT attributes FROM devices').get()?.attributes)).transport.serial, 'hardware'); } finally { db.close(); }
});
