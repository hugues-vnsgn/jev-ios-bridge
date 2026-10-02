/**
 * The hand-back gate (Issue 08): one open pause per run, answers checked against the paused screen, timeout and
 * cancel. Pure: no device, no Jev. Run-level behaviour (needs_claude, the lease, resolve_step) is in
 * tests/service-handback.test.ts.
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Element } from '../src/contracts/index.js';
import { createHandbackGate, HandbackAnswerError, HandbackTimeoutError, renderPause } from '../src/driven/handback.js';
import { imageSize } from '../src/device/image.js';
import type { HandbackPacket } from '../src/driven/step.js';
import { parseScriptedScenario } from '../src/scripted/schema.js';

const el = (ref: string, role: string, extra: Partial<Element> = {}): Element => ({
  ref, role, frame: { x: 10, y: 10, width: 100, height: 40 }, state: { enabled: true, visible: true },
  actions: ['tap'], ...extra,
});
const checkpoint = { id: 'verify', kind: 'checkpoint', guard: { present: [{ role: 'text', label: 'Home' }] },
  assertions: [{ id: 'shown', claim: 'Home is shown.' }] };
const doStep = { id: 'signIn', kind: 'do', intent: 'Sign in', doneWhen: 'Home shows', effect: 'none', values: ['user'] };

function scenario(platform: 'ios' | 'android' = 'android') {
  return parseScriptedScenario({ version: 2, ...(platform === 'android'
    ? { platform: 'android', app: { package: 'com.example.app' } } : { app: { bundleId: 'com.example.app' } }),
    values: { user: 'ops@example.com', pin: '4321' }, steps: [doStep, checkpoint] });
}

/** A 1×1-style PNG header with the given size: enough for imageSize. */
function pngHeader(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function packet(extra: Partial<HandbackPacket> = {}): HandbackPacket {
  return { pauseId: 'p-1', reason: 'NONE_FITS', stepId: 'signIn', intent: 'Sign in', doneWhen: 'Home shows',
    screen: 'Current Android screen', topChoices: [{ key: 'tap:b1', probability: 0.41 }], valueKeys: ['user'],
    snapshot: { deviceId: 'fake', sequence: 1, capturedAt: 0, expiresAt: 60_000, truncated: false, elements: [
      el('t1', 'text', { label: 'Welcome ops@example.com', actions: [] }),
      el('f1', 'text-field', { label: 'Email', actions: ['tap', 'typeText'] }),
      el('b1', 'button', { label: 'Sign in' }),
      el('hidden', 'button', { label: 'Hidden', state: { visible: false, enabled: true } }),
    ] }, ...extra };
}

/** Settles once the gate has an open pause. */
function paused(gate: ReturnType<typeof createHandbackGate>): Promise<void> {
  return new Promise(done => { gate.onPause(done); });
}

async function withScreenshot<T>(run: (path: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'jev-handback-'));
  try {
    const path = join(dir, 'screen-1.png');
    await writeFile(path, pngHeader(400, 800));
    return await run(path);
  } finally { await rm(dir, { recursive: true, force: true }); }
}

test('a pause opens with its package, and a valid answer settles it and closes the pause', async () => {
  const gate = createHandbackGate({ scenario: scenario(), now: () => Date.parse('2026-10-01T10:00:00Z') });
  assert.equal(gate.pending(), undefined);
  const opened = paused(gate);
  const answer = gate.handback(packet(), new AbortController().signal);
  await opened;
  const pause = gate.pending()!;
  assert.equal(pause.pauseId, 'p-1');
  assert.equal(pause.reason, 'NONE_FITS');
  assert.match(pause.reasonText, /no listed action/);
  assert.equal(pause.pausedAt, '2026-10-01T10:00:00.000Z');
  assert.equal(pause.expiresAt, '2026-10-01T10:05:00.000Z');
  assert.deepEqual(pause.topChoices, [{ key: 'tap:b1', probability: 0.41 }]);
  assert.deepEqual(pause.elements.map(element => element.ref), ['f1', 'b1'], 'only visible elements with actions');
  assert.equal(Object.hasOwn(pause, 'snapshot'), false, 'the raw snapshot stays in the bridge');
  assert.deepEqual(gate.resolve('p-1', { kind: 'tap', ref: 'b1' }), { kind: 'tap', ref: 'b1' });
  assert.deepEqual(await answer, { kind: 'tap', ref: 'b1' });
  assert.equal(gate.pending(), undefined);
  assert.throws(() => gate.resolve('p-1', { kind: 'stop' }), /not waiting for an answer/);
});

test('every answer kind is accepted when it fits the paused screen', async () => {
  await withScreenshot(async screenshotPath => {
    const answers: unknown[] = [
      { kind: 'tap', ref: 'b1' },
      { kind: 'tapAt', x: 399, y: 799 },
      { kind: 'type', ref: 'f1', valueKey: 'user' },
      { kind: 'scroll', direction: 'down' },
      { kind: 'back' },
      { kind: 'done' },
      { kind: 'stop' },
    ];
    for (const raw of answers) {
      const gate = createHandbackGate({ scenario: scenario() });
      const answer = gate.handback(packet({ screenshotPath }), new AbortController().signal);
      await paused(gate);
      gate.resolve('p-1', raw);
      assert.deepEqual(await answer, raw);
    }
  });
});

test('a revision is read like the script\'s steps and arrives parsed', async () => {
  const gate = createHandbackGate({ scenario: scenario() });
  const answer = gate.handback(packet(), new AbortController().signal);
  await paused(gate);
  gate.resolve('p-1', { kind: 'revise', steps: [{ ...doStep, intent: '  Sign in again  ' }, checkpoint] });
  const revised = await answer;
  assert.equal(revised.kind, 'revise');
  assert.deepEqual(revised.kind === 'revise' && revised.steps.map(step => step.id), ['signIn', 'verify']);
  assert.equal(revised.kind === 'revise' && revised.steps[0]!.kind === 'do' && revised.steps[0]!.intent, 'Sign in again');
});

test('a revision of scripted steps only is valid in a version 2 script without goal or start', async () => {
  const gate = createHandbackGate({ scenario: scenario() });
  const answer = gate.handback(packet(), new AbortController().signal);
  await paused(gate);
  gate.resolve('p-1', { kind: 'revise', steps: [checkpoint] });
  assert.equal((await answer).kind, 'revise');
});

test('invalid answers are refused with a clear message, and the pause stays open for a corrected one', async () => {
  await withScreenshot(async screenshotPath => {
    const gate = createHandbackGate({ scenario: scenario() });
    const answer = gate.handback(packet({ screenshotPath }), new AbortController().signal);
    await paused(gate);
    const refused: [unknown, RegExp][] = [
      [{ kind: 'tap', ref: 'nope' }, /Element ref "nope" is not on the paused screen/],
      [{ kind: 'tap', ref: 't1' }, /Element "t1" does not support tap/],
      [{ kind: 'type', ref: 'b1', valueKey: 'user' }, /Element "b1" does not support typeText/],
      [{ kind: 'type', ref: 'f1', valueKey: 'pin' }, /may type only these value keys: user; "pin" is not one/],
      [{ kind: 'tapAt', x: 400, y: 10 }, /outside the 400 × 800 screenshot/],
      [{ kind: 'tapAt', x: 10, y: 800 }, /outside the 400 × 800 screenshot/],
      [{ kind: 'revise', steps: [doStep] }, /revision is not valid[\s\S]*end at an assertion checkpoint/],
      [{ kind: 'revise', steps: [{ ...doStep, values: ['missing'] }, checkpoint] }, /must each name a supplied value/],
      [{ kind: 'tap', ref: 'b1', x: 1 }, /answer is not valid/],
      [{ kind: 'jump' }, /answer is not valid/],
      [{ kind: 'scroll', direction: 'left' }, /answer is not valid/],
      ['tap', /answer is not valid/],
    ];
    for (const [raw, message] of refused) {
      assert.throws(() => gate.resolve('p-1', raw), (error: unknown) =>
        error instanceof HandbackAnswerError && message.test(error.message), JSON.stringify(raw));
      assert.equal(gate.pending()?.pauseId, 'p-1', 'the pause stays open');
    }
    assert.throws(() => gate.resolve('p-2', { kind: 'stop' }), /Pause p-2 is not the open pause; the open pause is p-1/);
    gate.resolve('p-1', { kind: 'back' });
    assert.deepEqual(await answer, { kind: 'back' });
  });
});

test('a step with no values may not type', async () => {
  const gate = createHandbackGate({ scenario: scenario() });
  const answer = gate.handback(packet({ valueKeys: [] }), new AbortController().signal);
  await paused(gate);
  assert.throws(() => gate.resolve('p-1', { kind: 'type', ref: 'f1', valueKey: 'user' }), /lists no values/);
  gate.resolve('p-1', { kind: 'stop' });
  await answer;
});

test('iOS refuses tapAt as UNSUPPORTED_ACTION and keeps the pause; its package does not offer tapAt', async () => {
  await withScreenshot(async screenshotPath => {
    const gate = createHandbackGate({ scenario: scenario('ios') });
    const answer = gate.handback(packet({ screenshotPath }), new AbortController().signal);
    await paused(gate);
    assert.equal(gate.pending()!.answers.includes('tapAt'), false);
    assert.throws(() => gate.resolve('p-1', { kind: 'tapAt', x: 1, y: 1 }), /UNSUPPORTED_ACTION: tapAt isn't available on ios/);
    assert.equal(gate.pending()?.pauseId, 'p-1');
    gate.resolve('p-1', { kind: 'stop' });
    await answer;
  });
});

test('tapAt is refused when the paused screenshot\'s size is unknown', async () => {
  const gate = createHandbackGate({ scenario: scenario() });
  const answer = gate.handback(packet({ screenshotPath: '/nonexistent/screen.png' }), new AbortController().signal);
  await paused(gate);
  assert.equal(gate.pending()!.screenshotSize, undefined);
  assert.throws(() => gate.resolve('p-1', { kind: 'tapAt', x: 1, y: 1 }), /size is unknown/);
  gate.resolve('p-1', { kind: 'stop' });
  await answer;
});

test('no answer in time rejects with HANDBACK_TIMEOUT and closes the pause', async () => {
  const gate = createHandbackGate({ scenario: scenario(), timeoutMs: 1_000 });
  const started = performance.now();
  const answer = gate.handback(packet(), new AbortController().signal);
  await paused(gate);
  await assert.rejects(answer, (error: unknown) => error instanceof HandbackTimeoutError && error.code === 'HANDBACK_TIMEOUT');
  assert.ok(performance.now() - started >= 990);
  assert.equal(gate.pending(), undefined);
});

test('the timeout must be 1 s to 30 min', () => {
  assert.throws(() => createHandbackGate({ scenario: scenario(), timeoutMs: 999 }), RangeError);
  assert.throws(() => createHandbackGate({ scenario: scenario(), timeoutMs: 30 * 60_000 + 1 }), RangeError);
  createHandbackGate({ scenario: scenario(), timeoutMs: 30 * 60_000 });
});

test('a cancel while paused rejects with the signal\'s reason and closes the pause', async () => {
  const gate = createHandbackGate({ scenario: scenario() });
  const controller = new AbortController();
  const answer = gate.handback(packet(), controller.signal);
  await paused(gate);
  controller.abort(new Error('cancelled'));
  await assert.rejects(answer, /cancelled/);
  assert.equal(gate.pending(), undefined);
  assert.throws(() => gate.resolve('p-1', { kind: 'stop' }), /not waiting/);
});

test('pause listeners run once, at once when a pause is open, on close, and not after unsubscribing', async () => {
  const gate = createHandbackGate({ scenario: scenario() });
  let calls = 0;
  const unsubscribe = gate.onPause(() => { calls++; });
  unsubscribe();
  const answer = gate.handback(packet(), new AbortController().signal);
  await paused(gate);
  assert.equal(calls, 0);
  gate.onPause(() => { calls++; });
  assert.equal(calls, 1, 'an open pause calls a new listener at once');
  gate.resolve('p-1', { kind: 'stop' });
  await answer;
  const waiting = paused(gate);
  gate.close();
  await waiting;
});

test('the package masks typed values in element descriptions', async () => {
  const gate = createHandbackGate({ scenario: scenario() });
  const answer = gate.handback(packet({ snapshot: { ...packet().snapshot, elements: [
    el('f1', 'text-field', { label: 'Email', value: 'ops@example.com', actions: ['tap', 'typeText'] })] } }),
  new AbortController().signal);
  await paused(gate);
  const [element] = gate.pending()!.elements;
  assert.doesNotMatch(element!.description, /ops@example\.com/);
  assert.match(element!.description, /⟦value:user⟧/);
  gate.resolve('p-1', { kind: 'stop' });
  await answer;
});

test('renderPause shows the reason, step, refs, picks, screenshot and how to answer', async () => {
  await withScreenshot(async screenshotPath => {
    const gate = createHandbackGate({ scenario: scenario(), now: () => 0 });
    const answer = gate.handback(packet({ screenshotPath }), new AbortController().signal);
    await paused(gate);
    const text = renderPause('run-1', gate.pending()!, 60_000);
    assert.match(text, /^Status: needs_claude\nRun: run-1\nPause: p-1 \(expires .*about 240 s left/);
    assert.match(text, /Reason: NONE_FITS: /);
    assert.match(text, /Step: signIn: Sign in\nDone when: Home shows/);
    assert.match(text, /Screenshot: .*screen-1\.png \(400 × 800 px\)/);
    assert.match(text, /Jev's top picks: tap:b1 \(0\.41\)/);
    assert.match(text, / {2}b1: button "Sign in" .*\[tap\]/);
    assert.match(text, /resolve_step/);
    gate.resolve('p-1', { kind: 'stop' });
    await answer;
  });
});

test('imageSize reads PNG and JPEG sizes, and nothing from other files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jev-image-size-'));
  try {
    await writeFile(join(dir, 'a.png'), pngHeader(320, 640));
    // SOI, then SOF0 with height 480 and width 360.
    await writeFile(join(dir, 'b.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x01, 0x68, 0x03]));
    await writeFile(join(dir, 'c.txt'), 'hello');
    assert.deepEqual(await imageSize(join(dir, 'a.png')), { width: 320, height: 640 });
    assert.deepEqual(await imageSize(join(dir, 'b.jpg')), { width: 360, height: 480 });
    assert.equal(await imageSize(join(dir, 'c.txt')), undefined);
    assert.equal(await imageSize(join(dir, 'missing.png')), undefined);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
