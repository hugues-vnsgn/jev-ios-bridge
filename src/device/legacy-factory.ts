import type { DeviceDriver } from '../contracts/index.js';
import type { ScriptedScenario } from '../scripted/contracts.js';
import { AndroidDriver, type AndroidDriverOptions } from './android/driver.js';
import { createExitWatch } from './android/exit-watch.js';
import { MobileBuildMcpDriver, type IosPreparationDriver, type ObservedActionDriver, createMobileBuildMcpDriver, type MobileBuildMcpDriverOptions } from './index.js';
import type { Profile, ProfileBinding } from '../profiles.js';

export type LegacyDriverRun = { runId: string; profile?: ProfileBinding; deviceCategory?: Profile['deviceCategory'] };

export interface LegacyDriverFactoryOptions {
  mobileBuildMcp: MobileBuildMcpDriverOptions;
  android?: Omit<AndroidDriverOptions, 'device' | 'runId'>;
}

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

export function createPreparationDriver(options: MobileBuildMcpDriverOptions): IosPreparationDriver {
  return new MobileBuildMcpDriver({ ...options, stopAppOnClose: false });
}
export function createObservedDriver(options: MobileBuildMcpDriverOptions): ObservedActionDriver {
  return new MobileBuildMcpDriver({ ...options, stopAppOnClose: false });
}
