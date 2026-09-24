import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import type { Assertion, Snapshot } from '../src/contracts/index.js';
import { buildAssertionRequest, createAssertionJudge, parseAssertionResult, ScriptedJevError } from '../spikes/scripted/jev.js';
import { renderAssertionState, ScriptedObservationError } from '../spikes/scripted/observe.js';

const assertions: Assertion[] = [
  { id: 'a', claim: 'The saved card visibly shows Berlin.' },
  { id: 'b', claim: 'The saved card visibly shows Paris.' },
];
const snapshot: Snapshot = {
  deviceId: 'sim', capturedAt: 1_700_000_000_000, expiresAt: 1_700_000_060_000,
  sequence: 5, truncated: false, screenshotPath: '/private/screen.jpg',
  elements: [
    { ref: 'e1', role: 'text', label: 'Berlin', actions: [] },
    { ref: 'e2', role: 'button', label: 'Save', state: { enabled: false, visible: true }, actions: ['tap'] },
    { ref: 'e3', role: 'status-bar', label: '9:41', actions: [] },
    { ref: 'e4', role: 'text', label: 'Hidden secret', state: { enabled: true, visible: false }, actions: [] },
    { ref: 'e5', role: 'other', frame: { x: 0, y: 0, width: 300, height: 500 }, actions: [] },
  ],
};
const response = () => ({ model: 'jev-1.13.0', usage: { input_tokens: 42, output_tokens: 2 }, answers: {
  'assertion:a': { type: 'noul', noul: 0.97 }, 'assertion:b': { type: 'noul', noul: 0.02 },
} });

test('assertion projection keeps visible evidence and excludes screenshot, refs, empty containers, and hidden text', () => {
  const state = renderAssertionState(snapshot);
  assert.match(state, /Berlin/);
  assert.match(state, /Save/);
  assert.match(state, /"enabled":false/);
  assert.doesNotMatch(state, /screen\.jpg|Hidden secret|9:41|ref|"width":300/);
  assert.throws(() => renderAssertionState({ ...snapshot, truncated: true }),
    (error: unknown) => error instanceof ScriptedObservationError && error.code === 'TRUNCATED');
  assert.throws(() => renderAssertionState({ ...snapshot, elements: [{ ref: 'e6', role: 'text', label: 'x'.repeat(25_000), actions: [] }] }),
    (error: unknown) => error instanceof ScriptedObservationError && error.code === 'STATE_BUDGET');
});

test('request contains only neutral a/b Noul questions and current claims, never truth labels or action choices', () => {
  const labeled = [
    { ...assertions[0]!, expected: true, rationale: 'oracle says true' },
    { ...assertions[1]!, expected: false, rationale: 'oracle says false' },
  ];
  const request = buildAssertionRequest(labeled.map(({ id, claim }) => ({ id, claim })), renderAssertionState(snapshot));
  assert.deepEqual(Object.keys(request.questions), ['assertion:a', 'assertion:b']);
  assert.ok(Object.values(request.questions).every(question => question.type === 'noul'));
  assert.doesNotMatch(JSON.stringify(request), /next_action|goal_reached|oracle says|"expected"|rationale|screen\.jpg/);
  assert.throws(() => buildAssertionRequest(assertions, 'x'.repeat(28_000)),
    (error: unknown) => error instanceof ScriptedJevError && error.code === 'REQUEST_BUDGET');
});

test('strict response parser rejects extra answers, wrong model, and invalid probabilities', () => {
  const valid = parseAssertionResult(response(), assertions, 12);
  assert.deepEqual(valid.probabilities, { a: 0.97, b: 0.02 });
  assert.equal(valid.inputTokens, 42);
  const extra = { ...response(), answers: { ...response().answers, next_action: { type: 'choice' } } };
  assert.throws(() => parseAssertionResult(extra, assertions, 12),
    (error: unknown) => error instanceof ScriptedJevError && error.code === 'MALFORMED_RESPONSE');
  assert.throws(() => parseAssertionResult({ ...response(), model: 'other' }, assertions, 12));
  assert.throws(() => parseAssertionResult({ ...response(), answers: {
    ...response().answers, 'assertion:a': { type: 'noul', noul: Number.NaN },
  } }, assertions, 12));
});

test('assertion judge uses the injected pinned SDK client and sanitizes transport errors', async () => {
  let capturedSignal: AbortSignal | undefined;
  const client = new TypeSafeClient({ apiKey: 'synthetic-test-key', retry: { maxRetries: 0 },
    fetch: async (_input, init) => {
      capturedSignal = init?.signal as AbortSignal;
      return new Response(JSON.stringify(response()), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const signal = new AbortController().signal;
  const judge = createAssertionJudge({ client });
  const result = await judge.judge(assertions, renderAssertionState(snapshot), signal);
  assert.equal(result.probabilities.a, 0.97);
  assert.ok(capturedSignal);

  const failing = new TypeSafeClient({ apiKey: 'synthetic-test-key', retry: { maxRetries: 0 },
    fetch: async () => { throw new Error('raw private transport details'); },
  });
  await assert.rejects(createAssertionJudge({ client: failing }).judge(assertions, renderAssertionState(snapshot), signal),
    (error: unknown) => error instanceof ScriptedJevError && error.code === 'NETWORK' && !error.message.includes('private'));
});
