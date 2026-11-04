import { basename, dirname, join } from 'node:path';
import { Admission, type DeviceIdentity } from '../../../src/device/admission.js';
import { identityProbe } from '../../../src/device/android/probe.js';
import { adbRunner } from '../../../src/device/android/adb.js';
import { adbEnvironment, findAdb } from '../../../src/device/android/tools.js';
import { resolveIdentity, type IdentityProbe, type ResolvedIdentity } from '../../../src/device/identity.js';
import { ComposedAppiumDriver, productionAppiumHost, type AppiumHost } from '../../../src/appium/composition.js';
import { createFenceRunner } from '../../../src/appium/fence/runner.js';
import { simctlRunner } from '../../../src/appium/native/simctl.js';
import type { FenceRunner } from '../../../src/appium/fence/index.js';
import type { AppiumTarget } from '../../../src/appium/driver.js';
import type { DeviceDriver } from '../../../src/contracts/index.js';
import type { ScriptedScenario } from '../../../src/scripted/contracts.js';
import { scriptedCycle, type CycleBackend } from './cycles.js';
import type { DeviceScope } from './row.js';

/** The parts a cycle runs on: the device it drives, the authority that records it, and the fence it reads. */
export interface CycleBackendParts {
  /** The device the owner assigned, as the admission store knows it. */
  device: DeviceIdentity;
  admission: Admission;
  /** The bridge's own fence. The harness only ever sends read effects through it. */
  fence: FenceRunner;
  /** The driver for one cycle; it gets the cycle's run id, which is also its admission attempt id. */
  driver: (input: { runId: string; index: number }) => DeviceDriver;
}

/** The cycle backend over the parts: one scripted run per cycle, each on its own admission attempt. */
export function createLiveCycleBackend(parts: CycleBackendParts): (input: { scenario: ScriptedScenario; logRoot: string }) => CycleBackend {
  return ({ scenario, logRoot }) => {
    const cycle = scriptedCycle({ scenario, logRoot, driver: parts.driver });
    return {
      device: parts.device,
      fence: parts.fence,
      admission: {
        inspect: device => parts.admission.inspect(device),
        readAttempt: identity => parts.admission.readAttempt(identity),
        readGeneration: expected => parts.admission.readGeneration(expected),
      },
      cycle: async (index, signal) => await cycle(index, signal),
    };
  };
}

/** The identity request for an assignment: an Android assignment may name a serial or an AVD name. */
function requestOf(category: DeviceScope, device: string): { category: 'ios-simulator' | 'android'; name: string } {
  return category === 'ios-simulator' ? { category: 'ios-simulator', name: device } : { category: 'android', name: device };
}

/** The category the assignment named, as the identity probe reports it. */
function expectedCategory(category: DeviceScope): ResolvedIdentity['category'] {
  return category === 'ios-simulator' ? 'ios-simulator' : category === 'android-emulator' ? 'android-emulator' : 'android-phone';
}

/** The target the driver runs on: the resolved device, in the set or SDK it actually lives in. */
function targetOf(resolved: ResolvedIdentity, androidSdkRoot: string | undefined): AppiumTarget {
  if (resolved.category === 'ios-simulator') return { platform: 'ios', device: resolved.value, deviceSet: resolved.deviceSet };
  return { platform: 'android', device: resolved.value, category: resolved.category,
    serverInstallation: { kind: 'install' }, ...(androidSdkRoot ? { androidSdkRoot } : {}) };
}

export interface LiveCyclePartsOptions {
  /** The device category the owner's assignment named. */
  category: DeviceScope;
  /** The device the owner's assignment named: a simulator UDID, an adb serial or an AVD name. */
  device: string;
  environment?: NodeJS.ProcessEnv;
  admission?: Admission;
  /** The host that opens the driver; the production one unless a test injects its own. */
  host?: AppiumHost;
  /** The identity probe that resolves the assignment; the live one unless a test injects its own. */
  probe?: IdentityProbe;
  /** The adb the probe and the fence use; the platform-tools one unless a test injects its own. */
  adbPath?: string;
  signal?: AbortSignal;
}

/**
 * The live parts: the assigned device resolved against the live identity probe, the production admission
 * authority, the real fence, and a driver that runs on the resolved device.
 */
export async function resolveLiveCycleParts(options: LiveCyclePartsOptions): Promise<CycleBackendParts> {
  const environment = options.environment ?? process.env;
  const signal = options.signal ?? new AbortController().signal;
  const admission = options.admission ?? Admission.open();
  const android = options.category !== 'ios-simulator';
  const adbEnvironmentOf = adbEnvironment(environment);
  // A simulator run never reaches adb, so a missing platform-tools is not its refusal.
  const adb = options.adbPath ?? (android ? await findAdb({ environment: adbEnvironmentOf }) : 'adb');
  const probe = options.probe ?? identityProbe({ adb, environment: adbEnvironmentOf });
  const resolved = await resolveIdentity({ request: requestOf(options.category, options.device), probe, signal });
  const expected = expectedCategory(options.category);
  if (resolved.category !== expected) {
    throw new Error(`The assignment names ${expected} ${options.device}, but the live device is ${resolved.category}.`);
  }
  const host = options.host ?? productionAppiumHost({ environment, openAdmission: () => admission });
  const fence = createFenceRunner({ adb: adbRunner({ adb, environment }), simctl: simctlRunner({ environment }) });
  const androidSdkRoot = android && basename(dirname(adb)) === 'platform-tools' ? dirname(dirname(adb)) : undefined;
  const target = targetOf(resolved, androidSdkRoot);
  return {
    device: { category: resolved.category, value: resolved.value },
    admission,
    fence,
    driver: ({ runId }) => new ComposedAppiumDriver({ host, admission, runId, target: async () => target }),
  };
}
