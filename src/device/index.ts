import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ActionScenarioContext, Element, Snapshot, VendorSource } from '../contracts/index.js';
import { androidAvd, androidSerial } from '../scripted/schema.js';
import type { ReasonCode } from '../scripted/vocabulary.js';
import type { PreparationClaim, ObservedClaim, AllocationCommit } from './admission-allocation.js';

export type CliResult = { stdout: string; stderr: string; exitCode: number };
export type CliRunner = (args: string[], signal: AbortSignal) => Promise<CliResult>;

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
  execFile(file, args, { env: deviceEnvironment(), signal, timeout: 10_000 }, error => {
    if (error) reject(new DeviceCliError('WINDOW_FAILED', 'Simulator window could not be opened',
      !signal.aborted && typeof error.code === 'number'));
    else done();
  });
});

/** The window opener a run uses: on by default, off with `--no-device-window` (`turnedOff`) or `JEV_DEVICE_WINDOW=off`. */
export function deviceWindowOpener(turnedOff: boolean, environment: NodeJS.ProcessEnv = process.env): DeviceWindowOpener | undefined {
  return turnedOff || environment.JEV_DEVICE_WINDOW === 'off' ? undefined : openSimulatorWindow;
}

export class DeviceCliError extends Error {
  constructor(readonly code: string, message: string, readonly terminalAcknowledged = false) {
    super(message);
    this.name = 'DeviceCliError';
  }
}

/**
 * A bridge-owned reason code raised directly by a device driver that knows the bridge's vocabulary,
 * skipping the vendor-code translation `DeviceCliError` needs.
 * `failureOf` (`src/scripted/run.ts`) passes its code through unconditionally. An error may name
 * the device layer that failed as its `vendorCode`.
 */
export class DeviceReasonError extends Error {
  /** Set only when given, so an error built without one has no such property. */
  declare readonly vendorCode?: string;
  /** Which layer `vendorCode` came from; set only with a vendor code. */
  declare readonly vendorSource?: VendorSource;

  constructor(readonly code: ReasonCode, message: string, options: { vendorCode?: string; vendorSource?: VendorSource } = {}) {
    super(message);
    this.name = 'DeviceReasonError';
    if (options.vendorCode !== undefined) this.vendorCode = options.vendorCode;
    if (options.vendorCode !== undefined && options.vendorSource !== undefined) this.vendorSource = options.vendorSource;
  }
}

export class StaleSnapshotError extends Error {
  constructor(message = 'The screen changed; observe and ask Jev again') {
    super(message);
    this.name = 'StaleSnapshotError';
  }
}

/** The environment for device-layer processes: the bridge's own, minus the Jev key. */
export function deviceEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const { TYPESAFE_API_KEY: _jevKey, ...environment } = source;
  return environment;
}

async function configuredUdid(cwd: string): Promise<string | undefined> {
  try {
    const yaml = await readFile(join(cwd, '.mobilebuildmcp', 'config.yaml'), 'utf8');
    // Physical iPhone shapes too, so selectDeviceId refuses them by name instead of finding no device.
    return yaml.match(/^\s*simulatorId:\s*([0-9a-fA-F-]{36}|[0-9a-fA-F]{40}|[0-9a-fA-F]{8}-[0-9a-fA-F]{16})\s*$/m)?.[1];
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
  if (!selected) throw new DeviceCliError('NO_DEVICE', 'Set a dedicated simulator UDID in a profile, the scenario or JEV_DEVICE_UDID');
  if (/^(?:[a-f0-9]{40}|[a-f0-9]{8}-[a-f0-9]{16})$/i.test(selected)) throw new DeviceReasonError('CATEGORY_NOT_ENABLED', 'Physical iPhone identity is not enabled');
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
 * a bridge-owned validation, so a refusal raises `DeviceReasonError` directly.
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

export type AdmittedAppContext = { app: { bundleId: string; launchArgs?: string[] } };
export type PreparationInventoryStatus = { state: string; isAvailable: boolean };
export interface IosPreparationDriver {
  attachPreparation(claim: PreparationClaim, context: AdmittedAppContext, signal: AbortSignal): Promise<void>;
  inventoryStatus(signal: AbortSignal, timeoutMs?: number): Promise<PreparationInventoryStatus | undefined>;
  boot(signal: AbortSignal, timeoutMs?: number): Promise<void>;
  bootState(signal: AbortSignal, timeoutMs?: number): Promise<string | undefined>;
  install(artifactPath: string, signal: AbortSignal, timeoutMs?: number): Promise<void>;
  launch(signal: AbortSignal, timeoutMs?: number): Promise<void>;
  readiness(signal: AbortSignal, timeoutMs?: number): Promise<Snapshot>;
  park(readinessEvidence: string[], evidenceRefs: string[], signal: AbortSignal): Promise<AllocationCommit>;
  revokeIssuance(): void;
  close(signal: AbortSignal): Promise<void>;
  readonly cleanupBudgetMs?: number;
}
export interface ObservedActionDriver {
  attachObserved(claim: ObservedClaim, context: AdmittedAppContext, signal: AbortSignal): Promise<void>;
  observe(signal: AbortSignal): Promise<Snapshot>;
  tapOnce(ref: string, snapshot: Snapshot, context: ActionScenarioContext, signal: AbortSignal): Promise<Snapshot | undefined>;
  revokeIssuance(): void;
  close(signal: AbortSignal): Promise<void>;
  /** A driver whose close fences device components bounds it by this budget, before the finish budget starts.
   *  Without one, close shares the finish budget. */
  readonly cleanupBudgetMs?: number;
}
