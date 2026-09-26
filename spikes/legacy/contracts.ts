/**
 * Types of the retired autonomous design (goal-driven Jev action choice), kept only so the frozen
 * feasibility experiments in spikes/feasibility can still be replayed. The shipped bridge doesn't use them.
 */
import type { Assertion, Direction, ScenarioContext, Snapshot } from '../../src/contracts/index.js';

export type LegacyAction =
  | { kind: 'tap'; targetRef: string }
  | { kind: 'type'; targetRef: string; valueKey: string }
  | { kind: 'swipe'; targetRef: string; direction: Direction }
  | { kind: 'wait' | 'stop-goal' | 'stop-blocked' | 'none' };

/** Single-goal scenario that Jev and the feasibility harness consume. */
export interface Scenario extends ScenarioContext {
  goal: string;
  assertions: Assertion[];
  values: Record<string, string>;
  checkpoints?: never;
}

export interface Checkpoint { id: string; goal: string; assertions: Assertion[]; values?: Record<string, string> }

export interface CheckpointScenario extends ScenarioContext {
  checkpoints: Checkpoint[];
  goal?: never;
  assertions?: never;
  values?: never;
}

export type RunScenario = Scenario | CheckpointScenario;

export interface ActionOption { id: string; description: string; action: LegacyAction }
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

export interface JevJudge {
  judge(scenario: Scenario, observation: Observation, signal: AbortSignal): Promise<Judgment>;
}
