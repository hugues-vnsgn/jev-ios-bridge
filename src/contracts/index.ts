/** Shared types for scripted runs: device seam, snapshots, the run log, and verdicts. */
export type Verdict = 'passed' | 'failed' | 'inconclusive';
export type Direction = 'up' | 'down' | 'left' | 'right';
/** The device platform a scenario runs on. Scripts without one are iOS. */
export const PLATFORMS = ['ios', 'android'] as const;
export type Platform = typeof PLATFORMS[number];

/** The app under test on iOS: a bundle ID, plus its launch options (launch arguments). */
export interface IosAppIdentity { bundleId: string; launchArgs?: string[] }
/** The app under test on Android: a package, plus its launch options (an activity and intent extras). */
export interface AndroidAppIdentity { package: string; activity?: string; intentExtras?: Record<string, string> }

/** The app under test, plus its launch options: a bundle ID and launch arguments on iOS, or a package,
 *  activity and intent extras on Android. */
export type AppIdentity = IosAppIdentity | AndroidAppIdentity;

export interface ScenarioContext {
  app: AppIdentity;
  preconditions?: string[];
  device?: { udid?: string };
}

/** Narrows an app identity to its iOS shape (a bundle ID). */
export function isIosApp(app: AppIdentity): app is IosAppIdentity {
  return 'bundleId' in app;
}

/** The app's own label: its bundle ID on iOS, its package on Android. */
export function appLabel(app: AppIdentity): string {
  return isIosApp(app) ? app.bundleId : app.package;
}

/** Device preparation needs only launch identity and environmental prerequisites. */
export type PrepareScenarioContext = ScenarioContext;

/** Actions additionally receive explicit typed values. */
export interface ActionScenarioContext extends ScenarioContext {
  values: Record<string, string>;
}

export interface Assertion { id: string; claim: string }


export interface Element {
  ref: string;
  role: string;
  label?: string;
  /** An empty field's hint text, shown to Jev as `placeholder` in place of `label`. Only the Android driver sets it. */
  placeholder?: string;
  value?: string;
  identifier?: string;
  frame?: { x: number; y: number; width: number; height: number };
  state?: { enabled: boolean; visible: boolean; focused?: boolean; selected?: boolean };
  actions: string[];
  /** Internal "can't be selected" marker: for example, text Android shows inside a button, which the mapping
   *  lifts onto the button and marks unselectable. Never shown to Jev; honoured only by selection. */
  selectable?: false;
}

export interface Snapshot {
  deviceId: string;
  capturedAt: number;
  expiresAt: number;
  sequence: number;
  elements: Element[];
  truncated: boolean;
  screenHash?: string;
  screenshotPath?: string;
  logTails?: Record<string, string>;
  /** The settled capture the device layer returned with the previous action, reused instead of capturing again. */
  reusedFromAction?: boolean;
  /** Measurement only: whether a capture taken after the screenshot still had this capture's screen hash. */
  screenshotAgreement?: boolean;
  /** Measurement only: time spent on that extra capture, so speed figures can exclude it. */
  verifyMs?: number;
  /** Measurement only: captures taken until the screenshot and capture agreed, when more than one. */
  verifyAttempts?: number;
  /** Android only: false when the settle rule hit its cap before two captures agreed, so this is the last
   *  capture taken rather than a confirmed settled one ("screen still changing"). Absent when settled. */
  settled?: boolean;
}

/** What a replace-text `act` call may return instead of a bare `Snapshot`, to also report the field's
 *  displayed value once the bridge typed into it (which may legitimately differ from the typed value).
 *  Every other action keeps returning a bare `Snapshot`, or nothing. */
export interface ActOutcome {
  screen: Snapshot;
  shownValue: string;
}

/** Distinguishes an `ActOutcome` from a bare `Snapshot`: only the former carries a `screen` property. */
export function isActOutcome(result: Snapshot | ActOutcome): result is ActOutcome {
  return 'screen' in result;
}

export type Action =
  | { kind: 'tap'; targetRef: string }
  | { kind: 'type'; targetRef: string; valueKey: string }
  | { kind: 'swipe'; targetRef: string; direction: Direction };


/** MobileBuildMCP 2.7.1's proven tap-alias collapsing. Only the pinned integration may carry it. */
export type TapAliasRule = 'mobilebuildmcp-2.7.1';

export interface DeviceDriver {
  prepare(scenario: PrepareScenarioContext, signal: AbortSignal): Promise<void>;
  observe(signal: AbortSignal): Promise<Snapshot>;
  /** Perform the action. May return the settled screen after it, which the run then uses as its next
   *  observation; a replace-text action may instead return an `ActOutcome` to also report the shown value. */
  act(action: Action, snapshot: Snapshot, scenario: ActionScenarioContext, signal: AbortSignal): Promise<Snapshot | ActOutcome | undefined | void>;
  close(signal: AbortSignal): Promise<void>;
  metrics?(): DeviceMetrics;
  /** Whether the launched app is still running; undefined when the driver can't tell. */
  appRunning?(): boolean | undefined;
  /** Why the launched app stopped answering, with a note for the log pane; undefined when it is fine, it stopped
   *  because the bridge stopped it, or the driver can't tell. */
  appProblem?(): AppProblem | undefined;
  /** The app's own log files the device layer is writing for this launch, for the live log pane. */
  logSources?(): LogSources;
  /** Set only by a driver integration whose pinned tap semantics were verified. The run reads it. */
  readonly tapAliasRule?: TapAliasRule;
  /** What `prepare` set up on the device, for the run log's `prepared` event. Only a driver that prepares a
   *  device (Android) implements this; the iOS driver doesn't. */
  preparation?(): DevicePreparation;
}

/** The launched app exited (crashed, was killed or quit) or froze. The note names the cause, for the log pane. */
export interface AppProblem { code: 'APP_EXITED' | 'APP_NOT_RESPONDING'; note: string }

/** The app's own log files: MobileBuildMCP's runtime and system logs on iOS, the app's logcat file on Android. */
export interface LogSources { runtime?: string; os?: string; logcat?: string }

/** What a device `prepare` did, recorded in the run log's `prepared` event. */
export interface DevicePreparation {
  deviceIdentity: string;
  serial: string;
  agentSha256: string;
  /** True only when this run's lease took over a crashed run's and swept its leftovers. */
  sweptLeftovers?: boolean;
}

export interface DeviceMetrics {
  /** Completed captures to refresh an action's reference, proactive or reactive. */
  referenceRefreshes: number;
  /** Vendor SNAPSHOT_EXPIRED responses observed while acting. */
  referenceExpiries: number;
  /** Proactive refreshes started near a reference's expiry time. */
  nearTtlRefreshes: number;
}


export interface RunEvent {
  version: 1;
  runId: string;
  sequence: number;
  at: string;
  type: 'started' | 'prepared' | 'step' | 'judgment' | 'action' | 'checkpoint' | 'error' | 'verdict';
  data: Record<string, unknown>;
}

export interface RunReport {
  runId: string;
  verdict: Verdict;
  reason: string;
  steps: number;
  inputTokens: number;
  durationMs: number;
  events: RunEvent[];
}

export interface RunLog {
  append(type: RunEvent['type'], data: Record<string, unknown>): Promise<void>;
  read(): Promise<RunEvent[]>;
  /** Persist the frozen report.json beside run.jsonl, after the verdict event. */
  writeReport?(report: unknown): Promise<void>;
}
