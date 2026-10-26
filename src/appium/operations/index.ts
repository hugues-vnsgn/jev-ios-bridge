import type { ActOutcome, ActPath, Direction, Element, Snapshot, VendorSource } from '../../contracts/index.js';
import { backButtonOf, DeviceReasonError, largestScrollable, screenPointOf, scrollFinger, StaleSnapshotError } from '../../device/index.js';
import type { ScreenshotImage } from '../../device/image.js';
import type { PrivateAppiumClient } from '../client.js';
import type { AppiumObservedScreen } from '../observe/index.js';
import { AppiumError, type AppiumErrorCode, type AppiumPlatform, type AppiumSessionId } from '../wire-schemas.js';
import { textFieldOf, shownValueOf } from './field.js';
import { DEFAULT_TAP_HOLD_MS, centreOf, edgeBack, screenMiddleScroll, scrollWithin, strokeSequence, swipeWithin, tapSequence,
  type PointerActions, type Stroke } from './geometry.js';

export type OperationName = 'tap' | 'swipe' | 'scroll' | 'back' | 'tap-at' | 'replace-text' | 'restart' | 'terminate';

/** The one place a mutation passes through, so the caller can authorize it and count it. */
export type OperationDispatcher = (operation: OperationName, send: () => Promise<void>) => Promise<void>;

export interface OperationsClient {
  readonly dispatchOpen: boolean;
  performActions(actions: PointerActions, timeoutMs?: number): Promise<void>;
  callExtension: PrivateAppiumClient['callExtension'];
}
export interface OperationSession {
  readonly sessionId: AppiumSessionId;
  readonly profile: { readonly platform: AppiumPlatform };
  readonly client: OperationsClient;
  finish(): Promise<void>;
}
export interface OperationObservation {
  resolve(input: { sessionId: AppiumSessionId; snapshot: Snapshot; ref: string }): Element;
  isCurrent(snapshot: Snapshot): boolean;
  invalidate(): void;
  observe(signal: AbortSignal): Promise<AppiumObservedScreen>;
}
export interface AppiumOperationsOptions {
  dispatch?: OperationDispatcher;
  now?: () => number;
  timeoutMs?: number;
}
export interface Performed {
  result: Snapshot | ActOutcome;
  screenshot: ScreenshotImage;
  actPath?: ActPath;
  holdMs?: number;
}
export interface AndroidLaunch { package: string; activity: string; intentExtras?: Record<string, string> }

/** A mutation was sent and never confirmed. Dispatch is closed and nothing was resent. */
export class UnconfirmedOperationError extends DeviceReasonError {
  constructor(readonly operation: OperationName) {
    super('UI_ACTION_UNCONFIRMED', `The ${operation} was sent and never confirmed; dispatch is closed and nothing was resent.`);
    this.name = 'UnconfirmedOperationError';
  }
}

const MAX_HOLD_MS = 10_000;
const TAP_AT_ASPECT_TOLERANCE = 0.01;
/** Codes the extension answers before any input reaches the device. */
export const REFUSED_BEFORE_INPUT: ReadonlySet<string> = new Set(['SESSION_MISMATCH', 'VERSION_MISMATCH', 'NOT_ALLOWED', 'NOT_UNIQUE']);
/** Codes the bridge's own client or extension raises, never Appium's driver. */
const BRIDGE_CODES: ReadonlySet<AppiumErrorCode> = new Set(['SESSION_MISMATCH', 'VERSION_MISMATCH', 'NOT_ALLOWED']);
export const vendorSourceOf = (code: AppiumErrorCode): VendorSource => BRIDGE_CODES.has(code) ? 'bridge' : 'appium';
const passThrough: OperationDispatcher = (_operation, send) => send();
const unsupported = (message: string) => new DeviceReasonError('UNSUPPORTED_ACTION', message);

export class AppiumOperations {
  private readonly platform: AppiumPlatform;
  private readonly dispatcher: OperationDispatcher;
  private readonly now: () => number;
  private busy = false;
  private closing: Promise<void> | undefined;
  private lost: OperationName | undefined;

  constructor(private readonly session: OperationSession, private readonly observation: OperationObservation,
    private readonly options: AppiumOperationsOptions = {}) {
    this.platform = session.profile.platform;
    this.dispatcher = options.dispatch ?? passThrough;
    this.now = options.now ?? Date.now;
  }

  /** The operation whose acknowledgement was lost, once dispatch closed on it. */
  get unconfirmed(): OperationName | undefined { return this.lost; }

  tap(evidence: AppiumObservedScreen, ref: string, signal: AbortSignal, holdMs = DEFAULT_TAP_HOLD_MS): Promise<Performed> {
    return this.exclusive(signal, () => this.tapElement('tap', evidence, ref, holdMs, signal));
  }

  swipe(evidence: AppiumObservedScreen, ref: string, direction: Direction, signal: AbortSignal): Promise<Performed> {
    return this.exclusive(signal, async () => {
      const target = this.target(evidence, ref, 'swipeWithin');
      const stroke = swipeWithin(this.platform, target.frame, direction);
      return this.stroked('swipe', stroke, signal);
    });
  }

  scroll(evidence: AppiumObservedScreen, direction: 'up' | 'down', signal: AbortSignal): Promise<Performed> {
    return this.exclusive(signal, async () => {
      this.current(evidence);
      const area = largestScrollable(evidence.snapshot.elements);
      const stroke = area ? scrollWithin(this.platform, area.frame, scrollFinger(direction))
        : screenMiddleScroll(this.platform, evidence.screenshot.frame, direction);
      return this.stroked('scroll', stroke, signal, area ? { path: 'scroll-within', targetRef: area.ref } : { path: 'screen-middle' });
    });
  }

  back(evidence: AppiumObservedScreen, signal: AbortSignal): Promise<Performed> {
    return this.exclusive(signal, async () => {
      this.current(evidence);
      if (this.platform === 'android') {
        await this.mutate('back', () => this.session.client.callExtension({ name: 'jev_android_back', arguments: {} }, this.options.timeoutMs));
        return this.settled(signal, { path: 'back-key' });
      }
      const button = backButtonOf(evidence.snapshot);
      if (button) return this.tapElement('back', evidence, button.ref, DEFAULT_TAP_HOLD_MS, signal, { path: 'back-button', targetRef: button.ref });
      return this.stroked('back', edgeBack(evidence.screenshot.frame), signal, { path: 'edge-swipe' });
    });
  }

  tapAt(evidence: AppiumObservedScreen, x: number, y: number, signal: AbortSignal): Promise<Performed> {
    return this.exclusive(signal, async () => {
      if (this.platform === 'ios') throw unsupported('iOS has no tap at a point.');
      this.current(evidence);
      const { frame, orientation, size } = evidence.screenshot;
      if (Math.abs(size.width * frame.height - size.height * frame.width) > TAP_AT_ASPECT_TOLERANCE * size.height * frame.width)
        throw new DeviceReasonError('DEVICE_ERROR', 'The screenshot does not match the screen it would be converted against.');
      const screen = await this.read(() => this.session.client.callExtension({ name: 'jev_screen', arguments: {} }, this.options.timeoutMs));
      if (screen.orientation !== orientation || screen.rect.x !== frame.x || screen.rect.y !== frame.y
        || screen.rect.width !== frame.width || screen.rect.height !== frame.height) throw new StaleSnapshotError('The screen size or orientation changed.');
      const point = screenPointOf(x, y, size, frame);
      if (!point) throw unsupported(`tapAt is outside the ${String(size.width)} × ${String(size.height)} screenshot.`);
      return this.pointed('tap-at', tapSequence({ x: frame.x + point.x, y: frame.y + point.y }, DEFAULT_TAP_HOLD_MS), signal);
    });
  }

  replaceText(evidence: AppiumObservedScreen, ref: string, text: string, signal: AbortSignal): Promise<Performed> {
    return this.exclusive(signal, async () => {
      const target = this.target(evidence, ref, 'typeText');
      const field = textFieldOf(this.platform, evidence.snapshot, target);
      await this.mutate('replace-text', () => this.session.client.callExtension(
        { name: 'jev_replace_text', arguments: { locator: field.locator, text } }, this.options.timeoutMs));
      const observed = await this.observation.observe(signal);
      const shownValue = shownValueOf(field, target, observed.snapshot);
      return { result: shownValue === undefined ? observed.snapshot : { screen: observed.snapshot, shownValue }, screenshot: observed.screenshot };
    });
  }

  restart(app: AndroidLaunch, signal: AbortSignal): Promise<void> {
    return this.exclusive(signal, async () => {
      if (this.platform !== 'android') throw unsupported('Only Android restarts through the extension.');
      await this.mutate('restart', () => this.session.client.callExtension({ name: 'jev_start_activity',
        arguments: { package: app.package, activity: app.activity, intentExtras: app.intentExtras ?? {} } }, this.options.timeoutMs));
    });
  }

  terminate(appId: string, signal: AbortSignal): Promise<void> {
    return this.exclusive(signal, () => this.mutate('terminate', () => this.session.client.callExtension(
      { name: 'jev_terminate_app', arguments: { appId } }, this.options.timeoutMs)));
  }

  /** Stops new operations, then deletes the owned session. Runs after a lost acknowledgement too. */
  close(): Promise<void> {
    this.closing ??= this.session.finish().catch(() => {
      throw new DeviceReasonError('CLEANUP_FAILED', 'The Appium session could not be deleted.');
    });
    return this.closing;
  }

  private async exclusive<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    if (this.closing) throw new DeviceReasonError('STATE_UNAVAILABLE', 'The Appium session is closed.');
    if (this.lost) throw new UnconfirmedOperationError(this.lost);
    if (!this.session.client.dispatchOpen) throw new DeviceReasonError('STATE_UNAVAILABLE', 'Dispatch to the Appium session is closed.');
    if (this.busy) throw new DeviceReasonError('INTERNAL_ERROR', 'An Appium operation is already running.');
    this.busy = true;
    try { return await work(); } finally { this.busy = false; }
  }

  private current({ snapshot }: AppiumObservedScreen): void {
    if (this.now() >= snapshot.expiresAt || !this.observation.isCurrent(snapshot)) throw new StaleSnapshotError();
  }

  private target(evidence: AppiumObservedScreen, ref: string, action: 'tap' | 'swipeWithin' | 'typeText'): Element & { frame: NonNullable<Element['frame']> } {
    const { snapshot } = evidence;
    if (this.now() >= snapshot.expiresAt) throw new StaleSnapshotError();
    const element = this.observation.resolve({ sessionId: this.session.sessionId, snapshot, ref });
    if (!element.actions.includes(action)) throw unsupported(`The target does not support ${action}.`);
    const { frame, state } = element;
    if (!frame || frame.width <= 0 || frame.height <= 0 || state?.enabled === false || state?.visible === false)
      throw new DeviceReasonError('TARGET_UNAVAILABLE', 'The target is hidden, disabled or has no frame.');
    return { ...element, frame };
  }

  private async tapElement(operation: 'tap' | 'back', evidence: AppiumObservedScreen, ref: string, holdMs: number, signal: AbortSignal,
    actPath?: ActPath): Promise<Performed> {
    if (!Number.isInteger(holdMs) || holdMs < 0 || holdMs > MAX_HOLD_MS) throw unsupported('The hold is out of range.');
    const target = this.target(evidence, ref, 'tap');
    return { ...await this.pointed(operation, tapSequence(centreOf(target.frame), holdMs), signal, actPath), holdMs };
  }

  private stroked(operation: 'swipe' | 'scroll' | 'back', stroke: Stroke, signal: AbortSignal, actPath?: ActPath): Promise<Performed> {
    return this.pointed(operation, strokeSequence(stroke), signal, actPath);
  }

  private async pointed(operation: OperationName, actions: PointerActions, signal: AbortSignal, actPath?: ActPath): Promise<Performed> {
    await this.mutate(operation, () => this.session.client.performActions(actions, this.options.timeoutMs));
    return this.settled(signal, actPath);
  }

  private async settled(signal: AbortSignal, actPath?: ActPath): Promise<Performed> {
    const observed = await this.observation.observe(signal);
    return { result: observed.snapshot, screenshot: observed.screenshot, ...(actPath ? { actPath } : {}) };
  }

  private async mutate(operation: OperationName, send: () => Promise<unknown>): Promise<void> {
    this.observation.invalidate();
    let sent = false;
    try {
      await this.dispatcher(operation, async () => { sent = true; await send(); });
    } catch (error) {
      if (!sent) throw error;
      if (error instanceof AppiumError && REFUSED_BEFORE_INPUT.has(error.code)) throw this.refusal(error);
      this.lost = operation;
      throw new UnconfirmedOperationError(operation);
    }
  }

  private async read<T>(send: () => Promise<T>): Promise<T> {
    try { return await send(); } catch (error) { throw this.refusal(error); }
  }

  private refusal(error: unknown): DeviceReasonError {
    const code = error instanceof AppiumError ? error.code : undefined;
    if (code === 'NOT_UNIQUE') return new DeviceReasonError('TARGET_AMBIGUOUS', 'The target matched more than one element.');
    return new DeviceReasonError('DEVICE_ERROR', 'The Appium layer refused the operation.', code === undefined ? {} : { vendorCode: code, vendorSource: vendorSourceOf(code) });
  }
}
