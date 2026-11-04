import { CLAIM_ESTABLISHED_AT, CLAIM_REJECTED_AT } from '../../../src/scripted/run.js';

export type ClaimOutcome = 'correct' | 'uncertain' | 'confidently-wrong';
export type ScreenVerdict = 'passed' | 'failed' | 'inconclusive';

/**
 * How a judged claim compares with its frozen truth label. A true claim is established above the
 * established bound and rejected below the rejected bound; a false claim is the mirror.
 */
export function claimOutcome(truth: boolean, value: number): ClaimOutcome {
  if (truth) {
    if (value >= CLAIM_ESTABLISHED_AT) return 'correct';
    if (value <= CLAIM_REJECTED_AT) return 'confidently-wrong';
    return 'uncertain';
  }
  if (value <= CLAIM_REJECTED_AT) return 'correct';
  if (value >= CLAIM_ESTABLISHED_AT) return 'confidently-wrong';
  return 'uncertain';
}

/**
 * The scripted checkpoint rule, false wins: any rejected value fails the screen, any value below the
 * established bound leaves it inconclusive, otherwise it passes.
 */
export function screenVerdict(values: readonly number[]): ScreenVerdict {
  if (values.some(value => value <= CLAIM_REJECTED_AT)) return 'failed';
  if (values.some(value => value < CLAIM_ESTABLISHED_AT)) return 'inconclusive';
  return 'passed';
}

/** The verdict a screen carries when every claim is answered with its own truth label. */
export function expectedVerdict(truths: readonly boolean[]): 'passed' | 'failed' {
  return truths.some(truth => !truth) ? 'failed' : 'passed';
}
