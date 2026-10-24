import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isActOutcome, isIosApp, type Action, type ActionScenarioContext, type ActOutcome, type ActPath, type AppProblem, type DeviceDriver,
  type DevicePreparation, type LogSources, type PrepareScenarioContext, type Snapshot, type StackProvenance } from '../contracts/index.js';
import { Admission, AdmissionError, type AdmissionClaim, type AdmittedSession, type CommandRequest } from '../device/admission.js';
import type { AllocationCommit, ObservedClaim, PreparationClaim } from '../device/admission-allocation.js';
import type { AdbRunner } from '../device/android/adb.js';
import { androidStartTime, processGone, shellCommand } from '../device/android/recovery.js';
import { DeviceReasonError, StaleSnapshotError, type AdmittedAppContext, type IosPreparationDriver, type ObservedActionDriver,
  type PreparationInventoryStatus } from '../device/index.js';
import { executorOf, type StartLookup } from '../device/host-start.js';
import { resolveIdentity, revalidateIdentity, type IdentityProbe, type ResolvedIdentity } from '../device/identity.js';
import { CompatibilityMarker, DeviceLeaseBusyError } from '../device/lease.js';
import { createNativeLogSource, readLogTail, type NativeLogSource } from '../device/logs.js';
import { OperationTracker } from '../device/operation-tracker.js';
import type { Clock } from '../device/settle.js';
import type { ProfileBinding } from '../profiles.js';
import { PrivateAppiumClient, type AppiumComponentRecord } from './client.js';
import { fenceAppium, type FenceEffect, type FenceRunner } from './fence/index.js';
import { appiumComponentSchema, fenceEffectSchema, hostIdentitySchema, type AppiumComponent, type HostIdentity } from './fence/schema.js';
import { androidNativeHelpers } from './native/android.js';
import { launchIosConsole, observeIosLogs, observedIosPreparation } from './native/ios.js';
import { NativeHelperError, type NativeCommand, type NativeRunner } from './native/process.js';
import { AppiumObservation, type AppiumObservedScreen } from './observe/index.js';
import { ObservationIncompleteError } from './observe/normalize.js';
import { AppiumOperations, UnconfirmedOperationError, type OperationName } from './operations/index.js';
import { allocateHostPorts, portComponents, type FreePort, type HostPorts } from './ports.js';
import { AppiumCommandSession, createSessionProfile, type SessionProfile, type SessionProfileInput } from './session.js';
import { StackError, type VerifiedStack } from './stack.js';
import { AppiumError, CLIENT_SDK, EXTENSION_VERSION, type AppiumPlatform } from './wire-schemas.js';

/** The device one driver instance serves. Chosen per command by the composition, never inside the driver. */
export type AppiumTarget =
  | { platform: 'ios'; device: string; deviceSet?: string; presentation: 'visible' | 'headless' }
  | { platform: 'android'; device: string; category?: 'android-emulator' | 'android-phone'; androidSdkRoot?: string;
    serverInstallation: Extract<SessionProfileInput, { platform: 'android' }>['serverInstallation'] };

export interface AppiumDriverOptions {
  stack: VerifiedStack;
  admission: Admission;
  backend: 'real' | 'fake';
  target: AppiumTarget;
  /** The private root for each command's child HOME, mode 0700. */
  homeRoot: string;
  /** Where the iOS console and log stream files go. */
  logFolder: string;
  screenshotFolder?: string;
  identityProbe: IdentityProbe;
  fence: FenceRunner;
  nativeRunner: NativeRunner;
  /** Android: reads UiAutomator2's device processes for the fence. */
  adb?: AdbRunner;
  freePort?: FreePort;
  startLookup?: StartLookup;
  runMarker?: () => string;
  /** Test seam: the fake MCP child in place of the extension entry. */
  child?: { entrypoint: string; args?: string[]; nodeArgs?: string[] };
  runId?: string;
  profile?: ProfileBinding;
  lockRoot?: string;
  clock?: Clock;
  timeoutMs?: number;
}

type Role = 'run' | 'capture' | 'attach' | 'observed-prepare' | 'observed-action';
type Owner = { claim: AdmissionClaim; dispatcher: AdmittedSession; identity: ResolvedIdentity; owned: boolean };
type IosHelpers = { console: Awaited<ReturnType<typeof launchIosConsole>>; logs?: Awaited<ReturnType<typeof observeIosLogs>>; sources: NativeLogSource[] };
type Command = { client: PrivateAppiumClient; session: AppiumCommandSession; observation: AppiumObservation; operations: AppiumOperations;
  profile: SessionProfile; ports: HostPorts; helpers?: IosHelpers; launched: boolean };
type Phase =
  | { kind: 'idle' }
  | { kind: 'admitted'; owner: Owner; role: Role; app: AppIdentity }
  | { kind: 'live'; owner: Owner; role: Role; app: AppIdentity; command: Command }
  | { kind: 'closing'; closing: Promise<void> }
  | { kind: 'closed' };
type AppIdentity = { id: string; launchArgs?: string[]; activity?: string; intentExtras?: Record<string, string> };

const DEFAULT_TIMEOUT_MS = 120_000;
const UIAUTOMATOR2_PACKAGES = ['io.appium.uiautomator2.server', 'io.appium.uiautomator2.server.test'];
const refusal = (code: DeviceReasonError['code'], message: string, vendorCode?: string) =>
  new DeviceReasonError(code, message, vendorCode === undefined ? {} : { vendorCode, vendorSource: 'bridge' });

/** Maps an operation's failure to the bridge's vocabulary with its source, so `error.vendorSource` is truthful. */
export function appiumFailure(error: unknown): unknown {
  if (error instanceof AppiumError) return new DeviceReasonError('DEVICE_ERROR', 'The Appium layer refused the command.', { vendorCode: error.code, vendorSource: 'appium' });
  if (error instanceof NativeHelperError) return new DeviceReasonError('DEVICE_ERROR', error.message, { vendorCode: error.code, vendorSource: 'bridge' });
  if (error instanceof ObservationIncompleteError) return new DeviceReasonError('DEVICE_ERROR', 'The screen could not be observed.', { vendorCode: `OBSERVATION_${error.reason.toUpperCase().replace(/-/g, '_')}`, vendorSource: 'appium' });
  return error;
}

export class AppiumDriver implements DeviceDriver, IosPreparationDriver, ObservedActionDriver {
  private phase: Phase = { kind: 'idle' };
  private readonly operations = new OperationTracker();
  private readonly lease: CompatibilityMarker;
  private latest: AppiumObservedScreen | undefined;
  private lastActPath: ActPath | undefined;
  private sequence = 0;
  private tapOnceIssued = false;
  private issuanceClosed = false;
  private screenshots: Promise<string> | undefined;
  private readonly runId: string;
  private readonly timeoutMs: number;
  private readonly aborters = new Set<AbortController>();

  constructor(private readonly options: AppiumDriverOptions) {
    if (options.admission.mode === 'test' && options.backend !== 'fake') throw new AdmissionError('STATE_UNAVAILABLE', 'Test admission requires the fake backend');
    options.admission.assertBackend(options.backend);
    this.lease = new CompatibilityMarker(options.lockRoot ? { root: options.lockRoot } : {});
    this.runId = options.runId ?? randomUUID();
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  readonly tapAliasRule = 'same-frame-buttons-v1' as const;

  // ---------- DeviceDriver ----------

  prepare(scenario: PrepareScenarioContext, signal: AbortSignal): Promise<void> {
    return this.operations.track(() => this.prepareIssued(scenario, signal));
  }

  observe(signal: AbortSignal): Promise<Snapshot> {
    return this.operations.track(() => this.observeIssued(signal));
  }

  act(action: Action, snapshot: Snapshot, scenario: ActionScenarioContext, signal: AbortSignal): Promise<Snapshot | ActOutcome> {
    return this.operations.track(() => this.actIssued(action, snapshot, scenario, signal));
  }

  close(signal: AbortSignal): Promise<void> {
    if (this.phase.kind === 'closing') return this.phase.closing;
    if (this.phase.kind === 'closed' || this.phase.kind === 'idle') { this.phase = { kind: 'closed' }; return Promise.resolve(); }
    const closing = this.finishClose(this.phase, signal, true);
    this.phase = { kind: 'closing', closing };
    return closing;
  }

  actPath(): ActPath | undefined { return this.lastActPath; }

  appRunning(): boolean | undefined { return this.helpers()?.console.running(); }

  appProblem(): AppProblem | undefined { return this.helpers()?.console.problem(); }

  logSources(): LogSources {
    const helpers = this.helpers();
    if (!helpers) return {};
    const [runtime, os] = helpers.sources;
    return { ...(runtime ? { runtime: runtime.path } : {}), ...(os ? { os: os.path } : {}) };
  }

  /** Android only, as today: the device `prepare` set up, with the UiAutomator2 server APK as its agent. */
  preparation(): DevicePreparation | undefined {
    const { owner } = this.live();
    if (owner.identity.category === 'ios-simulator') return undefined;
    return { deviceIdentity: owner.identity.value, serial: owner.identity.transport.serial, agentSha256: uiautomator2Server(this.options.stack).sha256 };
  }

  provenance(): StackProvenance {
    const { manifest } = this.options.stack;
    const common = { backend: 'appium', lockSha256: manifest.lockSha256, extensionVersion: EXTENSION_VERSION, clientVersion: CLIENT_SDK.version } as const;
    return this.options.target.platform === 'ios' ? { ...common, wdaTreeSha256: manifest.wda.treeSha256 }
      : { ...common, uiautomator2ServerSha256: uiautomator2Server(this.options.stack).sha256 };
  }

  // ---------- IosPreparationDriver ----------

  async attachPreparation(claim: PreparationClaim, context: AdmittedAppContext, signal: AbortSignal): Promise<void> {
    if (claim.identity.attempt.kind !== 'preparation') throw new AdmissionError('INVALID_REQUEST', 'Expected preparation ownership');
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
    const helpers = await this.dispatch(admitted.owner, 'launch', signal, timeoutMs, issued => this.launchIos(admitted.owner, admitted.app, issued));
    const command = await this.openSession(admitted.owner, admitted.role, signal, helpers);
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
    await this.operations.settle(signal);
    await this.stopCommand(live.command, undefined, signal);
    if (!('park' in live.owner.claim) || typeof live.owner.claim.park !== 'function') throw new AdmissionError('DISPATCH_CLOSED', 'Preparation claim cannot park');
    const result = (live.owner.claim as PreparationClaim).park(readinessEvidence, evidenceRefs);
    this.issuanceClosed = true;
    this.phase = { kind: 'closed' };
    return result;
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
    } else {
      if (identity.transport.state === 'unauthorized') throw new DeviceReasonError('DEVICE_UNAUTHORIZED', `Device ${identity.transport.serial} has not accepted this Mac's USB-debugging key`);
      if (identity.transport.state !== 'device') throw new DeviceReasonError('DEVICE_NOT_CONNECTED', `Device ${identity.transport.serial} is ${identity.transport.state}`);
    }
    const owner = await this.admit(identity, { app, start: scenario.start ?? 'restart' }, signal);
    this.phase = { kind: 'admitted', owner, role, app };
    try {
      let helpers: IosHelpers | undefined;
      if (identity.category !== 'ios-simulator') await this.prepareAndroidDevice(owner, signal);
      else if (role === 'run') helpers = await this.dispatch(owner, 'launch', signal, this.timeoutMs, issued => this.launchIos(owner, app, issued));
      const command = await this.openSession(owner, role, signal, helpers);
      this.phase = { kind: 'live', owner, role, app, command: { ...command, launched: role === 'run' } };
      if (identity.category !== 'ios-simulator') await this.startAndroidApp(owner, this.live(), app, role, signal);
    } catch (error) {
      const phase = this.phase;
      if (phase.kind === 'admitted' || phase.kind === 'live') {
        const closing = this.finishClose(phase, AbortSignal.timeout(this.timeoutMs), false).catch(() => undefined);
        this.phase = { kind: 'closing', closing }; await closing;
      }
      throw appiumFailure(error);
    }
  }

  private async resolve(signal: AbortSignal): Promise<ResolvedIdentity> {
    const target = this.options.target;
    const request = target.platform === 'ios'
      ? { category: 'ios-simulator' as const, name: target.device, ...(target.deviceSet ? { deviceSet: target.deviceSet } : {}) }
      : { category: target.category ?? 'android' as const, name: target.device };
    return resolveIdentity({ request, probe: this.options.identityProbe, signal });
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
      ...(identity.category !== 'ios-simulator' ? { transport: identity.transport } : {}),
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

  private async openSession(owner: Owner, role: Role, signal: AbortSignal, helpers?: IosHelpers): Promise<Omit<Command, 'launched'>> {
    const target = this.options.target;
    const ports = await allocateHostPorts(target.platform, this.options.freePort);
    const device = owner.identity.category === 'ios-simulator' ? owner.identity.value : owner.identity.transport.serial;
    const path = role;
    const input: SessionProfileInput = target.platform === 'ios'
      ? { platform: 'ios', device, path, presentation: target.presentation, ...(target.deviceSet ? { simulatorSet: target.deviceSet } : {}),
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
        this.register(owner, appiumComponentSchema.parse({ id: randomUUID(), kind: 'appium-process-group', leader, runMarker, pgid: record.pid, members: [] }));
      } });
    try {
      const session = await this.dispatch(owner, 'appium-session-create', signal, this.timeoutMs, () => AppiumCommandSession.start({ client, profile, timeoutMs: this.timeoutMs }));
      await this.recordAutomation(owner, device, signal);
      const observation = new AppiumObservation(session, this.options.stack, { ...(this.options.clock ? { clock: this.options.clock } : {}) });
      const operations = new AppiumOperations(session, observation, { timeoutMs: this.timeoutMs,
        dispatch: (operation: OperationName, send: () => Promise<void>) => this.dispatch(owner, `appium-${operation}`, signal, this.timeoutMs, send) });
      return { client, session, observation, operations, profile, ports, ...(helpers ? { helpers } : {}) };
    } catch (error) { await client.close(); throw error; }
  }

  /** The automation the session started on the device, recorded by identity before any further effect. */
  private async recordAutomation(owner: Owner, device: string, signal: AbortSignal): Promise<void> {
    if (owner.identity.category === 'ios-simulator') {
      const rows = await this.fenceRead(owner, fenceEffectSchema.parse({ kind: 'wda-inventory', udid: owner.identity.value }), signal);
      for (const row of Array.isArray(rows) ? rows : []) {
        const parsed = appiumComponentSchema.safeParse({ id: randomUUID(), kind: 'appium-wda', ...(row as object) });
        if (parsed.success) this.register(owner, parsed.data);
      }
      return;
    }
    const adb = this.options.adb;
    if (!adb) { owner.claim.markInventoryUnknown('UIAUTOMATOR2_IDENTITY_UNAVAILABLE'); return; }
    const processes = await this.dispatch(owner, 'uiautomator2-identity', signal, this.timeoutMs, async issued => {
      const listed = await adb(shellCommand(device, ['pidof', ...UIAUTOMATOR2_PACKAGES]), issued);
      const pids = listed.exitCode === 0 ? listed.stdout.trim().split(/\s+/).filter(Boolean).map(Number).filter(pid => Number.isSafeInteger(pid) && pid > 0) : [];
      const found: { pid: number; startTime: string }[] = [];
      for (const pid of pids) {
        const stat = await adb(shellCommand(device, ['cat', `/proc/${String(pid)}/stat`]), issued);
        if (processGone(stat)) continue;
        const startTime = androidStartTime(stat.stdout);
        if (startTime) found.push({ pid, startTime });
      }
      return found;
    });
    if (processes.length) this.register(owner, appiumComponentSchema.parse({ id: randomUUID(), kind: 'appium-uiautomator2', serial: device, processes }));
  }

  private async prepareAndroidDevice(owner: Owner, signal: AbortSignal): Promise<void> {
    if (owner.identity.category === 'ios-simulator') return;
    const serial = owner.identity.transport.serial;
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
      return;
    }
    if (role !== 'run') return;
    const activity = app.activity ?? await this.dispatch(owner, 'android-launcher', signal, this.timeoutMs, async issued => (await helpers.launcher(app.id, issued)).slice(app.id.length + 1));
    await this.guarded(signal, () => live.command.operations.restart({ package: app.id, activity, ...(app.intentExtras ? { intentExtras: app.intentExtras } : {}) }, signal));
  }

  private async launchIos(owner: Owner, app: AppIdentity, signal: AbortSignal): Promise<IosHelpers> {
    if (owner.identity.category !== 'ios-simulator') throw new Error('Simulator identity required');
    const target = this.iosTarget(owner);
    const runner = this.nativeRunnerFor(owner);
    const sources: NativeLogSource[] = [];
    const source = async (name: string) => {
      const created = await createNativeLogSource({ path: join(this.options.logFolder, `${this.runId}-${name}.log`), values: {} });
      sources.push(created); return created;
    };
    const console = await launchIosConsole({ ...target, bundleId: app.id, runner, source: await source('console'), signal, ...(app.launchArgs ? { args: app.launchArgs } : {}) });
    let logs: IosHelpers['logs'];
    try { logs = await observeIosLogs({ ...target, bundleId: app.id, runner, source: await source('os'), signal }); }
    catch { logs = undefined; }
    return { console, ...(logs ? { logs } : {}), sources };
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
    const observed = await this.guarded(signal, async () => {
      if (session.state === 'ready') return observe();
      const resumed = await session.resume(observe, live.role === 'run' && live.command.launched ? async () => {
        const replacement = await this.openSession(live.owner, live.role, signal, live.command.helpers);
        live.command = { ...replacement, launched: true };
        return replacement.session;
      } : undefined);
      if (resumed.kind === 'session-lost') throw new DeviceReasonError('STATE_UNAVAILABLE', 'The Appium session was lost.');
      return resumed.observation;
    });
    live.command.session.pause();
    return this.remember(observed.snapshot, observed.screenshot);
  }

  private async actIssued(action: Action, snapshot: Snapshot, scenario: ActionScenarioContext, signal: AbortSignal): Promise<Snapshot | ActOutcome> {
    const live = this.live();
    const evidence = this.evidenceFor(snapshot);
    const ops = live.command.operations;
    if (live.command.session.state === 'paused') await live.command.session.resume(async () => undefined);
    this.lastActPath = undefined;
    const performed = await this.guarded(signal, () => {
      switch (action.kind) {
        case 'tap': return ops.tap(evidence, action.targetRef, signal);
        case 'swipe': return ops.swipe(evidence, action.targetRef, action.direction, signal);
        case 'scroll': return ops.scroll(evidence, action.direction, signal);
        case 'back': return ops.back(evidence, signal);
        case 'tapAt': return ops.tapAt(evidence, action.x, action.y, signal);
        case 'type': {
          if (!Object.hasOwn(scenario.values, action.valueKey)) throw new DeviceReasonError('MISSING_VALUE', `Scenario value ${action.valueKey} is absent`);
          return ops.replaceText(evidence, action.targetRef, scenario.values[action.valueKey]!, signal);
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
    return this.latest;
  }

  /** The screenshot is written beside the run, the snapshot object is kept so its references stay current. */
  private async remember<T extends Snapshot | ActOutcome>(result: T, screenshot: AppiumObservedScreen['screenshot']): Promise<T> {
    const snapshot = screenOf(result);
    const folder = await (this.screenshots ??= this.options.screenshotFolder !== undefined ? Promise.resolve(this.options.screenshotFolder) : mkdtemp(join(tmpdir(), 'jev-appium-screens-')));
    const screenshotPath = join(folder, `screen-${String(++this.sequence)}.jpg`);
    await writeFile(screenshotPath, screenshot.jpeg, { mode: 0o600 });
    const sources = this.logSources();
    const logTails: Record<string, string> = {};
    for (const [name, path] of Object.entries(sources)) logTails[name] = await readLogTail(path);
    Object.assign(snapshot, { screenshotPath, ...(Object.keys(logTails).length ? { logTails } : {}) });
    this.latest = { snapshot, screenshot };
    return result;
  }

  private async guarded<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    if (this.issuanceClosed) throw new AdmissionError('DISPATCH_CLOSED', 'Device issuance is closed');
    try { return await work(); }
    catch (error) { throw appiumFailure(error); }
  }

  /** One recorded command in the owner's ledger, bounded by its own deadline and the caller's signal. */
  private async dispatch<T>(owner: Owner, operation: string, signal: AbortSignal, timeoutMs: number, effect: (signal: AbortSignal) => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    if (this.issuanceClosed) throw new AdmissionError('DISPATCH_CLOSED', 'Device issuance is closed');
    const controller = new AbortController();
    this.aborters.add(controller);
    const cancel = () => controller.abort(signal.reason);
    signal.addEventListener('abort', cancel, { once: true });
    const deadline = setTimeout(() => controller.abort(new DeviceReasonError('TIMEOUT', `${operation} did not finish within ${String(timeoutMs)} ms`)), timeoutMs);
    try {
      const settled = await owner.dispatcher.dispatch(operation, async () => {
        try { return { kind: 'value' as const, value: await effect(controller.signal) }; }
        catch (error) {
          if (controller.signal.aborted || outcomeUnknown(error)) throw error;
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

  private helpers(): IosHelpers | undefined { return this.phase.kind === 'live' ? this.phase.command.helpers : undefined; }

  private live(): Extract<Phase, { kind: 'live' }> {
    if (this.phase.kind !== 'live') throw new AdmissionError('DISPATCH_CLOSED', 'Driver is not prepared');
    return this.phase;
  }

  private admitted(): Extract<Phase, { kind: 'admitted' }> {
    if (this.phase.kind !== 'admitted') throw new AdmissionError('DISPATCH_CLOSED', 'Driver is not attached');
    return this.phase;
  }

  /** The launched app is terminated unless `terminate` is undefined (park keeps it running for the action), then the
   *  session is deleted and the helpers stopped. A failed terminate still runs the cleanup, then fails the close, so an
   *  uncertain terminate is never closed as completed. */
  private async stopCommand(command: Command, terminate: string | undefined, signal: AbortSignal): Promise<void> {
    command.helpers?.console.expectStop();
    let terminated: unknown;
    if (terminate !== undefined && command.launched && command.session.state !== 'lost' && command.client.dispatchOpen) {
      terminated = await command.operations.terminate(terminate, signal).then(() => undefined, (error: unknown) => error ?? new Error('Terminate failed'));
    }
    try { await command.operations.close(); }
    finally {
      await command.client.close();
      if (command.helpers) {
        await command.helpers.console.stop().catch(() => undefined);
        await command.helpers.logs?.stop().catch(() => undefined);
        for (const source of command.helpers.sources) await source.finish().catch(() => undefined);
      }
    }
    if (terminated !== undefined) throw terminated;
  }

  /** `settle` waits for the run's own in-flight operations; a failing `prepare` is itself one, so it passes false. */
  private async finishClose(phase: Extract<Phase, { kind: 'admitted' | 'live' }>, signal: AbortSignal, settle: boolean): Promise<void> {
    const { owner } = phase;
    let failure: unknown;
    try {
      if (settle) await this.operations.settle(signal);
      if (phase.kind === 'live') await this.stopCommand(phase.command, phase.app.id, signal);
    } catch (error) { failure = error; }
    this.issuanceClosed = true;
    this.latest = undefined;
    if (!owner.owned) { this.phase = { kind: 'closed' }; if (failure) throw failure; return; }
    try {
      // A session delete is a hint, never a receipt (ADR-0011): the device is held until the fence proves every component.
      const closed = owner.claim.closeDispatch({ outcome: 'inconclusive', disposition: 'quarantined', payload: {}, evidenceRefs: [] });
      if (closed.authority !== 'committed') throw new DeviceReasonError('UI_ACTION_UNCONFIRMED', 'Device closure is unconfirmed');
      const recovery = this.options.admission.claimRecovery(owner.claim.identity, randomUUID());
      if (recovery.kind === 'refused') throw new DeviceReasonError('CLEANUP_FAILED', 'The cleanup claim was refused');
      try {
        const proof = await fenceAppium({ admission: this.options.admission, claim: recovery.claim, runner: this.options.fence,
          revalidate: serial => this.revalidate(owner.identity, serial, signal), signal });
        recovery.claim.submitFence(proof);
      } catch (error) {
        try { recovery.claim.close(); } catch { /* the quarantine stands */ }
        throw new DeviceReasonError('CLEANUP_FAILED', `Appium components could not be fenced: ${error instanceof Error ? error.message : String(error)}`);
      }
      await this.lease.release();
    } catch (error) {
      if (failure === undefined) throw error;
    } finally { this.phase = { kind: 'closed' }; }
    if (failure !== undefined) throw failure;
  }
}

const screenOf = (result: Snapshot | ActOutcome): Snapshot => isActOutcome(result) ? result.screen : result;

/** A command whose effect may or may not have happened stays uncertain, which keeps the device quarantined.
 *  Any other failure came back with an answer, so its command settles, as on the legacy Android path. */
function outcomeUnknown(error: unknown): boolean {
  if (error instanceof UnconfirmedOperationError) return true;
  if (error instanceof AppiumError) return error.code === 'TIMEOUT' || error.code === 'ACKNOWLEDGEMENT_LOST' || error.code === 'CONNECTION_LOST';
  if (error instanceof NativeHelperError) return error.code === 'NATIVE_OUTCOME_UNKNOWN';
  return !(error instanceof DeviceReasonError || error instanceof AdmissionError || error instanceof StackError);
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

