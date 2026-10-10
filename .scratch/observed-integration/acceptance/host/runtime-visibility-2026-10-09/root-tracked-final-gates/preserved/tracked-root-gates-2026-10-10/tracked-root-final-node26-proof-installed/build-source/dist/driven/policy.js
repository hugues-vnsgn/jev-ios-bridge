import { lookupCandidate } from './candidates.js';
/** The lowest Choice confidence Jev's pick needs, per effect. `destructive` steps are never accepted. */
export const CONFIDENCE_FLOOR = { none: 0.8, test_write: 0.9 };
/** The "step done" Noul reads yes at or above this... */
export const DONE_YES = 0.9;
/** ...and no at or below this; anything between is uncertain. */
export const DONE_NO = 0.1;
/** E11: a pick on a control carrying one of these words (whole word, any case) always goes to Claude. */
export const RISKY_WORDS = ['Delete', 'Remove', 'Erase', 'Reset', 'Sign out', 'Unsubscribe', 'Pay'];
/** In a read-only (`effect: none`) step, a pick on a control carrying one of these words also goes to Claude: the step
 *  promised no writes, and these commit one. A `test_write` step may write, and its preflight guards it. */
export const WRITE_WORDS = ['Approve', 'Reject', 'Send', 'Submit', 'Confirm', 'Save', 'Publish', 'Post'];
export function doneVerdict(noul) {
    return noul >= DONE_YES ? 'yes' : noul <= DONE_NO ? 'no' : 'uncertain';
}
/** Words as a person reads them: split on anything but letters and digits, and at camelCase humps. */
const words = (text) => ` ${text.replace(/(\p{Ll}|\p{N})(\p{Lu})/gu, '$1 $2').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).join(' ')} `;
const RISKY = RISKY_WORDS.map(word => words(word));
const WRITES = WRITE_WORDS.map(word => words(word));
const holdsAny = (list) => (text) => {
    const normalized = words(text);
    return list.some(word => normalized.includes(word));
};
/** Whether the text holds a risky word as a whole word ("delete account" yes, "Deleted items" no). */
export const hasRiskyWord = holdsAny(RISKY);
/** Whether the text holds a write word as a whole word ("Send message" yes, "Sender" no). */
export const hasWriteWord = holdsAny(WRITES);
const readsAny = (test) => (element) => [element.label, element.value, element.identifier].some(text => text !== undefined && test(text));
/** E11 reads the label, value and identifier. */
export const isRiskyElement = readsAny(hasRiskyWord);
/** The write-word net reads the same fields. */
export const isWriteElement = readsAny(hasWriteWord);
/**
 * Whether the bridge may act on Jev's decision. In order: a destructive step never; `none_fits` (or a key the set
 * never offered) goes back; a pick under the effect's floor goes back as low confidence, so the caller's target
 * search still runs; `step_done` also needs the done Noul at DONE_YES; a confident pick on a risky control goes back,
 * `back` included when the control it taps is risky, and so does one on a write control in a read-only step.
 */
export function acceptDecision(input) {
    if (input.effect === 'destructive')
        return { kind: 'handBack', reason: 'DESTRUCTIVE_STEP' };
    const meaning = lookupCandidate(input.set, input.choice);
    if (!meaning || meaning.kind === 'none_fits')
        return { kind: 'handBack', reason: 'NONE_FITS' };
    if (!(input.confidence >= CONFIDENCE_FLOOR[input.effect]))
        return { kind: 'handBack', reason: 'LOW_CONFIDENCE' };
    if (meaning.kind === 'step_done') {
        return doneVerdict(input.done) === 'yes' ? { kind: 'stepDone' } : { kind: 'handBack', reason: 'LOW_CONFIDENCE' };
    }
    const control = meaning.element ?? (meaning.action.kind === 'back' ? input.backTarget : undefined);
    if (control && isRiskyElement(control))
        return { kind: 'handBack', reason: 'RISKY_ACTION' };
    if (control && input.effect === 'none' && isWriteElement(control))
        return { kind: 'handBack', reason: 'RISKY_ACTION' };
    return {
        kind: 'accept', key: input.choice, action: meaning.action,
        ...(meaning.element ? { element: meaning.element } : {}),
    };
}
