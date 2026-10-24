/**
 * Preservation matrix, observed preparation and action (P3.9). Preparation runs on the Appium preparation driver over
 * a real reservation; the action runs through the real ObservedActionService with Appium executors. The allocator
 * still builds its own driver, so its rows are named for P3.10.
 */
import assert from 'node:assert/strict';
import { Socket } from 'node:net';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import type { Admission } from '../src/device/admission.js';
import { ObservedActionService } from '../src/observed/service.js';
import { UDID, WDA_BUNDLE } from './fixtures/appium-wire/driver-fixture.js';
import { iosTarget } from './fixtures/appium-wire/matrix.js';
import { iosScreen, world, worldFixture, type IosNode, type WorldRule } from './fixtures/appium-wire/world.js';

const live = () => AbortSignal.timeout(20_000);
const digest = 'a'.repeat(64);
const go: IosNode = { type: 'Button', name: 'go', label: 'Go', frame: [20, 200, 200, 44] };
const done: IosNode = { type: 'StaticText', name: 'done', label: 'Done', frame: [16, 300, 200, 40] };
const screens = { go: iosScreen([go], 'dev.fixture'), done: iosScreen([done], 'dev.fixture'), both: iosScreen([go, done], 'dev.fixture') };
const tapLeadsDone: WorldRule[] = [{ tool: 'appium_perform_actions', when: 'go', to: 'done' }];
const context = { app: { bundleId: 'dev.fixture' } };
const request = (allocationId: string, extra: Record<string, unknown> = {}) => ({ version: 1, actionId: 'allocated', allocationId, app: { bundleId: 'dev.fixture' },
  action: { kind: 'tap', selector: { identifier: 'go' } }, before: { present: [{ identifier: 'go' }] }, after: { present: [{ identifier: 'done' }] }, timeoutMs: 5000, ...extra });

async function reserve(admission: Admission) {
  const reserved = admission.reserveAllocation({ actionId: 'allocated', preparationDigest: digest, preparation: {}, appBundleId: 'dev.fixture',
    source: { kind: 'create', deviceTypeId: 'device-type', runtimeId: 'runtime' }, inspectedContentDigest: digest,
    artifactBytes: 100, configVersion: 1, configDigest: digest, evidenceDirectory: '/isolated/evidence',
    budgets: { maxRetainedAllocations: 8, maxConcurrentPreparations: 1, reservationBytesPerAllocation: 800,
      maxReservedBytes: 6400, minFreeBytes: 2000, maxArtifactBytes: 200, createTimeoutMs: 60000, bootTimeoutMs: 120000,
      installTimeoutMs: 120000, launchTimeoutMs: 30000, readinessTimeoutMs: 30000, readyTtlMs: 300000, timeoutMs: 360000 },
    storage: { simulatorFreeBytes: 10000, stagingFreeBytes: 10000 } });
  if (reserved.kind !== 'reserved') throw new Error('reserve');
  const reservation = reserved.reservation;
  reservation.stage({ stagedPath: '/isolated/Fixture.app', contentDigest: digest, bytes: 100, maxBytes: 200,
    metadata: { bundleId: 'dev.fixture', executable: 'Fixture', architecture: 'arm64', minimumOSVersion: '27.0', build: { id: 'fixture', origin: 'host' } } });
  await reservation.create(async () => ({ status: 'created', udid: UDID, provenance: { kind: 'simctl-create',
    allocationId: reservation.identity.allocationId, name: `jev-observed-${reservation.identity.allocationId}`, deviceTypeId: 'device-type', runtimeId: 'runtime' } }));
  const admitted = reservation.admit();
  if (admitted.kind !== 'admitted') throw new Error('admit');
  return { claim: admitted.claim, allocationId: reservation.identity.allocationId };
}

/** A parked allocation prepared by the Appium preparation driver, and the action service whose executors are Appium drivers. */
async function observed(t: TestContext, action: ReturnType<typeof world>) {
  const f = worldFixture(t, world('ios', { go: screens.go }), iosTarget, command => ['ios-boot', 'ios-install', 'ios-launch'].includes(command.kind) ? '' : undefined);
  f.fence.wda = [{ udid: UDID, bundleId: WDA_BUNDLE, pid: 777 }];
  const { claim, allocationId } = await reserve(f.admission);
  await f.driver.attachPreparation(claim, context, live());
  await f.driver.boot(live()); await f.driver.install('/isolated/Fixture.app', live()); await f.driver.launch(live()); await f.driver.readiness(live());
  assert.equal((await f.driver.park(['/isolated/evidence/readiness.json'], [], live())).authority, 'committed');
  const executors: ReturnType<typeof f.open>[] = [];
  const service = new ObservedActionService({ admission: f.admission, runsDir: join(f.root, 'evidence'), bridgeVersion: 'fixture', backend: 'fake', enabled: true,
    createDriver: () => { const opened = f.open(action); executors.push(opened); return opened.driver; } });
  t.after(() => service.close());
  return { f, service, allocationId, executors };
}

/** Records every network attempt the process makes while `work` runs. */
async function networkDuring<T>(work: () => Promise<T>): Promise<{ result: T; attempts: string[] }> {
  const attempts: string[] = [];
  const fetch = globalThis.fetch;
  const connect = Socket.prototype.connect;
  globalThis.fetch = async input => { attempts.push(`fetch ${String(input)}`); throw new Error('No network'); };
  Socket.prototype.connect = function (this: Socket, ...args: unknown[]) { attempts.push(`connect ${JSON.stringify(args[0])}`); return Reflect.apply(connect, this, args) as Socket; };
  try { return { result: await work(), attempts }; }
  finally { globalThis.fetch = fetch; Socket.prototype.connect = connect; }
}

test('observed preparation on Appium launches once through simctl with no console or log stream, and parks with the runner fenced', async t => {
  const { f } = await observed(t, world('ios', screens, tapLeadsDone));
  assert.deepEqual(f.native.calls.map(call => call.command.args), [['simctl', 'boot', UDID], ['simctl', 'install', UDID, '/isolated/Fixture.app'],
    ['simctl', 'launch', '--terminate-running-process', UDID, 'dev.fixture']]);
  assert.deepEqual(f.tools().filter(name => !['appium_get_page_source', 'jev_screen'].includes(name)), ['appium_session_management', 'jev_settings', 'appium_session_management'],
    'the preparation session is deleted before park, and the app is never terminated');
  assert.deepEqual(f.fence.wda, []);
});

const outcome = (snapshot: Awaited<ReturnType<ObservedActionService['inspect']>>) => ({ state: snapshot.state, outcome: snapshot.outcome, reason: snapshot.reason,
  authority: snapshot.authority, actionAttempted: snapshot.actionAttempted, actionAcknowledged: snapshot.actionAcknowledged, admission: snapshot.admission });

test('an observed tap on Appium: one input on a fresh session with no launch, key-free, retrieved identically, and a changed request conflicts',
  { todo: '#78 fix round 1 item 1: finish closes the driver before beginFinalization; until then the action ends quarantined' }, async t => {
    const o = await observed(t, world('ios', screens, tapLeadsDone));
    process.env.TYPESAFE_API_KEY = 'synthetic-key-not-for-children';
    t.after(() => { delete process.env.TYPESAFE_API_KEY; });
    const { result: first, attempts } = await networkDuring(async () => { await o.service.start(request(o.allocationId)); return o.service.inspect('allocated', { waitMs: 10_000 }); });
    assert.deepEqual(outcome(first), { state: 'terminal', outcome: 'outcome_observed', reason: null, authority: 'committed', actionAttempted: true, actionAcknowledged: true, admission: 'available' });
    assert.deepEqual(attempts, [], 'no Jev request and no other network use');
    const [executor] = o.executors;
    assert.equal(executor!.environment().includes('TYPESAFE_API_KEY'), false, 'the private child never sees the key');
    assert.equal(executor!.tools().filter(name => name === 'appium_perform_actions').length, 1);
    assert.equal(executor!.tools().includes('jev_terminate_app'), false);
    assert.equal(o.f.native.calls.length, 3, 'the executor starts no native helper: no launch, console or log stream');
    const again = await o.service.start(request(o.allocationId));
    assert.deepEqual({ ...again, disposition: 'started' }, { ...first, disposition: 'started' });
    assert.equal(again.disposition, 'retrieved');
    await assert.rejects(o.service.start(request(o.allocationId, { timeoutMs: 5001 })), { code: 'ACTION_ID_CONFLICT' });
    assert.equal(o.executors.length, 1, 'retrieval and conflict open no executor');
  });

test('an observed action whose after-guard already holds is already_satisfied with no input',
  { todo: '#78 fix round 1 item 1: finish closes the driver before beginFinalization; until then the action ends quarantined' }, async t => {
    const o = await observed(t, world('ios', screens, [], 'both'));
    await o.service.start(request(o.allocationId));
    const result = await o.service.inspect('allocated', { waitMs: 10_000 });
    assert.deepEqual(outcome(result), { state: 'terminal', outcome: 'already_satisfied', reason: null, authority: 'committed', actionAttempted: false, actionAcknowledged: false, admission: 'available' });
    assert.equal(o.executors[0]!.tools().includes('appium_perform_actions'), false);
  });

test('cancelling an observed action before its input: CANCELLED, inconclusive and quarantined, no input sent, and retrieval repeats it', async t => {
  const o = await observed(t, world('ios', screens, [{ tool: 'appium_get_page_source', nth: 1, fault: { kind: 'held' } }, ...tapLeadsDone]));
  await o.service.start(request(o.allocationId));
  for (let waited = 0; !(o.executors[0]?.tools().includes('appium_get_page_source')) && waited < 10_000; waited += 20) await delay(20);
  await o.service.cancel('allocated');
  o.executors[0]!.release();
  const cancelled = await o.service.inspect('allocated', { waitMs: 10_000 });
  assert.deepEqual(outcome(cancelled), { state: 'terminal', outcome: 'inconclusive', reason: 'CANCELLED', authority: 'committed', actionAttempted: false, actionAcknowledged: false, admission: 'quarantined' });
  assert.equal(o.executors[0]!.tools().includes('appium_perform_actions'), false);
  const retrieved = await o.service.start(request(o.allocationId));
  assert.deepEqual([retrieved.disposition, outcome(retrieved)], ['retrieved', outcome(cancelled)]);
});

test.todo('P3.10: ObservedAllocator on the Appium preparation driver (createPreparationDriver) prepares a fresh allocation once (create, boot, install, launch, readiness, park) and an identical prepare returns the same ready snapshot with no device call');
test.todo('P3.10: a changed preparation request (timeoutMs) is ACTION_ID_CONFLICT with the store bytes unchanged, on the Appium preparation driver');
test.todo('P3.10: cancel during each preparation phase, ready cancel and retire give retired_unused, and a later action is ALLOCATION_NOT_READY, on the Appium preparation driver');
test.todo('P3.10: unknown fresh creation stays quarantined with CREATE_UNCONFIRMED, capacity held and HOST_CREATION_UNRESOLVED for the next prepare, with the Appium composition');
test.todo('P3.10: cross-process races (H01, H03.01, H05.05) and export loss (H07.02) through tests/fixtures/observed-host owners on the Appium composition give the same publicPolicy and publicAuthority results');
test.todo('P3.10: the seven observed public operations and their CLI and MCP envelopes stay key and network free (H02.01) on the Appium composition, with tests/golden/observed-replies-v1.json');
