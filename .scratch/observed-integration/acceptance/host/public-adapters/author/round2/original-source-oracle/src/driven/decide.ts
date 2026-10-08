// One Jev decision for a driven (`do`) step: build the request, send it, strictly parse the answer.
//
// The request is the jev-drives spike's, unchanged (spikes/jev-drives/protocol.md, "The request"): one Choice
// `next_action` over the candidate keys and one Noul `step_done`, with the state goal, current step, done-when, plan
// values, the last 2 actions and the screen text from `renderAssertionState`. The step's effect is never sent, nor
// anything else the caller passes. Every typed value is replaced by `⟦value:<key>⟧` wherever Jev would read it (E14).
// Budgets, strict parsing and error codes are the scripted judge's (src/scripted/jev.ts); errors never carry a
// response body. Whether to act on the answer is `acceptDecision` in policy.ts.
import { TypeSafeClient, choice, noul, type Questions, type SystemOneRequest } from '@typesafe-ai/sdk';
import type { Element, Platform, Snapshot } from '../contracts/index.js';
import {
  REQUEST_MAX_BYTES, SCRIPTED_JEV_MODEL, STATE_QUESTION_MAX_BYTES, ScriptedJevError, requestError as scriptedRequestError,
} from '../scripted/jev.js';
import { renderAssertionState } from '../scripted/observe.js';
import { MAX_OPTIONS, buildCandidates, lookupCandidate, type CandidateSet } from './candidates.js';
import { MARKER_OPEN, marker } from './marker.js';

export const DRIVEN_JEV_MODEL = SCRIPTED_JEV_MODEL;
export const NEXT_ACTION_QUESTION = 'Which one action performs the current step on this screen? Choose step_done if the current step is already done on this screen. Choose none_fits if no listed action performs it, or if the screen is not what the step expects.';
export const STEP_DONE_QUESTION = 'Does the visible evidence on this current screen show that the current step is done?';
/** Jev sees this many of the step's recent actions, oldest first. */
export const RECENT_ACTIONS = 2;

export interface DecisionInput {
  /** The script's goal; the step intent stands in when the script has none. */
  goal?: string;
  intent: string;
  doneWhen: string;
  /** A fresh observation of the screen. */
  snapshot: Snapshot;
  platform: Platform;
  /** The value keys this step may type: its type options and its `plan_values`. */
  valueKeys: readonly string[];
  /** Key -> text of every value the run may have typed, this step's or earlier ones'. Each is masked; none is sent. */
  values: Readonly<Record<string, string>>;
  /** Plain-language lines, oldest first. Only the last RECENT_ACTIONS are sent. */
  recentActions: readonly string[];
}

export interface PreparedDecision {
  /** The options: masked descriptions (as sent), real keys and real elements (for acting and the risky-word net). */
  set: CandidateSet;
  request: SystemOneRequest<Questions>;
}

export interface DrivenDecision {
  choice: string;
  confidence: number;
  /** Per option key, as Jev returned them. */
  probabilities: Record<string, number>;
  /** The "step done" Noul. */
  done: number;
  inputTokens: number;
  latencyMs: number;
  model: string;
  /** How many options Jev chose from. */
  options: number;
}

/** The seam the driven step loop calls; tests pass a fake. */
export interface DrivenJudge {
  decide(prepared: PreparedDecision, signal: AbortSignal): Promise<DrivenDecision>;
}

/** Replaces every typed value with `⟦value:<key>⟧`, scanning left to right; blank values are skipped. A marker for
 *  one of the keys is skipped whole, so masking twice changes nothing; elsewhere the longest typed value starting
 *  at a position is replaced. Values can't hold a marker bracket, so none can overlap a marker's edge. */
export function maskValues(text: string, values: Readonly<Record<string, string>>): string {
  // Text -> the key to mask it as; the first key wins for a value two keys share.
  const keyOf = new Map<string, string>();
  for (const [key, value] of Object.entries(values)) if (value.trim() && !keyOf.has(value)) keyOf.set(value, key);
  if (!keyOf.size) return text;
  const byLength = [...keyOf.keys()].sort((a, b) => b.length - a.length);
  const markers = Object.keys(values).map(marker);
  let masked = '';
  let at = 0;
  while (at < text.length) {
    const kept = text.startsWith(MARKER_OPEN, at) ? markers.find(known => text.startsWith(known, at)) : undefined;
    if (kept !== undefined) { masked += kept; at += kept.length; continue; }
    const value = byLength.find(candidate => text.startsWith(candidate, at));
    if (value !== undefined) { masked += marker(keyOf.get(value)!); at += value.length; continue; }
    masked += text[at];
    at += 1;
  }
  return masked;
}

/** The element with every typed value masked in its texts; its ref, actions and state are untouched. */
export function maskElement(element: Element, values: Readonly<Record<string, string>>): Element {
  const masked: Element = { ...element };
  for (const field of ['label', 'placeholder', 'value', 'identifier'] as const) {
    const text = element[field];
    if (text !== undefined) masked[field] = maskValues(text, values);
  }
  return masked;
}

/** The snapshot with every element's typed values masked, as Jev reads a screen. */
export function maskSnapshot(snapshot: Snapshot, values: Readonly<Record<string, string>>): Snapshot {
  return { ...snapshot, elements: snapshot.elements.map(element => maskElement(element, values)) };
}

const bytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), 'utf8');

/**
 * Builds the options and the request for one decision. Throws ScriptedObservationError when the screen can't be
 * rendered for Jev, ScriptedJevError INVALID_INPUT or REQUEST_BUDGET otherwise. Nothing is trimmed to fit.
 */
export function prepareDecision(input: DecisionInput): PreparedDecision {
  const { intent, doneWhen, values } = input;
  if (!intent.trim() || !doneWhen.trim()) throw new ScriptedJevError('INVALID_INPUT');
  const goal = input.goal?.trim() ? input.goal : intent;
  const maskedElements = input.snapshot.elements.map(element => maskElement(element, values));
  const screen = renderAssertionState({ ...input.snapshot, elements: maskedElements }, input.platform);

  const real = buildCandidates(input.snapshot.elements, input.valueKeys);
  // Descriptions come from the masked elements; keys, meanings and elements stay real. Masking touches no ref,
  // action or state, so both builds offer the same keys; a description is string-masked if one ever went missing.
  const maskedDescriptions = new Map(buildCandidates(maskedElements, input.valueKeys).candidates
    .map(({ key, description }) => [key, description]));
  const set: CandidateSet = { ...real, candidates: real.candidates.map(({ key, description }) =>
    ({ key, description: maskedDescriptions.get(key) ?? maskValues(description, values) })) };
  const criteria: Record<string, string> = {};
  for (const { key, description } of set.candidates) {
    if (Object.hasOwn(criteria, key)) throw new ScriptedJevError('INVALID_INPUT');
    criteria[key] = description;
  }
  if (set.candidates.length > MAX_OPTIONS || !Object.hasOwn(criteria, 'none_fits') ||
      !Object.hasOwn(criteria, 'step_done')) throw new ScriptedJevError('INVALID_INPUT');

  const mask = (text: string): string => maskValues(text, values);
  const state = {
    goal: mask(goal),
    current_step: mask(intent),
    done_when: mask(doneWhen),
    plan_values: Object.fromEntries([...new Set(input.valueKeys)].sort().map(key => [key, marker(key)])),
    recent_actions: input.recentActions.slice(-RECENT_ACTIONS).map(mask),
    screen,
  };
  const questions: Questions = {
    next_action: choice({ question: NEXT_ACTION_QUESTION, current_step: state.current_step, done_when: state.done_when },
      criteria),
    step_done: noul({ question: STEP_DONE_QUESTION, done_when: state.done_when }),
  };
  const request: SystemOneRequest<Questions> = { model: DRIVEN_JEV_MODEL, state, questions };
  const longestQuestion = Math.max(...Object.values(questions).map(bytes));
  if (bytes(state) + longestQuestion > STATE_QUESTION_MAX_BYTES || bytes(request) > REQUEST_MAX_BYTES) {
    throw new ScriptedJevError('REQUEST_BUDGET');
  }
  return { set, request };
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const probability = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

/** Strictly parses untrusted model output; errors never include its body. */
export function parseDecision(raw: unknown, set: CandidateSet, latencyMs: number): DrivenDecision {
  const malformed = () => new ScriptedJevError('MALFORMED_RESPONSE');
  if (!record(raw) || raw.model !== DRIVEN_JEV_MODEL || !record(raw.answers) || !record(raw.usage) ||
      !Number.isFinite(latencyMs) || latencyMs < 0) throw malformed();
  const keys = Object.keys(raw.answers);
  if (keys.length !== 2 || !keys.includes('next_action') || !keys.includes('step_done')) throw malformed();
  const next = raw.answers.next_action;
  const done = raw.answers.step_done;
  if (!record(next) || next.type !== 'choice' || typeof next.choice !== 'string' || !lookupCandidate(set, next.choice) ||
      !probability(next.confidence) || !record(next.probabilities)) throw malformed();
  if (!record(done) || done.type !== 'noul' || !probability(done.noul)) throw malformed();
  const probabilities: Record<string, number> = {};
  for (const [key, value] of Object.entries(next.probabilities)) {
    if (!lookupCandidate(set, key) || !probability(value)) throw malformed();
    probabilities[key] = value;
  }
  if (!count(raw.usage.input_tokens) || !count(raw.usage.output_tokens)) throw malformed();
  return {
    choice: next.choice, confidence: next.confidence, probabilities, done: done.noul,
    inputTokens: raw.usage.input_tokens, latencyMs, model: DRIVEN_JEV_MODEL, options: set.candidates.length,
  };
}

/** Jev's likeliest picks, highest first (ties in key order), for a hand-back package. */
export function topChoices(probabilities: Readonly<Record<string, number>>, n = 3): { key: string; probability: number }[] {
  return Object.entries(probabilities)
    .sort(([a, p], [b, q]) => q - p || (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, n)
    .map(([key, probability]) => ({ key, probability }));
}

export function createDrivenJudge(options: { client?: Pick<TypeSafeClient, 'systemOne'> } = {}): DrivenJudge {
  let client: Pick<TypeSafeClient, 'systemOne'>;
  if (options.client) client = options.client;
  else {
    if (!process.env.TYPESAFE_API_KEY?.trim()) throw new ScriptedJevError('AUTH');
    try { client = new TypeSafeClient({ defaultModel: DRIVEN_JEV_MODEL, logLevel: 'warn' }); }
    catch (error) { throw scriptedRequestError(error); }
  }
  return {
    async decide(prepared, signal) {
      if (signal.aborted) throw new ScriptedJevError('ABORTED');
      const start = performance.now();
      let raw: unknown;
      try { raw = await client.systemOne(prepared.request, { signal }); }
      catch (error) { throw scriptedRequestError(error); }
      return parseDecision(raw, prepared.set, performance.now() - start);
    },
  };
}
