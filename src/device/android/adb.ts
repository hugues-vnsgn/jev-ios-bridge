import { spawn } from 'node:child_process';
import type { Readable } from 'node:stream';
import { OutcomeUnknownError } from './ledger.js';

export type AdbResult = { stdout: string; stderr: string; exitCode: number };
/**
 * Runs one `adb` command, as `CliRunner` does for MobileBuildMCP. It resolves with the exit code whenever
 * the child exited with a status (non-zero included), and throws `OutcomeUnknownError` when it didn't.
 */
export type AdbRunner = (args: string[], signal: AbortSignal) => Promise<AdbResult>;

/** The part of a child process the runner uses, so a test can hand it a fake. */
export interface AdbChild {
  readonly stdout: Readable;
  readonly stderr: Readable;
  once(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  once(event: 'error', listener: (error: Error) => void): this;
}

export type AdbSpawn = (file: string, args: readonly string[],
  options: { env: NodeJS.ProcessEnv; shell: false; stdio: ['ignore', 'pipe', 'pipe'] }) => AdbChild;

const spawnAdb: AdbSpawn = (file, args, options) => spawn(file, args, options);

/**
 * The production `adb` runner: spawns the given `adb` directly, never through a shell on the Mac. The
 * environment is `adbEnvironment()`; the Jev key is stripped again here, so no caller can hand it to adb.
 * `ANDROID_ADB_SERVER_PORT` is kept, so the private adb server is used. An abort never kills the child:
 * a killed `adb` command's outcome would be unknown for good, keeping the lease. The runner lets it exit,
 * so its outcome is known, then throws the abort reason (release spec phase 4 item 8).
 */
export function adbRunner(options: { adb: string; environment: NodeJS.ProcessEnv; spawn?: AdbSpawn }): AdbRunner {
  const { TYPESAFE_API_KEY: _jevKey, ...environment } = options.environment;
  const spawnChild = options.spawn ?? spawnAdb;
  return (args, signal) => new Promise((resolveResult, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const child = spawnChild(options.adb, [...args], { env: environment, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });
    let settled = false;
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      finish();
    };
    // A child that never started is a known outcome: it sent nothing to the device.
    child.once('error', error => { settle(() => { reject(error); }); });
    child.once('close', (code, killedBy) => {
      settle(() => {
        if (code === null) {
          reject(new OutcomeUnknownError('adb', `adb was killed (${killedBy ?? 'no exit status'}); its outcome is unknown`,
            signal.aborted ? { cause: signal.reason } : {}));
        } else if (signal.aborted) reject(signal.reason);
        else resolveResult({ stdout, stderr, exitCode: code });
      });
    });
  });
}
