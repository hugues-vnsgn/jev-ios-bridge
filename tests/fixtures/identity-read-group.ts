import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { userInfo } from 'node:os';
import { identityProbe, type ProbeSpawn } from '../../src/device/android/probe.js';
import { fakeProbeSpawn } from './adb-spawn.js';

export function hostIdentityFixture(root: string, onSpawn: (file: string, args: readonly string[]) => void = () => {}, changedFinalPid = false) {
  const sdk = join(root, 'sdk'), launcher = join(sdk, 'emulator'), avd = join(root, 'Pixel.avd');
  mkdirSync(sdk); mkdirSync(avd);
  writeFileSync(launcher, 'synthetic version executable; never run'); chmodSync(launcher, 0o700);
  let listeners = 0;
  const fake = fakeProbeSpawn((file, args) => {
    if (file === '/usr/sbin/lsof' && args.includes('-d')) return `p123\nn${launcher}\n`;
    if (file === '/usr/sbin/lsof') return `p${changedFinalPid && ++listeners === 2 ? 456 : 123}\nu${userInfo().uid}\nn127.0.0.1:5554\n`;
    if (file === '/bin/ps') return '2100-01-01T00:00:00.000Z\n';
    if (file === launcher) return 'Android emulator version 37.2.12.0 (build_id fixture)\n';
    if (args[0] === 'devices') return 'List of devices attached\nemulator-5554 device\n';
    if (args[2] === 'emu') return `${args[4] === 'path' ? avd : 'Pixel'}\r\nOK\r\n`;
    return 'Pixel\n';
  });
  const spawn: ProbeSpawn = (file, args, options) => { onSpawn(file, args); return fake.spawn(file, args, options); };
  return { avd, calls: fake.calls, probe: identityProbe({ adb: '/fake/adb', environment: {}, spawn }) };
}
