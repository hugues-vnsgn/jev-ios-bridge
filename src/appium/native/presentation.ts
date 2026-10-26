import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export type SimulatorPresentation = 'visible' | 'headless';
/** Whether a Simulator UI client runs right now. Rejects when it cannot tell, so the caller never guesses. */
export type PresentationReader = (signal: AbortSignal) => Promise<SimulatorPresentation>;
/** One host command's exit code and output; rejects only when it could not run. */
export type HostRun = (file: string, args: readonly string[], signal: AbortSignal) => Promise<{ code: number; stdout: string }>;

const PLIST_BUDDY = '/usr/libexec/PlistBuddy';
const DEVICE_HUB = { bundleId: 'com.apple.dt.Devices', fromXcode: 27 };
const SIMULATOR_APP = 'com.apple.iphonesimulator';
const READ_TIMEOUT_MS = 5_000;

/**
 * The fact the pinned appium-ios-simulator 10.7.1 decides `isHeadless` on (`ui-client.js` `run`): the active Xcode's UI
 * client, found by bundle id, is running when `pgrep -f <app path>` lists it. A session whose capability matches that
 * fact neither quits the client nor restarts a booted simulator. Read-only: nothing is opened or quit.
 */
export function simulatorPresentationReader(run: HostRun, list: (folder: string) => Promise<string[]> = folder => readdir(folder)): PresentationReader {
  const read = async (file: string, args: string[], signal: AbortSignal) => {
    const reply = await run(file, args, signal);
    if (reply.code !== 0 || !reply.stdout.trim()) throw new Error(`${file} exited ${String(reply.code)}`);
    return reply.stdout.trim();
  };
  return async signal => {
    const developer = await read('/usr/bin/xcode-select', ['-p'], signal);
    const major = Number((await read(PLIST_BUDDY, ['-c', 'print CFBundleShortVersionString', resolve(developer, '..', 'Info.plist')], signal)).split('.')[0]);
    if (!Number.isInteger(major)) throw new Error('The active Xcode version is unreadable');
    const deviceHub = major >= DEVICE_HUB.fromXcode;
    const folder = deviceHub ? resolve(developer, '..', 'Applications') : resolve(developer, 'Applications');
    const bundleId = deviceHub ? DEVICE_HUB.bundleId : SIMULATOR_APP;
    let client: string | undefined;
    for (const name of (await list(folder)).filter(entry => entry.endsWith('.app'))) {
      const app = resolve(folder, name);
      const id = await run(PLIST_BUDDY, ['-c', 'print CFBundleIdentifier', join(app, 'Contents', 'Info.plist')], signal);
      if (id.code === 0 && id.stdout.trim() === bundleId) { client = app; break; }
    }
    if (client === undefined) throw new Error(`No ${bundleId} app under ${folder}`);
    const listed = await run('/usr/bin/pgrep', ['-f', client], signal);
    if (listed.code === 1) return 'headless';
    if (listed.code === 0 && listed.stdout.trim()) return 'visible';
    throw new Error(`pgrep exited ${String(listed.code)}`);
  };
}

/** Host commands with a fixed system PATH and no inherited environment, bounded per command. */
export const hostRun: HostRun = (file, args, signal) => new Promise((done, reject) => {
  execFile(file, args, { env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'C' }, signal, timeout: READ_TIMEOUT_MS, encoding: 'utf8' }, (error, stdout) => {
    if (!error) done({ code: 0, stdout });
    else if (typeof error.code === 'number' && !signal.aborted && !error.killed) done({ code: error.code, stdout });
    else reject(error);
  });
});
