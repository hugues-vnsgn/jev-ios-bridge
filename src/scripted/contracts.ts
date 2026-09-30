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

/**
 * The script's own field shapes for `app` and `device`. Both platforms share these: a script's actual
 * fields are enforced by the schema per platform (src/scripted/schema.ts), not by this type, so that
 * `script.app.bundleId` and `script.device?.udid` keep typechecking without narrowing, as they did before
 * Android added its own fields. The reshaped, narrower AppIdentity (src/contracts/index.ts) is what a
 * device driver actually receives.
 */
interface ScriptedAppFields {
  bundleId: string;
  launchArgs?: string[];
  package?: string;
  activity?: string;
  intentExtras?: Record<string, string>;
}

interface ScriptedDeviceFields {
  udid?: string;
  serial?: string;
  avd?: string;
}

interface ScriptedScenarioBase {
  version: 1;
  app: ScriptedAppFields;
  device?: ScriptedDeviceFields;
  preconditions?: string[];
  values: Record<string, string>;
  steps: ScriptedStep[];
}

/** A script with no `platform`, or `"ios"`, reads exactly as in 1.1. */
export interface ScriptedScenarioIos extends ScriptedScenarioBase {
  platform?: 'ios';
}

export interface ScriptedScenarioAndroid extends ScriptedScenarioBase {
  platform: 'android';
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
