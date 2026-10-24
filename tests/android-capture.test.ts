import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { captureCommand, type CaptureRequest, type CaptureSelection } from '../src/capture.js';
import { createDeviceAgreement } from '../src/device/factory.js';
import { DeviceReasonError } from '../src/device/index.js';
import { DeviceAgentError, type AndroidNode } from '../src/device/android/agent-client.js';
import { PINNED_AGENT_SHA256 } from '../src/device/android/agent-supply.js';
import { AGENT_START_COMMAND, AndroidDriver, type AndroidDriverOptions } from '../src/device/android/driver.js';
import { mapAndroidTree } from '../src/device/android/mapping.js';
import { AGENT_CACHE, fakeAndroidAdmission, FakeAdb, fakeAgents, fakeClock, FakeStreams, type FakeEmulator } from './fixtures/android-device.js';
import { checkGolden } from './fixtures/golden.js';

/**
 * The `capture` command (release spec phase 6 item 1): the Android driver's capture-only path, and the
 * CLI's capture path, over the fake `adb`, the fake device agent client and a temporary lease root,
 * replaying phase 4's capture fixtures.
 */

const ANDROID = join(import.meta.dirname, 'fixtures', 'android');
type Hierarchy = AndroidNode[];
const captureOf = async (screen: string): Promise<Hierarchy> => (JSON.parse((JSON.parse(
  await readFile(join(ANDROID, 'captures', `${screen}.json`), 'utf8')) as { data: { rawData: string } }).data.rawData) as { hierarchy: Hierarchy }).hierarchy;
const judgedText = (screen: string) => readFile(join(ANDROID, 'observations', `${screen}.txt`), 'utf8');
const captureGolden = join(import.meta.dirname, 'golden', 'android-capture.json');

const legacy = (parts: Omit<AndroidDriverOptions, 'device' | 'defaultDevice'>) => (selection: CaptureSelection) =>
  new AndroidDriver({ ...parts, profile: selection.profile, device: selection.device, defaultDevice: selection.defaultDevice,
    ...(selection.category ? { category: selection.category } : {}) });
/** The screens the CLI's capture path replays: between them, every field `capture` prints. */
const SCREENS = ['settings-2-display', 'cmp-3-number-input'];
const PRINTED_FIELDS = ['role', 'label', 'value', 'identifier', 'placeholder', 'state', 'selectable'];

const api31 = (overrides: Partial<FakeEmulator> = {}): FakeEmulator => ({ serial: 'emulator-5554', avd: 'jev-actions-api31', ...overrides });
const signal = () => new AbortController().signal;
const deadPid = () => spawnSync(process.execPath, ['-e', '0']).pid!;
const reason = (code: string) => (error: unknown) => {
  assert.ok(error instanceof DeviceReasonError, `a DeviceReasonError, not ${String(error)}`);
  assert.equal(error.code, code);
  return true;
};
const START = ['-s', 'emulator-5554', 'shell', AGENT_START_COMMAND];

interface Setup {
  adb: FakeAdb;
  root: string;
  agents: ReturnType<typeof fakeAgents>;
  streams: FakeStreams;
  /** The driver's injected parts: everything but the device name. */
  parts: Omit<AndroidDriverOptions, 'device' | 'defaultDevice'>;
}

/** The fakes for one test, with a temporary lease root; afterwards, checks no command ran `pkill` or mobilecli. */
async function withFakes(adb: FakeAdb, fn: (setup: Setup) => Promise<void>, screens: Hierarchy[] = [[]]): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'jev-android-capture-'));
  const agents = fakeAgents(adb, { screens });
  const streams = new FakeStreams(adb);
  const ports = [49526, 49527, 49528];
  const parts: Setup['parts'] = { admission: fakeAndroidAdmission(root), fakeBackend: true, runner: adb.run, agentClient: agents.agentClient, clock: fakeClock(), leaseRoot: root,
    freePort: async () => ports.shift()!, logcat: streams, logFolder: root,
    tools: async () => ({ adb: '/sdk/platform-tools/adb', agent: { path: AGENT_CACHE, sha256: PINNED_AGENT_SHA256 } }) };
  try {
    await fn({ adb, root, agents, streams, parts });
  } finally {
    for (const call of adb.calls) {
      assert.doesNotMatch(call.join(' '), /pkill|killall/);
      assert.ok(!call.some(arg => /(^|\/)mobilecli(-darwin-\w+)?$/.test(arg)), `mobilecli run: ${call.join(' ')}`);
    }
    await rm(root, { recursive: true, force: true });
  }
}

/** Whether any `adb` command restarted or stopped the app. */
const touchedApp = (adb: FakeAdb) => adb.shell().some(words => words[0] === 'am' || words[0] === 'pm' && words[1] === 'path');

test('capture selects a profile over the environment and checks a serial flag against the profile AVD live before device work', async () => {
  await withFakes(new FakeAdb(api31(), api31({ serial: 'emulator-5556', avd: 'other-avd' })), async ({ adb, root, parts }) => {
    await mkdir(join(root, '.jev'));
    await writeFile(join(root, '.jev/profiles.json'), JSON.stringify({ version: 1, defaultProfile: 'pixel', profiles: {
      pixel: { platform: 'android', deviceCategory: 'android-emulator', device: 'jev-actions-api31' },
    } }));
    let stderr = '';
    const context = { projectDir: root, defaultDevice: 'Invalid_environment_AVD', driver: legacy(parts), signal: signal(),
      agreeDevices: createDeviceAgreement({ probe: adb.identityProbe }),
      write: { stdout() {}, stderr: (text: string) => { stderr += text; } } };
    assert.equal(await captureCommand({ profile: 'pixel', serial: 'emulator-5556' }, context), 3);
    assert.deepEqual(stderr.split(/\r?\n/).filter(line => line.startsWith('PROFILE_CONFLICT:')),
      ['PROFILE_CONFLICT: Capture device flags conflict with the selected profile.']);
    assert.equal(adb.calls.length, 0);
    assert.equal(await captureCommand({ profile: 'pixel', serial: 'emulator-5554' }, context), 0);
    assert.equal(touchedApp(adb), false);
    assert.equal(await captureCommand({}, context), 0);
    assert.ok(adb.probeCalls.some(args => args.join(' ') === 'devices -l'));
    assert.equal(touchedApp(adb), false);
  });
});

test('capture with a phone profile refuses an emulator transport of that name before device work', async () => {
  await withFakes(new FakeAdb(api31()), async ({ adb, root, parts }) => {
    await mkdir(join(root, '.jev'));
    await writeFile(join(root, '.jev/profiles.json'), JSON.stringify({ version: 1, profiles: {
      phone: { platform: 'android', deviceCategory: 'android-phone', device: 'emulator-5554' },
    } }));
    let stderr = '';
    const context = { projectDir: root, driver: legacy(parts), signal: signal(), write: { stdout() {}, stderr: (text: string) => { stderr += text; } } };
    assert.equal(await captureCommand({ profile: 'phone' }, context), 3);
    assert.match(stderr, /^DEVICE_NOT_FOUND: /m);
    assert.equal(adb.calls.length, 0);
  });
});

test('capture ignores an iOS default, but an explicit iOS profile refuses before device work', async () => {
  await withFakes(new FakeAdb(api31()), async ({ adb, root, parts, agents }) => {
    await mkdir(join(root, '.jev'));
    await writeFile(join(root, '.jev/profiles.json'), JSON.stringify({ version: 1, defaultProfile: 'ios', profiles: {
      ios: { platform: 'ios', deviceCategory: 'ios-simulator', device: 'ABCDEF00-0000-4000-8000-000000000001' },
    } }));
    let stderr = '';
    const context = { projectDir: root, defaultDevice: 'jev-actions-api31', driver: legacy(parts), signal: signal(),
      write: { stdout() {}, stderr: (text: string) => { stderr += text; } } };
    assert.equal(await captureCommand({ profile: 'ios' }, context), 3);
    assert.deepEqual(stderr.split(/\r?\n/).filter(line => line.startsWith('PROFILE_CONFLICT:')),
      ['PROFILE_CONFLICT: Capture requires an Android profile; the selected profile is iOS.']);
    assert.deepEqual(adb.calls, []);
    stderr = '';
    assert.equal(await captureCommand({}, context), 0);
    assert.equal(stderr, '');
    assert.deepEqual(agents.calls.map(call => call.method), ['device.dump.ui', 'device.dump.ui']);
    assert.equal(touchedApp(adb), false);
    assert.deepEqual(adb.forwards, []);
    assert.equal(adb.emulators.get('emulator-5554')!.agents!.size, 0);
  });
});

test('capture applies profile operation and cleanup budgets to a stalled screen read', { timeout: 30_000 }, async t => {
  const deadlines = new Map<number, AbortController>();
  t.mock.method(AbortSignal, 'timeout', (ms: number) => {
    const controller = new AbortController();
    deadlines.set(ms, controller);
    return controller.signal;
  });
  await withFakes(new FakeAdb(api31()), async ({ adb, root, parts, agents }) => {
    await mkdir(join(root, '.jev'));
    await writeFile(join(root, '.jev/profiles.json'), JSON.stringify({ version: 1, defaultProfile: 'pixel', profiles: {
      pixel: { platform: 'android', deviceCategory: 'android-emulator', device: 'jev-actions-api31',
        budgets: { operationMs: 1000, cleanupMs: 2000 } },
    } }));
    let operationSignal: AbortSignal | undefined;
    let stderr = '';
    let stdout = '';
    const driver = { ...parts, agentClient: (port: number) => ({ ...agents.agentClient(port),
      async dumpUi(_wait: number, signal: AbortSignal): Promise<AndroidNode[]> {
        operationSignal = signal;
        assert.ok(deadlines.has(1000), 'profile operation budget reaches the timeout');
        deadlines.get(1000)!.abort(new DOMException('Operation timed out', 'TimeoutError'));
        return new Promise((_, reject) => {
          if (signal.aborted) reject(signal.reason);
          else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
      },
    }) };
    const keepAlive = setTimeout(() => {}, 30_000);
    try {
      assert.equal(await captureCommand({}, { projectDir: root, driver: legacy(driver), signal: signal(),
        write: { stdout: text => { stdout += text; }, stderr: text => { stderr += text; } } }), 3);
      assert.equal(operationSignal?.aborted, true);
      assert.equal(stdout, '');
      assert.match(stderr, /^[A-Z_]+: .+\n$/);
      assert.doesNotMatch(stderr, /CLEANUP_FAILED/);
      assert.equal(touchedApp(adb), false);
      assert.equal(adb.emulators.get('emulator-5554')!.agents!.size, 0);
      assert.deepEqual(adb.forwards, []);
      assert.deepEqual((await readdir(root)).filter(name => name !== 'admission'), ['.jev']);
    } finally { clearTimeout(keepAlive); }
  });
});

test('capture cleanup uses the profile deadline and retains the lease when fencing stalls', { timeout: 30_000 }, async t => {
  const deadlines = new Map<number, AbortController>();
  t.mock.method(AbortSignal, 'timeout', (ms: number) => {
    const controller = new AbortController();
    deadlines.set(ms, controller);
    return controller.signal;
  });
  await withFakes(new FakeAdb(api31()), async ({ adb, root, parts }) => {
    await mkdir(join(root, '.jev'));
    await writeFile(join(root, '.jev/profiles.json'), JSON.stringify({ version: 1, profiles: {
      pixel: { platform: 'android', deviceCategory: 'android-emulator', device: 'jev-actions-api31',
        budgets: { operationMs: 2000, cleanupMs: 1000 } },
    } }));
    let cleanupSignal: AbortSignal | undefined;
    let stderr = '';
    let stdout = '';
    const driver = { ...parts, runner: async (...args: Parameters<typeof adb.run>) => {
      if (args[0][3] === "'kill' '7001'") {
        cleanupSignal = args[1];
        assert.ok(deadlines.has(1000), 'profile cleanup budget reaches the timeout');
        deadlines.get(1000)!.abort(new DOMException('Cleanup timed out', 'TimeoutError'));
        return new Promise<Awaited<ReturnType<typeof adb.run>>>((_, reject) => {
          if (args[1].aborted) reject(args[1].reason);
          else args[1].addEventListener('abort', () => reject(args[1].reason), { once: true });
        });
      }
      return adb.run(...args);
    } };
    const keepAlive = setTimeout(() => {}, 30_000);
    try {
      assert.equal(await captureCommand({ profile: 'pixel' }, { projectDir: root, driver: legacy(driver), signal: signal(),
        write: { stdout: text => { stdout += text; }, stderr: text => { stderr += text; } } }), 3);
      assert.equal(cleanupSignal?.aborted, true);
      assert.equal(stdout, '');
      assert.match(stderr, /^CLEANUP_FAILED: .+\n$/);
      assert.equal(touchedApp(adb), false);
      assert.equal(adb.emulators.get('emulator-5554')!.agents!.size, 1);
      assert.deepEqual((await readdir(root)).filter(name => name !== 'admission'), ['.jev', 'JEV-ACTIONS-API31.lock']);
    } finally { clearTimeout(keepAlive); }
  });
});

/* The driver's capture-only path. */

test('capture runs prepare\'s parts in order without the restart or the streams, then returns one settled snapshot with no screenshot', async () => {
  const tree = await captureOf('settings-2-display');
  await withFakes(new FakeAdb(api31()), async ({ adb, root, agents, streams, parts }) => {
    const driver = new AndroidDriver({ ...parts, device: { serial: 'emulator-5554' } });
    const snapshot = await driver.capture(signal());
    assert.deepEqual(adb.calls, [
      ['-s', 'emulator-5554', 'shell', "'ps' '-A' '-o' 'PID,NAME,ARGS'"],
      ['forward', '--list'],
      ['-s', 'emulator-5554', 'shell', "'getprop' 'ro.build.version.sdk'"],
      ['-s', 'emulator-5554', 'shell', "'getprop' 'sys.boot_completed'"],
      ['-s', 'emulator-5554', 'shell', "'dumpsys' 'window' 'policy'"],
      ['-s', 'emulator-5554', 'push', AGENT_CACHE, '/data/local/tmp/jev-ios-bridge-agent.dex'],
      START,
      ['-s', 'emulator-5554', 'shell', "'ps' '-A' '-o' 'PID,NAME,ARGS'"],
      ['-s', 'emulator-5554', 'shell', "'cat' '/proc/7001/environ'"],
      ['-s', 'emulator-5554', 'shell', "'cat' '/proc/7001/stat'"],
      ['-s', 'emulator-5554', 'forward', 'tcp:49526', 'localabstract:mobilecli-server'],
      ['-s', 'emulator-5554', 'shell', "'ps' '-A' '-o' 'PID,NAME,ARGS'"],
      ['-s', 'emulator-5554', 'shell', "'cat' '/proc/7001/environ'"],
    ]);
    assert.deepEqual(agents.calls.map(call => call.method), ['device.dump.ui', 'device.dump.ui'], 'the settle rule, and no screenshot');
    assert.equal(streams.streams.length, 0, 'no logcat stream, though a log folder was given');
    assert.deepEqual(snapshot.elements, mapAndroidTree({ hierarchy: tree }));
    assert.equal(snapshot.deviceId, 'emulator-5554');
    assert.equal(snapshot.screenshotPath, undefined);
    assert.equal(snapshot.settled, undefined);
    assert.equal(snapshot.logTails, undefined);
    assert.deepEqual((await readdir(root)).filter(name => name !== 'admission'), ['JEV-ACTIONS-API31.lock'], 'the lease is held until close');
  }, [tree]);
});

test('close after capture fences the agent, removes the forward and releases the lease, and never stops the app', async () => {
  await withFakes(new FakeAdb(api31()), async ({ adb, root, parts }) => {
    const driver = new AndroidDriver({ ...parts, device: { avd: 'jev-actions-api31' } });
    await driver.capture(signal());
    const before = adb.calls.length;
    await driver.close(signal());
    assert.deepEqual(adb.calls.slice(before), [
      ['-s', 'emulator-5554', 'shell', "'cat' '/proc/7001/stat'"],
      ['-s', 'emulator-5554', 'shell', "'cat' '/proc/7001/environ'"],
      ['-s', 'emulator-5554', 'shell', "'kill' '7001'"],
      ['-s', 'emulator-5554', 'shell', "'cat' '/proc/7001/environ'"],
      ['-s', 'emulator-5554', 'shell', "'cat' '/proc/7001/stat'"],
      ['-s', 'emulator-5554', 'forward', '--remove', 'tcp:49526'],
      ['forward', '--list'],
    ]);
    assert.equal(touchedApp(adb), false);
    assert.equal(adb.emulators.get('emulator-5554')!.agents!.size, 0, 'no agent left');
    assert.deepEqual(adb.forwards, [], 'no forward left');
    assert.deepEqual((await readdir(root)).filter(name => name !== 'admission'), [], 'lease released');
  });
});

test('capture holds the device lease: a live holder is DEVICE_BUSY, and nothing touches the device', async () => {
  await withFakes(new FakeAdb(api31()), async ({ adb, root, parts }) => {
    await writeFile(join(root, 'JEV-ACTIONS-API31.lock'), JSON.stringify({ pid: process.pid, token: 'live', deviceId: 'jev-actions-api31' }));
    const driver = new AndroidDriver({ ...parts, device: { avd: 'jev-actions-api31' } });
    await assert.rejects(driver.capture(signal()), reason('DEVICE_BUSY'));
    assert.deepEqual(adb.shell().map(words => words.join(' ')), []);
    assert.ok(adb.probeCalls.some(args => args.at(-1) === 'ro.boot.qemu.avd_name'));
  });
});

test('capture refuses on a foreign agent, leaves it and its forward alone, and releases the lease', async () => {
  const adb = new FakeAdb(api31({ agents: new Map([[4984, 'foreign']]) }));
  adb.forwards = [{ serial: 'emulator-5554', local: 'tcp:61000', remote: 'localabstract:mobilecli-server' }];
  await withFakes(adb, async ({ root, parts }) => {
    const driver = new AndroidDriver({ ...parts, device: { avd: 'jev-actions-api31' } });
    await assert.rejects(driver.capture(signal()), reason('DEVICE_BUSY'));
    await driver.close(signal());
    assert.ok(adb.emulators.get('emulator-5554')!.agents!.has(4984), 'the foreign agent keeps running');
    assert.equal(adb.shell().some(words => words[0] === 'kill'), false);
    assert.equal(adb.forwards.length, 1);
    assert.deepEqual((await readdir(root)).filter(name => name !== 'admission'), []);
  });
});

test('capture refuses an unknown legacy marker without sweeping its listed components', async () => {
  const adb = new FakeAdb(api31({ agents: new Map([[4675, 'own']]) }));
  adb.forwards = [{ serial: 'emulator-5554', local: 'tcp:65436', remote: 'localabstract:mobilecli-server' }];
  await withFakes(adb, async ({ root, streams, parts }) => {
    streams.mac.set(5001, '/sdk/platform-tools/adb -s emulator-5554 logcat -b events');
    await writeFile(join(root, 'JEV-ACTIONS-API31.lock'), JSON.stringify({ pid: deadPid(), token: 'crashed', deviceId: 'jev-actions-api31',
      ownedProcesses: ['agent emulator-5554 4675', 'forward emulator-5554 tcp:65436', 'logcat emulator-5554 5001'] }));
    const driver = new AndroidDriver({ ...parts, device: { avd: 'jev-actions-api31' } });
    await assert.rejects(driver.capture(signal()), reason('DEVICE_BUSY'));
    assert.deepEqual(streams.killed, []);
    assert.equal(adb.shell().some(words => words[0] === 'kill'), false);
    assert.equal(adb.forwards.length, 1);
    assert.deepEqual((await readdir(root)).filter(name => name !== 'admission'), ['JEV-ACTIONS-API31.lock']);
  });
});

test('capture wakes a screen that is only off, and refuses a locked one', async () => {
  await withFakes(new FakeAdb(api31({ awake: false })), async ({ adb, parts }) => {
    await new AndroidDriver({ ...parts, device: { avd: 'jev-actions-api31' } }).capture(signal());
    assert.ok(adb.shell().some(words => words.join(' ') === 'input keyevent KEYCODE_WAKEUP'));
  });
  await withFakes(new FakeAdb(api31({ keyguard: true })), async ({ parts }) => {
    await assert.rejects(new AndroidDriver({ ...parts, device: { avd: 'jev-actions-api31' } }).capture(signal()), reason('DEVICE_LOCKED'));
  });
});

test('a driver that captured can\'t capture or prepare again', async () => {
  await withFakes(new FakeAdb(api31()), async ({ parts }) => {
    const driver = new AndroidDriver({ ...parts, device: { avd: 'jev-actions-api31' } });
    await driver.capture(signal());
    await assert.rejects(driver.capture(signal()), /already prepared/);
    await assert.rejects(driver.prepare({ app: { package: 'com.example.android' } }, signal()), /already prepared/);
    await driver.close(signal());
  });
});

test('capture interrupted just after the agent start retains quarantine without a recorded agent incarnation', async () => {
  await withFakes(new FakeAdb(api31()), async ({ adb, root, parts }) => {
    const interrupt = new AbortController();
    adb.onCall = args => { if (args.join(' ') === START.join(' ')) interrupt.abort(new Error('SIGINT')); };
    const driver = new AndroidDriver({ ...parts, device: { avd: 'jev-actions-api31' } });
    await assert.rejects(driver.capture(interrupt.signal), /SIGINT/);
    assert.deepEqual((await readdir(root)).filter(name => name !== 'admission'), ['JEV-ACTIONS-API31.lock'], 'the lease is kept for close');
    adb.onCall = undefined;
    await assert.rejects(driver.close(signal()), reason('UI_ACTION_UNCONFIRMED'));
    assert.equal(adb.shell().some(words => words[0] === 'kill'), false);
    assert.equal(adb.emulators.get('emulator-5554')!.agents!.size, 1);
    assert.deepEqual((await readdir(root)).filter(name => name !== 'admission'), ['JEV-ACTIONS-API31.lock']);
  });
});

test('capture whose adb forward fails keeps the lease for close, which fences the agent and releases it', async () => {
  const adb = new FakeAdb(api31());
  adb.busyPorts = new Set([49526, 49527, 49528]);
  await withFakes(adb, async ({ root, parts }) => {
    const driver = new AndroidDriver({ ...parts, device: { avd: 'jev-actions-api31' } });
    await assert.rejects(driver.capture(signal()), /could not forward/);
    assert.deepEqual((await readdir(root)).filter(name => name !== 'admission'), ['JEV-ACTIONS-API31.lock'], 'the lease is kept for close');
    await driver.close(signal());
    assert.ok(adb.shell().some(words => words.join(' ') === 'kill 7001'), 'close fenced the agent');
    assert.equal(adb.emulators.get('emulator-5554')!.agents!.size, 0, 'no agent left');
    assert.deepEqual(adb.forwards, []);
    assert.deepEqual((await readdir(root)).filter(name => name !== 'admission'), [], 'lease released');
  });
});

/* The CLI's capture path. */

interface Printed { code: number; stdout: string; stderr: string }

async function capture(request: CaptureRequest, setup: Setup, options: { defaultDevice?: string; signal?: AbortSignal } = {}): Promise<Printed> {
  let stdout = '';
  let stderr = '';
  const code = await captureCommand(request, { defaultDevice: options.defaultDevice, driver: legacy(setup.parts), signal: options.signal ?? signal(),
    write: { stdout: text => { stdout += text; }, stderr: text => { stderr += text; } } });
  return { code, stdout, stderr };
}

test('golden: capture prints each element of a replayed capture as one JSON line, and leaves the device as it found it', async () => {
  const printed: Record<string, unknown[]> = {};
  for (const screen of SCREENS) {
    const tree = await captureOf(screen);
    await withFakes(new FakeAdb(api31()), async setup => {
      const { code, stdout, stderr } = await capture({ avd: 'jev-actions-api31' }, setup);
      assert.equal(code, 0);
      assert.equal(stderr, '');
      assert.ok(stdout.endsWith('\n'));
      const lines = stdout.slice(0, -1).split('\n');
      assert.equal(lines.length, mapAndroidTree({ hierarchy: tree }).length, 'one line per element, in snapshot order');
      printed[screen] = lines.map(line => JSON.parse(line));
      for (const line of printed[screen]!) {
        const fields = line as Record<string, unknown>;
        assert.deepEqual(Object.keys(fields).filter(key => !PRINTED_FIELDS.includes(key)), [], 'no ref or internal field');
        assert.ok(Object.values(fields).every(value => value !== null && value !== undefined), 'absent fields are left out');
      }
      assert.equal(touchedApp(setup.adb), false, 'no am force-stop, no am start');
      assert.equal(setup.adb.emulators.get('emulator-5554')!.agents!.size, 0, 'the agent fenced');
      assert.deepEqual(setup.adb.forwards, [], 'the forward removed');
      assert.deepEqual((await readdir(setup.root)).filter(name => name !== 'admission'), [], 'the lease released');
    }, [tree]);
  }
  const lifted = Object.values(printed).flat().filter(line => (line as { selectable?: unknown }).selectable !== undefined);
  assert.ok(lifted.length > 0 && lifted.every(line => (line as { selectable?: unknown }).selectable === false));
  await checkGolden(captureGolden, printed);
});

test('capture --jev prints Jev\'s text for the screen, byte for byte the fixture\'s judged text', async () => {
  for (const screen of SCREENS) {
    await withFakes(new FakeAdb(api31()), async setup => {
      const { code, stdout, stderr } = await capture({ avd: 'jev-actions-api31', jev: true }, setup);
      assert.equal(code, 0);
      assert.equal(stderr, '');
      assert.equal(stdout, await judgedText(screen));
      assert.equal(touchedApp(setup.adb), false);
      assert.deepEqual((await readdir(setup.root)).filter(name => name !== 'admission'), []);
    }, [await captureOf(screen)]);
  }
});

test('capture picks --serial over --avd, then JEV_ANDROID_DEVICE', async () => {
  const two = () => {
    const adb = new FakeAdb(api31(), api31({ serial: 'emulator-5556', avd: 'Medium_Phone_API_36.1' }));
    return adb;
  };
  const target = (adb: FakeAdb) => adb.calls.find(call => call[1] === 'push' || call[2] === 'push')?.[1];
  await withFakes(two(), async setup => {
    assert.equal((await capture({ serial: 'emulator-5556', avd: 'jev-actions-api31' }, setup, { defaultDevice: 'emulator-5554' })).code, 0);
    assert.equal(target(setup.adb), 'emulator-5556');
  });
  await withFakes(two(), async setup => {
    assert.equal((await capture({ avd: 'Medium_Phone_API_36.1' }, setup, { defaultDevice: 'emulator-5554' })).code, 0);
    assert.equal(target(setup.adb), 'emulator-5556');
  });
  await withFakes(two(), async setup => {
    assert.equal((await capture({}, setup, { defaultDevice: 'Medium_Phone_API_36.1' })).code, 0);
    assert.equal(target(setup.adb), 'emulator-5556');
  });
});

test('capture refusals exit 3 with the reason code on stderr, print nothing on stdout, and touch no device when there is no device to name', async () => {
  const cases: [string, CaptureRequest, string | undefined, string][] = [
    ['no device', {}, undefined, 'NO_DEVICE'],
    ['an empty JEV_ANDROID_DEVICE', {}, '', 'NO_DEVICE'],
    ['a bad --serial', { serial: 'has a space' }, undefined, 'INVALID_DEVICE'],
    ['an empty --serial', { serial: '' }, undefined, 'INVALID_DEVICE'],
    ['a bad --avd', { avd: 'emulator:5554' }, undefined, 'INVALID_DEVICE'],
    ['a bad --avd beside a good --serial', { serial: 'emulator-5554', avd: 'has a space' }, undefined, 'INVALID_DEVICE'],
    ['a bad JEV_ANDROID_DEVICE', {}, 'has a space', 'INVALID_DEVICE'],
  ];
  for (const [name, request, defaultDevice, code] of cases) {
    await withFakes(new FakeAdb(api31()), async setup => {
      const printed = await capture(request, setup, defaultDevice === undefined ? {} : { defaultDevice });
      assert.equal(printed.code, 3, name);
      assert.match(printed.stderr, new RegExp(`^${code}: \\S`), name);
      assert.equal(printed.stdout, '', name);
      assert.deepEqual(setup.adb.calls, [], name);
    });
  }
});

test('capture exits 3 with ANDROID_TOOLS_UNAVAILABLE when a tool is missing', async () => {
  await withFakes(new FakeAdb(api31()), async setup => {
    setup.parts.tools = async () => { throw new DeviceReasonError('ANDROID_TOOLS_UNAVAILABLE', 'adb could not be found'); };
    const printed = await capture({ avd: 'jev-actions-api31' }, setup);
    assert.equal(printed.code, 3);
    assert.match(printed.stderr, /^ANDROID_TOOLS_UNAVAILABLE: adb could not be found\n$/);
    assert.equal(printed.stdout, '');
  });
});

test('capture exits 3 with DEVICE_BUSY on a foreign agent, which it leaves running', async () => {
  const adb = new FakeAdb(api31({ agents: new Map([[4984, 'foreign']]) }));
  await withFakes(adb, async setup => {
    const printed = await capture({ avd: 'jev-actions-api31' }, setup);
    assert.equal(printed.code, 3);
    assert.match(printed.stderr, /^DEVICE_BUSY: Device jev-actions-api31 is in use by another tool's UI-automation agent/);
    assert.equal(printed.stdout, '');
    assert.ok(adb.emulators.get('emulator-5554')!.agents!.has(4984));
    assert.equal(adb.shell().some(words => words[0] === 'kill'), false);
    assert.deepEqual((await readdir(setup.root)).filter(name => name !== 'admission'), []);
  });
});

test('a failure after the agent started still closes the driver, and never prints the error\'s own message', async () => {
  await withFakes(new FakeAdb(api31()), async setup => {
    const client = setup.parts.agentClient!;
    setup.parts.agentClient = port => ({ ...client(port), dumpUi: async () => { throw new Error('Screen says: Hello secret'); } });
    const printed = await capture({ avd: 'jev-actions-api31' }, setup);
    assert.equal(printed.code, 3);
    assert.match(printed.stderr, /^EXECUTION_ERROR: \S/);
    assert.doesNotMatch(printed.stderr, /secret/);
    assert.equal(printed.stdout, '');
    assert.equal(setup.adb.emulators.get('emulator-5554')!.agents!.size, 0, 'the agent fenced');
    assert.deepEqual(setup.adb.forwards, []);
    assert.deepEqual((await readdir(setup.root)).filter(name => name !== 'admission'), []);
  });
});

test('--jev on a screen with nothing to show Jev exits 3 with EMPTY_SCREEN, after cleaning up', async () => {
  await withFakes(new FakeAdb(api31()), async setup => {
    const printed = await capture({ avd: 'jev-actions-api31', jev: true }, setup);
    assert.equal(printed.code, 3);
    assert.match(printed.stderr, /^EMPTY_SCREEN: \S/);
    assert.equal(printed.stdout, '');
    assert.deepEqual((await readdir(setup.root)).filter(name => name !== 'admission'), []);
  });
});

test('a cleanup that fails exits 3 with CLEANUP_FAILED and prints no screen', async () => {
  await withFakes(new FakeAdb(api31()), async setup => {
    setup.adb.onCall = args => { if (args[2] === 'forward' && args[3] === '--remove') throw new Error('adb died'); };
    const printed = await capture({ avd: 'jev-actions-api31' }, setup);
    assert.equal(printed.code, 3);
    assert.match(printed.stderr, /^CLEANUP_FAILED: \S/);
    assert.equal(printed.stdout, '');
  }, [await captureOf('settings-2-display')]);
});

test('a capture that fails and a cleanup that keeps the lease report both, in order, with the lease kept named', async () => {
  await withFakes(new FakeAdb(api31()), async setup => {
    const client = setup.parts.agentClient!;
    setup.parts.agentClient = port => ({ ...client(port), dumpUi: async () => { throw new DeviceAgentError(); } });
    setup.adb.onCall = args => { if (args[2] === 'shell' && args[3] === "'kill' '7001'") throw new Error('adb died'); };
    const printed = await capture({ avd: 'jev-actions-api31' }, setup);
    assert.equal(printed.code, 3);
    const [first, second, ...rest] = printed.stderr.split('\n');
    assert.match(first!, /^DEVICE_ERROR: The device agent gave no usable reply$/);
    assert.match(second!, /^CLEANUP_FAILED: Device cleanup did not finish\. .*device lease kept\.$/);
    assert.deepEqual(rest, ['']);
    assert.equal(printed.stdout, '');
  });
});

test('an interrupt mid-capture closes the driver: the agent fenced, the forward removed, uncertain work quarantined', async () => {
  await withFakes(new FakeAdb(api31()), async setup => {
    const interrupt = new AbortController();
    setup.adb.onCall = args => { if (args[2] === 'forward' && args[3] !== '--remove') interrupt.abort(new Error('SIGINT')); };
    const printed = await capture({ avd: 'jev-actions-api31' }, setup, { signal: interrupt.signal });
    assert.equal(printed.code, 3);
    assert.equal(printed.stdout, '');
    assert.equal(setup.adb.emulators.get('emulator-5554')!.agents!.size, 0);
    assert.deepEqual(setup.adb.forwards, []);
    assert.deepEqual((await readdir(setup.root)).filter(name => name !== 'admission'), ['JEV-ACTIONS-API31.lock']);
  });
});

test('an interrupt once the snapshot is taken prints nothing, and retains quarantine after cleanup', async () => {
  await withFakes(new FakeAdb(api31()), async setup => {
    const interrupt = new AbortController();
    setup.adb.onCall = args => { if (args[2] === 'forward' && args[3] === '--remove') interrupt.abort(new Error('SIGINT')); };
    const printed = await capture({ avd: 'jev-actions-api31' }, setup, { signal: interrupt.signal });
    assert.equal(printed.code, 3);
    assert.equal(printed.stdout, '');
    assert.equal(printed.stderr, '');
    assert.equal(setup.adb.emulators.get('emulator-5554')!.agents!.size, 0);
    assert.deepEqual(setup.adb.forwards, []);
    assert.deepEqual((await readdir(setup.root)).filter(name => name !== 'admission'), ['JEV-ACTIONS-API31.lock']);
  }, [await captureOf('settings-2-display')]);
});
