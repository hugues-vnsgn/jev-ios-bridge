import { mkdtemp } from 'node:fs/promises';
import { tmpdir, userInfo } from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { Action, ActionScenarioContext, ActOutcome, ActPath, AppProblem, DeviceDriver, DevicePreparation, LogSources, PrepareScenarioContext,
  Snapshot, StackProvenance } from '../contracts/index.js';
import { Admission, AdmissionError } from '../device/admission.js';
import type { AllocationCommit, ObservedClaim, PreparationClaim } from '../device/admission-allocation.js';
import { adbRunner } from '../device/android/adb.js';
import { LOG_FOLDER, privateLogFolder } from '../device/android/logcat.js';
import { identityProbe } from '../device/android/probe.js';
import { findAdb } from '../device/android/tools.js';
import { DeviceReasonError, type AdmittedAppContext, type IosPreparationDriver, type ObservedActionDriver, type PreparationInventoryStatus } from '../device/index.js';
import type { ProfileBinding } from '../profiles.js';
import { AppiumDriver, type AppiumDriverOptions, type AppiumTarget } from './driver.js';
import { CLEANUP_BUDGET_MS } from './fence/index.js';
import { createFenceRunner } from './fence/runner.js';
import { ownedNativeRunner, type NativeRunner } from './native/process.js';
import { simctlRunner } from './native/simctl.js';
import { FrozenStack, StackError } from './stack.js';

/** What one command's driver needs besides its run: the verified stack, the store and the host's runners. */
export type AppiumDriverParts = Omit<AppiumDriverOptions, 'runId' | 'profile'>;
/** Builds a driver's parts for one target at its first device effect. Production reads the host; a test injects fakes. */
export type AppiumHost = (request: { target: AppiumTarget; admission?: Admission }) => Promise<AppiumDriverParts>;

/** The one Appium composition every entry point uses. The stack is verified per command, before any session. */
export function productionAppiumHost(options: { environment?: NodeJS.ProcessEnv; stack?: FrozenStack; openAdmission?: () => Admission } = {}): AppiumHost {
  const { TYPESAFE_API_KEY: _key, ...environment } = options.environment ?? process.env;
  const openAdmission = options.openAdmission ?? (() => Admission.open());
  const support = join(userInfo().homedir, 'Library/Application Support/jev-ios-bridge');
  return async ({ target, admission }) => {
    // Android reports a missing adb first, as its tools check always has.
    const adb = target.platform === 'android' ? await findAdb({ environment }) : 'adb';
    const stack = await (options.stack ?? FrozenStack.shipped()).prepare();
    const runAdb = adbRunner({ adb, environment });
    const owned = ownedNativeRunner({ environment, record: () => {} });
    const nativeRunner: NativeRunner = (command, output, signal) => owned(command.file === 'adb' ? { ...command, file: adb } : command, output, signal);
    const sdkRoot = basename(dirname(adb)) === 'platform-tools' ? dirname(dirname(adb)) : undefined;
    return { stack, admission: admission ?? openAdmission(), backend: 'real', homeRoot: join(support, 'homes'),
      target: target.platform === 'android' && sdkRoot && !target.androidSdkRoot ? { ...target, androidSdkRoot: sdkRoot } : target,
      logFolder: await privateFolder(target.platform === 'android' ? LOG_FOLDER : join(tmpdir(), 'jev-ios-logs')),
      identityProbe: identityProbe({ adb, environment }), adb: runAdb, nativeRunner,
      fence: createFenceRunner({ adb: runAdb, simctl: simctlRunner({ environment }) }) };
  };
}

async function privateFolder(folder: string): Promise<string> {
  return await privateLogFolder(folder) ?? mkdtemp(join(tmpdir(), `${basename(folder)}-`));
}

/** A stack refusal is the bridge's own probe code, so a report names it as `DEVICE_ERROR` from the bridge. */
function stackRefusal(error: unknown): unknown {
  return error instanceof StackError ? new DeviceReasonError('DEVICE_ERROR', error.message, { vendorCode: error.code, vendorSource: 'bridge' }) : error;
}

export type ComposedDriverOptions = {
  host: AppiumHost;
  /** The device a run or a capture names. Observed roles take the device their claim admitted instead. */
  target?: () => Promise<AppiumTarget>;
  /** iOS observed roles: the simulator presentation for the claimed device. */
  presentation?: 'visible' | 'headless';
  admission?: Admission;
  runId?: string;
  profile?: ProfileBinding;
};

/**
 * One command's Appium driver, built at its first device effect: entry points construct it inertly, so a refused
 * stack or store surfaces in the command's own outcome, and an observed role binds the device its claim admitted.
 */
export class ComposedAppiumDriver implements DeviceDriver, IosPreparationDriver, ObservedActionDriver {
  readonly tapAliasRule = 'same-frame-buttons-v1' as const;
  readonly cleanupBudgetMs = CLEANUP_BUDGET_MS;
  private opening: Promise<AppiumDriver> | undefined;
  private driver: AppiumDriver | undefined;
  private revoked = false;
  private closed = false;

  constructor(private readonly options: ComposedDriverOptions) {}

  private open(target: () => Promise<AppiumTarget>): Promise<AppiumDriver> {
    if (this.closed || this.revoked) return Promise.reject(new AdmissionError('DISPATCH_CLOSED', 'Device issuance is closed'));
    if (this.opening) return Promise.reject(new Error('Driver is already prepared'));
    const { host, admission, runId, profile } = this.options;
    this.opening = (async () => {
      let parts: AppiumDriverParts;
      try { parts = await host({ target: await target(), ...(admission ? { admission } : {}) }); }
      catch (error) { throw stackRefusal(error); }
      const driver = new AppiumDriver({ ...parts, ...(runId ? { runId } : {}), ...(profile ? { profile } : {}) });
      this.driver = driver;
      if (this.revoked) driver.revokeIssuance();
      return driver;
    })();
    return this.opening;
  }

  private named(): () => Promise<AppiumTarget> {
    const target = this.options.target;
    if (!target) throw new AdmissionError('INVALID_REQUEST', 'This driver has no named device');
    return target;
  }

  private claimed(claim: PreparationClaim | ObservedClaim): () => Promise<AppiumTarget> {
    return async () => ({ platform: 'ios', device: claim.identity.device, presentation: this.options.presentation ?? 'visible' });
  }

  private live(): AppiumDriver {
    if (!this.driver) throw new AdmissionError('DISPATCH_CLOSED', 'Driver is not prepared');
    return this.driver;
  }

  async prepare(scenario: PrepareScenarioContext, signal: AbortSignal): Promise<void> { await (await this.open(this.named())).prepare(scenario, signal); }
  async capture(signal: AbortSignal): Promise<Snapshot> { return (await this.open(this.named())).capture(signal); }
  async attachPreparation(claim: PreparationClaim, context: AdmittedAppContext, signal: AbortSignal): Promise<void> {
    await (await this.open(this.claimed(claim))).attachPreparation(claim, context, signal);
  }
  async attachObserved(claim: ObservedClaim, context: AdmittedAppContext, signal: AbortSignal): Promise<void> {
    await (await this.open(this.claimed(claim))).attachObserved(claim, context, signal);
  }

  observe(signal: AbortSignal): Promise<Snapshot> { return this.live().observe(signal); }
  act(action: Action, snapshot: Snapshot, scenario: ActionScenarioContext, signal: AbortSignal): Promise<Snapshot | ActOutcome> {
    return this.live().act(action, snapshot, scenario, signal);
  }
  tapOnce(ref: string, snapshot: Snapshot, scenario: ActionScenarioContext, signal: AbortSignal): Promise<Snapshot | undefined> {
    return this.live().tapOnce(ref, snapshot, scenario, signal);
  }
  inventoryStatus(signal: AbortSignal, timeoutMs?: number): Promise<PreparationInventoryStatus | undefined> { return this.live().inventoryStatus(signal, timeoutMs); }
  boot(signal: AbortSignal, timeoutMs?: number): Promise<void> { return this.live().boot(signal, timeoutMs); }
  bootState(signal: AbortSignal, timeoutMs?: number): Promise<string | undefined> { return this.live().bootState(signal, timeoutMs); }
  install(artifactPath: string, signal: AbortSignal, timeoutMs?: number): Promise<void> { return this.live().install(artifactPath, signal, timeoutMs); }
  launch(signal: AbortSignal, timeoutMs?: number): Promise<void> { return this.live().launch(signal, timeoutMs); }
  readiness(signal: AbortSignal, timeoutMs?: number): Promise<Snapshot> { return this.live().readiness(signal, timeoutMs); }
  park(readinessEvidence: string[], evidenceRefs: string[], signal: AbortSignal): Promise<AllocationCommit> { return this.live().park(readinessEvidence, evidenceRefs, signal); }

  actPath(): ActPath | undefined { return this.driver?.actPath(); }
  appRunning(): boolean | undefined { return this.driver?.appRunning(); }
  appProblem(): AppProblem | undefined { return this.driver?.appProblem(); }
  logSources(): LogSources { return this.driver?.logSources() ?? {}; }
  preparation(): DevicePreparation | undefined { return this.driver?.preparation(); }
  provenance(): StackProvenance { return this.live().provenance(); }

  revokeIssuance(): void { this.revoked = true; this.driver?.revokeIssuance(); }

  async close(signal: AbortSignal): Promise<void> {
    this.closed = true;
    const driver = await this.opening?.catch(() => undefined);
    await driver?.close(signal);
  }
}
