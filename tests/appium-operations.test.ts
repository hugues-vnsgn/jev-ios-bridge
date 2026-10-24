import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import type { Element, Snapshot } from '../src/contracts/index.js';
import { DeviceReasonError, StaleSnapshotError } from '../src/device/index.js';
import type { ScreenshotImage } from '../src/device/image.js';
import { AppiumOperations, UnconfirmedOperationError, type OperationName, type OperationsClient, type OperationSession } from '../src/appium/operations/index.js';
import type { PointerActions } from '../src/appium/operations/geometry.js';
import { ObservationReferences } from '../src/appium/observe/references.js';
import { AppiumCommandSession, createSessionProfile } from '../src/appium/session.js';
import { clientFixture } from './fixtures/appium-wire/client-fixture.js';
import { AppiumError, sessionIdSchema, type AppiumPlatform, type ExtensionCall } from '../src/appium/wire-schemas.js';

const sessionId = sessionIdSchema.parse('session-1');
const live = () => new AbortController().signal;
type Frame = { x: number; y: number; width: number; height: number };
type Call = { tool: 'appium_perform_actions'; actions: PointerActions } | { tool: ExtensionCall['name']; arguments: unknown };

const tappable = ['tap', 'longPress', 'touch'];
function element(ref: string, role: string, frame: Frame, extra: Partial<Element> = {}): Element {
  return { ref, role, frame, actions: tappable, state: { enabled: true, visible: true }, ...extra };
}
const iosScreen: Frame = { x: 0, y: 0, width: 400, height: 800 };
const androidScreen: Frame = { x: 0, y: 0, width: 1080, height: 2400 };
const iosElements = (): Element[] => [
  element('e1', 'application', iosScreen, { actions: [] }),
  element('e2', 'button', { x: 100, y: 300, width: 200, height: 50 }, { identifier: 'save', label: 'Save' }),
  element('e3', 'text-field', { x: 20, y: 100, width: 360, height: 40 }, { identifier: 'email', label: 'Email', actions: ['tap', 'typeText'] }),
  element('e4', 'scroll-view', { x: 0, y: 150, width: 400, height: 500 }, { actions: ['swipeWithin'] }),
];
const androidElements = (): Element[] => [
  element('e1', 'button', { x: 100, y: 300, width: 200, height: 100 }, { identifier: 'com.app:id/save' }),
  element('e2', 'text-field', { x: 50, y: 500, width: 980, height: 120 }, { identifier: 'com.app:id/email', actions: ['tap', 'typeText'] }),
  element('e3', 'scroll-view', { x: 0, y: 200, width: 1080, height: 1800 }, { actions: ['swipeWithin'] }),
];

function rig(platform: AppiumPlatform, first: Element[] = platform === 'ios' ? iosElements() : androidElements(), options: {
  screen?: Frame; shot?: { width: number; height: number }; now?: () => number; dispatch?: (operation: OperationName, send: () => Promise<void>) => Promise<void> } = {}) {
  const screen = options.screen ?? (platform === 'ios' ? iosScreen : androidScreen);
  const shot = options.shot ?? { width: screen.width, height: screen.height };
  const references = new ObservationReferences(sessionId, 'device-1');
  const calls: Call[] = [];
  const queue: Element[][] = [];
  let observations = 0;
  let screenRead = { rect: { ...screen }, orientation: 'PORTRAIT' as 'PORTRAIT' | 'LANDSCAPE' };
  const behaviour: { failure?: unknown; failTool?: string; gate?: Promise<void> | undefined; open: boolean; observeFails: boolean } = { open: true, observeFails: false };
  const screenshot = (): ScreenshotImage => ({ jpeg: Buffer.alloc(0), size: shot, frame: { ...screen }, orientation: 'PORTRAIT' });
  const observe = async () => {
    if (behaviour.observeFails) throw new Error('observation failed');
    const elements = queue.shift() ?? first;
    const snapshot = references.issue({ elements: structuredClone(elements), truncated: false, screenHash: `hash-${String(++observations)}` }, 1_000, true);
    return { snapshot, screenshot: screenshot() };
  };
  const mutation = async (tool: string) => {
    if (behaviour.gate) await behaviour.gate;
    if (behaviour.failure !== undefined && (behaviour.failTool === undefined || behaviour.failTool === tool)) throw behaviour.failure;
  };
  const callExtension = async (request: ExtensionCall) => {
    calls.push({ tool: request.name, arguments: request.arguments });
    if (request.name === 'jev_screen') return { extensionVersion: 1, sessionId, pngBase64: '', ...screenRead };
    await mutation(request.name);
    return { extensionVersion: 1, sessionId, acknowledged: true as const };
  };
  const client: OperationsClient = {
    get dispatchOpen() { return behaviour.open; },
    async performActions(actions) { calls.push({ tool: 'appium_perform_actions', actions }); await mutation('appium_perform_actions'); },
    callExtension: callExtension as unknown as OperationsClient['callExtension'],
  };
  let finished = 0;
  const session: OperationSession = { sessionId, profile: { platform }, client, async finish() { finished++; } };
  const observation = { resolve: references.resolve.bind(references), invalidate: references.invalidate.bind(references), observe };
  const operations = new AppiumOperations(session, observation, {
    now: options.now ?? (() => 2_000), ...(options.dispatch ? { dispatch: options.dispatch } : {}) });
  return { operations, calls, queue, behaviour, observe, get finished() { return finished; },
    setScreen: (next: typeof screenRead) => { screenRead = next; } };
}
const pointer = (...actions: PointerActions[number]['actions']): PointerActions =>
  [{ type: 'pointer', id: 'finger1', parameters: { pointerType: 'touch' }, actions }];
const move = (x: number, y: number, duration = 0) => ({ type: 'pointerMove' as const, duration, origin: 'viewport', x, y });
const down = { type: 'pointerDown' as const, button: 0 };
const up = { type: 'pointerUp' as const, button: 0 };
const pause = (duration: number) => ({ type: 'pause' as const, duration });
const performed = (calls: Call[]) => calls.filter(call => call.tool === 'appium_perform_actions');

for (const platform of ['ios', 'android'] as const) {
  test(`${platform} tap is one perform-actions call: centre, press, 50 ms pause, release`, async () => {
    const r = rig(platform); const evidence = await r.observe();
    const target = platform === 'ios' ? { ref: 'e2', x: 200, y: 325 } : { ref: 'e1', x: 200, y: 350 };
    const done = await r.operations.tap(evidence, target.ref, live());
    assert.deepEqual(r.calls, [{ tool: 'appium_perform_actions', actions: pointer(move(target.x, target.y), down, pause(50), up) }]);
    assert.equal(done.holdMs, 50);
    assert.equal(done.actPath, undefined);
  });
}
test('an observed tap presses, pauses the authored hold and records it', async () => {
  const r = rig('ios'); const evidence = await r.observe();
  const done = await r.operations.tap(evidence, 'e2', live(), 250);
  assert.deepEqual(r.calls, [{ tool: 'appium_perform_actions', actions: pointer(move(200, 325), down, pause(250), up) }]);
  assert.equal(done.holdMs, 250);
  await assert.rejects(r.operations.tap(await r.observe(), 'e2', live(), 10_001), { code: 'UNSUPPORTED_ACTION' });
  assert.equal(r.calls.length, 1);
});

test('missing, stale, expired, ambiguous and ineligible targets dispatch nothing', async () => {
  const r = rig('ios', [...iosElements(),
    element('e5', 'text-field', { x: 20, y: 200, width: 360, height: 40 }, { label: 'Name', actions: ['tap', 'typeText'] }),
    element('e6', 'text-field', { x: 20, y: 250, width: 360, height: 40 }, { label: 'Name', actions: ['tap', 'typeText'] }),
    element('e7', 'button', { x: 0, y: 700, width: 100, height: 40 }, { state: { enabled: false, visible: true } }),
    element('e8', 'text-field', { x: 20, y: 300, width: 360, height: 40 }, { actions: ['tap', 'typeText'] }),
    element('e9', 'text', { x: 0, y: 740, width: 100, height: 40 }, { actions: [] })]);
  const old = await r.observe();
  const current = await r.observe();
  await assert.rejects(r.operations.tap(old, 'e2', live()), StaleSnapshotError);
  await assert.rejects(r.operations.tap(current, 'e404', live()), StaleSnapshotError);
  await assert.rejects(r.operations.replaceText(current, 'e5', 'x', live()), { code: 'TARGET_AMBIGUOUS' });
  await assert.rejects(r.operations.replaceText(current, 'e8', 'x', live()), { code: 'TARGET_AMBIGUOUS' });
  await assert.rejects(r.operations.tap(current, 'e7', live()), { code: 'TARGET_UNAVAILABLE' });
  await assert.rejects(r.operations.tap(current, 'e9', live()), { code: 'UNSUPPORTED_ACTION' });
  await assert.rejects(r.operations.swipe(current, 'e2', 'up', live()), { code: 'UNSUPPORTED_ACTION' });
  await assert.rejects(r.operations.scroll(old, 'down', live()), StaleSnapshotError);
  await assert.rejects(r.operations.back(old, live()), StaleSnapshotError);
  assert.deepEqual(r.calls, []);
  let time = 0;
  const expiring = rig('ios', undefined, { now: () => time });
  const fresh = await expiring.observe();
  time = fresh.snapshot.expiresAt;
  await assert.rejects(expiring.operations.tap(fresh, 'e2', live()), StaleSnapshotError);
  assert.deepEqual(expiring.calls, []);
});

test('a dispatched action makes its own snapshot stale', async () => {
  const r = rig('android'); const evidence = await r.observe();
  await r.operations.tap(evidence, 'e1', live());
  await assert.rejects(r.operations.tap(evidence, 'e1', live()), StaleSnapshotError);
  assert.equal(performed(r.calls).length, 1);
});

test('a dispatched action invalidates its snapshot even when the following observation fails', async () => {
  const r = rig('ios'); const evidence = await r.observe();
  r.behaviour.observeFails = true;
  await assert.rejects(r.operations.tap(evidence, 'e2', live()), { message: 'observation failed' });
  r.behaviour.observeFails = false;
  await assert.rejects(r.operations.tap(evidence, 'e2', live()), StaleSnapshotError);
  assert.equal(performed(r.calls).length, 1);
});

test('iOS swipe and scroll inside a scrollable use the MobileBuildMCP inset geometry; the 0.4 scroll is 28% of the frame', async () => {
  const r = rig('ios'); let evidence = await r.observe();
  await r.operations.swipe(evidence, 'e4', 'up', live());
  evidence = await r.observe();
  const scrolled = await r.operations.scroll(evidence, 'down', live());
  evidence = await r.observe();
  await r.operations.scroll(evidence, 'up', live());
  evidence = await r.observe();
  await r.operations.swipe(evidence, 'e4', 'left', live());
  assert.deepEqual(performed(r.calls).map(call => call.tool === 'appium_perform_actions' ? call.actions : undefined), [
    pointer(move(200, 575), down, move(200, 225, 1000), up),
    pointer(move(200, 470), down, move(200, 330, 1000), up),
    pointer(move(200, 330), down, move(200, 470, 1000), up),
    pointer(move(340, 400), down, move(60, 400, 1000), up),
  ]);
  assert.deepEqual(scrolled.actPath, { path: 'scroll-within', targetRef: 'e4' });
});
test('iOS scroll with no scrollable strokes 200 points down the screen middle in 0.5 s', async () => {
  const r = rig('ios', iosElements().filter(e => e.ref !== 'e4')); let evidence = await r.observe();
  const down1 = await r.operations.scroll(evidence, 'down', live());
  evidence = await r.observe();
  await r.operations.scroll(evidence, 'up', live());
  assert.deepEqual(performed(r.calls).map(call => call.tool === 'appium_perform_actions' ? call.actions : undefined), [
    pointer(move(200, 500), down, move(200, 300, 500), up),
    pointer(move(200, 300), down, move(200, 500, 500), up),
  ]);
  assert.deepEqual(down1.actPath, { path: 'screen-middle' });
});
test('Android swipe and scroll take 1000 ms, 90% to 10% inside the scrollable and 70% to 30% of the screen otherwise', async () => {
  const r = rig('android'); let evidence = await r.observe();
  const within = await r.operations.swipe(evidence, 'e3', 'up', live());
  evidence = await r.observe();
  await r.operations.swipe(evidence, 'e3', 'right', live());
  evidence = await r.observe();
  const scrolled = await r.operations.scroll(evidence, 'down', live());
  const bare = rig('android', androidElements().filter(e => e.ref !== 'e3'));
  const middle = await bare.operations.scroll(await bare.observe(), 'down', live());
  assert.deepEqual(performed(r.calls).map(call => call.tool === 'appium_perform_actions' ? call.actions : undefined), [
    pointer(move(540, 1820), down, move(540, 380, 1000), up),
    pointer(move(108, 1100), down, move(972, 1100, 1000), up),
    pointer(move(540, 1820), down, move(540, 380, 1000), up),
  ]);
  assert.deepEqual(performed(bare.calls).map(call => call.tool === 'appium_perform_actions' ? call.actions : undefined), [
    pointer(move(540, 1680), down, move(540, 720, 1000), up),
  ]);
  assert.equal(within.actPath, undefined);
  assert.deepEqual(scrolled.actPath, { path: 'scroll-within', targetRef: 'e3' });
  assert.deepEqual(middle.actPath, { path: 'screen-middle' });
});

test('Android back is the Back key through the extension and records back-key', async () => {
  const r = rig('android'); const done = await r.operations.back(await r.observe(), live());
  assert.deepEqual(r.calls, [{ tool: 'jev_android_back', arguments: {} }]);
  assert.deepEqual(done.actPath, { path: 'back-key' });
});
test('iOS back taps the navigation back button when the screen has one', async () => {
  const r = rig('ios', [...iosElements(), element('e5', 'button', { x: 10, y: 50, width: 60, height: 40 }, { identifier: 'BackButton', label: 'Home' })]);
  const done = await r.operations.back(await r.observe(), live());
  assert.deepEqual(r.calls, [{ tool: 'appium_perform_actions', actions: pointer(move(40, 70), down, pause(50), up) }]);
  assert.deepEqual(done.actPath, { path: 'back-button', targetRef: 'e5' });
});
test('iOS back without a back button strokes the left edge, x=20 to width-20, in 0.3 s', async () => {
  const r = rig('ios'); const done = await r.operations.back(await r.observe(), live());
  assert.deepEqual(r.calls, [{ tool: 'appium_perform_actions', actions: pointer(move(20, 400), down, move(380, 400, 300), up) }]);
  assert.deepEqual(done.actPath, { path: 'edge-swipe' });
});

test('Android tapAt scales screenshot pixels by the returned frame and rounds to whole device pixels', async () => {
  const rows: Array<{ screen: Frame; shot: { width: number; height: number }; at: [number, number]; device: [number, number] }> = [
    { screen: androidScreen, shot: { width: 800, height: 1778 }, at: [10, 10], device: [14, 13] },
    { screen: androidScreen, shot: { width: 800, height: 1778 }, at: [799.9, 1777.9], device: [1079, 2399] },
    { screen: androidScreen, shot: { width: 360, height: 800 }, at: [180, 400], device: [540, 1200] },
    { screen: { x: 0, y: 0, width: 720, height: 1280 }, shot: { width: 450, height: 800 }, at: [225, 400], device: [360, 640] },
    { screen: { x: 0, y: 0, width: 320, height: 640 }, shot: { width: 320, height: 640 }, at: [226, 152], device: [226, 152] },
  ];
  for (const row of rows) {
    const r = rig('android', undefined, { screen: row.screen, shot: row.shot });
    await r.operations.tapAt(await r.observe(), row.at[0], row.at[1], live());
    assert.deepEqual(r.calls.map(call => call.tool), ['jev_screen', 'appium_perform_actions']);
    assert.deepEqual(r.calls[1], { tool: 'appium_perform_actions', actions: pointer(move(row.device[0], row.device[1]), down, pause(50), up) });
  }
});
test('Android tapAt refuses out of bounds points, a changed orientation or size, and stale evidence before any input', async () => {
  const bounds = rig('android', undefined, { shot: { width: 360, height: 800 } });
  const evidence = await bounds.observe();
  for (const [x, y] of [[360, 10], [10, 800], [-1, 5], [Number.NaN, 5]] as const)
    await assert.rejects(bounds.operations.tapAt(evidence, x, y, live()), { code: 'UNSUPPORTED_ACTION' });
  const rotated = rig('android'); const shown = await rotated.observe();
  rotated.setScreen({ rect: { ...androidScreen }, orientation: 'LANDSCAPE' });
  await assert.rejects(rotated.operations.tapAt(shown, 5, 5, live()), StaleSnapshotError);
  const resized = rig('android'); const before = await resized.observe();
  resized.setScreen({ rect: { x: 0, y: 0, width: 720, height: 1280 }, orientation: 'PORTRAIT' });
  await assert.rejects(resized.operations.tapAt(before, 5, 5, live()), StaleSnapshotError);
  const old = rig('android'); const first = await old.observe(); await old.observe();
  await assert.rejects(old.operations.tapAt(first, 5, 5, live()), StaleSnapshotError);
  for (const check of [bounds, rotated, resized, old]) assert.deepEqual(performed(check.calls), []);
  assert.deepEqual(old.calls, []);
});
test('iOS tapAt stays UNSUPPORTED_ACTION and sends nothing', async () => {
  const r = rig('ios');
  await assert.rejects(r.operations.tapAt(await r.observe(), 5, 5, live()), { code: 'UNSUPPORTED_ACTION' });
  assert.deepEqual(r.calls, []);
});

test('replace text is one jev_replace_text call and the shown value is the field in a fresh capture, not the typed text', async () => {
  const r = rig('android');
  const evidence = await r.observe();
  r.queue.push([...androidElements().filter(e => e.ref !== 'e2'),
    element('e2', 'text-field', { x: 50, y: 500, width: 980, height: 120 }, { identifier: 'com.app:id/email', actions: ['tap', 'typeText'], value: '123-456-789' }),
    element('e4', 'text', { x: 0, y: 700, width: 100, height: 40 }, { label: '123456789', actions: [] })]);
  const done = await r.operations.replaceText(evidence, 'e2', '123456789', live());
  assert.deepEqual(r.calls, [{ tool: 'jev_replace_text', arguments: { locator: { using: 'id', value: 'com.app:id/email' }, text: '123456789' } }]);
  assert.equal('screen' in done.result && done.result.shownValue, '123-456-789');
});
test('iOS replace text accepts a leading hyphen and Unicode, and a hint-only field shows an empty value', async () => {
  const r = rig('ios');
  const evidence = await r.observe();
  r.queue.push([...iosElements().filter(e => e.ref !== 'e3'),
    element('e3', 'text-field', { x: 20, y: 100, width: 360, height: 40 }, { identifier: 'email', label: 'Email', actions: ['tap', 'typeText'], value: 'Email address', placeholder: 'Email address' })]);
  const done = await r.operations.replaceText(evidence, 'e3', '-héllo 世界', live());
  assert.deepEqual(r.calls, [{ tool: 'jev_replace_text', arguments: {
    locator: { using: '-ios predicate string', value: 'type IN {"XCUIElementTypeTextField", "XCUIElementTypeSecureTextField", "XCUIElementTypeTextView"} AND name == "email"' },
    text: '-héllo 世界' } }]);
  assert.equal('screen' in done.result && done.result.shownValue, '');
});
test('a secure field keeps its masking and a field the fresh capture cannot single out reports no shown value', async () => {
  const secret = 'hunter2-secret';
  const r = rig('ios');
  const evidence = await r.observe();
  r.queue.push([...iosElements().filter(e => e.ref !== 'e3'),
    element('e3', 'text-field', { x: 20, y: 100, width: 360, height: 40 }, { identifier: 'email', actions: ['tap', 'typeText'], value: '••••••••••••••' })]);
  const masked = await r.operations.replaceText(evidence, 'e3', secret, live());
  assert.equal('screen' in masked.result && masked.result.shownValue, '••••••••••••••');
  assert.equal(JSON.stringify(masked).includes(secret), false);
  const gone = rig('ios'); const before = await gone.observe();
  gone.queue.push(iosElements().filter(e => e.ref !== 'e3'));
  const none = await gone.operations.replaceText(before, 'e3', 'x', live());
  assert.equal('screen' in none.result, false);
  const empty = rig('ios');
  await assert.rejects(empty.operations.replaceText(await empty.observe(), 'e3', '', live()), { code: 'UNSUPPORTED_ACTION' });
  assert.deepEqual(empty.calls, []);
});

const mutations: Array<[string, AppiumPlatform, (o: AppiumOperations, e: Awaited<ReturnType<ReturnType<typeof rig>['observe']>>) => Promise<unknown>, OperationName]> = [
  ['tap', 'ios', (o, e) => o.tap(e, 'e2', live()), 'tap'],
  ['swipe', 'ios', (o, e) => o.swipe(e, 'e4', 'up', live()), 'swipe'],
  ['scroll', 'android', (o, e) => o.scroll(e, 'down', live()), 'scroll'],
  ['iOS back edge', 'ios', (o, e) => o.back(e, live()), 'back'],
  ['Android back', 'android', (o, e) => o.back(e, live()), 'back'],
  ['tapAt', 'android', (o, e) => o.tapAt(e, 5, 5, live()), 'tap-at'],
  ['replace text', 'ios', (o, e) => o.replaceText(e, 'e3', 'x', live()), 'replace-text'],
  ['restart', 'android', (o) => o.restart({ package: 'example.app', activity: '.Main' }, live()), 'restart'],
  ['terminate', 'ios', (o) => o.terminate('example.app', live()), 'terminate'],
];
for (const [name, platform, run, operation] of mutations) {
  for (const failure of [new AppiumError('ACKNOWLEDGEMENT_LOST'), new AppiumError('TIMEOUT'), new AppiumError('DRIVER_ERROR'), new Error('boom')]) {
    test(`a lost acknowledgement on ${name} (${failure.message}) closes dispatch and keeps the partial outcome; nothing is resent`, async () => {
      const r = rig(platform); const evidence = await r.observe();
      r.behaviour.failure = failure;
      await assert.rejects(run(r.operations, evidence), (error: unknown) => error instanceof UnconfirmedOperationError
        && error.code === 'UI_ACTION_UNCONFIRMED' && error.operation === operation);
      assert.equal(r.operations.unconfirmed, operation);
      const sent = r.calls.filter(call => call.tool !== 'jev_screen').length;
      assert.equal(sent, 1);
      r.behaviour.failure = undefined;
      await assert.rejects(run(r.operations, await r.observe()), UnconfirmedOperationError);
      await assert.rejects(r.operations.terminate('example.app', live()), UnconfirmedOperationError);
      assert.equal(r.calls.filter(call => call.tool !== 'jev_screen').length, 1);
      await r.operations.close();
      assert.equal(r.finished, 1);
    });
  }
}
test('an extension refusal before input is not a lost acknowledgement', async () => {
  const r = rig('ios'); const evidence = await r.observe();
  r.behaviour.failure = new AppiumError('NOT_UNIQUE');
  await assert.rejects(r.operations.replaceText(evidence, 'e3', 'x', live()), { code: 'TARGET_AMBIGUOUS' });
  assert.equal(r.operations.unconfirmed, undefined);
});

test('a typed value never appears in an error, whatever the client throws', async () => {
  const secret = 'S3cr3t-value-9f2';
  for (const failure of [new Error(`typed ${secret}`), new AppiumError('ACKNOWLEDGEMENT_LOST'), new AppiumError('NOT_ALLOWED'), new AppiumError('NOT_UNIQUE')]) {
    const r = rig('ios'); const evidence = await r.observe();
    r.behaviour.failure = failure;
    const error = await r.operations.replaceText(evidence, 'e3', secret, live()).then(() => undefined, (caught: unknown) => caught);
    assert.ok(error instanceof Error);
    const text = [String(error), error.message, String(error.stack), JSON.stringify(error, Object.getOwnPropertyNames(error)), String(error.cause)].join('\n');
    assert.equal(text.includes(secret), false);
  }
});

test('restart is one jev_start_activity with the launch extras, and only on Android', async () => {
  const r = rig('android');
  await r.operations.restart({ package: 'example.app', activity: '.Main', intentExtras: { route: 'settings' } }, live());
  assert.deepEqual(r.calls, [{ tool: 'jev_start_activity', arguments: { package: 'example.app', activity: '.Main', intentExtras: { route: 'settings' } } }]);
  const ios = rig('ios');
  await assert.rejects(ios.operations.restart({ package: 'example.app', activity: '.Main' }, live()), { code: 'UNSUPPORTED_ACTION' });
  assert.deepEqual(ios.calls, []);
});
test('terminate is one jev_terminate_app and close deletes the owned session once, then refuses further operations', async () => {
  const r = rig('ios'); const evidence = await r.observe();
  await r.operations.terminate('example.app', live());
  assert.deepEqual(r.calls, [{ tool: 'jev_terminate_app', arguments: { appId: 'example.app' } }]);
  await Promise.all([r.operations.close(), r.operations.close()]);
  assert.equal(r.finished, 1);
  await assert.rejects(r.operations.tap(evidence, 'e2', live()), { code: 'STATE_UNAVAILABLE' });
  assert.equal(r.calls.length, 1);
});
test('a failed session delete surfaces as CLEANUP_FAILED without its cause', async () => {
  const r = rig('android');
  const failing = new AppiumOperations({ sessionId, profile: { platform: 'android' }, client: { dispatchOpen: true, performActions: async () => {},
    callExtension: (async () => { throw new Error('x'); }) as unknown as OperationsClient['callExtension'] },
  finish: async () => { throw new Error('delete said SECRET'); } }, { resolve: () => { throw new Error('unused'); }, invalidate: () => {}, observe: r.observe });
  await assert.rejects(failing.close(), (error: unknown) => error instanceof DeviceReasonError && error.code === 'CLEANUP_FAILED' && !String(error.message).includes('SECRET'));
});

test('every mutation passes the dispatcher once under its name, and a refusal there sends nothing', async () => {
  const names: OperationName[] = [];
  const r = rig('android', undefined, { dispatch: async (operation, send) => { names.push(operation); await send(); } });
  const evidence = await r.observe();
  await r.operations.replaceText(evidence, 'e2', 'x', live());
  assert.deepEqual(names, ['replace-text']);
  const refusing = rig('android', undefined, { dispatch: async () => { throw new DeviceReasonError('STATE_UNAVAILABLE', 'closed by authorization'); } });
  await assert.rejects(refusing.operations.tap(await refusing.observe(), 'e1', live()), { code: 'STATE_UNAVAILABLE' });
  assert.deepEqual(refusing.calls, []);
  assert.equal(refusing.operations.unconfirmed, undefined);
});

test('operations are serialized, refuse a closed dispatch and honour an aborted signal before sending', async () => {
  const r = rig('android'); const evidence = await r.observe();
  let release: () => void = () => {};
  r.behaviour.gate = new Promise<void>(done => { release = done; });
  const first = r.operations.tap(evidence, 'e1', live());
  await assert.rejects(r.operations.terminate('example.app', live()), { code: 'INTERNAL_ERROR' });
  release();
  await first;
  r.behaviour.gate = undefined;
  const controller = new AbortController(); controller.abort(new Error('cancelled'));
  await assert.rejects(r.operations.terminate('example.app', controller.signal), { message: 'cancelled' });
  r.behaviour.open = false;
  await assert.rejects(r.operations.terminate('example.app', live()), { code: 'STATE_UNAVAILABLE' });
  assert.equal(r.calls.length, 1);
});

test('through the real client, a lost reply to jev_replace_text sends it once, closes dispatch and still deletes the session', async t => {
  const f = clientFixture(t, 'android');
  const client = await f.open('none', resolve('tests/fixtures/appium-wire/android/replace-text-lost.jsonl'));
  const session = await AppiumCommandSession.start({ client, profile: f.profile });
  const references = new ObservationReferences(session.sessionId, 'android-test');
  const snapshot = references.issue({ truncated: false, screenHash: 'hash', elements: [
    element('e1', 'text-field', { x: 50, y: 500, width: 980, height: 120 }, { identifier: 'com.app:id/email', actions: ['tap', 'typeText'] })] }, Date.now(), true);
  const evidence = { snapshot, screenshot: { jpeg: Buffer.alloc(0), size: { width: 1080, height: 2400 }, frame: androidScreen, orientation: 'PORTRAIT' as const } };
  const operations = new AppiumOperations({ sessionId: session.sessionId, profile: session.profile,
    client: { get dispatchOpen() { return client.dispatchOpen; }, performActions: async () => { throw new Error('no performActions on the client yet'); },
      callExtension: client.callExtension.bind(client) }, finish: () => session.finish() },
  { resolve: input => references.resolve(input), invalidate: () => references.invalidate(), observe: async () => { throw new Error('unused'); } }, { timeoutMs: 400 });
  await assert.rejects(operations.replaceText(evidence, 'e1', 'replacement', live()), UnconfirmedOperationError);
  assert.equal(client.dispatchOpen, false);
  await assert.rejects(operations.replaceText(evidence, 'e1', 'replacement', live()), UnconfirmedOperationError);
  await operations.close();
  assert.deepEqual(f.calls().filter(call => call.method === 'tools/call').map(call => call.params.name),
    ['appium_session_management', 'jev_settings', 'jev_replace_text', 'appium_session_management']);
});

test('an iOS attach session profile stays refused', t => {
  const f = clientFixture(t, 'ios');
  assert.throws(() => createSessionProfile(f.stack, { platform: 'ios', device: 'ios-test', path: 'attach', presentation: 'visible' }), { code: 'NOT_ALLOWED' });
});
