/**
 * Preservation matrix, Android capture and attach (P3.9). `captureCommand` still builds the legacy Android driver
 * itself, so what the Appium driver can show today is pinned here and the command-level rows are named for P3.10.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UDID, WDA_BUNDLE } from './fixtures/appium-wire/driver-fixture.js';
import { ANDROID_DEVICE, IOS_DEVICE, SERIAL, androidTarget, iosTarget } from './fixtures/appium-wire/matrix.js';
import { androidScreen, iosScreen, world, worldFixture } from './fixtures/appium-wire/world.js';
import { DeviceReasonError } from '../src/device/index.js';

const live = () => AbortSignal.timeout(20_000);
const screens = { home: androidScreen([{ className: 'android.widget.TextView', text: 'Home', id: 'example.app:id/home', bounds: [16, 100, 216, 140] }]) };
const resumed = 'topResumedActivity=ActivityRecord{abc u0 example.app/.Main t1}\n';
function phone(t: Parameters<typeof worldFixture>[0]) {
  const target = androidTarget();
  return worldFixture(t, world('android', screens), target.options, command => command.kind === 'android-foreground' ? resumed : target.nativeReply(command));
}
const busy = (error: unknown) => error instanceof DeviceReasonError && error.code === 'DEVICE_BUSY';

test('a second command against a live bridge owner of the phone is DEVICE_BUSY before any provider call, and the owner runs on untouched', async t => {
  const f = phone(t);
  await f.driver.prepare({ app: { package: 'example.app' }, start: 'attach' }, live());
  const owned = f.calls().length;
  const competing = f.open(world('android', screens));
  await assert.rejects(competing.driver.prepare({ app: { package: 'example.app' }, start: 'attach' }, live()), busy);
  assert.deepEqual(competing.calls(), [], 'the competing command never started a private child');
  assert.equal(f.calls().length, owned);
  assert.equal((await f.driver.observe(live())).elements.find(element => element.identifier === 'example.app:id/home')?.label, 'Home');
  await f.driver.close(live());
  assert.equal(f.admission.inspect(ANDROID_DEVICE)!.state, 'available');
});

test('start attach on Android observes the app already in front with zero launch, reset or stop', async t => {
  const f = phone(t);
  await f.driver.prepare({ app: { package: 'example.app' }, start: 'attach' }, live());
  const snapshot = await f.driver.observe(live());
  assert.deepEqual(snapshot.elements.map(element => [element.role, element.label, element.identifier]), [['text', 'Home', 'example.app:id/home']]);
  await f.driver.close(live());
  assert.deepEqual(f.tools(), ['appium_session_management', 'jev_settings', 'appium_get_page_source', 'jev_screen', 'appium_get_page_source', 'jev_screen', 'appium_session_management'],
    'no jev_start_activity and no jev_terminate_app');
  assert.deepEqual(f.native.calls.map(call => call.command.kind), ['android-keyguard', 'android-foreground'], 'the only native helpers are the read-only probes');
  const capabilities = JSON.parse(String(f.toolCalls()[0]!.params!.arguments!.capabilities)) as Record<string, unknown>;
  assert.deepEqual([capabilities['appium:noReset'], capabilities['appium:autoLaunch'], capabilities['appium:forceAppLaunch'], capabilities['appium:shouldTerminateApp']], [true, false, false, false]);
  assert.equal(f.admission.inspect(ANDROID_DEVICE)!.state, 'available');
});

test('start attach refuses APP_NOT_IN_FOREGROUND when another app is in front, and stops nothing', async t => {
  const target = androidTarget();
  const f = worldFixture(t, world('android', screens), target.options, command => command.kind === 'android-foreground' ? resumed.replace('example.app', 'other.app') : target.nativeReply(command));
  await assert.rejects(f.driver.prepare({ app: { package: 'example.app' }, start: 'attach' }, live()), (error: unknown) => error instanceof DeviceReasonError && error.code === 'APP_NOT_IN_FOREGROUND');
  assert.deepEqual(f.tools(), ['appium_session_management', 'jev_settings', 'appium_session_management']);
  assert.equal(f.admission.inspect(ANDROID_DEVICE)!.state, 'available');
});

test('the Appium driver captures the current screen with no launch, reset, stop or screenshot, as AndroidDriver.capture does', async t => {
    const f = phone(t);
    const capture = Reflect.get(f.driver, 'capture') as unknown;
    assert.equal(typeof capture, 'function', 'a capture entry the capture command can call');
    const snapshot: unknown = await Reflect.apply(capture as (signal: AbortSignal) => Promise<unknown>, f.driver, [live()]);
    await f.driver.close(live());
    assert.equal(Reflect.get(snapshot as object, 'screenshotPath'), undefined);
    assert.deepEqual(f.tools(), ['appium_session_management', 'jev_settings', 'appium_get_page_source', 'appium_get_page_source', 'appium_session_management']);
  });

test('automation the admission store does not own makes the command DEVICE_BUSY before any session, and is left running', async t => {
    const ios = worldFixture(t, world('ios', { home: iosScreen([{ type: 'StaticText', label: 'Home', frame: [16, 100, 200, 40] }]) }), iosTarget);
    ios.fence.wda = [{ udid: UDID, bundleId: WDA_BUNDLE, pid: 999 }];
    await assert.rejects(ios.driver.prepare({ app: { bundleId: 'example.app' } }, live()), busy);
    assert.deepEqual([ios.calls(), ios.fence.effects.filter(effect => effect.kind === 'wda-stop')], [[], []]);
    assert.equal(ios.admission.inspect(IOS_DEVICE)!.state, 'available');
    const android = phone(t);
    android.fence.forwards = [{ serial: SERIAL, local: 'tcp:18300', remote: 'tcp:6790' }];
    await assert.rejects(android.driver.prepare({ app: { package: 'example.app' }, start: 'attach' }, live()), busy);
    assert.deepEqual([android.calls(), android.fence.forwards], [[], [{ serial: SERIAL, local: 'tcp:18300', remote: 'tcp:6790' }]]);
  });

test.todo('P3.10: `jev-ios-bridge capture` on the Appium composition keeps --serial/--avd/--profile precedence, prints exactly the tests/golden/android-capture.json fields, exits 0 or 3, and makes no Jev request and no screenshot');
test.todo('P3.10: `jev-ios-bridge capture --jev` prints renderAssertionState output byte for byte, as tests/android-capture.test.ts pins for the legacy driver');
test.todo('P3.10: captureWithForeignAgent stays exit 3 with `DEVICE_BUSY: ` on stderr and the foreign agent left running (tests/golden/cli-exit-codes.json)');
