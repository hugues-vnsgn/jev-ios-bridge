/**
 * Issue 16, from Codex review round 3 (one P2): driven mode masks typed values with `⟦value:<key>⟧`, whose brackets a
 * typed value in a do script may not contain, so no value can overlap a marker's edge. Covers Codex's round-3 probe,
 * Issue 15's three leftover cases, idempotency, and the refusal of a value holding a marker bracket. The v1 log pane
 * keeps `[value:<key>]` (tests/logpane.test.ts). Fakes only: no device, no TypeSafe call.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Element, Snapshot } from '../src/contracts/index.js';
import { maskSnapshot, maskValues, prepareDecision } from '../src/driven/decide.js';
import { createHandbackGate, renderPause } from '../src/driven/handback.js';
import { DrivenProjectError, openDrivenProject } from '../src/driven/project.js';
import type { HandbackPacket } from '../src/driven/step.js';
import { parseScriptedScenario } from '../src/scripted/schema.js';

const el = (ref: string, role: string, extra: Partial<Element> = {}): Element => ({
  ref, role, frame: { x: 10, y: 10, width: 100, height: 40 }, state: { enabled: true, visible: true },
  actions: ['tap'], ...extra,
});
const snap = (elements: Element[]): Snapshot =>
  ({ deviceId: 'fake', capturedAt: 0, expiresAt: 60_000, sequence: 1, truncated: false, elements });

/** Each case: the values, and a text in which every value appears, overlapping old-style `[value:<key>]` text. */
const CASES: { name: string; values: Record<string, string>; text: string }[] = [
  { name: 'Codex round 3: a pin that overlaps a marker\'s end', values: { user: 'abc', pin: 'user]123' },
    text: '[value:user]123' },
  { name: 'Issue 15: a value that is marker text', values: { user: 'abc', other: '[value:user]' },
    text: 'hi abc, [value:user]' },
  // Issue 15's case is { k: 'ab', ... } (masked below); `ab` would match "enabled" in the request's screen JSON.
  { name: 'Issue 15: a value that holds a marker\'s start', values: { k: 'zq', w: 'q[value:k' },
    text: 'zq q[value:k]' },
  { name: 'Issue 15: a pin after a user', values: { user: 'abc', pin: 'user]123' },
    text: 'abc [value:user]123 abc' },
];

/** The text outside every `⟦value:<key>⟧` marker, as separate pieces. */
const outsideMarkers = (text: string): string[] => text.split(/⟦value:[A-Za-z0-9_-]+⟧/u);

const leaks = (text: string, values: Record<string, string>): string[] =>
  Object.values(values).filter(value => outsideMarkers(text).some(piece => piece.includes(value)));

test('masking uses ⟦value:<key>⟧, and an old-style [value:<key>] in a value is just text', () => {
  assert.equal(maskValues('Signed in as abc', { user: 'abc' }), 'Signed in as ⟦value:user⟧');
  assert.equal(maskValues('pw [value:user]x', { user: 'abc', pw: '[value:user]x' }), 'pw ⟦value:pw⟧');
});

for (const { name, values, text } of CASES) {
  test(`${name}: no typed value survives masking, and masking twice changes nothing`, () => {
    const once = maskValues(text, values);
    assert.deepEqual(leaks(once, values), [], once);
    assert.equal(maskValues(once, values), once);
  });

  test(`${name}: no typed value reaches Jev's request`, () => {
    const { request } = prepareDecision({ goal: text, intent: `Type ${text}`, doneWhen: `The field shows ${text}`,
      platform: 'android', valueKeys: Object.keys(values), values, recentActions: [`Typed ${text}`],
      snapshot: snap([el('f1', 'text-field', { label: text, value: text, actions: ['tap', 'typeText'] }),
        el('b1', 'button', { label: `Continue as ${text}`, identifier: text })]) });
    const sent = JSON.stringify(request);
    // JSON escapes nothing in these values, so a raw substring check finds them.
    for (const value of Object.values(values)) {
      const unmasked = sent.split(/⟦value:[A-Za-z0-9_-]+⟧/u).some(piece => piece.includes(value));
      assert.ok(!unmasked, `${value} in ${sent}`);
    }
  });

  test(`${name}: no typed value reaches the pause package or its rendering`, async () => {
    const scenario = parseScriptedScenario({ version: 2, platform: 'android', app: { package: 'com.example.app' },
      values, steps: [{ id: 'enter', kind: 'do', intent: 'Enter it', doneWhen: 'Home shows', effect: 'none',
        values: Object.keys(values) }, { id: 'verify', kind: 'checkpoint', guard: { present: [{ role: 'text' }] },
        assertions: [{ id: 'shown', claim: 'Home is shown.' }] }] });
    const gate = createHandbackGate({ scenario, now: () => 0 });
    const packet: HandbackPacket = { pauseId: 'p-1', reason: 'NONE_FITS', stepId: 'enter', intent: `Type ${text}`,
      doneWhen: `Shows ${text}`, screen: `Screen ${text}`, topChoices: [{ key: `tap:${text}`, probability: 0.4 }],
      valueKeys: Object.keys(values),
      snapshot: snap([el('f1', 'text-field', { label: text, value: text, actions: ['tap', 'typeText'] })]) };
    const answer = gate.handback(packet, new AbortController().signal);
    await new Promise<void>(done => { gate.onPause(done); });
    try {
      const pause = gate.pending()!;
      for (const shown of [JSON.stringify(pause), renderPause('run-1', pause, 0)]) {
        assert.deepEqual(leaks(shown, values), [], shown);
      }
    } finally {
      gate.resolve('p-1', { kind: 'stop' });
      await answer;
    }
  });
}

test('Issue 15\'s exact { k: \'ab\', w: \'q[value:k\' } case: both values masked, and masking twice changes nothing', () => {
  const values = { k: 'ab', w: 'q[value:k' };
  const once = maskValues('ab q[value:k] [value:k]', values);
  assert.equal(once, '⟦value:k⟧ ⟦value:w⟧] [value:k]');
  assert.equal(maskValues(once, values), once);
});

test('an existing ⟦value:<key>⟧ marker is skipped whole, even when values occur inside it', () => {
  const values = { pin: 'pin', v: 'v', user: 'abc' };
  const once = maskValues('Enter pin for abc, v', values);
  assert.equal(once, 'Enter ⟦value:pin⟧ for ⟦value:user⟧, ⟦value:v⟧');
  assert.equal(maskValues(once, values), once);
});

test('the longest typed value starting at a position wins', () => {
  assert.equal(maskValues('pin 1234, code 12', { short: '12', long: '1234' }), 'pin ⟦value:long⟧, code ⟦value:short⟧');
  assert.equal(maskValues('abcd', { a: 'ab', b: 'bcd' }), '⟦value:a⟧cd');
});

test('a checkpoint\'s masked screen uses the new marker', () => {
  const masked = maskSnapshot(snap([el('t1', 'text', { label: 'Hello abc' })]), { user: 'abc' });
  assert.equal(masked.elements[0]!.label, 'Hello ⟦value:user⟧');
});

test('random values without marker brackets: no value survives outside a marker, and masking is idempotent', () => {
  // A small deterministic generator, so a failure reproduces.
  let seed = 16;
  const next = (): number => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed; };
  const alphabet = 'ab[]:u ';
  const word = (max: number): string =>
    Array.from({ length: 1 + (next() % max) }, () => alphabet[next() % alphabet.length]).join('');
  for (let round = 0; round < 2000; round++) {
    const values: Record<string, string> = {};
    for (const key of ['u', 'k', 'value'].slice(0, 1 + (next() % 3))) {
      const value = word(5);
      if (value.trim()) values[key] = value;
    }
    const keys = Object.keys(values);
    const parts = Array.from({ length: 1 + (next() % 6) }, () => {
      const pick = next() % 3;
      if (pick === 0 && keys.length) return values[keys[next() % keys.length]!]!;
      if (pick === 1 && keys.length) return `[value:${keys[next() % keys.length]}]`;
      return word(4);
    });
    const text = parts.join('');
    const once = maskValues(text, values);
    assert.equal(maskValues(once, values), once, JSON.stringify({ text, values }));
    // A value may only survive as part of a marker's own text, e.g. the key `u` in `⟦value:u⟧`.
    assert.deepEqual(leaks(once, values), [], JSON.stringify({ text, values, once }));
  }
});

const doScript = (values: Record<string, string>) => ({ version: 2, platform: 'android',
  app: { package: 'com.example' }, values,
  steps: [{ id: 'go', kind: 'do', intent: 'Open it', doneWhen: 'It is open', effect: 'none' },
    { id: 'check', kind: 'checkpoint', guard: { present: [{ label: 'A' }] }, assertions: [{ id: 'a', claim: 'A shows' }] }] });

test('a do script whose typed value holds ⟦ or ⟧ is refused, naming the key and never the value', async () => {
  for (const value of ['x⟦y', 'x⟧y', '⟦value:user⟧']) {
    await assert.rejects(() => openDrivenProject(doScript({ ok: 'fine', pw: value }) as never, {}), (error: unknown) =>
      error instanceof DrivenProjectError && error.code === 'INVALID_VALUE' && error.message.includes('"pw"') &&
      !error.message.includes(value));
  }
});

test('a do script whose typed value holds old-style [value: text is no longer refused for it', async () => {
  // Driven mode isn't turned on here, so the run is refused for that, not for the value.
  await assert.rejects(() => openDrivenProject(doScript({ pw: 'x[value:user]y' }) as never, {}), (error: unknown) =>
    error instanceof DrivenProjectError && error.code === 'DRIVEN_NOT_ENABLED');
});
