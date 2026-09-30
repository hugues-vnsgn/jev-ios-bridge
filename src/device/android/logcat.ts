import { execFile, spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { chmod, lstat, mkdir, open, readdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';
import { processAlive } from '../../process.js';

/** Where the Android driver writes each run's app log (release spec phase 5 item 1): folder 0700, files 0600. */
export const LOG_FOLDER = join(tmpdir(), 'jev-android-logs');
/** Log files older than this are deleted at the next Android `prepare`. */
const LOG_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1_000;
/** How long a stream gets after SIGTERM before SIGKILL (release spec phase 4 item 8). */
const STOP_GRACE_MS = 1_000;
/** How long a stream gets after SIGKILL before the bridge gives up on it. */
const KILL_WAIT_MS = 2_000;
const EXIT_POLL_MS = 100;

/** Where a stream's output goes: straight to a new file at this path, or line by line to a callback. */
export type LogcatOutput = string | ((line: string) => void);

/** One running `adb … logcat`. `stop` resolves once it has exited, and rejects when that can't be confirmed. */
export interface LogcatStream {
  readonly pid: number;
  stop(): Promise<void>;
  /** Resolves once the process has exited, and, for a line stream, its last line was delivered. */
  readonly exited: Promise<void>;
}

/**
 * The logcat stream starter (phase 5's one new seam), beside the `adb` runner, which only runs commands
 * that finish. `isLeftover` and `kill` serve the takeover sweep, for a pid a crashed run started.
 */
export interface LogcatStarter {
  start(args: string[], output: LogcatOutput, signal?: AbortSignal): Promise<LogcatStream>;
  /** True only when the Mac process with this pid is still an `adb` command line holding `-s <serial>` and `logcat`. */
  isLeftover(pid: number, serial: string): Promise<boolean>;
  /** SIGTERM, then SIGKILL after 1 s; resolves once the pid is gone. */
  kill(pid: number): Promise<void>;
}

/** The part of a child process the starter uses, so a test can hand it a fake. */
export interface LogcatChild {
  readonly pid?: number | undefined;
  readonly stdout: Readable | null;
  kill(signal: NodeJS.Signals): boolean;
  once(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  once(event: 'error', listener: (error: Error) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
}

export type LogcatSpawn = (file: string, args: readonly string[],
  options: { env: NodeJS.ProcessEnv; shell: false; stdio: ['ignore', number | 'pipe', 'ignore'] }) => LogcatChild;

export interface LogcatStarterOptions {
  adb: string;
  environment: NodeJS.ProcessEnv;
  spawn?: LogcatSpawn;
  /** A Mac process's command line, or undefined once it's gone. Defaults to `ps`. */
  commandLine?: (pid: number) => Promise<string | undefined>;
  /** Sends a signal to a pid; false when it's already gone. Defaults to `process.kill`. */
  sendSignal?: (pid: number, signal: NodeJS.Signals) => boolean;
  alive?: (pid: number) => boolean;
  sleep?: (ms: number) => Promise<void>;
}

const spawnLogcat: LogcatSpawn = (file, args, options) => spawn(file, args, options);

/** A timer that never keeps the bridge running by itself. */
const unrefSleep = (ms: number) => new Promise<void>(resolveSleep => { setTimeout(resolveSleep, ms).unref(); });

function psCommandLine(environment: NodeJS.ProcessEnv): (pid: number) => Promise<string | undefined> {
  return pid => new Promise(resolveLine => {
    execFile('/bin/ps', ['-p', String(pid), '-o', 'command='], { env: environment }, (error, stdout) => {
      resolveLine(error ? undefined : stdout.trim() || undefined);
    });
  });
}

function signalProcess(pid: number, signal: NodeJS.Signals): boolean {
  try { process.kill(pid, signal); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
    throw error;
  }
}

/**
 * The production stream starter: spawns `adb` directly, never through a shell on the Mac, with the Jev key
 * stripped again and `ANDROID_ADB_SERVER_PORT` kept. A file stream's stdout is a descriptor on a file
 * created `O_CREAT|O_EXCL`, mode 0600, so nothing is buffered in the bridge. Its stderr is dropped.
 */
export function logcatStarter(options: LogcatStarterOptions): LogcatStarter {
  const { TYPESAFE_API_KEY: _jevKey, ...environment } = options.environment;
  const spawnChild = options.spawn ?? spawnLogcat;
  const commandLine = options.commandLine ?? psCommandLine(environment);
  const sendSignal = options.sendSignal ?? signalProcess;
  const alive = options.alive ?? ((pid: number) => processAlive(pid));
  const sleep = options.sleep ?? unrefSleep;

  /** Polls until the pid is gone, for at most `ms`. */
  const goneWithin = async (pid: number, ms: number): Promise<boolean> => {
    for (let waited = 0; alive(pid); waited += EXIT_POLL_MS) {
      if (waited >= ms) return false;
      await sleep(EXIT_POLL_MS);
    }
    return true;
  };

  return {
    async start(args, output, signal) {
      if (signal?.aborted) throw signal.reason;
      const file = typeof output === 'string'
        ? await open(output, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600) : undefined;
      let child: LogcatChild;
      try {
        child = spawnChild(options.adb, [...args], { env: environment, shell: false, stdio: ['ignore', file?.fd ?? 'pipe', 'ignore'] });
      } finally {
        // The child holds its own copy of the descriptor.
        await file?.close();
      }
      const pid = child.pid;
      if (pid === undefined) throw await new Promise<Error>(resolveError => { child.once('error', resolveError); });
      child.on('error', () => {});
      let ended = false;
      const closed = new Promise<void>(resolveClosed => { child.once('close', () => { resolveClosed(); }); });
      let delivered: Promise<void> = Promise.resolve();
      if (typeof output === 'function' && child.stdout) {
        const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
        lines.on('line', output);
        delivered = new Promise(resolveDelivered => { lines.once('close', resolveDelivered); });
      }
      const exited = Promise.all([closed, delivered]).then(() => { ended = true; });
      const exitedWithin = (ms: number) => Promise.race([exited.then(() => true), sleep(ms).then(() => ended)]);
      return {
        pid,
        exited,
        async stop() {
          if (ended) return;
          child.kill('SIGTERM');
          if (await exitedWithin(STOP_GRACE_MS)) return;
          child.kill('SIGKILL');
          if (await exitedWithin(KILL_WAIT_MS)) return;
          throw new Error(`logcat ${String(pid)} did not exit`);
        },
      };
    },

    async isLeftover(pid, serial) {
      const words = (await commandLine(pid))?.split(/\s+/) ?? [];
      if (words.length === 0 || basename(words[0]!) !== 'adb') return false;
      const rest = words.slice(1);
      return rest.includes('logcat') && rest.some((word, at) => word === '-s' && rest[at + 1] === serial);
    },

    async kill(pid) {
      if (!sendSignal(pid, 'SIGTERM') || await goneWithin(pid, STOP_GRACE_MS)) return;
      if (!sendSignal(pid, 'SIGKILL') || await goneWithin(pid, KILL_WAIT_MS)) return;
      throw new Error(`logcat ${String(pid)} did not exit`);
    },
  };
}

/**
 * The private log folder, created 0700. A path that exists but is a symlink, isn't a directory, or isn't
 * this user's is refused (undefined): the driver then starts no stream. An owned folder is kept at 0700.
 */
export async function privateLogFolder(folder: string, options: { uid?: number } = {}): Promise<string | undefined> {
  const uid = options.uid ?? process.getuid?.();
  try {
    await mkdir(folder, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') return undefined;
  }
  try {
    const found = await lstat(folder);
    if (found.isSymbolicLink() || !found.isDirectory() || found.uid !== uid) return undefined;
    if ((found.mode & 0o777) !== 0o700) await chmod(folder, 0o700);
    return folder;
  } catch {
    return undefined;
  }
}

/** Deletes the regular files in the folder modified more than 3 days ago. A failed delete never throws. */
export async function deleteOldLogs(folder: string, now = Date.now()): Promise<void> {
  const names = await readdir(folder).catch(() => [] as string[]);
  for (const name of names) {
    const path = join(folder, name);
    try {
      const found = await lstat(path);
      if (found.isFile() && now - found.mtimeMs > LOG_MAX_AGE_MS) await unlink(path);
    } catch { /* a failed clean-up never fails the run */ }
  }
}
