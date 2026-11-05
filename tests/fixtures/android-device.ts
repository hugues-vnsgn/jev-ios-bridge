import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AdbResult, AdbRunner } from '../../src/device/android/adb.js';
import type { LogcatOutput, LogcatStarter, LogcatStream } from '../../src/device/android/logcat.js';
import { identityProbe, type IdentityProbe } from '../../src/device/android/probe.js';
import { fakeProbeSpawn } from './adb-spawn.js';

/**
 * A fake Android device: a read-only identity probe over fake emulators, a fake `adb` that answers the process,
 * forward and stop commands recovery issues with the outputs recorded from both emulators (`tests/fixtures/android/adb/`),
 * and a fake logcat stream starter.
 */

const FIXTURES = join(import.meta.dirname, 'android', 'adb');
const fixture = (name: string) => readFile(join(FIXTURES, name), 'utf8');
const fixtureBytes = (name: string) => readFile(join(FIXTURES, name), 'latin1');
const AGENT_CLASS_LINE = 'app_process                 app_process / com.mobilenext.mobilecli.DeviceServer';

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

export interface FakeEmulator {
  serial: string;
  avd: string;
  /** Agents running now, by pid: the bridge's own, mobilecli's (foreign), or any other `ps` line. */
  agents?: Map<number, 'own' | 'foreign' | { line: string }>;
  /** Pids that ignore `kill`. */
  stubborn?: number[];
}

/** A fake `adb` that answers like the recorded emulators, records every call, and never runs anything. */
export class FakeAdb {
  readonly calls: string[][] = [];
  forwards: { serial: string; local: string; remote: string }[] = [];
  devicesText: string | undefined;
  readonly emulators = new Map<string, FakeEmulator>();
  /** Called before each command is answered, to look at the world as that command saw it. */
  onCall: ((args: string[]) => void | Promise<void>) | undefined;

  readonly probeCalls: string[][] = [];
  readonly identityProbe: IdentityProbe;

  constructor(...emulators: FakeEmulator[]) {
    for (const emulator of emulators) this.emulators.set(emulator.serial, emulator);
    const fake = fakeProbeSpawn((_file, args) => {
      if (args[0] === 'devices') return this.devicesText ?? `List of devices attached\n${[...this.emulators.keys()].map(serial => `${serial} device`).join('\n')}\n`;
      const serial = args[1]!;
      const emulator = this.emulators.get(serial);
      if (args[2] === 'emu') {
        assert.ok(emulator, `missing console fixture for ${serial}`);
        const value = args[4] === 'path' ? `/fake/avds/${emulator.avd}.avd` : emulator.avd;
        return `${value}\r\nOK\r\n`;
      }
      return `${args.at(-1) === 'ro.serialno' ? serial : emulator?.avd ?? ''}\n`;
    });
    const recordSpawn: typeof fake.spawn = (file, args, options) => {
      this.probeCalls.push([...args]);
      return fake.spawn(file, args, options);
    };
    this.identityProbe = identityProbe({ adb: '/fake/adb', environment: {}, spawn: recordSpawn,
      host: {
        listener: async port => ({ pid: port, startedAt: '2026-10-19T01:00:00.000Z', uid: 501, local: true }),
        directory: async path => ({ path, device: '2', inode: String([...path].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 0) >>> 0) }),
        version: async () => ({ value: '36.6.1', source: 'running-sdk-binary' }),
      },
    });
    Object.assign(this.run, { identityProbe: this.identityProbe });
  }

  readonly run: AdbRunner & { identityProbe?: IdentityProbe } = async (args, signal) => {
    this.calls.push([...args]);
    if (signal.aborted) throw signal.reason;
    await this.onCall?.(args);
    return { stdout: '', stderr: '', exitCode: 0, ...await this.answer(args) };
  };

  private async answer(args: string[]): Promise<Partial<AdbResult>> {
    if (args.join(' ') === 'forward --list') {
      return { stdout: this.forwards.map(forward => `${forward.serial} ${forward.local} ${forward.remote}\n`).join('') };
    }
    assert.equal(args[0], '-s', `unexpected adb command: ${args.join(' ')}`);
    const serial = args[1]!;
    const emulator = this.emulators.get(serial);
    assert.ok(emulator, `a command for a device that isn't there: ${args.join(' ')}`);
    const [, , verb, ...rest] = args;
    if (verb === 'forward' && rest[0] === '--remove') {
      const before = this.forwards.length;
      this.forwards = this.forwards.filter(forward => !(forward.serial === serial && forward.local === rest[1]));
      return before === this.forwards.length ? { exitCode: 1, stderr: `adb: error: listener '${rest[1]}' not found\n` } : {};
    }
    assert.equal(verb, 'shell');
    const line = rest[0]!;
    const words = shellWords(line);
    const agents = emulator.agents ?? new Map();
    if (words.join(' ') === 'ps -A -o PID,NAME,ARGS') {
      const lines = (await fixture('api31/ps-no-agent.txt')).split('\n');
      const psLine = lines.findIndex(entry => / ps -A -o PID,NAME,ARGS/.test(entry));
      const agentLines = [...agents].map(([pid, kind]) => typeof kind === 'object' ? kind.line : `${String(pid).padStart(5)} ${AGENT_CLASS_LINE}`);
      return { stdout: [...lines.slice(0, psLine), ...agentLines, ...lines.slice(psLine)].join('\n') };
    }
    if (words[0] === 'cat' && /^\/proc\/\d+\/stat$/.test(words[1]!)) {
      const pid = Number(words[1]!.split('/')[2]);
      return agents.has(pid) ? { stdout: `${pid} (app_process) S ${Array(18).fill('0').join(' ')} 12345 0\n` }
        : { exitCode: 1, stderr: 'cat: No such file or directory\n' };
    }
    if (words[0] === 'cat' && /^\/proc\/\d+\/environ$/.test(words[1]!)) {
      const kind = agents.get(Number(words[1]!.split('/')[2]));
      if (kind === undefined) return { exitCode: 1, stderr: await fixture('api36/environ-gone.stderr.txt') };
      if (typeof kind === 'object') return { stdout: '' };
      return { stdout: await fixtureBytes(kind === 'own' ? 'api31/environ-own-agent.bin' : 'api31/environ-foreign-agent.bin') };
    }
    if (words[0] === 'kill') {
      const pid = Number(words[1]);
      if (!agents.has(pid)) return { exitCode: 1, stderr: (await fixture('api36/kill-gone.stderr.txt')).replace('9983', String(pid)) };
      if (!emulator.stubborn?.includes(pid)) agents.delete(pid);
      return {};
    }
    assert.fail(`unexpected shell command: ${line}`);
  }
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
      pid: stream.pid, process: { pid: stream.pid, incarnation: 'fake-stream-start' },
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

  /** Runs as each kill begins. */
  onKill: ((pid: number) => void) | undefined;

  async kill(pid: number): Promise<void> {
    this.onKill?.(pid);
    this.killed.push(pid);
    this.mac.delete(pid);
  }
}

export function fakeSimulatorProbe(...udids: string[]): IdentityProbe {
  return identityProbe({ adb: '/fake/adb', environment: {},
    simulatorApp: async ({ bundleId }) => ({ kind: 'installed', reply: `/fake/Applications/${bundleId}.app\n` }),
    simulator: async () => ({ deviceSet: '/fake/CoreSimulator/Devices',
      reply: JSON.stringify({ devices: { 'fake-runtime': udids.map(udid => ({ udid, name: udid, state: 'Booted', isAvailable: true })) } }) }),
    spawn: () => { throw new Error('Unexpected Android probe in simulator fixture'); },
  });
}
