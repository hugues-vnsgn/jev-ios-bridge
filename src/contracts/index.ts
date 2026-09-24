/** Provisional seams; empirical configuration remains gated by ticket 08. */
export type Verdict = 'passed' | 'failed' | 'inconclusive';
export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Scenario {
  goal: string;
  app: { bundleId: string };
  assertions: Array<{ id: string; claim: string }>;
  values: Record<string, string>;
  preconditions?: string[];
  device?: { udid?: string };
}

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
  | { kind: 'swipe'; targetRef: string; direction: Direction }
  | { kind: 'wait' | 'stop-goal' | 'stop-blocked' | 'none' };

export interface ActionOption { id: string; description: string; action: Action }
export interface HistoryEntry { step: number; description: string }
export interface Observation {
  snapshot: Snapshot;
  text: string;
  options: ActionOption[];
}
export interface Judgment {
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
  goalReached: number;
  assertions: Record<string, number>;
  inputTokens: number;
  latencyMs: number;
  model: string;
}

export interface DeviceDriver {
  prepare(scenario: Scenario, signal: AbortSignal): Promise<void>;
  observe(signal: AbortSignal): Promise<Snapshot>;
  act(action: Action, snapshot: Snapshot, scenario: Scenario, signal: AbortSignal): Promise<void>;
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

export interface JevJudge {
  judge(scenario: Scenario, observation: Observation, signal: AbortSignal): Promise<Judgment>;
}

export interface RunEvent {
  version: 1;
  runId: string;
  sequence: number;
  at: string;
  type: 'started' | 'prepared' | 'step' | 'judgment' | 'action' | 'error' | 'verdict';
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
}
