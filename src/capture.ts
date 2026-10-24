import type { Element, Snapshot } from './contracts/index.js';
import { DeviceReasonError, selectAndroidDeviceName } from './device/index.js';
import { ComposedAppiumDriver, type AppiumHost } from './appium/composition.js';
import { ScriptedObservationError, renderAssertionState } from './scripted/observe.js';
import { androidAvd, androidSerial } from './scripted/schema.js';
import { REASON_CODES } from './scripted/vocabulary.js';
import { DEFAULT_CLEANUP_MS } from './scripted/run.js';
// capture exits with the CLI's own codes (release spec open point 12): "passed" when it printed, "could not start" when not.
import { EXIT } from './exit-codes.js';
import { agreeProfileDevice, ProfileError, readProfile, profileDevice, type AndroidDeviceName, type DeviceAgreement, type ProfileBinding } from './profiles.js';
import { resolve } from 'node:path';

export interface CaptureRequest {
  profile?: string | undefined;
  /** `--serial`. Wins over `--avd`. */
  serial?: string | undefined;
  /** `--avd`. */
  avd?: string | undefined;
  /** `--jev`: Jev's text for the screen instead of one JSON line per element. */
  jev?: boolean | undefined;
}

export interface CaptureContext {
  projectDir?: string;
  /** JEV_ANDROID_DEVICE. Empty counts as unset. */
  defaultDevice?: string | undefined;
  /** Builds the capture's driver for the device the request selected: the CLI passes `appiumCaptureDriver`. */
  driver: (selection: CaptureSelection) => CaptureDriver;
  write: { stdout(text: string): void; stderr(text: string): void };
  /** Aborted by SIGINT or SIGTERM: the capture stops, and the driver is still closed. */
  signal: AbortSignal;
  /** Resolves a flag's name against the profile's other-kind name. Without it such a pair refuses. */
  agreeDevices?: DeviceAgreement;
}

/** The device a capture names, after the flag, profile and environment precedence. */
export type CaptureSelection = { device: AndroidDeviceName | undefined; name: string; defaultDevice: string | undefined; profile: ProfileBinding | undefined;
  category: 'android-emulator' | 'android-phone' | undefined };
export interface CaptureDriver { capture(signal: AbortSignal): Promise<Snapshot>; close(signal: AbortSignal): Promise<void> }

/** The Appium driver for a capture: the selected device, its profile category, and the packaged UiAutomator2 server. */
export function appiumCaptureDriver(host: AppiumHost): (selection: CaptureSelection) => CaptureDriver {
  return selection => new ComposedAppiumDriver({ host, ...(selection.profile ? { profile: selection.profile } : {}),
    target: async () => ({ platform: 'android', device: selection.name, serverInstallation: { kind: 'install' }, ...(selection.category ? { category: selection.category } : {}) }) });
}

/** Thrown on once the capture's own failure was printed, so it isn't printed twice. */
const REPORTED = Symbol('reported');

/** A refusal whose code and message the bridge wrote, so both are safe to print. */
class CaptureRefusal extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

/**
 * The device the options name, `--serial` first, each checked against the script's own device patterns
 * (open point 20). Undefined when neither is given, so JEV_ANDROID_DEVICE is used.
 */
function namedDevice(request: CaptureRequest): { serial: string } | { avd: string } | undefined {
  if (request.serial !== undefined && !androidSerial.test(request.serial)) {
    throw new DeviceReasonError('INVALID_DEVICE', `--serial must be an adb serial (matching ${androidSerial})`);
  }
  if (request.avd !== undefined && !androidAvd.test(request.avd)) {
    throw new DeviceReasonError('INVALID_DEVICE', `--avd must be an AVD name (matching ${androidAvd})`);
  }
  return request.serial !== undefined ? { serial: request.serial } : request.avd !== undefined ? { avd: request.avd } : undefined;
}

/** One element as `capture` prints it: what a script's selectors and claims read, with absent fields left out. */
function elementLine(element: Element): string {
  return JSON.stringify({
    role: element.role,
    ...(element.label !== undefined ? { label: element.label } : {}),
    ...(element.value !== undefined ? { value: element.value } : {}),
    ...(element.identifier !== undefined ? { identifier: element.identifier } : {}),
    ...(element.placeholder !== undefined ? { placeholder: element.placeholder } : {}),
    ...(element.state ? { state: element.state } : {}),
    ...(element.selectable === false ? { selectable: false } : {}),
  });
}

function printable(snapshot: Snapshot, jev: boolean): string {
  if (!jev) return snapshot.elements.map(element => `${elementLine(element)}\n`).join('');
  // Byte for byte as a run sends it, with no newline added.
  try { return renderAssertionState(snapshot, 'android'); }
  catch (error) {
    if (error instanceof ScriptedObservationError) throw new CaptureRefusal(error.code, REASON_CODES[error.code]);
    throw error;
  }
}

/**
 * The reason code and a plain message. A `DeviceReasonError`'s message is the bridge's own and never quotes
 * the device; any other error's might, so only the code's description is printed for it.
 */
function refusalOf(error: unknown): { code: string; message: string } {
  if (error instanceof DeviceReasonError || error instanceof CaptureRefusal || error instanceof ProfileError) return { code: error.code, message: error.message };
  return { code: 'EXECUTION_ERROR', message: 'capture stopped on an unexpected error.' };
}

/**
 * `jev-ios-bridge capture` (release spec phase 6 item 1), for Android: the current screen exactly as a run
 * reads it, with the device lease held, the app never launched or restarted, and nothing left behind. It
 * prints only once the driver has closed, so a zero exit always means both the screen and the cleanup.
 * Returns the exit code.
 */
export async function captureCommand(request: CaptureRequest, context: CaptureContext): Promise<number> {
  const { write, signal } = context;
  const refuse = (error: unknown) => {
    const { code, message } = refusalOf(error);
    write.stderr(`${code}: ${message}\n`);
  };
  let output: string;
  try {
    let selected = await readProfile(context.projectDir ?? resolve(process.env.JEV_PROJECT_DIR?.trim() || process.cwd()), request.profile);
    if (selected?.profile.platform === 'ios') {
      if (request.profile !== undefined) {
        throw new ProfileError('PROFILE_CONFLICT', 'Capture requires an Android profile; the selected profile is iOS.');
      }
      selected = undefined;
    }
    let device = namedDevice(request);
    if (selected) {
      const chosen = profileDevice(selected.profile);
      const conflict = 'Capture device flags conflict with the selected profile.';
      if ('udid' in chosen || device && Object.entries(device).some(([kind, value]) =>
        Object.hasOwn(chosen, kind) && chosen[kind as keyof typeof chosen] !== value)) throw new ProfileError('PROFILE_CONFLICT', conflict);
      await agreeProfileDevice(device, selected, context.agreeDevices, signal, conflict);
      device = chosen;
    }
    // The device checks run here, before the driver's tools check, so a missing or malformed name is
    // reported first, as `run` does.
    const name = selectAndroidDeviceName(device, context.defaultDevice, 'Pass --serial or --avd, or set JEV_ANDROID_DEVICE');
    const driver = context.driver({ device, name, defaultDevice: context.defaultDevice, profile: selected?.binding,
      category: selected && selected.profile.deviceCategory !== 'ios-simulator' ? selected.profile.deviceCategory : undefined });
    const operationMs = selected?.profile.budgets?.operationMs;
    const captureSignal = operationMs === undefined ? signal : AbortSignal.any([signal, AbortSignal.timeout(operationMs)]);
    try {
      output = printable(await driver.capture(captureSignal), request.jev === true);
    } catch (error) {
      // The capture's own reason first; a cleanup that also fails is reported after it.
      if (!signal.aborted) refuse(error);
      throw REPORTED;
    } finally {
      try { await driver.close(AbortSignal.timeout(selected?.profile.budgets?.cleanupMs ?? DEFAULT_CLEANUP_MS)); }
      catch (error) {
        // close's own message says whether the device lease was kept.
        throw new CaptureRefusal('CLEANUP_FAILED', `${REASON_CODES.CLEANUP_FAILED}${error instanceof DeviceReasonError ? ` ${error.message}.` : ''}`);
      }
    }
  } catch (error) {
    // An interrupt's own exit code follows; there is nothing more to report.
    if (!signal.aborted && error !== REPORTED) refuse(error);
    return EXIT.couldNotStart;
  }
  // An interrupt prints nothing, even once the screen was read.
  if (signal.aborted) return EXIT.couldNotStart;
  write.stdout(output);
  return EXIT.passed;
}
