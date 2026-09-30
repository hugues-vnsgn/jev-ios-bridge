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

/** A script with no `platform`, or `"ios"`, reads exactly as in 1.1: a bundle ID, and a simulator UDID. */
export interface ScriptedScenarioIos extends ScriptedScenarioBase {
  platform?: 'ios';
  app: IosAppIdentity;
  device?: { udid?: string };
}

/** An Android script: a package, and at most one of an adb serial or an AVD name. It has no bundle ID,
 *  launch arguments or UDID; the `never` fields say so, and still let a platform-blind read compile. */
export interface ScriptedScenarioAndroid extends ScriptedScenarioBase {
  platform: 'android';
  app: AndroidAppIdentity & { bundleId?: never; launchArgs?: never };
  device?: { serial?: string; avd?: string; udid?: never };
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
