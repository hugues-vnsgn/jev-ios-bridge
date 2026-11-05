import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type * as admissionModule from '../../../src/device/admission.js';
import type { Admission, DeviceIdentity } from '../../../src/device/admission.js';
import type * as probeModule from '../../../src/device/android/probe.js';
import type * as adbModule from '../../../src/device/android/adb.js';
import type * as toolsModule from '../../../src/device/android/tools.js';
import type * as identityModule from '../../../src/device/identity.js';
import type { IdentityProbe, ResolvedIdentity } from '../../../src/device/identity.js';
import type * as compositionModule from '../../../src/appium/composition.js';
import type { AppiumHost } from '../../../src/appium/composition.js';
import type * as fenceRunnerModule from '../../../src/appium/fence/runner.js';
import type * as runModule from '../../../src/scripted/run.js';
import type * as logModule from '../../../src/log/index.js';
import type * as simctlModule from '../../../src/appium/native/simctl.js';
import type { FenceRunner } from '../../../src/appium/fence/index.js';
import type { AppiumTarget } from '../../../src/appium/driver.js';
import type { DeviceDriver } from '../../../src/contracts/index.js';
import type { ScriptedScenario } from '../../../src/scripted/contracts.js';
import { scriptedCycle, type CycleBackend, type CycleRuntime } from './cycles.js';
import type { DeviceScope } from './row.js';

/**
 * The product pieces a live cycle runs on. They come from the built product, as the shipped CLI runs it:
 * the Appium stack identity and the Appium child's entry exist only in `dist`, so the source tree cannot drive a device.
 */
export interface BuiltProduct {
  Admission: typeof admissionModule.Admission;
  identityProbe: typeof probeModule.identityProbe;
  adbRunner: typeof adbModule.adbRunner;
  adbEnvironment: typeof toolsModule.adbEnvironment;
  findAdb: typeof toolsModule.findAdb;
  resolveIdentity: typeof identityModule.resolveIdentity;
  ComposedAppiumDriver: typeof compositionModule.ComposedAppiumDriver;
  productionAppiumHost: typeof compositionModule.productionAppiumHost;
  createFenceRunner: typeof fenceRunnerModule.createFenceRunner;
  simctlRunner: typeof simctlModule.simctlRunner;
  runScriptedScenario: typeof runModule.runScriptedScenario;
  createRunLog: typeof logModule.createRunLog;
}

/** The modules each product piece comes from, relative to `dist`, and the build outputs the source tree lacks. */
export const BUILT_PRODUCT_ENTRIES = {
  modules: ['device/admission.js', 'device/android/probe.js', 'device/android/adb.js', 'device/android/tools.js', 'device/identity.js',
    'appium/composition.js', 'appium/fence/runner.js', 'appium/native/simctl.js', 'scripted/run.js', 'log/index.js'],
  files: ['appium/stack-identity.js', 'appium/extension/entry.js'],
} as const;

/** This checkout's build output. */
export const BUILT_PRODUCT_ROOT = fileURLToPath(new URL('../../../dist/', import.meta.url));

/** Loads the product pieces from a build output, and refuses a folder that is not a complete build. */
export async function loadBuiltProduct(root: string = BUILT_PRODUCT_ROOT): Promise<BuiltProduct> {
  for (const file of [...BUILT_PRODUCT_ENTRIES.files, ...BUILT_PRODUCT_ENTRIES.modules]) {
    if (!existsSync(join(root, file))) throw new Error(`The built product is missing ${file} under ${root}; run npm run build first.`);
  }
  const load = async (file: string): Promise<Record<string, unknown>> => await import(pathToFileURL(join(root, file)).href) as Record<string, unknown>;
  const [admission, probe, adb, tools, identity, composition, fence, simctl, scripted, log] = await Promise.all(BUILT_PRODUCT_ENTRIES.modules.map(load));
  const piece = <T>(module: Record<string, unknown> | undefined, name: string): T => {
    if (module === undefined || !(name in module)) throw new Error(`The built product does not export ${name}; run npm run build first.`);
    return module[name] as T;
  };
  return {
    Admission: piece(admission, 'Admission'),
    identityProbe: piece(probe, 'identityProbe'),
    adbRunner: piece(adb, 'adbRunner'),
    adbEnvironment: piece(tools, 'adbEnvironment'),
    findAdb: piece(tools, 'findAdb'),
    resolveIdentity: piece(identity, 'resolveIdentity'),
    ComposedAppiumDriver: piece(composition, 'ComposedAppiumDriver'),
    productionAppiumHost: piece(composition, 'productionAppiumHost'),
    createFenceRunner: piece(fence, 'createFenceRunner'),
    simctlRunner: piece(simctl, 'simctlRunner'),
    runScriptedScenario: piece(scripted, 'runScriptedScenario'),
    createRunLog: piece(log, 'createRunLog'),
  };
}

/** The parts a cycle runs on: the device it drives, the authority that records it, and the fence it reads. */
export interface CycleBackendParts {
  /** The device the owner assigned, as the admission store knows it. */
  device: DeviceIdentity;
  /** What the driver is told to drive: it resolves this again, so an emulator is named by its running serial. */
  target: AppiumTarget;
  admission: Admission;
  /** The bridge's own fence. The harness only ever sends read effects through it. */
  fence: FenceRunner;
  /** The scripted runner and run log of the build the driver comes from. */
  runtime: CycleRuntime;
  /** The driver for one cycle; it gets the cycle's run id, which is also its admission attempt id. */
  driver: (input: { runId: string; index: number }) => DeviceDriver;
}

/** The cycle backend over the parts: one scripted run per cycle, each on its own admission attempt. */
export function createLiveCycleBackend(parts: CycleBackendParts): (input: { scenario: ScriptedScenario; logRoot: string }) => CycleBackend {
  return ({ scenario, logRoot }) => {
    const cycle = scriptedCycle({ scenario, logRoot, runtime: parts.runtime, driver: parts.driver });
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
  return { platform: 'android', device: resolved.category === 'android-emulator' ? resolved.transport.serial : resolved.value, category: resolved.category,
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
  /** The product the live kit runs on; the built one unless a test injects its own. */
  product?: BuiltProduct;
}

/** The device an assignment names, resolved against the live probe, with the authority, host and fence a driver on it needs. */
export interface LiveTarget {
  device: DeviceIdentity;
  resolved: ResolvedIdentity;
  admission: Admission;
  fence: FenceRunner;
  host: AppiumHost;
  target: AppiumTarget;
  /** The adb the probe resolved the device with; `adb` when a simulator run never needs one. */
  adb: string;
  /** The product the admission, host and fence came from; a driver on this target comes from it too. */
  product: BuiltProduct;
}

/**
 * The assigned device resolved against the live identity probe, with the production admission authority, the
 * production host and the real fence. It opens no session.
 */
export async function resolveLiveTarget(options: LiveCyclePartsOptions): Promise<LiveTarget> {
  const product = options.product ?? await loadBuiltProduct();
  const environment = options.environment ?? process.env;
  const signal = options.signal ?? new AbortController().signal;
  const admission = options.admission ?? product.Admission.open();
  const android = options.category !== 'ios-simulator';
  const adbEnvironmentOf = product.adbEnvironment(environment);
  // A simulator run never reaches adb, so a missing platform-tools is not its refusal.
  const adb = options.adbPath ?? (android ? await product.findAdb({ environment: adbEnvironmentOf }) : 'adb');
  const probe = options.probe ?? product.identityProbe({ adb, environment: adbEnvironmentOf });
  const resolved = await product.resolveIdentity({ request: requestOf(options.category, options.device), probe, signal });
  const expected = expectedCategory(options.category);
  if (resolved.category !== expected) {
    throw new Error(`The assignment names ${expected} ${options.device}, but the live device is ${resolved.category}.`);
  }
  const host = options.host ?? product.productionAppiumHost({ environment, openAdmission: () => admission });
  const fence = product.createFenceRunner({ adb: product.adbRunner({ adb, environment }), simctl: product.simctlRunner({ environment }) });
  const androidSdkRoot = android && basename(dirname(adb)) === 'platform-tools' ? dirname(dirname(adb)) : undefined;
  return { device: { category: resolved.category, value: resolved.value }, resolved, admission, fence, host, target: targetOf(resolved, androidSdkRoot), adb, product };
}

/** The live parts: the resolved device, the production admission authority, the real fence, and a driver that runs on it. */
export async function resolveLiveCycleParts(options: LiveCyclePartsOptions): Promise<CycleBackendParts> {
  const { device, admission, fence, host, target, product } = await resolveLiveTarget(options);
  return {
    device,
    target,
    admission,
    fence,
    runtime: product,
    driver: ({ runId }) => new product.ComposedAppiumDriver({ host, admission, runId, target: async () => target }),
  };
}
