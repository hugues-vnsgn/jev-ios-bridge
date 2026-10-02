import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { isIosApp, type Action, type ActionScenarioContext, type ActPath, type AppProblem, type ElementAction, type LogSources, type DeviceDriver, type DeviceMetrics,
  type Element, type PrepareScenarioContext, type Snapshot, type TapAliasRule } from '../contracts/index.js';
import { androidAvd, androidSerial } from '../scripted/schema.js';
import { ROLES, type ReasonCode, type Role } from '../scripted/vocabulary.js';
import { DeviceLease, DeviceLeaseBusyError } from './lease.js';
import { readLogTail } from './logs.js';

type JsonObject = Record<string, unknown>;
export type CliResult = { stdout: string; stderr: string; exitCode: number };
export type CliRunner = (args: string[], signal: AbortSignal) => Promise<CliResult>;

export interface MobileBuildMcpDriverOptions {
  cwd: string;
  executable?: string;
  prefixArgs?: string[];
  defaultUdid?: string;
  capture?: 'compact' | 'full';
  screenshots?: boolean;
  stopAppOnClose?: boolean;
  runner?: CliRunner;
  lockRoot?: string;
  uiCommandTimeoutMs?: number;
  /**
   * Use the settled full capture MobileBuildMCP returns with each action (schema "3") as the next
   * observation, instead of capturing again. Off by default: MobileBuildMCP 2.7.1 can report a screen
   * as settled mid-transition, mixing the old and new screens (spikes/benchmarks/results/v1.0.0/capture-reuse).
   */
  reuseActionCapture?: boolean;
  /**
   * Measurement aid: after each screenshot, capture again and record whether the screen hash still
   * matches the capture the screenshot accompanies. Costs one extra capture per observation.
   */
  verifyScreenshotAgreement?: boolean;
  /**
   * Bring the run's simulator window to the front during `prepare`, once the simulator is confirmed booted.
   * Unset, no window is opened and the simulator's state is read only when the launch fails.
   */
  deviceWindow?: DeviceWindowOpener;
}

/** Brings a simulator's window to the front. Rejects when it couldn't; the run carries on either way. */
export type DeviceWindowOpener = (udid: string, signal: AbortSignal) => Promise<void>;

/**
 * The command that shows one simulator: Simulator.app, opened on that device. Not device automation: it only opens
 * an app window. It must run only on a booted simulator, because Simulator boots the device it opens on.
 */
export function simulatorWindowCommand(udid: string): [file: string, args: string[]] {
  return ['open', ['-a', 'Simulator', '--args', '-CurrentDeviceUDID', udid]];
}

/** Opens the window with `open`, in the device-layer environment (no Jev key), giving up after 10 seconds. */
const openSimulatorWindow: DeviceWindowOpener = (udid, signal) => new Promise((done, reject) => {
  const [file, args] = simulatorWindowCommand(udid);
  execFile(file, args, { env: deviceEnvironment(), signal, timeout: 10_000 }, error => { if (error) reject(error); else done(); });
});

/** The window opener a run uses: on by default, off with `--no-device-window` (`turnedOff`) or `JEV_DEVICE_WINDOW=off`. */
export function deviceWindowOpener(turnedOff: boolean, environment: NodeJS.ProcessEnv = process.env): DeviceWindowOpener | undefined {
  return turnedOff || environment.JEV_DEVICE_WINDOW === 'off' ? undefined : openSimulatorWindow;
}

const UI_ACTION_RESULT = 'mobilebuildmcp.output.ui-action-result';

/** Envelope versions the pinned MobileBuildMCP 2.7.1 returns: "2", or "3" for a verbose UI action. */
function supportedVersion(schema: unknown, version: unknown): boolean {
  return version === '2' || (schema === UI_ACTION_RESULT && version === '3');
}

export class DeviceCliError extends Error {
  constructor(readonly code: string, message: string, readonly terminalAcknowledged = false) {
    super(message);
    this.name = 'DeviceCliError';
  }
}

/**
 * A bridge-owned reason code raised directly by a device driver that knows the bridge's vocabulary
 * (for example the Android driver), skipping the vendor-code translation `DeviceCliError` needs.
 * `failureOf` (`src/scripted/run.ts`) passes its code through unconditionally. An Android error may name
 * the device layer that failed (`adb`, `agent`) as its `vendorCode`; an iOS error names none.
 */
export class DeviceReasonError extends Error {
  /** Set only when given, so an error built without one has no such property. */
  declare readonly vendorCode?: string;

  constructor(readonly code: ReasonCode, message: string, options: { vendorCode?: string } = {}) {
    super(message);
    this.name = 'DeviceReasonError';
    if (options.vendorCode !== undefined) this.vendorCode = options.vendorCode;
  }
}

export class StaleSnapshotError extends Error {
  constructor(message = 'The screen changed; observe and ask Jev again') {
    super(message);
    this.name = 'StaleSnapshotError';
  }
}

const roleSet: ReadonlySet<string> = new Set(ROLES);

/** Translate MobileBuildMCP's role into the bridge's vocabulary. Unknown roles become `other`. */
export function bridgeRole(vendorRole: string): Role {
  return roleSet.has(vendorRole) ? vendorRole as Role : 'other';
}

function record(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function terminalPayloadMatches(envelope: JsonObject, expectedSchema: string, success: boolean): boolean {
  if (envelope.schema !== expectedSchema || !supportedVersion(envelope.schema, envelope.schemaVersion)) return false;
  const data = record(envelope.data);
  if (Object.keys(record(data.artifacts)).length === 0) return false;
  if (expectedSchema === UI_ACTION_RESULT && Object.keys(record(data.action)).length === 0) return false;
  if (expectedSchema === 'mobilebuildmcp.output.capture-result' && success && Object.keys(record(data.capture)).length === 0) return false;
  return true;
}

function parseEnvelope(result: CliResult, expectedSchema?: string): JsonObject {
  let envelope: JsonObject;
  try {
    envelope = record(JSON.parse(result.stdout));
  } catch {
    throw new DeviceCliError('INVALID_JSON', `MobileBuildMCP returned invalid JSON (exit ${result.exitCode})`);
  }
  if (envelope.didError === true || result.exitCode !== 0) {
    const uiError = record(record(envelope.data).uiError);
    const legacyError = record(envelope.error);
    const terminalAcknowledged = expectedSchema !== undefined && terminalPayloadMatches(envelope, expectedSchema, false);
    throw new DeviceCliError(
      string(uiError.code) ?? string(legacyError.code) ?? 'DEVICE_ERROR',
      string(uiError.message) ?? string(envelope.error) ?? string(legacyError.message) ?? `MobileBuildMCP failed (exit ${result.exitCode})`,
      terminalAcknowledged,
    );
  }
  if (!supportedVersion(envelope.schema, envelope.schemaVersion) || !envelope.data || typeof envelope.data !== 'object' || Array.isArray(envelope.data)) {
    throw new DeviceCliError('INVALID_ENVELOPE', 'MobileBuildMCP returned an unsupported envelope');
  }
  if (expectedSchema && !terminalPayloadMatches(envelope, expectedSchema, true)) {
    throw new DeviceCliError('TERMINAL_ACK_MISSING', 'MobileBuildMCP did not return the expected terminal result');
  }
  return record(envelope.data);
}

function parseCompactRow(row: unknown): Element | undefined {
  if (typeof row !== 'string') return undefined;
  const [ref, action, role, label, value, identifier] = row.split('|');
  if (!ref || !role) return undefined;
  const actions = (action ?? '').split(',').flatMap((name) => {
    if (name === 'swipe') return ['swipeWithin'];
    if (name === 'type') return ['typeText'];
    if (name === 'text' || !name) return [];
    return [name];
  });
  return {
    ref,
    role: bridgeRole(role),
    ...(label ? { label } : {}),
    ...(value ? { value } : {}),
    ...(identifier ? { identifier } : {}),
    actions,
  };
}

function parseFullElement(value: unknown): Element | undefined {
  const item = record(value);
  const ref = string(item.ref);
  const role = string(item.role);
  if (!ref || !role) return undefined;
  const frame = record(item.frame);
  const state = record(item.state);
  const hasFrame = ['x', 'y', 'width', 'height'].every((key) => number(frame[key]) !== undefined);
  return {
    ref,
    role: bridgeRole(role),
    ...(string(item.label) !== undefined ? { label: string(item.label)! } : {}),
    ...(string(item.value) !== undefined ? { value: string(item.value)! } : {}),
    ...(string(item.identifier) !== undefined ? { identifier: string(item.identifier)! } : {}),
    ...(hasFrame ? { frame: { x: number(frame.x)!, y: number(frame.y)!, width: number(frame.width)!, height: number(frame.height)! } } : {}),
    ...(typeof state.enabled === 'boolean' && typeof state.visible === 'boolean'
      ? { state: { enabled: state.enabled, visible: state.visible,
          ...(typeof state.focused === 'boolean' ? { focused: state.focused } : {}),
          ...(typeof state.selected === 'boolean' ? { selected: state.selected } : {}) } }
      : {}),
    actions: Array.isArray(item.actions) ? item.actions.filter((action): action is string => typeof action === 'string') : [],
  };
}

export function parseSnapshot(data: JsonObject, deviceId: string, screenshotPath?: string): Snapshot {
  const capture = record(data.capture);
  if (capture.type !== 'runtime-snapshot' || !['rs/1', '1'].includes(string(capture.protocol) ?? string(capture.rs) ?? '')) {
    throw new DeviceCliError('INVALID_CAPTURE', 'MobileBuildMCP returned no runtime snapshot');
  }
  const full = Array.isArray(capture.elements);
  const normalized: Element[] = full
    ? (capture.elements as unknown[]).map(parseFullElement).filter((element): element is Element => element !== undefined)
    : [...(Array.isArray(capture.targets) ? capture.targets : []),
        ...(Array.isArray(capture.scroll) ? capture.scroll : []),
        ...(Array.isArray(capture.text) ? capture.text : [])]
      .map(parseCompactRow).filter((element): element is Element => element !== undefined)
      .reduce<Element[]>((items, element) => {
        const existing = items.find(item => item.ref === element.ref);
        if (!existing) items.push(element);
        else existing.actions = [...new Set([...existing.actions, ...element.actions])];
        return items;
      }, []);
  if (normalized.length === 0 && number(capture.count) !== 0) {
    throw new DeviceCliError('EMPTY_CAPTURE', 'MobileBuildMCP returned no usable elements');
  }
  const capturedAt = number(capture.capturedAtMs) ?? Date.now();
  return {
    deviceId,
    capturedAt,
    expiresAt: number(capture.expiresAtMs) ?? capturedAt + 60_000,
    sequence: number(capture.seq) ?? 0,
    elements: normalized,
    truncated: !full && [
      Array.isArray(capture.targets) && capture.targets.length >= 64,
      Array.isArray(capture.scroll) && capture.scroll.length >= 32,
      Array.isArray(capture.text) && capture.text.length >= 64,
    ].some(Boolean),
    ...(string(capture.screenHash) ? { screenHash: string(capture.screenHash)! } : {}),
    ...(screenshotPath ? { screenshotPath } : {}),
  };
}

/** The environment for device-layer processes: the bridge's own, minus the Jev key, with vendor telemetry off. */
export function deviceEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const { TYPESAFE_API_KEY: _jevKey, ...environment } = source;
  return { ...environment, MOBILEBUILDMCP_SENTRY_DISABLED: 'true' };
}

/** The pinned MobileBuildMCP CLI installed with the bridge, run directly by Node (no npx round trip). */
export function pinnedMobileBuildMcpCli(): string {
  return createRequire(import.meta.url).resolve('mobilebuildmcp');
}

function defaultRunner(options: MobileBuildMcpDriverOptions): CliRunner {
  const executable = options.executable ?? process.execPath;
  const prefix = options.prefixArgs ?? (options.executable ? [] : [pinnedMobileBuildMcpCli()]);
  return (args, signal) => new Promise((resolveResult, reject) => {
    execFile(executable, [...prefix, ...args], {
      cwd: resolve(options.cwd),
      env: deviceEnvironment(),
      signal,
      maxBuffer: 8 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error && (error as NodeJS.ErrnoException).code === 'ABORT_ERR') {
        reject(error);
        return;
      }
      resolveResult({ stdout, stderr, exitCode: error && 'code' in error && typeof error.code === 'number' ? error.code : error ? 1 : 0 });
    });
  });
}

async function configuredUdid(cwd: string): Promise<string | undefined> {
  try {
    const yaml = await readFile(join(cwd, '.mobilebuildmcp', 'config.yaml'), 'utf8');
    return yaml.match(/^\s*simulatorId:\s*([0-9a-fA-F-]{36})\s*$/m)?.[1];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

const SIMULATOR_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The dedicated simulator a run will use: the script's UDID, then the configured default
 * (JEV_DEVICE_UDID), then `.mobilebuildmcp/config.yaml`. Aliases such as `booted` are refused.
 */
export async function selectDeviceId(cwd: string, scriptUdid?: string, defaultUdid?: string): Promise<string> {
  const selected = scriptUdid ?? defaultUdid ?? await configuredUdid(cwd);
  if (!selected) throw new DeviceCliError('NO_DEVICE', 'Set a dedicated simulator UDID in the scenario or MobileBuildMCP config');
  if (!SIMULATOR_UUID.test(selected)) {
    throw new DeviceCliError('INVALID_DEVICE', 'Set a dedicated simulator UUID; device aliases are not supported');
  }
  return selected.toUpperCase();
}

/**
 * The Android device name a run will use: the script's `device.serial` or `device.avd` (already validated
 * by the script schema), then the configured default (JEV_ANDROID_DEVICE; an empty value counts as unset).
 * `noDevice` words the NO_DEVICE message for the caller's own way of naming a device (`capture`'s options).
 * There is no config file and no "any device" fallback. A value read from the environment is checked
 * against the serial and AVD name patterns; a value named by the script is trusted as already checked.
 * Whether the chosen value is a serial or an AVD name is worked out later, once adb can be asked. This is
 * a bridge-owned validation, not a MobileBuildMCP call, so a refusal raises `DeviceReasonError` directly.
 */
export function selectAndroidDeviceName(device: { serial?: string; avd?: string } | undefined, envValue: string | undefined,
  noDevice = 'Set device.serial or device.avd in the scenario, or JEV_ANDROID_DEVICE'): string {
  const fromScript = device?.serial ?? device?.avd;
  const selected = fromScript ?? (envValue ? envValue : undefined);
  if (!selected) throw new DeviceReasonError('NO_DEVICE', noDevice);
  if (!fromScript && !androidSerial.test(selected) && !androidAvd.test(selected)) {
    throw new DeviceReasonError('INVALID_DEVICE',
      `JEV_ANDROID_DEVICE must be an adb serial (matching ${androidSerial}) or an AVD name (matching ${androidAvd})`);
  }
  return selected;
}

/** A width and height: a screen's, in device points (iOS) or pixels (Android), or a screenshot image's, in its pixels. */
export interface Size { width: number; height: number }

/** The finger's direction for a scroll: to bring what is further down into view, the finger moves up. */
/**
 * The driven scroll's stroke inside a scroll view, as a fraction of its height: MobileBuildMCP centres it, so 0.4 runs
 * between 30% and 70%, Android's stroke. MobileBuildMCP's default runs from 15% to 85%, which starts a finger-down
 * stroke on a fixed header at the top of a full-screen scroll view, and the content never moves.
 */
export const SCROLL_STROKE_DISTANCE = 0.4;

export function scrollFinger(direction: 'up' | 'down'): 'up' | 'down' {
  return direction === 'down' ? 'up' : 'down';
}

/** The largest visible element, by frame area, whose actions include scrolling (`swipeWithin`); the first listed on a tie. */
export function largestScrollable(elements: Element[]): (Element & { frame: NonNullable<Element['frame']> }) | undefined {
  let largest: (Element & { frame: NonNullable<Element['frame']> }) | undefined;
  for (const element of elements) {
    const frame = element.frame;
    if (!frame || !element.actions.includes('swipeWithin') || element.state?.visible === false) continue;
    if (frame.width * frame.height <= 0) continue;
    if (!largest || frame.width * frame.height > largest.frame.width * largest.frame.height) largest = { ...element, frame };
  }
  return largest;
}

/**
 * A scroll with no scrollable element: a vertical swipe down the middle of the screen, the finger going from 70%
 * to 30% of its height to scroll down, the reverse to scroll up, in whole numbers.
 */
export function screenMiddleSwipe(screen: Size, direction: 'up' | 'down'): { x1: number; y1: number; x2: number; y2: number } {
  const x = Math.round(screen.width / 2);
  const [from, to] = direction === 'down' ? [0.7, 0.3] : [0.3, 0.7];
  return { x1: x, y1: Math.round(screen.height * from), x2: x, y2: Math.round(screen.height * to) };
}

/**
 * A point on a screenshot of `shot` size, in its pixels, as a whole-number point on a screen of `screen` size;
 * undefined when it isn't a number or lies outside the screenshot.
 */
export function screenPointOf(x: number, y: number, shot: Size, screen: Size): { x: number; y: number } | undefined {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= shot.width || y >= shot.height) return undefined;
  return {
    x: Math.min(screen.width - 1, Math.round(x * screen.width / shot.width)),
    y: Math.min(screen.height - 1, Math.round(y * screen.height / shot.height)),
  };
}

function sameScreen(before: Snapshot, after: Snapshot): boolean {
  if (before.screenHash && after.screenHash) return before.screenHash === after.screenHash;
  const identity = (snapshot: Snapshot) => snapshot.elements.map(({ ref: _ref, ...element }) => element);
  return JSON.stringify(identity(before)) === JSON.stringify(identity(after));
}

function awaitResultOrAbort<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolveResult, reject) => {
    const onAbort = () => { signal.removeEventListener('abort', onAbort); reject(signal.reason); };
    signal.addEventListener('abort', onAbort, { once: true });
    pending.then(
      result => { signal.removeEventListener('abort', onAbort); resolveResult(result); },
      error => { signal.removeEventListener('abort', onAbort); reject(error); },
    );
  });
}

function rematch(target: Element, fresh: Snapshot): Element {
  const matches = target.identifier
    ? fresh.elements.filter((element) => element.identifier === target.identifier)
    : fresh.elements.filter((element) => element.role === target.role && element.label === target.label);
  if (matches.length !== 1) throw new StaleSnapshotError(matches.length ? 'Refreshed screen has ambiguous target' : 'Target disappeared from refreshed screen');
  return matches[0]!;
}

/** The screen's size in points: the application element's frame, else the extent of every frame; undefined without frames. */
function screenSizeOf(snapshot: Snapshot): Size | undefined {
  const application = snapshot.elements.find(element => element.role === 'application' && element.frame);
  if (application?.frame && application.frame.width > 0 && application.frame.height > 0) {
    return { width: application.frame.x + application.frame.width, height: application.frame.y + application.frame.height };
  }
  let width = 0;
  let height = 0;
  for (const { frame } of snapshot.elements) {
    if (frame) { width = Math.max(width, frame.x + frame.width); height = Math.max(height, frame.y + frame.height); }
  }
  return width > 0 && height > 0 ? { width, height } : undefined;
}

/** How far down the screen the navigation bar reaches, as a share of its height: a back button's centre is above it. */
const TOP_BAR_SHARE = 0.2;
/** The identifier UIKit and SwiftUI give a navigation bar's back button. */
const BACK_BUTTON_IDENTIFIER = 'BackButton';
/** A back-like label: "Back", "Go back", "Back to …", or one starting with a back chevron. */
const BACK_LABEL = /^(?:(?:go )?back\b|[‹<←])/i;

/**
 * The navigation bar's back button: a visible, tappable button whose centre is in the top bar, identified as
 * `BackButton`, else with a back-like label; the leftmost when several match. Driven mode's policy reads the same
 * button, so a `back` it accepts is checked against the control this driver taps.
 */
export function backButtonOf(snapshot: Snapshot): Element | undefined {
  const screen = screenSizeOf(snapshot);
  if (!screen) return undefined;
  const inTopBar = snapshot.elements.filter(element => element.role === 'button' && element.actions.includes('tap') &&
    element.state?.visible !== false && element.frame !== undefined &&
    element.frame.y + element.frame.height / 2 <= screen.height * TOP_BAR_SHARE);
  const leftmost = (buttons: Element[]) => buttons.sort((a, b) => a.frame!.x - b.frame!.x)[0];
  return leftmost(inTopBar.filter(element => element.identifier === BACK_BUTTON_IDENTIFIER)) ??
    leftmost(inTopBar.filter(element => element.label !== undefined && BACK_LABEL.test(element.label.trim())));
}

/** Whether a simulator state MobileBuildMCP listed is known and not `Booted` (`Shutdown`, `Booting`, ...). */
function notBooted(state: string | undefined): state is string {
  return state !== undefined && state !== 'Booted';
}

/** A simulator that isn't booted, with how to boot it. The bridge never boots one itself. */
function notBootedError(deviceId: string, state: string): DeviceReasonError {
  return new DeviceReasonError('DEVICE_NOT_BOOTED', `Simulator ${deviceId} is not booted (state: ${state}). ` +
    `Boot it with \`xcrun simctl boot ${deviceId}\` or from Simulator, then run again.`);
}

/**
 * Start mode "attach" on iOS. MobileBuildMCP 2.7.1 can't tell which app is in front, and attach must refuse unless
 * the app under test is, so the iOS driver refuses it before any device work.
 */
const IOS_ATTACH_REFUSAL = 'Start mode "attach" is Android-only for now: on iOS the bridge can\'t tell whether the app is ' +
  'the one in front. Use "start": "restart" on iOS.';

export class MobileBuildMcpDriver implements DeviceDriver {
  /** This pinned integration's proven tap-alias collapsing. The run reads it from the driver. */
  readonly tapAliasRule: TapAliasRule = 'mobilebuildmcp-2.7.1';
  private readonly runner: CliRunner;
  private deviceId?: string;
  /** The app's identity: its bundle ID on iOS. */
  private appId?: string;
  private readonly lease: DeviceLease;
  private launched = false;
  private logPaths: Record<string, string> = {};
  private logNotes: Record<string, string> = {};
  private referenceRefreshes = 0;
  private referenceExpiries = 0;
  private nearTtlRefreshes = 0;
  private closing: Promise<void> | undefined;
  private readonly uiCommandTimeoutMs: number;
  /** How the last `act` carried out a `back` or `scroll`. */
  private lastActPath: ActPath | undefined;
  /** What the last `prepare` worked around without failing, for the run log. */
  private warnings: string[] = [];

  constructor(private readonly options: MobileBuildMcpDriverOptions) {
    this.runner = options.runner ?? defaultRunner(options);
    this.lease = new DeviceLease(options.lockRoot ? { root: options.lockRoot } : {});
    const timeout = options.uiCommandTimeoutMs ?? 35_000;
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 300_000) throw new RangeError('uiCommandTimeoutMs must be between 1 and 300000');
    this.uiCommandTimeoutMs = timeout;
  }

  /**
   * Whether the launched app is still running, from the console helper MobileBuildMCP started for it
   * (its PID is in the log file name, and it exits with the app). Undefined when that can't be told.
   */
  appRunning(): boolean | undefined {
    const pid = Number(this.logPaths.runtime?.match(/_helperpid(\d+)_/)?.[1]);
    if (!this.launched || !Number.isSafeInteger(pid) || pid <= 0) return undefined;
    try { process.kill(pid, 0); return true; }
    catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
  }

  /** APP_EXITED once the console helper has exited, with the note the log pane has always shown for it. */
  appProblem(): AppProblem | undefined {
    return this.appRunning() === false
      ? { code: 'APP_EXITED', note: 'The app stopped unexpectedly: its console output ended while the run was still going.' } : undefined;
  }

  logSources(): LogSources {
    return { ...(this.logPaths.runtime ? { runtime: this.logPaths.runtime } : {}),
      ...(this.logPaths.os ? { os: this.logPaths.os } : {}) };
  }

  prepareWarnings(): string[] {
    return [...this.warnings];
  }

  actPath(): ActPath | undefined {
    return this.lastActPath;
  }

  metrics(): DeviceMetrics {
    return {
      referenceRefreshes: this.referenceRefreshes,
      referenceExpiries: this.referenceExpiries,
      nearTtlRefreshes: this.nearTtlRefreshes,
    };
  }

  private async call(args: string[], signal: AbortSignal, expectedSchema?: string): Promise<JsonObject> {
    if (signal.aborted) throw signal.reason ?? new Error('Aborted');
    return parseEnvelope(await this.runner([...args, '--output', 'json'], signal), expectedSchema);
  }

  private async issueCommand(args: string[], runSignal: AbortSignal, expectedSchema: string): Promise<JsonObject> {
    if (runSignal.aborted) throw runSignal.reason;
    const command = new AbortController();
    const deadline = setTimeout(() => command.abort(new Error('UI command deadline reached')), this.uiCommandTimeoutMs);
    const issued = this.lease.command('mobilebuildmcp');
    try {
      const result = await awaitResultOrAbort(this.call(args, command.signal, expectedSchema), command.signal);
      issued.exited();
      return result;
    } catch (error) {
      if (error instanceof DeviceCliError && error.terminalAcknowledged) issued.exited();
      else issued.unknown();
      throw error;
    } finally {
      clearTimeout(deadline);
    }
  }

  prepare(scenario: PrepareScenarioContext, signal: AbortSignal): Promise<void> {
    return this.lease.track(() => this.prepareIssued(scenario, signal));
  }

  private async prepareIssued(scenario: PrepareScenarioContext, signal: AbortSignal): Promise<void> {
    if (this.lease.held) throw new Error('Driver is already prepared');
    this.warnings = [];
    if (signal.aborted) throw signal.reason;
    if (!isIosApp(scenario.app)) {
      throw new Error('The MobileBuildMCP driver only runs iOS scripts; this scenario has no app.bundleId');
    }
    if (scenario.start === 'attach') throw new DeviceReasonError('UNSUPPORTED_ACTION', IOS_ATTACH_REFUSAL);
    const bundleId = scenario.app.bundleId;
    const deviceId = await selectDeviceId(this.options.cwd, scenario.device?.udid, this.options.defaultUdid);
    // A crashed holder's record lists nothing to sweep on iOS: MobileBuildMCP owns its own processes.
    try { await this.lease.take(deviceId); }
    catch (error) {
      if (error instanceof DeviceLeaseBusyError) throw new DeviceCliError('DEVICE_BUSY', error.message);
      throw error;
    }
    this.referenceRefreshes = 0;
    this.referenceExpiries = 0;
    this.nearTtlRefreshes = 0;
    this.deviceId = deviceId;
    this.appId = bundleId;
    // Read before the window opens (Simulator boots the device it opens on); without a window, only once a launch fails.
    let stateRead = false;
    try {
      if (this.options.deviceWindow) {
        const state = await this.simulatorState(deviceId, signal);
        stateRead = true;
        if (notBooted(state)) throw notBootedError(deviceId, state);
        if (state === undefined) this.warnings.push('Simulator window not opened: the simulator\'s state could not be read.');
        else {
          try { await this.options.deviceWindow(deviceId, signal); }
          catch {
            if (signal.aborted) throw signal.reason;
            this.warnings.push('Simulator window not opened: Simulator could not be opened on the run\'s device.');
          }
        }
      }
      const launchArgs = scenario.app.launchArgs ?? [];
      // Array parameters go through --json, so arguments that start with "-" aren't read as CLI flags.
      const launched = await this.issueCommand(['simulator', 'launch-app', '--simulator-id', deviceId, '--bundle-id', bundleId,
        ...(launchArgs.length ? ['--json', JSON.stringify({ launchArgs })] : [])], signal,
        'mobilebuildmcp.output.launch-result');
      const artifacts = record(launched.artifacts);
      this.logPaths = {};
      this.logNotes = {};
      for (const [name, field] of [['runtime', 'runtimeLogPath'], ['os', 'osLogPath']] as const) {
        const path = string(artifacts[field]);
        if (path && isAbsolute(path)) this.logPaths[name] = path;
        else if (path) this.logNotes[name] = '[unavailable: invalid vendor log path]';
        else this.logNotes[name] = '[unavailable: vendor supplied no log path]';
      }
      this.launched = true;
    } catch (error) {
      let failure = error;
      if (!stateRead && error instanceof DeviceCliError && !signal.aborted) {
        const state = await this.simulatorState(deviceId, signal).catch(() => undefined);
        if (notBooted(state)) failure = notBootedError(deviceId, state);
      }
      if (this.lease.releasable) await this.lease.release();
      throw failure;
    }
  }

  /**
   * The simulator's state as MobileBuildMCP lists it (`Booted`, `Shutdown`, `Booting`, ...); undefined when it can't be
   * read or the device isn't listed. A read-only listing, so it isn't entered in the lease's command ledger.
   */
  private async simulatorState(deviceId: string, signal: AbortSignal): Promise<string | undefined> {
    if (signal.aborted) throw signal.reason;
    const command = new AbortController();
    const stop = () => command.abort(signal.reason);
    signal.addEventListener('abort', stop, { once: true });
    const deadline = setTimeout(() => command.abort(new Error('Simulator list deadline reached')), this.uiCommandTimeoutMs);
    try {
      const data = await awaitResultOrAbort(this.call(['simulator', 'list'], command.signal), command.signal);
      const simulators = Array.isArray(data.simulators) ? data.simulators.map(record) : [];
      return string(simulators.find(simulator => string(simulator.simulatorId)?.toUpperCase() === deviceId)?.state);
    } catch {
      if (signal.aborted) throw signal.reason;
      return undefined;
    } finally {
      clearTimeout(deadline);
      signal.removeEventListener('abort', stop);
    }
  }

  observe(signal: AbortSignal): Promise<Snapshot> {
    return this.lease.track(() => this.observeIssued(signal));
  }

  private captureArgs(deviceId: string): string[] {
    return ['ui-automation', 'snapshot-ui', '--simulator-id', deviceId, ...(this.options.capture === 'full' ? ['--verbose'] : [])];
  }

  private async screenshot(deviceId: string, signal: AbortSignal): Promise<string | undefined> {
    const shot = await this.issueCommand(['ui-automation', 'screenshot', '--simulator-id', deviceId, '--return-format', 'path'], signal,
      'mobilebuildmcp.output.capture-result');
    return string(record(shot.artifacts).screenshotPath) ?? string(record(shot.capture).path) ?? string(shot.path);
  }

  /** Complete a capture with its screenshot, app log tails, and the optional screenshot agreement check. */
  private async evidence(data: JsonObject, deviceId: string, screenshotPath: string | undefined, signal: AbortSignal,
    extra: Partial<Snapshot> = {}): Promise<Snapshot> {
    const snapshot = parseSnapshot(data, deviceId, screenshotPath);
    let verification: Partial<Snapshot> = {};
    if (this.options.verifyScreenshotAgreement && screenshotPath && extra.screenshotAgreement === undefined) {
      const began = performance.now();
      const after = parseSnapshot(await this.issueCommand(this.captureArgs(deviceId), signal, 'mobilebuildmcp.output.capture-result'), deviceId);
      verification = { screenshotAgreement: sameScreen(snapshot, after), verifyMs: performance.now() - began };
    }
    const logTails = { ...this.logNotes };
    for (const [name, path] of Object.entries(this.logPaths)) logTails[name] = await readLogTail(path);
    return { ...snapshot, ...extra, ...verification, ...(Object.keys(logTails).length ? { logTails } : {}) };
  }

  private async observeIssued(signal: AbortSignal): Promise<Snapshot> {
    const deviceId = this.deviceId;
    if (!deviceId || !this.lease.held) throw new Error('Driver is not prepared');
    // The capture and the screenshot run concurrently. Wait for both to settle, so a failure in one
    // never leaves the other in flight after this operation reports done.
    const captureWithScreenshot = async () => {
      const [capture, shot] = await Promise.allSettled([
        this.issueCommand(this.captureArgs(deviceId), signal, 'mobilebuildmcp.output.capture-result'),
        this.options.screenshots ? this.screenshot(deviceId, signal) : Promise.resolve(undefined),
      ]);
      if (capture.status === 'rejected') throw capture.reason;
      if (shot.status === 'rejected') throw shot.reason;
      return { data: capture.value, screenshotPath: shot.value };
    };
    if (!this.options.verifyScreenshotAgreement || !this.options.screenshots) {
      const { data, screenshotPath } = await captureWithScreenshot();
      return this.evidence(data, deviceId, screenshotPath, signal);
    }
    // Measurement mode. MobileBuildMCP resolves element references against its latest capture, so the
    // extra agreement capture must never leave the run holding references from an older one. When the
    // screen moved, capture again until the screenshot and capture agree (at most 3 tries). If they never
    // agree, the run gets the newest capture. All of this time counts as measurement time, not observation.
    let spentOnRetries = 0;
    for (let attempt = 1; ; attempt++) {
      const attemptBegan = performance.now();
      const { data, screenshotPath } = await captureWithScreenshot();
      const snapshot = parseSnapshot(data, deviceId, screenshotPath);
      const checkBegan = performance.now();
      const after = await this.issueCommand(this.captureArgs(deviceId), signal, 'mobilebuildmcp.output.capture-result');
      const agrees = sameScreen(snapshot, parseSnapshot(after, deviceId));
      if (agrees || attempt === 3) {
        const verifyMs = spentOnRetries + (performance.now() - checkBegan);
        return this.evidence(agrees ? data : after, deviceId, screenshotPath, signal,
          { screenshotAgreement: agrees, verifyMs, ...(attempt > 1 ? { verifyAttempts: attempt } : {}) });
      }
      spentOnRetries += performance.now() - attemptBegan;
    }
  }

  act(action: Action, snapshot: Snapshot, scenario: ActionScenarioContext, signal: AbortSignal): Promise<Snapshot | undefined> {
    return this.lease.track(() => this.actIssued(action, snapshot, scenario, signal));
  }

  private get reusesActionCapture(): boolean {
    return this.options.reuseActionCapture === true && this.options.capture === 'full';
  }

  /**
   * The settled screen MobileBuildMCP captured after the action, completed with its screenshot, or
   * undefined when it returned none (the screen didn't settle within its 2.5 s window) or it can't be parsed.
   */
  private async settledCapture(result: JsonObject, signal: AbortSignal): Promise<Snapshot | undefined> {
    if (!this.reusesActionCapture || !this.deviceId || Object.keys(record(result.capture)).length === 0) return undefined;
    try { parseSnapshot(result, this.deviceId); } catch { return undefined; }
    const screenshotPath = this.options.screenshots ? await this.screenshot(this.deviceId, signal) : undefined;
    return this.evidence(result, this.deviceId, screenshotPath, signal, { reusedFromAction: true });
  }

  private async actIssued(action: Action, snapshot: Snapshot, scenario: ActionScenarioContext, signal: AbortSignal): Promise<Snapshot | undefined> {
    if (!this.deviceId || snapshot.deviceId !== this.deviceId) throw new Error('Snapshot belongs to a different device');
    this.lastActPath = undefined;
    if (action.kind === 'back') return this.back(snapshot, scenario, signal);
    if (action.kind === 'scroll') return this.scroll(action.direction, snapshot, scenario, signal);
    // MobileBuildMCP 2.7.1 taps only element references, and the bridge runs no device automation of its own (ADR-0002).
    if (action.kind === 'tapAt') throw new DeviceCliError('UNSUPPORTED_ACTION', 'MobileBuildMCP 2.7.1 has no tap at a point');
    return this.actOnElement(action, snapshot, scenario, signal);
  }

  /**
   * Back: tap the navigation bar's back button when the screen has one, else swipe in from the left edge with
   * MobileBuildMCP's gesture preset, told the screen's size in points (its default is another iPhone's).
   */
  private async back(snapshot: Snapshot, scenario: ActionScenarioContext, signal: AbortSignal): Promise<Snapshot | undefined> {
    const button = backButtonOf(snapshot);
    if (button) {
      this.lastActPath = { path: 'back-button', targetRef: button.ref };
      return this.actOnElement({ kind: 'tap', targetRef: button.ref }, snapshot, scenario, signal);
    }
    this.lastActPath = { path: 'edge-swipe' };
    return this.gesture('swipe-from-left-edge', snapshot, signal);
  }

  /**
   * One of MobileBuildMCP's gesture presets, told the screen's size in points (the size AXe, which runs the preset,
   * takes; its default is another iPhone's), then the settled capture when reused.
   */
  private async gesture(preset: string, snapshot: Snapshot, signal: AbortSignal): Promise<Snapshot | undefined> {
    const screen = screenSizeOf(snapshot);
    const size = screen ? ['--screen-width', String(Math.round(screen.width)), '--screen-height', String(Math.round(screen.height))] : [];
    if (signal.aborted) throw signal.reason;
    return this.settledCapture(await this.issueCommand(['ui-automation', 'gesture', '--simulator-id', this.deviceId!,
      '--preset', preset, ...size, ...(this.reusesActionCapture ? ['--verbose'] : [])], signal, UI_ACTION_RESULT), signal);
  }

  /**
   * Scroll: swipe inside the largest scroll view by its reference, with MobileBuildMCP's own swipe timing and a
   * stroke of SCROLL_STROKE_DISTANCE centred in the view; else AXe's preset in the screen's centre, since MobileBuildMCP
   * swipes only within an element and the bridge runs no device automation of its own (ADR-0002). The preset's stroke
   * is AXe's, not Android's 70% to 30%, and its name gives the finger's direction: `scroll-up` reveals what is below.
   */
  private async scroll(direction: 'up' | 'down', snapshot: Snapshot, scenario: ActionScenarioContext, signal: AbortSignal): Promise<Snapshot | undefined> {
    const area = largestScrollable(snapshot.elements);
    if (area) {
      this.lastActPath = { path: 'scroll-within', targetRef: area.ref };
      return this.actOnElement({ kind: 'swipe', targetRef: area.ref, direction: scrollFinger(direction) }, snapshot, scenario, signal,
        SCROLL_STROKE_DISTANCE);
    }
    this.lastActPath = { path: 'screen-middle' };
    return this.gesture(direction === 'down' ? 'scroll-up' : 'scroll-down', snapshot, signal);
  }

  /** `swipeDistance` is MobileBuildMCP's stroke length as a fraction of the element; absent, its default stroke. */
  private async actOnElement(action: ElementAction, snapshot: Snapshot, scenario: ActionScenarioContext, signal: AbortSignal,
    swipeDistance?: number): Promise<Snapshot | undefined> {
    const old = snapshot.elements.find((element) => element.ref === action.targetRef);
    if (!old) throw new StaleSnapshotError('Target reference is absent from observation');
    const requiredAction = action.kind === 'type' ? 'typeText' : action.kind === 'swipe' ? 'swipeWithin' : 'tap';
    if (!old.actions.includes(requiredAction)) throw new DeviceCliError('UNSUPPORTED_ACTION', `Target does not support ${action.kind}`);
    if (action.kind === 'type' && !Object.hasOwn(scenario.values, action.valueKey)) throw new DeviceCliError('MISSING_VALUE', `Scenario value ${action.valueKey} is absent`);
    if (action.kind === 'type' && scenario.values[action.valueKey]!.startsWith('-')) {
      throw new DeviceCliError('UNSUPPORTED_LEADING_DASH_TEXT', 'MobileBuildMCP 2.7.1 cannot type a value beginning with a hyphen');
    }

    let selected = old;
    if (Date.now() >= snapshot.expiresAt - 5_000) {
      const fresh = await this.observe(signal);
      this.referenceRefreshes++;
      this.nearTtlRefreshes++;
      if (!sameScreen(snapshot, fresh)) throw new StaleSnapshotError();
      selected = rematch(old, fresh);
    }
    const verbose = this.reusesActionCapture ? ['--verbose'] : [];
    const perform = (ref: string) => {
      const base = ['ui-automation'];
      if (action.kind === 'tap') return [...base, 'tap', '--simulator-id', this.deviceId!, '--element-ref', ref, ...verbose];
      if (action.kind === 'type') return [...base, 'type-text', '--json', JSON.stringify({
        simulatorId: this.deviceId!, elementRef: ref, text: scenario.values[action.valueKey]!, replaceExisting: true,
      }), ...verbose];
      return [...base, 'swipe', '--simulator-id', this.deviceId!, '--within-element-ref', ref, '--direction', action.direction,
        ...(swipeDistance === undefined ? [] : ['--distance', String(swipeDistance)]), ...verbose];
    };
    if (signal.aborted) throw signal.reason;
    try {
      return await this.settledCapture(await this.issueCommand(perform(selected.ref), signal, UI_ACTION_RESULT), signal);
    } catch (error) {
      if (signal.aborted || !(error instanceof DeviceCliError) || !['SNAPSHOT_EXPIRED', 'ELEMENT_REF_NOT_FOUND'].includes(error.code)) throw error;
      if (error.code === 'SNAPSHOT_EXPIRED') this.referenceExpiries++;
      const fresh = await this.observe(signal);
      this.referenceRefreshes++;
      if (!sameScreen(snapshot, fresh)) throw new StaleSnapshotError();
      selected = rematch(old, fresh);
      if (signal.aborted) throw signal.reason;
      return this.settledCapture(await this.issueCommand(perform(selected.ref), signal, UI_ACTION_RESULT), signal);
    }
  }

  close(signal: AbortSignal): Promise<void> {
    if (this.closing) return this.closing;
    this.closing = this.finishClose(signal).catch((error: unknown) => {
      // Keep the lease; once the issued operation acknowledges, finish cleanup and release it late.
      if (error instanceof DeviceCliError && error.code === 'UI_ACTION_UNCONFIRMED') {
        this.lease.releaseLate(() => this.close(AbortSignal.timeout(this.uiCommandTimeoutMs + 5_000)));
      }
      throw error;
    }).finally(() => { this.closing = undefined; });
    return this.closing;
  }

  private async finishClose(signal: AbortSignal): Promise<void> {
    try { await this.lease.settle(signal); }
    catch { throw new DeviceCliError('UI_ACTION_UNCONFIRMED', 'Cleanup ended before the issued device operation acknowledged; device lock retained'); }
    if (!this.lease.held) return;
    // A lost CLI response has no proven acknowledgement. A new daemon snapshot
    // alone cannot establish that an earlier request will never arrive late.
    if (!this.lease.releasable) throw new DeviceCliError('UI_ACTION_UNCONFIRMED', 'Device operation outcome is unknown; device lock retained');
    if (this.launched && this.options.stopAppOnClose !== false && this.deviceId && this.appId) {
      // Stop is not in MobileBuildMCP's UI queue. Keep the lease if its CLI
      // response is lost, so another run cannot overlap uncertain cleanup.
      try {
        await this.call(['simulator', 'stop', '--simulator-id', this.deviceId, '--bundle-id', this.appId], signal,
          'mobilebuildmcp.output.stop-result');
      } catch (error) {
        // An acknowledged stop failure (typically: the app already exited) leaves no command in flight.
        if (!(error instanceof DeviceCliError && error.terminalAcknowledged)) throw error;
      }
    }
    await this.lease.release();
    this.launched = false;
    this.logPaths = {};
    this.logNotes = {};
  }
}

export function createMobileBuildMcpDriver(options: MobileBuildMcpDriverOptions): DeviceDriver {
  return new MobileBuildMcpDriver(options);
}
