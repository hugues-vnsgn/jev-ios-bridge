import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { Admission, AdmissionError } from '../src/device/admission.js';
import { fenceAppium, type FenceClaim, type FenceRunner } from '../src/appium/fence/index.js';

const UDID = 'ABCDEF00-0000-4000-8000-000000000001';
const WDA = 'com.facebook.WebDriverAgentRunner.xctrunner';
const live = () => new AbortController().signal;

function owner(t: TestContext) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'appium-owner-fence-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const admission = Admission.forTesting({ root, backend: 'fake', durability: 'fast' });
  const acquired = admission.acquire({ device: UDID, attempt: { kind: 'legacy', id: 'run' }, digest: 'run', intent: {} });
  if (acquired.kind !== 'acquired') assert.fail('acquire');
  const claim = acquired.claim;
  const session = claim.bindDriver('fake');
  claim.registerComponent(JSON.parse(JSON.stringify({ id: 'wda', kind: 'appium-wda', udid: UDID, bundleId: WDA, pid: 777 })));
  const fenceClaim: FenceClaim = { owner: claim.identity, dispatch: session.dispatch.bind(session), observeComponent: claim.observeComponent.bind(claim) };
  const runner: FenceRunner = async effect => {
    if (effect.kind === 'wda-inventory') return [];
    throw new Error(`Unexpected ${effect.kind}`);
  };
  const fence = () => fenceAppium({ admission, claim: fenceClaim, runner, revalidate: async () => {}, signal: live() });
  return { admission, claim, session, fence };
}

test('an owner fence read issued after its last effect releases the device with no quarantine', async t => {
  const f = owner(t);
  await f.session.dispatch('tap', async () => undefined);
  f.claim.stageFence(await f.fence());
  assert.equal(f.claim.finalize({ outcome: 'completed', disposition: 'available', payload: {}, evidenceRefs: [] }).authority, 'committed');
  assert.equal(f.admission.inspect(UDID)?.state, 'available');
});

test('an owner fence read issued before a later effect is refused: the device is not released', async t => {
  const f = owner(t);
  const early = await f.fence();
  await f.session.dispatch('tap', async () => undefined);
  f.claim.stageFence(early);
  assert.throws(() => f.claim.finalize({ outcome: 'completed', disposition: 'available', payload: {}, evidenceRefs: [] }),
    (error: unknown) => error instanceof AdmissionError && error.code === 'COVERAGE_INCOMPLETE');
  assert.notEqual(f.admission.inspect(UDID)?.state, 'available');
});

test('a later effect filed under an existing fence component is refused, and the early fence never releases the device', async t => {
  const f = owner(t);
  const early = await f.fence();
  const fenceComponent = f.admission.readGeneration(f.claim.identity).components.find(component => component.kind === 'appium-fence-command')!.id;
  await assert.rejects(async () => f.session.dispatch({ requestId: 'late-tap', componentId: fenceComponent, operation: 'tap', payload: {} }, async () => undefined),
    (error: unknown) => error instanceof AdmissionError && error.code === 'INVALID_REQUEST');
  const reused = f.admission.readGeneration(f.claim.identity).commands.filter(command => command.componentId === fenceComponent);
  assert.equal(reused.length, 1, 'a fence component carries exactly one command');
  assert.equal(f.admission.inspect(UDID)?.state, 'active');
  void early;
});
