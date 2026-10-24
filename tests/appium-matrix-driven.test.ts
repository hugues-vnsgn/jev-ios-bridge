/**
 * Preservation matrix, driven version 2 (P3.9): a `do` step on the Appium driver hands back to Claude through the
 * real bridge service and takes the answer through `resolve`, as `resolve_step` does. Fake Jev, fake MCP provider.
 */
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { readRunEvents } from '../src/log/index.js';
import { ANDROID_DEVICE, IOS_DEVICE, androidTarget, authorized, bridge, iosTarget } from './fixtures/appium-wire/matrix.js';
import { androidScreen, iosScreen, png, world, worldFixture, type IosNode, type WorldRule } from './fixtures/appium-wire/world.js';
import type { FakeStep } from './fixtures/driven-judge.js';

const welcome: IosNode = { type: 'StaticText', name: 'welcome', label: 'Welcome', frame: [16, 100, 200, 40] };
const signIn: IosNode = { type: 'Button', name: 'sign.in', label: 'Sign in', frame: [20, 200, 200, 44] };
const screens = {
  login: iosScreen([welcome, signIn]),
  moved: iosScreen([welcome, { ...signIn, frame: [20, 400, 200, 44] }]),
  other: iosScreen([welcome, { type: 'Button', name: 'register', label: 'Register', frame: [20, 200, 200, 44] }]),
  home: iosScreen([{ type: 'StaticText', name: 'home', label: 'Home', frame: [16, 100, 200, 40] }]),
};
const tapAt = (x: number, y: number) => ({ actions: [{ actions: [{ type: 'pointerMove', x, y }] }] });
/** Only a tap on Sign in leads home; Jev's search scrolls leave the screen as it is. */
const rules: WorldRule[] = [{ tool: 'appium_perform_actions', when: 'login', match: tapAt(120, 222), to: 'home' }];
const taps = (f: { toolCalls: () => { params?: { name?: string; arguments?: Record<string, unknown> } }[] }) => f.toolCalls()
  .filter(call => call.params!.name === 'appium_perform_actions').map(call => {
    const [move] = (call.params!.arguments!.actions as { actions: { x?: number; y?: number }[] }[])[0]!.actions;
    return [move!.x, move!.y];
  });
const script = { version: 2, app: { bundleId: 'example.app' }, values: {}, steps: [
  { id: 'signIn', kind: 'do', intent: 'Sign in', doneWhen: 'Home shows', effect: 'none' },
  { id: 'verify', kind: 'checkpoint', guard: { present: [{ identifier: 'home' }] }, assertions: [{ id: 'shown', claim: 'Home is shown.' }] },
] };
const handsBackThenDone = (): FakeStep[] => [{ choice: 'none_fits', confidence: 0.9 }, { choice: 'step_done', confidence: 0.95, done: 0.95 }];

async function paused(t: TestContext, jev: FakeStep[] = handsBackThenDone()) {
  const f = worldFixture(t, world('ios', screens, rules), iosTarget);
  const b = await bridge(t, [f.driver], jev);
  const { runId } = await b.service.start(script);
  const status = await b.service.status(runId, 45_000);
  assert.equal(status.state, 'needs_claude', `the run paused rather than ending ${status.report.reason}`);
  const pause = status.pause!;
  const sourcesAtPause = f.tools().filter(name => name === 'appium_get_page_source').length;
  const inputsAtPause = taps(f).length;
  const finished = async () => {
    for (let waited = 0; waited < 20_000; waited += 50) {
      const now = await b.service.status(runId, 5_000);
      if (now.state !== 'running') return now;
    }
    throw new Error('the run never paused or finished');
  };
  return { f, b, runId, pause, sourcesAtPause, inputsAtPause, finished, events: () => readRunEvents(b.service.baseDir, runId) };
}
const signInRef = (pause: { elements: { ref: string; description: string }[] }) => pause.elements.find(element => element.description.startsWith('button "Sign in"'))!.ref;
const sinceIndex = (tools: string[], count: number) => {
  let seen = 0;
  return tools.slice(tools.findIndex(name => name === 'appium_get_page_source' && ++seen === count) + 1);
};

test('a hand-back pauses with the device held, and resolve_step acts once on a fresh capture of the same screen', async t => {
  const p = await paused(t);
  assert.deepEqual([p.pause.reason, p.pause.stepId], ['NONE_FITS', 'signIn']);
  assert.ok(p.pause.elements.some(element => element.description === 'button "Sign in" identifier "sign.in" at x 20, y 200, 200x44'));
  assert.equal(p.f.admission.inspect(IOS_DEVICE)!.state, 'active', 'the paused run keeps its admission');
  assert.equal(p.f.tools().at(-1), 'jev_screen', 'nothing is sent while Claude decides');
  const ref = signInRef(p.pause);
  assert.deepEqual(await p.b.service.resolve(p.runId, p.pause.pauseId, { kind: 'tap', ref }), { kind: 'tap', ref });
  const done = await p.finished();
  assert.deepEqual([done.state, done.report.verdict], ['finished', 'passed']);
  const afterPause = sinceIndex(p.f.tools(), p.sourcesAtPause);
  const beforeInput = afterPause.slice(0, afterPause.indexOf('appium_perform_actions'));
  assert.ok(beforeInput.includes('appium_get_page_source') && beforeInput.every(name => name === 'appium_get_page_source' || name === 'jev_screen'),
    `the late answer refreshes the paused screen before its one input: ${beforeInput.join(', ')}`);
  assert.deepEqual(taps(p.f).slice(p.inputsAtPause), [[120, 222]], 'one input, on Sign in');
  assert.equal(authorized(p.f.admission, 'run-1')['appium-tap'], 1);
  const action = (await p.events()).find(event => event.type === 'action' && event.data.decidedBy === 'claude');
  assert.equal(action?.data.action, 'tap');
  assert.equal(p.f.admission.inspect(IOS_DEVICE)!.state, 'available');
});

for (const [name, moveTo] of [['a different screen', 'other'], ['the same button at a new position', 'moved']] as const) {
  test(`${name} during the pause: the answer is not performed and Claude gets a fresh SCREEN_CHANGED hand-back`, async t => {
    const p = await paused(t, [{ choice: 'none_fits', confidence: 0.9 }]);
    p.f.goto(moveTo);
    await p.b.service.resolve(p.runId, p.pause.pauseId, { kind: 'tap', ref: signInRef(p.pause) });
    const again = await p.finished();
    assert.equal(again.state, 'needs_claude');
    assert.equal(again.pause!.reason, 'SCREEN_CHANGED');
    assert.notEqual(again.pause!.pauseId, p.pause.pauseId);
    assert.deepEqual(taps(p.f).slice(p.inputsAtPause), [], 'no input without a fresh observation of the paused screen');
    await p.b.service.resolve(p.runId, again.pause!.pauseId, { kind: 'stop' });
    const done = await p.finished();
    assert.deepEqual([done.report.verdict, done.report.reason], ['inconclusive', 'STOPPED_BY_CLAUDE']);
    assert.equal(p.f.admission.inspect(IOS_DEVICE)!.state, 'available');
  });
}

test('a paused session lost while Claude decides is replaced by a fresh child, and Claude gets a fresh hand-back with no input',
  { todo: 'D3 (reported to the root): the replacement session is observed as a refresh, so the stale answer is tapped' }, async t => {
  const p = await paused(t, [{ choice: 'none_fits', confidence: 0.9 }]);
  const owner = p.f.admission.inspect(IOS_DEVICE)!.owner!;
  const groups = () => p.f.admission.readGeneration(owner).components.filter(component => component.kind === 'appium-process-group');
  const pgid = (groups()[0]!.declaration as { pgid: number }).pgid;
  process.kill(-pgid, 'SIGKILL');
  for (let waited = 0; waited < 4000; waited += 20) { try { process.kill(pgid, 0); await delay(20); } catch { break; } }
  await p.b.service.resolve(p.runId, p.pause.pauseId, { kind: 'tap', ref: signInRef(p.pause) });
  const again = await p.finished();
  assert.equal(groups().length, 2, 'a replacement child is recorded before its session');
  assert.equal(again.state, 'needs_claude', 'the answer given for the lost session is not performed');
  assert.deepEqual(taps(p.f).slice(p.inputsAtPause), []);
});

test.todo('P3.10: the MCP resolve_step tool on the Appium composition answers a pause from run_scenario exactly as tests/mcp-handback.test.ts pins for the legacy driver');

const androidScreens = {
  login: androidScreen([{ className: 'android.widget.TextView', text: 'Welcome', bounds: [16, 100, 216, 140] }, { className: 'android.view.View', description: 'Sign in', bounds: [20, 200, 220, 244] }]),
  home: androidScreen([{ className: 'android.widget.TextView', text: 'Home', id: 'example.app:id/home', bounds: [16, 100, 216, 140] }]),
};

test('on Android, a hand-back answered with tapAt converts the screenshot point once and finishes the step', async t => {
  const phone = androidTarget();
  const f = worldFixture(t, { ...world('android', androidScreens, [{ tool: 'appium_perform_actions', when: 'login', match: tapAt(120, 220), to: 'home' }]),
    png: png(32, 64), rect: { x: 0, y: 0, width: 320, height: 640 } }, phone.options, phone.nativeReply);
  const b = await bridge(t, [f.driver], handsBackThenDone());
  const android = { version: 2, platform: 'android', app: { package: 'example.app', activity: '.Main' }, values: {}, steps: [
    { id: 'signIn', kind: 'do', intent: 'Sign in', doneWhen: 'Home shows', effect: 'none' },
    { id: 'verify', kind: 'checkpoint', guard: { present: [{ identifier: 'example.app:id/home' }] }, assertions: [{ id: 'shown', claim: 'Home is shown.' }] },
  ] };
  const { runId } = await b.service.start(android);
  const status = await b.service.status(runId, 45_000);
  assert.equal(status.state, 'needs_claude', `the run paused rather than ending ${status.report.reason}`);
  const pause = status.pause!;
  assert.equal(pause.reason, 'NONE_FITS');
  const before = taps(f).length;
  await b.service.resolve(runId, pause.pauseId, { kind: 'tapAt', x: 12, y: 22 });
  let done = await b.service.status(runId, 20_000);
  for (let waited = 0; done.state === 'running' && waited < 20_000; waited += 5_000) done = await b.service.status(runId, 5_000);
  assert.deepEqual([done.state, done.report.verdict], ['finished', 'passed']);
  assert.deepEqual(taps(f).slice(before), [[120, 220]], 'the screenshot point (12, 22) of a 32 x 64 shot lands once at (120, 220) on the 320 x 640 window');
  assert.equal(f.admission.inspect(ANDROID_DEVICE)!.state, 'available');
});
