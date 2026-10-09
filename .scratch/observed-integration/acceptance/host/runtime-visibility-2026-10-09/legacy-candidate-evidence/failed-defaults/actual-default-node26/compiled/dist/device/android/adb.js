import { spawn } from 'node:child_process';
import { OutcomeUnknownError } from './ledger.js';
const spawnAdb = (file, args, options) => spawn(file, args, options);
/**
 * The production `adb` runner: spawns the given `adb` directly, never through a shell on the Mac. The
 * environment is `adbEnvironment()`; the Jev key is stripped again here, so no caller can hand it to adb.
 * `ANDROID_ADB_SERVER_PORT` is kept, so the private adb server is used. An abort never kills the child:
 * a killed `adb` command's outcome would be unknown for good, keeping the lease. The runner lets it exit,
 * so its outcome is known, then throws the abort reason (release spec phase 4 item 8).
 */
export function adbRunner(options) {
    const { TYPESAFE_API_KEY: _jevKey, ...environment } = options.environment;
    const spawnChild = options.spawn ?? spawnAdb;
    return (args, signal) => new Promise((resolveResult, reject) => {
        if (signal.aborted) {
            reject(signal.reason);
            return;
        }
        const child = spawnChild(options.adb, [...args], { env: environment, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
        child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
        let settled = false;
        const settle = (finish) => {
            if (settled)
                return;
            settled = true;
            finish();
        };
        // A child that never started is a known outcome: it sent nothing to the device.
        child.once('error', error => { settle(() => { reject(error); }); });
        child.once('close', (code, killedBy) => {
            settle(() => {
                if (code === null) {
                    reject(new OutcomeUnknownError('adb', `adb was killed (${killedBy ?? 'no exit status'}); its outcome is unknown`, signal.aborted ? { cause: signal.reason } : {}));
                }
                else if (signal.aborted)
                    reject(signal.reason);
                else
                    resolveResult({ stdout, stderr, exitCode: code });
            });
        });
    });
}
