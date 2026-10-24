import { execFileSync, spawn } from 'node:child_process';
import type { Readable } from 'node:stream';
import type { OwnerProcess } from '../../device/admission.js';

export type NativeKind = 'ios-console' | 'ios-log-stream' | 'ios-boot' | 'ios-install'
  | 'android-wake' | 'android-keyguard' | 'android-launcher' | 'android-foreground';
export type NativeCommand = Readonly<{ kind: NativeKind; file: string; args: readonly string[] }>;
export type NativeExit = { kind: 'exited'; code: number } | { kind: 'lost' };
export type NativeOutput = { stdout(text: string): void; stderr(text: string): void; lost(): void };
export interface NativeProcess {
  readonly process: OwnerProcess;
  readonly exited: Promise<NativeExit>;
  stop(): Promise<void>;
}
export type NativeRunner = (command: NativeCommand, output: NativeOutput, signal: AbortSignal) => Promise<NativeProcess>;
export class NativeHelperError extends Error {
  constructor(readonly code: 'NATIVE_UNAVAILABLE' | 'NATIVE_FAILED' | 'NATIVE_OUTCOME_UNKNOWN' | 'ROLE_REFUSED', message: string) {
    super(message); this.name = 'NativeHelperError';
  }
}
export interface NativeChild {
  readonly pid?: number | undefined;
  readonly stdout: Readable;
  readonly stderr: Readable;
  kill(signal: NodeJS.Signals): boolean;
  once(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  once(event: 'error', listener: (error: Error) => void): this;
}
export type NativeSpawn = (file: string, args: readonly string[], options: {
  env: NodeJS.ProcessEnv; shell: false; stdio: ['ignore', 'pipe', 'pipe'];
}) => NativeChild;

function incarnation(pid: number): string | undefined {
  try {
    return execFileSync('/bin/ps', ['-p', String(pid), '-o', 'lstart='], { encoding: 'utf8', timeout: 1_000,
      env: { PATH: '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C', TZ: 'UTC' }, stdio: ['ignore', 'pipe', 'ignore'] }).trim() || undefined;
  } catch { return undefined; }
}

async function within(exited: Promise<NativeExit>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([exited.then(() => true), new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), ms); })]); }
  finally { clearTimeout(timer); }
}

export function ownedNativeRunner(options: {
  environment: NodeJS.ProcessEnv;
  record(entry: { command: NativeCommand; process: OwnerProcess }): void;
  spawn?: NativeSpawn; incarnation?: (pid: number) => string | undefined;
  stopGraceMs?: number; killWaitMs?: number;
}): NativeRunner {
  const { TYPESAFE_API_KEY: _key, ...environment } = options.environment;
  const start: NativeSpawn = options.spawn ?? ((file, args, settings) => spawn(file, args, settings));
  const identity = options.incarnation ?? incarnation;
  return async (command, output, signal) => {
    signal.throwIfAborted();
    const child = start(command.file, command.args, { env: environment, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let ended = false;
    let failed: Error | undefined;
    const exited = new Promise<NativeExit>(resolve => {
      child.once('close', code => { ended = true; resolve(code === null ? { kind: 'lost' } : { kind: 'exited', code }); });
      child.once('error', error => {
        failed = error; output.lost();
        if (child.pid === undefined) { ended = true; resolve({ kind: 'lost' }); }
      });
    });
    for (const [stream, write] of [[child.stdout, output.stdout], [child.stderr, output.stderr]] as const) {
      stream.setEncoding('utf8').on('data', (text: string) => { if (!ended) write(text); });
      stream.on('error', () => { if (!ended) output.lost(); });
      stream.on('close', () => { setImmediate(() => { if (!ended) output.lost(); }); });
    }
    const pid = child.pid;
    if (pid === undefined) {
      await exited;
      throw failed ?? new NativeHelperError('NATIVE_UNAVAILABLE', 'Native helper did not start');
    }
    const started = identity(pid);
    let stopping: Promise<void> | undefined;
    const stop = () => stopping ??= (async () => {
      if (ended) return;
      const send = (sent: NodeJS.Signals) => {
        if (!started || identity(pid) !== started) throw new NativeHelperError('NATIVE_OUTCOME_UNKNOWN', 'Native process identity cannot be confirmed');
        child.kill(sent);
      };
      send('SIGTERM');
      if (await within(exited, options.stopGraceMs ?? 5_000)) return;
      send('SIGKILL');
      if (!await within(exited, options.killWaitMs ?? 2_000)) throw new NativeHelperError('NATIVE_OUTCOME_UNKNOWN', 'Native helper stop is unconfirmed');
    })();
    if (!Number.isSafeInteger(pid) || pid <= 0 || !started) {
      throw new NativeHelperError('NATIVE_OUTCOME_UNKNOWN', 'Native helper ownership is unavailable');
    }
    const process = { pid, incarnation: started };
    try { options.record({ command, process }); }
    catch (error) { await stop(); throw error; }
    return { process, exited, stop };
  };
}

export async function runNativeCommand(options: {
  command: NativeCommand; runner: NativeRunner; signal: AbortSignal; timeoutMs: number;
}): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  options.signal.throwIfAborted();
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 300_000) throw new RangeError('Native timeout must be between 1 and 300000 ms');
  let stdout = ''; let stderr = ''; let lost = false;
  const append = (current: string, text: string) => {
    if (current.length + text.length > 65_536) { lost = true; return current; }
    return current + text;
  };
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(new NativeHelperError('NATIVE_OUTCOME_UNKNOWN', 'Native command deadline expired')), options.timeoutMs);
  const signal = AbortSignal.any([options.signal, deadline.signal]);
  let abort!: () => void;
  const interrupted = new Promise<never>((_resolve, reject) => { abort = () => reject(signal.reason); signal.addEventListener('abort', abort, { once: true }); });
  const starting = options.runner(options.command, {
    stdout: text => { stdout = append(stdout, text); }, stderr: text => { stderr = append(stderr, text); }, lost: () => { lost = true; },
  }, signal);
  let child: NativeProcess | undefined;
  try {
    child = await Promise.race([starting, interrupted]);
    const result = await Promise.race([child.exited, interrupted]);
    signal.throwIfAborted();
    if (result.kind === 'lost' || lost) throw new NativeHelperError('NATIVE_OUTCOME_UNKNOWN', 'Native command result is unavailable');
    if (result.code !== 0) throw new NativeHelperError('NATIVE_FAILED', `Native command ${options.command.kind} failed with exit ${String(result.code)}`);
    return { exitCode: result.code, stdout, stderr };
  } catch (error) {
    if (child) await child.stop();
    else void starting.then(late => late.stop()).catch(() => {});
    throw error;
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
}
