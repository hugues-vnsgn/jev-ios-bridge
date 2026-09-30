import { spawn } from 'node:child_process';
import type { Readable } from 'node:stream';
import { DeviceReasonError } from '../index.js';
import type { DeviceCommandKind, DeviceLease } from '../lease.js';

export type AdbResult = { stdout: string; stderr: string; exitCode: number };
/**
 * Runs one `adb` command, as `CliRunner` does for MobileBuildMCP. It resolves with the exit code whenever
 * the child exited with a status (non-zero included), and throws `OutcomeUnknownError` when it didn't.
 */
export type AdbRunner = (args: string[], signal: AbortSignal) => Promise<AdbResult>;

/**
 * A device command whose outcome was lost: an `adb` child killed with no exit status, or a device agent
 * request that timed out, lost its connection or was abandoned after it was sent. It may still act on
 * the device, so the lease's ledger records it as unknown until a fence ends it. Never re-send one.
 */
export class OutcomeUnknownError extends DeviceReasonError {
  constructor(readonly vendorCode: 'adb' | 'agent', message: string, options: { cause?: unknown } = {}) {
    super('DEVICE_ERROR', message);
    this.name = 'OutcomeUnknownError';
    if ('cause' in options) this.cause = options.cause;
  }
}

/** The part of a child process the runner uses, so a test can hand it a fake. */
export interface AdbChild {
  readonly stdout: Readable;
  readonly stderr: Readable;
  kill(signal: NodeJS.Signals): boolean;
  once(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  once(event: 'error', listener: (error: Error) => void): this;
}

export type AdbSpawn = (file: string, args: readonly string[],
  options: { env: NodeJS.ProcessEnv; shell: false; stdio: ['ignore', 'pipe', 'pipe'] }) => AdbChild;

const spawnAdb: AdbSpawn = (file, args, options) => spawn(file, args, options);

/**
 * The production `adb` runner: spawns the given `adb` directly, never through a shell on the Mac. The
 * environment is `adbEnvironment()`; the Jev key is stripped again here, so no caller can hand it to adb.
 * An abort kills the child. `ANDROID_ADB_SERVER_PORT` is kept, so the private adb server is used.
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
    const onAbort = () => { child.kill('SIGKILL'); };
    signal.addEventListener('abort', onAbort, { once: true });
    let settled = false;
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
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

/**
 * Run one `adb` command or device agent request inside the lease's in-flight ledger: recorded before it
 * starts, `exited()` on a known outcome (a result, or any error but `OutcomeUnknownError`), `unknown()`
 * when its outcome was lost. The error, if any, is rethrown unchanged.
 */
export async function inLedger<T>(lease: Pick<DeviceLease, 'command'>, kind: DeviceCommandKind, issue: () => Promise<T>): Promise<T> {
  const issued = lease.command(kind);
  try {
    const result = await issue();
    issued.exited();
    return result;
  } catch (error) {
    if (error instanceof OutcomeUnknownError) issued.unknown();
    else issued.exited();
    throw error;
  }
}
