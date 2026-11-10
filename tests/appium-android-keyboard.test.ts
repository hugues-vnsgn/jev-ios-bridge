import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, type TestContext } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { readRunEvents } from '../src/log/index.js';
import { adbRunner, type AdbRunner, type AdbSpawn } from '../src/device/android/adb.js';
import { keyboardAreas } from '../src/device/android/keyboard.js';
import { FakeChild } from './fixtures/adb-spawn.js';
import { ANDROID_DEVICE, NO_KEYBOARD_WINDOW, SERIAL, androidTarget, authorized, bridge } from './fixtures/appium-wire/matrix.js';
import { androidScreen, world, worldFixture } from './fixtures/appium-wire/world.js';

const DUMPSYS = "'dumpsys' 'window' 'InputMethod'";
const id = (name: string) => `example.app:id/${name}`;
const field = (name: string, bounds: [number, number, number, number]) => ({ className: 'android.widget.EditText', text: '', hint: name, id: id(name), clickable: true, bounds });
const lower = { className: 'android.widget.ScrollView', id: id('lower'), bounds: [0, 300, 320, 640] as [number, number, number, number] };
/** The probe's fields screen: two fields near the top, one low enough for the soft keyboard to cover, and a list reaching under it. */
const fields = androidScreen([field('plain', [8, 80, 312, 130]), field('password', [8, 170, 312, 230]), field('classic_password', [8, 560, 312, 600]), lower]);
/** `dumpsys window InputMethod` with the keyboard shown over y 400 to 640 of the 320 × 640 screen, in the API 36 format. */
const keyboardShown = [
  'WINDOW MANAGER WINDOWS (dumpsys window windows)',
  '  Window #3 Window{5d1e2a0 u0 InputMethod}:',
  '    mDisplayId=0 rootTaskId=1 mSession=Session{1 2:u0a1} mClient=android.os.BinderProxy@1',
  '    mGivenContentInsets=[0,400][0,0] mGivenVisibleInsets=[0,400][0,0]',
  '    mTouchableInsets=3 mGivenInsetsPending=false',
  '    touchable region=SkRegion((0,400,320,640))',
  '    Frames: parent=[0,0][320,640] display=[0,0][320,640] frame=[0,0][320,640] last=[0,0][320,640] insetsHint=[0,0][0,0]',
  '    isOnScreen=true',
  '    isVisible=true',
].join('\n') + '\n';

function withKeyboard(adb: AdbRunner, dump: (signal: AbortSignal) => Promise<string> = async () => keyboardShown): AdbRunner {
  return async (args, signal, ...rest) => args.at(-1) === DUMPSYS ? { stdout: await dump(signal), stderr: '', exitCode: 0 } : adb(args, signal, ...rest);
}
const tapPoints = (f: ReturnType<typeof worldFixture>) => f.toolCalls().filter(call => call.params!.name === 'appium_perform_actions').map(call => {
  const [move] = (call.params!.arguments!.actions as { actions: { x?: number; y?: number }[] }[])[0]!.actions;
  return [move!.x, move!.y];
});
const tap = (step: string, target: string) => ({ id: step, kind: 'action', guard: { present: [{ identifier: id('plain') }] },
  action: { kind: 'tap', selector: { identifier: id(target) } } });
const swipe = (direction: 'up' | 'down') => ({ id: 'second', kind: 'action', guard: { present: [{ identifier: id('plain') }] },
  action: { kind: 'swipe', selector: { identifier: id('lower') }, direction } });
const shown = { id: 'shown', kind: 'checkpoint', guard: { present: [{ identifier: id('plain') }] }, assertions: [{ id: 'x', claim: 'The fields are shown.' }] };
const script = (steps: object[]) => ({ version: 1, platform: 'android', app: { package: 'example.app', activity: '.Main' }, device: { serial: SERIAL }, values: {}, steps });

async function run(t: TestContext, second: object, adb: (phone: AdbRunner) => AdbRunner = withKeyboard) {
  const phone = androidTarget();
  const f = worldFixture(t, world('android', { fields }), { ...phone.options, adb: adb(phone.options.adb) }, phone.nativeReply);
  const b = await bridge(t, [f.driver]);
  const { runId } = await b.service.start(script([tap('focusPlain', 'plain'), second, shown]));
  const done = await b.finished(runId);
  const errors = (await readRunEvents(b.service.baseDir, runId)).filter(event => event.type === 'error').map(event => [event.data.stepId, event.data.phase, event.data.code]);
  return { f, done, errors };
}

test('on Android, a tap whose target lies under the shown soft keyboard is refused TARGET_UNAVAILABLE before any input, and the device is released', async t => {
  const { f, done, errors } = await run(t, tap('second', 'classic_password'));
  assert.deepEqual([done.report.verdict, done.report.reason], ['inconclusive', 'TARGET_UNAVAILABLE']);
  assert.deepEqual(errors, [['second', 'act', 'TARGET_UNAVAILABLE']]);
  assert.deepEqual(tapPoints(f), [[160, 105]], 'only the first tap, on the plain field above the keyboard, is sent');
  assert.equal(authorized(f.admission, 'run-1')['appium-tap'], 1);
  assert.equal(f.admission.inspect(ANDROID_DEVICE)!.state, 'available');
});

test('on Android, a tap whose target lies above the shown soft keyboard is sent', async t => {
  const { f, done, errors } = await run(t, tap('second', 'password'));
  assert.deepEqual([done.report.verdict, errors], ['passed', []]);
  assert.deepEqual(tapPoints(f), [[160, 105], [160, 200]]);
});

test('on Android, a swipe whose stroke starts on the shown soft keyboard is refused TARGET_UNAVAILABLE before any input', async t => {
  const { f, done, errors } = await run(t, swipe('up'));
  assert.deepEqual([done.report.verdict, done.report.reason], ['inconclusive', 'TARGET_UNAVAILABLE']);
  assert.deepEqual(errors, [['second', 'act', 'TARGET_UNAVAILABLE']]);
  assert.deepEqual(tapPoints(f), [[160, 105]], 'the stroke from y 606, inside the keyboard, is never sent');
  assert.equal(f.admission.inspect(ANDROID_DEVICE)!.state, 'available');
});

test('on Android, a swipe whose stroke starts above the shown soft keyboard is sent', async t => {
  const { f, done, errors } = await run(t, swipe('down'));
  assert.deepEqual([done.report.verdict, errors], ['passed', []]);
  assert.deepEqual(tapPoints(f), [[160, 105], [160, 334]]);
});

test('on Android, a keyboard dump that does not say whether a keyboard is shown refuses the tap as KEYBOARD_UNKNOWN before any input', async t => {
  const phone = androidTarget();
  const f = worldFixture(t, world('android', { fields }), { ...phone.options, adb: withKeyboard(phone.options.adb, async () => '') }, phone.nativeReply);
  const b = await bridge(t, [f.driver]);
  const { runId } = await b.service.start(script([tap('focusPlain', 'plain'), shown]));
  const done = await b.finished(runId);
  const errors = (await readRunEvents(b.service.baseDir, runId)).filter(event => event.type === 'error').map(event => [event.data.stepId, event.data.code, event.data.vendorCode]);
  assert.deepEqual([done.report.verdict, done.report.reason], ['inconclusive', 'DEVICE_ERROR']);
  assert.deepEqual(errors, [['focusPlain', 'DEVICE_ERROR', 'KEYBOARD_UNKNOWN']]);
  assert.deepEqual(tapPoints(f), []);
  assert.equal(f.admission.inspect(ANDROID_DEVICE)!.state, 'available');
});

/** The production adb runner over fake children: each answers as the phone does, except the keyboard read, which hangs until killed. */
function hangingKeyboard(phone: AdbRunner) {
  const reads: FakeChild[] = [];
  const spawn: AdbSpawn = (_file, args) => {
    const child = new FakeChild();
    if (args.at(-1) === DUMPSYS) reads.push(child);
    else void phone([...args], new AbortController().signal).then(reply => { child.exit(reply.exitCode, reply.stdout, reply.stderr); });
    return child;
  };
  return { reads, adb: adbRunner({ adb: '/fake/adb', environment: {}, spawn }) };
}

test('a keyboard read that outlives the step\'s deadline is killed, the run ends on that deadline, the device is released and the next run on it starts', async t => {
  const phone = androidTarget();
  const hanging = hangingKeyboard(phone.options.adb);
  const f = worldFixture(t, world('android', { fields }), { ...phone.options, adb: hanging.adb }, phone.nativeReply);
  const next = f.open(world('android', { fields }));
  const b = await bridge(t, [f.driver, next.driver]);
  const { runId } = await b.service.start(script([tap('focusPlain', 'plain'), shown]), { operationMs: 1000, cleanupMs: 10_000 });
  const done = await b.finished(runId);
  const errors = (await readRunEvents(b.service.baseDir, runId)).filter(event => event.type === 'error').map(event => [event.data.stepId, event.data.phase, event.data.code]);
  assert.deepEqual([done.report.verdict, done.report.reason], ['inconclusive', 'EXECUTION_ERROR']);
  assert.deepEqual(errors, [['focusPlain', 'act', 'EXECUTION_ERROR'], [undefined, 'cleanup', 'EXECUTION_ERROR']]);
  assert.deepEqual(hanging.reads.map(read => read.killedBy), [['SIGKILL']]);
  assert.deepEqual(tapPoints(f), []);
  assert.equal(f.admission.inspect(ANDROID_DEVICE)!.state, 'available');
  const again = await b.service.start(script([shown]));
  assert.deepEqual([(await b.finished(again.runId)).report.verdict], ['passed']);
});

test('a run stopped while the keyboard read is in flight sends no tap after the read answers, and the device is released', async t => {
  const phone = androidTarget();
  let started = false;
  let answer!: (dump: string) => void;
  const held = new Promise<string>(resolve => { answer = resolve; });
  const f = worldFixture(t, world('android', { fields }), { ...phone.options, adb: withKeyboard(phone.options.adb, () => { started = true; return held; }) }, phone.nativeReply);
  const b = await bridge(t, [f.driver]);
  const { runId } = await b.service.start(script([tap('focusPlain', 'plain'), shown]));
  for (let waited = 0; !started && waited < 10_000; waited += 20) await delay(20);
  const cancelled = b.service.cancel(runId);
  answer(NO_KEYBOARD_WINDOW);
  await cancelled;
  const done = await b.finished(runId);
  assert.deepEqual([done.report.verdict, done.report.reason], ['inconclusive', 'CANCELLED']);
  assert.deepEqual(tapPoints(f), [], 'the stop came before the tap was sent');
  assert.equal(authorized(f.admission, 'run-1')['appium-tap'], undefined);
  assert.equal(f.admission.inspect(ANDROID_DEVICE)!.state, 'available');
});

test('the keyboard areas are read from the window manager\'s own dump: none only when it says so, its touchable region when shown, unknown otherwise', () => {
  const read = (name: string) => readFileSync(`tests/fixtures/android-keyboard/${name}.txt`, 'utf8');
  assert.deepEqual(keyboardAreas(read('api36-hidden')), [], 'an invisible window covers nothing, whatever its stale region');
  assert.deepEqual(keyboardAreas(read('api31-hidden')), [], 'the API 31 phone, keyboard hidden');
  assert.deepEqual(keyboardAreas(read('api36-shown')), [{ x: 0, y: 682, width: 720, height: 598 }], 'screen coordinates: the IME region 634 plus the window top 48');
  assert.deepEqual(keyboardAreas(read('api36-shown').replace('u0 InputMethod}:', 'u0 InputMethod EXITING}:')), [{ x: 0, y: 682, width: 720, height: 598 }],
    'a keyboard still animating out still takes touches');
  assert.deepEqual(keyboardAreas(NO_KEYBOARD_WINDOW), [], 'the window manager says no window matches');
  for (const unknown of ['', 'WINDOW MANAGER WINDOWS (dumpsys window windows)\n', 'Can\'t find service: window\n', read('api36-shown').slice(0, 200)])
    assert.equal(keyboardAreas(unknown), undefined, JSON.stringify(unknown.slice(0, 60)));
  assert.equal(keyboardAreas(read('api36-shown').replace(/^ *isVisible=true\n/m, '')), undefined);
  assert.equal(keyboardAreas(read('api36-shown').replace(/^ *touchable region=.*\n/m, '')), undefined);
});
