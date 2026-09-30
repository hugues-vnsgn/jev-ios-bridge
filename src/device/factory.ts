import type { DeviceDriver } from '../contracts/index.js';
import type { ScriptedScenario } from '../scripted/contracts.js';
import { AndroidDriver, type AndroidDriverOptions } from './android/driver.js';
import { createMobileBuildMcpDriver, type MobileBuildMcpDriverOptions } from './index.js';

export interface DriverFactoryOptions {
  mobileBuildMcp: MobileBuildMcpDriverOptions;
  /** The Android driver's options, `JEV_ANDROID_DEVICE` as `defaultDevice` among them. The device comes from each script. */
  android?: Omit<AndroidDriverOptions, 'device'>;
}

/**
 * Builds the device driver for one script. One bridge process serves scripts for every platform, so
 * the driver is chosen per script, never per process: the Android driver for an Android script, given
 * the script's device, and the MobileBuildMCP driver for every other script.
 */
export function createDriverFactory(options: DriverFactoryOptions): (scenario: ScriptedScenario) => DeviceDriver {
  return (scenario) => {
    if (scenario.platform === 'android') return new AndroidDriver({ ...options.android, device: scenario.device });
    return createMobileBuildMcpDriver(options.mobileBuildMcp);
  };
}
