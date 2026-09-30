import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import type { Assertion, Element, Snapshot } from '../src/contracts/index.js';
import { buildAssertionRequest, createAssertionJudge, parseAssertionResult, ScriptedJevError } from '../src/scripted/jev.js';
import { ANDROID_PROJECTION_RULE, PROJECTION_RULE, renderAssertionState, ScriptedObservationError } from '../src/scripted/observe.js';

const goldenDir = join(import.meta.dirname, 'golden');

/** Golden-file check for the Android renderer's output (ADR-0005: golden files only gain entries). */
async function golden(name: string, actual: unknown): Promise<void> {
  const path = join(goldenDir, `${name}.json`);
  const text = JSON.stringify(actual, null, 2) + '\n';
  if (process.env.UPDATE_GOLDEN === '1') {
    await mkdir(goldenDir, { recursive: true });
    await writeFile(path, text);
    return;
  }
  let expected: string;
  try { expected = await readFile(path, 'utf8'); }
  catch { assert.fail(`Missing golden file ${path}; run UPDATE_GOLDEN=1 npm test and review it`); }
  assert.deepEqual(JSON.parse(text), JSON.parse(expected), `Frozen surface changed: ${name}. See tests/scripted-jev.test.ts.`);
}

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

test('the Android projection rule is a fixed name beside the iOS rule', () => {
  assert.equal(PROJECTION_RULE, 'visible-full-text-v2');
  assert.equal(ANDROID_PROJECTION_RULE, 'android-full-text-v1');
});

test('the platform parameter defaults to iOS and picks the header per platform', () => {
  const defaulted = renderAssertionState(snapshot);
  const explicitIos = renderAssertionState(snapshot, 'ios');
  assert.equal(defaulted, explicitIos);
  assert.match(defaulted, /^Current iOS screen \(full accessibility capture\):/);
  const android = renderAssertionState(snapshot, 'android');
  assert.match(android, /^Current Android screen \(full accessibility capture\):/);
  assert.equal(android.slice(android.indexOf('\n')), defaulted.slice(defaulted.indexOf('\n')),
    'only the header differs; the projected elements are identical');
});

test('an element with a placeholder shows it in place of label, on both platforms', () => {
  const withPlaceholder: Snapshot = { ...snapshot, elements: [
    { ref: 'e1', role: 'textfield', placeholder: 'Betrag eingeben', state: { enabled: true, visible: true }, actions: ['type'] },
  ] };
  const android = renderAssertionState(withPlaceholder, 'android');
  assert.match(android, /"placeholder":"Betrag eingeben"/);
  assert.doesNotMatch(android, /"label"/);
  const ios = renderAssertionState(withPlaceholder, 'ios');
  assert.match(ios, /"placeholder":"Betrag eingeben"/);
});

test('golden: the Android renderer on hand-written elements with a placeholder, a password field, and lifted button text', async () => {
  const amountField: Element = { ref: 'e1', role: 'text-field', placeholder: 'Betrag eingeben',
    identifier: 'amount', frame: { x: 16, y: 200, width: 300, height: 48 },
    state: { enabled: true, visible: true, focused: true }, actions: ['tap', 'typeText'] };
  const passwordField: Element = { ref: 'e2', role: 'text-field', label: 'Password', value: '••••••••',
    identifier: 'password', frame: { x: 16, y: 280, width: 300, height: 48 },
    state: { enabled: true, visible: true }, actions: ['tap', 'typeText'] };
  const breadButton: Element = { ref: 'e3', role: 'button', label: 'Add Bread ($3)',
    frame: { x: 16, y: 360, width: 300, height: 48 }, state: { enabled: true, visible: true }, actions: ['tap'] };
  const breadLabelLine: Element = { ref: 'e4', role: 'text', label: 'Add Bread ($3)', selectable: false,
    frame: { x: 24, y: 372, width: 200, height: 24 }, state: { enabled: true, visible: true }, actions: [] };
  const handWritten: Snapshot = { deviceId: 'emulator-5554', capturedAt: 1_700_000_000_000,
    expiresAt: 1_700_000_060_000, sequence: 1, truncated: false,
    elements: [amountField, passwordField, breadButton, breadLabelLine] };

  const rendered = renderAssertionState(handWritten, 'android');
  assert.match(rendered, /"placeholder":"Betrag eingeben"/);
  assert.match(rendered, /"value":"••••••••"/);
  assert.doesNotMatch(rendered, /"selectable"/);
  assert.match(rendered, /Add Bread \(\$3\)/);
  await golden('android-render', rendered);
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
