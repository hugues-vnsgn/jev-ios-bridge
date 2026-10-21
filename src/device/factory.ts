import type { DeviceDriver } from '../contracts/index.js';
import type { ScriptedScenario } from '../scripted/contracts.js';
import { AndroidDriver, type AndroidDriverOptions } from './android/driver.js';
import { createExitWatch } from './android/exit-watch.js';
import { MobileBuildMcpDriver, type IosPreparationDriver, type ObservedActionDriver, createMobileBuildMcpDriver, type MobileBuildMcpDriverOptions } from './index.js';
import type { AndroidDeviceName, DeviceAgreement, ProfileBinding } from '../profiles.js';
import { identityProbe } from './android/probe.js';
import { adbEnvironment, androidTools } from './android/tools.js';
import { resolveIdentity, sameIdentity, type IdentityProbe } from './identity.js';

export interface DriverFactoryOptions {
  mobileBuildMcp: MobileBuildMcpDriverOptions;
  /** The Android driver's options, `JEV_ANDROID_DEVICE` as `defaultDevice` among them. The device comes from each script. */
  android?: Omit<AndroidDriverOptions, 'device' | 'runId'>;
}

/**
 * Builds the device driver for one script. One bridge process serves scripts for every platform, so
 * the driver is chosen per script, never per process: the Android driver for an Android script, given
 * the script's device, the run's ID (which names the app's log file) and the app-exit watcher, and the
 * MobileBuildMCP driver for every other script.
 */
export function createDriverFactory(options: DriverFactoryOptions):
  (scenario: ScriptedScenario, run?: { runId: string; profile?: ProfileBinding }) => DeviceDriver {
  return (scenario: ScriptedScenario, run?: { runId: string; profile?: ProfileBinding }) => {
    if (scenario.platform === 'android') {
      return new AndroidDriver({ createExitWatch, ...options.android, device: scenario.device, runId: run?.runId });
    }
    return createMobileBuildMcpDriver({ ...options.mobileBuildMcp, ...(run ? { runId: run.runId } : {}),
      ...(run?.profile ? { profile: run.profile } : {}) });
  };
}

/** Profile device agreement through the read-only identity probe: both names resolve live, then compare identities. */
export function createDeviceAgreement(options: { probe?: IdentityProbe } = {}): DeviceAgreement {
  const name = (device: AndroidDeviceName) => 'serial' in device ? device.serial : device.avd;
  return async (left, right, signal) => {
    const probe = options.probe ?? identityProbe({ adb: (await androidTools()).adb, environment: adbEnvironment() });
    const first = await resolveIdentity({ request: { category: 'android', name: name(left) }, probe, signal });
    const second = await resolveIdentity({ request: { category: 'android', name: name(right) }, probe, signal });
    return sameIdentity(first, second);
  };
}

/** Allocation and action composition use narrow typed seams, never fake scenario casts. */
export function createPreparationDriver(options: MobileBuildMcpDriverOptions): IosPreparationDriver {
  return new MobileBuildMcpDriver({ ...options, stopAppOnClose: false });
}
export function createObservedDriver(options: MobileBuildMcpDriverOptions): ObservedActionDriver {
  return new MobileBuildMcpDriver({ ...options, stopAppOnClose: false });
}
