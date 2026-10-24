import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { AppiumObservation, ObservationReferences } from '../src/appium/observe/index.js';
import { sessionIdSchema } from '../src/appium/wire-schemas.js';
import { AppiumCommandSession } from '../src/appium/session.js';
import { clientFixture } from './fixtures/appium-wire/client-fixture.js';
import { imageStack } from './fixtures/appium-wire/image-stack.js';
import type { Clock } from '../src/device/settle.js';
const live = () => new AbortController().signal;
function manualClock() {
  let time = 0;
  const deadlines: { at: number; controller: AbortController }[] = [];
  const advance = (ms: number) => {
    time += ms;
    for (const deadline of deadlines) if (deadline.at <= time) deadline.controller.abort();
  };
  const clock: Clock = { now: () => time, sleep: async ms => advance(ms), timeout: ms => {
    const controller = new AbortController(); deadlines.push({ at: time + ms, controller }); return controller.signal;
  } };
  return { clock, expire: () => advance(3000) };
}
async function waitForCall(f: ReturnType<typeof clientFixture>, tool: string, count: number): Promise<void> {
  const end = Date.now() + 10_000;
  while (f.calls().filter(c => c.params?.name === tool).length < count) {
    if (Date.now() >= end) throw new Error('The fake never received its expected observation call.');
    await delay(5);
  }
}
for (const platform of ['ios', 'android'] as const) test(`${platform} fake provider yields a fresh snapshot paired with its actual JPEG and frame`, async t => {
  const f = clientFixture(t, platform); const { stack } = imageStack(t);
  const client = await f.open('none', resolve(`tests/fixtures/appium-wire/${platform}/observe-2.jsonl`));
  const session = await AppiumCommandSession.start({ client, profile: f.profile });
  const observation = new AppiumObservation(session, stack);
  const result = await observation.observe(live());
  assert.equal(result.snapshot.sequence, 1);
  assert.equal(result.snapshot.truncated, false);
  assert.deepEqual(result.screenshot.size, { width: 1, height: 1 });
  assert.deepEqual(result.screenshot.frame, { x: 0, y: 0, width: 1, height: 1 });
  assert.equal(result.snapshot.elements.find(e => e.identifier === 'choose.apple')?.label, 'Add Apple ($2)');
  assert.equal(observation.resolve({ sessionId: session.sessionId, snapshot: result.snapshot, ref: result.snapshot.elements[0]!.ref }).ref, result.snapshot.elements[0]!.ref);
  assert.equal((await client.callExtension({ name: 'jev_terminate_app', arguments: { appId: 'example.app' } })).acknowledged, true);
  await session.finish();
});
test('a late second pair returns the completed first pair at the cap and drains before the next command', async t => {
  const f = clientFixture(t); const { stack } = imageStack(t);
  const client = await f.open('source-late-second-held', resolve('tests/fixtures/appium-wire/ios/observe-2.jsonl'));
  const session = await AppiumCommandSession.start({ client, profile: f.profile });
  const manual = manualClock();
  const observation = new AppiumObservation(session, stack, { clock: manual.clock });
  const pending = observation.observe(live());
  await waitForCall(f, 'appium_get_page_source', 2);
  manual.expire();
  const result = await pending;
  assert.equal(result.snapshot.settled, false);
  assert.deepEqual(result.screenshot.size, { width: 1, height: 1 });
  assert.equal(client.observationPending, true);
  writeFileSync(f.trace + '.release', 'release');
  const input = client.callExtension({ name: 'jev_terminate_app', arguments: { appId: 'example.app' } });
  assert.equal((await input).acknowledged, true);
  assert.equal(result.snapshot.sequence, 1);
  await session.finish();
});
test('no completed pair refuses as incomplete, while the late first pair drains before later input', async t => {
  const f = clientFixture(t); const { stack } = imageStack(t);
  const client = await f.open('source-late-first-held', resolve('tests/fixtures/appium-wire/ios/observe-1.jsonl'));
  const session = await AppiumCommandSession.start({ client, profile: f.profile });
  const manual = manualClock();
  const observation = new AppiumObservation(session, stack, { clock: manual.clock });
  const pending = observation.observe(live());
  await waitForCall(f, 'appium_get_page_source', 1);
  manual.expire();
  await assert.rejects(pending, { code: 'TRUNCATED', truncated: true, reason: 'timeout' });
  assert.equal(client.observationPending, true);
  writeFileSync(f.trace + '.release', 'release');
  assert.equal((await client.callExtension({ name: 'jev_terminate_app', arguments: { appId: 'example.app' } })).acknowledged, true);
  await session.finish();
});
test('a pending source that reaches its own timeout retires the session and its late reply cannot enable input', async t => {
  const f = clientFixture(t); const { stack } = imageStack(t);
  const client = await f.open('source-late-first-held', resolve('tests/fixtures/appium-wire/ios/observe-1.jsonl'));
  const session = await AppiumCommandSession.start({ client, profile: f.profile });
  const manual = manualClock();
  const observation = new AppiumObservation(session, stack, { clock: manual.clock, sourceTimeoutMs: 1000 });
  const pending = observation.observe(live());
  await waitForCall(f, 'appium_get_page_source', 1);
  manual.expire();
  await assert.rejects(pending, { code: 'TRUNCATED', truncated: true });
  await assert.rejects(client.callExtension({ name: 'jev_terminate_app', arguments: { appId: 'example.app' } }), { code: 'TIMEOUT' });
  assert.equal(client.dispatchOpen, false);
  await client.manageSession({ action: 'delete', sessionId: session.sessionId }, f.profile);
  writeFileSync(f.trace + '.release', 'release');
  await delay(20);
  assert.deepEqual(f.calls().filter(c => c.method === 'tools/call').map(c => c.params.name),
    ['appium_session_management', 'jev_settings', 'appium_get_page_source', 'appium_session_management']);
});

test('a pair with a late screenshot is discarded as a whole and drains before input', async t => {
  const f = clientFixture(t); const { stack } = imageStack(t);
  const client = await f.open('screen-late-second-held', resolve('tests/fixtures/appium-wire/ios/observe-2.jsonl'));
  const session = await AppiumCommandSession.start({ client, profile: f.profile });
  const manual = manualClock();
  const observation = new AppiumObservation(session, stack, { clock: manual.clock });
  const pending = observation.observe(live());
  await waitForCall(f, 'jev_screen', 2);
  manual.expire();
  const result = await pending;
  assert.equal(result.snapshot.settled, false);
  assert.deepEqual(result.screenshot.size, { width: 1, height: 1 });
  assert.equal(client.observationPending, true);
  writeFileSync(f.trace + '.release', 'release');
  assert.equal((await client.callExtension({ name: 'jev_terminate_app', arguments: { appId: 'example.app' } })).acknowledged, true);
  assert.deepEqual(f.calls().filter(c => c.method === 'tools/call').map(c => c.params.name),
    ['appium_session_management', 'jev_settings', 'appium_get_page_source', 'jev_screen', 'appium_get_page_source', 'jev_screen', 'jev_terminate_app']);
  await session.finish();
});
test('after the cap, a cancel and stopDispatch, finishing waits for the pending pair and deletes the session', async t => {
  const f = clientFixture(t); const { stack } = imageStack(t);
  const client = await f.open('source-late-second-held', resolve('tests/fixtures/appium-wire/ios/observe-2.jsonl'));
  const session = await AppiumCommandSession.start({ client, profile: f.profile });
  const manual = manualClock(); const command = new AbortController();
  const observation = new AppiumObservation(session, stack, { clock: manual.clock });
  const pending = observation.observe(command.signal);
  await waitForCall(f, 'appium_get_page_source', 2);
  manual.expire();
  assert.equal((await pending).snapshot.settled, false);
  command.abort(new Error('cancelled'));
  client.stopDispatch();
  const finishing = session.finish();
  await delay(50);
  writeFileSync(f.trace + '.release', 'release');
  await finishing;
  assert.deepEqual(f.calls().filter(c => c.method === 'tools/call').map(c => c.params.name),
    ['appium_session_management', 'jev_settings', 'appium_get_page_source', 'jev_screen', 'appium_get_page_source', 'appium_session_management']);
});
for (const [fault, reason] of [['source-invalid', 'invalid-source'], ['screen-invalid', 'driver-error']] as const) {
  test(`${fault} refuses that observation as incomplete and keeps the session for later input`, async t => {
    const f = clientFixture(t); const { stack } = imageStack(t);
    const client = await f.open(fault, resolve('tests/fixtures/appium-wire/ios/observe-1.jsonl'));
    const session = await AppiumCommandSession.start({ client, profile: f.profile });
    await assert.rejects(new AppiumObservation(session, stack).observe(live()), { code: 'TRUNCATED', truncated: true, reason });
    assert.equal(client.dispatchOpen, true);
    assert.equal((await client.callExtension({ name: 'jev_terminate_app', arguments: { appId: 'example.app' } })).acknowledged, true);
    await session.finish();
    assert.deepEqual(f.calls().filter(c => c.method === 'tools/call').map(c => c.params.name),
      ['appium_session_management', 'jev_settings', 'appium_get_page_source', 'jev_screen', 'jev_terminate_app', 'appium_session_management']);
  });
}
test('isCurrent holds only for the latest snapshot while the session stays open', async t => {
  const f = clientFixture(t); const { stack } = imageStack(t);
  const client = await f.open('none', resolve('tests/fixtures/appium-wire/ios/observe-2.jsonl'));
  const session = await AppiumCommandSession.start({ client, profile: f.profile });
  const observation = new AppiumObservation(session, stack);
  const { snapshot } = await observation.observe(live());
  assert.equal(observation.isCurrent(snapshot), true);
  assert.equal(observation.isCurrent({ ...snapshot }), false);
  client.stopDispatch();
  assert.equal(observation.isCurrent(snapshot), false);
});
test('an empty snapshot is current until the next one is issued, so back and scroll can act on it', () => {
  const references = new ObservationReferences(sessionIdSchema.parse('ios-session'), 'ios-test');
  const empty = references.issue({ elements: [], truncated: false, screenHash: 'empty' }, 0, true);
  assert.deepEqual(empty.elements, []);
  assert.equal(references.isCurrent(empty), true);
  const next = references.issue({ elements: [], truncated: false, screenHash: 'empty' }, 1, true);
  assert.deepEqual([references.isCurrent(empty), references.isCurrent(next)], [false, true]);
  references.invalidate();
  assert.equal(references.isCurrent(next), false);
});
