import { AndroidDriver } from './android/driver.js';
import { createExitWatch } from './android/exit-watch.js';
import { MobileBuildMcpDriver, createMobileBuildMcpDriver } from './index.js';
/**
 * Builds the device driver for one script. One bridge process serves scripts for every platform, so
 * the driver is chosen per script, never per process: the Android driver for an Android script, given
 * the script's device, the run's ID (which names the app's log file) and the app-exit watcher, and the
 * MobileBuildMCP driver for every other script.
 */
export function createDriverFactory(options) {
    return (scenario, run) => {
        if (scenario.platform === 'android') {
            return new AndroidDriver({ createExitWatch, ...options.android, device: scenario.device, runId: run?.runId });
        }
        return createMobileBuildMcpDriver({ ...options.mobileBuildMcp, ...(run ? { runId: run.runId } : {}) });
    };
}
/** Allocation and action composition use narrow typed seams, never fake scenario casts. */
export function createPreparationDriver(options) {
    return new MobileBuildMcpDriver({ ...options, stopAppOnClose: false });
}
export function createObservedDriver(options) {
    return new MobileBuildMcpDriver({ ...options, stopAppOnClose: false });
}
