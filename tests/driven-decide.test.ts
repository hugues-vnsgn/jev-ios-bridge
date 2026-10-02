import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import type { Element, Snapshot } from '../src/contracts/index.js';
import {
  NEXT_ACTION_QUESTION, STEP_DONE_QUESTION, createDrivenJudge, maskValues, parseDecision, prepareDecision, topChoices,
  type DecisionInput,
} from '../src/driven/decide.js';
import { acceptDecision } from '../src/driven/policy.js';
import { ScriptedJevError } from '../src/scripted/jev.js';
import { ScriptedObservationError } from '../src/scripted/observe.js';
import { loadCapture } from '../spikes/jev-drives/candidates.js';
import { loadCases, root } from '../spikes/jev-drives/harness.js';
import { fakeDrivenJudge } from './fixtures/driven-judge.js';

const el = (ref: string, role: string, extra: Partial<Element> = {}): Element => ({
  ref, role, frame: { x: 0, y: 0, width: 10, height: 10 }, state: { enabled: true, visible: true }, actions: ['tap'], ...extra,
});
const snap = (elements: Element[]): Snapshot =>
  ({ deviceId: 'sim', capturedAt: 1, expiresAt: 2, sequence: 1, truncated: false, elements, screenshotPath: '/private/s.jpg' });
const base: DecisionInput = {
  goal: 'Create a list called Groceries.',
  intent: 'Type the list name.',
  doneWhen: 'The name field shows the list name.',
  snapshot: snap([
    el('e1', 'button', { label: 'Create' }),
    el('e2', 'text-field', { label: 'Name', value: 'Groc', actions: ['tap', 'typeText'] }),
  ]),
  platform: 'android',
  valueKeys: ['listName'],
  values: { listName: 'Groceries' },
  recentActions: ['Opened the app.', 'Tapped the add button.', 'Typed Groceries into the name field.'],
};
const reply = (choice: string, confidence = 0.95, done = 0.02, extra: Record<string, unknown> = {}) => ({
  model: 'jev-1.13.0', usage: { input_tokens: 700, output_tokens: 3 },
  answers: {
    next_action: { type: 'choice', choice, confidence, probabilities: { [choice]: confidence, none_fits: 1 - confidence } },
    step_done: { type: 'noul', noul: done },
  },
  ...extra,
});

test('the request is one Choice over the candidates and one step-done Noul, with the spike wording', () => {
  const { set, request } = prepareDecision(base);
  assert.equal(request.model, 'jev-1.13.0');
  assert.deepEqual(Object.keys(request.questions), ['next_action', 'step_done']);
  const next = request.questions.next_action as unknown as { type: string; criteria: Record<string, string> };
  assert.equal(next.type, 'choice');
  assert.deepEqual(Object.keys(next.criteria), set.candidates.map(c => c.key));
  const body = JSON.stringify(request.questions);
  assert.ok(body.includes(JSON.stringify(NEXT_ACTION_QUESTION).slice(1, -1)));
  assert.ok(body.includes(JSON.stringify(STEP_DONE_QUESTION).slice(1, -1)));
  assert.equal((request.questions.step_done as { type: string }).type, 'noul');
});

test('the state is goal, step, done-when, masked plan values, the last 2 actions and the rendered screen', () => {
  const { request } = prepareDecision(base);
  const state = request.state as Record<string, unknown>;
  assert.deepEqual(Object.keys(state), ['goal', 'current_step', 'done_when', 'plan_values', 'recent_actions', 'screen']);
  assert.equal(state.goal, 'Create a list called ⟦value:listName⟧.', 'the goal is masked too');
  assert.equal(state.current_step, base.intent);
  assert.equal(state.done_when, base.doneWhen);
  assert.deepEqual(state.plan_values, { listName: '⟦value:listName⟧' });
  assert.deepEqual(state.recent_actions, ['Tapped the add button.', 'Typed ⟦value:listName⟧ into the name field.']);
  assert.match(state.screen as string, /^Current Android screen \(full accessibility capture\):/);
  assert.doesNotMatch(JSON.stringify(request), /private\/s\.jpg/);
});

test('without a goal the step intent stands in', () => {
  const { goal: _goal, ...noGoal } = base;
  assert.equal((prepareDecision(noGoal).request.state as Record<string, unknown>).goal, base.intent);
});

test('every typed value is masked in the screen, the option descriptions and the actions; keys stay real', () => {
  const input: DecisionInput = {
    ...base,
    goal: 'Log in as hugues@example.com.',
    snapshot: snap([
      el('e1', 'text-field', { label: 'Email', value: 'hugues@example.com', actions: ['tap', 'typeText'] }),
      el('e2', 'text', { label: 'Signed in as hugues@example.com' }),
      el('e3', 'text-field', { label: 'Password', value: 's3cr3t "quoted"', actions: ['tap', 'typeText'] }),
    ]),
    valueKeys: ['email'],
    values: { email: 'hugues@example.com', password: 's3cr3t "quoted"', empty: '' },
    recentActions: ['Typed s3cr3t "quoted" into Password.'],
  };
  const { set, request } = prepareDecision(input);
  const body = JSON.stringify(request);
  assert.ok(!body.includes('hugues@example.com'));
  assert.ok(!body.includes('s3cr3t'));
  assert.ok(body.includes('⟦value:email⟧'));
  assert.ok(body.includes('⟦value:password⟧'));
  assert.deepEqual((request.state as Record<string, unknown>).plan_values, { email: '⟦value:email⟧' });
  // The set keeps the real elements, so acting and the risky-word net see the screen as it is.
  const meaning = set.meanings.get('tap:e1');
  assert.equal(meaning?.kind === 'action' && meaning.element?.value, 'hugues@example.com');
  assert.ok(set.candidates.every(c => !c.description.includes('hugues@example.com')));
});

test('masking is one pass, longest value first, and never re-masks a marker', () => {
  assert.equal(maskValues('pin 1234, code 12', { short: '12', long: '1234' }), 'pin ⟦value:long⟧, code ⟦value:short⟧');
  assert.equal(maskValues('a value here', { v: 'value' }), 'a ⟦value:v⟧ here');
  assert.equal(maskValues('the value', { a: 'value', b: ':', c: 'a' }), 'the ⟦value:a⟧');
  assert.equal(maskValues('k', { k: 'k' }), '⟦value:k⟧');
  assert.equal(maskValues('nothing to hide', {}), 'nothing to hide');
  assert.equal(maskValues('spaces', { blank: '   ', empty: '' }), 'spaces');
  assert.equal(maskValues('a.b*c a-b', { dots: 'a.b*c' }), '⟦value:dots⟧ a-b');
});

test('the request never carries the effect or any label field, on every spike case', () => {
  for (const c of loadCases()) {
    const elements = loadCapture(join(root, c.capture), c.platform);
    const input: DecisionInput = {
      goal: c.goal, intent: c.step, doneWhen: c.doneWhen, snapshot: snap(elements), platform: c.platform,
      valueKeys: Object.keys(c.values), values: c.values, recentActions: c.history,
    };
    // The case object itself rides along, as a careless caller might pass it: nothing extra may reach the request.
    const body = JSON.stringify(prepareDecision({ ...c, ...input } as DecisionInput).request);
    for (const forbidden of ['"effect"', 'expectedAction', 'alsoRight', 'expectedDone', 'rationale', '"traps"', 'destructive', 'test_write']) {
      assert.ok(!body.includes(forbidden), `${c.id}: request leaks ${forbidden}`);
    }
    assert.ok(!body.includes(c.rationale), `${c.id}: rationale text leaked`);
    for (const value of Object.values(c.values)) assert.ok(!body.includes(value), `${c.id}: plan value leaked`);
  }
});

test('a request over 28,000 bytes of state and question, or 56,000 in all, is refused', () => {
  const big = (n: number) => snap(Array.from({ length: n }, (_, i) => el(`e${i}`, 'button', { label: `Row number ${i} ${'x'.repeat(60)}` })));
  assert.doesNotThrow(() => prepareDecision({ ...base, snapshot: big(20) }));
  assert.throws(() => prepareDecision({ ...base, snapshot: big(120) }),
    (error: unknown) => error instanceof ScriptedJevError && error.code === 'REQUEST_BUDGET');
});

test('a truncated or empty screen fails as an observation error before any request', () => {
  assert.throws(() => prepareDecision({ ...base, snapshot: { ...base.snapshot, truncated: true } }),
    (error: unknown) => error instanceof ScriptedObservationError && error.code === 'TRUNCATED');
  assert.throws(() => prepareDecision({ ...base, snapshot: snap([]) }),
    (error: unknown) => error instanceof ScriptedObservationError && error.code === 'EMPTY_SCREEN');
});

test('blank step text is invalid input', () => {
  for (const bad of [{ intent: ' ' }, { doneWhen: '' }]) {
    assert.throws(() => prepareDecision({ ...base, ...bad }),
      (error: unknown) => error instanceof ScriptedJevError && error.code === 'INVALID_INPUT');
  }
});

test('a well-formed answer parses into the decision', () => {
  const { set } = prepareDecision(base);
  const decision = parseDecision(reply('type:e2:listName', 0.93, 0.04), set, 12);
  assert.deepEqual(decision, {
    choice: 'type:e2:listName', confidence: 0.93, probabilities: { 'type:e2:listName': 0.93, none_fits: 1 - 0.93 },
    done: 0.04, inputTokens: 700, latencyMs: 12, model: 'jev-1.13.0', options: set.candidates.length,
  });
});

test('a malformed answer is refused without echoing the body', () => {
  const { set } = prepareDecision(base);
  const good = reply('tap:e1');
  const bad: unknown[] = [
    null, 'text', {}, { ...good, model: 'other' }, { ...good, usage: undefined }, { ...good, answers: [] },
    reply('tap:e9-SECRET-BODY'),
    reply('tap:e1', 1.2), reply('tap:e1', Number.NaN), reply('tap:e1', 0.9, -0.1),
    { ...good, answers: { ...good.answers, extra: { type: 'noul', noul: 0.5 } } },
    { ...good, answers: { next_action: good.answers.next_action } },
    { ...good, answers: { ...good.answers, step_done: { type: 'choice', noul: 0.5 } } },
    { ...good, answers: { ...good.answers, next_action: { ...good.answers.next_action, type: 'noul' } } },
    { ...good, answers: { ...good.answers, next_action: { ...good.answers.next_action, probabilities: { 'tap:e1': 2 } } } },
    { ...good, answers: { ...good.answers, next_action: { ...good.answers.next_action, probabilities: { 'tap:zz': 0.1 } } } },
    { ...good, answers: { ...good.answers, next_action: { ...good.answers.next_action, probabilities: [] } } },
    { ...good, usage: { input_tokens: -1, output_tokens: 1 } }, { ...good, usage: { input_tokens: 1.5, output_tokens: 1 } },
  ];
  for (const raw of bad) {
    assert.throws(() => parseDecision(raw, set, 1), (error: unknown) =>
      error instanceof ScriptedJevError && error.code === 'MALFORMED_RESPONSE' && !error.message.includes('SECRET'));
  }
  assert.throws(() => parseDecision(good, set, -1), (error: unknown) => error instanceof ScriptedJevError && error.code === 'MALFORMED_RESPONSE');
});

test('top choices are the three likeliest keys, highest first, ties in key order', () => {
  assert.deepEqual(topChoices({ a: 0.1, b: 0.6, c: 0.1, d: 0.2 }), [
    { key: 'b', probability: 0.6 }, { key: 'd', probability: 0.2 }, { key: 'a', probability: 0.1 },
  ]);
  assert.deepEqual(topChoices({ only: 1 }), [{ key: 'only', probability: 1 }]);
});

test('the judge sends the prepared request with the caller signal and parses the reply', async () => {
  const prepared = prepareDecision(base);
  const seen: unknown[] = [];
  const judge = createDrivenJudge({ client: { async systemOne(request: unknown, options?: { signal?: AbortSignal }) {
    seen.push(request, options?.signal);
    return reply('tap:e1', 0.97, 0.01);
  } } as never });
  const signal = new AbortController().signal;
  const decision = await judge.decide(prepared, signal);
  assert.equal(seen[0], prepared.request);
  assert.equal(seen[1], signal);
  assert.equal(decision.choice, 'tap:e1');
  assert.equal(decision.done, 0.01);
  assert.ok(decision.latencyMs >= 0);
});

test('the judge maps SDK failures to the scripted error codes and never calls out when already aborted', async () => {
  const prepared = prepareDecision(base);
  const status = (code: number) => async () =>
    new Response('{"error":"private body"}', { status: code, headers: { 'content-type': 'application/json' } });
  const cases: [TypeSafeClient | Pick<TypeSafeClient, 'systemOne'>, string][] = [
    [new TypeSafeClient({ apiKey: 'synthetic-test-key', retry: { maxRetries: 0 }, fetch: status(401) }), 'AUTH'],
    [new TypeSafeClient({ apiKey: 'synthetic-test-key', retry: { maxRetries: 0 }, fetch: status(429) }), 'RATE_LIMIT'],
    [new TypeSafeClient({ apiKey: 'synthetic-test-key', retry: { maxRetries: 0 }, fetch: status(500) }), 'SERVICE'],
    [new TypeSafeClient({ apiKey: 'synthetic-test-key', retry: { maxRetries: 0 },
      fetch: async () => { throw new Error('raw private transport details'); } }), 'NETWORK'],
    [new TypeSafeClient({ apiKey: 'synthetic-test-key', retry: { maxRetries: 0 }, timeout: 5,
      fetch: (_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) =>
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))) }), 'TIMEOUT'],
    [{ async systemOne() { throw new Error('private'); } } as never, 'UNKNOWN'],
  ];
  for (const [client, code] of cases) {
    await assert.rejects(createDrivenJudge({ client }).decide(prepared, new AbortController().signal),
      (error: unknown) => error instanceof ScriptedJevError && error.code === code && !error.message.includes('private'), code);
  }
  const controller = new AbortController();
  controller.abort();
  const judge = createDrivenJudge({ client: { async systemOne() { assert.fail('must not call after abort'); } } as never });
  await assert.rejects(judge.decide(prepared, controller.signal),
    (error: unknown) => error instanceof ScriptedJevError && error.code === 'ABORTED');
});

test('without a key the real judge refuses to start, as AUTH', () => {
  const saved = process.env.TYPESAFE_API_KEY;
  delete process.env.TYPESAFE_API_KEY;
  try {
    assert.throws(() => createDrivenJudge(), (error: unknown) => error instanceof ScriptedJevError && error.code === 'AUTH');
  } finally {
    if (saved !== undefined) process.env.TYPESAFE_API_KEY = saved;
  }
});

test('the fake judge answers in order, records what it was asked, and refuses keys never offered', async () => {
  const judge = fakeDrivenJudge([
    { choice: 'tap:e1', confidence: 0.9 },
    prepared => ({ choice: prepared.set.candidates[0]!.key, confidence: 0.5, done: 0.95 }),
    { choice: 'tap:e99', confidence: 1 },
  ]);
  const prepared = prepareDecision(base);
  const signal = new AbortController().signal;
  const first = await judge.decide(prepared, signal);
  assert.equal(first.choice, 'tap:e1');
  assert.equal(acceptDecision({ effect: 'none', ...first, set: prepared.set }).kind, 'accept');
  assert.equal((await judge.decide(prepared, signal)).choice, 'type:e2:listName');
  await assert.rejects(judge.decide(prepared, signal), /not offered/);
  await assert.rejects(judge.decide(prepared, signal), /no answer scripted/);
  assert.equal(judge.asked.length, 4);
});
