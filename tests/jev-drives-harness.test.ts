import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRequest, kindOf, loadCases, score, type Answer, type SpikeCase } from '../spikes/jev-drives/harness.js';
import { buildCandidates, loadCapture } from '../spikes/jev-drives/candidates.js';
import { join } from 'node:path';
import { root, screenText } from '../spikes/jev-drives/harness.js';

const answer = (choice: string, confidence: number, done = 0.5): Answer =>
  ({ choice, confidence, probabilities: {}, done, inputTokens: 1, latencyMs: 1 });
const base: SpikeCase = {
  id: 'x', app: 'A', platform: 'ios', capture: '', goal: 'g', step: 's', doneWhen: 'd', values: {}, effect: 'none',
  history: [], expectedAction: 'tap:e1', alsoRight: ['tap:e2'], expectedDone: false, traps: ['routine'], rationale: 'r',
};

test('no request carries the effect, the expected answers, the traps or the rationale', () => {
  for (const c of loadCases()) {
    const candidates = buildCandidates(loadCapture(join(root, c.capture), c.platform), { values: c.values }).candidates;
    const body = JSON.stringify(buildRequest(c, screenText(c), candidates));
    for (const forbidden of ['"effect"', 'expectedAction', 'alsoRight', 'expectedDone', 'rationale', '"traps"', 'destructive', 'test_write']) {
      assert.ok(!body.includes(forbidden), `${c.id}: request leaks ${forbidden}`);
    }
    assert.ok(!body.includes(c.rationale), `${c.id}: rationale text leaked`);
  }
});

test('a right pick above the floor is handled; below it is a hand-back', () => {
  assert.deepEqual(score(base, answer('tap:e2', 0.81)), { right: true, accepted: true, wrongAccepted: false, handled: true, doneVerdict: 'uncertain', doneRight: false });
  assert.equal(score(base, answer('tap:e1', 0.79)).accepted, false);
});

test('a wrong pick above the floor is a wrong accepted pick', () => {
  assert.equal(score(base, answer('tap:e9', 0.95)).wrongAccepted, true);
});

test('test writes need 0.90; destructive is never accepted', () => {
  const write = { ...base, effect: 'test_write' as const };
  assert.equal(score(write, answer('tap:e1', 0.89)).accepted, false);
  assert.equal(score(write, answer('tap:e1', 0.9)).handled, true);
  const destructive = { ...base, effect: 'destructive' as const, expectedAction: 'none_fits', alsoRight: ['tap:e1'] };
  assert.equal(kindOf(destructive), 'hand_back');
  const s = score(destructive, answer('tap:e1', 0.99));
  assert.equal(s.right, true);
  assert.equal(s.accepted, false);
  assert.equal(s.handled, false);
});

test('step_done needs the done Noul too; a premature step_done is wrong', () => {
  const done = { ...base, expectedAction: 'step_done', alsoRight: [], expectedDone: true };
  assert.equal(score(done, answer('step_done', 0.9, 0.95)).handled, true);
  assert.equal(score(done, answer('step_done', 0.9, 0.5)).accepted, false);
  const notDone = { ...base, traps: ['unsaved_form'] };
  assert.equal(score(notDone, answer('step_done', 0.9, 0.95)).wrongAccepted, true);
});

test('an accepted action on a hand-back case is wrong', () => {
  const prompt = { ...base, expectedAction: 'none_fits', alsoRight: [] };
  assert.equal(score(prompt, answer('tap:e1', 0.9)).wrongAccepted, true);
  assert.equal(score(prompt, answer('none_fits', 0.9)).accepted, false);
});

test('a failed request scores as nothing', () => {
  assert.deepEqual(score(base, undefined), { right: false, accepted: false, wrongAccepted: false, handled: false, doneVerdict: 'uncertain', doneRight: false });
});
