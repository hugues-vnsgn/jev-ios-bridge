import { resumedPackage } from '../../device/attach.js';
import { DeviceReasonError } from '../../device/index.js';
import { NativeHelperError, runNativeCommand, type NativeKind, type NativeRunner } from './process.js';

export function androidNativeHelpers(options: { serial: string; adb?: string; runner: NativeRunner; timeoutMs?: number }) {
  const shell = async (kind: NativeKind, words: string[], signal: AbortSignal) => (await runNativeCommand({
    command: { kind, file: options.adb ?? 'adb', args: ['-s', options.serial, 'shell', words.map(word => `'${word.replace(/'/g, "'\\''")}'`).join(' ')] },
    runner: options.runner, signal, timeoutMs: options.timeoutMs ?? 10_000,
  })).stdout;
  const keyguard = async (signal: AbortSignal) => {
    const policy = await shell('android-keyguard', ['dumpsys', 'window', 'policy'], signal);
    const delegate = policy.includes('KeyguardServiceDelegate') ? policy.slice(policy.indexOf('KeyguardServiceDelegate')) : '';
    const showing = /^\s*showing=(true|false)\s*$/m.exec(delegate)?.[1];
    const interactive = /^\s*interactiveState=(\S+)\s*$/m.exec(delegate)?.[1];
    if (showing === undefined || interactive === undefined) throw new NativeHelperError('NATIVE_UNAVAILABLE', 'Android screen state is unavailable');
    return { awake: interactive === 'INTERACTIVE_STATE_AWAKE', keyguard: showing === 'true' };
  };
  const refuseLocked = (screen: { keyguard: boolean }) => {
    if (screen.keyguard) throw new DeviceReasonError('DEVICE_LOCKED', `Device ${options.serial}'s screen is locked. Set Screen lock to None on a test device`);
  };
  return {
    keyguard,
    async wake(signal: AbortSignal) {
      let screen = await keyguard(signal); refuseLocked(screen);
      if (!screen.awake) { await shell('android-wake', ['input', 'keyevent', 'KEYCODE_WAKEUP'], signal); screen = await keyguard(signal); }
      refuseLocked(screen);
      return screen;
    },
    async launcher(appPackage: string, signal: AbortSignal) {
      const resolved = await shell('android-launcher', ['cmd', 'package', 'resolve-activity', '--brief', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER', appPackage], signal);
      const component = resolved.trim().split('\n').at(-1)?.trim() ?? '';
      if (!component.startsWith(`${appPackage}/`)) throw new NativeHelperError('NATIVE_UNAVAILABLE', 'Android launcher activity is unavailable');
      return component;
    },
    async foreground(signal: AbortSignal) { return resumedPackage(await shell('android-foreground', ['dumpsys', 'activity', 'activities'], signal)); },
  };
}
