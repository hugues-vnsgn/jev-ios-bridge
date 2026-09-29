import type { AndroidAppIdentity, Assertion, Direction, IosAppIdentity } from '../contracts/index.js';

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

interface ScriptedScenarioBase {
  version: 1;
  preconditions?: string[];
  values: Record<string, string>;
  steps: ScriptedStep[];
}

/** A script with no `platform`, or `"ios"`, reads exactly as in 1.1. */
export interface ScriptedScenarioIos extends ScriptedScenarioBase {
  platform?: 'ios';
  app: IosAppIdentity;
  device?: { udid?: string };
}

export interface ScriptedScenarioAndroid extends ScriptedScenarioBase {
  platform: 'android';
  app: AndroidAppIdentity;
  device?: { serial?: string; avd?: string };
}

export type ScriptedScenario = ScriptedScenarioIos | ScriptedScenarioAndroid;

export interface AssertionJudgment {
  probabilities: Record<string, number>;
  inputTokens: number;
  latencyMs: number;
  model: string;
}

export interface ScriptedJudge {
  judge(assertions: Assertion[], observationText: string, signal: AbortSignal): Promise<AssertionJudgment>;
}
