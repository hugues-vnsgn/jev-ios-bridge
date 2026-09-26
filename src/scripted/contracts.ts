import type { Assertion, Direction } from '../contracts/index.js';

/** Stable element identity. A vendor snapshot ref is deliberately not accepted. */
export interface Selector {
  identifier?: string;
  role?: string;
  label?: string;
  value?: string;
}

/** Present anchors must each match exactly one visible element; absent anchors match none. */
export interface ScreenGuard {
  present: Selector[];
  absent?: Selector[];
}

export type ScriptedStep =
  | { id: string; kind: 'action'; guard: ScreenGuard; action:
      | { kind: 'tap'; selector: Selector }
      | { kind: 'replaceText'; selector: Selector; valueKey: string }
      | { kind: 'swipe'; selector: Selector; direction: Direction } }
  | { id: string; kind: 'wait'; guard: ScreenGuard; until: ScreenGuard; timeoutMs: number }
  | { id: string; kind: 'checkpoint'; guard: ScreenGuard; assertions: Assertion[] };

export interface ScriptedScenario {
  version: 1;
  app: { bundleId: string };
  device?: { udid?: string };
  preconditions?: string[];
  values: Record<string, string>;
  steps: ScriptedStep[];
}

export interface AssertionJudgment {
  probabilities: Record<string, number>;
  inputTokens: number;
  latencyMs: number;
  model: string;
}

export interface ScriptedJudge {
  judge(assertions: Assertion[], observationText: string, signal: AbortSignal): Promise<AssertionJudgment>;
}
