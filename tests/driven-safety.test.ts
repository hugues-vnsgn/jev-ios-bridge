/**
 * Driven safety fixes (Issue 12, Codex review P1 #1, #3, #4 and P2 #9): each test reproduces the review's probe
 * through `runScriptedScenario` with a fake driver (named screens), the fake Jev from tests/fixtures/driven-judge.ts
 * and a fake hand-back, and shows the fix. No device, no TypeSafe call.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Action, DeviceDriver, Element, Platform, RunEvent, RunLog, Snapshot } from '../src/contracts/index.js';
import { backButtonOf } from '../src/device/index.js';
import { buildCandidates, isAppErrorDialog, isPermissionDialog } from '../src/driven/candidates.js';
import { acceptDecision } from '../src/driven/policy.js';
import type { HandbackAnswer, HandbackPacket } from '../src/driven/step.js';
import { PAUSE_REASON_TEXT } from '../src/driven/vocabulary.js';
import { runScriptedScenario } from '../src/scripted/run.js';
import { parseScriptedScenario } from '../src/scripted/schema.js';
import { loadCapture } from '../spikes/jev-drives/candidates.js';
import { fakeDrivenJudge, type FakeStep } from './fixtures/driven-judge.js';

// ---------- fakes ----------

const el = (ref: string, role: string, extra: Partial<Element> = {}): Element => ({
  ref, role, frame: { x: 10, y: 300, width: 100, height: 40 }, state: { enabled: true, visible: true },
  actions: ['tap'], ...extra,
});
const button = (ref: string, label: string, extra: Partial<Element> = {}) => el(ref, 'button', { label, ...extra });
const text = (ref: string, label: string, extra: Partial<Element> = {}) => el(ref, 'text', { label, actions: [], ...extra });
const list = (ref: string) => el(ref, 'scroll-view', { label: 'List', actions: ['swipeWithin'] });
/** The window: gives the screen its size, so the driver can tell the top bar. */
const app = el('w0', 'application', { label: 'App', frame: { x: 0, y: 0, width: 400, height: 800 }, actions: [] });
/** A navigation-bar back button the iOS driver taps for `back`. */
const navBack = (label: string) =>
  button('nb', label, { identifier: 'BackButton', frame: { x: 8, y: 50, width: 80, height: 40 } });

function actionKey(action: Action): string {
  switch (action.kind) {
    case 'tap': return `tap:${action.targetRef}`;
    case 'type': return `type:${action.targetRef}:${action.valueKey}`;
    case 'swipe': return `swipe:${action.targetRef}:${action.direction}`;
    case 'scroll': return `scroll:${action.direction}`;
    case 'back': return 'back';
    case 'tapAt': return `tapAt:${action.x},${action.y}`;
  }
}

/** A device whose screens are named; `moves['screen key']` is the screen an action leads to (else it stays). */
function graphDriver(screens: Record<string, Element[]>, start: string, moves: Record<string, string> = {}) {
  let current = start;
  let sequence = 0;
  const acts: string[] = [];
  const shot = (): Snapshot => ({ deviceId: 'fake', capturedAt: Date.now(), expiresAt: Date.now() + 60_000,
    sequence: ++sequence, elements: screens[current]!, truncated: false, screenHash: current });
  const driver: DeviceDriver = {
    async prepare() {},
    async observe() { return shot(); },
    async act(action) {
      const key = actionKey(action);
      acts.push(`${current} ${key}`);
      current = moves[`${current} ${key}`] ?? current;
      return shot();
    },
    actPath: () => undefined,
    async close() {},
  };
  return Object.assign(driver, { acts });
}

function fakeHandback(answers: HandbackAnswer[]) {
  const packets: HandbackPacket[] = [];
  const handback = async (packet: HandbackPacket) => {
    packets.push(packet);
    const answer = answers.shift();
    if (!answer) throw new Error(`fake hand-back: no answer scripted for pause ${packets.length}`);
    return answer;
  };
  return Object.assign(handback, { packets });
}

function recordingLog(): RunLog & { events: RunEvent[] } {
  const events: RunEvent[] = [];
  return { events,
    async append(type, data) { events.push({ version: 1, runId: 'driven', sequence: events.length + 1,
      at: new Date().toISOString(), type, data: structuredClone(data) }); },
    async read() { return events; },
  };
}

const doStep = (effect = 'none') => ({ id: 'go', kind: 'do', intent: 'Open the feed', doneWhen: 'The feed shows', effect });
const checkpoint = { id: 'verify', kind: 'checkpoint', guard: { present: [{ role: 'text', label: 'Home' }] },
  assertions: [{ id: 'shown', claim: 'Home is shown.' }] };
const passingJudge = { async judge(assertions: { id: string }[]) {
  return { probabilities: Object.fromEntries(assertions.map(a => [a.id, 0.97])), inputTokens: 1, latencyMs: 1,
    model: 'jev-1.13.0' };
} };

async function run(input: { driver: ReturnType<typeof graphDriver>; judge: FakeStep[]; handback?: HandbackAnswer[];
  effect?: string; testWritesAllowed?: boolean; platform?: Platform }) {
  const scenario = parseScriptedScenario({ version: 2, values: {}, steps: [doStep(input.effect), checkpoint],
    ...(input.platform === 'android' ? { platform: 'android', app: { package: 'com.example.app' } }
      : { app: { bundleId: 'com.example.app' } }) });
  const log = recordingLog();
  const judge = fakeDrivenJudge(input.judge);
  const handback = fakeHandback(input.handback ?? []);
  const report = await runScriptedScenario({ runId: 'driven', log, scenario, driver: input.driver,
    judge: passingJudge, driven: { judge, handback, testWritesAllowed: input.testWritesAllowed ?? false } });
  const of = (type: RunEvent['type']) => log.events.filter(event => event.type === type).map(event => event.data);
  return { report, judge, handback, of };
}

// ---------- #1: no target search without a passed preflight ----------

test('#1 a test_write step without a passed preflight never scrolls to search: none_fits goes to Claude as NO_PREFLIGHT', async () => {
  const screens = { top: [list('l1'), text('t1', 'Rows')], below: [list('l1'), button('b1', 'Save')] };
  const driver = graphDriver(screens, 'top', { 'top scroll:down': 'below' });
  const { report, handback, of } = await run({ driver, effect: 'test_write',
    judge: [{ choice: 'none_fits', confidence: 0.9 }, { choice: 'tap:b1', confidence: 0.99 }],
    handback: [{ kind: 'stop' }] });
  assert.deepEqual(driver.acts, [], 'no device action before Claude answers');
  assert.deepEqual(of('search'), []);
  assert.deepEqual(handback.packets.map(p => p.reason), ['NO_PREFLIGHT']);
  assert.equal(report.reason, 'STOPPED_BY_CLAUDE');
});

test('#1 a low-confidence test_write pick without a passed preflight goes to Claude unsearched too', async () => {
  const driver = graphDriver({ top: [list('l1'), button('b1', 'Save')] }, 'top', { 'top scroll:down': 'top' });
  const { handback, of } = await run({ driver, effect: 'test_write',
    judge: [{ choice: 'tap:b1', confidence: 0.5 }], handback: [{ kind: 'stop' }] });
  assert.deepEqual(driver.acts, []);
  assert.deepEqual(of('search'), []);
  assert.deepEqual(handback.packets.map(p => p.reason), ['NO_PREFLIGHT']);
});

test('#1 with a passed preflight the test_write search still runs', async () => {
  const screens = { top: [list('l1'), text('t1', 'Rows')], below: [list('l1'), button('b1', 'Save')],
    home: [text('t3', 'Home')] };
  const driver = graphDriver(screens, 'top', { 'top scroll:down': 'below', 'below tap:b1': 'home' });
  const { report, handback } = await run({ driver, effect: 'test_write', testWritesAllowed: true, judge: [
    { choice: 'none_fits', confidence: 0.9 }, { choice: 'tap:b1', confidence: 0.95 },
    { choice: 'step_done', confidence: 0.95, done: 0.95 }] });
  assert.equal(report.verdict, 'passed');
  assert.deepEqual(driver.acts, ['top scroll:down', 'below tap:b1']);
  assert.equal(handback.packets.length, 0);
});

// ---------- #3: permission dialogs never go to Jev ----------

const captures = join(import.meta.dirname, '..', 'spikes/jev-drives/captures');
const NNW_NOTIFICATIONS = join(captures, 'netnewswire/01-notification-permission-alert'); // case nnw-02
const NNW_PASTE = join(captures, 'netnewswire/09-paste-permission-alert');
const NIA_NOTIFICATIONS = join(captures, 'nowinandroid/02-notification-permission-prompt'); // case nia-03

test('#3 an Android permission prompt (nia-03) goes to Claude as PERMISSION_DIALOG without asking Jev', async () => {
  const prompt = loadCapture(NIA_NOTIFICATIONS, 'android');
  const allow = prompt.find(e => e.identifier === 'com.android.permissioncontroller:id/permission_allow_button')!;
  const deny = prompt.find(e => e.identifier === 'com.android.permissioncontroller:id/permission_deny_button')!;
  const driver = graphDriver({ prompt, home: [text('t3', 'Home')] }, 'prompt', { [`prompt tap:${deny.ref}`]: 'home' });
  // The review's probe: Jev would pick Allow at 0.99 in an effect "none" step, if it were asked on the prompt.
  const pickAllow: FakeStep = prepared => prepared.set.meanings.has(`tap:${allow.ref}`)
    ? { choice: `tap:${allow.ref}`, confidence: 0.99 } : { choice: 'step_done', confidence: 0.95, done: 0.95 };
  const { report, judge, handback, of } = await run({ driver, platform: 'android', judge: [pickAllow],
    handback: [{ kind: 'tap', ref: deny.ref }] });
  assert.deepEqual(handback.packets.map(p => p.reason), ['PERMISSION_DIALOG']);
  assert.deepEqual(driver.acts, [`prompt tap:${deny.ref}`]);
  assert.deepEqual(of('action').map(a => a.decidedBy), ['claude']);
  assert.equal(judge.asked.length, 1, 'Jev is asked only on the screen after the prompt');
  assert.equal(report.verdict, 'passed');
});

test('#3 iOS notification and paste alerts (nnw-02) go to Claude as PERMISSION_DIALOG without asking Jev', async () => {
  for (const capture of [NNW_NOTIFICATIONS, NNW_PASTE]) {
    const alert = loadCapture(capture, 'ios');
    const allow = alert.find(e => e.role === 'button' && /^Allow( Paste)?$/.test(e.label ?? ''))!;
    const driver = graphDriver({ alert }, 'alert');
    const { judge, handback } = await run({ driver, judge: [{ choice: `tap:${allow.ref}`, confidence: 0.99 }],
      handback: [{ kind: 'stop' }] });
    assert.deepEqual(handback.packets.map(p => p.reason), ['PERMISSION_DIALOG'], capture);
    assert.equal(judge.asked.length, 0, capture);
    assert.deepEqual(driver.acts, [], capture);
  }
});

test('#3 a permission prompt reached by the target search goes to Claude without asking Jev', async () => {
  const prompt = loadCapture(NIA_NOTIFICATIONS, 'android');
  const allow = prompt.find(e => e.identifier === 'com.android.permissioncontroller:id/permission_allow_button')!;
  const driver = graphDriver({ top: [list('l1'), text('t1', 'Rows')], prompt }, 'top', { 'top scroll:down': 'prompt' });
  const { judge, handback } = await run({ driver, platform: 'android', judge: [
    { choice: 'none_fits', confidence: 0.9 }, { choice: `tap:${allow.ref}`, confidence: 0.99 }],
    handback: [{ kind: 'stop' }] });
  assert.equal(judge.asked.length, 1);
  assert.deepEqual(driver.acts, ['top scroll:down']);
  assert.deepEqual(handback.packets.map(p => p.reason), ['PERMISSION_DIALOG']);
});

test('#3 PERMISSION_DIALOG has its hand-back text', () => {
  assert.match(PAUSE_REASON_TEXT.PERMISSION_DIALOG ?? '', /permission/i);
});

// ---------- #4: back through a risky control ----------

test('#4 the shared helper finds the button the iOS driver taps for back', () => {
  const snapshot: Snapshot = { deviceId: 'fake', capturedAt: 0, expiresAt: 1, sequence: 1, truncated: false,
    elements: [app, navBack('Delete'), text('t1', 'Draft')] };
  assert.equal(backButtonOf(snapshot)?.ref, 'nb');
});

test('#4 policy: back is refused when the control it taps has a risky word, accepted otherwise', () => {
  const set = buildCandidates([text('t1', 'Draft')]);
  const back = { effect: 'none' as const, choice: 'back', confidence: 0.99, done: 0, set };
  assert.deepEqual(acceptDecision({ ...back, backTarget: navBack('Delete') }), { kind: 'handBack', reason: 'RISKY_ACTION' });
  assert.deepEqual(acceptDecision({ ...back, backTarget: button('nb', 'Back', { identifier: 'pay_back' }) }),
    { kind: 'handBack', reason: 'RISKY_ACTION' });
  assert.equal(acceptDecision({ ...back, backTarget: navBack('Inbox') }).kind, 'accept');
  assert.equal(acceptDecision(back).kind, 'accept');
});

test('#4 on iOS, Jev\'s back onto a top-bar BackButton labelled Delete or Pay goes to Claude as RISKY_ACTION', async () => {
  for (const label of ['Delete', 'Pay']) {
    const driver = graphDriver({ detail: [app, navBack(label), text('t1', 'Draft')], home: [text('t3', 'Home')] },
      'detail', { 'detail back': 'home' });
    const { handback, report } = await run({ driver, judge: [{ choice: 'back', confidence: 0.99 }],
      handback: [{ kind: 'stop' }] });
    assert.deepEqual(driver.acts, [], label);
    assert.deepEqual(handback.packets.map(p => p.reason), ['RISKY_ACTION'], label);
    assert.equal(report.reason, 'STOPPED_BY_CLAUDE');
  }
});

test('#4 on iOS, back onto a plain back button is performed; on Android the Back key has no label', async () => {
  const ios = graphDriver({ detail: [app, navBack('Inbox'), text('t1', 'Draft')], home: [text('t3', 'Home')] },
    'detail', { 'detail back': 'home' });
  const done = { choice: 'step_done', confidence: 0.95, done: 0.95 };
  assert.equal((await run({ driver: ios, judge: [{ choice: 'back', confidence: 0.99 }, done] })).report.verdict, 'passed');
  assert.deepEqual(ios.acts, ['detail back']);
  const android = graphDriver({ detail: [app, navBack('Delete'), text('t1', 'Draft')], home: [text('t3', 'Home')] },
    'detail', { 'detail back': 'home' });
  const result = await run({ driver: android, platform: 'android', judge: [{ choice: 'back', confidence: 0.99 }, done] });
  assert.equal(result.report.verdict, 'passed');
  assert.deepEqual(android.acts, ['detail back']);
});

// ---------- #9: loops during the target search ----------

test('#9 search screens going A→B→A→B go to Claude as SCREEN_LOOP before Jev\'s next pick is performed', async () => {
  const screens = { a: [list('l1'), text('t1', 'A')], b: [list('l1'), text('t2', 'B'), button('b2', 'Go')] };
  const driver = graphDriver(screens, 'a', { 'a scroll:down': 'b', 'b scroll:down': 'a' });
  const none = { choice: 'none_fits', confidence: 0.9 };
  // The review's probe: a fourth, accepted pick on B was tapped.
  const { handback, judge } = await run({ driver, judge: [none, none, none, { choice: 'tap:b2', confidence: 0.95 }],
    handback: [{ kind: 'stop' }] });
  assert.deepEqual(driver.acts, ['a scroll:down', 'b scroll:down', 'a scroll:down']);
  assert.equal(judge.asked.length, 3);
  assert.deepEqual(handback.packets.map(p => p.reason), ['SCREEN_LOOP']);
});

test('#3 isPermissionDialog: exactly the permission captures among the spike screens', () => {
  const cases: { capture: string; platform: Platform }[] =
    JSON.parse(readFileSync(join(import.meta.dirname, '..', 'spikes/jev-drives/cases.json'), 'utf8')).cases;
  const permission = new Set([NNW_NOTIFICATIONS, NNW_PASTE, NIA_NOTIFICATIONS]);
  const seen = new Map(cases.map(c => [join(import.meta.dirname, '..', c.capture), c.platform]));
  seen.set(NNW_PASTE, 'ios');
  for (const [dir, platform] of seen) {
    assert.equal(isPermissionDialog(loadCapture(dir, platform), platform), permission.has(dir), dir);
  }
});

test('#3 isPermissionDialog: iOS button labels whole and in any case; Android permission-controller ids', () => {
  for (const label of ['Allow', 'don\'t allow', 'Don’t Allow', 'ALLOW ONCE', 'Allow While Using App', 'Allow Full Access',
    'Allow Paste', 'Don’t Allow Paste', 'Limit Access…', 'Limit Access...', 'Ask App Not to Track', ' Allow ']) {
    assert.ok(isPermissionDialog([button('b1', label)], 'ios'), label);
  }
  for (const label of ['Allowed', 'Allow notifications', 'Allowance']) {
    assert.ok(!isPermissionDialog([button('b1', label)], 'ios'), label);
  }
  assert.ok(!isPermissionDialog([text('t1', 'Allow')], 'ios'), 'a text is not an alert button');
  assert.ok(isPermissionDialog([button('b1', 'OK', { identifier: 'com.google.android.permissioncontroller:id/x' })], 'android'));
  assert.ok(isPermissionDialog([text('t1', 'Hi', { identifier: 'com.android.permissioncontroller:id/permission_message' })],
    'android'));
  assert.ok(!isPermissionDialog([button('b1', 'Allow', { identifier: 'com.example:id/allow' })], 'android'));
});

// ---------- PR #36 review: Android's app error dialogs go to Claude (C17) ----------

const CALENDAR_ANR = join(captures, 'fossify-calendar/13-anr-dialog');
const KOTLINCONF_ANR = join(captures, 'kotlinconf-android/01-anr-on-first-launch');

test('an Android "isn\'t responding" dialog goes to Claude as APP_ERROR_DIALOG without asking Jev', async () => {
  const dialog = loadCapture(CALENDAR_ANR, 'android');
  const close = dialog.find(e => e.identifier === 'android:id/aerr_close')!;
  const wait = dialog.find(e => e.identifier === 'android:id/aerr_wait')!;
  const driver = graphDriver({ dialog, home: [text('t3', 'Home')] }, 'dialog', { [`dialog tap:${wait.ref}`]: 'home' });
  // The review's probe: asked on the dialog, Jev picks Close app, which kills the app.
  const pickClose: FakeStep = prepared => prepared.set.meanings.has(`tap:${close.ref}`)
    ? { choice: `tap:${close.ref}`, confidence: 0.99 } : { choice: 'step_done', confidence: 0.95, done: 0.95 };
  const { report, judge, handback, of } = await run({ driver, platform: 'android', judge: [pickClose],
    handback: [{ kind: 'tap', ref: wait.ref }] });
  assert.deepEqual(handback.packets.map(p => p.reason), ['APP_ERROR_DIALOG']);
  assert.deepEqual(driver.acts, [`dialog tap:${wait.ref}`]);
  assert.deepEqual(of('action').map(a => a.decidedBy), ['claude']);
  assert.equal(judge.asked.length, 1, 'Jev is asked only on the screen after the dialog');
  assert.equal(report.verdict, 'passed');
});

test('an app error dialog reached by the target search goes to Claude without asking Jev', async () => {
  const dialog = loadCapture(KOTLINCONF_ANR, 'android');
  const close = dialog.find(e => e.identifier === 'android:id/aerr_close')!;
  const driver = graphDriver({ top: [list('l1'), text('t1', 'Rows')], dialog }, 'top', { 'top scroll:down': 'dialog' });
  const { judge, handback } = await run({ driver, platform: 'android', judge: [
    { choice: 'none_fits', confidence: 0.9 }, { choice: `tap:${close.ref}`, confidence: 0.99 }],
    handback: [{ kind: 'stop' }] });
  assert.equal(judge.asked.length, 1);
  assert.deepEqual(driver.acts, ['top scroll:down']);
  assert.deepEqual(handback.packets.map(p => p.reason), ['APP_ERROR_DIALOG']);
});

test('isAppErrorDialog: exactly the two recorded freezes among all 82 captured screens', () => {
  const platformOf: Record<string, Platform> = { 'fossify-calendar': 'android', 'kotlinconf-android': 'android',
    listmaker: 'android', nowinandroid: 'android', kotlinconf: 'ios', netnewswire: 'ios', readme: 'ios' };
  const errors = new Set([CALENDAR_ANR, KOTLINCONF_ANR]);
  let checked = 0;
  for (const app of readdirSync(captures, { withFileTypes: true }).filter(entry => entry.isDirectory())) {
    const platform = platformOf[app.name];
    assert.ok(platform, `the platform of ${app.name}`);
    for (const screen of readdirSync(join(captures, app.name), { withFileTypes: true }).filter(entry => entry.isDirectory())) {
      const dir = join(captures, app.name, screen.name);
      assert.equal(isAppErrorDialog(loadCapture(dir, platform), platform), errors.has(dir), dir);
      checked++;
    }
  }
  assert.equal(checked, 82);
});

test('isAppErrorDialog: any android:id/aerr_ element on Android, the crash dialog\'s too; never on iOS', () => {
  // The ids of AOSP's app_anr_dialog.xml and app_error_dialog.xml ("isn't responding", "keeps stopping").
  for (const id of ['aerr_close', 'aerr_wait', 'aerr_report', 'aerr_restart', 'aerr_app_info', 'aerr_mute']) {
    assert.ok(isAppErrorDialog([button('b1', 'Any', { identifier: `android:id/${id}` })], 'android'), id);
  }
  assert.ok(!isAppErrorDialog([button('b1', 'Close app', { identifier: 'com.example:id/aerr_close' })], 'android'),
    'an app\'s own id');
  assert.ok(!isAppErrorDialog([button('b1', 'Close app')], 'android'), 'a label alone');
  assert.ok(!isAppErrorDialog([button('b1', 'Close app', { identifier: 'android:id/aerr_close' })], 'ios'));
});

test('APP_ERROR_DIALOG has its hand-back text', () => {
  assert.match(PAUSE_REASON_TEXT.APP_ERROR_DIALOG ?? '', /isn't responding/);
});
