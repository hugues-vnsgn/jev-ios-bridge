import assert from 'node:assert/strict';
import test from 'node:test';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import type { Snapshot } from '../src/contracts/index.js';
import type { Observation, Scenario } from '../spikes/legacy/contracts.js';
import { buildJevRequest, createJevJudge, JevContractError, JevRequestError, parseJevResult, V2_WORDING, V3_WORDING } from '../spikes/legacy/jev.js';
import { buildObservation } from '../spikes/legacy/observation.js';

const scenario: Scenario = {
  goal: 'Open the synthetic result', app: { bundleId: 'test.app' },
  assertions: [{ id: 'visible', claim: 'The result is visible' }], values: {},
};
const snapshot: Snapshot = {
  deviceId: 'sim', capturedAt: 1_700_000_000_000, expiresAt: 1_700_000_060_000,
  sequence: 1, truncated: false, screenshotPath: '/private/screen.jpg',
  elements: [{ ref: 'e1', role: 'button', label: 'Result', actions: ['tap'] }],
};
const observation: Observation = buildObservation(scenario, snapshot);
function response() {
  const probabilities = Object.fromEntries(observation.options.map(option => [option.id, option.id === 'tap:e1' ? 1 : 0]));
  return { model: 'jev-1.13.0', usage: { input_tokens: 42, output_tokens: 3 }, answers: {
    next_action: { type: 'choice', choice: 'tap:e1', confidence: 0.95, probabilities },
    goal_reached: { type: 'noul', noul: 0.02 },
    'assertion:visible': { type: 'noul', noul: 0.05 },
  } };
}

test('request sends text only, complete options, and independent assertion questions', () => {
  const request = buildJevRequest(scenario, observation);
  assert.equal(request.model, 'jev-1.13.0');
  assert.equal(request.questions.next_action?.type, 'choice');
  assert.equal(request.questions.goal_reached?.type, 'noul');
  assert.equal(request.questions['assertion:visible']?.type, 'noul');
  assert.doesNotMatch(JSON.stringify(request), /screen\.jpg/);
  assert.deepEqual(Object.keys((request.questions.next_action as { criteria: Record<string, unknown> }).criteria), observation.options.map(option => option.id));
});

test('v2 wording prioritizes blocking prompts and visible end-state evidence', () => {
  const request = buildJevRequest(scenario, observation, V2_WORDING);
  const action = request.questions.next_action as { instructions: string };
  const goal = request.questions.goal_reached as { instructions: string };
  assert.match(action.instructions, /blocking setup or permission prompt/i);
  assert.match(action.instructions, /do not tap.*read/i);
  assert.match(action.instructions, /entire requested end state/i);
  assert.match(goal.instructions, /named.*visible/i);
});

test('v3 wording asks for current checkpoint state without a generic dialog priority', () => {
  const request = buildJevRequest(scenario, observation, V3_WORDING);
  const action = request.questions.next_action as { instructions: string };
  const goal = request.questions.goal_reached as { instructions: string };
  assert.match(action.instructions, /current checkpoint.*desired screen state/i);
  assert.match(action.instructions, /stop-goal.*visibly holds now/i);
  assert.match(action.instructions, /stop-blocked.*explicit.*empty-result/i);
  assert.match(action.instructions, /none.*no supported action fits/i);
  assert.doesNotMatch(action.instructions, /blocking setup or permission prompt before/i);
  assert.match(goal.instructions, /current checkpoint.*desired screen state/i);
  assert.doesNotMatch(goal.instructions, /overall scenario|historical action/i);
});

test('response parser validates option distribution, model and Noul shape', () => {
  const valid = parseJevResult(response(), scenario, observation, 12);
  assert.equal(valid.choice, 'tap:e1');
  assert.equal(valid.assertions.visible, 0.05);
  assert.equal(valid.inputTokens, 42);
  const bad = response();
  bad.answers.next_action.probabilities['tap:e1'] = Number.NaN;
  assert.throws(() => parseJevResult(bad, scenario, observation, 12),
    (error: unknown) => error instanceof JevContractError && error.code === 'MALFORMED_RESPONSE' && error.message === 'MALFORMED_RESPONSE');
});

test('judge passes abort signal through SDK and does not expose raw transport errors', async () => {
  let capturedSignal: AbortSignal | undefined;
  const client = new TypeSafeClient({ apiKey: 'synthetic-test-key', retry: { maxRetries: 0 },
    fetch: async (_input, init) => {
      capturedSignal = init?.signal as AbortSignal;
      return new Response(JSON.stringify(response()), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const controller = new AbortController();
  const judgment = await createJevJudge({ client }).judge(scenario, observation, controller.signal);
  assert.equal(judgment.choice, 'tap:e1');
  assert.ok(capturedSignal);

  const failing = new TypeSafeClient({ apiKey: 'synthetic-test-key', retry: { maxRetries: 0 },
    fetch: async () => { throw new Error('sensitive raw transport details'); },
  });
  await assert.rejects(createJevJudge({ client: failing }).judge(scenario, observation, new AbortController().signal),
    (error: unknown) => error instanceof JevRequestError && error.code === 'NETWORK' && !error.message.includes('sensitive'));
  controller.abort();
  await assert.rejects(createJevJudge({ client }).judge(scenario, observation, controller.signal),
    (error: unknown) => error instanceof JevRequestError && error.code === 'ABORTED');
});

test('judge factory rejects a missing API key before any judgment or device work', () => {
  const previous = process.env.TYPESAFE_API_KEY;
  try {
    delete process.env.TYPESAFE_API_KEY;
    assert.throws(() => createJevJudge(),
      (error: unknown) => error instanceof JevRequestError && error.code === 'AUTH' && error.message === 'AUTH');
    const injected = new TypeSafeClient({ apiKey: 'synthetic-test-key', fetch: async () => new Response(JSON.stringify(response())) });
    assert.ok(createJevJudge({ client: injected }));
  } finally {
    if (previous === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previous;
  }
});

test('judge factory reuses one SDK client across judgments', async (t) => {
  const previous = process.env.TYPESAFE_API_KEY;
  const clients = new Set<TypeSafeClient>();
  try {
    process.env.TYPESAFE_API_KEY = 'synthetic-test-key';
    t.mock.method(TypeSafeClient.prototype, 'systemOne', function (this: TypeSafeClient) {
      clients.add(this);
      return Promise.resolve(response());
    } as unknown as TypeSafeClient['systemOne']);
    const judge = createJevJudge();
    await judge.judge(scenario, observation, new AbortController().signal);
    await judge.judge(scenario, observation, new AbortController().signal);
    assert.equal(clients.size, 1);
  } finally {
    if (previous === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previous;
  }
});
