import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isActOutcome, isIosApp, type Action, type ActionScenarioContext, type ActOutcome, type ActPath, type AppProblem, type DeviceDriver,
  type DevicePreparation, type LogSources, type PrepareScenarioContext, type Snapshot, type StackProvenance, type VendorSource } from '../contracts/index.js';
import { Admission, AdmissionError, type AdmissionClaim, type AdmittedSession, type CommandRequest, type FenceRequest } from '../device/admission.js';
import type { AllocationCommit, ObservedClaim, PreparationClaim } from '../device/admission-allocation.js';
import type { AdbRunner } from '../device/android/adb.js';
import { EVENT_FILTER, type AppExitWatch, type createExitWatch } from '../device/android/exit-watch.js';
import { deleteOldLogs, privateLogFolder, type LogcatOutput, type LogcatStarter, type LogcatStream } from '../device/android/logcat.js';
import { androidStartTime, processGone, shellCommand } from '../device/android/recovery.js';
import { DeviceReasonError, StaleSnapshotError, type AdmittedAppContext, type DeviceWindowOpener, type IosPreparationDriver, type ObservedActionDriver,
  type PreparationInventoryStatus } from '../device/index.js';
import { executorOf, type StartLookup } from '../device/host-start.js';
import { IdentityResolutionError, resolveIdentity, revalidateIdentity, type IdentityProbe, type ResolvedIdentity } from '../device/identity.js';
import { CompatibilityMarker, DeviceLeaseBusyError } from '../device/lease.js';
import { createNativeLogSource, readLogTail, type NativeLogSource } from '../device/logs.js';
import { OperationTracker } from '../device/operation-tracker.js';
import type { Clock } from '../device/settle.js';
import type { ProfileBinding } from '../profiles.js';
import { PrivateAppiumClient, type AppiumComponentRecord } from './client.js';
import { CLEANUP_BUDGET_MS, fenceAppium, type FenceClaim, type FenceEffect, type FenceOptions, type FenceRunner } from './fence/index.js';
import { appiumComponentSchema, fenceEffectSchema, hostIdentitySchema, wdaInventorySchema, type AppiumComponent, type HostIdentity } from './fence/schema.js';
import { androidNativeHelpers } from './native/android.js';
import { launchIosConsole, observeIosLogs, observedIosPreparation } from './native/ios.js';
import type { PresentationReader, SimulatorPresentation } from './native/presentation.js';
import { NativeHelperError, type NativeCommand, type NativeRunner } from './native/process.js';
import { AppiumObservation, type AppiumObservedScreen } from './observe/index.js';
import { ObservationIncompleteError } from './observe/normalize.js';
import { AppiumOperations, REFUSED_BEFORE_INPUT, UnconfirmedOperationError, vendorSourceOf, type OperationName } from './operations/index.js';
import { allocateHostPorts, portComponents, type FreePort, type HostPorts } from './ports.js';
import { AppiumCommandSession, createSessionProfile, type SessionProfile, type SessionProfileInput } from './session.js';
import { StackError, type VerifiedStack } from './stack.js';
import { AppiumError, CLIENT_SDK, EXTENSION_VERSION } from './wire-schemas.js';

/** The device one driver instance serves. Chosen per command by the composition, never inside the driver. */
export type AppiumTarget =
  | { platform: 'ios'; device: string; deviceSet?: string }
  | { platform: 'android'; device: string; category?: 'android-emulator' | 'android-phone'; androidSdkRoot?: string;
    serverInstallation: Extract<SessionProfileInput, { platform: 'android' }>['serverInstallation'] };

export interface AppiumDriverOptions {
  stack: VerifiedStack;
  admission: Admission;
  backend: 'real' | 'fake';
  target: AppiumTarget;
  /** The private root for each command's child HOME, mode 0700. */
  homeRoot: string;
  logFolder: string;
  screenshotFolder?: string;
  identityProbe: IdentityProbe;
  /** The simulator's current presentation, read before each iOS session so `isHeadless` matches it. */
  presentation: PresentationReader;
  fence: FenceRunner;
  nativeRunner: NativeRunner;
  adb?: AdbRunner;
  logcat?: LogcatStarter;
  createExitWatch?: typeof createExitWatch;
  freePort?: FreePort;
  startLookup?: StartLookup;
  runMarker?: () => string;
  /** Test seam: the fake MCP child in place of the extension entry. */
  child?: { entrypoint: string; args?: string[]; nodeArgs?: string[] };
  runId?: string;
  profile?: ProfileBinding;
  lockRoot?: string;
  clock?: Clock;
  /** Test seam: the fence's clock for its TERM, wait and poll steps. */
  fenceClock?: FenceOptions['clock'];
  timeoutMs?: number;
  deviceWindow?: DeviceWindowOpener;
}

type Role = 'run' | 'capture' | 'attach' | 'observed-prepare' | 'observed-action';
type AutomationInventory = { wda: unknown[]; uiautomator2: { serial: string; pid: number; startTime: string }[]; forwards: unknown[] };
type Owner = { claim: AdmissionClaim; dispatcher: AdmittedSession; identity: ResolvedIdentity; owned: boolean };
type IosHelpers = { platform: 'ios'; console: Awaited<ReturnType<typeof launchIosConsole>>; logs?: Awaited<ReturnType<typeof observeIosLogs>>; sources: NativeLogSource[] };
type StreamEntry = { stream: LogcatStream; stopping: boolean };
type AndroidHelpers = { platform: 'android'; streams: StreamEntry[]; logFile?: string; watch?: AppExitWatch };
type Helpers = IosHelpers | AndroidHelpers;
type Command = { client: PrivateAppiumClient; session: AppiumCommandSession; observation: AppiumObservation; operations: AppiumOperations;
  profile: SessionProfile; ports: HostPorts; helpers?: Helpers; launched: boolean };
type Phase =
  | { kind: 'idle' }
  | { kind: 'admitted'; owner: Owner; role: Role; app: AppIdentity }
  | { kind: 'live'; owner: Owner; role: Role; app: AppIdentity; command: Command }
  | { kind: 'closed' };
type AppIdentity = { id: string; launchArgs?: string[]; activity?: string; intentExtras?: Record<string, string> };

const DEFAULT_TIMEOUT_MS = 120_000;
const MIN_ANDROID_API = 31;
const UIAUTOMATOR2_PACKAGES = ['io.appium.uiautomator2.server', 'io.appium.uiautomator2.server.test'];
const refusal = (code: DeviceReasonError['code'], message: string, vendorCode?: string) =>
  new DeviceReasonError(code, message, vendorCode === undefined ? {} : { vendorCode, vendorSource: 'bridge' });

function readyTransport(identity: Exclude<ResolvedIdentity, { category: 'ios-simulator' }>): void {
  if (identity.transport.state === 'unauthorized') throw new DeviceReasonError('DEVICE_UNAUTHORIZED', `Device ${identity.transport.serial} has not accepted this Mac's USB-debugging key`);
  if (identity.transport.state !== 'device') throw new DeviceReasonError('DEVICE_NOT_CONNECTED', `Device ${identity.transport.serial} is ${identity.transport.state}`);
}

function sourceOf(error: unknown, platform: AppiumTarget['platform']): VendorSource {
  if (error instanceof AppiumError) return vendorSourceOf(error.code);
  if (error instanceof NativeHelperError) return platform === 'android' ? 'adb' : 'bridge';
  if (error instanceof ObservationIncompleteError) return sourceOf(error.cause, platform);
  return 'bridge';
}

/** Maps an operation's failure to the bridge's vocabulary with its source, so `error.vendorSource` is truthful. */
export function appiumFailure(error: unknown, platform: AppiumTarget['platform']): unknown {
  const vendorSource = sourceOf(error, platform);
  if (error instanceof AppiumError) return new DeviceReasonError('DEVICE_ERROR', 'The Appium layer refused the command.', { vendorCode: error.code, vendorSource });
  if (error instanceof NativeHelperError) return new DeviceReasonError('DEVICE_ERROR', error.message, { vendorCode: error.code, vendorSource });
  if (error instanceof ObservationIncompleteError) return new DeviceReasonError('DEVICE_ERROR', 'The screen could not be observed.', { vendorCode: `OBSERVATION_${error.reason.toUpperCase().replace(/-/g, '_')}`, vendorSource });
  return error;
}

export class AppiumDriver implements DeviceDriver, IosPreparationDriver, ObservedActionDriver {
  private phase: Phase = { kind: 'idle' };
  private closing: Promise<void> | undefined;
  private readonly operations = new OperationTracker();
  private readonly lease: CompatibilityMarker;
  private latest: AppiumObservedScreen | undefined;
  private lastActPath: ActPath | undefined;
  private sequence = 0;
  private tapOnceIssued = false;
  private issuanceClosed = false;
  private screenshots: Promise<string> | undefined;
  private preparationClaim: PreparationClaim | undefined;
  private handback: Snapshot | undefined;
  private readonly runId: string;
  private readonly timeoutMs: number;
  private readonly aborters = new Set<AbortController>();
  private readonly warnings: string[] = [];
  /** The failure that first left a command uncertain, named in the close's CLEANUP_FAILED. */
  private firstFailure: unknown;

  constructor(private readonly options: AppiumDriverOptions) {
    if (options.admission.mode === 'test' && options.backend !== 'fake') throw new AdmissionError('STATE_UNAVAILABLE', 'Test admission requires the fake backend');
    options.admission.assertBackend(options.backend);
    this.lease = new CompatibilityMarker(options.lockRoot ? { root: options.lockRoot } : {});
    this.runId = options.runId ?? randomUUID();
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  readonly tapAliasRule = 'same-frame-buttons-v1' as const;
  /** Close fences the device components, so the observed runtime bounds it by the shared cleanup budget. */
  readonly cleanupBudgetMs = CLEANUP_BUDGET_MS;

  // ---------- DeviceDriver ----------

  prepare(scenario: PrepareScenarioContext, signal: AbortSignal): Promise<void> {
    return this.operations.track(() => this.prepareIssued(scenario, signal));
  }

  observe(signal: AbortSignal): Promise<Snapshot> {
    return this.operations.track(() => this.observeIssued(signal));
  }

  /** Android capture, as AndroidDriver.capture: the current screen settled under admission from page source alone,
   *  with no launch, reset, stop, screenshot or Jev request. The caller closes the driver after it. */
  capture(signal: AbortSignal): Promise<Snapshot> {
    return this.operations.track(() => this.captureIssued(signal));
  }

  act(action: Action, snapshot: Snapshot, scenario: ActionScenarioContext, signal: AbortSignal): Promise<Snapshot | ActOutcome> {
    return this.operations.track(() => this.actIssued(action, snapshot, scenario, signal));
  }

  close(signal: AbortSignal): Promise<void> {
    if (this.closing) return this.closing;
    if (this.phase.kind === 'closed' || this.phase.kind === 'idle') { this.phase = { kind: 'closed' }; return Promise.resolve(); }
    this.closing = this.finishClose(signal, true);
    return this.closing;
  }

  actPath(): ActPath | undefined { return this.lastActPath; }

  appRunning(): boolean | undefined {
    const helpers = this.helpers();
    return helpers?.platform === 'ios' ? helpers.console.running() : helpers?.watch?.running();
  }

  appProblem(): AppProblem | undefined {
    const helpers = this.helpers();
    return helpers?.platform === 'ios' ? helpers.console.problem() : helpers?.watch?.problem();
  }

  logSources(): LogSources {
    const helpers = this.helpers();
    if (!helpers) return {};
    if (helpers.platform === 'android') return helpers.logFile !== undefined ? { logcat: helpers.logFile } : {};
    const [runtime, os] = helpers.sources;
    return { ...(runtime ? { runtime: runtime.path } : {}), ...(os ? { os: os.path } : {}) };
  }

  /** Android only, as today: the device `prepare` set up, with the UiAutomator2 server APK as its agent. */
  preparation(): DevicePreparation | undefined {
    const { owner } = this.live();
    if (owner.identity.category === 'ios-simulator') return undefined;
    return { deviceIdentity: owner.identity.value, serial: owner.identity.transport.serial, agentSha256: uiautomator2Server(this.options.stack).sha256 };
  }

  prepareWarnings(): string[] { return [...this.warnings]; }

  provenance(): StackProvenance {
    const { manifest } = this.options.stack;
    const common = { backend: 'appium', lockSha256: manifest.lockSha256, extensionVersion: EXTENSION_VERSION, clientVersion: CLIENT_SDK.version } as const;
    return this.options.target.platform === 'ios' ? { ...common, wdaTreeSha256: manifest.wda.treeSha256 }
      : { ...common, uiautomator2ServerSha256: uiautomator2Server(this.options.stack).sha256 };
  }

  // ---------- IosPreparationDriver ----------

  async attachPreparation(claim: PreparationClaim, context: AdmittedAppContext, signal: AbortSignal): Promise<void> {
    if (claim.identity.attempt.kind !== 'preparation') throw new AdmissionError('INVALID_REQUEST', 'Expected preparation ownership');
    this.preparationClaim = claim;
    await this.attach(claim, 'observed-prepare', { id: context.app.bundleId, ...(context.app.launchArgs ? { launchArgs: context.app.launchArgs } : {}) }, signal);
  }

  async inventoryStatus(signal: AbortSignal, timeoutMs = this.timeoutMs): Promise<PreparationInventoryStatus | undefined> {
    const owner = this.admitted().owner;
    return this.dispatch(owner, 'inventory-status', signal, timeoutMs, async issued => {
      const current = await revalidateIdentity({ identity: owner.identity, probe: this.options.identityProbe, signal: issued });
      if (current.category !== 'ios-simulator') return undefined;
      const listed = JSON.parse(current.probeReplies.simulatorList) as { devices: Record<string, { udid: string; state: string; isAvailable: boolean }[]> };
      const device = Object.values(listed.devices).flat().find(item => item.udid.toUpperCase() === current.value);
      return device ? { state: device.state, isAvailable: device.isAvailable } : undefined;
    });
  }

  async bootState(signal: AbortSignal, timeoutMs = this.timeoutMs): Promise<string | undefined> {
    const owner = this.admitted().owner;
    return this.dispatch(owner, 'boot-state', signal, timeoutMs, async issued => {
      const current = await revalidateIdentity({ identity: owner.identity, probe: this.options.identityProbe, signal: issued });
      return current.category === 'ios-simulator' ? current.state : undefined;
    });
  }

  async boot(signal: AbortSignal, timeoutMs = this.timeoutMs): Promise<void> {
    const { owner } = this.admitted();
    const steps = observedIosPreparation({ ...this.iosTarget(owner), role: 'observed-preparation', runner: this.options.nativeRunner, timeoutMs });
    await this.dispatch(owner, 'boot', signal, timeoutMs, issued => steps.boot(issued));
  }

  async install(artifactPath: string, signal: AbortSignal, timeoutMs = this.timeoutMs): Promise<void> {
    const { owner } = this.admitted();
    const steps = observedIosPreparation({ ...this.iosTarget(owner), role: 'observed-preparation', runner: this.options.nativeRunner, timeoutMs });
    await this.dispatch(owner, 'install', signal, timeoutMs, issued => steps.install(artifactPath, issued));
  }

  async launch(signal: AbortSignal, timeoutMs = this.timeoutMs): Promise<void> {
    const admitted = this.admitted();
    const steps = observedIosPreparation({ ...this.iosTarget(admitted.owner), role: 'observed-preparation', runner: this.options.nativeRunner, timeoutMs });
    await this.dispatch(admitted.owner, 'launch', signal, timeoutMs, issued => steps.launch(admitted.app.id, admitted.app.launchArgs ?? [], issued));
    const command = await this.openSession(admitted.owner, admitted.role, signal);
    this.phase = { ...admitted, kind: 'live', command: { ...command, launched: true } };
  }

  async readiness(signal: AbortSignal, timeoutMs = this.timeoutMs): Promise<Snapshot> {
    const live = this.live();
    return this.observeLive(live, signal, 'readiness', timeoutMs);
  }

  /** The preparation session ends before park: a parked allocation has no live driver. */
  async park(readinessEvidence: string[], evidenceRefs: string[], signal: AbortSignal): Promise<AllocationCommit> {
    const live = this.live();
    if (live.role !== 'observed-prepare') throw new AdmissionError('DISPATCH_CLOSED', 'Preparation is not attached');
    const claim = this.preparationClaim;
    if (!claim) throw new AdmissionError('DISPATCH_CLOSED', 'Preparation claim cannot park');
    this.issuanceClosed = true;
    try {
      await this.operations.settle(signal);
      await this.stopCommand(live.command, undefined, signal);
      claim.stageFence(await this.fenceOwn(live.owner, signal));
      return claim.park(readinessEvidence, evidenceRefs);
    } finally { this.phase = { kind: 'closed' }; await this.discardScreenshots(); }
  }

  revokeIssuance(): void {
    this.issuanceClosed = true;
    for (const controller of this.aborters) controller.abort(new AdmissionError('DISPATCH_CLOSED', 'Device issuance is closed'));
    if (this.phase.kind === 'live') this.phase.command.client.stopDispatch();
  }

  // ---------- ObservedActionDriver ----------

  /** A consumed parked action: a fresh session on the running app, with no launch, reset or termination. */
  async attachObserved(claim: ObservedClaim, context: AdmittedAppContext, signal: AbortSignal): Promise<void> {
    if (claim.identity.attempt.kind !== 'observed') throw new AdmissionError('INVALID_REQUEST', 'Expected observed ownership');
    await this.attach(claim, 'observed-action', { id: context.app.bundleId }, signal);
    const admitted = this.admitted();
    const command = await this.openSession(admitted.owner, 'observed-action', signal);
    this.phase = { ...admitted, kind: 'live', command: { ...command, launched: false } };
  }

  tapOnce(ref: string, snapshot: Snapshot, _scenario: ActionScenarioContext, signal: AbortSignal): Promise<Snapshot | undefined> {
    return this.operations.track(async () => {
      const live = this.live();
      const evidence = this.evidenceFor(snapshot);
      if (this.tapOnceIssued) throw new AdmissionError('DISPATCH_CLOSED', 'Tap already authorized');
      this.tapOnceIssued = true;
      const performed = await this.guarded(signal, () => live.command.operations.tap(evidence, ref, signal));
      return this.remember(screenOf(performed.result), performed.screenshot);
    });
  }

  // ---------- lifecycle ----------

  private async prepareIssued(scenario: PrepareScenarioContext, signal: AbortSignal): Promise<void> {
    if (this.phase.kind !== 'idle') throw new Error('Driver is already prepared');
    const target = this.options.target;
    if (isIosApp(scenario.app) !== (target.platform === 'ios')) throw new Error(`The Appium ${target.platform} driver cannot run this scenario's app`);
    if (target.platform === 'ios' && scenario.start === 'attach') throw refusal('UNSUPPORTED_ACTION', 'Start mode "attach" is Android-only: on iOS the bridge cannot tell whether the app is the one in front.');
    const app: AppIdentity = isIosApp(scenario.app)
      ? { id: scenario.app.bundleId, ...(scenario.app.launchArgs ? { launchArgs: scenario.app.launchArgs } : {}) }
      : { id: scenario.app.package, ...(scenario.app.activity ? { activity: scenario.app.activity } : {}), ...(scenario.app.intentExtras ? { intentExtras: scenario.app.intentExtras } : {}) };
    const role: Role = scenario.start === 'attach' ? 'attach' : 'run';
    signal.throwIfAborted();
    const identity = await this.resolve(signal);
    if (identity.category === 'ios-simulator') {
      if (identity.state !== 'Booted') throw new DeviceReasonError('DEVICE_NOT_BOOTED', `Simulator ${identity.value} is not booted (state: ${identity.state}).`);
      const installed = await this.options.identityProbe.simulatorApp({ deviceSet: identity.deviceSet, udid: identity.value, bundleId: app.id, signal });
      if (installed.kind === 'missing') throw refusal('DEVICE_ERROR', `App ${app.id} is not installed on simulator ${identity.value}`, 'APP_NOT_INSTALLED');
    } else readyTransport(identity);
    const owner = await this.admit(identity, { app, start: scenario.start ?? 'restart', ...(this.options.profile ? { profile: this.options.profile } : {}) }, signal);
    this.phase = { kind: 'admitted', owner, role, app };
    try {
      await this.refuseForeign(owner, signal);
      let helpers: IosHelpers | undefined;
      if (identity.category !== 'ios-simulator') await this.prepareAndroidDevice(owner, app.id, signal);
      else if (role === 'run') {
        await this.openWindow(owner, signal);
        helpers = await this.dispatch(owner, 'launch', signal, this.timeoutMs, issued => this.launchIos(owner, app, issued));
      }
      const command = await this.openSession(owner, role, signal, helpers);
      this.phase = { kind: 'live', owner, role, app, command: { ...command, launched: role === 'run' } };
      // A close that arrived meanwhile stops what is now live; prepare starts nothing more.
      if (this.closing) throw new AdmissionError('DISPATCH_CLOSED', 'The driver is closing');
      if (identity.category !== 'ios-simulator') await this.startAndroidApp(owner, this.live(), app, role, signal);
    } catch (error) {
      if (!this.closing && (this.phase.kind === 'admitted' || this.phase.kind === 'live')) {
        this.closing = this.finishClose(AbortSignal.timeout(this.timeoutMs), false);
        await this.closing.catch(() => undefined);
      }
      throw appiumFailure(error, this.options.target.platform);
    }
  }

  private async captureIssued(signal: AbortSignal): Promise<Snapshot> {
    if (this.phase.kind !== 'idle') throw new Error('Driver is already prepared');
    if (this.options.target.platform !== 'android') throw refusal('UNSUPPORTED_ACTION', 'Capture is Android-only, as today.');
    signal.throwIfAborted();
    const identity = await this.resolve(signal);
    if (identity.category === 'ios-simulator') throw refusal('UNSUPPORTED_ACTION', 'Capture is Android-only, as today.');
    readyTransport(identity);
    const app: AppIdentity = { id: '' };
    const owner = await this.admit(identity, { capture: true }, signal);
    this.phase = { kind: 'admitted', owner, role: 'capture', app };
    try {
      await this.refuseForeign(owner, signal);
      await this.prepareAndroidDevice(owner, undefined, signal);
      const command = await this.openSession(owner, 'capture', signal);
      this.phase = { kind: 'live', owner, role: 'capture', app, command: { ...command, launched: false } };
      if (this.closing) throw new AdmissionError('DISPATCH_CLOSED', 'The driver is closing');
      return await this.guarded(signal, () => this.dispatch(owner, 'appium-capture', signal, this.timeoutMs, issued => command.observation.capture(issued)));
    } catch (error) {
      if (!this.closing && (this.phase.kind === 'admitted' || this.phase.kind === 'live')) {
        this.closing = this.finishClose(AbortSignal.timeout(this.timeoutMs), false);
        await this.closing.catch(() => undefined);
      }
      throw appiumFailure(error, this.options.target.platform);
    }
  }

  private async resolve(signal: AbortSignal): Promise<ResolvedIdentity> {
    const target = this.options.target;
    const request = target.platform === 'ios'
      ? { category: 'ios-simulator' as const, name: target.device, ...(target.deviceSet ? { deviceSet: target.deviceSet } : {}) }
      : { category: target.category ?? 'android' as const, name: target.device };
    try { return await resolveIdentity({ request, probe: this.options.identityProbe, signal }); }
    catch (error) {
      if (error instanceof IdentityResolutionError && error.code !== 'PROFILE_CONFLICT') {
        throw new DeviceReasonError(error.code, error.message, error.reason ? { vendorCode: error.reason, vendorSource: 'bridge' } : {});
      }
      throw error;
    }
  }

  private async admit(identity: ResolvedIdentity, intent: unknown, signal: AbortSignal): Promise<Owner> {
    const admission = this.options.admission;
    const deviceIdentity = identity.category === 'android-emulator' ? identity.provenance.avdName : identity.value;
    try { this.lease.assertKnown(deviceIdentity, token => admission.markerRecorded({ category: identity.category, value: identity.value }, token)); }
    catch (error) {
      if (error instanceof DeviceLeaseBusyError) throw new DeviceReasonError('DEVICE_BUSY', error.message);
      throw error;
    }
    const revalidate = (serial: string) => this.revalidate(identity, serial, signal);
    const acquired = await admission.acquireWithAppiumRecovery({ category: identity.category, device: identity.value, attempt: { kind: 'legacy', id: this.runId },
      digest: createHash('sha256').update(JSON.stringify({ intent, runId: this.runId })).digest('hex'), intent, signal,
      // Every caller has passed readyTransport, so the state is `device`, as AndroidDriver records it.
      ...(identity.category !== 'ios-simulator' ? { transport: { serial: identity.transport.serial, state: 'device' as const } } : {}),
      ...(identity.category === 'android-emulator' ? { provenance: identity.provenance } : {}) }, { runner: this.options.fence, revalidate, signal });
    if (acquired.kind !== 'acquired') {
      throw new DeviceReasonError(acquired.kind === 'refused' && acquired.reason === 'DEVICE_QUARANTINED' ? 'DEVICE_QUARANTINED' : 'DEVICE_BUSY',
        `Device admission refused: ${acquired.kind === 'refused' ? acquired.reason : 'ATTEMPT_ALREADY_EXISTS'}`);
    }
    const owner: Owner = { claim: acquired.claim, dispatcher: acquired.claim.bindDriver(this.options.backend), identity, owned: true };
    try { await this.lease.take(deviceIdentity, acquired.claim); }
    catch (error) {
      acquired.claim.finalize({ outcome: 'refused', disposition: 'available', payload: {}, evidenceRefs: [] });
      if (error instanceof DeviceLeaseBusyError) throw new DeviceReasonError('DEVICE_BUSY', error.message);
      throw error;
    }
    return owner;
  }

  private async attach(claim: AdmissionClaim, role: Role, app: AppIdentity, signal: AbortSignal): Promise<void> {
    if (this.phase.kind !== 'idle') throw new Error('Driver is already attached');
    signal.throwIfAborted();
    const identity = await this.resolve(signal);
    if (identity.value !== claim.identity.device) throw new AdmissionError('INVALID_REQUEST', 'Claim names another device');
    const owner: Owner = { claim, dispatcher: claim.bindDriver(this.options.backend), identity, owned: false };
    this.phase = { kind: 'admitted', owner, role, app };
  }

  /** Every serial-bearing fence effect first proves the device is still the admitted one at that serial. */
  private async revalidate(identity: ResolvedIdentity, serial: string, signal: AbortSignal): Promise<void> {
    if (identity.category === 'ios-simulator') throw new Error('A simulator has no serial');
    const current = await revalidateIdentity({ identity, probe: this.options.identityProbe, signal });
    if (current.category === 'ios-simulator' || current.value !== identity.value || current.transport.serial !== serial || current.transport.state !== 'device') {
      throw new DeviceReasonError('DEVICE_NOT_CONNECTED', `Device ${identity.value} is no longer at ${serial}`);
    }
  }

  private async openSession(owner: Owner, role: Role, signal: AbortSignal, helpers?: Helpers): Promise<Omit<Command, 'launched'>> {
    const target = this.options.target;
    const before = await this.refuseForeign(owner, signal);
    const ports = await allocateHostPorts(target.platform, this.options.freePort);
    const device = owner.identity.category === 'ios-simulator' ? owner.identity.value : owner.identity.transport.serial;
    const path = role;
    const input: SessionProfileInput = target.platform === 'ios'
      ? { platform: 'ios', device, path, presentation: await this.readPresentation(signal), ...(target.deviceSet ? { simulatorSet: target.deviceSet } : {}),
        ...(ports.platform === 'ios' ? { ports: { wdaLocalPort: ports.wdaLocalPort, mjpegServerPort: ports.mjpegServerPort } } : {}) }
      : { platform: 'android', device, path, serverInstallation: target.serverInstallation, ...(ports.platform === 'android' ? { ports: { systemPort: ports.systemPort } } : {}) };
    const profile = createSessionProfile(this.options.stack, input);
    for (const component of portComponents(ports, device, randomUUID)) this.register(owner, component);
    const runMarker = (this.options.runMarker ?? (() => randomBytes(16).toString('hex')))();
    const self = this.hostIdentity(process.pid);
    const client = await PrivateAppiumClient.open({ stack: this.options.stack, owner: owner.claim.identity, homeRoot: this.options.homeRoot, profile, timeoutMs: this.timeoutMs,
      ...(this.options.child ? { child: this.options.child } : {}), ...(target.platform === 'android' && target.androidSdkRoot ? { androidSdkRoot: target.androidSdkRoot } : {}),
      launch: { runMarker, ancestry: [self] },
      onComponent: (record: AppiumComponentRecord) => {
        if (record.kind !== 'appium-child') return;
        const leader = this.hostIdentity(record.pid);
        this.register(owner, appiumComponentSchema.parse({ id: randomUUID(), kind: 'appium-process-group', leader, runMarker, pgid: record.pid, members: [], launcher: self }));
      } });
    try {
      const session = await this.dispatch(owner, 'appium-session-create', signal, this.timeoutMs, () => AppiumCommandSession.start({ client, profile, timeoutMs: this.timeoutMs }));
      await this.recordAutomation(owner, device, before, signal);
      const observation = new AppiumObservation(session, this.options.stack, { ...(this.options.clock ? { clock: this.options.clock } : {}) });
      const operations = new AppiumOperations(session, observation, { timeoutMs: this.timeoutMs,
        dispatch: (operation: OperationName, send: () => Promise<void>) => this.dispatch(owner, commandName(role, operation), signal, this.timeoutMs, send,
          { input: INPUTS.has(operation) }) });
      return { client, session, observation, operations, profile, ports, ...(helpers ? { helpers } : {}) };
    } catch (error) { await client.close(); throw error; }
  }

  /** Either guessed presentation could restart the simulator or quit Simulator.app, so an unreadable one refuses. */
  private async readPresentation(signal: AbortSignal): Promise<SimulatorPresentation> {
    try { return await this.options.presentation(AbortSignal.any([signal, AbortSignal.timeout(10_000)])); }
    catch {
      signal.throwIfAborted();
      throw refusal('DEVICE_ERROR', 'The simulator window\'s state could not be read, so no Appium session was started.', 'PRESENTATION_UNKNOWN');
    }
  }

  /** What automation runs on the device right now, read with recorded reads and no effect. */
  private async automationInventory(owner: Owner, signal: AbortSignal, options: { cleanup?: boolean } = {}): Promise<AutomationInventory> {
    if (owner.identity.category === 'ios-simulator') {
      const wda = await this.fenceRead(owner, fenceEffectSchema.parse({ kind: 'wda-inventory', udid: owner.identity.value }), signal);
      return { wda: Array.isArray(wda) ? wda : [], uiautomator2: [], forwards: [] };
    }
    const serial = owner.identity.transport.serial;
    const forwards = await this.fenceRead(owner, fenceEffectSchema.parse({ kind: 'forward-inventory' }), signal);
    const processes = this.options.adb ? await this.uiautomator2Processes(owner, serial, signal, options) : [];
    return { wda: [], uiautomator2: processes.map(process => ({ serial, ...process })), forwards: Array.isArray(forwards) ? forwards : [] };
  }

  /** Automation the store does not own on this device makes the command DEVICE_BUSY before any effect; it is never touched. */
  private async refuseForeign(owner: Owner, signal: AbortSignal, options: { cleanup?: boolean } = {}): Promise<AutomationInventory> {
    const inventory = await this.automationInventory(owner, signal, options);
    const { identity } = owner;
    const verdict = this.options.admission.inspectAppiumAutomation({ category: identity.category, value: identity.value }, inventory,
      identity.category === 'ios-simulator' ? undefined : { serial: identity.transport.serial });
    if (verdict.kind === 'refused') throw new DeviceReasonError('DEVICE_BUSY', 'Automation the bridge does not own is running on this device.');
    return inventory;
  }

  private ownsAutomation(owner: Owner): boolean {
    return this.options.admission.readGeneration(owner.claim.identity).components
      .some(component => component.kind === 'appium-wda' || component.kind === 'appium-uiautomator2' || component.kind === 'appium-forward');
  }

  /**
   * The automation the session started, recorded by identity before any further effect: only what the pre-create
   * inventory did not list, so nothing foreign is ever owned. A created session implies a running runner, so an empty
   * listing is a missed identity, never "nothing to stop".
   */
  private async recordAutomation(owner: Owner, device: string, before: AutomationInventory, signal: AbortSignal): Promise<void> {
    if (owner.identity.category === 'ios-simulator') {
      const rows = wdaInventorySchema.parse((await this.automationInventory(owner, signal)).wda);
      const known = wdaInventorySchema.parse(before.wda);
      for (const row of rows.filter(row => !known.some(prior => prior.pid === row.pid && prior.bundleId === row.bundleId))) {
        this.register(owner, appiumComponentSchema.parse({ id: randomUUID(), kind: 'appium-wda', ...row }));
      }
      if (!rows.length) owner.claim.markInventoryUnknown('WDA_IDENTITY_UNAVAILABLE');
      return;
    }
    if (!this.options.adb) { owner.claim.markInventoryUnknown('UIAUTOMATOR2_IDENTITY_UNAVAILABLE'); return; }
    const processes = await this.uiautomator2Processes(owner, device, signal);
    const fresh = processes.filter(process => !before.uiautomator2.some(prior => prior.pid === process.pid && prior.startTime === process.startTime));
    if (fresh.length) this.register(owner, appiumComponentSchema.parse({ id: randomUUID(), kind: 'appium-uiautomator2', serial: device, processes: fresh }));
    if (!processes.length) owner.claim.markInventoryUnknown('UIAUTOMATOR2_IDENTITY_UNAVAILABLE');
  }

  /** UiAutomator2's device processes by /proc identity, read with a recorded command. */
  private uiautomator2Processes(owner: Owner, serial: string, signal: AbortSignal, options: { cleanup?: boolean } = {}): Promise<{ pid: number; startTime: string }[]> {
    const adb = this.adbRunner();
    return this.dispatch(owner, 'uiautomator2-identity', signal, this.timeoutMs, async issued => {
      const listed = await adb(shellCommand(serial, ['pidof', ...UIAUTOMATOR2_PACKAGES]), issued);
      const pids = listed.exitCode === 0 ? listed.stdout.trim().split(/\s+/).filter(Boolean).map(Number).filter(pid => Number.isSafeInteger(pid) && pid > 0) : [];
      const found: { pid: number; startTime: string }[] = [];
      for (const pid of pids) {
        const stat = await adb(shellCommand(serial, ['cat', `/proc/${String(pid)}/stat`]), issued);
        if (processGone(stat)) continue;
        const startTime = androidStartTime(stat.stdout);
        if (startTime) found.push({ pid, startTime });
      }
      return found;
    }, options);
  }

  /** The legacy device checks, in their order, as recorded reads before any effect: API level, boot, then the app installed.
   *  Capture names no app, so it skips the installed check. */
  private async preflightAndroid(owner: Owner, serial: string, appPackage: string | undefined, signal: AbortSignal): Promise<void> {
    const read = async (operation: string, words: string[]) => {
      const reply = await this.androidShell(owner, operation, serial, words, signal);
      if (reply.exitCode !== 0) throw new DeviceReasonError('DEVICE_ERROR', `adb could not run ${words.join(' ')} on ${serial}`, { vendorCode: 'NATIVE_FAILED', vendorSource: 'adb' });
      return reply.stdout.trim();
    };
    const api = Number(await read('android-preflight-api', ['getprop', 'ro.build.version.sdk']));
    if (!Number.isInteger(api) || api < MIN_ANDROID_API) {
      throw new DeviceReasonError('DEVICE_UNSUPPORTED', `Device ${serial} runs API ${String(api)}; the bridge needs Android 12 (API 31) or later`);
    }
    if (await read('android-preflight-boot', ['getprop', 'sys.boot_completed']) !== '1') throw new DeviceReasonError('DEVICE_NOT_BOOTED', `Device ${serial} hasn't finished booting`);
    if (appPackage === undefined) return;
    const installed = await this.androidShell(owner, 'android-preflight-installed', serial, ['pm', 'path', appPackage], signal);
    if (!/^package:/m.test(installed.stdout)) throw new DeviceReasonError('APP_NOT_INSTALLED', `${appPackage} isn't installed on ${serial}`);
  }

  private async prepareAndroidDevice(owner: Owner, appPackage: string | undefined, signal: AbortSignal): Promise<void> {
    if (owner.identity.category === 'ios-simulator') return;
    const serial = owner.identity.transport.serial;
    await this.preflightAndroid(owner, serial, appPackage, signal);
    const values = await this.fenceRead(owner, fenceEffectSchema.parse({ kind: 'settings-read', serial }), signal);
    this.register(owner, appiumComponentSchema.parse({ id: randomUUID(), kind: 'appium-settings', serial, values }));
    const helpers = androidNativeHelpers({ serial, runner: this.nativeRunnerFor(owner), timeoutMs: Math.min(this.timeoutMs, 10_000) });
    await this.dispatch(owner, 'android-wake', signal, this.timeoutMs, issued => helpers.wake(issued));
  }

  private async startAndroidApp(owner: Owner, live: Extract<Phase, { kind: 'live' }>, app: AppIdentity, role: Role, signal: AbortSignal): Promise<void> {
    if (owner.identity.category === 'ios-simulator') return;
    const serial = owner.identity.transport.serial;
    const helpers = androidNativeHelpers({ serial, runner: this.nativeRunnerFor(owner), timeoutMs: Math.min(this.timeoutMs, 10_000) });
    if (role === 'attach') {
      const front = await this.dispatch(owner, 'android-foreground', signal, this.timeoutMs, issued => helpers.foreground(issued));
      if (front !== app.id) throw refusal('APP_NOT_IN_FOREGROUND', `App ${app.id} is not in front (${front ?? 'no resumed activity'})`);
      const watch = await this.startStreams(owner, live.command, serial, app.id, signal);
      if (watch) await this.readPid(owner, serial, app.id, watch, signal);
      return;
    }
    if (role !== 'run') return;
    const activity = app.activity ?? await this.dispatch(owner, 'android-launcher', signal, this.timeoutMs, async issued => (await helpers.launcher(app.id, issued)).slice(app.id.length + 1));
    // The force-stop comes before the streams' device time, so nothing the previous instance logged is read. No stop is
    // marked expected: the mark is sticky and would hide a later crash of the new pid.
    await this.guarded(signal, () => live.command.operations.terminate(app.id, signal));
    const watch = await this.startStreams(owner, live.command, serial, app.id, signal);
    await this.guarded(signal, () => live.command.operations.restart({ package: app.id, activity, ...(app.intentExtras ? { intentExtras: app.intentExtras } : {}) }, signal));
    if (watch) await this.readPid(owner, serial, app.id, watch, signal);
  }

  private async startStreams(owner: Owner, command: Command, serial: string, appPackage: string, signal: AbortSignal): Promise<AppExitWatch | undefined> {
    const logcat = this.options.logcat;
    if (!logcat || !this.options.adb) return undefined;
    const folder = await privateLogFolder(this.options.logFolder);
    if (folder === undefined) return undefined;
    await deleteOldLogs(folder);
    const helpers: AndroidHelpers = { platform: 'android', streams: [] };
    command.helpers = helpers;
    const uid = await this.appUid(owner, serial, appPackage, signal);
    const time = await this.deviceTime(owner, serial, signal);
    if (time === undefined) return undefined;
    if (uid !== undefined) {
      const file = join(folder, `${this.runId}.log`);
      if (await this.startStream(owner, logcat, helpers, 'logcat', ['-s', serial, 'logcat', '-v', 'threadtime,year,uid', `--uid=${uid}`, '-T', time.text], file, signal)) helpers.logFile = file;
    }
    const watch = this.options.createExitWatch?.({ package: appPackage, startTime: time.seconds, utcOffsetMinutes: time.utcOffsetMinutes });
    const started = await this.startStream(owner, logcat, helpers, 'exit-watch', ['-s', serial, 'logcat', '-b', 'events', '-v', 'threadtime,year', '-T', time.text, ...EVENT_FILTER],
      line => { watch?.feed(line); }, signal, () => { watch?.streamEnded(); });
    if (started && watch) helpers.watch = watch;
    return helpers.watch;
  }

  private async startStream(owner: Owner, logcat: LogcatStarter, helpers: AndroidHelpers, role: 'logcat' | 'exit-watch', args: string[], output: LogcatOutput,
    signal: AbortSignal, endedByItself?: () => void): Promise<boolean> {
    let stream: LogcatStream;
    try { stream = await logcat.start(args, output, signal); }
    catch (error) {
      if (signal.aborted) throw error;
      return false;
    }
    if (!stream.process) {
      // Unregistered, so no recovery could stop it: stop it now. One that will not stop stays for close.
      const entry: StreamEntry = { stream, stopping: true };
      await stream.stop().catch(() => { helpers.streams.push(entry); });
      throw new DeviceReasonError('DEVICE_ERROR', `The ${role} stream's process could not be identified.`, { vendorCode: 'STREAM_UNIDENTIFIED', vendorSource: 'bridge' });
    }
    const entry: StreamEntry = { stream, stopping: false };
    helpers.streams.push(entry);
    const process = hostIdentitySchema.parse({ pid: stream.process.pid, startTime: stream.process.incarnation });
    this.register(owner, appiumComponentSchema.parse({ id: randomUUID(), kind: 'appium-native-helper', role, process }));
    void stream.exited.then(() => { if (!entry.stopping) endedByItself?.(); });
    return true;
  }

  private androidShell(owner: Owner, operation: string, serial: string, words: string[], signal: AbortSignal) {
    const adb = this.adbRunner();
    return this.dispatch(owner, operation, signal, this.timeoutMs, issued => adb(shellCommand(serial, words), issued));
  }

  private adbRunner(): AdbRunner {
    const adb = this.options.adb;
    if (!adb) throw refusal('DEVICE_ERROR', 'This Android driver has no adb.', 'ADB_UNAVAILABLE');
    return adb;
  }

  // `pm list packages <filter>` matches substrings, so the full listing is matched exactly.
  private async appUid(owner: Owner, serial: string, appPackage: string, signal: AbortSignal): Promise<string | undefined> {
    const listed = await this.androidShell(owner, 'android-app-uid', serial, ['pm', 'list', 'packages', '-U'], signal);
    if (listed.exitCode !== 0) return undefined;
    for (const line of listed.stdout.split('\n')) {
      const match = /^package:(\S+) uid:(\d+)$/.exec(line.trim());
      if (match?.[1] === appPackage) return match[2];
    }
    return undefined;
  }

  // logcat's threadtime lines carry device-local time with no zone, so the UTC offset is read with the time.
  private async deviceTime(owner: Owner, serial: string, signal: AbortSignal): Promise<{ text: string; seconds: number; utcOffsetMinutes: number } | undefined> {
    const read = await this.androidShell(owner, 'android-device-time', serial, ['date', '+%s.%3N %z'], signal);
    const [text, zone, ...rest] = read.stdout.trim().split(' ');
    if (read.exitCode !== 0 || text === undefined || zone === undefined || rest.length || !/^\d+\.\d{3}$/.test(text) || !/^[+-]\d{4}$/.test(zone)) return undefined;
    const minutes = Number(zone.slice(1, 3)) * 60 + Number(zone.slice(3));
    return { text, seconds: Number(text), utcOffsetMinutes: zone.startsWith('-') ? -minutes : minutes };
  }

  private async readPid(owner: Owner, serial: string, appPackage: string, watch: AppExitWatch, signal: AbortSignal): Promise<void> {
    const found = await this.androidShell(owner, 'android-app-pid', serial, ['pidof', appPackage], signal);
    const [pid, ...others] = found.exitCode === 0 ? found.stdout.trim().split(/\s+/).filter(Boolean) : [];
    watch.launched(pid !== undefined && !others.length && /^\d+$/.test(pid) ? Number(pid) : undefined);
  }

  private async launchIos(owner: Owner, app: AppIdentity, signal: AbortSignal): Promise<IosHelpers> {
    if (owner.identity.category !== 'ios-simulator') throw new Error('Simulator identity required');
    const target = this.iosTarget(owner);
    const runner = this.nativeRunnerFor(owner);
    await deleteOldLogs(this.options.logFolder);
    const sources: NativeLogSource[] = [];
    const source = async (name: string) => {
      const created = await createNativeLogSource({ path: join(this.options.logFolder, `${this.runId}-${name}.log`), values: {} });
      sources.push(created); return created;
    };
    const console = await launchIosConsole({ ...target, bundleId: app.id, runner, source: await source('console'), signal, ...(app.launchArgs ? { args: app.launchArgs } : {}) });
    let logs: IosHelpers['logs'];
    const os = await source('os');
    try { logs = await observeIosLogs({ ...target, bundleId: app.id, runner, source: os, signal }); }
    catch { os.unavailable('SOURCE_LOST'); logs = undefined; }
    return { platform: 'ios', console, ...(logs ? { logs } : {}), sources };
  }

  private async openWindow(owner: Owner, signal: AbortSignal): Promise<void> {
    const open = this.options.deviceWindow;
    if (!open) return;
    // Only a real open failure is a warning: one cut short by cancellation or closed issuance has an unknown outcome.
    const opened = await this.dispatch(owner, 'window', signal, 10_000, issued => open(owner.identity.value, issued).then(() => true, () => {
      if (signal.aborted) throw signal.reason;
      if (this.issuanceClosed) throw new AdmissionError('DISPATCH_CLOSED', 'Device issuance is closed');
      return false;
    }));
    if (!opened) this.warnings.push('Simulator window not opened: Simulator could not be opened on the run\'s device.');
  }

  private iosTarget(owner: Owner): { udid: string; deviceSet?: string } {
    const target = this.options.target;
    return { udid: owner.identity.value, ...(target.platform === 'ios' && target.deviceSet ? { deviceSet: target.deviceSet } : {}) };
  }

  /** Long-running helpers are registered by identity as they start; one-shots settle as recorded commands. */
  private nativeRunnerFor(owner: Owner): NativeRunner {
    return async (command, output, signal) => {
      const child = await this.options.nativeRunner(command, output, signal);
      const role = helperRole(command);
      if (role) {
        const process = hostIdentitySchema.parse({ pid: child.process.pid, startTime: child.process.incarnation });
        this.register(owner, appiumComponentSchema.parse({ id: randomUUID(), kind: 'appium-native-helper', role, process }));
      }
      return child;
    };
  }

  private async observeIssued(signal: AbortSignal): Promise<Snapshot> {
    const live = this.live();
    return this.observeLive(live, signal, 'appium-observe', this.timeoutMs);
  }

  /** A paused driven session is refreshed before use; a lost one is replaced by a fresh child and session, and the
   *  screen is a fresh hand-back. The replacement opens outside any dispatch: a nested dispatch would wait on itself. */
  private async observeLive(live: Extract<Phase, { kind: 'live' }>, signal: AbortSignal, operation: string, timeoutMs: number): Promise<Snapshot> {
    const observe = () => this.dispatch(live.owner, operation, signal, timeoutMs, issued => live.command.observation.observe(issued));
    const session = live.command.session;
    let replaced = false;
    const observed = await this.guarded(signal, async () => {
      if (session.state === 'ready') return observe();
      const resumed = await session.resume(observe, live.role === 'run' && live.command.launched ? async () => {
        const replacement = await this.openSession(live.owner, live.role, signal, live.command.helpers);
        live.command = { ...replacement, launched: true };
        return replacement.session;
      } : undefined);
      if (resumed.kind === 'session-lost') throw new DeviceReasonError('STATE_UNAVAILABLE', 'The Appium session was lost.');
      replaced = resumed.kind === 'handback';
      return resumed.observation;
    });
    live.command.session.pause();
    const snapshot = await this.remember(observed.snapshot, observed.screenshot);
    this.handback = replaced ? snapshot : undefined;
    return snapshot;
  }

  private async actIssued(action: Action, snapshot: Snapshot, scenario: ActionScenarioContext, signal: AbortSignal): Promise<Snapshot | ActOutcome> {
    const live = this.live();
    const evidence = this.evidenceFor(snapshot);
    const ops = live.command.operations;
    if (live.command.session.state === 'paused' && (await live.command.session.resume(async () => undefined)).kind === 'session-lost') {
      throw new DeviceReasonError('STATE_UNAVAILABLE', 'The Appium session was lost.');
    }
    this.lastActPath = undefined;
    const performed = await this.guarded(signal, () => {
      switch (action.kind) {
        case 'tap': return ops.tap(evidence, action.targetRef, signal);
        case 'swipe': return ops.swipe(evidence, action.targetRef, action.direction, signal);
        case 'scroll': return ops.scroll(evidence, action.direction, signal);
        case 'back': return ops.back(evidence, signal);
        case 'tapAt': return ops.tapAt(evidence, action.x, action.y, signal);
        case 'type': {
          const value = Object.hasOwn(scenario.values, action.valueKey) ? scenario.values[action.valueKey] : undefined;
          if (value === undefined) throw new DeviceReasonError('MISSING_VALUE', `Scenario value ${action.valueKey} is absent`);
          return ops.replaceText(evidence, action.targetRef, value, signal);
        }
        default: { const exhaustive: never = action; throw new Error(String(exhaustive)); }
      }
    });
    this.lastActPath = performed.actPath;
    live.command.session.pause();
    return this.remember(performed.result, performed.screenshot);
  }

  private evidenceFor(snapshot: Snapshot): AppiumObservedScreen {
    if (!this.latest || this.latest.snapshot !== snapshot) throw new StaleSnapshotError('Target reference is from an older snapshot');
    // A replacement session's first screen is a fresh hand-back: no answer given for the lost session acts on it.
    if (snapshot === this.handback) throw new StaleSnapshotError('The session was replaced: observe again before acting');
    return this.latest;
  }

  /** The screenshot is written beside the run, the snapshot object is kept so its references stay current. */
  private async remember<T extends Snapshot | ActOutcome>(result: T, screenshot: AppiumObservedScreen['screenshot']): Promise<T> {
    const snapshot = screenOf(result);
    const folder = await (this.screenshots ??= this.options.screenshotFolder !== undefined ? Promise.resolve(this.options.screenshotFolder) : mkdtemp(join(tmpdir(), 'jev-appium-screens-')));
    const screenshotPath = join(folder, `screen-${String(++this.sequence)}.jpg`);
    await writeFile(screenshotPath, screenshot.jpeg, { mode: 0o600 });
    // Each source reads its own tail, so a lost console or stream reads unavailable, never empty.
    const helpers = this.helpers();
    const logTails: Record<string, string> = {};
    if (helpers?.platform === 'android') { if (helpers.logFile !== undefined) logTails.logcat = await readLogTail(helpers.logFile); }
    else {
      const [runtime, os] = helpers?.sources ?? [];
      if (runtime) logTails.runtime = await runtime.readTail();
      if (os) logTails.os = await os.readTail();
    }
    Object.assign(snapshot, { screenshotPath, ...(Object.keys(logTails).length ? { logTails } : {}) });
    this.latest = { snapshot, screenshot };
    return result;
  }

  private async discardScreenshots(): Promise<void> {
    if (this.options.screenshotFolder !== undefined || !this.screenshots) return;
    await this.screenshots.then(folder => rm(folder, { recursive: true, force: true })).catch(() => undefined);
  }

  private async guarded<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    if (this.issuanceClosed) throw new AdmissionError('DISPATCH_CLOSED', 'Device issuance is closed');
    try { return await work(); }
    catch (error) { throw appiumFailure(error, this.options.target.platform); }
  }

  /** One recorded command in the owner's ledger, bounded by its own deadline and the caller's signal. */
  /** `input`: a device input whose failure after send is never an answer, unless the extension refused it before input.
   *  `cleanup`: a read close makes after issuance has closed. */
  private async dispatch<T>(owner: Owner, operation: string, signal: AbortSignal, timeoutMs: number, effect: (signal: AbortSignal) => Promise<T>,
    options: { input?: boolean; cleanup?: boolean } = {}): Promise<T> {
    signal.throwIfAborted();
    if (this.issuanceClosed && !options.cleanup) throw new AdmissionError('DISPATCH_CLOSED', 'Device issuance is closed');
    const controller = new AbortController();
    this.aborters.add(controller);
    const cancel = () => controller.abort(signal.reason);
    signal.addEventListener('abort', cancel, { once: true });
    const deadline = setTimeout(() => controller.abort(new DeviceReasonError('TIMEOUT', `${operation} did not finish within ${String(timeoutMs)} ms`)), timeoutMs);
    try {
      const settled = await owner.dispatcher.dispatch(operation, async () => {
        try { return { kind: 'value' as const, value: await effect(controller.signal) }; }
        catch (error) {
          if (controller.signal.aborted || outcomeUnknown(error) || (options.input && !refusedBeforeInput(error))) { this.firstFailure ??= error; throw error; }
          return { kind: 'error' as const, error };
        }
      });
      if (settled.kind === 'error') throw settled.error;
      return settled.value;
    } finally { clearTimeout(deadline); this.aborters.delete(controller); signal.removeEventListener('abort', cancel); }
  }

  /** A read through the fence runner, recorded as its own fence command so cleanup can see what was read. */
  private fenceRead(owner: Owner, effect: FenceEffect, signal: AbortSignal): Promise<unknown> {
    const id = randomUUID();
    const request: CommandRequest = { requestId: id, componentId: id, operation: 'appium-fence', payload: {}, recordResult: true, components: [{ id, kind: 'appium-fence-command', effect }] };
    return owner.dispatcher.dispatch(request, () => this.options.fence(effect, signal));
  }

  private register(owner: Owner, component: AppiumComponent): void { owner.claim.registerComponent(component); }

  private hostIdentity(pid: number): HostIdentity {
    const executor = executorOf(pid, this.options.startLookup);
    return hostIdentitySchema.parse({ pid: executor.pid, startTime: executor.incarnation });
  }

  private helpers(): Helpers | undefined { return this.phase.kind === 'live' ? this.phase.command.helpers : undefined; }

  private live(): Extract<Phase, { kind: 'live' }> {
    if (this.phase.kind !== 'live') throw new AdmissionError('DISPATCH_CLOSED', 'Driver is not prepared');
    return this.phase;
  }

  private admitted(): Extract<Phase, { kind: 'admitted' }> {
    if (this.phase.kind !== 'admitted') throw new AdmissionError('DISPATCH_CLOSED', 'Driver is not attached');
    return this.phase;
  }

  private async stopCommand(command: Command, terminate: string | undefined, signal: AbortSignal): Promise<void> {
    const helpers = command.helpers;
    if (helpers?.platform === 'ios') helpers.console.expectStop();
    else helpers?.watch?.expectStop();
    let terminated: unknown;
    let streams: DeviceReasonError | undefined;
    if (terminate !== undefined && command.launched && command.session.state !== 'lost' && command.client.dispatchOpen) {
      terminated = await command.operations.terminate(terminate, signal).then(() => undefined, (error: unknown) => error ?? new Error('Terminate failed'));
    }
    try { await command.operations.close(); }
    finally {
      await command.client.close();
      if (helpers?.platform === 'ios') {
        await helpers.console.stop().catch(() => undefined);
        await helpers.logs?.stop().catch(() => undefined);
        for (const source of helpers.sources) await source.finish().catch(() => undefined);
      } else if (helpers) streams = await stopStreams(helpers);
    }
    if (terminated !== undefined) throw terminated;
    if (streams !== undefined) throw streams;
  }

  /** `settle` waits for the run's own in-flight operations; a failing `prepare` is itself one, so it passes false.
   *  A clean close fences its own components after its last effect and releases the device; only real uncertainty
   *  quarantines it for a recovery claim. An observed claim stages its fence for the runtime's terminal. */
  private async finishClose(signal: AbortSignal, settle: boolean): Promise<void> {
    try { await this.closeOwned(signal, settle); }
    finally { await this.discardScreenshots(); }
  }

  private async closeOwned(signal: AbortSignal, settle: boolean): Promise<void> {
    let failure: unknown;
    try { if (settle) await this.operations.settle(signal); }
    catch (error) { failure = error; }
    // Read after settle: a prepare that was still running may have installed a live command since close was called.
    const phase = this.phase;
    if (phase.kind !== 'admitted' && phase.kind !== 'live') { this.phase = { kind: 'closed' }; if (failure !== undefined) throw failure; return; }
    const { owner } = phase;
    try { if (failure === undefined && phase.kind === 'live') await this.stopCommand(phase.command, phase.app.id, signal); }
    catch (error) { failure = error; }
    this.issuanceClosed = true;
    this.latest = undefined;
    // Before any stop: automation the store does not own beside ours holds the device, and nothing is stopped.
    let foreign = false;
    if (failure === undefined && this.ownsAutomation(owner)) {
      try { await this.refuseForeign(owner, signal, { cleanup: true }); }
      catch (error) {
        foreign = error instanceof DeviceReasonError && error.code === 'DEVICE_BUSY';
        failure = foreign ? error : new DeviceReasonError('CLEANUP_FAILED', `Automation inventory could not be read: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    try {
      if (failure === undefined) {
        try {
          owner.claim.stageFence(await this.fenceOwn(owner, signal));
          if (!owner.owned) return;
          const closed = owner.claim.finalize({ outcome: 'completed', disposition: 'available', payload: {}, evidenceRefs: [] });
          if (closed.authority !== 'committed' && !this.released(owner)) throw new DeviceReasonError('UI_ACTION_UNCONFIRMED', 'Device closure is unconfirmed');
          await this.lease.release();
          return;
        } catch (error) {
          failure = new DeviceReasonError('CLEANUP_FAILED', `Appium components could not be fenced: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (foreign) { if (owner.owned) owner.claim.closeDispatch({ outcome: 'inconclusive', disposition: 'quarantined', payload: {}, evidenceRefs: [] }); }
      else if (owner.owned) await this.quarantineAndFence(owner, signal);
    } catch (error) {
      if (failure === undefined) throw error;
    } finally { this.phase = { kind: 'closed' }; }
    if (failure !== undefined) throw this.namingFirstFailure(failure);
  }

  private namingFirstFailure(failure: unknown): unknown {
    if (this.firstFailure === undefined) return failure;
    const first = ` First failure: ${failureCode(this.firstFailure)}.`;
    if (failure instanceof DeviceReasonError && failure.code === 'CLEANUP_FAILED') return new DeviceReasonError('CLEANUP_FAILED', `${failure.message}${first}`);
    if (failure instanceof AdmissionError && failure.code === 'DISPATCH_CLOSED') return new DeviceReasonError('CLEANUP_FAILED', `Close met a closed claim.${first}`);
    return failure;
  }

  /** A lost COMMIT reply: the store is the authority on whether the release committed. */
  private released(owner: Owner): boolean {
    try {
      const attempt = this.options.admission.readAttempt(owner.claim.identity.attempt);
      return attempt?.state === 'terminal' && attempt.terminal?.disposition === 'available' && owner.claim.markerReleased();
    } catch { return false; }
  }

  /** The live owner's own fence: every read is recorded after its last effect, so the store can bind the proofs. */
  private fenceOwn(owner: Owner, signal: AbortSignal): Promise<FenceRequest> {
    const claim: FenceClaim = { owner: owner.claim.identity, dispatch: owner.dispatcher.dispatch.bind(owner.dispatcher),
      observeComponent: owner.claim.observeComponent.bind(owner.claim) };
    return fenceAppium({ admission: this.options.admission, claim, runner: this.options.fence,
      revalidate: serial => this.revalidate(owner.identity, serial, signal), signal, ...this.fenceClock() });
  }

  private fenceClock(): Pick<FenceOptions, 'clock'> { return this.options.fenceClock ? { clock: this.options.fenceClock } : {}; }

  /** Uncertain work holds the device; a recovery claim fences it and releases it only with every receipt. */
  private async quarantineAndFence(owner: Owner, signal: AbortSignal): Promise<void> {
    const closed = owner.claim.closeDispatch({ outcome: 'inconclusive', disposition: 'quarantined', payload: {}, evidenceRefs: [] });
    if (closed.authority !== 'committed') throw new DeviceReasonError('UI_ACTION_UNCONFIRMED', 'Device closure is unconfirmed');
    const recovery = this.options.admission.claimRecovery(owner.claim.identity, randomUUID());
    if (recovery.kind === 'refused') throw new DeviceReasonError('CLEANUP_FAILED', 'The cleanup claim was refused');
    try {
      const proof = await fenceAppium({ admission: this.options.admission, claim: recovery.claim, runner: this.options.fence,
        revalidate: serial => this.revalidate(owner.identity, serial, signal), signal, ...this.fenceClock() });
      recovery.claim.submitFence(proof);
    } catch (error) {
      try { recovery.claim.close(); } catch { /* the quarantine stands */ }
      throw new DeviceReasonError('CLEANUP_FAILED', `Appium components could not be fenced: ${error instanceof Error ? error.message : String(error)}`);
    }
    await this.lease.release();
  }
}

const screenOf = (result: Snapshot | ActOutcome): Snapshot => isActOutcome(result) ? result.screen : result;

/** Mutations that reach the device as input; an unconfirmed one keeps the device quarantined, as the legacy drivers do. */
const INPUTS: ReadonlySet<OperationName> = new Set(['tap', 'swipe', 'scroll', 'back', 'tap-at', 'replace-text']);
const refusedBeforeInput = (error: unknown) => error instanceof AppiumError && REFUSED_BEFORE_INPUT.has(error.code);

/** The observed action's one tap is the store's `tap` command, the one its single-tap guard and receipt facts read. */
const commandName = (role: Role, operation: OperationName) => role === 'observed-action' && operation === 'tap' ? 'tap' : `appium-${operation}`;

/** A command whose effect may or may not have happened stays uncertain, which keeps the device quarantined.
 *  Any other failure came back with an answer, so its command settles, as on the legacy Android path. */
function outcomeUnknown(error: unknown): boolean {
  if (error instanceof UnconfirmedOperationError) return true;
  // An observation that failed with an answer settles; one whose reply was lost keeps the transport's verdict.
  if (error instanceof ObservationIncompleteError) return error.cause instanceof AppiumError && outcomeUnknown(error.cause);
  if (error instanceof AppiumError) return error.code === 'TIMEOUT' || error.code === 'ACKNOWLEDGEMENT_LOST' || error.code === 'CONNECTION_LOST';
  if (error instanceof NativeHelperError) return error.code === 'NATIVE_OUTCOME_UNKNOWN';
  return !(error instanceof DeviceReasonError || error instanceof AdmissionError || error instanceof StackError);
}

function failureCode(error: unknown): string {
  if (error instanceof ObservationIncompleteError && error.cause !== undefined) return failureCode(error.cause);
  if (error instanceof DeviceReasonError || error instanceof AppiumError || error instanceof AdmissionError || error instanceof NativeHelperError) return error.code;
  return error instanceof Error ? error.name : 'UNKNOWN';
}

async function stopStreams(helpers: AndroidHelpers): Promise<DeviceReasonError | undefined> {
  const unconfirmed: number[] = [];
  for (const entry of helpers.streams) {
    entry.stopping = true;
    await entry.stream.stop().catch(() => { unconfirmed.push(entry.stream.pid); });
  }
  return unconfirmed.length ? new DeviceReasonError('CLEANUP_FAILED', `The logcat stream${unconfirmed.length > 1 ? 's' : ''} ${unconfirmed.join(', ')} could not be confirmed stopped.`) : undefined;
}

/** A verified stack always lists the server APK; its absence is a damaged manifest. */
function uiautomator2Server(stack: VerifiedStack): { sha256: string } {
  const server = stack.manifest.androidApks.find(apk => apk.package === UIAUTOMATOR2_PACKAGES[0]);
  if (!server) throw new StackError('STACK_FILE_MISMATCH', 'The frozen stack lists no UiAutomator2 server APK.');
  return server;
}

function helperRole(command: NativeCommand): 'console' | 'log-stream' | undefined {
  return command.kind === 'ios-console' ? 'console' : command.kind === 'ios-log-stream' ? 'log-stream' : undefined;
}

