// Acceptance rules for a Jev decision in a driven (`do`) step: the one place the driven thresholds live.
//
// Thresholds come from the jev-drives spike protocol (spikes/jev-drives/protocol.md, "Thresholds and why"), approved
// by the owner as D0 and frozen before the run; they are never tuned against results. The risky-word net is E11.
// Pure: no Jev call, no device, no clock.
import type { Element } from '../contracts/index.js';
import { lookupCandidate, type CandidateAction, type CandidateSet } from './candidates.js';

/** What a `do` step is allowed to change, as the script declares it. Never sent to Jev. */
export type DrivenEffect = 'none' | 'test_write' | 'destructive';

/** The lowest Choice confidence Jev's pick needs, per effect. `destructive` steps are never accepted. */
export const CONFIDENCE_FLOOR = { none: 0.8, test_write: 0.9 } as const;
/** The "step done" Noul reads yes at or above this... */
export const DONE_YES = 0.9;
/** ...and no at or below this; anything between is uncertain. */
export const DONE_NO = 0.1;
/** E11: a pick on a control carrying one of these words (whole word, any case) always goes to Claude. */
export const RISKY_WORDS = ['Delete', 'Remove', 'Erase', 'Reset', 'Sign out', 'Unsubscribe', 'Pay'] as const;

/** Why a decision goes back to Claude; the codes hand-back packages carry. */
export type HandBackReason = 'LOW_CONFIDENCE' | 'NONE_FITS' | 'RISKY_ACTION' | 'DESTRUCTIVE_STEP';

export type Acceptance =
  | { kind: 'accept'; key: string; action: CandidateAction; element?: Element }
  | { kind: 'stepDone' }
  | { kind: 'handBack'; reason: HandBackReason };

export interface AcceptInput {
  effect: DrivenEffect;
  /** Jev's top choice: a key of `set`. */
  choice: string;
  /** The Choice confidence of that pick. */
  confidence: number;
  /** The "step done" Noul from the same request. */
  done: number;
  set: CandidateSet;
  /** The control the driver taps for `back`, when it taps one (the iOS navigation bar's back button); Android's Back
   *  key has none. A `back` pick is checked against it like a tap. */
  backTarget?: Element;
}

export function doneVerdict(noul: number): 'yes' | 'no' | 'uncertain' {
  return noul >= DONE_YES ? 'yes' : noul <= DONE_NO ? 'no' : 'uncertain';
}

/** Words as a person reads them: split on anything but letters and digits, and at camelCase humps. */
const words = (text: string): string =>
  ` ${text.replace(/(\p{Ll}|\p{N})(\p{Lu})/gu, '$1 $2').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).join(' ')} `;
const RISKY = RISKY_WORDS.map(word => words(word));

/** Whether the text holds a risky word as a whole word ("delete account" yes, "Deleted items" no). */
export function hasRiskyWord(text: string): boolean {
  const normalized = words(text);
  return RISKY.some(word => normalized.includes(word));
}

/** E11 reads the label, value and identifier. */
export function isRiskyElement(element: Element): boolean {
  return [element.label, element.value, element.identifier].some(text => text !== undefined && hasRiskyWord(text));
}

/**
 * Whether the bridge may act on Jev's decision. In order: a destructive step never; `none_fits` (or a key the set
 * never offered) goes back; a pick under the effect's floor goes back as low confidence, so the caller's target
 * search still runs; `step_done` also needs the done Noul at DONE_YES; a confident pick on a risky control goes back,
 * `back` included when the control it taps is risky.
 */
export function acceptDecision(input: AcceptInput): Acceptance {
  if (input.effect === 'destructive') return { kind: 'handBack', reason: 'DESTRUCTIVE_STEP' };
  const meaning = lookupCandidate(input.set, input.choice);
  if (!meaning || meaning.kind === 'none_fits') return { kind: 'handBack', reason: 'NONE_FITS' };
  if (!(input.confidence >= CONFIDENCE_FLOOR[input.effect])) return { kind: 'handBack', reason: 'LOW_CONFIDENCE' };
  if (meaning.kind === 'step_done') {
    return doneVerdict(input.done) === 'yes' ? { kind: 'stepDone' } : { kind: 'handBack', reason: 'LOW_CONFIDENCE' };
  }
  const control = meaning.element ?? (meaning.action.kind === 'back' ? input.backTarget : undefined);
  if (control && isRiskyElement(control)) return { kind: 'handBack', reason: 'RISKY_ACTION' };
  return {
    kind: 'accept', key: input.choice, action: meaning.action,
    ...(meaning.element ? { element: meaning.element } : {}),
  };
}
