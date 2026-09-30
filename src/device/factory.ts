import type { DeviceDriver } from '../contracts/index.js';
import type { ScriptedScenario } from '../scripted/contracts.js';
import { createMobileBuildMcpDriver, DriverUnavailableError, type MobileBuildMcpDriverOptions } from './index.js';

export interface DriverFactoryOptions {
  mobileBuildMcp: MobileBuildMcpDriverOptions;
}

/**
 * Builds the device driver for one script. One bridge process serves scripts for every platform, so
 * the driver is chosen per script, never per process. No Android driver exists, so an Android script is
 * refused here, with a clear start error, rather than reaching the iOS driver.
 */
export function createDriverFactory(options: DriverFactoryOptions): (scenario: ScriptedScenario) => DeviceDriver {
  return (scenario) => {
    if (scenario.platform === 'android') throw new DriverUnavailableError("Android isn't available in this build");
    return createMobileBuildMcpDriver(options.mobileBuildMcp);
  };
}
