import type { Assertion, Direction, Snapshot } from '../../src/contracts/index.js';

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

export interface AssertionCase {
  id: string;
  workflowGroup: string;
  app: { bundleId: string };
  setupSteps: string[];
  snapshot: Snapshot;
  /** Neutral IDs and balanced ordering prevent the question keys from leaking labels. */
  claims: [
    { id: 'a' | 'b'; claim: string; expected: boolean; rationale: string },
    { id: 'a' | 'b'; claim: string; expected: boolean; rationale: string },
  ];
  assets: {
    fullPath: string;
    screenshotPath: string;
    sha256: { full: string; screenshot: string };
  };
}

export interface ScriptedCorpus {
  version: 1;
  cases: AssertionCase[];
}

export interface AssertionManifest {
  version: 1;
  status: 'draft' | 'frozen';
  corpusSha256: string;
  implementationSha256: string;
  model: string;
  projectionRule: 'visible-full-text-v1';
  questionTemplate: string;
  maxStateBytes: 24_000;
  stateQuestionMaxBytes: 28_000;
  requestMaxBytes: 56_000;
  noulYes: 0.9;
  noulNo: 0.1;
  gateRule: 'ticket-21-paired-24-v1';
}

export interface AssertionApproval {
  version: 1;
  approved: true;
  reviewedBy: string;
  reviewedAt: string;
  corpusSha256: string;
  manifestSha256: string;
}
