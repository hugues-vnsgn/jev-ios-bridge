import type { DeviceDriver } from '../contracts/index.js';
import type { ScriptedScenario } from '../scripted/contracts.js';
import { AndroidDriver, type AndroidDriverOptions } from './android/driver.js';
import { createExitWatch } from './android/exit-watch.js';
import { MobileBuildMcpDriver, type IosPreparationDriver, type ObservedActionDriver, createMobileBuildMcpDriver, type MobileBuildMcpDriverOptions } from './index.js';
import type { ProfileBinding } from '../profiles.js';

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

/** Allocation and action composition use narrow typed seams, never fake scenario casts. */
export function createPreparationDriver(options: MobileBuildMcpDriverOptions): IosPreparationDriver {
  return new MobileBuildMcpDriver({ ...options, stopAppOnClose: false });
}
export function createObservedDriver(options: MobileBuildMcpDriverOptions): ObservedActionDriver {
  return new MobileBuildMcpDriver({ ...options, stopAppOnClose: false });
}
