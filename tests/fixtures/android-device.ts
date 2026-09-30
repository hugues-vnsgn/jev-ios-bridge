import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AdbResult, AdbRunner } from '../../src/device/android/adb.js';
import { DeviceAgentError, type AndroidNode, type DeviceAgentClient } from '../../src/device/android/agent-client.js';
import { PINNED_AGENT_SHA256 } from '../../src/device/android/agent-supply.js';
import { AGENT_START_COMMAND } from '../../src/device/android/driver.js';
import type { LogcatOutput, LogcatStarter, LogcatStream } from '../../src/device/android/logcat.js';
import type { Clock } from '../../src/device/android/settle.js';

/**
 * A fake Android device for the driver's tests: a fake `adb` that answers with the outputs recorded from
 * both emulators (`tests/fixtures/android/adb/`), a fake device agent client, a fake clock and a fake
 * logcat stream starter. Shared by `tests/android-driver.test.ts` and the `capture` command's tests.
 */

export const FIXTURES = join(import.meta.dirname, 'android', 'adb');
export const fixture = (api: Api, name: string) => readFile(join(FIXTURES, api, name), 'utf8');
export const fixtureBytes = (api: Api, name: string) => readFile(join(FIXTURES, api, name), 'latin1');
export type Api = 'api31' | 'api36';

export const AGENT_CACHE = '/cache/jev-android-agent/pinned.dex';
export const AGENT_CLASS_LINE = 'app_process                 app_process / com.mobilenext.mobilecli.DeviceServer';

/** Reads a device-shell command line back into its words, as the device's `sh` would. */
export function shellWords(line: string): string[] {
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

export interface FakeEmulator {
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
export class FakeAdb {
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
export type AgentCall = { method: string; params?: unknown };

/**
 * A fake device agent client: `device.version` answers with the pinned SHA-256 once the bridge's own agent
 * runs on the port's device. `device.dump.ui` answers with the next of `screens` (the last one repeats),
 * and `device.screenshot` with `jpeg-<n>`. Every other call is recorded in `calls` and does nothing.
 */
export function fakeAgents(adb: FakeAdb, options: { answersAfterPolls?: number; never?: boolean; sha256?: string; screens?: AndroidNode[][] } = {}) {
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
export function fakeClock(): Clock & { sleeps: number[] } {
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
export type FakeStream = { args: string[]; output: LogcatOutput; pid: number; running: boolean; end(): void };

/**
 * A fake logcat stream starter. Each start and stop is recorded in the fake `adb`'s calls, as
 * `(logcat) <args>` and `(stop) <pid>`, so tests see them in order with the `adb` commands. A file
 * stream's file is created empty. `mac` holds the Mac's processes by pid, as command lines, for the sweep.
 */
export class FakeStreams implements LogcatStarter {
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
