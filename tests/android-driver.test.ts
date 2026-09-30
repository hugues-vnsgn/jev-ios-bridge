import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, lstat, mkdir, mkdtemp, readdir, readFile, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { isActOutcome, type AndroidAppIdentity, type DeviceDriver, type RunEvent, type Snapshot } from '../src/contracts/index.js';
import { DeviceReasonError, StaleSnapshotError } from '../src/device/index.js';
import { adbRunner, type AdbResult, type AdbRunner } from '../src/device/android/adb.js';
import { DeviceAgentError, type AndroidNode, type DeviceAgentClient } from '../src/device/android/agent-client.js';
import { PINNED_AGENT_SHA256 } from '../src/device/android/agent-supply.js';
import { AGENT_DEVICE_PATH, AGENT_START_COMMAND, AndroidDriver, productionClock, type AndroidDriverOptions } from '../src/device/android/driver.js';
import type { AppExitWatch } from '../src/device/android/exit-watch.js';
import { createDriverFactory } from '../src/device/factory.js';
import { OutcomeUnknownError } from '../src/device/android/ledger.js';
import type { LogcatOutput, LogcatStarter, LogcatStream } from '../src/device/android/logcat.js';
import { mapAndroidTree } from '../src/device/android/mapping.js';
import { screenHash, type Clock } from '../src/device/android/settle.js';
import type { ScriptedJudge } from '../src/scripted/contracts.js';
import { runScriptedScenario } from '../src/scripted/run.js';
import { fakeSpawn } from './fixtures/adb-spawn.js';
import { androidScript } from './fixtures/android-script.js';
import { withRunLog } from './fixtures/run-log.js';

/**
 * The Android driver's `prepare` against a fake device that answers with the `adb` outputs recorded from
 * both emulators (`tests/fixtures/android/adb/`), a fake device agent client, a fake clock and a
 * temporary lease root.
 */

const FIXTURES = join(import.meta.dirname, 'fixtures', 'android', 'adb');
const fixture = (api: Api, name: string) => readFile(join(FIXTURES, api, name), 'utf8');
const fixtureBytes = (api: Api, name: string) => readFile(join(FIXTURES, api, name), 'latin1');
type Api = 'api31' | 'api36';

const AGENT_CACHE = '/cache/jev-android-agent/pinned.dex';
const AGENT_CLASS_LINE = 'app_process                 app_process / com.mobilenext.mobilecli.DeviceServer';
const deadPid = () => spawnSync(process.execPath, ['-e', '0']).pid!;

/** Reads a device-shell command line back into its words, as the device's `sh` would. */
function shellWords(line: string): string[] {
  const words: string[] = [];
  let word: string | undefined;
  for (let at = 0; at < line.length; at++) {
    const char = line[at]!;
    if (char === "'") {
      const end = line.indexOf("'", at + 1);
      word = (word ?? '') + line.slice(at + 1, end);
      at = end;
    } else if (char === '\\') { word = (word ?? '') + line[++at]; }
    else if (char === ' ') { if (word !== undefined) words.push(word); word = undefined; }
    else word = (word ?? '') + char;
  }
  if (word !== undefined) words.push(word);
  return words;
}

interface FakeEmulator {
  serial: string;
  avd: string;
  api?: string;
  booted?: boolean;
  installed?: string[];
  awake?: boolean;
  keyguard?: boolean;
  /** Agents running now, by pid: the bridge's own, mobilecli's (foreign), or any other `ps` line. */
  agents?: Map<number, 'own' | 'foreign' | { line: string }>;
  /** The bridge's own agent starts when asked. False: the start command runs, but no agent appears. */
  agentStarts?: boolean;
  /** Pids that ignore `kill`. */
  stubborn?: number[];
  fixtures?: Api;
  /** What `pm list packages -U` prints; by default, each installed package with a uid from 10226. */
  packagesText?: string;
  /** What `date +'%s.%3N %z'` prints; by default, `1759075200.123 +0700`. */
  deviceTime?: string;
  /** What `pidof` prints for the app; by default, `9784`. Empty: not running. */
  appPids?: string;
}

/** A fake `adb` that answers like the recorded emulators, records every call, and never runs anything. */
class FakeAdb {
  readonly calls: string[][] = [];
  forwards: { serial: string; local: string; remote: string }[] = [];
  busyPorts = new Set<number>();
  devicesText: string | undefined;
  nextPid = 7001;
  readonly emulators = new Map<string, FakeEmulator>();
  /** Called before each command is answered, to look at the world as that command saw it. */
  onCall: ((args: string[]) => void | Promise<void>) | undefined;

  constructor(...emulators: FakeEmulator[]) {
    for (const emulator of emulators) this.emulators.set(emulator.serial, emulator);
  }

  /** The shell commands issued to `serial`, as words. */
  shell(serial = 'emulator-5554'): string[][] {
    return this.calls.filter(call => call[0] === '-s' && call[1] === serial && call[2] === 'shell').map(call => shellWords(call[3]!));
  }

  readonly run: AdbRunner = async (args, signal) => {
    this.calls.push([...args]);
    if (signal.aborted) throw signal.reason;
    await this.onCall?.(args);
    return { stdout: '', stderr: '', exitCode: 0, ...await this.answer(args) };
  };

  private async answer(args: string[]): Promise<Partial<AdbResult>> {
    if (args.join(' ') === 'devices -l') return { stdout: this.devicesText ?? await this.listDevices() };
    if (args.join(' ') === 'forward --list') {
      return { stdout: this.forwards.map(forward => `${forward.serial} ${forward.local} ${forward.remote}\n`).join('') };
    }
    assert.equal(args[0], '-s', `unexpected adb command: ${args.join(' ')}`);
    const serial = args[1]!;
    const emulator = this.emulators.get(serial);
    assert.ok(emulator, `a command for a device that isn't there: ${args.join(' ')}`);
    const api = emulator.fixtures ?? 'api31';
    const [, , verb, ...rest] = args;
    if (verb === 'forward' && rest[0] === '--remove') {
      const before = this.forwards.length;
      this.forwards = this.forwards.filter(forward => !(forward.serial === serial && forward.local === rest[1]));
      return before === this.forwards.length ? { exitCode: 1, stderr: `adb: error: listener '${rest[1]}' not found\n` } : {};
    }
    if (verb === 'forward') {
      if (this.busyPorts.has(Number(rest[0]!.slice('tcp:'.length))) || this.forwards.some(forward => forward.local === rest[0])) {
        return { exitCode: 1, stderr: await fixture('api36', 'forward-cannot-bind.stderr.txt') };
      }
      this.forwards.push({ serial, local: rest[0]!, remote: rest[1]! });
      return {};
    }
    if (verb === 'push') return { stdout: `${rest[0]}: 1 file pushed, 0 skipped.\n` };
    assert.equal(verb, 'shell');
    const line = rest[0]!;
    if (line === AGENT_START_COMMAND) {
      if (emulator.agentStarts !== false) (emulator.agents ??= new Map()).set(this.nextPid++, 'own');
      return {};
    }
    const words = shellWords(line);
    const agents = emulator.agents ?? new Map();
    switch (words.join(' ')) {
      case 'getprop ro.boot.qemu.avd_name': return { stdout: `${emulator.avd}\n` };
      case 'getprop ro.build.version.sdk': return { stdout: `${emulator.api ?? '31'}\n` };
      case 'getprop sys.boot_completed': return { stdout: emulator.booted === false ? '\n' : '1\n' };
      case 'ps -A -o PID,NAME,ARGS': {
        const lines = (await fixture(api, 'ps-no-agent.txt')).split('\n');
        const psLine = lines.findIndex(entry => / ps -A -o PID,NAME,ARGS/.test(entry));
        const agentLines = [...agents].map(([pid, kind]) => typeof kind === 'object' ? kind.line : `${String(pid).padStart(5)} ${AGENT_CLASS_LINE}`);
        return { stdout: [...lines.slice(0, psLine), ...agentLines, ...lines.slice(psLine)].join('\n') };
      }
      case 'dumpsys window policy': {
        const awake = emulator.awake !== false;
        const text = await fixture(api, awake ? (emulator.keyguard ? 'window-policy-locked.derived.txt' : 'window-policy-on.txt') : 'window-policy-off.txt');
        return { stdout: awake ? text : text.replace(/^( +)showing=false$/m, `$1showing=${String(Boolean(emulator.keyguard))}`) };
      }
      case 'input keyevent KEYCODE_WAKEUP': emulator.awake = true; return {};
    }
    if (words[0] === 'cat' && /^\/proc\/\d+\/environ$/.test(words[1]!)) {
      const kind = agents.get(Number(words[1]!.split('/')[2]));
      if (kind === undefined) return { exitCode: 1, stderr: await fixture('api36', 'environ-gone.stderr.txt') };
      if (typeof kind === 'object') return { stdout: '' };
      return { stdout: await fixtureBytes(api, kind === 'own' ? 'environ-own-agent.bin' : 'environ-foreign-agent.bin') };
    }
    if (words[0] === 'kill') {
      const pid = Number(words[1]);
      if (!agents.has(pid)) return { exitCode: 1, stderr: (await fixture('api36', 'kill-gone.stderr.txt')).replace('9983', String(pid)) };
      if (!emulator.stubborn?.includes(pid)) agents.delete(pid);
      return {};
    }
    const installed = new Set(emulator.installed ?? ['com.example.android']);
    if (words.join(' ') === 'pm list packages -U') {
      return { stdout: emulator.packagesText ?? [...installed].map((name, at) => `package:${name} uid:${String(10226 + at)}\n`).join('') };
    }
    if (words.join(' ') === 'date +%s.%3N %z') return { stdout: `${emulator.deviceTime ?? '1759075200.123 +0700'}\n` };
    if (words[0] === 'pidof') {
      const pids = installed.has(words[1]!) ? emulator.appPids ?? '9784' : '';
      return pids ? { stdout: `${pids}\n` } : { exitCode: 1 };
    }
    if (words[0] === 'pm' && words[1] === 'path') {
      return installed.has(words[2]!) ? { stdout: `package:/data/app/~~x/${words[2]}-y/base.apk\n` } : { exitCode: 1 };
    }
    if (words[0] === 'am' && words[1] === 'force-stop') return {};
    if (words.slice(0, 3).join(' ') === 'cmd package resolve-activity') {
      const target = words.at(-1)!;
      return { stdout: installed.has(target)
        ? `priority=0 preferredOrder=0 match=0x108000 specificIndex=-1 isDefault=false\n${target}/.MainActivity\n` : 'No activity found\n' };
    }
    if (words.slice(0, 3).join(' ') === 'am start -W') {
      if (words[4]!.endsWith('NoSuchActivity')) return { stdout: await fixture('api31', 'am-start-W-no-activity.txt') };
      return { stdout: await fixture(api, 'am-start-W-extras.txt') };
    }
    assert.fail(`unexpected shell command: ${line}`);
  }

  private async listDevices(): Promise<string> {
    const header = (await fixture('api31', 'devices-l.txt')).split('\n')[0];
    const rows = [...this.emulators.keys()].map(serial => `${serial}          device product:sdk_gphone64_arm64 model:sdk_gphone64_arm64 device:emulator64_arm64 transport_id:1`);
    return `${header}\n${rows.join('\n')}\n\n`;
  }
}

/** One call the driver made to the fake agent, other than `device.version`, by the agent's method name. */
type AgentCall = { method: string; params?: unknown };

/**
 * A fake device agent client: `device.version` answers with the pinned SHA-256 once the bridge's own agent
 * runs on the port's device. `device.dump.ui` answers with the next of `screens` (the last one repeats),
 * and `device.screenshot` with `jpeg-<n>`. Every other call is recorded in `calls` and does nothing.
 */
function fakeAgents(adb: FakeAdb, options: { answersAfterPolls?: number; never?: boolean; sha256?: string; screens?: AndroidNode[][] } = {}) {
  const versionCalls: number[] = [];
  const clients: number[] = [];
  const calls: AgentCall[] = [];
  const screens = [...options.screens ?? [[]]];
  let shots = 0;
  /** Called before each recorded call is answered. */
  const hooks: { onCall?: ((call: AgentCall) => void | Promise<void>) | undefined } = {};
  const record = async (method: string, params?: unknown) => {
    const call = { method, ...(params === undefined ? {} : { params }) };
    calls.push(call);
    await hooks.onCall?.(call);
  };
  const agentClient = (port: number): DeviceAgentClient => {
    clients.push(port);
    return {
      async version() {
        versionCalls.push(port);
        const forward = adb.forwards.find(entry => entry.local === `tcp:${port}`);
        const running = forward && [...adb.emulators.get(forward.serial)?.agents?.values() ?? []].includes('own');
        if (options.never || !running || versionCalls.length <= (options.answersAfterPolls ?? 0)) throw new DeviceAgentError();
        return { dexSha256: options.sha256 ?? PINNED_AGENT_SHA256 };
      },
      async dumpUi(waitUntilIdle) {
        await record('device.dump.ui', { waitUntilIdle });
        return screens.length > 1 ? screens.shift()! : screens[0]!;
      },
      async tap(point) { await record('device.io.tap', point); },
      async swipe(swipe) { await record('device.io.swipe', swipe); },
      async keys(keys) { await record('device.io.keys', { keys }); },
      async text(text) { await record('device.io.text', { text }); },
      async button(button) { await record('device.io.button', { button }); },
      async clipboardSet(text) { await record('device.clipboard.set', { text }); },
      async clipboardClear() { await record('device.clipboard.clear'); },
      async screenshot(maxSize) {
        await record('device.screenshot', { format: 'jpeg', maxSize });
        return Buffer.from(`jpeg-${String(++shots)}`);
      },
    };
  };
  return { agentClient, versionCalls, clients, calls, hooks };
}

/** Fake time: a sleep moves it on at once, aborting each `timeout` signal it passes, at that signal's own time. */
function fakeClock(): Clock & { sleeps: number[] } {
  let now = 0;
  const sleeps: number[] = [];
  const timers: { at: number; controller: AbortController }[] = [];
  return {
    sleeps,
    now: () => now,
    async sleep(ms) {
      sleeps.push(ms);
      const until = now + ms;
      for (const timer of timers.filter(pending => pending.at <= until).sort((one, other) => one.at - other.at)) {
        timers.splice(timers.indexOf(timer), 1);
        now = Math.max(now, timer.at);
        timer.controller.abort(new Error('timed out'));
      }
      now = until;
    },
    timeout(ms) {
      const controller = new AbortController();
      timers.push({ at: now + ms, controller });
      return controller.signal;
    },
  };
}

/** One stream the fake starter started: its `adb` arguments, where its output goes, and whether it still runs. */
type FakeStream = { args: string[]; output: LogcatOutput; pid: number; running: boolean; end(): void };

/**
 * A fake logcat stream starter. Each start and stop is recorded in the fake `adb`'s calls, as
 * `(logcat) <args>` and `(stop) <pid>`, so tests see them in order with the `adb` commands. A file
 * stream's file is created empty. `mac` holds the Mac's processes by pid, as command lines, for the sweep.
 */
class FakeStreams implements LogcatStarter {
  readonly streams: FakeStream[] = [];
  readonly killed: number[] = [];
  readonly mac = new Map<number, string>();
  nextPid = 8001;
  /** Pids whose stop can't be confirmed. */
  readonly stubborn = new Set<number>();
  /** A start that fails, by its arguments. */
  fails: ((args: string[]) => boolean) | undefined;
  /** Holds each start in flight, after its process started, until the gate opens. */
  held: Promise<void> | undefined;

  constructor(private readonly adb: FakeAdb) {}

  async start(args: string[], output: LogcatOutput): Promise<LogcatStream> {
    this.adb.calls.push(['(logcat)', ...args]);
    if (this.fails?.(args)) throw new Error('spawn adb ENOENT');
    if (typeof output === 'string') await writeFile(output, '', { flag: 'wx', mode: 0o600 });
    let ended!: () => void;
    const exited = new Promise<void>(resolveExit => { ended = resolveExit; });
    const stream: FakeStream = { args, output, pid: this.nextPid++, running: true, end: () => { stream.running = false; ended(); } };
    this.streams.push(stream);
    await this.held;
    return {
      pid: stream.pid,
      exited,
      stop: async () => {
        if (!stream.running) return;
        this.adb.calls.push(['(stop)', String(stream.pid)]);
        if (this.stubborn.has(stream.pid)) throw new Error(`logcat ${String(stream.pid)} did not exit`);
        stream.end();
      },
    };
  }

  async isLeftover(pid: number, serial: string): Promise<boolean> {
    const words = this.mac.get(pid)?.split(' ') ?? [];
    return words[0]?.endsWith('/adb') === true && words.includes('logcat') && words.some((word, at) => word === '-s' && words[at + 1] === serial);
  }

  async kill(pid: number): Promise<void> {
    this.killed.push(pid);
    this.mac.delete(pid);
  }
}

interface Setup {
  adb: FakeAdb;
  root: string;
  driver: AndroidDriver;
  agents: ReturnType<typeof fakeAgents>;
  clock: ReturnType<typeof fakeClock>;
  streams: FakeStreams;
}

async function withDriver(adb: FakeAdb, fn: (setup: Setup) => Promise<void>,
  options: Partial<AndroidDriverOptions> & { agents?: Parameters<typeof fakeAgents>[1]; ports?: number[] } = {}): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'jev-android-driver-'));
  const agents = fakeAgents(adb, options.agents);
  const clock = fakeClock();
  const ports = [...options.ports ?? [49526, 49527, 49528, 49529]];
  const streams = new FakeStreams(adb);
  // Phase 4's tests start no logcat stream (logFolder false); phase 5's tests name a log folder.
  const driver = new AndroidDriver({ device: { avd: 'jev-actions-api31' }, runner: adb.run, agentClient: agents.agentClient, clock,
    leaseRoot: root, screenshotFolder: root, freePort: async () => ports.shift()!, logcat: streams, logFolder: false,
    tools: async () => ({ adb: '/sdk/platform-tools/adb', agent: { path: AGENT_CACHE, sha256: PINNED_AGENT_SHA256 } }), ...options });
  try {
    await fn({ adb, root, driver, agents, clock, streams });
  } finally {
    // No command in any test calls the mobilecli program or pkill.
    for (const call of adb.calls) {
      assert.doesNotMatch(call.join(' '), /pkill|killall/);
      assert.ok(!call.some(arg => /(^|\/)mobilecli(-darwin-\w+)?$/.test(arg)), `mobilecli run: ${call.join(' ')}`);
      assert.ok(!call.includes('/data/local/tmp/mobilecli.dex'), 'never mobilecli\'s agent path');
    }
    await rm(root, { recursive: true, force: true });
  }
}

const app = (overrides: Partial<AndroidAppIdentity> = {}): { app: AndroidAppIdentity } =>
  ({ app: { package: 'com.example.android', ...overrides } });
const api31 = (overrides: Partial<FakeEmulator> = {}): FakeEmulator => ({ serial: 'emulator-5554', avd: 'jev-actions-api31', ...overrides });
const signal = () => new AbortController().signal;
const reason = (code: string, vendorCode?: string) => (error: unknown) => {
  assert.ok(error instanceof DeviceReasonError, `a DeviceReasonError, not ${String(error)}`);
  assert.equal(error.code, code);
  if (vendorCode) assert.equal(error.vendorCode, vendorCode);
  return true;
};
const lockFile = async (root: string) => {
  const [name] = await readdir(root);
  return name ? JSON.parse(await readFile(join(root, name), 'utf8')) as { pid: number; ownedProcesses?: string[] } : undefined;
};
const START = ['-s', 'emulator-5554', 'shell', AGENT_START_COMMAND];

test('prepares an emulator named by serial, in the release spec\'s order, and records the agent it started', async () => {
  const adb = new FakeAdb(api31());
  await withDriver(adb, async ({ driver, root }) => {
    await driver.prepare(app(), signal());
    assert.deepEqual(adb.calls, [
      ['devices', '-l'],
      ['-s', 'emulator-5554', 'shell', "'getprop' 'ro.boot.qemu.avd_name'"],
      ['-s', 'emulator-5554', 'shell', "'ps' '-A' '-o' 'PID,NAME,ARGS'"],
      ['forward', '--list'],
      ['-s', 'emulator-5554', 'shell', "'getprop' 'ro.build.version.sdk'"],
      ['-s', 'emulator-5554', 'shell', "'getprop' 'sys.boot_completed'"],
      ['-s', 'emulator-5554', 'shell', "'pm' 'path' 'com.example.android'"],
      ['-s', 'emulator-5554', 'shell', "'dumpsys' 'window' 'policy'"],
      ['-s', 'emulator-5554', 'shell', "'am' 'force-stop' 'com.example.android'"],
      ['-s', 'emulator-5554', 'shell', "'cmd' 'package' 'resolve-activity' '--brief' '-a' 'android.intent.action.MAIN' '-c' 'android.intent.category.LAUNCHER' 'com.example.android'"],
      ['-s', 'emulator-5554', 'shell', "'am' 'start' '-W' '-n' 'com.example.android/.MainActivity'"],
      ['-s', 'emulator-5554', 'push', AGENT_CACHE, '/data/local/tmp/jev-ios-bridge-agent.dex'],
      START,
      ['-s', 'emulator-5554', 'forward', 'tcp:49526', 'localabstract:mobilecli-server'],
      ['-s', 'emulator-5554', 'shell', "'ps' '-A' '-o' 'PID,NAME,ARGS'"],
      ['-s', 'emulator-5554', 'shell', "'cat' '/proc/7001/environ'"],
    ]);
    assert.deepEqual(driver.preparation(), { deviceIdentity: 'jev-actions-api31', serial: 'emulator-5554', agentSha256: PINNED_AGENT_SHA256 });
    assert.deepEqual((await lockFile(root))?.ownedProcesses, ['forward emulator-5554 tcp:49526', 'agent emulator-5554 7001']);
  }, { device: { serial: 'emulator-5554' } });
});

test('the agent start command, push path and socket are the release spec\'s, never mobilecli\'s', () => {
  assert.equal(AGENT_DEVICE_PATH, '/data/local/tmp/jev-ios-bridge-agent.dex');
  assert.equal(AGENT_START_COMMAND,
    'CLASSPATH=/data/local/tmp/jev-ios-bridge-agent.dex nohup app_process / com.mobilenext.mobilecli.DeviceServer >/dev/null 2>&1 &');
});

test('the lease is taken before the first command that touches the device', async () => {
  const adb = new FakeAdb(api31());
  const beforeLease: string[] = [];
  await withDriver(adb, async ({ driver, root }) => {
    adb.onCall = async args => { if ((await readdir(root)).length === 0) beforeLease.push(args.join(' ')); };
    await driver.prepare(app(), signal());
    assert.deepEqual(beforeLease, ['devices -l', "-s emulator-5554 shell 'getprop' 'ro.boot.qemu.avd_name'"]);
  });
});

test('an AVD name resolves to the one running emulator reporting it, reading the property only from emulator serials', async () => {
  const adb = new FakeAdb(api31({ serial: 'emulator-5556', avd: 'Medium_Phone_API_36.1', api: '36', fixtures: 'api36' }),
    api31({ serial: 'emulator-5558' }));
  adb.devicesText = 'List of devices attached\nR58M12345     device usb:1-1 product:x model:Phone device:x transport_id:3\n' +
    'emulator-5556          device product:sdk_gphone64_arm64 transport_id:1\nemulator-5558          device product:sdk_gphone64_arm64 transport_id:2\n\n';
  await withDriver(adb, async ({ driver }) => {
    await driver.prepare(app(), signal());
    assert.deepEqual(adb.calls.filter(call => call[3]?.includes('avd_name')).map(call => call[1]), ['emulator-5556', 'emulator-5558']);
    assert.equal(driver.preparation().serial, 'emulator-5558');
    assert.equal(driver.preparation().deviceIdentity, 'jev-actions-api31');
  });
});

test('JEV_ANDROID_DEVICE names the device when the script names none', async () => {
  const adb = new FakeAdb(api31());
  await withDriver(adb, async ({ driver }) => {
    await driver.prepare(app(), signal());
    assert.equal(driver.preparation().deviceIdentity, 'jev-actions-api31');
  }, { device: undefined, defaultDevice: 'emulator-5554' });
});

test('a phone\'s identity is its serial, and its AVD property is never read', async () => {
  const adb = new FakeAdb(api31({ serial: 'R58M12345', avd: 'not-read' }));
  adb.devicesText = 'List of devices attached\nR58M12345     device usb:1-1 product:x model:Phone device:x transport_id:3\n\n';
  await withDriver(adb, async ({ driver, root }) => {
    await driver.prepare(app(), signal());
    assert.equal(adb.calls.some(call => call.join(' ').includes('avd_name')), false);
    assert.deepEqual(driver.preparation(), { deviceIdentity: 'R58M12345', serial: 'R58M12345', agentSha256: PINNED_AGENT_SHA256 });
    assert.deepEqual(await readdir(root), ['R58M12345.lock']);
  }, { device: { serial: 'R58M12345' } });
});

test('a serial and its AVD name share one device lease', async () => {
  const adb = new FakeAdb(api31());
  const root = await mkdtemp(join(tmpdir(), 'jev-android-shared-lease-'));
  try {
    await withDriver(adb, async ({ driver }) => {
      await driver.prepare(app(), signal());
      await withDriver(new FakeAdb(api31()), async ({ driver: second }) => {
        await assert.rejects(second.prepare(app(), signal()), (error: unknown) =>
          reason('DEVICE_BUSY')(error) && /is locked by bridge process/.test((error as Error).message));
      }, { device: { serial: 'emulator-5554' }, leaseRoot: root });
    }, { leaseRoot: root });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('the tools check runs first: a missing tool is ANDROID_TOOLS_UNAVAILABLE before any adb command or device name check', async () => {
  const adb = new FakeAdb(api31());
  await withDriver(adb, async ({ driver }) => {
    await assert.rejects(driver.prepare(app(), signal()), reason('ANDROID_TOOLS_UNAVAILABLE'));
    assert.deepEqual(adb.calls, []);
  }, { device: undefined, tools: async () => { throw new DeviceReasonError('ANDROID_TOOLS_UNAVAILABLE', 'adb could not be found'); } });
});

test('no device name at all is NO_DEVICE, before any adb command', async () => {
  const adb = new FakeAdb(api31());
  await withDriver(adb, async ({ driver }) => {
    await assert.rejects(driver.prepare(app(), signal()), reason('NO_DEVICE'));
    assert.deepEqual(adb.calls, []);
  }, { device: undefined });
});

for (const [name, devicesText, code] of [
  ['an unauthorized serial is DEVICE_UNAUTHORIZED', 'List of devices attached\nemulator-5554          unauthorized transport_id:1\n\n', 'DEVICE_UNAUTHORIZED'],
  ['an offline serial is DEVICE_NOT_CONNECTED', 'List of devices attached\nemulator-5554          offline transport_id:1\n\n', 'DEVICE_NOT_CONNECTED'],
  ['a serial adb doesn\'t list is DEVICE_NOT_CONNECTED', 'List of devices attached\n\n', 'DEVICE_NOT_CONNECTED'],
] as const) {
  test(name, async () => {
    const adb = new FakeAdb(api31());
    adb.devicesText = devicesText;
    await withDriver(adb, async ({ driver, root }) => {
      await assert.rejects(driver.prepare(app(), signal()), reason(code));
      assert.deepEqual(await readdir(root), [], 'no lease taken');
    }, { device: { serial: 'emulator-5554' } });
  });
}

test('an AVD name no running emulator reports is DEVICE_NOT_CONNECTED', async () => {
  const adb = new FakeAdb(api31({ avd: 'Medium_Phone_API_36.1' }));
  await withDriver(adb, async ({ driver }) => {
    await assert.rejects(driver.prepare(app(), signal()), reason('DEVICE_NOT_CONNECTED'));
  });
});

test('an AVD name no running emulator reports, with an unauthorized emulator listed, is DEVICE_UNAUTHORIZED', async () => {
  const adb = new FakeAdb(api31({ avd: 'Medium_Phone_API_36.1' }));
  adb.devicesText = 'List of devices attached\nemulator-5554          device product:sdk_gphone64_arm64 model:sdk_gphone64_arm64 device:emulator64_arm64 transport_id:1\n' +
    'emulator-5556          unauthorized transport_id:2\n\n';
  await withDriver(adb, async ({ driver, root }) => {
    await assert.rejects(driver.prepare(app(), signal()), reason('DEVICE_UNAUTHORIZED'));
    assert.equal(adb.calls.some(call => call[1] === 'emulator-5556'), false, 'an unauthorized emulator\'s property is never read');
    assert.deepEqual(await readdir(root), [], 'no lease taken');
  });
});

test('an AVD name a running emulator reports resolves to it, even with an unauthorized emulator listed', async () => {
  const adb = new FakeAdb(api31());
  adb.devicesText = 'List of devices attached\nemulator-5554          device transport_id:1\nemulator-5556          unauthorized transport_id:2\n\n';
  await withDriver(adb, async ({ driver }) => {
    await driver.prepare(app(), signal());
    assert.equal(driver.preparation().serial, 'emulator-5554');
  });
});

test('two running emulators reporting the AVD name are DEVICE_AMBIGUOUS', async () => {
  const adb = new FakeAdb(api31(), api31({ serial: 'emulator-5556' }));
  await withDriver(adb, async ({ driver, root }) => {
    await assert.rejects(driver.prepare(app(), signal()), reason('DEVICE_AMBIGUOUS'));
    assert.deepEqual(await readdir(root), []);
  });
});

test('a live holder of the device lease is DEVICE_BUSY with the lease\'s message, and nothing touches the device', async () => {
  const adb = new FakeAdb(api31());
  await withDriver(adb, async ({ driver, root }) => {
    await writeFile(join(root, 'JEV-ACTIONS-API31.lock'), JSON.stringify({ pid: process.pid, token: 'other', deviceId: 'jev-actions-api31' }));
    await assert.rejects(driver.prepare(app(), signal()), (error: unknown) => reason('DEVICE_BUSY')(error) &&
      (error as Error).message.startsWith(`Device jev-actions-api31 is locked by bridge process ${String(process.pid)}`));
    assert.deepEqual(adb.calls.map(call => call.join(' ')), ['devices -l', "-s emulator-5554 shell 'getprop' 'ro.boot.qemu.avd_name'"]);
  });
});

for (const [name, emulator, code] of [
  ['a device below API 31 is DEVICE_UNSUPPORTED', { api: '30' }, 'DEVICE_UNSUPPORTED'],
  ['a device still booting is DEVICE_NOT_BOOTED', { booted: false }, 'DEVICE_NOT_BOOTED'],
  ['an app that isn\'t installed is APP_NOT_INSTALLED', { installed: [] as string[] }, 'APP_NOT_INSTALLED'],
  ['a keyguard showing on an awake screen is DEVICE_LOCKED', { keyguard: true }, 'DEVICE_LOCKED'],
] as const) {
  test(`${name}; the app is left alone and the lease released`, async () => {
    const adb = new FakeAdb(api31(emulator));
    await withDriver(adb, async ({ driver, root }) => {
      await assert.rejects(driver.prepare(app(), signal()), reason(code));
      assert.equal(adb.shell().some(words => words[0] === 'am' || words[0] === 'input'), false, 'no restart, no wake');
      assert.equal(adb.calls.some(call => call[2] === 'push'), false);
      assert.deepEqual(await readdir(root), [], 'lease released');
    });
  });
}

test('a screen that is only off is woken with KEYCODE_WAKEUP, and the run goes on', async () => {
  const adb = new FakeAdb(api31({ awake: false, fixtures: 'api36', api: '36' }));
  await withDriver(adb, async ({ driver }) => {
    await driver.prepare(app(), signal());
    const words = adb.shell().map(entry => entry.join(' '));
    const wake = words.indexOf('input keyevent KEYCODE_WAKEUP');
    assert.ok(wake > 0);
    assert.equal(words[wake - 1], 'dumpsys window policy');
    assert.equal(words[wake + 1], 'dumpsys window policy', 'the keyguard is read again after waking');
    assert.equal(words.filter(entry => entry.startsWith('settings') || entry.startsWith('svc') || entry.startsWith('pm clear')).length, 0,
      'no device setting changed, no app data cleared');
  });
});

test('a keyguard still showing after waking the screen is DEVICE_LOCKED', async () => {
  const adb = new FakeAdb(api31({ awake: false, keyguard: true }));
  await withDriver(adb, async ({ driver }) => {
    await assert.rejects(driver.prepare(app(), signal()), reason('DEVICE_LOCKED'));
    assert.ok(adb.shell().some(words => words.join(' ') === 'input keyevent KEYCODE_WAKEUP'));
  });
});

test('a foreign agent is DEVICE_BUSY: no kill, no forward removed, the app untouched, the lease released', async () => {
  for (const fixtures of ['api31', 'api36'] as const) {
    const adb = new FakeAdb(api31({ fixtures, agents: new Map([[4984, 'foreign']]) }));
    adb.forwards = [{ serial: 'emulator-5554', local: 'tcp:61000', remote: 'localabstract:mobilecli-server' }];
    await withDriver(adb, async ({ driver, root }) => {
      await assert.rejects(driver.prepare(app(), signal()), (error: unknown) =>
        reason('DEVICE_BUSY')(error) && /another tool's UI-automation agent/.test((error as Error).message));
      assert.deepEqual(adb.shell().map(words => words.join(' ')), ['getprop ro.boot.qemu.avd_name', 'ps -A -o PID,NAME,ARGS', 'cat /proc/4984/environ']);
      assert.equal(adb.calls.some(call => call[2] === 'forward'), false);
      assert.ok(adb.emulators.get('emulator-5554')!.agents!.has(4984), 'the foreign agent keeps running');
      assert.equal(adb.forwards.length, 1);
      assert.deepEqual(await readdir(root), []);
    });
  }
});

test('an Appium or uiautomator process is foreign without reading its environment', async () => {
  const line = ' 5120 app_process                 app_process /system/bin com.android.commands.am.Am instrument -w io.appium.uiautomator2.server.test/androidx.test.runner.AndroidJUnitRunner';
  const adb = new FakeAdb(api31({ agents: new Map([[5120, { line }]]) }));
  await withDriver(adb, async ({ driver }) => {
    await assert.rejects(driver.prepare(app(), signal()), reason('DEVICE_BUSY'));
    assert.equal(adb.shell().some(words => words[0] === 'cat'), false);
  });
});

test('an agent is the bridge\'s own only when an environment entry is exactly its CLASSPATH', async () => {
  const adb = new FakeAdb(api31({ agents: new Map([[4984, 'foreign']]) }));
  const own = await fixtureBytes('api31', 'environ-own-agent.bin');
  // BOOTCLASSPATH and DEX2OATBOOTCLASSPATH also contain "CLASSPATH=": a substring match would be wrong.
  const lookalike = own.replace('CLASSPATH=/data/local/tmp/jev-ios-bridge-agent.dex', 'OLDCLASSPATH=/data/local/tmp/jev-ios-bridge-agent.dex');
  const run = adb.run;
  const driverRunner: AdbRunner = async (args, abort) => args[3] === "'cat' '/proc/4984/environ'"
    ? (adb.calls.push(args), { stdout: lookalike, stderr: '', exitCode: 0 }) : run(args, abort);
  await withDriver(adb, async ({ driver }) => {
    await assert.rejects(driver.prepare(app(), signal()), reason('DEVICE_BUSY'));
    assert.equal(adb.shell().some(words => words[0] === 'kill'), false);
  }, { runner: driverRunner });
});

test('after a crash takeover, the dead holder\'s listed agent and forward are swept, and only those', async () => {
  const adb = new FakeAdb(api31({ agents: new Map([[4675, 'own']]) }));
  adb.forwards = [
    { serial: 'emulator-5554', local: 'tcp:65436', remote: 'localabstract:mobilecli-server' },
    { serial: 'emulator-5556', local: 'tcp:49600', remote: 'localabstract:mobilecli-server' },
  ];
  adb.emulators.set('emulator-5556', api31({ serial: 'emulator-5556', avd: 'Medium_Phone_API_36.1' }));
  adb.devicesText = 'List of devices attached\nemulator-5554          device transport_id:1\nemulator-5556          device transport_id:2\n\n';
  await withDriver(adb, async ({ driver, root }) => {
    await writeFile(join(root, 'JEV-ACTIONS-API31.lock'), JSON.stringify({ pid: deadPid(), token: 'crashed', deviceId: 'jev-actions-api31',
      ownedProcesses: ['agent emulator-5554 4675', 'forward emulator-5554 tcp:65436', 'agent emulator-5560 3562'] }));
    await driver.prepare(app(), signal());
    const sweep = adb.calls.slice(0, adb.calls.findIndex(call => call[3]?.includes('ro.build.version.sdk'))).map(call => call.join(' '));
    assert.deepEqual(sweep.slice(3), [
      "-s emulator-5554 shell 'ps' '-A' '-o' 'PID,NAME,ARGS'",
      "-s emulator-5554 shell 'cat' '/proc/4675/environ'",
      "-s emulator-5554 shell 'kill' '4675'",
      "-s emulator-5554 shell 'cat' '/proc/4675/environ'",
      'forward --list',
      '-s emulator-5554 forward --remove tcp:65436',
    ]);
    assert.deepEqual(adb.forwards.filter(forward => forward.serial === 'emulator-5556').map(forward => forward.local), ['tcp:49600'],
      'the other emulator\'s forward is left alone');
    assert.equal(adb.calls.some(call => call[1] === 'emulator-5560'), false, 'a listed agent on another serial is not swept here');
    assert.equal(driver.preparation().sweptLeftovers, true);
  });
});

test('a listed forward that now points somewhere else isn\'t the dead holder\'s, and is left alone', async () => {
  const adb = new FakeAdb(api31());
  adb.forwards = [{ serial: 'emulator-5554', local: 'tcp:65436', remote: 'tcp:8080' }];
  await withDriver(adb, async ({ driver, root }) => {
    await writeFile(join(root, 'JEV-ACTIONS-API31.lock'), JSON.stringify({ pid: deadPid(), token: 'crashed', deviceId: 'jev-actions-api31',
      ownedProcesses: ['forward emulator-5554 tcp:65436'] }));
    await driver.prepare(app(), signal());
    assert.equal(adb.calls.some(call => call[3] === '--remove'), false);
    assert.equal('sweptLeftovers' in driver.preparation(), false);
  });
});

test('a takeover with nothing left to sweep doesn\'t record sweptLeftovers', async () => {
  const adb = new FakeAdb(api31());
  await withDriver(adb, async ({ driver, root }) => {
    await writeFile(join(root, 'JEV-ACTIONS-API31.lock'), JSON.stringify({ pid: deadPid(), token: 'crashed', deviceId: 'jev-actions-api31',
      ownedProcesses: ['agent emulator-5554 4675', 'forward emulator-5554 tcp:65436'] }));
    await driver.prepare(app(), signal());
    assert.equal(adb.shell().some(words => words[0] === 'kill'), false);
    assert.equal('sweptLeftovers' in driver.preparation(), false);
  });
});

test('a takeover that kills an agent its dead holder never listed records sweptLeftovers', async () => {
  // The holder crashed after starting its agent, before recording the agent's pid.
  const adb = new FakeAdb(api31({ agents: new Map([[4675, 'own']]) }));
  await withDriver(adb, async ({ driver, root }) => {
    await writeFile(join(root, 'JEV-ACTIONS-API31.lock'), JSON.stringify({ pid: deadPid(), token: 'crashed', deviceId: 'jev-actions-api31' }));
    await driver.prepare(app(), signal());
    assert.ok(adb.shell().some(words => words.join(' ') === 'kill 4675'));
    assert.equal(driver.preparation().sweptLeftovers, true);
  });
});

test('a takeover that removes an agent forward its dead holder never listed records sweptLeftovers', async () => {
  const adb = new FakeAdb(api31());
  adb.forwards = [{ serial: 'emulator-5554', local: 'tcp:65436', remote: 'localabstract:mobilecli-server' }];
  await withDriver(adb, async ({ driver, root }) => {
    await writeFile(join(root, 'JEV-ACTIONS-API31.lock'), JSON.stringify({ pid: deadPid(), token: 'crashed', deviceId: 'jev-actions-api31' }));
    await driver.prepare(app(), signal());
    assert.ok(adb.calls.some(call => call.join(' ') === '-s emulator-5554 forward --remove tcp:65436'));
    assert.equal(driver.preparation().sweptLeftovers, true);
  });
});

test('another bridge-owned agent is killed by pid, and this serial\'s agent forwards removed, without sweptLeftovers', async () => {
  const adb = new FakeAdb(api31({ fixtures: 'api36', api: '36', agents: new Map([[9983, 'own']]) }));
  adb.forwards = (await readFile(join(FIXTURES, 'forward-list-two-emulators.txt'), 'utf8')).trim().split('\n')
    .map(line => line.split(' ')).map(([serial, local, remote]) => ({ serial: serial!, local: local!, remote: remote! }));
  adb.forwards.push({ serial: 'emulator-5554', local: 'tcp:5037', remote: 'tcp:5037' });
  await withDriver(adb, async ({ driver }) => {
    await driver.prepare(app(), signal());
    assert.ok(adb.shell().some(words => words.join(' ') === 'kill 9983'));
    const removed = adb.calls.filter(call => call[3] === '--remove').map(call => call.join(' '));
    assert.deepEqual(removed, ['-s emulator-5554 forward --remove tcp:49526']);
    assert.deepEqual(adb.forwards.map(forward => `${forward.serial} ${forward.local}`).sort(),
      ['emulator-5554 tcp:49526', 'emulator-5554 tcp:5037', 'emulator-5556 tcp:65436'],
      'this run\'s new forward, a forward to another socket, and the other emulator\'s forward remain');
    assert.equal('sweptLeftovers' in driver.preparation(), false);
  });
});

test('a bridge-owned agent that won\'t exit is DEVICE_ERROR, and its forward is kept', async () => {
  const adb = new FakeAdb(api31({ agents: new Map([[4675, 'own']]), stubborn: [4675] }));
  adb.forwards = [{ serial: 'emulator-5554', local: 'tcp:65436', remote: 'localabstract:mobilecli-server' }];
  await withDriver(adb, async ({ driver, clock }) => {
    await assert.rejects(driver.prepare(app(), signal()), reason('DEVICE_ERROR', 'adb'));
    assert.ok(clock.now() >= 2_000);
    assert.equal(adb.forwards.length, 1);
    assert.equal(adb.shell().some(words => words[0] === 'am'), false);
  });
});

test('the restart force-stops the app, then starts the named activity with every extra single-quoted', async () => {
  const extras = { note: 'a b "q" \'s\' & ; %', 'user.id': '-42', empty: '' };
  for (const activity of ['.debug.EntryActivity', 'com.example.android.debug.EntryActivity']) {
    const adb = new FakeAdb(api31());
    await withDriver(adb, async ({ driver }) => {
      await driver.prepare(app({ activity, intentExtras: extras }), signal());
      const start = adb.calls.find(call => call[3]?.startsWith("'am' 'start'"))!;
      assert.equal(start[3], `'am' 'start' '-W' '-n' 'com.example.android/${activity}' ` +
        `'--es' 'note' 'a b "q" '\\''s'\\'' & ; %' '--es' 'user.id' '-42' '--es' 'empty' ''`);
      assert.deepEqual(shellWords(start[3]!), ['am', 'start', '-W', '-n', `com.example.android/${activity}`,
        '--es', 'note', extras.note, '--es', 'user.id', '-42', '--es', 'empty', '']);
      const words = adb.shell().map(entry => entry.join(' '));
      assert.ok(words.indexOf('am force-stop com.example.android') < words.findIndex(entry => entry.startsWith('am start')));
      assert.equal(words.some(entry => entry.startsWith('cmd package resolve-activity')), false, 'a named activity needs no lookup');
      assert.equal(words.some(entry => /pm clear|clear-data/.test(entry)), false, 'app data never cleared');
    });
  }
});

test('an am start that reports an error is DEVICE_ERROR with vendorCode adb, even when it exits 0 (API 31)', async () => {
  const adb = new FakeAdb(api31());
  await withDriver(adb, async ({ driver }) => {
    await assert.rejects(driver.prepare(app({ activity: '.NoSuchActivity' }), signal()), reason('DEVICE_ERROR', 'adb'));
    assert.equal(adb.calls.some(call => call[2] === 'push'), false, 'no agent after a failed launch');
  });
});

test('an app with no launcher activity and no app.activity is DEVICE_ERROR with vendorCode adb', async () => {
  const adb = new FakeAdb(api31());
  const run = adb.run;
  const runner: AdbRunner = async (args, abort) => args[3]?.startsWith("'cmd' 'package' 'resolve-activity'")
    ? (adb.calls.push(args), { stdout: await fixture('api31', 'resolve-launcher-none.txt'), stderr: '', exitCode: 0 }) : run(args, abort);
  await withDriver(adb, async ({ driver }) => {
    await assert.rejects(driver.prepare(app(), signal()), (error: unknown) =>
      reason('DEVICE_ERROR', 'adb')(error) && /app\.activity/.test((error as Error).message));
  }, { runner });
});

test('the recorded launcher lookup gives the component am start launches', async () => {
  const adb = new FakeAdb(api31({ installed: ['dev.jevbridge.actionsprobe'] }));
  const run = adb.run;
  const runner: AdbRunner = async (args, abort) => args[3]?.startsWith("'cmd' 'package' 'resolve-activity'")
    ? (adb.calls.push(args), { stdout: await fixture('api31', 'resolve-launcher-actionsprobe.txt'), stderr: '', exitCode: 0 }) : run(args, abort);
  await withDriver(adb, async ({ driver }) => {
    await driver.prepare(app({ package: 'dev.jevbridge.actionsprobe' }), signal());
    assert.ok(adb.shell().some(words => words.join(' ') === 'am start -W -n dev.jevbridge.actionsprobe/.MainActivity'));
  }, { runner });
});

test('a forward that cannot bind is retried on a new free port, up to 3 times', async () => {
  const adb = new FakeAdb(api31());
  adb.busyPorts = new Set([49526, 49527]);
  await withDriver(adb, async ({ driver, root, agents }) => {
    await driver.prepare(app(), signal());
    assert.deepEqual(adb.calls.filter(call => call[2] === 'forward').map(call => call[3]), ['tcp:49526', 'tcp:49527', 'tcp:49528']);
    assert.deepEqual(agents.clients, [49528]);
    assert.deepEqual((await lockFile(root))?.ownedProcesses, ['forward emulator-5554 tcp:49528', 'agent emulator-5554 7001']);
  });
  const stuck = new FakeAdb(api31());
  stuck.busyPorts = new Set([49526, 49527, 49528, 49529]);
  await withDriver(stuck, async ({ driver }) => {
    await assert.rejects(driver.prepare(app(), signal()), reason('DEVICE_ERROR', 'adb'));
    assert.equal(stuck.calls.filter(call => call[2] === 'forward').length, 3);
  });
});

test('device.version is polled every 100 ms until it returns the pinned SHA-256', async () => {
  const adb = new FakeAdb(api31());
  await withDriver(adb, async ({ driver, agents, clock }) => {
    await driver.prepare(app(), signal());
    assert.equal(agents.versionCalls.length, 4);
    assert.deepEqual(clock.sleeps, [100, 100, 100]);
  }, { agents: { answersAfterPolls: 3 } });
});

test('an agent that never answers is DEVICE_ERROR with vendorCode agent after 5 s, and its pid is recorded for close', async () => {
  const adb = new FakeAdb(api31());
  await withDriver(adb, async ({ driver, root, agents, clock }) => {
    await assert.rejects(driver.prepare(app(), signal()), reason('DEVICE_ERROR', 'agent'));
    assert.equal(clock.now(), 5_000);
    assert.equal(agents.versionCalls.length, 51);
    assert.deepEqual((await lockFile(root))?.ownedProcesses, ['forward emulator-5554 tcp:49526', 'agent emulator-5554 7001']);
  }, { agents: { never: true } });
});

test('a device.version request that hangs is bounded by what is left of the 5 s, on the driver\'s clock', async () => {
  const adb = new FakeAdb(api31());
  const clock = fakeClock();
  let calls = 0;
  let endedAt: number | undefined;
  const unused = () => { throw new Error('Not used by prepare'); };
  const agentClient = (): DeviceAgentClient => ({
    async version(abort) {
      if (++calls === 1) { await clock.sleep(2_000); throw new DeviceAgentError(); }
      // Hangs until its signal ends it, as a request to a stuck agent would until its own 10 s limit, while time runs on.
      const ended = new Promise<never>((_resolve, reject) => {
        abort.addEventListener('abort', () => { endedAt = clock.now(); reject(new Error('abandoned')); }, { once: true });
      });
      void clock.sleep(10_000);
      return ended;
    },
    dumpUi: unused, tap: unused, swipe: unused, keys: unused, text: unused, button: unused,
    clipboardSet: unused, clipboardClear: unused, screenshot: unused,
  });
  await withDriver(adb, async ({ driver }) => {
    await assert.rejects(driver.prepare(app(), signal()), reason('DEVICE_ERROR', 'agent'));
    assert.equal(endedAt, 5_000, 'the hung request ended with the 5 s, not its own 10 s limit');
  }, { clock, agentClient });
});

test('an agent answering with another SHA-256 is not the pinned agent', async () => {
  const adb = new FakeAdb(api31());
  await withDriver(adb, async ({ driver }) => {
    await assert.rejects(driver.prepare(app(), signal()), reason('DEVICE_ERROR', 'agent'));
  }, { agents: { sha256: 'f'.repeat(64) } });
});

test('a foreign agent found when the agent never answers is DEVICE_BUSY', async () => {
  const adb = new FakeAdb(api31({ agentStarts: false }));
  adb.onCall = args => {
    if (args[2] === 'forward' && args[3] !== '--remove') adb.emulators.get('emulator-5554')!.agents = new Map([[10252, 'foreign']]);
  };
  await withDriver(adb, async ({ driver }) => {
    await assert.rejects(driver.prepare(app(), signal()), reason('DEVICE_BUSY'));
    assert.equal(adb.shell().some(words => words[0] === 'kill'), false);
  });
});

test('a cancel stops prepare before its next device command', async () => {
  const adb = new FakeAdb(api31());
  const controller = new AbortController();
  adb.onCall = args => { if (args[3] === "'am' 'force-stop' 'com.example.android'") controller.abort(new Error('cancelled')); };
  await withDriver(adb, async ({ driver }) => {
    await assert.rejects(driver.prepare(app(), controller.signal));
    assert.equal(adb.calls.at(-1)![3], "'am' 'force-stop' 'com.example.android'");
  });
});

test('preparation(), observe and act before prepare are refused, and close before prepare does nothing', async () => {
  await withDriver(new FakeAdb(api31()), async ({ driver, agents, adb }) => {
    assert.throws(() => driver.preparation(), /not prepared/);
    await assert.rejects(driver.observe(signal()), /not prepared/);
    await assert.rejects(driver.act({ kind: 'tap', targetRef: 'e1' }, snapshotOf([]), { ...app(), values: {} }, signal()), /not prepared/);
    await driver.close(signal());
    assert.deepEqual(agents.calls, []);
    assert.deepEqual(adb.calls, []);
  });
});

/* observe and act (Issue 15): the same fakes, a fake clock and a temporary screenshot folder. */

const AGENT_FIXTURES = join(import.meta.dirname, 'fixtures', 'android');
type Hierarchy = AndroidNode[];
const hierarchyOf = async (name: string): Promise<Hierarchy> =>
  (JSON.parse(await readFile(join(AGENT_FIXTURES, name), 'utf8')) as { hierarchy: Hierarchy }).hierarchy;
const captureOf = async (name: string): Promise<Hierarchy> => (JSON.parse((JSON.parse(
  await readFile(join(AGENT_FIXTURES, 'captures', name), 'utf8')) as { data: { rawData: string } }).data.rawData) as { hierarchy: Hierarchy }).hierarchy;
/** The tree with the node whose resource-id is `id` changed by `patch`. */
function withNode(tree: Hierarchy, id: string, patch: Partial<AndroidNode>): Hierarchy {
  const copy = structuredClone(tree);
  const visit = (nodes: Hierarchy): boolean => nodes.some(node => {
    if (node['resource-id'] === id) { Object.assign(node, patch); return true; }
    return visit(node.children ?? []);
  });
  assert.ok(visit(copy), `no node ${id}`);
  return copy;
}
/** The tree with the node whose resource-id is `id` showing `text`. */
const withText = (tree: Hierarchy, id: string, text: string) => withNode(tree, id, { text });
/** The text fields tree with no resource-ids, nothing focused, and `patch` applied to the city field. */
async function anonymousFields(patch: Partial<AndroidNode> = {}): Promise<Hierarchy> {
  let tree = withNode(await hierarchyOf('text-fields.json'), 'field.password', { focused: false });
  tree = withNode(tree, 'field.city', patch);
  for (const id of ['field.notes', 'field.password', 'field.spaces', 'field.city', 'field.empty']) tree = withNode(tree, id, { 'resource-id': '' });
  return tree;
}
const cityOf = (snapshot: Snapshot) => {
  const city = snapshot.elements.find(element => element.label === 'City');
  assert.ok(city);
  return city.ref;
};
const snapshotOf = (elements: Snapshot['elements']): Snapshot =>
  ({ deviceId: 'emulator-5554', capturedAt: 0, expiresAt: 0, sequence: 0, elements, truncated: false });
const refOf = (snapshot: Snapshot, identifier: string) => {
  const element = snapshot.elements.find(candidate => candidate.identifier === identifier);
  assert.ok(element, `no element ${identifier}`);
  return element.ref;
};
const values = (typed: Record<string, string>) => ({ ...app(), values: typed });
const DUMP = { method: 'device.dump.ui', params: { waitUntilIdle: 2000 } };
const SHOT = { method: 'device.screenshot', params: { format: 'jpeg', maxSize: 800 } };
/** What each settled snapshot costs when the screen holds still: two captures, then its screenshot. */
const SETTLED = [DUMP, DUMP, SHOT];
const CLEAR = [
  { method: 'device.io.keys', params: { keys: [{ keycode: 'KEYCODE_A', modifiers: ['KEYCODE_CTRL_LEFT'] }] } },
  { method: 'device.io.keys', params: { keys: [{ keycode: 'KEYCODE_DEL' }] } },
];

interface Acting extends Setup { shots: string }

/** A prepared driver whose agent shows `screens`, saving screenshots to their own temporary folder. */
async function withPrepared(screens: Hierarchy[], fn: (setup: Acting) => Promise<void>): Promise<void> {
  const shots = await mkdtemp(join(tmpdir(), 'jev-android-shots-'));
  try {
    await withDriver(new FakeAdb(api31()), async setup => {
      await setup.driver.prepare(app(), signal());
      await fn({ ...setup, shots });
    }, { screenshotFolder: shots, agents: { screens } });
  } finally {
    await rm(shots, { recursive: true, force: true });
  }
}

test('observe settles device.dump.ui, maps it, and saves one screenshot of the settled snapshot', async () => {
  const fields = await hierarchyOf('text-fields.json');
  await withPrepared([fields], async ({ driver, agents, clock, shots }) => {
    const snapshot = await driver.observe(signal());
    assert.deepEqual(agents.calls, SETTLED);
    assert.deepEqual(clock.sleeps.slice(-1), [250]);
    assert.deepEqual(snapshot.elements, mapAndroidTree({ hierarchy: fields }));
    assert.equal(snapshot.screenHash, screenHash({ hierarchy: fields }));
    assert.equal(snapshot.deviceId, 'emulator-5554');
    assert.equal(snapshot.truncated, false);
    assert.equal('settled' in snapshot, false);
    assert.equal(snapshot.screenshotPath, join(shots, 'screen-1.jpg'));
    assert.equal(await readFile(snapshot.screenshotPath, 'utf8'), 'jpeg-1');
  });
});

test('each observation has a fresh sequence and its own screenshot file', async () => {
  await withPrepared([await hierarchyOf('text-fields.json')], async ({ driver, shots }) => {
    const first = await driver.observe(signal());
    const second = await driver.observe(signal());
    assert.ok(second.sequence > first.sequence);
    assert.notEqual(first.screenshotPath, second.screenshotPath);
    assert.deepEqual((await readdir(shots)).sort(), ['screen-1.jpg', 'screen-2.jpg']);
    assert.equal(await readFile(second.screenshotPath!, 'utf8'), 'jpeg-2');
  });
});

test('a screen still changing at the 3 s cap gives the last capture, marked settled: false', async () => {
  const fields = await hierarchyOf('text-fields.json');
  const changing = Array.from({ length: 20 }, (_, index) => withText(fields, 'field.empty', String(index)));
  await withPrepared(changing, async ({ driver, agents }) => {
    const snapshot = await driver.observe(signal());
    const dumps = agents.calls.filter(call => call.method === 'device.dump.ui').length;
    assert.equal(dumps, 12);
    assert.equal(snapshot.settled, false);
    assert.equal(snapshot.elements.find(element => element.identifier === 'field.empty')?.value, '11');
    assert.equal(agents.calls.filter(call => call.method === 'device.screenshot').length, 1);
  });
});

test('a tap lands on the element\'s centre in whole numbers, and act returns the settled snapshot after it, with its screenshot', async () => {
  const choose = await captureOf('twin-1-choose.json');
  const added = await captureOf('twin-2-apple-added.json');
  await withPrepared([choose, choose, added], async ({ driver, agents, shots }) => {
    const before = await driver.observe(signal());
    agents.calls.length = 0;
    const after = await driver.act({ kind: 'tap', targetRef: refOf(before, 'choose.apple') }, before, values({}), signal());
    assert.deepEqual(agents.calls, [{ method: 'device.io.tap', params: { x: 540, y: 549 } }, ...SETTLED]);
    assert.ok(after && !isActOutcome(after));
    assert.equal(after.screenHash, screenHash({ hierarchy: added }));
    assert.ok(after.sequence > before.sequence);
    assert.equal(after.screenshotPath, join(shots, 'screen-2.jpg'));
  });
});

test('a reference from an older snapshot is refused with StaleSnapshotError, and nothing reaches the device', async () => {
  await withPrepared([await captureOf('twin-1-choose.json')], async ({ driver, agents }) => {
    const older = await driver.observe(signal());
    await driver.observe(signal());
    agents.calls.length = 0;
    await assert.rejects(driver.act({ kind: 'tap', targetRef: refOf(older, 'choose.apple') }, older, values({}), signal()), StaleSnapshotError);
    assert.deepEqual(agents.calls, []);
  });
});

test('once an action is issued, the snapshot it targeted is stale, even when the settle after it fails', async () => {
  const choose = await captureOf('twin-1-choose.json');
  await withPrepared([choose], async ({ driver, agents }) => {
    const snapshot = await driver.observe(signal());
    const tap = { kind: 'tap', targetRef: refOf(snapshot, 'choose.apple') } as const;
    agents.hooks.onCall = call => { if (call.method === 'device.dump.ui') throw new DeviceAgentError(); };
    await assert.rejects(driver.act(tap, snapshot, values({}), signal()), reason('DEVICE_ERROR', 'agent'));
    agents.hooks.onCall = undefined;
    agents.calls.length = 0;
    await assert.rejects(driver.act(tap, snapshot, values({}), signal()), StaleSnapshotError);
    assert.deepEqual(agents.calls, []);
  });
});

test('a reference absent from the snapshot is StaleSnapshotError', async () => {
  await withPrepared([await captureOf('twin-1-choose.json')], async ({ driver, agents }) => {
    const snapshot = await driver.observe(signal());
    agents.calls.length = 0;
    await assert.rejects(driver.act({ kind: 'tap', targetRef: 'e999' }, snapshot, values({}), signal()), StaleSnapshotError);
    assert.deepEqual(agents.calls, []);
  });
});

test('an action the element doesn\'t offer is UNSUPPORTED_ACTION, and a missing value MISSING_VALUE, before any device call', async () => {
  await withPrepared([await hierarchyOf('text-fields.json')], async ({ driver, agents }) => {
    const snapshot = await driver.observe(signal());
    agents.calls.length = 0;
    const field = refOf(snapshot, 'field.empty');
    await assert.rejects(driver.act({ kind: 'swipe', targetRef: field, direction: 'up' }, snapshot, values({}), signal()), reason('UNSUPPORTED_ACTION'));
    await assert.rejects(driver.act({ kind: 'type', targetRef: field, valueKey: 'absent' }, snapshot, values({}), signal()), reason('MISSING_VALUE'));
    assert.deepEqual(agents.calls, []);
  });
});

test('replace text taps the field, sends ctrl+a and backspace as two calls 0.2 s apart, then types ASCII unchanged, leading dash included', async () => {
  const fields = await hierarchyOf('text-fields.json');
  await withPrepared([fields, fields, withText(fields, 'field.empty', '-42.5')], async ({ driver, agents, clock }) => {
    const snapshot = await driver.observe(signal());
    agents.calls.length = 0;
    const at: [string, number][] = [];
    agents.hooks.onCall = call => { at.push([call.method, clock.now()]); };
    await driver.act({ kind: 'type', targetRef: refOf(snapshot, 'field.empty'), valueKey: 'amount' }, snapshot, values({ amount: '-42.5' }), signal());
    assert.deepEqual(agents.calls, [
      { method: 'device.io.tap', params: { x: 540, y: 1099 } },
      ...CLEAR,
      { method: 'device.io.text', params: { text: '-42.5' } },
      ...SETTLED,
    ]);
    const [first, second] = at.filter(([method]) => method === 'device.io.keys').map(([, time]) => time);
    assert.equal(second! - first!, 200);
  });
});

test('replace text sends Vietnamese through the clipboard: set, paste, then clear, and never device.io.text', async () => {
  const fields = await hierarchyOf('text-fields.json');
  await withPrepared([fields, fields, withText(fields, 'field.city', 'Tiếng Việt')], async ({ driver, agents }) => {
    const snapshot = await driver.observe(signal());
    agents.calls.length = 0;
    const outcome = await driver.act({ kind: 'type', targetRef: refOf(snapshot, 'field.city'), valueKey: 'city' }, snapshot,
      values({ city: 'Tiếng Việt' }), signal());
    assert.deepEqual(agents.calls, [
      { method: 'device.io.tap', params: { x: 540, y: 936 } },
      ...CLEAR,
      { method: 'device.clipboard.set', params: { text: 'Tiếng Việt' } },
      { method: 'device.io.button', params: { button: 'KEYCODE_PASTE' } },
      { method: 'device.clipboard.clear' },
      ...SETTLED,
    ]);
    assert.ok(outcome && isActOutcome(outcome));
    assert.equal(outcome.shownValue, 'Tiếng Việt');
  });
});

test('replace text returns the settled snapshot and the field\'s shown value, keeping a trailing space', async () => {
  const fields = await hierarchyOf('text-fields.json');
  const typed = withText(fields, 'field.empty', 'Ha Noi ');
  await withPrepared([fields, fields, typed], async ({ driver }) => {
    const snapshot = await driver.observe(signal());
    const outcome = await driver.act({ kind: 'type', targetRef: refOf(snapshot, 'field.empty'), valueKey: 'city' }, snapshot,
      values({ city: 'Ha Noi ' }), signal());
    assert.ok(outcome && isActOutcome(outcome));
    assert.equal(outcome.shownValue, 'Ha Noi ');
    assert.equal(outcome.screen.screenHash, screenHash({ hierarchy: typed }));
    assert.equal('settled' in outcome.screen, false);
    assert.ok(outcome.screen.screenshotPath);
  });
});

test('a shown value that differs from the typed value doesn\'t fail the step', async () => {
  const fields = await hierarchyOf('text-fields.json');
  await withPrepared([fields, fields, withText(fields, 'field.empty', '(555) 123-4567')], async ({ driver }) => {
    const snapshot = await driver.observe(signal());
    const outcome = await driver.act({ kind: 'type', targetRef: refOf(snapshot, 'field.empty'), valueKey: 'phone' }, snapshot,
      values({ phone: '5551234567' }), signal());
    assert.ok(outcome && isActOutcome(outcome));
    assert.equal(outcome.shownValue, '(555) 123-4567');
  });
});

test('a password field\'s shown value is the mapping\'s dots, never its text', async () => {
  const fields = await hierarchyOf('text-fields.json');
  await withPrepared([fields, fields, withText(fields, 'field.password', 'hunter2')], async ({ driver }) => {
    const snapshot = await driver.observe(signal());
    const outcome = await driver.act({ kind: 'type', targetRef: refOf(snapshot, 'field.password'), valueKey: 'secret' }, snapshot,
      values({ secret: 'hunter2' }), signal());
    assert.ok(outcome && isActOutcome(outcome));
    assert.equal(outcome.shownValue, '•••••••');
  });
});

test('a replace-text still changing at the cap carries settled: false on its screen', async () => {
  const fields = await hierarchyOf('text-fields.json');
  const changing = Array.from({ length: 20 }, (_, index) => withText(fields, 'field.empty', `x${String(index)}`));
  await withPrepared([fields, fields, ...changing], async ({ driver }) => {
    const snapshot = await driver.observe(signal());
    const outcome = await driver.act({ kind: 'type', targetRef: refOf(snapshot, 'field.empty'), valueKey: 'v' }, snapshot, values({ v: 'x' }), signal());
    assert.ok(outcome && isActOutcome(outcome));
    assert.equal(outcome.screen.settled, false);
    assert.equal(outcome.shownValue, 'x11');
  });
});

test('an abandoned replace-text issues no further call once close begins', async () => {
  const fields = await hierarchyOf('text-fields.json');
  await withPrepared([fields], async ({ driver, agents }) => {
    const snapshot = await driver.observe(signal());
    agents.calls.length = 0;
    let closing: Promise<void> | undefined;
    // close waits for the abandoned act, so it is begun here and awaited once the act has stopped.
    agents.hooks.onCall = call => { if (call.method === 'device.io.keys') closing ??= driver.close(signal()); };
    await assert.rejects(driver.act({ kind: 'type', targetRef: refOf(snapshot, 'field.city'), valueKey: 'city' }, snapshot,
      values({ city: 'Tiếng Việt' }), signal()), /closing/);
    await closing;
    assert.deepEqual(agents.calls, [{ method: 'device.io.tap', params: { x: 540, y: 936 } }, CLEAR[0]]);
  });
});

test('a cancelled replace-text stops at its next call', async () => {
  const fields = await hierarchyOf('text-fields.json');
  await withPrepared([fields], async ({ driver, agents }) => {
    const snapshot = await driver.observe(signal());
    agents.calls.length = 0;
    const controller = new AbortController();
    agents.hooks.onCall = call => { if (call.method === 'device.clipboard.set') controller.abort(new Error('cancelled')); };
    await assert.rejects(driver.act({ kind: 'type', targetRef: refOf(snapshot, 'field.city'), valueKey: 'city' }, snapshot,
      values({ city: 'Tiếng Việt' }), controller.signal), /cancelled/);
    assert.equal(agents.calls.at(-1)?.method, 'device.clipboard.set');
  });
});

test('a swipe runs along the element\'s centre line from 90% to 10% of its length, over 1000 ms, the finger moving in the swipe\'s direction', async () => {
  const lists = await hierarchyOf('api36-lists-scrollable.json');
  await withPrepared([lists], async ({ driver, agents }) => {
    // list.lazy: x 21, y 305, 1038 × 683.
    const expected = {
      up: { x1: 540, y1: 920, x2: 540, y2: 373 },
      down: { x1: 540, y1: 373, x2: 540, y2: 920 },
      left: { x1: 955, y1: 647, x2: 125, y2: 647 },
      right: { x1: 125, y1: 647, x2: 955, y2: 647 },
    } as const;
    for (const direction of ['up', 'down', 'left', 'right'] as const) {
      const snapshot = await driver.observe(signal());
      agents.calls.length = 0;
      const after = await driver.act({ kind: 'swipe', targetRef: refOf(snapshot, 'list.lazy'), direction }, snapshot, values({}), signal());
      assert.deepEqual(agents.calls, [{ method: 'device.io.swipe', params: { ...expected[direction], duration: 1000 } }, ...SETTLED], direction);
      assert.ok(after && !isActOutcome(after));
    }
  });
});

test('replace text with an empty value only clears the field', async () => {
  const fields = await hierarchyOf('text-fields.json');
  await withPrepared([fields, fields, withText(fields, 'field.city', '')], async ({ driver, agents }) => {
    const snapshot = await driver.observe(signal());
    agents.calls.length = 0;
    const outcome = await driver.act({ kind: 'type', targetRef: refOf(snapshot, 'field.city'), valueKey: 'city' }, snapshot, values({ city: '' }), signal());
    assert.deepEqual(agents.calls, [{ method: 'device.io.tap', params: { x: 540, y: 936 } }, ...CLEAR, ...SETTLED]);
    assert.ok(outcome && isActOutcome(outcome));
    assert.equal(outcome.shownValue, '');
  });
});

test('a field whose identifier is gone after typing is found as the one focused text field', async () => {
  const fields = await hierarchyOf('text-fields.json');
  const typed = withNode(withNode(withText(fields, 'field.city', 'Hue'), 'field.password', { focused: false }),
    'field.city', { focused: true, 'resource-id': 'field.city.editing' });
  await withPrepared([fields, fields, typed], async ({ driver }) => {
    const snapshot = await driver.observe(signal());
    const outcome = await driver.act({ kind: 'type', targetRef: refOf(snapshot, 'field.city'), valueKey: 'city' }, snapshot, values({ city: 'Hue' }), signal());
    assert.ok(outcome && isActOutcome(outcome));
    assert.equal(outcome.shownValue, 'Hue');
  });
});

test('a field with no identifier and no focus is found by its frame', async () => {
  const before = await anonymousFields();
  await withPrepared([before, before, await anonymousFields({ text: 'Hue' })], async ({ driver }) => {
    const snapshot = await driver.observe(signal());
    const outcome = await driver.act({ kind: 'type', targetRef: cityOf(snapshot), valueKey: 'city' }, snapshot, values({ city: 'Hue' }), signal());
    assert.ok(outcome && isActOutcome(outcome));
    assert.equal(outcome.shownValue, 'Hue');
  });
});

test('when no field is surely the typed one, act returns the settled snapshot without a shown value', async () => {
  const before = await anonymousFields();
  const moved = await anonymousFields({ text: 'Hue', rect: { x: 21, y: 862, width: 1038, height: 294 } });
  await withPrepared([before, before, moved], async ({ driver }) => {
    const snapshot = await driver.observe(signal());
    const after = await driver.act({ kind: 'type', targetRef: cityOf(snapshot), valueKey: 'city' }, snapshot, values({ city: 'Hue' }), signal());
    assert.ok(after && !isActOutcome(after));
    assert.equal(after.screenHash, screenHash({ hierarchy: moved }));
  });
});

/* close (Issue 16): the same fakes; `close` undoes only what this run did, and keeps the lease until it can show nothing is left. */

/** A promise the test opens by hand, to hold a fake command in flight. */
function gate(): { opened: Promise<void>; open(): void } {
  let open!: () => void;
  const opened = new Promise<void>(resolveOpened => { open = resolveOpened; });
  return { opened, open };
}
/** Waits, on the real clock, until `check` holds. */
async function eventually(check: () => boolean | Promise<boolean>, what: string): Promise<void> {
  for (let tries = 0; tries < 200; tries++) {
    if (await check()) return;
    await new Promise(resolveTick => setTimeout(resolveTick, 10));
  }
  assert.fail(`never: ${what}`);
}
/** A signal that aborts after `ms`, as `close`'s time limit does, on a timer that keeps the test running. */
function expiring(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => { controller.abort(new Error('close\'s time limit')); }, ms);
  return controller.signal;
}
const closeFailed = (code: string) => (error: unknown) => reason(code)(error);
/** What `close` sends after a full `prepare`: the fence by pid, the app stop, then the forward's removal. */
const CLOSE_AFTER_PREPARE = [
  "-s emulator-5554 shell 'ps' '-A' '-o' 'PID,NAME,ARGS'",
  "-s emulator-5554 shell 'cat' '/proc/7001/environ'",
  "-s emulator-5554 shell 'kill' '7001'",
  "-s emulator-5554 shell 'cat' '/proc/7001/environ'",
  "-s emulator-5554 shell 'am' 'force-stop' 'com.example.android'",
  '-s emulator-5554 forward --remove tcp:49526',
];
const callsFrom = (adb: FakeAdb, from: number) => adb.calls.slice(from).map(call => call.join(' '));

test('close fences the agent by pid, stops the app, removes the forward, then releases the lease, leaving the agent file', async () => {
  const fields = await hierarchyOf('text-fields.json');
  await withPrepared([fields], async ({ driver, adb, root, agents }) => {
    await driver.observe(signal());
    const before = adb.calls.length;
    const agentCalls = agents.calls.length;
    await driver.close(signal());
    assert.deepEqual(callsFrom(adb, before), CLOSE_AFTER_PREPARE);
    assert.equal(agents.calls.length, agentCalls, 'close sends the agent nothing');
    assert.equal(adb.emulators.get('emulator-5554')!.agents!.size, 0, 'no agent left');
    assert.deepEqual(adb.forwards, [], 'no forward left');
    assert.deepEqual(await readdir(root), [], 'lease released');
    assert.equal(adb.calls.some(call => call.join(' ').includes(`rm`) || call.join(' ').includes('pkill')), false, 'the agent file stays');
    await driver.close(signal());
    assert.equal(adb.calls.length, before + CLOSE_AFTER_PREPARE.length, 'a second close does nothing');
  });
});

test('close tolerates an agent already gone, an app not running and a forward already removed', async () => {
  await withDriver(new FakeAdb(api31()), async ({ driver, adb, root }) => {
    await driver.prepare(app(), signal());
    adb.emulators.get('emulator-5554')!.agents!.clear();
    adb.forwards = [];
    const before = adb.calls.length;
    await driver.close(signal());
    assert.deepEqual(callsFrom(adb, before), [
      "-s emulator-5554 shell 'ps' '-A' '-o' 'PID,NAME,ARGS'",
      "-s emulator-5554 shell 'am' 'force-stop' 'com.example.android'",
      '-s emulator-5554 forward --remove tcp:49526',
    ]);
    assert.deepEqual(await readdir(root), []);
  });
});

test('a DEVICE_BUSY refusal followed by close: the foreign agent keeps running, the app isn\'t stopped, the lease is released', async () => {
  const adb = new FakeAdb(api31({ agents: new Map([[4984, 'foreign']]) }));
  await withDriver(adb, async ({ driver, root }) => {
    await assert.rejects(driver.prepare(app(), signal()), reason('DEVICE_BUSY'));
    const before = adb.calls.length;
    await driver.close(signal());
    assert.deepEqual(callsFrom(adb, before), [], 'close is a no-op after a refusal before the restart');
    assert.ok(adb.emulators.get('emulator-5554')!.agents!.has(4984));
    assert.equal(adb.shell().some(words => words[0] === 'am' || words[0] === 'kill'), false);
    assert.deepEqual(await readdir(root), []);
  });
});

test('a foreign agent found after the restart: close fences only the bridge\'s own agent and stops the app it restarted', async () => {
  const adb = new FakeAdb(api31());
  adb.onCall = args => {
    if (args[2] === 'forward' && args[3] !== '--remove') adb.emulators.get('emulator-5554')!.agents!.set(10252, 'foreign');
  };
  await withDriver(adb, async ({ driver, root }) => {
    await assert.rejects(driver.prepare(app(), signal()), reason('DEVICE_BUSY'));
    adb.onCall = undefined;
    await driver.close(signal());
    assert.deepEqual([...adb.emulators.get('emulator-5554')!.agents!.keys()], [10252], 'the foreign agent keeps running');
    assert.deepEqual(adb.shell().filter(words => words[0] === 'kill').map(words => words[1]), ['7001']);
    assert.equal(adb.shell().filter(words => words.join(' ') === 'am force-stop com.example.android').length, 2);
    assert.deepEqual(await readdir(root), []);
  });
});

test('a cancel while the agent is starting: close waits for the start command, then fences the agent it started', async () => {
  const adb = new FakeAdb(api31());
  const start = gate();
  const controller = new AbortController();
  let closing: Promise<void> | undefined;
  await withDriver(adb, async ({ driver, root }) => {
    adb.onCall = async args => {
      if (args[3] !== AGENT_START_COMMAND) return;
      // The run is cancelled and abandons prepare, then closes while the start command is still running.
      controller.abort(new Error('cancelled'));
      closing = driver.close(signal());
      await start.opened;
    };
    const preparing = driver.prepare(app(), controller.signal);
    await eventually(() => closing !== undefined, 'close begun');
    await new Promise(resolveTick => setTimeout(resolveTick, 20));
    assert.equal(adb.calls.at(-1)![3], AGENT_START_COMMAND, 'close sends nothing while the start command runs');
    const started = adb.calls.length;
    start.open();
    await assert.rejects(preparing);
    await closing;
    assert.deepEqual(callsFrom(adb, started), [
      "-s emulator-5554 shell 'ps' '-A' '-o' 'PID,NAME,ARGS'",
      "-s emulator-5554 shell 'cat' '/proc/7001/environ'",
      "-s emulator-5554 shell 'kill' '7001'",
      "-s emulator-5554 shell 'cat' '/proc/7001/environ'",
      "-s emulator-5554 shell 'am' 'force-stop' 'com.example.android'",
    ], 'no forward was made, so none is removed');
    assert.equal(adb.emulators.get('emulator-5554')!.agents!.size, 0, 'no agent left');
    assert.deepEqual(await readdir(root), []);
  });
});

test('after close begins, an abandoned prepare issues no further device command', async () => {
  const adb = new FakeAdb(api31());
  const stop = gate();
  let closing: Promise<void> | undefined;
  await withDriver(adb, async ({ driver, root }) => {
    adb.onCall = async args => {
      if (args[3] !== "'am' 'force-stop' 'com.example.android'" || closing) return;
      closing = driver.close(signal());
      await stop.opened;
    };
    const preparing = driver.prepare(app(), signal());
    await eventually(() => closing !== undefined, 'close begun');
    const stopped = adb.calls.length;
    stop.open();
    await assert.rejects(preparing, /closing/);
    await closing;
    assert.deepEqual(callsFrom(adb, stopped), ["-s emulator-5554 shell 'am' 'force-stop' 'com.example.android'"],
      'only close\'s own app stop follows: no launch, no push, no agent');
    assert.deepEqual(await readdir(root), []);
  });
});

test('a cancel during am start -W: the app is stopped only after the launch returns', async () => {
  const adb = new FakeAdb(api31());
  const launch = gate();
  const controller = new AbortController();
  let closing: Promise<void> | undefined;
  await withDriver(adb, async ({ driver, root }) => {
    adb.onCall = async args => {
      if (!args[3]?.startsWith("'am' 'start' '-W'")) return;
      controller.abort(new Error('cancelled'));
      closing = driver.close(signal());
      await launch.opened;
    };
    const preparing = driver.prepare(app(), controller.signal);
    await eventually(() => closing !== undefined, 'close begun');
    await new Promise(resolveTick => setTimeout(resolveTick, 20));
    const stops = () => adb.shell().filter(words => words.join(' ') === 'am force-stop com.example.android').length;
    assert.equal(stops(), 1, 'only the restart\'s stop while the launch runs');
    launch.open();
    await assert.rejects(preparing);
    await closing;
    const words = adb.shell().map(entry => entry.join(' '));
    assert.equal(stops(), 2);
    assert.ok(words.lastIndexOf('am force-stop com.example.android') > words.findIndex(entry => entry.startsWith('am start -W')));
    assert.deepEqual(await readdir(root), []);
  });
});

/**
 * The production `adb` runner over a fake spawn: each child answers as `FakeAdb` does (its `onCall` may hold
 * it), then exits with that status.
 */
function productionRunner(adb: FakeAdb): AdbRunner {
  // The child runs once spawn has returned, as a real one does, so the runner is listening for an abort by then.
  const spawned = fakeSpawn((child, args) => {
    setImmediate(() => {
      void adb.run([...args], new AbortController().signal).then(result => { child.exit(result.exitCode, result.stdout, result.stderr); });
    });
  });
  return adbRunner({ adb: '/sdk/platform-tools/adb', environment: {}, spawn: spawned.spawn });
}

test('on the production runner, a cancel during am start -W: close waits for the launch to return, then stops the app and releases the lease', async () => {
  const adb = new FakeAdb(api31());
  const launch = gate();
  const controller = new AbortController();
  let closing: Promise<void> | undefined;
  await withDriver(adb, async ({ driver, root }) => {
    adb.onCall = async args => {
      if (!args[3]?.startsWith("'am' 'start' '-W'")) return;
      controller.abort(new Error('cancelled'));
      closing = driver.close(signal());
      await launch.opened;
    };
    const preparing = driver.prepare(app(), controller.signal);
    await eventually(() => closing !== undefined, 'close begun');
    await new Promise(resolveTick => setTimeout(resolveTick, 20));
    assert.equal(adb.calls.at(-1)![3]?.startsWith("'am' 'start' '-W'"), true, 'close sends nothing while the launch runs');
    const launched = adb.calls.length;
    launch.open();
    await assert.rejects(preparing, /cancelled/);
    await closing;
    assert.deepEqual(callsFrom(adb, launched), ["-s emulator-5554 shell 'am' 'force-stop' 'com.example.android'"],
      'no agent was started and no forward made, so only the app stop follows');
    assert.deepEqual(await readdir(root), [], 'lease released');
  }, { runner: productionRunner(adb) });
});

test('on the production runner, a cancel during the agent start: close waits for the start command, then fences the agent it started', async () => {
  const adb = new FakeAdb(api31());
  const start = gate();
  const controller = new AbortController();
  let closing: Promise<void> | undefined;
  await withDriver(adb, async ({ driver, root }) => {
    adb.onCall = async args => {
      if (args[3] !== AGENT_START_COMMAND) return;
      controller.abort(new Error('cancelled'));
      closing = driver.close(signal());
      await start.opened;
    };
    const preparing = driver.prepare(app(), controller.signal);
    await eventually(() => closing !== undefined, 'close begun');
    await new Promise(resolveTick => setTimeout(resolveTick, 20));
    assert.equal(adb.calls.at(-1)![3], AGENT_START_COMMAND, 'close sends nothing while the start command runs');
    const started = adb.calls.length;
    start.open();
    await assert.rejects(preparing, /cancelled/);
    await closing;
    assert.deepEqual(callsFrom(adb, started), [
      "-s emulator-5554 shell 'ps' '-A' '-o' 'PID,NAME,ARGS'",
      "-s emulator-5554 shell 'cat' '/proc/7001/environ'",
      "-s emulator-5554 shell 'kill' '7001'",
      "-s emulator-5554 shell 'cat' '/proc/7001/environ'",
      "-s emulator-5554 shell 'am' 'force-stop' 'com.example.android'",
    ]);
    assert.equal(adb.emulators.get('emulator-5554')!.agents!.size, 0, 'no agent left');
    assert.deepEqual(await readdir(root), [], 'lease released');
  }, { runner: productionRunner(adb) });
});

test('an agent request that times out is ended by the fence, and the lease is released', async () => {
  const fields = await hierarchyOf('text-fields.json');
  await withPrepared([fields], async ({ driver, agents, root }) => {
    const snapshot = await driver.observe(signal());
    agents.hooks.onCall = call => { if (call.method === 'device.io.tap') throw new OutcomeUnknownError('agent', 'The device agent request timed out'); };
    await assert.rejects(driver.act({ kind: 'tap', targetRef: refOf(snapshot, 'field.city') }, snapshot, values({}), signal()), OutcomeUnknownError);
    await driver.close(signal());
    assert.deepEqual(await readdir(root), []);
  });
});

test('close waits for an agent request still running, then its fence ends the request\'s unknown outcome', async () => {
  const fields = await hierarchyOf('text-fields.json');
  await withPrepared([fields], async ({ driver, agents, adb, root }) => {
    const snapshot = await driver.observe(signal());
    const request = gate();
    agents.hooks.onCall = async call => {
      if (call.method !== 'device.io.tap') return;
      await request.opened;
      throw new OutcomeUnknownError('agent', 'The device agent request timed out');
    };
    const acting = driver.act({ kind: 'tap', targetRef: refOf(snapshot, 'field.city') }, snapshot, values({}), signal());
    await eventually(() => agents.calls.at(-1)?.method === 'device.io.tap', 'tap sent');
    const before = adb.calls.length;
    const closing = driver.close(signal());
    await new Promise(resolveTick => setTimeout(resolveTick, 20));
    assert.equal(adb.calls.length, before, 'no fence while the request runs');
    request.open();
    await assert.rejects(acting, OutcomeUnknownError);
    await closing;
    assert.deepEqual(callsFrom(adb, before), CLOSE_AFTER_PREPARE);
    assert.deepEqual(await readdir(root), []);
  });
});

test('an agent request that times out keeps the lease when the fence can\'t be confirmed', async () => {
  const fields = await hierarchyOf('text-fields.json');
  await withPrepared([fields], async ({ driver, agents, adb, root, clock }) => {
    const snapshot = await driver.observe(signal());
    agents.hooks.onCall = call => { if (call.method === 'device.io.tap') throw new OutcomeUnknownError('agent', 'The device agent request timed out'); };
    await assert.rejects(driver.act({ kind: 'tap', targetRef: refOf(snapshot, 'field.city') }, snapshot, values({}), signal()), OutcomeUnknownError);
    adb.emulators.get('emulator-5554')!.stubborn = [7001];
    const before = adb.calls.length;
    await assert.rejects(driver.close(signal()), closeFailed('UI_ACTION_UNCONFIRMED'));
    assert.ok(clock.now() >= 2_000);
    assert.equal(callsFrom(adb, before).some(call => call.includes('force-stop') || call.includes('--remove')), false,
      'nothing after an unconfirmed fence');
    assert.equal((await readdir(root)).length, 1, 'lease kept');
    assert.deepEqual((await lockFile(root))?.ownedProcesses, ['forward emulator-5554 tcp:49526', 'agent emulator-5554 7001']);
  });
});

test('an adb command still running at close\'s limit keeps the lease, which is released late once it exits', async () => {
  const adb = new FakeAdb(api31());
  const launch = gate();
  await withDriver(adb, async ({ driver, root }) => {
    adb.onCall = async args => { if (args[3]?.startsWith("'am' 'start' '-W'")) await launch.opened; };
    const preparing = driver.prepare(app(), signal());
    await eventually(() => adb.calls.some(call => call[3]?.startsWith("'am' 'start' '-W'")), 'am start issued');
    await assert.rejects(driver.close(expiring(20)), closeFailed('UI_ACTION_UNCONFIRMED'));
    assert.equal((await readdir(root)).length, 1, 'lease kept');
    launch.open();
    await assert.rejects(preparing, /closing/);
    await eventually(async () => (await readdir(root)).length === 0, 'the lease released late');
    const words = adb.shell().map(entry => entry.join(' '));
    assert.equal(words.at(-1), 'am force-stop com.example.android', 'the late close finished the cleanup');
  });
});

test('an adb command that never exits keeps the lease', async () => {
  const adb = new FakeAdb(api31());
  await withDriver(adb, async ({ driver, root }) => {
    adb.onCall = args => args[3]?.startsWith("'am' 'start' '-W'") ? new Promise<void>(() => {}) : undefined;
    void driver.prepare(app(), signal()).catch(() => undefined);
    await eventually(() => adb.calls.some(call => call[3]?.startsWith("'am' 'start' '-W'")), 'am start issued');
    await assert.rejects(driver.close(expiring(20)), closeFailed('UI_ACTION_UNCONFIRMED'));
    await new Promise(resolveTick => setTimeout(resolveTick, 50));
    assert.equal((await readdir(root)).length, 1, 'lease kept');
  });
});

test('an adb command killed with no exit status keeps the lease, and close sends nothing more', async () => {
  const adb = new FakeAdb(api31());
  const run = adb.run;
  const runner: AdbRunner = async (args, abort) => args[3]?.startsWith("'am' 'start' '-W'")
    ? (adb.calls.push(args), Promise.reject(new OutcomeUnknownError('adb', 'adb was killed (SIGKILL); its outcome is unknown'))) : run(args, abort);
  await withDriver(adb, async ({ driver, root }) => {
    await assert.rejects(driver.prepare(app(), signal()), OutcomeUnknownError);
    const before = adb.calls.length;
    await assert.rejects(driver.close(signal()), closeFailed('UI_ACTION_UNCONFIRMED'));
    assert.deepEqual(callsFrom(adb, before), []);
    assert.equal((await readdir(root)).length, 1, 'lease kept');
  }, { runner });
});

test('a failed cleanup step keeps the lease and fails close', async () => {
  const adb = new FakeAdb(api31());
  const run = adb.run;
  const runner: AdbRunner = async (args, abort) => args[2] === 'forward' && args[3] === '--remove'
    ? (adb.calls.push(args), { stdout: '', stderr: 'adb: error: device offline\n', exitCode: 1 }) : run(args, abort);
  await withDriver(adb, async ({ driver, root }) => {
    await driver.prepare(app(), signal());
    await assert.rejects(driver.close(signal()), closeFailed('DEVICE_ERROR'));
    assert.equal((await readdir(root)).length, 1, 'lease kept');
    assert.deepEqual((await lockFile(root))?.ownedProcesses, ['forward emulator-5554 tcp:49526'], 'the agent was fenced and disowned; the forward stays owned');
  }, { runner });
});

test('without a screenshot folder, the driver\'s own temporary folder is removed on close', async () => {
  const fields = await hierarchyOf('text-fields.json');
  await withDriver(new FakeAdb(api31()), async ({ driver }) => {
    await driver.prepare(app(), signal());
    const { screenshotPath } = await driver.observe(signal());
    assert.match(screenshotPath!, /jev-android-screens-/);
    await readFile(screenshotPath!);
    await driver.close(signal());
    await assert.rejects(readFile(screenshotPath!), { code: 'ENOENT' });
  }, { screenshotFolder: undefined, agents: { screens: [fields] } });
});

/* The end-to-end run (Issue 16): runScriptedScenario with the real Android driver, the fake adb and the fake agent. */

/** What `prepare` sends to an emulator named by serial, with nothing to sweep and a launcher activity to look up. */
const PREPARE_BY_SERIAL = [
  'devices -l',
  "-s emulator-5554 shell 'getprop' 'ro.boot.qemu.avd_name'",
  "-s emulator-5554 shell 'ps' '-A' '-o' 'PID,NAME,ARGS'",
  'forward --list',
  "-s emulator-5554 shell 'getprop' 'ro.build.version.sdk'",
  "-s emulator-5554 shell 'getprop' 'sys.boot_completed'",
  "-s emulator-5554 shell 'pm' 'path' 'com.example.android'",
  "-s emulator-5554 shell 'dumpsys' 'window' 'policy'",
  "-s emulator-5554 shell 'am' 'force-stop' 'com.example.android'",
  "-s emulator-5554 shell 'cmd' 'package' 'resolve-activity' '--brief' '-a' 'android.intent.action.MAIN' '-c' 'android.intent.category.LAUNCHER' 'com.example.android'",
  "-s emulator-5554 shell 'am' 'start' '-W' '-n' 'com.example.android/.MainActivity'",
  `-s emulator-5554 push ${AGENT_CACHE} /data/local/tmp/jev-ios-bridge-agent.dex`,
  START.join(' '),
  '-s emulator-5554 forward tcp:49526 localabstract:mobilecli-server',
  "-s emulator-5554 shell 'ps' '-A' '-o' 'PID,NAME,ARGS'",
  "-s emulator-5554 shell 'cat' '/proc/7001/environ'",
];
const CITY = 'Ha Noi ';
const cityScript = () => androidScript({
  device: { serial: 'emulator-5554' },
  values: { city: CITY },
  steps: [
    { id: 'type-city', kind: 'action', guard: { present: [{ identifier: 'field.empty' }] },
      action: { kind: 'replaceText', selector: { identifier: 'field.empty' }, valueKey: 'city' } },
    { id: 'verify', kind: 'checkpoint', guard: { present: [{ identifier: 'field.empty' }] },
      assertions: [{ id: 'city-shown', claim: 'The city field shows the typed city.' }] },
  ],
});
const judgeAllTrue: ScriptedJudge = { async judge() { return { probabilities: { 'city-shown': 0.97 }, inputTokens: 1, latencyMs: 1, model: 'jev-1.13.0' }; } };
const eventsOf = async (root: string, runId: string) =>
  (await readFile(join(root, runId, 'run.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line) as RunEvent);

test('an Android script with a replace-text step and a checkpoint runs to a verdict with the real driver, and cleans up after itself', async () => {
  const fields = await hierarchyOf('text-fields.json');
  const typed = withText(fields, 'field.empty', CITY);
  const script = cityScript();
  await withRunLog('android-end-to-end', async (log, evidence) => {
    await withDriver(new FakeAdb(api31()), async ({ driver, adb, agents, root }) => {
      // The real driver, watched only for the shown values its act returns.
      const shownValues: unknown[] = [];
      const watched: DeviceDriver = { prepare: (...args) => driver.prepare(...args), observe: (...args) => driver.observe(...args),
        close: (...args) => driver.close(...args), preparation: () => driver.preparation(),
        act: async (...args) => {
          const outcome = await driver.act(...args);
          if (isActOutcome(outcome)) shownValues.push(outcome.shownValue);
          return outcome;
        } };
      const report = await runScriptedScenario({ runId: 'android-end-to-end', scenario: script, driver: watched, judge: judgeAllTrue, log });
      assert.equal(report.verdict, 'passed');
      assert.deepEqual(shownValues, [CITY], 'the shown value keeps its trailing space');

      assert.deepEqual(adb.calls.map(call => call.join(' ')), [...PREPARE_BY_SERIAL, ...CLOSE_AFTER_PREPARE]);
      assert.deepEqual(agents.calls, [
        ...SETTLED,
        { method: 'device.io.tap', params: { x: 540, y: 1099 } },
        ...CLEAR,
        { method: 'device.io.text', params: { text: CITY } },
        ...SETTLED,
      ]);

      const events = await eventsOf(evidence, 'android-end-to-end');
      const of = (type: string) => events.filter(event => event.type === type).map(event => event.data);
      assert.deepEqual(of('prepared').map(({ prepareDurationMs: _duration, ...data }) => data),
        [{ deviceIdentity: 'jev-actions-api31', serial: 'emulator-5554', agentSha256: PINNED_AGENT_SHA256 }]);
      const [action] = of('action');
      // A trimmed shown value ("Ha Noi") would escape the mask; the one the driver kept, trailing space included, doesn't.
      assert.equal(action?.shownValue, '[REDACTED]');
      assert.equal(action?.action, 'replaceText');
      const raw = await readFile(join(evidence, 'android-end-to-end', 'run.jsonl'), 'utf8');
      assert.equal(raw.includes('Ha Noi'), false, 'the typed value never reaches run.jsonl');
      const steps = of('step');
      assert.equal(steps.some(step => 'settled' in step), false, 'every observation settled');
      // One screenshot per observation (the checkpoint judges the screen the action returned), copied into the evidence.
      const shots = steps.map(step => step.screenshotPath as string);
      assert.equal(shots.length, 2);
      for (const [index, name] of shots.entries()) {
        assert.match(name, /^screen-\d+\.jpg$/);
        assert.equal(await readFile(join(evidence, 'android-end-to-end', name), 'utf8'), `jpeg-${String(index + 1)}`);
      }

      assert.deepEqual(await readdir(root), [], 'lease released');
      assert.equal(adb.emulators.get('emulator-5554')!.agents!.size, 0, 'no agent left');
      assert.deepEqual(adb.forwards, [], 'no forward left');
      assert.equal(adb.calls.at(-2)?.join(' '), "-s emulator-5554 shell 'am' 'force-stop' 'com.example.android'", 'the restarted app stopped');
    }, { device: { serial: 'emulator-5554' }, screenshotFolder: undefined, agents: { screens: [fields, fields, typed] } });
  }, { values: [CITY] });
});

test('a run whose cleanup fails doesn\'t pass: it ends inconclusive with CLEANUP_FAILED and keeps the lease', async () => {
  const fields = await hierarchyOf('text-fields.json');
  const adb = new FakeAdb(api31());
  const run = adb.run;
  const runner: AdbRunner = async (args, abort) => args[2] === 'forward' && args[3] === '--remove'
    ? (adb.calls.push(args), { stdout: '', stderr: 'adb: error: device offline\n', exitCode: 1 }) : run(args, abort);
  await withRunLog('android-cleanup-failed', async (log) => {
    await withDriver(adb, async ({ driver, root }) => {
      const report = await runScriptedScenario({ runId: 'android-cleanup-failed', scenario: cityScript(), driver, judge: judgeAllTrue, log });
      assert.deepEqual([report.verdict, report.reason], ['inconclusive', 'CLEANUP_FAILED']);
      assert.equal((await readdir(root)).length, 1, 'lease kept');
    }, { device: { serial: 'emulator-5554' }, screenshotFolder: undefined, runner, agents: { screens: [fields, fields, withText(fields, 'field.empty', CITY)] } });
  }, { values: [CITY] });
});

/* Phase 5 (Issue 19): the logcat streams, close's step 4 and the takeover sweep of a crashed run's streams. */

type WatchOptions = Parameters<NonNullable<AndroidDriverOptions['createExitWatch']>>[0];
/** A fake app watch: it records what the driver tells it, as `(watch) …` in the fake `adb`'s calls where order matters. */
function fakeWatches(adb: FakeAdb) {
  const made: { options: WatchOptions; lines: string[]; launched: (number | undefined)[]; ended: number; answer: boolean | undefined }[] = [];
  const createExitWatch = (options: WatchOptions): AppExitWatch => {
    const state = { options, lines: [] as string[], launched: [] as (number | undefined)[], ended: 0, answer: true as boolean | undefined };
    made.push(state);
    return {
      feed: raw => { state.lines.push(raw); },
      launched: pid => { state.launched.push(pid); },
      expectStop: () => { adb.calls.push(['(watch)', 'expectStop']); },
      streamEnded: () => { state.ended++; },
      running: () => state.answer,
      problem: () => undefined,
    };
  };
  return { made, createExitWatch };
}

interface Logging extends Setup {
  folder: string;
  watches: ReturnType<typeof fakeWatches>;
}

/** The driver with a log folder in a fresh temporary folder, the run ID `run-1` and a fake app watch. */
async function withLogs(adb: FakeAdb, fn: (setup: Logging) => Promise<void>,
  options: Parameters<typeof withDriver>[2] = {}): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), 'jev-android-logs-'));
  const folder = join(parent, 'jev-android-logs');
  const watches = fakeWatches(adb);
  try {
    await withDriver(adb, async setup => { await fn({ ...setup, folder, watches }); },
      { device: { serial: 'emulator-5554' }, logFolder: folder, runId: 'run-1', createExitWatch: watches.createExitWatch, ...options });
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

const APP_LOG = ['(logcat)', '-s', 'emulator-5554', 'logcat', '-v', 'threadtime,year,uid', '--uid=10226', '-T', '1759075200.123'];
const EVENTS = ['(logcat)', '-s', 'emulator-5554', 'logcat', '-b', 'events', '-v', 'threadtime,year', '-T', '1759075200.123',
  'am_proc_start:I', 'am_proc_died:I', 'am_crash:I', 'am_anr:I', 'am_kill:I', '*:S'];

test('prepare reads the uid and device time and starts both streams after the restart\'s force-stop and before am start -W, then runs pidof once', async () => {
  const adb = new FakeAdb(api31());
  await withLogs(adb, async ({ driver, folder, watches, root }) => {
    await driver.prepare(app(), signal());
    const calls = adb.calls.map(call => call.join(' '));
    const from = calls.indexOf("-s emulator-5554 shell 'dumpsys' 'window' 'policy'");
    // After the force-stop, so a crash the previous instance logged before it is stamped before the start time.
    assert.deepEqual(calls.slice(from + 1, calls.indexOf(`-s emulator-5554 push ${AGENT_CACHE} /data/local/tmp/jev-ios-bridge-agent.dex`)), [
      "-s emulator-5554 shell 'am' 'force-stop' 'com.example.android'",
      "-s emulator-5554 shell 'cmd' 'package' 'resolve-activity' '--brief' '-a' 'android.intent.action.MAIN' '-c' 'android.intent.category.LAUNCHER' 'com.example.android'",
      "-s emulator-5554 shell 'pm' 'list' 'packages' '-U'",
      "-s emulator-5554 shell 'date' '+%s.%3N %z'",
      APP_LOG.join(' '),
      EVENTS.join(' '),
      "-s emulator-5554 shell 'am' 'start' '-W' '-n' 'com.example.android/.MainActivity'",
      "-s emulator-5554 shell 'pidof' 'com.example.android'",
    ]);
    assert.equal(calls.filter(call => call.includes("'pidof'")).length, 1, 'pidof once');
    assert.deepEqual(watches.made.map(watch => watch.options), [{ package: 'com.example.android', startTime: 1759075200.123, utcOffsetMinutes: 420 }]);
    assert.deepEqual(watches.made[0]!.launched, [9784]);
    assert.deepEqual(driver.logSources(), { logcat: join(folder, 'run-1.log') });
    assert.equal((await lstat(folder)).mode & 0o777, 0o700, 'the log folder is 0700');
    assert.deepEqual((await lockFile(root))?.ownedProcesses,
      ['logcat emulator-5554 8001', 'logcat emulator-5554 8002', 'forward emulator-5554 tcp:49526', 'agent emulator-5554 7001']);
  });
});

test('a negative UTC offset reaches the app watch in minutes', async () => {
  const adb = new FakeAdb(api31({ deviceTime: '1759075200.004 -0530' }));
  await withLogs(adb, async ({ driver, watches }) => {
    await driver.prepare(app(), signal());
    assert.deepEqual(watches.made[0]!.options, { package: 'com.example.android', startTime: 1759075200.004, utcOffsetMinutes: -330 });
  });
});

test('the uid is an exact match on the whole package: a package that prefixes another gets its own uid', async () => {
  const packagesText = ['package:com.example.app.debug uid:10300', 'package:com.example.appx uid:10301',
    'package:com.example.app uid:10299', 'package:com.android.settings uid:1000', ''].join('\n');
  const adb = new FakeAdb(api31({ installed: ['com.example.app', 'com.example.app.debug'], packagesText }));
  await withLogs(adb, async ({ driver, streams }) => {
    await driver.prepare(app({ package: 'com.example.app' }), signal());
    assert.ok(streams.streams[0]!.args.includes('--uid=10299'));
    assert.equal(adb.shell().some(words => words.join(' ').startsWith('pm list packages -U com')), false, 'never passed as a filter');
  });
});

test('a missing uid starts only the events stream: no pane source, and the run goes on', async () => {
  const adb = new FakeAdb(api31({ packagesText: 'package:com.example.android.debug uid:10300\n' }));
  await withLogs(adb, async ({ driver, streams, watches }) => {
    await driver.prepare(app(), signal());
    assert.deepEqual(streams.streams.map(stream => ['(logcat)', ...stream.args]), [EVENTS]);
    assert.deepEqual(driver.logSources(), {});
    assert.deepEqual(watches.made[0]!.launched, [9784]);
  });
});

test('a device time that can\'t be read starts no stream and no pidof, and the run goes on with no pane source', async () => {
  const adb = new FakeAdb(api31({ deviceTime: 'date: bad format' }));
  await withLogs(adb, async ({ driver, streams }) => {
    await driver.prepare(app(), signal());
    assert.deepEqual(streams.streams, []);
    assert.equal(adb.shell().some(words => words[0] === 'pidof'), false);
    assert.deepEqual(driver.logSources(), {});
    assert.equal(driver.appRunning(), undefined);
    assert.ok(driver.preparation());
  });
});

test('streams that fail to start are skipped, and the run goes on with no pane source and no app watch', async () => {
  const adb = new FakeAdb(api31());
  await withLogs(adb, async ({ driver, streams, root }) => {
    streams.fails = () => true;
    await driver.prepare(app(), signal());
    assert.deepEqual(driver.logSources(), {});
    assert.equal(driver.appRunning(), undefined);
    assert.equal(adb.shell().some(words => words[0] === 'pidof'), false);
    assert.equal((await lockFile(root))?.ownedProcesses?.some(entry => entry.startsWith('logcat')), false);
  });
});

test('a log folder that is a symlink or another user\'s is refused: no stream, no uid read, and the run goes on', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'jev-android-logs-refused-'));
  try {
    await mkdir(join(parent, 'real'), { mode: 0o700 });
    await symlink(join(parent, 'real'), join(parent, 'link'));
    await writeFile(join(parent, 'file'), '');
    for (const refused of ['link', 'file']) {
      const adb = new FakeAdb(api31());
      await withLogs(adb, async ({ driver, streams }) => {
        await driver.prepare(app(), signal());
        assert.deepEqual(streams.streams, [], refused);
        assert.equal(adb.shell().some(words => words[0] === 'pm' && words[1] === 'list'), false, refused);
        assert.deepEqual(driver.logSources(), {});
        await driver.close(signal());
      }, { logFolder: join(parent, refused) });
    }
    assert.deepEqual(await readdir(join(parent, 'real')), [], 'nothing written through the link');
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test('prepare deletes log files older than 3 days, and keeps newer ones', async () => {
  const adb = new FakeAdb(api31());
  await withLogs(adb, async ({ driver, folder }) => {
    await mkdir(folder, { mode: 0o700 });
    const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1_000);
    for (const [name, age] of [['old-run.log', daysAgo(4)], ['recent-run.log', daysAgo(1)]] as const) {
      await writeFile(join(folder, name), '', { mode: 0o600 });
      await utimes(join(folder, name), age, age);
    }
    await driver.prepare(app(), signal());
    assert.deepEqual((await readdir(folder)).sort(), ['recent-run.log', 'run-1.log']);
  });
});

test('appRunning is the app watch\'s answer, and undefined with no watch', async () => {
  const adb = new FakeAdb(api31());
  await withLogs(adb, async ({ driver, streams, watches }) => {
    await driver.prepare(app(), signal());
    assert.equal(driver.appRunning(), true);
    watches.made[0]!.answer = false;
    assert.equal(driver.appRunning(), false);
    const events = streams.streams[1]!;
    assert.equal(typeof events.output, 'function');
    (events.output as (line: string) => void)('09-28 23:22:55.001  680  700 I am_proc_died: [0,9784,com.example.android,0,2]');
    assert.deepEqual(watches.made[0]!.lines, ['09-28 23:22:55.001  680  700 I am_proc_died: [0,9784,com.example.android,0,2]']);
  });
  await withLogs(new FakeAdb(api31()), async ({ driver }) => {
    await driver.prepare(app(), signal());
    assert.equal(driver.appRunning(), undefined);
  }, { createExitWatch: undefined });
});

test('an events stream that ends by itself tells the app watch; one close stops doesn\'t', async () => {
  const adb = new FakeAdb(api31());
  await withLogs(adb, async ({ driver, streams, watches }) => {
    await driver.prepare(app(), signal());
    streams.streams[1]!.end();
    await eventually(() => watches.made[0]!.ended === 1, 'the watch heard the stream end');
    await driver.close(signal());
  });
  const second = new FakeAdb(api31());
  await withLogs(second, async ({ driver, watches }) => {
    await driver.prepare(app(), signal());
    await driver.close(signal());
    await new Promise(resolveTurn => setImmediate(resolveTurn));
    assert.equal(watches.made[0]!.ended, 0);
  });
});

test('observe carries the app log\'s tail as logTails.logcat', async () => {
  const fields = await hierarchyOf('text-fields.json');
  const adb = new FakeAdb(api31());
  await withLogs(adb, async ({ driver, folder }) => {
    await driver.prepare(app(), signal());
    const line = '2026-09-28 23:16:14.927 10226  9784  9784 I System.out: hello from the app\n';
    await writeFile(join(folder, 'run-1.log'), `${'x'.repeat(5_000)}\n${line}`);
    const snapshot = await driver.observe(signal());
    assert.equal(snapshot.logTails?.logcat?.length, 4_096);
    assert.ok(snapshot.logTails?.logcat?.endsWith(line));
    await driver.close(signal());
  }, { agents: { screens: [fields] } });
});

test('close stops both running streams after the app stop and before the forward, disowns them, and releases the lease', async () => {
  const adb = new FakeAdb(api31());
  await withLogs(adb, async ({ driver, streams, root }) => {
    await driver.prepare(app(), signal());
    const before = adb.calls.length;
    await driver.close(signal());
    assert.deepEqual(callsFrom(adb, before), [
      ...CLOSE_AFTER_PREPARE.slice(0, 4),
      '(watch) expectStop',
      "-s emulator-5554 shell 'am' 'force-stop' 'com.example.android'",
      '(stop) 8001',
      '(stop) 8002',
      '-s emulator-5554 forward --remove tcp:49526',
    ]);
    assert.equal(streams.streams.some(stream => stream.running), false, 'no stream left');
    assert.deepEqual(await readdir(root), [], 'lease released');
  });
});

test('close tolerates a stream that already ended', async () => {
  const adb = new FakeAdb(api31());
  await withLogs(adb, async ({ driver, streams, root }) => {
    await driver.prepare(app(), signal());
    streams.streams[0]!.end();
    await driver.close(signal());
    assert.equal(adb.calls.some(call => call.join(' ') === '(stop) 8001'), false);
    assert.ok(adb.calls.some(call => call.join(' ') === '(stop) 8002'));
    assert.deepEqual(await readdir(root), [], 'lease released');
  });
});

test('a stream that won\'t stop fails close and keeps the lease, with the stream still in the holder record', async () => {
  const adb = new FakeAdb(api31());
  await withLogs(adb, async ({ driver, streams, root }) => {
    await driver.prepare(app(), signal());
    streams.stubborn.add(8002);
    await assert.rejects(driver.close(signal()), reason('DEVICE_ERROR', 'adb'));
    assert.deepEqual((await lockFile(root))?.ownedProcesses, ['logcat emulator-5554 8002', 'forward emulator-5554 tcp:49526']);
  });
});

test('close stops every stream, even past one that won\'t stop, then fails and keeps the lease', async () => {
  const adb = new FakeAdb(api31());
  await withLogs(adb, async ({ driver, streams, root }) => {
    await driver.prepare(app(), signal());
    streams.stubborn.add(8001);
    await assert.rejects(driver.close(signal()), reason('DEVICE_ERROR', 'adb'));
    assert.ok(adb.calls.some(call => call.join(' ') === '(stop) 8002'), 'the second stream was stopped too');
    assert.equal(streams.streams[1]!.running, false);
    assert.deepEqual((await lockFile(root))?.ownedProcesses, ['logcat emulator-5554 8001', 'forward emulator-5554 tcp:49526']);
  });
});

test('a stream start that resolves after close began is stopped by close, which then releases the lease', async () => {
  const adb = new FakeAdb(api31());
  await withLogs(adb, async ({ driver, streams, root }) => {
    const starting = gate();
    streams.held = starting.opened;
    const prepared = driver.prepare(app(), signal());
    await eventually(() => streams.streams.length === 1, 'the app log\'s start in flight');
    const closed = driver.close(signal());
    starting.open();
    await assert.rejects(prepared);
    await closed;
    assert.deepEqual(streams.streams.map(stream => stream.running), [false], 'the late stream stopped, and no other started');
    assert.deepEqual(await readdir(root), [], 'lease released');
  });
});

test('a stream start that resolves after close\'s limit keeps the lease, and the late close stops it and releases', async () => {
  const adb = new FakeAdb(api31());
  await withLogs(adb, async ({ driver, streams, root }) => {
    const starting = gate();
    streams.held = starting.opened;
    const prepared = driver.prepare(app(), signal());
    await eventually(() => streams.streams.length === 1, 'the app log\'s start in flight');
    await assert.rejects(driver.close(expiring(20)), closeFailed('UI_ACTION_UNCONFIRMED'));
    assert.ok((await readdir(root)).length > 0, 'lease kept');
    starting.open();
    await assert.rejects(prepared);
    await eventually(async () => (await readdir(root)).length === 0, 'the lease released late');
    assert.equal(streams.streams[0]!.running, false);
  });
});

test('a started stream the holder record can\'t list is stopped before prepare fails', async () => {
  const adb = new FakeAdb(api31());
  await withLogs(adb, async ({ driver, streams, root }) => {
    const starting = gate();
    streams.held = starting.opened;
    const prepared = driver.prepare(app(), signal());
    await eventually(() => streams.streams.length === 1, 'the app log\'s start in flight');
    // The holder record can't be rewritten: the lease root refuses new files.
    await chmod(root, 0o500);
    try {
      starting.open();
      await assert.rejects(prepared);
      assert.equal(streams.streams[0]!.running, false, 'stopped, not left unlisted');
      assert.equal(streams.streams.length, 1, 'no other stream started');
    } finally { await chmod(root, 0o700); }
    await driver.close(signal());
    assert.deepEqual(await readdir(root), [], 'lease released');
  });
});

test('close stops the streams even when the restart failed', async () => {
  const adb = new FakeAdb(api31());
  const run = adb.run;
  const runner: AdbRunner = async (args, abort) => args[3]?.startsWith("'am' 'start'")
    ? (adb.calls.push(args), { stdout: await fixture('api31', 'am-start-W-no-activity.txt'), stderr: '', exitCode: 0 }) : run(args, abort);
  await withLogs(adb, async ({ driver, streams, root }) => {
    await assert.rejects(driver.prepare(app(), signal()), reason('DEVICE_ERROR', 'adb'));
    await driver.close(signal());
    assert.equal(streams.streams.length, 2);
    assert.equal(streams.streams.some(stream => stream.running), false);
    assert.deepEqual(await readdir(root), [], 'lease released');
  }, { runner });
});

test('after a crash takeover, a dead holder\'s leftover streams are killed, a reused pid is left alone, and every entry is disowned', async () => {
  const adb = new FakeAdb(api31());
  await withLogs(adb, async ({ driver, streams, root }) => {
    streams.mac.set(5001, '/sdk/platform-tools/adb -s emulator-5554 logcat -v threadtime,year,uid --uid=10226 -T 1759075100.000');
    streams.mac.set(5002, '/usr/bin/python3 server.py');
    streams.mac.set(5004, '/sdk/platform-tools/adb -s emulator-5556 logcat -b events');
    await writeFile(join(root, 'JEV-ACTIONS-API31.lock'), JSON.stringify({ pid: deadPid(), token: 'crashed', deviceId: 'jev-actions-api31',
      ownedProcesses: ['logcat emulator-5554 5001', 'logcat emulator-5554 5002', 'logcat emulator-5554 5003', 'logcat emulator-5554 5004'] }));
    await driver.prepare(app(), signal());
    assert.deepEqual(streams.killed, [5001]);
    assert.deepEqual([...streams.mac.keys()], [5002, 5004], 'a reused pid and another serial\'s stream are left running');
    assert.equal(driver.preparation().sweptLeftovers, true);
    assert.deepEqual((await lockFile(root))?.ownedProcesses,
      ['logcat emulator-5554 8001', 'logcat emulator-5554 8002', 'forward emulator-5554 tcp:49526', 'agent emulator-5554 7001'],
      'only this run\'s own entries');
    await driver.close(signal());
  });
});

test('a takeover whose dead holder\'s streams are all gone records no sweptLeftovers', async () => {
  const adb = new FakeAdb(api31());
  await withLogs(adb, async ({ driver, streams, root }) => {
    await writeFile(join(root, 'JEV-ACTIONS-API31.lock'), JSON.stringify({ pid: deadPid(), token: 'crashed', deviceId: 'jev-actions-api31',
      ownedProcesses: ['logcat emulator-5554 5001'] }));
    await driver.prepare(app(), signal());
    assert.deepEqual(streams.killed, []);
    assert.equal('sweptLeftovers' in driver.preparation(), false);
    await driver.close(signal());
  });
});

test('a leftover stream that won\'t die fails prepare and keeps the lease, with the entry still listed', async () => {
  const adb = new FakeAdb(api31());
  await withLogs(adb, async ({ driver, streams, root }) => {
    streams.mac.set(5001, '/sdk/platform-tools/adb -s emulator-5554 logcat -b events');
    streams.kill = async () => { throw new Error('logcat 5001 did not exit'); };
    await writeFile(join(root, 'JEV-ACTIONS-API31.lock'), JSON.stringify({ pid: deadPid(), token: 'crashed', deviceId: 'jev-actions-api31',
      ownedProcesses: ['logcat emulator-5554 5001'] }));
    await assert.rejects(driver.prepare(app(), signal()), reason('DEVICE_ERROR', 'adb'));
    assert.deepEqual((await lockFile(root))?.ownedProcesses, ['logcat emulator-5554 5001']);
  });
});

test('an Android run with both streams running to close passes: prepared names the logcat file, and the step\'s tail is redacted', async () => {
  const fields = await hierarchyOf('text-fields.json');
  await withRunLog('android-logcat-run', async (log, evidence) => {
    await withLogs(new FakeAdb(api31()), async ({ driver, streams, folder, root }) => {
      // The app logs the typed value; the fake stream starter wrote nothing, so the test writes the line itself.
      const watched: DeviceDriver = { prepare: async (...args) => {
        await driver.prepare(...args);
        await writeFile(join(folder, 'run-1.log'), `2026-09-28 23:16:14.927 10226  9784  9784 I System.out: city is ${CITY}\n`);
      }, observe: (...args) => driver.observe(...args), act: (...args) => driver.act(...args), close: (...args) => driver.close(...args),
      preparation: () => driver.preparation(), logSources: () => driver.logSources(), appRunning: () => driver.appRunning() };
      const report = await runScriptedScenario({ runId: 'android-logcat-run', scenario: cityScript(), driver: watched, judge: judgeAllTrue, log });
      assert.equal(report.verdict, 'passed');
      const events = await eventsOf(evidence, 'android-logcat-run');
      assert.deepEqual(events.find(event => event.type === 'prepared')?.data.logSources, { logcat: join(folder, 'run-1.log') });
      const tails = events.filter(event => event.type === 'step').map(event => (event.data.logTails as Record<string, string> | undefined)?.logcat);
      assert.ok(tails.length > 0 && tails.every(tail => tail === '2026-09-28 23:16:14.927 10226  9784  9784 I System.out: city is [REDACTED]\n'));
      assert.equal((await readFile(join(evidence, 'android-logcat-run', 'run.jsonl'), 'utf8')).includes('Ha Noi'), false);
      assert.equal(streams.streams.length, 2);
      assert.equal(streams.streams.some(stream => stream.running), false, 'both streams stopped');
      assert.deepEqual(await readdir(root), [], 'lease released');
    }, { agents: { screens: [fields, fields, withText(fields, 'field.empty', CITY)] }, screenshotFolder: undefined });
  }, { values: [CITY] });
});

/* Phase 5 (Issue 20): the run end to end, on the driver the factory builds: the real app watch, fed the events
   lines recorded on the emulators (`tests/fixtures/android/logcat/`), and the log file named by the run's ID. */

const LOGCAT_CAPTURES = join(import.meta.dirname, 'fixtures', 'android', 'logcat');
const LOGPROBE = 'dev.jevbridge.logprobe';

/**
 * Run `cityScript()` for the log probe app through the driver factory. The events stream is fed the capture's
 * lines before `lateFrom` once the first screen is read, and the rest while the city is typed; `screens` are
 * what the agent shows. The app log gets one line holding the typed value. Resolves with what the test checks.
 */
async function runCaptured(capture: string, options: { pid: string; lateFrom?: number; screens: Hierarchy[] }) {
  const recorded = (await readFile(join(LOGCAT_CAPTURES, capture, 'events.log'), 'utf8')).split('\n').filter(line => line !== '');
  const lateFrom = options.lateFrom ?? recorded.length;
  const adb = new FakeAdb(api31({ installed: [LOGPROBE], appPids: options.pid }));
  const agents = fakeAgents(adb, { screens: options.screens });
  const streams = new FakeStreams(adb);
  const parent = await mkdtemp(join(tmpdir(), 'jev-android-end-to-end-'));
  const leaseRoot = join(parent, 'lease');
  const folder = join(parent, 'jev-android-logs');
  await mkdir(leaseRoot);
  const ports = [49526];
  const runId = `android-${capture}`;
  const holderAtForwardRemoval: (string[] | undefined)[] = [];
  adb.onCall = async args => {
    if (args[2] === 'forward' && args[3] === '--remove') holderAtForwardRemoval.push((await lockFile(leaseRoot))?.ownedProcesses);
  };
  const feed = (lines: string[]) => { for (const line of lines) (streams.streams[1]!.output as (raw: string) => void)(line); };
  let dumps = 0;
  agents.hooks.onCall = async call => {
    if (call.method === 'device.dump.ui' && ++dumps === 1) {
      feed(recorded.slice(0, lateFrom));
      await writeFile(join(folder, `${runId}.log`), `2026-09-28 23:16:14.927 10226  9784  9784 I System.out: city is ${CITY}\n`);
    }
    if (call.method === 'device.io.text') feed(recorded.slice(lateFrom));
  };
  const createDriver = createDriverFactory({
    mobileBuildMcp: { cwd: parent, lockRoot: parent, runner: async () => assert.fail('an Android script never reaches the iOS driver') },
    android: { runner: adb.run, agentClient: agents.agentClient, clock: fakeClock(), leaseRoot, freePort: async () => ports.shift()!,
      logcat: streams, logFolder: folder,
      tools: async () => ({ adb: '/sdk/platform-tools/adb', agent: { path: AGENT_CACHE, sha256: PINNED_AGENT_SHA256 } }) },
  });
  const scenario = { ...cityScript(), app: { package: LOGPROBE } };
  try {
    return await withRunLog(runId, async (log, evidence) => {
      const report = await runScriptedScenario({ runId, scenario, driver: createDriver(scenario, { runId }), judge: judgeAllTrue, log });
      const events = await eventsOf(evidence, runId);
      return {
        report, events, folder, runId, holderAtForwardRemoval,
        raw: await readFile(join(evidence, runId, 'run.jsonl'), 'utf8'),
        streamsStarted: streams.streams.length,
        streamsRunning: streams.streams.filter(stream => stream.running).length,
        leaseFiles: await readdir(leaseRoot),
        agentsLeft: adb.emulators.get('emulator-5554')!.agents!.size,
        forwardsLeft: adb.forwards.length,
      };
    }, { values: [CITY] });
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

/** Every run, whatever its verdict: both streams stopped, the holder record emptied, and the lease released. */
function assertCleanedUp(run: Awaited<ReturnType<typeof runCaptured>>): void {
  assert.equal(run.streamsStarted, 2);
  assert.equal(run.streamsRunning, 0, 'both streams stopped');
  // The forward is close's last step, disowned once removed; then the lease, holder record and all, is released.
  assert.deepEqual(run.holderAtForwardRemoval, [['forward emulator-5554 tcp:49526']], 'both streams and the agent already disowned');
  assert.deepEqual(run.leaseFiles, [], 'lease released, and its holder record with it');
  assert.equal(run.agentsLeft, 0, 'no agent left');
  assert.equal(run.forwardsLeft, 0, 'no forward left');
  assert.deepEqual(run.events.find(event => event.type === 'prepared')?.data.logSources, { logcat: join(run.folder, `${run.runId}.log`) });
  assert.equal(run.raw.includes('Ha Noi'), false, 'the typed value never reaches run.jsonl');
}

test('end to end: an app that crashes partway through ends the run APP_EXITED, and cleans up', async () => {
  const fields = await hierarchyOf('text-fields.json');
  // probe-crash: the launch, then the crash and the process's death while the city is typed; the launcher shows.
  const run = await runCaptured('probe-crash', { pid: '10160', lateFrom: 1, screens: [fields, fields, []] });
  assert.deepEqual([run.report.verdict, run.report.reason], ['inconclusive', 'APP_EXITED']);
  const error = run.events.find(event => event.type === 'error')!.data;
  assert.deepEqual([error.stepId, error.phase, error.code], ['verify', 'observe', 'APP_EXITED']);
  assertCleanedUp(run);
});

test('end to end: an app that freezes (probe-anr) ends the run APP_NOT_RESPONDING, and cleans up', async () => {
  const fields = await hierarchyOf('text-fields.json');
  const run = await runCaptured('probe-anr', { pid: '11656', lateFrom: 1, screens: [fields, fields, []] });
  assert.deepEqual([run.report.verdict, run.report.reason], ['inconclusive', 'APP_NOT_RESPONDING']);
  const error = run.events.find(event => event.type === 'error')!.data;
  assert.deepEqual([error.stepId, error.phase, error.code], ['verify', 'observe', 'APP_NOT_RESPONDING']);
  assertCleanedUp(run);
});

test('end to end: a normal run passes, its step tails hold the app log redacted, and it cleans up', async () => {
  const fields = await hierarchyOf('text-fields.json');
  // probe-normal: the bridge's restart force-stops the first process (9784) before pidof finds the second.
  const run = await runCaptured('probe-normal', { pid: '10107', screens: [fields, fields, withText(fields, 'field.empty', CITY)] });
  assert.deepEqual([run.report.verdict, run.report.reason], ['passed', 'ALL_CHECKPOINTS_PASSED']);
  const tails = run.events.filter(event => event.type === 'step').map(event => (event.data.logTails as Record<string, string> | undefined)?.logcat);
  assert.deepEqual(tails, [1, 2].map(() => '2026-09-28 23:16:14.927 10226  9784  9784 I System.out: city is [REDACTED]\n'));
  assertCleanedUp(run);
});

test('the production clock gives AbortSignal.timeout a whole number of ms, since elapsed times from performance.now() are fractional', () => {
  // A real run subtracts performance.now() readings (4999.997666 ms left), which AbortSignal.timeout rejects.
  const signal = productionClock.timeout(4_999.997666);
  assert.equal(signal.aborted, false);
  assert.doesNotThrow(() => productionClock.timeout(0.2));
});
