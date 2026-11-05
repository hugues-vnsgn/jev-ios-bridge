import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, type TestContext } from 'node:test';
import { readRunEvents } from '../src/log/index.js';
import type { AdbRunner } from '../src/device/android/adb.js';
import { keyboardAreas } from '../src/device/android/keyboard.js';
import { ANDROID_DEVICE, SERIAL, androidTarget, authorized, bridge } from './fixtures/appium-wire/matrix.js';
import { androidScreen, world, worldFixture } from './fixtures/appium-wire/world.js';

const id = (name: string) => `example.app:id/${name}`;
const field = (name: string, bounds: [number, number, number, number]) => ({ className: 'android.widget.EditText', text: '', hint: name, id: id(name), clickable: true, bounds });
/** The probe's fields screen: two fields near the top, one low enough for the soft keyboard to cover. */
const fields = androidScreen([field('plain', [8, 80, 312, 130]), field('password', [8, 170, 312, 230]), field('classic_password', [8, 560, 312, 600])]);
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

function withKeyboard(adb: AdbRunner): AdbRunner {
  return async (args, signal, started) => args.at(-1) === "'dumpsys' 'window' 'InputMethod'" ? { stdout: keyboardShown, stderr: '', exitCode: 0 } : adb(args, signal, started);
}
const tapPoints = (f: ReturnType<typeof worldFixture>) => f.toolCalls().filter(call => call.params!.name === 'appium_perform_actions').map(call => {
  const [move] = (call.params!.arguments!.actions as { actions: { x?: number; y?: number }[] }[])[0]!.actions;
  return [move!.x, move!.y];
});

async function run(t: TestContext, second: string) {
  const phone = androidTarget();
  const f = worldFixture(t, world('android', { fields }), { ...phone.options, adb: withKeyboard(phone.options.adb) }, phone.nativeReply);
  const b = await bridge(t, [f.driver]);
  const tap = (step: string, target: string) => ({ id: step, kind: 'action', guard: { present: [{ identifier: id('plain') }] },
    action: { kind: 'tap', selector: { identifier: id(target) } } });
  const { runId } = await b.service.start({ version: 1, platform: 'android', app: { package: 'example.app', activity: '.Main' }, device: { serial: SERIAL }, values: {},
    steps: [tap('focusPlain', 'plain'), tap('second', second),
      { id: 'shown', kind: 'checkpoint', guard: { present: [{ identifier: id('plain') }] }, assertions: [{ id: 'x', claim: 'The fields are shown.' }] }] });
  const done = await b.finished(runId);
  const errors = (await readRunEvents(b.service.baseDir, runId)).filter(event => event.type === 'error').map(event => [event.data.stepId, event.data.phase, event.data.code]);
  return { f, done, errors };
}

test('on Android, a tap whose target lies under the shown soft keyboard is refused TARGET_UNAVAILABLE before any input, and the device is released', async t => {
  const { f, done, errors } = await run(t, 'classic_password');
  assert.deepEqual([done.report.verdict, done.report.reason], ['inconclusive', 'TARGET_UNAVAILABLE']);
  assert.deepEqual(errors, [['second', 'act', 'TARGET_UNAVAILABLE']]);
  assert.deepEqual(tapPoints(f), [[160, 105]], 'only the first tap, on the plain field above the keyboard, is sent');
  assert.equal(authorized(f.admission, 'run-1')['appium-tap'], 1);
  assert.equal(f.admission.inspect(ANDROID_DEVICE)!.state, 'available');
});

test('on Android, a tap whose target lies above the shown soft keyboard is sent', async t => {
  const { f, done, errors } = await run(t, 'password');
  assert.deepEqual([done.report.verdict, errors], ['passed', []]);
  assert.deepEqual(tapPoints(f), [[160, 105], [160, 200]]);
});

test('the keyboard areas are read from the window manager\'s own dump: none when hidden, its touchable region when shown, unknown when unreadable', () => {
  const read = (name: string) => readFileSync(`tests/fixtures/android-keyboard/${name}.txt`, 'utf8');
  assert.deepEqual(keyboardAreas(read('api36-hidden')), [], 'an invisible window covers nothing, whatever its stale region');
  assert.deepEqual(keyboardAreas(read('api36-shown')), [{ x: 0, y: 682, width: 720, height: 598 }], 'screen coordinates: the IME region 634 plus the window top 48');
  assert.deepEqual(keyboardAreas('WINDOW MANAGER WINDOWS (dumpsys window windows)\n'), [], 'no input-method window');
  assert.equal(keyboardAreas(read('api36-shown').replace(/^ *isVisible=true\n/m, '')), undefined);
  assert.equal(keyboardAreas(read('api36-shown').replace(/^ *touchable region=.*\n/m, '')), undefined);
});
