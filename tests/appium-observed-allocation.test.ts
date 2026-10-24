import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createObservedDriver } from '../src/device/factory.js';
import type { AllocationResult, AllocationSnapshotV1 } from '../src/observed/allocation.js';
import { ObservedActionService } from '../src/observed/service.js';
import { fixtureDevice } from './fixtures/observed-allocation-backend.js';
import { WDA_BUNDLE } from './fixtures/appium-wire/driver-fixture.js';
import { BUNDLE, appiumAllocator, createdDevice, fixtureWorld, tapLeadsDone } from './fixtures/appium-wire/observed-allocator.js';

const snapshot = (result: AllocationResult): AllocationSnapshotV1 => {
  if ('kind' in result) assert.fail(JSON.stringify(result));
  return result;
};
const terminal = (result: AllocationResult) => { const s = snapshot(result); return { state: s.state, phase: s.phase, outcome: s.outcome, reason: s.reason, authority: s.authority }; };
const sourceCalls = (calls: string[]) => calls.filter(call => call !== 'plist');
async function until(reached: () => boolean, label: string): Promise<void> {
  for (let waited = 0; !reached(); waited += 10) { assert.ok(waited < 10_000, label); await delay(10); }
}
const refused = (reason: string) => ({ state: 'retained', phase: 'terminal', outcome: 'refused', reason, authority: 'committed' });
const sessionRefused = fixtureWorld([{ tool: 'appium_session_management', nth: 1, fault: { kind: 'error', code: 'DRIVER_ERROR' } }, ...tapLeadsDone]);
const fenceTrail = (effects: { kind: string; signal?: string }[]) => effects.map(effect => effect.signal ? `${effect.kind} ${effect.signal}` : effect.kind);

test('the allocator on the Appium preparation driver prepares once: create, boot, install, one launch with no console or log stream, readiness, park; an identical prepare is a pure retrieval', async t => {
  const { f, w, allocator } = await appiumAllocator(t);
  const ready = snapshot(await allocator.prepare(f.request()));
  assert.deepEqual(terminal(ready), { state: 'ready', phase: 'parked', outcome: 'prepared', reason: null, authority: 'committed' });
  assert.deepEqual(ready.device, { platform: 'ios-simulator', udid: fixtureDevice });
  const stagedPath = f.admission.readAllocation(ready.allocationId)!.staged!.stagedPath;
  assert.deepEqual(sourceCalls(f.calls), ['create'], 'no MobileBuildMCP command runs');
  assert.deepEqual(w.native.calls.map(call => [call.command.kind, ...call.command.args]), [['ios-boot', 'simctl', 'boot', fixtureDevice],
    ['ios-install', 'simctl', 'install', fixtureDevice, stagedPath], ['ios-launch', 'simctl', 'launch', '--terminate-running-process', fixtureDevice, BUNDLE]]);
  assert.equal(w.opened.length, 1);
  assert.deepEqual(w.opened[0]!.tools().filter(name => !['appium_get_page_source', 'jev_screen'].includes(name)), ['appium_session_management', 'jev_settings', 'appium_session_management'],
    'the preparation session is deleted before park and the app is never terminated');
  assert.deepEqual(w.fence.effects.filter(effect => effect.kind === 'wda-stop'), [{ kind: 'wda-stop', udid: fixtureDevice, bundleId: WDA_BUNDLE, pid: 777 }]);
  assert.equal(f.admission.inspect(fixtureDevice)?.state, 'active', 'parked stock keeps its device');
  const tools = w.opened[0]!.tools().length;
  assert.deepEqual(await allocator.prepare(f.request()), ready);
  assert.deepEqual([sourceCalls(f.calls), w.native.calls.length, w.opened.length, w.opened[0]!.tools().length], [['create'], 3, 1, tools], 'retrieval makes no device call');
});

test('a changed preparation request (timeoutMs) is ACTION_ID_CONFLICT with the store bytes unchanged, on the Appium preparation driver', async t => {
  const { f, w, allocator } = await appiumAllocator(t);
  const ready = snapshot(await allocator.prepare(f.request()));
  const bytes = await readFile(join(f.store, 'admission.sqlite'));
  const conflict = await allocator.prepare({ ...f.request(), timeoutMs: 300001 });
  assert.deepEqual(conflict, { version: 1, kind: 'observed-operation-error', code: 'ACTION_ID_CONFLICT', message: 'Allocation operation refused: ACTION_ID_CONFLICT.',
    actionId: 'allocate-one', allocationId: ready.allocationId, evidenceDirectory: join(f.runsDir, 'observed/allocate-one/allocation'), acceptance: 'yes', acceptanceKind: 'preparation' });
  assert.deepEqual(await readFile(join(f.store, 'admission.sqlite')), bytes);
  assert.deepEqual([w.native.calls.length, w.opened.length], [3, 1]);
});

for (const [phase, natives] of [['boot', ['ios-boot']], ['install', ['ios-boot', 'ios-install']], ['launch', ['ios-boot', 'ios-install', 'ios-launch']],
  ['readiness', ['ios-boot', 'ios-install', 'ios-launch']]] as const) {
  test(`cancel during the Appium ${phase} ends CANCELLED and quarantined, and its late completion dispatches nothing more`, async t => {
    const held = `ios-${phase}`;
    const { f, w, allocator } = await appiumAllocator(t, phase === 'readiness'
      ? { worlds: [fixtureWorld([{ tool: 'appium_get_page_source', nth: 1, fault: { kind: 'held' } }, ...tapLeadsDone])] }
      : { nativeHeld: command => command.kind === held });
    const preparing = allocator.prepare(f.request());
    await until(() => phase === 'readiness' ? !!w.opened[0]?.tools().includes('appium_get_page_source') : w.native.calls.some(call => call.command.kind === held), `${phase} reached`);
    const allocationId = f.admission.readAllocationForAction('allocate-one')!.allocationId;
    const cancelling = allocator.cancel(allocationId);
    await until(() => f.admission.readAllocation(allocationId)!.cancellationRequested, 'cancellation committed');
    for (const call of w.native.calls) call.exit({ kind: 'exited', code: 0 });
    for (const opened of w.opened) opened.release();
    assert.equal(snapshot(await cancelling).cancellationRequested, true);
    assert.deepEqual(terminal(await preparing), { state: 'quarantined', phase: 'terminal', outcome: 'uncertain', reason: 'CANCELLED', authority: 'committed' });
    await delay(100);
    assert.deepEqual([w.native.calls.map(call => call.command.kind), w.opened.map(opened => opened.tools())],
      [natives, phase === 'readiness' ? [['appium_session_management', 'jev_settings', 'appium_get_page_source', 'appium_session_management']] : [[]]],
      'the late completion reaches no further step: no screen read, no install or launch after the cancel, only the session delete');
    assert.equal(f.admission.readAllocation(allocationId)?.state, 'quarantined');
  });
}

test('cancel of ready stock and retire both give retired_unused on the Appium composition, and a later action is ALLOCATION_NOT_READY', async t => {
  const { f, w, allocator } = await appiumAllocator(t);
  const first = snapshot(await allocator.prepare(f.request('ready-cancel')));
  const second = snapshot(await allocator.prepare(f.request('ready-retire')));
  assert.deepEqual([first.device?.udid, second.device?.udid], [fixtureDevice, createdDevice(2)]);
  const natives = w.native.calls.length;
  const cancelled = snapshot(await allocator.cancel(first.allocationId));
  const retired = snapshot(await allocator.retire(second.allocationId));
  assert.deepEqual([cancelled.state, cancelled.outcome, cancelled.reason, cancelled.cancellationRequested], ['retained', 'retired_unused', 'RETAINED_UNUSED', true]);
  assert.deepEqual([retired.state, retired.outcome, retired.reason, retired.cancellationRequested], ['retained', 'retired_unused', 'RETAINED_UNUSED', false]);
  const service = new ObservedActionService({ admission: f.admission, allocator, runsDir: f.runsDir, bridgeVersion: 'fixture', backend: 'fake', enabled: true,
    createDriver: () => createObservedDriver({ host: w.host, admission: f.admission, presentation: 'visible' }) });
  t.after(() => service.close());
  for (const ready of [first, second]) {
    await assert.rejects(service.start({ version: 1, actionId: ready.actionId, allocationId: ready.allocationId, app: { bundleId: BUNDLE }, action: { kind: 'tap', selector: { identifier: 'go' } },
      before: { present: [{ identifier: 'go' }] }, after: { present: [{ identifier: 'done' }] }, timeoutMs: 5000 }), { code: 'ALLOCATION_NOT_READY' });
  }
  assert.deepEqual([w.native.calls.length, w.opened.length], [natives, 2], 'no executor is built and no device call is made');
});

test('unknown fresh creation stays quarantined with CREATE_UNCONFIRMED and capacity held, builds no Appium driver, and the next prepare is HOST_CREATION_UNRESOLVED', async t => {
  const { f, w, allocator } = await appiumAllocator(t);
  f.setCreateResult({ exitCode: null, stdout: '', stderr: '' });
  const unknown = snapshot(await allocator.prepare(f.request()));
  assert.deepEqual([unknown.state, unknown.outcome, unknown.reason, unknown.hostCreationBlocked, unknown.device, unknown.reservation],
    ['quarantined', 'uncertain', 'CREATE_UNCONFIRMED', true, null, { bytes: 1000, capacityHeld: true }]);
  assert.deepEqual(f.admission.readAllocationCapacity(), { heldAllocations: 1, reservedBytes: 1000 });
  const next = await allocator.prepare(f.request('another'));
  assert.deepEqual('kind' in next ? [next.code, next.blockingAllocationId] : next, ['HOST_CREATION_UNRESOLVED', unknown.allocationId]);
  assert.deepEqual([sourceCalls(f.calls), w.native.calls.length, w.opened.length], [['create'], 0, 0]);
});

test('a known failure after the Appium driver admitted (storage gone before install) releases through the driver\'s staged fence: retained and available', async t => {
  let dropped = false;
  const fixture = await appiumAllocator(t, { nativeExit: command => { if (command.kind === 'ios-boot' && !dropped) { dropped = true; fixture.f.setStorage(100); } return undefined; } });
  const { f, w, allocator } = fixture;
  assert.deepEqual(terminal(await allocator.prepare(f.request())), refused('STORAGE_UNAVAILABLE'));
  assert.deepEqual(w.native.calls.map(call => call.command.kind), ['ios-boot']);
  assert.equal(f.admission.inspect(fixtureDevice)?.state, 'available');
});

test('a settled simctl install failure on the Appium driver is INSTALL_FAILED, retained and available, as on the legacy driver', async t => {
  const { f, w, allocator } = await appiumAllocator(t, { nativeExit: command => command.kind === 'ios-install' ? 1 : undefined });
  assert.deepEqual(terminal(await allocator.prepare(f.request())), refused('INSTALL_FAILED'));
  assert.deepEqual(w.native.calls.map(call => call.command.kind), ['ios-boot', 'ios-install']);
  assert.equal(f.admission.inspect(fixtureDevice)?.state, 'available');
});

test('a simctl install whose result is lost (NATIVE_OUTCOME_UNKNOWN) stays PREPARATION_UNCONFIRMED and quarantined', async t => {
  const { f, w, allocator } = await appiumAllocator(t, { nativeHeld: command => command.kind === 'ios-install' });
  const preparing = allocator.prepare(f.request());
  await until(() => w.native.calls.some(call => call.command.kind === 'ios-install'), 'install reached');
  w.native.calls.at(-1)!.exit({ kind: 'lost' });
  assert.deepEqual(terminal(await preparing), { state: 'quarantined', phase: 'terminal', outcome: 'uncertain', reason: 'PREPARATION_UNCONFIRMED', authority: 'committed' });
  assert.equal(f.admission.inspect(fixtureDevice)?.state, 'quarantined');
});

test('a session create the private Appium refuses at launch is LAUNCH_FAILED and releases through the staged fence', async t => {
  const { f, w, allocator } = await appiumAllocator(t, { worlds: [sessionRefused] });
  assert.deepEqual(terminal(await allocator.prepare(f.request())), refused('LAUNCH_FAILED'));
  assert.deepEqual(w.native.calls.map(call => call.command.kind), ['ios-boot', 'ios-install', 'ios-launch']);
  assert.equal(f.admission.inspect(fixtureDevice)?.state, 'available');
});

test('N1: a failed preparation whose Appium close outlasts 5 s (a private group that survives SIGTERM) is KILLed and fenced, then releases through the staged fence', { timeout: 30_000 }, async t => {
  const { f, w, allocator } = await appiumAllocator(t, { groupsSurviveTerm: true, worlds: [sessionRefused] });
  const started = performance.now();
  assert.deepEqual(terminal(await allocator.prepare(f.request())), refused('LAUNCH_FAILED'));
  assert.ok(performance.now() - started > 5000, 'the close waited the full TERM grace');
  assert.deepEqual(fenceTrail(w.fence.effects), ['wda-inventory', 'host-inventory', 'host-signal-group SIGTERM', 'host-inventory', 'host-signal-group SIGKILL', 'host-inventory']);
  assert.equal(w.killed.size, 1);
  assert.equal(f.admission.inspect(fixtureDevice)?.state, 'available');
});
