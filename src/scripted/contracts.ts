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
  | { id: string; kind: 'checkpoint'; guard: ScreenGuard; assertions: Assertion[] }
  | DoStep;

/** What a `do` step may do to the app's data: nothing, writes to a test environment, or something destructive. */
export type StepEffect = 'none' | 'test_write' | 'destructive';

/** A version 2 step the bridge performs itself: Jev picks each action from the screen, until `doneWhen` holds.
 *  It has no guard. */
export interface DoStep {
  id: string;
  kind: 'do';
  intent: string;
  doneWhen: string;
  effect: StepEffect;
  /** Keys into the script's `values`: the values this step may type. */
  values?: string[];
  /** Every decision in this step goes to Claude; none of its screens is sent to Jev. */
  localOnly?: boolean;
}

interface ScriptedScenarioBase {
  /** 2 only for a script with a `do` step, `goal` or `start`. */
  version: 1 | 2;
  /** Version 2: what the whole script is for, given to Jev as the goal; absent, a do step's intent is. */
  goal?: string;
  /** Version 2: restart the app (the default) or attach to it as it is. */
  start?: 'restart' | 'attach';
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

/** A typed value as a script writes it: the text itself, or `{ "fromEnv": NAME }`, read from the bridge's
 *  environment when a run starts. */
export type ScriptValue = string | { fromEnv: string };

type WithScriptValues<T> = T extends unknown ? Omit<T, 'values'> & { values: Record<string, ScriptValue> } : never;

/** A script as written, before its `fromEnv` values are read. A {@link ScriptedScenario} has only text. */
export type ScriptedScenarioSource = WithScriptValues<ScriptedScenario>;

export interface AssertionJudgment {
  probabilities: Record<string, number>;
  inputTokens: number;
  latencyMs: number;
  model: string;
}

export interface ScriptedJudge {
  judge(assertions: Assertion[], observationText: string, signal: AbortSignal): Promise<AssertionJudgment>;
}
