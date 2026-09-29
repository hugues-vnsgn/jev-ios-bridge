/** Shared types for scripted runs: device seam, snapshots, the run log, and verdicts. */
export type Verdict = 'passed' | 'failed' | 'inconclusive';
export type Direction = 'up' | 'down' | 'left' | 'right';
/** The device platform a scenario runs on. Scripts without one are iOS. */
export type Platform = 'ios' | 'android';

/** An app's launch identity: a bundle ID and optional launch args on iOS, or a package, optional activity
 *  and optional intent extras on Android. */
export type AppIdentity =
  | { bundleId: string; launchArgs?: string[] }
  | { package: string; activity?: string; intentExtras?: Record<string, string> };

export interface ScenarioContext {
  app: AppIdentity;
  preconditions?: string[];
  device?: { udid?: string };
}

/** Narrows an app identity to its iOS shape (a bundle ID). */
export function isIosApp(app: AppIdentity): app is { bundleId: string; launchArgs?: string[] } {
  return 'bundleId' in app;
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
  value?: string;
  identifier?: string;
  frame?: { x: number; y: number; width: number; height: number };
  state?: { enabled: boolean; visible: boolean; focused?: boolean; selected?: boolean };
  actions: string[];
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
  /** Perform the action. May return the settled screen after it, which the run then uses as its next observation. */
  act(action: Action, snapshot: Snapshot, scenario: ActionScenarioContext, signal: AbortSignal): Promise<Snapshot | undefined | void>;
  close(signal: AbortSignal): Promise<void>;
  metrics?(): DeviceMetrics;
  /** Whether the launched app is still running; undefined when the driver can't tell. */
  appRunning?(): boolean | undefined;
  /** The app's own log files the device layer is writing for this launch, for the live log pane. */
  logSources?(): { runtime?: string; os?: string };
  /** Set only by a driver integration whose pinned tap semantics were verified. The run reads it. */
  readonly tapAliasRule?: TapAliasRule;
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
