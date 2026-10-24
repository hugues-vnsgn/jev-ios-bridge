import type { AppProblem } from '../../contracts/index.js';
import type { NativeLogSource } from '../../device/logs.js';
import { NativeHelperError, runNativeCommand, type NativeKind, type NativeProcess, type NativeRunner } from './process.js';

type IosTarget = { udid: string; deviceSet?: string };
type IosObserver = IosTarget & { bundleId: string; runner: NativeRunner; source: NativeLogSource; signal: AbortSignal };
const simctl = (target: IosTarget) => ['simctl', ...(target.deviceSet ? ['--set', target.deviceSet] : [])];

async function startObserver(options: IosObserver, kind: 'ios-console' | 'ios-log-stream', args: string[]) {
  let state: 'running' | 'exited' | 'lost' | 'stopped' = 'running';
  let expected = false;
  const source = options.source;
  let child: NativeProcess;
  try {
    child = await options.runner({ kind, file: 'xcrun', args }, {
      stdout: text => { if (state === 'running') source.write('stdout', text); },
      stderr: text => { if (state === 'running') source.write('stderr', text); },
      lost: () => { if (state === 'running') { state = 'lost'; source.unavailable('SOURCE_LOST'); } },
    }, options.signal);
  } catch (error) {
    source.unavailable('SOURCE_LOST'); await source.finish(); throw error;
  }
  const exited = child.exited.then(async result => {
    if (result.kind === 'exited') state = expected ? 'stopped' : 'exited';
    else state = expected ? 'stopped' : 'lost';
    source.unavailable(expected ? 'SOURCE_STOPPED' : result.kind === 'lost' ? 'SOURCE_LOST' : 'SOURCE_ENDED');
    await source.finish();
  });
  let stopping: Promise<void> | undefined;
  const expectStop = () => { expected = true; };
  const stop = () => {
    expectStop();
    return stopping ??= (async () => {
      try { await child.stop(); await exited; }
      catch (error) { state = 'lost'; source.unavailable('SOURCE_LOST'); await source.finish(); throw error; }
    })();
  };
  const abort = () => { void stop().catch(() => {}); };
  options.signal.addEventListener('abort', abort, { once: true });
  void exited.then(() => options.signal.removeEventListener('abort', abort), () => options.signal.removeEventListener('abort', abort));
  if (options.signal.aborted) { await stop(); throw options.signal.reason; }
  return {
    process: child.process, exited, stop, expectStop,
    running(): boolean | undefined { return state === 'exited' || state === 'stopped' ? false : state === 'running' && source.available() ? true : undefined; },
    problem(): AppProblem | undefined {
      return state === 'exited' ? { code: 'APP_EXITED', note: 'The app stopped unexpectedly: its console output ended while the run was still going.' } : undefined;
    },
  };
}

export function launchIosConsole(options: IosObserver & { args?: readonly string[] }) {
  return startObserver(options, 'ios-console', [...simctl(options), 'launch', '--console-pty', '--terminate-running-process', options.udid, options.bundleId, ...options.args ?? []]);
}

export async function observeIosLogs(options: IosObserver) {
  if (!/^[A-Za-z0-9_.-]+$/.test(options.bundleId)) throw new NativeHelperError('NATIVE_UNAVAILABLE', 'Invalid app log subsystem');
  const { process, exited, stop } = await startObserver(options, 'ios-log-stream', [...simctl(options), 'spawn', options.udid,
    'log', 'stream', '--level=debug', '--predicate', `subsystem == "${options.bundleId}"`]);
  return { process, exited, stop, available: () => options.source.available() };
}

export function observedIosPreparation(options: IosTarget & { role: 'observed-preparation'; runner: NativeRunner; timeoutMs?: number }) {
  if (options.role !== 'observed-preparation') throw new NativeHelperError('ROLE_REFUSED', 'Boot and install require observed preparation');
  const run = (kind: NativeKind, args: string[], signal: AbortSignal) => runNativeCommand({
    command: { kind, file: 'xcrun', args: [...simctl(options), ...args] }, runner: options.runner, signal, timeoutMs: options.timeoutMs ?? 30_000,
  });
  return {
    boot: (signal: AbortSignal) => run('ios-boot', ['boot', options.udid], signal),
    install: (path: string, signal: AbortSignal) => run('ios-install', ['install', options.udid, path], signal),
    /** One owned launch with no console: a parked allocation has no live owner for a helper to outlive park. */
    launch: (bundleId: string, args: readonly string[], signal: AbortSignal) => run('ios-launch', ['launch', '--terminate-running-process', options.udid, bundleId, ...args], signal),
  };
}
