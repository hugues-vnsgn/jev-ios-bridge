import assert from 'node:assert/strict';
import { test } from 'node:test';
import { settleCaptures, type Clock } from '../src/device/settle.js';
import { setTimeout as delay } from 'node:timers/promises';
const signal = () => new AbortController().signal;
const deadline = { returnDeadline: true };
function clock(): Clock {
  const start = performance.now();
  return { now: () => (performance.now() - start) * 100, sleep: ms => delay(ms / 100), timeout: ms => { const abort = new AbortController(); setTimeout(() => abort.abort(), Math.ceil(ms / 100)); return abort.signal; } };
}
test('shared settle compares normalized hashes and returns the matching second capture', async () => {
  let count = 0;
  assert.deepEqual(await settleCaptures(async () => ({ value: 'Home', number: ++count }), value => value.value, clock(), signal()),
    { tree: { value: 'Home', number: 2 }, screenHash: 'Home', settled: true });
});
test('the return cap keeps the last completed capture and never cancels or keeps a late reply', async () => {
  const c = clock(); let count = 0; let finish: (s: string) => void = () => {}; let wireSignal: AbortSignal | undefined;
  const pending = settleCaptures(async s => { wireSignal = s; return ++count === 1 ? 'first' : new Promise<string>(done => { finish = done; }); }, s => s, c, signal(), deadline);
  assert.deepEqual(await pending, { tree: 'first', screenHash: 'first', settled: false });
  assert.equal(wireSignal?.aborted, false);
  finish('late');
  assert.deepEqual(await pending, { tree: 'first', screenHash: 'first', settled: false });
});
test('a capture which completes after the cap is discarded even if the clock advances synchronously', async () => {
  let time = 0, count = 0;
  const c: Clock = { now: () => time, sleep: async ms => { time += ms; }, timeout: () => signal() };
  const result = await settleCaptures(async () => { time += ++count === 1 ? 100 : 3000; return String(count); }, s => s, c, signal(), deadline);
  assert.deepEqual(result, { tree: '1', screenHash: '1', settled: false });
});
function manualClock() {
  let time = 0;
  const deadlines: { at: number; controller: AbortController }[] = [];
  const advance = (ms: number) => {
    time += ms;
    for (const due of deadlines) if (due.at <= time) due.controller.abort();
  };
  const clock: Clock = { now: () => time, sleep: async ms => advance(ms), timeout: ms => {
    const controller = new AbortController(); deadlines.push({ at: time + ms, controller }); return controller.signal;
  } };
  return { clock, advance };
}
function heldCapture() {
  let calls = 0; let finish: (tree: string) => void = () => {}; let fail: (error: Error) => void = () => {};
  const capture = () => { calls++; return new Promise<string>((done, failed) => { finish = done; fail = failed; }); };
  return { capture, calls: () => calls, finish: (tree: string) => finish(tree), fail: (error: Error) => fail(error) };
}
const stillWaiting = (work: Promise<unknown>) => Promise.race([work.then(() => 'returned', () => 'refused'), delay(20).then(() => 'waiting')]);
test('with no capture completed by the cap, the return cap waits for the one in flight and returns it unsettled', async () => {
  const c = manualClock(); const held = heldCapture();
  const pending = settleCaptures(held.capture, s => s, c.clock, signal(), deadline);
  c.advance(3000);
  assert.equal(await stillWaiting(pending), 'waiting');
  c.advance(400);
  held.finish('late');
  assert.deepEqual(await pending, { tree: 'late', screenHash: 'late', settled: false });
  assert.equal(held.calls(), 1);
});
test('a first capture that returns after the cap is kept even if the clock advances synchronously', async () => {
  let time = 0, count = 0;
  const c: Clock = { now: () => time, sleep: async ms => { time += ms; }, timeout: () => signal() };
  const result = await settleCaptures(async () => { time += 3100; return String(++count); }, s => s, c, signal(), deadline);
  assert.deepEqual(result, { tree: '1', screenHash: '1', settled: false });
  assert.equal(count, 1);
});
test('a capture in flight at the cap that then fails refuses with its own error', async () => {
  const c = manualClock(); const held = heldCapture();
  const pending = settleCaptures(held.capture, s => s, c.clock, signal(), deadline);
  c.advance(3000);
  assert.equal(await stillWaiting(pending), 'waiting');
  held.fail(new Error('page source timed out'));
  await assert.rejects(pending, /page source timed out/);
});
test('cancelling while the capture in flight is awaited past the cap rejects with the cancel reason', async () => {
  const c = manualClock(); const held = heldCapture(); const command = new AbortController();
  const pending = settleCaptures(held.capture, s => s, c.clock, command.signal, deadline);
  c.advance(3000);
  assert.equal(await stillWaiting(pending), 'waiting');
  command.abort(new Error('cancelled'));
  await assert.rejects(pending, /cancelled/);
});
