import { spawn } from 'node:child_process';
import type { AdbChild, AdbResult, AdbSpawn } from '../../device/android/adb.js';
import { executorOf, type StartLookup } from '../../device/host-start.js';
import type { SimctlRunner } from '../fence/runner.js';

/**
 * Runs one `xcrun simctl` command for the fence. Every child it starts is reported to `started` before its exit,
 * even one whose start-time lookup fails, so a failed write can never hide the process that performed it.
 */
export function simctlRunner(options: { environment: NodeJS.ProcessEnv; spawn?: AdbSpawn; incarnation?: StartLookup }): SimctlRunner {
  const { TYPESAFE_API_KEY: _key, ...environment } = options.environment;
  const start: AdbSpawn = options.spawn ?? ((file, args, settings) => spawn(file, args, settings));
  return (args, signal, started) => new Promise<AdbResult>((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const child: AdbChild = start('xcrun', ['simctl', ...args], { env: environment, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });
    let settled = false;
    const settle = (finish: () => void) => { if (!settled) { settled = true; finish(); } };
    child.once('error', error => settle(() => reject(error)));
    child.once('close', (code, killedBy) => settle(() => {
      if (code === null) reject(new Error(`simctl was killed (${killedBy ?? 'no exit status'}); its outcome is unknown`));
      else if (signal.aborted) reject(signal.reason);
      else resolve({ stdout, stderr, exitCode: code });
    }));
    if (started && child.pid !== undefined) started(executorOf(child.pid, options.incarnation));
  });
}
