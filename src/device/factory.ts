import type { DeviceDriver } from '../contracts/index.js';
import type { ScriptedScenario } from '../scripted/contracts.js';
import { createMobileBuildMcpDriver, type MobileBuildMcpDriverOptions } from './index.js';

export interface DriverFactoryOptions {
  mobileBuildMcp: MobileBuildMcpDriverOptions;
}

/**
 * Builds the device driver for one script. One bridge process serves scripts for every platform, so
 * the driver is chosen per script, never per process. For now every script gets the MobileBuildMCP
 * driver; the Android driver joins behind this same function, chosen by the script's platform.
 */
export function createDriverFactory(options: DriverFactoryOptions): (scenario: ScriptedScenario) => DeviceDriver {
  return (_scenario) => createMobileBuildMcpDriver(options.mobileBuildMcp);
}
