import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UDID, WDA_BUNDLE } from './fixtures/appium-wire/driver-fixture.js';
import { ANDROID_DEVICE, IOS_DEVICE, SERIAL, androidTarget, iosTarget } from './fixtures/appium-wire/matrix.js';
import { androidScreen, iosScreen, world, worldFixture } from './fixtures/appium-wire/world.js';
import { DeviceReasonError } from '../src/device/index.js';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appiumCaptureDriver, captureCommand, type CaptureRequest } from '../src/capture.js';
import { worldHost } from './fixtures/appium-wire/world-host.js';

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

const captureScreens = { home: androidScreen([{ className: 'android.widget.TextView', text: 'Home', id: 'example.app:id/home', bounds: [16, 100, 216, 140] },
  { className: 'android.widget.EditText', text: '', hint: 'Email', id: 'example.app:id/email', clickable: true, bounds: [16, 160, 300, 200] },
  { className: 'android.widget.Button', text: 'Next', clickable: true, enabled: false, bounds: [16, 220, 120, 260] }]) };
function captures(t: Parameters<typeof worldHost>[0]) {
  const target = androidTarget();
  const w = worldHost(t, { worlds: [world('android', captureScreens)], identityProbe: target.options.identityProbe, adb: target.options.adb, nativeReply: target.nativeReply });
  const projectDir = w.root;
  return { w, projectDir, async run(request: CaptureRequest, defaultDevice?: string) {
    let stdout = ''; let stderr = '';
    const opened = w.opened.length;
    const code = await captureCommand(request, { projectDir, defaultDevice, driver: appiumCaptureDriver(w.host), signal: live(),
      write: { stdout: text => { stdout += text; }, stderr: text => { stderr += text; } } });
    return { code, stdout, stderr, opened: w.opened.slice(opened).map(driver => [driver.target.device, driver.target.platform === 'android' ? driver.target.category : undefined]) };
  } };
}

test('`capture` on the Appium composition: --serial over --avd over JEV_ANDROID_DEVICE, a profile over the environment, one JSON line per element, exit 0 or 3, and no screenshot or Jev request', async t => {
  const c = captures(t);
  const visible = '"state":{"enabled":true,"visible":true}';
  const lines = [`{"role":"text","label":"Home","identifier":"example.app:id/home",${visible}}`,
    `{"role":"text-field","label":"Email","identifier":"example.app:id/email","placeholder":"Email",${visible}}`,
    '{"role":"button","label":"Next","state":{"enabled":false,"visible":true}}'];
  const bySerial = await c.run({ serial: SERIAL, avd: 'Other_AVD' }, 'Env_AVD');
  assert.deepEqual([bySerial.code, bySerial.stdout.split('\n').filter(Boolean), bySerial.stderr, bySerial.opened], [0, lines, '', [[SERIAL, undefined]]]);
  assert.deepEqual((await c.run({}, SERIAL)).opened, [[SERIAL, undefined]], 'the environment names the device when no flag does');
  const byAvd = await c.run({ avd: 'Other_AVD' }, SERIAL);
  assert.deepEqual([byAvd.code, byAvd.stdout, byAvd.opened], [3, '', [['Other_AVD', undefined]]], 'an --avd flag wins over the environment');
  mkdirSync(join(c.projectDir, '.jev'), { recursive: true });
  writeFileSync(join(c.projectDir, '.jev', 'profiles.json'), JSON.stringify({ version: 1, profiles: { phone: { platform: 'android', deviceCategory: 'android-phone', device: SERIAL } } }));
  const byProfile = await c.run({ profile: 'phone' }, 'Env_AVD');
  assert.deepEqual([byProfile.code, byProfile.opened], [0, [[SERIAL, 'android-phone']]]);
  const golden = new Set(['role', 'label', 'value', 'identifier', 'placeholder', 'state', 'selectable']);
  assert.ok(lines.every(line => Object.keys(JSON.parse(line) as object).every(key => golden.has(key))), 'only the fields tests/golden/android-capture.json prints');
  assert.deepEqual(c.w.opened.filter(driver => driver.target.device === SERIAL).map(driver => driver.tools()), Array(3).fill(
    ['appium_session_management', 'jev_settings', 'appium_get_page_source', 'appium_get_page_source', 'appium_session_management']), 'no jev_screen, launch, reset or stop');
  assert.equal(c.w.admission.inspect(ANDROID_DEVICE)!.state, 'available');
});

test('`capture --jev` on the Appium composition prints the Android projection Jev reads, byte for byte, and exits 0', async t => {
  const c = captures(t);
  const result = await c.run({ serial: SERIAL, jev: true });
  assert.deepEqual([result.code, result.stderr], [0, '']);
  assert.equal(result.stdout, ['Current Android screen (full accessibility capture):',
    '{"role":"text","label":"Home","identifier":"example.app:id/home","frame":{"x":16,"y":100,"width":200,"height":40},"state":{"enabled":true,"visible":true}}',
    '{"role":"text-field","placeholder":"Email","identifier":"example.app:id/email","frame":{"x":16,"y":160,"width":284,"height":40},"state":{"enabled":true,"visible":true}}',
    '{"role":"button","label":"Next","frame":{"x":16,"y":220,"width":104,"height":40},"state":{"enabled":false,"visible":true}}'].join('\n'), 'no trailing newline, as a run sends it');
});

test('the installed `capture` command exits 3 with DEVICE_BUSY when automation it does not own holds the phone, and leaves it running', { timeout: 60_000 }, async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'appium-capture-cli-')));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
  const foreign = { serial: SERIAL, local: 'tcp:18300', remote: 'tcp:6790' };
  const { TYPESAFE_API_KEY: _key, JEV_ANDROID_DEVICE: _device, ...inherited } = process.env;
  const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>(done => {
    execFile(process.execPath, ['--import', 'tsx', 'tests/fixtures/appium-wire/cli-entry.ts', root], { timeout: 60_000, env: { ...inherited, JEV_TEST_PLATFORM: 'android',
      JEV_TEST_WORLDS: JSON.stringify([world('android', captureScreens)]), JEV_TEST_CLI_ARGS: JSON.stringify(['capture', '--serial', SERIAL]),
      JEV_TEST_FOREIGN_FORWARDS: JSON.stringify([foreign]) } }, (error, stdout, stderr) => done({ code: error ? (typeof error.code === 'number' ? error.code : null) : 0, stdout, stderr }));
  });
  assert.deepEqual([result.code, result.stdout], [3, '']);
  assert.match(result.stderr, /^DEVICE_BUSY: /m);
  const outcome = JSON.parse(readFileSync(join(root, 'host', 'outcome.json'), 'utf8')) as { tools: string[][]; forwards: unknown[]; writes: unknown[] };
  assert.deepEqual(outcome, { tools: [[]], forwards: [foreign], writes: [] });
});
