import assert from 'node:assert/strict';
import { test } from 'node:test';
import { simulatorPresentationReader, type HostRun } from '../src/appium/native/presentation.js';

const live = () => AbortSignal.timeout(20_000);
const XCODE = '/Applications/Xcode.app/Contents/Developer';

/** A Mac whose active Xcode is `version`, with the given apps beside it and `running` UI client paths. */
function mac(version: string, apps: Record<string, string>, running: string[], overrides: Partial<Record<string, { code: number; stdout: string }>> = {}) {
  const calls: string[] = [];
  const run: HostRun = async (file, args) => {
    calls.push([file, ...args].join(' '));
    const override = overrides[file];
    if (override) return override;
    if (file === '/usr/bin/xcode-select') return { code: 0, stdout: `${XCODE}\n` };
    if (file === '/usr/libexec/PlistBuddy' && args[1] === 'print CFBundleShortVersionString') return { code: 0, stdout: `${version}\n` };
    if (file === '/usr/libexec/PlistBuddy') {
      const app = Object.keys(apps).find(path => args[2] === `${path}/Contents/Info.plist`);
      return app ? { code: 0, stdout: `${apps[app]!}\n` } : { code: 1, stdout: '' };
    }
    if (file === '/usr/bin/pgrep') return running.includes(args[1]!) ? { code: 0, stdout: '4321\n' } : { code: 1, stdout: '' };
    throw new Error(`unexpected ${file}`);
  };
  const list = async (folder: string) => Object.keys(apps).filter(path => path.startsWith(`${folder}/`)).map(path => path.slice(folder.length + 1));
  return { reader: simulatorPresentationReader(run, list), calls };
}
const DEVICE_HUB = '/Applications/Xcode.app/Contents/Applications/DeviceHub.app';
const SIMULATOR_APP = `${XCODE}/Applications/Simulator.app`;
const xcode27 = { [DEVICE_HUB]: 'com.apple.dt.Devices', '/Applications/Xcode.app/Contents/Applications/Instruments.app': 'com.apple.dt.instruments' };

test('the reader mirrors the pinned stack: Xcode 27 looks for DeviceHub by bundle id, and pgrep on its path decides', async () => {
  assert.equal(await mac('27.0', xcode27, [DEVICE_HUB]).reader(live()), 'visible');
  const idle = mac('27.0', xcode27, []);
  assert.equal(await idle.reader(live()), 'headless');
  assert.deepEqual(idle.calls.filter(call => call.startsWith('/usr/bin/pgrep')), [`/usr/bin/pgrep -f ${DEVICE_HUB}`]);
  assert.equal(await mac('16.4', { [SIMULATOR_APP]: 'com.apple.iphonesimulator' }, [SIMULATOR_APP]).reader(live()), 'visible');
});

test('the reader refuses to guess when any step cannot be read', async () => {
  const unreadable = [
    mac('27.0', xcode27, [], { '/usr/bin/xcode-select': { code: 2, stdout: '' } }),
    mac('not a version', xcode27, []),
    mac('27.0', { '/Applications/Xcode.app/Contents/Applications/Instruments.app': 'com.apple.dt.instruments' }, []),
    mac('27.0', xcode27, [], { '/usr/bin/pgrep': { code: 3, stdout: '' } }),
  ];
  for (const { reader } of unreadable) await assert.rejects(reader(live()));
});
