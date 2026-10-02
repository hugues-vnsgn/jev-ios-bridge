import assert from 'node:assert/strict';
import test from 'node:test';
import type { Element } from '../src/contracts/index.js';
import { buildCandidates } from '../src/driven/candidates.js';
import {
  CONFIDENCE_FLOOR, DONE_NO, DONE_YES, RISKY_WORDS, WRITE_WORDS, acceptDecision, doneVerdict, hasRiskyWord, hasWriteWord,
  isRiskyElement, type AcceptInput,
} from '../src/driven/policy.js';

const el = (ref: string, role: string, extra: Partial<Element> = {}): Element => ({
  ref, role, frame: { x: 0, y: 0, width: 10, height: 10 }, state: { enabled: true, visible: true }, actions: ['tap'], ...extra,
});
const set = buildCandidates([
  el('e1', 'button', { label: 'Details' }),
  el('e2', 'button', { label: 'Delete account' }),
  el('e3', 'text-field', { label: 'Name', actions: ['tap', 'typeText'] }),
  el('e4', 'button', { label: 'More', identifier: 'btn_sign_out' }),
  el('e5', 'cell', { label: 'Inbox', value: 'Remove' }),
  el('e6', 'cell', { label: 'Deleted items' }),
  el('e7', 'button', { label: 'Approve' }),
  el('e8', 'button', { label: 'Send message' }),
  el('e9', 'button', { label: 'Continue', identifier: 'form.submit' }),
  el('e10', 'cell', { label: 'Saved items' }),
  el('e11', 'tab', { label: 'Posts' }),
  el('e12', 'button', { label: 'Save' }),
], ['name']);
const input = (extra: Partial<AcceptInput>): AcceptInput =>
  ({ effect: 'none', choice: 'tap:e1', confidence: 0.95, done: 0.5, set, ...extra });

test('the thresholds are the approved constants', () => {
  assert.deepEqual(CONFIDENCE_FLOOR, { none: 0.8, test_write: 0.9 });
  assert.equal(DONE_YES, 0.9);
  assert.equal(DONE_NO, 0.1);
  assert.deepEqual(RISKY_WORDS, ['Delete', 'Remove', 'Erase', 'Reset', 'Sign out', 'Unsubscribe', 'Pay']);
});

test('a none-effect pick is accepted at 0.80, not at 0.79', () => {
  assert.deepEqual(acceptDecision(input({ confidence: 0.8 })),
    { kind: 'accept', key: 'tap:e1', action: { kind: 'tap', targetRef: 'e1' }, element: el('e1', 'button', { label: 'Details' }) });
  assert.deepEqual(acceptDecision(input({ confidence: 0.79 })), { kind: 'handBack', reason: 'LOW_CONFIDENCE' });
});

test('a test_write pick is accepted at 0.90, not at 0.89', () => {
  assert.equal(acceptDecision(input({ effect: 'test_write', confidence: 0.9 })).kind, 'accept');
  assert.deepEqual(acceptDecision(input({ effect: 'test_write', confidence: 0.89 })), { kind: 'handBack', reason: 'LOW_CONFIDENCE' });
});

test('a type pick and the fixed actions are accepted with their action', () => {
  const typed = acceptDecision(input({ choice: 'type:e3:name' }));
  assert.equal(typed.kind, 'accept');
  assert.deepEqual(typed.kind === 'accept' && typed.action, { kind: 'type', targetRef: 'e3', valueKey: 'name' });
  for (const [choice, action] of [
    ['scroll:down', { kind: 'scroll', direction: 'down' }], ['scroll:up', { kind: 'scroll', direction: 'up' }], ['back', { kind: 'back' }],
  ] as const) {
    assert.deepEqual(acceptDecision(input({ choice })), { kind: 'accept', key: choice, action });
  }
});

test('a destructive step is never accepted, at any confidence and for any choice', () => {
  for (const choice of ['tap:e1', 'step_done', 'none_fits', 'back']) {
    assert.deepEqual(acceptDecision(input({ effect: 'destructive', choice, confidence: 1, done: 1 })),
      { kind: 'handBack', reason: 'DESTRUCTIVE_STEP' });
  }
});

test('none_fits always hands back, however confident', () => {
  assert.deepEqual(acceptDecision(input({ choice: 'none_fits', confidence: 1 })), { kind: 'handBack', reason: 'NONE_FITS' });
});

test('a key the set never offered hands back as NONE_FITS', () => {
  assert.deepEqual(acceptDecision(input({ choice: 'tap:e99' })), { kind: 'handBack', reason: 'NONE_FITS' });
});

test('step_done needs the choice floor and the done Noul at 0.90', () => {
  assert.deepEqual(acceptDecision(input({ choice: 'step_done', confidence: 0.8, done: 0.9 })), { kind: 'stepDone' });
  assert.deepEqual(acceptDecision(input({ choice: 'step_done', confidence: 0.8, done: 0.89 })), { kind: 'handBack', reason: 'LOW_CONFIDENCE' });
  assert.deepEqual(acceptDecision(input({ choice: 'step_done', confidence: 0.79, done: 1 })), { kind: 'handBack', reason: 'LOW_CONFIDENCE' });
  assert.deepEqual(acceptDecision(input({ effect: 'test_write', choice: 'step_done', confidence: 0.89, done: 1 })), { kind: 'handBack', reason: 'LOW_CONFIDENCE' });
  assert.deepEqual(acceptDecision(input({ effect: 'test_write', choice: 'step_done', confidence: 0.9, done: 0.9 })), { kind: 'stepDone' });
});

test('a confident pick on a risky-word control is never accepted', () => {
  for (const choice of ['tap:e2', 'tap:e4', 'tap:e5']) {
    assert.deepEqual(acceptDecision(input({ choice, confidence: 1 })), { kind: 'handBack', reason: 'RISKY_ACTION' }, choice);
  }
  assert.equal(acceptDecision(input({ choice: 'tap:e6', confidence: 1 })).kind, 'accept', '"Deleted items" is not risky');
});

test('in a read-only step, a confident pick on a write control hands back as RISKY_ACTION', () => {
  for (const choice of ['tap:e7', 'tap:e8', 'tap:e9', 'tap:e12']) {
    assert.deepEqual(acceptDecision(input({ choice, confidence: 1 })), { kind: 'handBack', reason: 'RISKY_ACTION' }, choice);
  }
  for (const choice of ['tap:e10', 'tap:e11']) {
    assert.equal(acceptDecision(input({ choice, confidence: 1 })).kind, 'accept', `${choice} has no whole write word`);
  }
});

test('a test_write step takes a pick on a write control at its floor', () => {
  for (const choice of ['tap:e7', 'tap:e8', 'tap:e9', 'tap:e12']) {
    assert.equal(acceptDecision(input({ effect: 'test_write', choice, confidence: 0.9 })).kind, 'accept', choice);
  }
});

test('the write words are the approved list, matched as whole words like the risky words', () => {
  assert.deepEqual(WRITE_WORDS, ['Approve', 'Reject', 'Send', 'Submit', 'Confirm', 'Save', 'Publish', 'Post']);
  for (const text of ['Approve', 'REJECT', 'Send now', 'submitButton', 'btn_confirm', 'Save', 'Publish', 'Post']) {
    assert.equal(hasWriteWord(text), true, text);
  }
  for (const text of ['Approved', 'Sender', 'Saved items', 'Posts', 'Confirmation', 'Submitted', '']) {
    assert.equal(hasWriteWord(text), false, text);
  }
});

test('a low-confidence risky pick hands back as LOW_CONFIDENCE, so the target search still runs', () => {
  assert.deepEqual(acceptDecision(input({ choice: 'tap:e2', confidence: 0.5 })), { kind: 'handBack', reason: 'LOW_CONFIDENCE' });
});

test('risky words match whole words, case-insensitively, across separators and camelCase', () => {
  for (const text of ['Delete', 'delete account', 'DELETE', 'Sign out', 'sign  OUT now', 'signOutButton', 'btn_sign_out',
    'delete-row', 'deleteButton', 'Pay', 'Pay now', 'Erase all', 'Factory reset', 'Unsubscribe', 'Remove…']) {
    assert.equal(hasRiskyWord(text), true, text);
  }
  for (const text of ['Deleted items', 'Payment', 'Repay', 'Resetting', 'Signout', 'Sign outside', 'Removed', 'Erased', 'Unsubscribed', '']) {
    assert.equal(hasRiskyWord(text), false, text);
  }
});

test('the risky net reads the label, the value and the identifier, not the role or placeholder', () => {
  assert.equal(isRiskyElement(el('a', 'button', { label: 'Remove' })), true);
  assert.equal(isRiskyElement(el('a', 'cell', { value: 'Erase' })), true);
  assert.equal(isRiskyElement(el('a', 'button', { identifier: 'resetButton' })), true);
  assert.equal(isRiskyElement(el('a', 'delete', { label: 'Open' })), false);
  assert.equal(isRiskyElement(el('a', 'text-field', { placeholder: 'Pay' })), false);
});

test('the done Noul reads yes at 0.90, no at 0.10, uncertain between', () => {
  assert.equal(doneVerdict(0.9), 'yes');
  assert.equal(doneVerdict(0.89), 'uncertain');
  assert.equal(doneVerdict(0.11), 'uncertain');
  assert.equal(doneVerdict(0.1), 'no');
  assert.equal(doneVerdict(0), 'no');
  assert.equal(doneVerdict(1), 'yes');
});
