import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { captureCommand, type CaptureRequest } from '../src/capture.js';
import { DeviceReasonError } from '../src/device/index.js';
import type { AndroidNode } from '../src/device/android/agent-client.js';
import { PINNED_AGENT_SHA256 } from '../src/device/android/agent-supply.js';
import { AGENT_START_COMMAND, AndroidDriver, type AndroidDriverOptions } from '../src/device/android/driver.js';
import { mapAndroidTree } from '../src/device/android/mapping.js';
import { AGENT_CACHE, FakeAdb, fakeAgents, fakeClock, FakeStreams, type FakeEmulator } from './fixtures/android-device.js';
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
  const parts: Setup['parts'] = { runner: adb.run, agentClient: agents.agentClient, clock: fakeClock(), leaseRoot: root,
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

/* The driver's capture-only path. */

test('capture runs prepare\'s parts in order without the restart or the streams, then returns one settled snapshot with no screenshot', async () => {
  const tree = await captureOf('settings-2-display');
  await withFakes(new FakeAdb(api31()), async ({ adb, root, agents, streams, parts }) => {
    const driver = new AndroidDriver({ ...parts, device: { serial: 'emulator-5554' } });
    const snapshot = await driver.capture(signal());
    assert.deepEqual(adb.calls, [
      ['devices', '-l'],
      ['-s', 'emulator-5554', 'shell', "'getprop' 'ro.boot.qemu.avd_name'"],
      ['-s', 'emulator-5554', 'shell', "'ps' '-A' '-o' 'PID,NAME,ARGS'"],
      ['forward', '--list'],
      ['-s', 'emulator-5554', 'shell', "'getprop' 'ro.build.version.sdk'"],
      ['-s', 'emulator-5554', 'shell', "'getprop' 'sys.boot_completed'"],
      ['-s', 'emulator-5554', 'shell', "'dumpsys' 'window' 'policy'"],
      ['-s', 'emulator-5554', 'push', AGENT_CACHE, '/data/local/tmp/jev-ios-bridge-agent.dex'],
      START,
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
    assert.deepEqual(await readdir(root), ['JEV-ACTIONS-API31.lock'], 'the lease is held until close');
  }, [tree]);
});

test('close after capture fences the agent, removes the forward and releases the lease, and never stops the app', async () => {
  await withFakes(new FakeAdb(api31()), async ({ adb, root, parts }) => {
    const driver = new AndroidDriver({ ...parts, device: { avd: 'jev-actions-api31' } });
    await driver.capture(signal());
    const before = adb.calls.length;
    await driver.close(signal());
    assert.deepEqual(adb.calls.slice(before), [
      ['-s', 'emulator-5554', 'shell', "'ps' '-A' '-o' 'PID,NAME,ARGS'"],
      ['-s', 'emulator-5554', 'shell', "'cat' '/proc/7001/environ'"],
      ['-s', 'emulator-5554', 'shell', "'kill' '7001'"],
      ['-s', 'emulator-5554', 'shell', "'cat' '/proc/7001/environ'"],
      ['-s', 'emulator-5554', 'forward', '--remove', 'tcp:49526'],
    ]);
    assert.equal(touchedApp(adb), false);
    assert.equal(adb.emulators.get('emulator-5554')!.agents!.size, 0, 'no agent left');
    assert.deepEqual(adb.forwards, [], 'no forward left');
    assert.deepEqual(await readdir(root), [], 'lease released');
  });
});

test('capture holds the device lease: a live holder is DEVICE_BUSY, and nothing touches the device', async () => {
  await withFakes(new FakeAdb(api31()), async ({ adb, root, parts }) => {
    await writeFile(join(root, 'JEV-ACTIONS-API31.lock'), JSON.stringify({ pid: process.pid, token: 'live', deviceId: 'jev-actions-api31' }));
    const driver = new AndroidDriver({ ...parts, device: { avd: 'jev-actions-api31' } });
    await assert.rejects(driver.capture(signal()), reason('DEVICE_BUSY'));
    assert.deepEqual(adb.shell().map(words => words.join(' ')), ['getprop ro.boot.qemu.avd_name']);
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
    assert.deepEqual(await readdir(root), []);
  });
});

test('capture after a crash takeover sweeps the dead holder\'s agent, forward and logcat stream', async () => {
  const adb = new FakeAdb(api31({ agents: new Map([[4675, 'own']]) }));
  adb.forwards = [{ serial: 'emulator-5554', local: 'tcp:65436', remote: 'localabstract:mobilecli-server' }];
  await withFakes(adb, async ({ root, streams, parts }) => {
    streams.mac.set(5001, '/sdk/platform-tools/adb -s emulator-5554 logcat -b events');
    await writeFile(join(root, 'JEV-ACTIONS-API31.lock'), JSON.stringify({ pid: deadPid(), token: 'crashed', deviceId: 'jev-actions-api31',
      ownedProcesses: ['agent emulator-5554 4675', 'forward emulator-5554 tcp:65436', 'logcat emulator-5554 5001'] }));
    const driver = new AndroidDriver({ ...parts, device: { avd: 'jev-actions-api31' } });
    await driver.capture(signal());
    assert.deepEqual(streams.killed, [5001]);
    assert.ok(adb.shell().some(words => words.join(' ') === 'kill 4675'));
    assert.equal(adb.forwards.some(forward => forward.local === 'tcp:65436'), false);
    await driver.close(signal());
    assert.deepEqual(adb.forwards, []);
    assert.deepEqual(await readdir(root), []);
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

/* The CLI's capture path. */

interface Printed { code: number; stdout: string; stderr: string }

async function capture(request: CaptureRequest, setup: Setup, options: { defaultDevice?: string; signal?: AbortSignal } = {}): Promise<Printed> {
  let stdout = '';
  let stderr = '';
  const code = await captureCommand(request, { defaultDevice: options.defaultDevice, driver: setup.parts, signal: options.signal ?? signal(),
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
      assert.deepEqual(await readdir(setup.root), [], 'the lease released');
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
      assert.equal(stdout, `${await judgedText(screen)}\n`);
      assert.equal(touchedApp(setup.adb), false);
      assert.deepEqual(await readdir(setup.root), []);
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
    assert.deepEqual(await readdir(setup.root), []);
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
    assert.deepEqual(await readdir(setup.root), []);
  });
});

test('--jev on a screen with nothing to show Jev exits 3 with EMPTY_SCREEN, after cleaning up', async () => {
  await withFakes(new FakeAdb(api31()), async setup => {
    const printed = await capture({ avd: 'jev-actions-api31', jev: true }, setup);
    assert.equal(printed.code, 3);
    assert.match(printed.stderr, /^EMPTY_SCREEN: \S/);
    assert.equal(printed.stdout, '');
    assert.deepEqual(await readdir(setup.root), []);
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

test('an interrupt mid-capture closes the driver: the agent fenced, the forward removed, the lease released', async () => {
  await withFakes(new FakeAdb(api31()), async setup => {
    const interrupt = new AbortController();
    setup.adb.onCall = args => { if (args[2] === 'forward' && args[3] !== '--remove') interrupt.abort(new Error('SIGINT')); };
    const printed = await capture({ avd: 'jev-actions-api31' }, setup, { signal: interrupt.signal });
    assert.equal(printed.code, 3);
    assert.equal(printed.stdout, '');
    assert.equal(setup.adb.emulators.get('emulator-5554')!.agents!.size, 0);
    assert.deepEqual(setup.adb.forwards, []);
    assert.deepEqual(await readdir(setup.root), []);
  });
});
