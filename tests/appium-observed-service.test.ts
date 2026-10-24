import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { AppiumDriver } from '../src/appium/driver.js';
import type { Admission } from '../src/device/admission.js';
import type { AllocationReservationInput } from '../src/device/admission-allocation.js';
import { ObservedActionService } from '../src/observed/service.js';
import { fakeSimulatorProbe } from './fixtures/android-device.js';
import { UDID, WDA_BUNDLE, driverFixture } from './fixtures/appium-wire/driver-fixture.js';

const digest = 'a'.repeat(64);
const lines = (path: string) => readFileSync(resolve(path), 'utf8').trim().split('\n');
const APPLE = 'name="choose.apple" label="Add Apple ($2)" enabled="true" visible="true" accessible="true" x="16" y="284" width="370" height="37"';

/** One settled pair showing the given control at (0, 0, 20, 40), so a tap lands at (10, 20) as recorded. */
function screens(observe: string[], identifier: string): string[] {
  return observe.slice(7, 15).map(line => {
    const entry = JSON.parse(line) as { message: { result?: { structuredContent?: { xml?: string } } } };
    const content = entry.message.result?.structuredContent;
    if (content && typeof content.xml === 'string') content.xml = content.xml.replace(APPLE,
      `name="${identifier}" label="Control ${identifier}" enabled="true" visible="true" accessible="true" x="0" y="0" width="20" height="40"`);
    return JSON.stringify(entry);
  });
}
function tapRecording(root: string): string {
  const [header, ...observe] = lines('tests/fixtures/appium-wire/ios/observe-2.jsonl');
  const tap = lines('tests/fixtures/appium-wire/ios/operations-tap.jsonl').slice(1);
  const perform = tap.findIndex(line => (JSON.parse(line) as { message: { params?: { name?: string } } }).message.params?.name === 'appium_perform_actions');
  const body = [...observe.slice(0, 7), ...screens(observe, 'go'), ...tap.slice(perform, perform + 2), ...screens(observe, 'done'), ...screens(observe, 'done'), ...observe.slice(17)];
  const path = join(root, 'tap.jsonl');
  writeFileSync(path, [header, ...body.map(line => line.replaceAll('ios-test', UDID))].join('\n') + '\n');
  return path;
}
async function ready(admission: Admission): Promise<string> {
  const input: AllocationReservationInput = { actionId: 'one', preparationDigest: digest, preparation: {}, appBundleId: 'dev.fixture',
    source: { kind: 'supplied', inventoryId: 'one', udid: UDID, deviceTypeId: 'device', runtimeId: 'runtime',
      creation: { createdAt: 'fixture', origin: 'fixture', evidenceRef: '/isolated/creation' }, attestation: { freshUnused: true, exclusive: true } },
    inspectedContentDigest: digest, artifactBytes: 100, configVersion: 1, configDigest: digest, evidenceDirectory: '/isolated/preparation',
    budgets: { maxRetainedAllocations: 8, maxConcurrentPreparations: 1, reservationBytesPerAllocation: 800, maxReservedBytes: 6400,
      minFreeBytes: 2000, maxArtifactBytes: 200, createTimeoutMs: 60000, bootTimeoutMs: 120000, installTimeoutMs: 120000,
      launchTimeoutMs: 30000, readinessTimeoutMs: 30000, readyTtlMs: 300000, timeoutMs: 360000 },
    storage: { simulatorFreeBytes: 10000, stagingFreeBytes: 10000 } };
  const reserved = admission.reserveAllocation(input);
  if (reserved.kind !== 'reserved') throw new Error('reserve');
  reserved.reservation.stage({ stagedPath: '/isolated/Fixture.app', contentDigest: digest, bytes: 100, maxBytes: 200,
    metadata: { bundleId: 'dev.fixture', executable: 'Fixture', architecture: 'arm64', minimumOSVersion: '27.0', build: { id: 'fixture', origin: 'fixture' } } });
  const admitted = reserved.reservation.admit();
  if (admitted.kind !== 'admitted') throw new Error('admit');
  const session = admitted.claim.bindDriver('fake');
  for (const operation of ['boot', 'install', 'launch', 'readiness']) await session.dispatch(operation, async () => true);
  assert.equal(admitted.claim.park(['/isolated/readiness']).authority, 'committed');
  return reserved.reservation.identity.allocationId;
}

test('through the real observed service, the Appium executor taps once, ends observed and available, and fences every component', async t => {
  const f = driverFixture(t, tapRecording, { target: { platform: 'ios', device: UDID, presentation: 'visible' }, identityProbe: fakeSimulatorProbe(UDID) });
  f.fence.wda = [{ udid: UDID, bundleId: WDA_BUNDLE, pid: 778 }];
  const allocationId = await ready(f.admission);
  const service = new ObservedActionService({ admission: f.admission, runsDir: join(f.root, 'evidence'), bridgeVersion: 'fixture', backend: 'fake', enabled: true,
    createDriver: () => { const driver = new AppiumDriver({ ...f.driver['options'] }); f.drivers.push(driver); return driver; } });
  t.after(() => service.close());
  const started = await service.start({ version: 1, actionId: 'one', allocationId, app: { bundleId: 'dev.fixture' }, action: { kind: 'tap', selector: { identifier: 'go' } },
    before: { present: [{ identifier: 'go' }] }, after: { present: [{ identifier: 'done' }] }, timeoutMs: 20_000 });
  let reply = started;
  for (let waited = 0; reply.state !== 'terminal' && waited < 30_000; waited += 1000) reply = await service.inspect('one', { waitMs: 1000 });
  const terminal = reply as unknown as Record<string, unknown>;
  assert.deepEqual([terminal.state, terminal.outcome, terminal.reason, terminal.actionAttempted, terminal.actionAcknowledged, terminal.admission, terminal.allocationState],
    ['terminal', 'outcome_observed', null, true, true, 'available', 'retained']);
  assert.equal(f.tools().filter(name => name === 'appium_perform_actions').length, 1, 'one tap');
  assert.deepEqual(f.fence.effects.filter(effect => effect.kind === 'wda-stop'), [{ kind: 'wda-stop', udid: UDID, bundleId: WDA_BUNDLE, pid: 778 }]);
  assert.equal(f.admission.inspect(UDID)?.state, 'available');
  const view = f.admission.readAction('one');
  assert.equal(view?.kind === 'allocation' ? view.attempt?.terminal?.disposition : undefined, 'available');
});
