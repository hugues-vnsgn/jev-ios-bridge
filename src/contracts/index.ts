/** Shared types for scripted runs: device seam, snapshots, the run log, and verdicts. */
export type Verdict = 'passed' | 'failed' | 'inconclusive';
export type Direction = 'up' | 'down' | 'left' | 'right';

export interface ScenarioContext {
  app: { bundleId: string };
  preconditions?: string[];
  device?: { udid?: string };
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
}

export type Action =
  | { kind: 'tap'; targetRef: string }
  | { kind: 'type'; targetRef: string; valueKey: string }
  | { kind: 'swipe'; targetRef: string; direction: Direction };


export interface DeviceDriver {
  prepare(scenario: PrepareScenarioContext, signal: AbortSignal): Promise<void>;
  observe(signal: AbortSignal): Promise<Snapshot>;
  act(action: Action, snapshot: Snapshot, scenario: ActionScenarioContext, signal: AbortSignal): Promise<void>;
  close(signal: AbortSignal): Promise<void>;
  metrics?(): DeviceMetrics;
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
