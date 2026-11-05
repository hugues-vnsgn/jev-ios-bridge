/**
 * Start mode "attach" (Issue 11, E2): a version 2 script with `"start": "attach"` runs from the screen already
 * showing. The run passes the start mode to the driver's `prepare`; the Android driver then skips its restart but
 * still admits the device, checks the app is installed and in front, and starts the log streams. The iOS driver
 * refuses attach with UNSUPPORTED_ACTION before any device work (Issue 14): it can't tell which app is in front.
 */
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import type { DeviceDriver, PrepareScenarioContext, RunEvent, RunLog, Snapshot } from '../src/contracts/index.js';
import type { ScriptedJudge } from '../src/scripted/contracts.js';
import { DeviceReasonError, type DeviceWindowOpener } from '../src/device/index.js';
import { resumedPackage } from '../src/device/attach.js';
import { parseScriptedScenario } from '../src/scripted/schema.js';
import { runScriptedScenario } from '../src/scripted/run.js';
import { SCRIPTED_JEV_MODEL } from '../src/scripted/jev.js';
import { UDID } from './fixtures/appium-wire/driver-fixture.js';
import { ANDROID_DEVICE, IOS_DEVICE, androidTarget, iosTarget } from './fixtures/appium-wire/matrix.js';
import { androidScreen, iosScreen, world, worldFixture, type AndroidPreflight } from './fixtures/appium-wire/world.js';

const live = () => AbortSignal.timeout(20_000);
const reason = (code: string) => (error: unknown) => error instanceof DeviceReasonError && error.code === code;

// ---------------------------------------------------------------------------------------------------------------
// The run: no refusal, the start mode reaches prepare and the started event.

const checkpoint = { id: 'verify', kind: 'checkpoint', guard: { present: [{ role: 'text', label: 'Marker' }] },
  assertions: [{ id: 'shown', claim: 'The marker is visible.' }] };
const iosV1 = { version: 1, app: { bundleId: 'com.example.app' }, values: {}, steps: [checkpoint] };

function recordingLog(): RunLog & { events: RunEvent[] } {
  const events: RunEvent[] = [];
  return { events,
    async append(type, data) { events.push({ version: 1, runId: 'attach', sequence: events.length + 1,
      at: new Date().toISOString(), type, data }); },
    async read() { return events; },
  };
}

const marker: Snapshot = { deviceId: 'sim', capturedAt: Date.now(), expiresAt: Date.now() + 60_000, sequence: 1, truncated: false,
  screenHash: 'screen-a', elements: [{ ref: 'e1', role: 'text', label: 'Marker',
    frame: { x: 0, y: 0, width: 100, height: 20 }, state: { enabled: true, visible: true }, actions: [] }] };

const judge: ScriptedJudge = { async judge() {
  return { probabilities: { shown: 0.99 }, inputTokens: 1, latencyMs: 1, model: SCRIPTED_JEV_MODEL };
} };

function recordingDriver(prepared: PrepareScenarioContext[]): DeviceDriver {
  return {
    async prepare(context) { prepared.push(structuredClone(context)); },
    async observe() { return marker; },
    async act() { throw new Error('unreachable'); },
    async close() {},
  };
}

async function run(script: Record<string, unknown>): Promise<{ prepared: PrepareScenarioContext[]; started: RunEvent; verdict: unknown }> {
  const prepared: PrepareScenarioContext[] = [];
  const log = recordingLog();
  const report = await runScriptedScenario({ runId: 'attach', scenario: parseScriptedScenario(script), driver: recordingDriver(prepared), log, judge });
  return { prepared, started: log.events.find(event => event.type === 'started')!, verdict: report.verdict };
}

test('a version 2 script with start: attach runs, and prepare and the started event get the start mode', async () => {
  const { prepared, started, verdict } = await run({ ...iosV1, version: 2, start: 'attach' });
  assert.equal(verdict, 'passed');
  assert.deepEqual(prepared, [{ app: { bundleId: 'com.example.app' }, start: 'attach' }]);
  assert.equal(started.data.start, 'attach');
});

test('an explicit start: restart reaches prepare and the started event as restart', async () => {
  const { prepared, started } = await run({ ...iosV1, version: 2, start: 'restart' });
  assert.deepEqual(prepared, [{ app: { bundleId: 'com.example.app' }, start: 'restart' }]);
  assert.equal(started.data.start, 'restart');
});

test('a script with no start passes prepare no start mode and records none, exactly as before', async () => {
  const { prepared, started } = await run(iosV1);
  assert.deepEqual(prepared, [{ app: { bundleId: 'com.example.app' } }]);
  assert.equal(Object.hasOwn(started.data, 'start'), false);
});

test('an Android attach script passes the start mode too', async () => {
  const { prepared } = await run({ version: 2, platform: 'android', app: { package: 'com.example.android' }, values: {},
    start: 'attach', steps: [checkpoint] });
  assert.deepEqual(prepared, [{ app: { package: 'com.example.android' }, start: 'attach' }]);
});

// ---------------------------------------------------------------------------------------------------------------
// Android on the Appium driver: the checks attach makes before it reads the screen.

/** `dumpsys activity activities` on API 31, cut to the lines that name what is resumed. */
const activities = (front: string) => [
  'ACTIVITY MANAGER ACTIVITIES (dumpsys activity activities)',
  'Display #0 (activities from top to bottom):',
  `  * Task{8d1c2a1 #12 type=standard A=10226:${front} U=0 visible=true mode=fullscreen translucent=false sz=1}`,
  `    * Hist #0: ActivityRecord{6b9e1c4 u0 ${front}/.MainActivity t12}`,
  `  ResumedActivity:ActivityRecord{6b9e1c4 u0 ${front}/.MainActivity t12}`,
  '',
  ` topResumedActivity=ActivityRecord{6b9e1c4 u0 ${front}/.MainActivity t12}`,
  '',
].join('\n');
const policy = (showing: boolean, awake: boolean) =>
  `WINDOW MANAGER POLICY STATE\n    KeyguardServiceDelegate\n      showing=${String(showing)}\n      interactiveState=INTERACTIVE_STATE_${awake ? 'AWAKE' : 'SLEEP'}\n`;
const androidAttach = { app: { package: 'example.app' }, start: 'attach' } as const;
const home = world('android', { home: androidScreen([{ className: 'android.widget.TextView', text: 'Home', bounds: [16, 100, 216, 140] }]) });

/** A phone whose screen starts `asleep` or `locked`, and whose resumed activity is `front`'s. */
function phone(t: TestContext, options: { front?: string; asleep?: boolean; locked?: boolean; preflight?: AndroidPreflight } = {}) {
  const target = androidTarget({ state: 'device', ...options.preflight });
  let awake = !options.asleep;
  const f = worldFixture(t, home, target.options, command => {
    if (command.kind === 'android-keyguard') return policy(options.locked ?? false, awake);
    if (command.kind === 'android-wake') { awake = true; return ''; }
    if (command.kind === 'android-foreground') return options.front === undefined ? 'ACTIVITY MANAGER ACTIVITIES (dumpsys activity activities)\n' : activities(options.front);
    return target.nativeReply(command);
  });
  return { ...f, helpers: () => f.native.calls.map(call => call.command.kind) };
}

test('Android attach wakes a sleeping screen before its foreground check, and refuses a locked one before either', async t => {
  const asleep = phone(t, { front: 'example.app', asleep: true });
  await asleep.driver.prepare(androidAttach, live());
  assert.deepEqual(asleep.helpers(), ['android-keyguard', 'android-wake', 'android-keyguard', 'android-foreground']);
  await asleep.driver.close(live());
  const locked = phone(t, { front: 'example.app', asleep: true, locked: true });
  await assert.rejects(locked.driver.prepare(androidAttach, live()), reason('DEVICE_LOCKED'));
  assert.deepEqual([locked.helpers(), locked.tools()], [['android-keyguard'], []]);
  assert.equal(locked.admission.inspect(ANDROID_DEVICE)!.state, 'available');
});

test('Android attach refuses when no activity is resumed, and stops nothing', async t => {
  const f = phone(t);
  await assert.rejects(f.driver.prepare(androidAttach, live()), (error: unknown) => reason('APP_NOT_IN_FOREGROUND')(error) && /example\.app/.test((error as Error).message));
  assert.deepEqual(f.tools(), ['appium_session_management', 'jev_settings', 'appium_session_management'], 'no jev_terminate_app and no jev_start_activity');
  assert.equal(f.admission.inspect(ANDROID_DEVICE)!.state, 'available');
});

test('Android attach refuses an app that isn\'t installed with APP_NOT_INSTALLED, before the foreground check or any session', async t => {
  const f = phone(t, { front: 'example.app', preflight: { installed: ['other.app'] } });
  await assert.rejects(f.driver.prepare(androidAttach, live()), reason('APP_NOT_INSTALLED'));
  assert.deepEqual([f.helpers(), f.tools()], [[], []]);
  assert.equal(f.admission.inspect(ANDROID_DEVICE)!.state, 'available');
});

test('the resumed package is read from topResumedActivity, else from a ResumedActivity line', () => {
  assert.equal(resumedPackage(activities('com.example.android')), 'com.example.android');
  assert.equal(resumedPackage('  mResumedActivity: ActivityRecord{1a2b u0 com.old.style/.Main t3}\n'), 'com.old.style');
  assert.equal(resumedPackage(' topResumedActivity=ActivityRecord{1 u0 com.top/.A t1}\n  ResumedActivity:ActivityRecord{2 u0 com.other/.B t2}\n'), 'com.top');
  assert.equal(resumedPackage('nothing resumed\n'), undefined);
});

// ---------------------------------------------------------------------------------------------------------------
// iOS on the Appium driver: attach is refused before any device work.

const iosAttach = { app: { bundleId: 'example.app' }, start: 'attach' } as const;

function simulator(t: TestContext) {
  const windows: string[] = [];
  const deviceWindow: DeviceWindowOpener = async udid => { windows.push(udid); };
  const f = worldFixture(t, world('ios', { home: iosScreen([{ type: 'StaticText', name: 'home', label: 'Marker', frame: [16, 100, 200, 40] }]) }), { ...iosTarget, deviceWindow });
  return { ...f, windows };
}

test('iOS attach is refused with UNSUPPORTED_ACTION before any device command, admission or window', async t => {
  const f = simulator(t);
  await assert.rejects(f.driver.prepare(iosAttach, live()), (error: unknown) => reason('UNSUPPORTED_ACTION')(error) && /Android/.test((error as Error).message));
  assert.deepEqual([f.tools(), f.native.calls, f.windows], [[], [], []], 'no Appium call, no simulator command, no window');
  assert.equal(f.admission.inspect(IOS_DEVICE), undefined, 'no admission');
  assert.equal(f.driver.appRunning(), undefined);
  assert.deepEqual(f.driver.logSources(), {});
});

test('an iOS attach run ends INCONCLUSIVE with UNSUPPORTED_ACTION and never touches the simulator', async t => {
  const f = simulator(t);
  const report = await runScriptedScenario({ runId: 'attach', log: recordingLog(), judge, driver: f.driver,
    scenario: parseScriptedScenario({ ...iosV1, app: { bundleId: 'example.app' }, version: 2, start: 'attach', device: { udid: UDID } }) });
  assert.deepEqual([report.verdict, report.reason], ['inconclusive', 'UNSUPPORTED_ACTION']);
  assert.deepEqual([f.tools(), f.native.calls], [[], []]);
});
