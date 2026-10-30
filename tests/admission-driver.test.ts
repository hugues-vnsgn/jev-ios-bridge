import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { AllocationReservationInput } from '../src/device/admission-allocation.js';
import { Admission } from '../src/device/admission.js';
import { DeviceReasonError } from '../src/device/index.js';
import { UDID } from './fixtures/appium-wire/driver-fixture.js';
import { IOS_DEVICE, iosTarget } from './fixtures/appium-wire/matrix.js';
import { iosScreen, world, worldFixture } from './fixtures/appium-wire/world.js';

const live = () => AbortSignal.timeout(20_000);
const home = world('ios', { home: iosScreen([{ type: 'Button', name: 'one', label: 'One', frame: [16, 100, 200, 40] }], 'dev.fixture') });
const context = { app: { bundleId: 'dev.fixture' }, device: { udid: UDID }, values: {} };
const busy = (error: unknown): error is DeviceReasonError => error instanceof DeviceReasonError && error.code === 'DEVICE_BUSY';

const digest = 'a'.repeat(64);
function reservationInput(): AllocationReservationInput {
  return { actionId: 'allocated', preparationDigest: digest, preparation: {}, appBundleId: 'dev.fixture',
    source: { kind: 'create', deviceTypeId: 'device-type', runtimeId: 'runtime' }, inspectedContentDigest: digest,
    artifactBytes: 100, configVersion: 1, configDigest: digest, evidenceDirectory: '/isolated/evidence',
    budgets: { maxRetainedAllocations: 8, maxConcurrentPreparations: 1, reservationBytesPerAllocation: 800,
      maxReservedBytes: 6400, minFreeBytes: 2000, maxArtifactBytes: 200, createTimeoutMs: 60000, bootTimeoutMs: 120000,
      installTimeoutMs: 120000, launchTimeoutMs: 30000, readinessTimeoutMs: 30000, readyTtlMs: 300000, timeoutMs: 360000 },
    storage: { simulatorFreeBytes: 10000, stagingFreeBytes: 10000 } };
}
function reserve(admission: Admission) {
  const result = admission.reserveAllocation(reservationInput());
  if (result.kind !== 'reserved') throw new Error('reserve');
  result.reservation.stage({ stagedPath: '/isolated/Fixture.app', contentDigest: digest, bytes: 100, maxBytes: 200,
    metadata: { bundleId: 'dev.fixture', executable: 'Fixture', architecture: 'arm64', minimumOSVersion: '27.0', build: { id: 'fixture', origin: 'host' } } });
  return result.reservation;
}
async function consumed(admission: Admission) {
  const reservation = reserve(admission);
  await reservation.create(async () => ({ status: 'created', udid: UDID, provenance: { kind: 'simctl-create',
    allocationId: reservation.identity.allocationId, name: `jev-observed-${reservation.identity.allocationId}`, deviceTypeId: 'device-type', runtimeId: 'runtime' } }));
  const admitted = reservation.admit();
  if (admitted.kind !== 'admitted') throw new Error('admit');
  const session = admitted.claim.bindDriver('fake');
  for (const kind of ['boot', 'install', 'launch', 'readiness']) await session.dispatch(kind, async () => true);
  assert.equal(admitted.claim.park(['/isolated/readiness.json']).authority, 'committed');
  const result = admission.consumeAllocation({ allocationId: reservation.identity.allocationId, actionId: 'allocated', actionDigest: digest,
    request: {}, appBundleId: 'dev.fixture', evidence: { bridgeVersion: 'fixture', directory: '/isolated/action', request: '/isolated/action/request.json' } });
  if (result.kind !== 'consumed') throw new Error('consume');
  return result.claim;
}

test('a durable observed owner refuses a scripted prepare with DEVICE_BUSY before any session or launch', async t => {
  const f = worldFixture(t, home, iosTarget);
  assert.equal(f.admission.acquire({ category: 'ios-simulator', device: UDID, attempt: { kind: 'observed', id: 'one' }, digest: 'one', intent: {} }).kind, 'acquired');
  await assert.rejects(f.driver.prepare(context, live()), busy);
  assert.deepEqual([f.tools(), f.native.calls.length, f.admission.inspect(IOS_DEVICE)?.state], [[], 0, 'active']);
});

test('a scripted run holds the simulator against observed and preparation owners until its close releases it', async t => {
  const f = worldFixture(t, home, iosTarget);
  await f.driver.prepare(context, live());
  for (const kind of ['observed', 'preparation'] as const) {
    assert.deepEqual(f.admission.acquire({ category: 'ios-simulator', device: UDID.toLowerCase(), attempt: { kind, id: kind }, digest: kind, intent: {} }),
      { kind: 'refused', reason: 'DEVICE_BUSY' });
  }
  await f.driver.close(live());
  assert.equal(f.admission.inspect(IOS_DEVICE)?.state, 'available');
});

test('an unresolved host creation refuses a scripted prepare before the window, launch or any session', async t => {
  const f = worldFixture(t, home, { ...iosTarget, deviceWindow: async () => assert.fail('No window while a creation is unresolved') });
  await reserve(f.admission).create(async () => ({ status: 'unknown', reason: 'CREATE_UNCONFIRMED' }));
  await assert.rejects(f.driver.prepare(context, live()), (error: unknown) => busy(error) && /HOST_CREATION_UNRESOLVED/.test(error.message));
  assert.deepEqual([f.tools(), f.native.calls.length], [[], 0]);
});

test('a consumed observed action authorizes one touch even when the caller submits twice, and leaves the terminal to the runtime', async t => {
  const f = worldFixture(t, home, iosTarget);
  const claim = await consumed(f.admission);
  await f.driver.attachObserved(claim, context, live());
  const button = async () => { const screen = await f.driver.observe(live()); return { screen, ref: screen.elements.find(element => element.identifier === 'one')!.ref }; };
  const first = await button();
  await f.driver.tapOnce(first.ref, first.screen, context, live());
  const again = await button();
  await assert.rejects(f.driver.tapOnce(again.ref, again.screen, context, live()), /Tap already authorized/);
  assert.equal(f.tools().filter(tool => tool === 'appium_perform_actions').length, 1);
  await f.driver.close(live());
  assert.equal(f.admission.inspect(IOS_DEVICE)?.state, 'active', 'the runtime still owns terminal publication');
});

test('a store whose authority file is gone refuses the prepare without falling back to another root', async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'admission-driver-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'store'), { mode: 0o700 });
  const admission = Admission.forTesting({ root: join(root, 'store'), backend: 'fake' });
  rmSync(join(root, 'store', 'admission.sqlite'));
  const f = worldFixture(t, home, { ...iosTarget, admission });
  await assert.rejects(f.driver.prepare(context, live()), /unavailable|missing/i);
  assert.deepEqual([f.tools(), f.native.calls.length], [[], 0]);
});
