import type { DeviceDriver } from '../contracts/index.js';
import type { ScriptedScenario } from '../scripted/contracts.js';
import { ComposedAppiumDriver, type AppiumHost } from '../appium/composition.js';
import type { Admission } from './admission.js';
import { selectAndroidDeviceName, selectDeviceId, type DeviceWindowOpener, type IosPreparationDriver, type ObservedActionDriver } from './index.js';
import type { AndroidDeviceName, DeviceAgreement, Profile, ProfileBinding } from '../profiles.js';
import { identityProbe } from './android/probe.js';
import { adbEnvironment, findAdb } from './android/tools.js';
import { resolveIdentity, sameIdentity, type IdentityProbe } from './identity.js';

/** One run's driver inputs: its ID, and the selected profile's binding and device category. */
export type DriverRun = { runId: string; profile?: ProfileBinding; deviceCategory?: Profile['deviceCategory'] };

export interface DriverFactoryOptions {
  host: AppiumHost;
  projectDir: string;
  defaultUdid?: string | undefined;
  defaultDevice?: string | undefined;
  deviceWindow?: DeviceWindowOpener | undefined;
}

export function createDriverFactory(options: DriverFactoryOptions): (scenario: ScriptedScenario, run?: DriverRun) => DeviceDriver {
  const { deviceWindow } = options;
  return (scenario, run) => new ComposedAppiumDriver({ host: options.host, ...(run ? { runId: run.runId } : {}), ...(run?.profile ? { profile: run.profile } : {}),
    ...(deviceWindow ? { deviceWindow } : {}),
    target: async () => scenario.platform === 'android'
      ? { platform: 'android', device: selectAndroidDeviceName(scenario.device, options.defaultDevice), serverInstallation: { kind: 'install' },
        ...(run?.deviceCategory === 'android-emulator' || run?.deviceCategory === 'android-phone' ? { category: run.deviceCategory } : {}) }
      : { platform: 'ios', device: await selectDeviceId(options.projectDir, scenario.device?.udid, options.defaultUdid) } });
}

export function createPreparationDriver(options: { host: AppiumHost; admission: Admission }): IosPreparationDriver {
  return new ComposedAppiumDriver(options);
}
export function createObservedDriver(options: { host: AppiumHost; admission: Admission }): ObservedActionDriver {
  return new ComposedAppiumDriver(options);
}

/** Profile device agreement through the read-only identity probe: both names resolve live, then compare identities. */
export function createDeviceAgreement(options: { probe?: IdentityProbe } = {}): DeviceAgreement {
  const name = (device: AndroidDeviceName) => 'serial' in device ? device.serial : device.avd;
  return async (left, right, signal) => {
    const probe = options.probe ?? identityProbe({ adb: await findAdb({ environment: adbEnvironment() }), environment: adbEnvironment() });
    const first = await resolveIdentity({ request: { category: 'android', name: name(left) }, probe, signal });
    const second = await resolveIdentity({ request: { category: 'android', name: name(right) }, probe, signal });
    return sameIdentity(first, second);
  };
}
