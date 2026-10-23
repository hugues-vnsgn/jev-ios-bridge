import assert from 'node:assert/strict';
import { test } from 'node:test';
import { settleCaptures, SettleDeadlineError, type Clock } from '../src/device/settle.js';
import { setTimeout as delay } from 'node:timers/promises';
const signal = () => new AbortController().signal;
function clock(): Clock {
  const start = performance.now();
  return { now: () => (performance.now() - start) * 100, sleep: ms => delay(ms / 100), timeout: ms => AbortSignal.timeout(Math.ceil(ms / 100)) };
}
test('shared settle compares normalized hashes and returns the matching second capture', async () => {
  let count = 0;
  assert.deepEqual(await settleCaptures(async () => ({ value: 'Home', number: ++count }), value => value.value, clock(), signal()),
    { tree: { value: 'Home', number: 2 }, screenHash: 'Home', settled: true });
});
test('the return cap keeps the last completed capture and never cancels or keeps a late reply', async () => {
  const c = clock(); let count = 0; let finish: (s: string) => void = () => {}; let wireSignal: AbortSignal | undefined;
  const pending = settleCaptures(async s => { wireSignal = s; return ++count === 1 ? 'first' : new Promise<string>(done => { finish = done; }); }, s => s, c, signal());
  assert.deepEqual(await pending, { tree: 'first', screenHash: 'first', settled: false });
  assert.equal(wireSignal?.aborted, false);
  finish('late');
  assert.deepEqual(await pending, { tree: 'first', screenHash: 'first', settled: false });
});
test('a capture which completes after the cap is discarded even if the clock advances synchronously', async () => {
  let time = 0, count = 0;
  const c: Clock = { now: () => time, sleep: async ms => { time += ms; }, timeout: () => signal() };
  const result = await settleCaptures(async () => { time += ++count === 1 ? 100 : 3000; return String(count); }, s => s, c, signal());
  assert.deepEqual(result, { tree: '1', screenHash: '1', settled: false });
});
test('the return cap refuses when no capture has completed', async () => {
  const result = settleCaptures(() => new Promise<string>(() => {}), s => s, clock(), signal());
  await assert.rejects(result, SettleDeadlineError);
});
