import type { DeviceDriver } from '../contracts/index.js';
import type { ScriptedScenario } from '../scripted/contracts.js';
import { AndroidDriver, type AndroidDriverOptions } from './android/driver.js';
import { createExitWatch } from './android/exit-watch.js';
import { MobileBuildMcpDriver, type IosPreparationDriver, type ObservedActionDriver, createMobileBuildMcpDriver, type MobileBuildMcpDriverOptions } from './index.js';
import type { Profile, ProfileBinding } from '../profiles.js';

/** One run's driver inputs: its ID, and the selected profile's binding and device category. */
export type LegacyDriverRun = { runId: string; profile?: ProfileBinding; deviceCategory?: Profile['deviceCategory'] };

export interface LegacyDriverFactoryOptions {
  mobileBuildMcp: MobileBuildMcpDriverOptions;
  /** The Android driver's options, `JEV_ANDROID_DEVICE` as `defaultDevice` among them. The device comes from each script. */
  android?: Omit<AndroidDriverOptions, 'device' | 'runId'>;
}

/**
 * The pre-Appium drivers, kept in the tree for their own tests; no entry point reaches them. The driver is chosen per
 * script: the Android driver for an Android script, given the script's device, the run's ID and the app-exit watcher,
 * and the MobileBuildMCP driver for every other script.
 */
export function createLegacyDriverFactory(options: LegacyDriverFactoryOptions):
  (scenario: ScriptedScenario, run?: LegacyDriverRun) => DeviceDriver {
  return (scenario: ScriptedScenario, run?: LegacyDriverRun) => {
    if (scenario.platform === 'android') {
      return new AndroidDriver({ createExitWatch, ...options.android, device: scenario.device, runId: run?.runId, profile: run?.profile,
        ...(run?.deviceCategory === 'android-emulator' || run?.deviceCategory === 'android-phone' ? { category: run.deviceCategory } : {}) });
    }
    return createMobileBuildMcpDriver({ ...options.mobileBuildMcp, ...(run ? { runId: run.runId } : {}),
      ...(run?.profile ? { profile: run.profile } : {}) });
  };
}

/** The pre-Appium preparation and action drivers, for their own tests and the allocator's fake backend. */
export function createPreparationDriver(options: MobileBuildMcpDriverOptions): IosPreparationDriver {
  return new MobileBuildMcpDriver({ ...options, stopAppOnClose: false });
}
export function createObservedDriver(options: MobileBuildMcpDriverOptions): ObservedActionDriver {
  return new MobileBuildMcpDriver({ ...options, stopAppOnClose: false });
}
