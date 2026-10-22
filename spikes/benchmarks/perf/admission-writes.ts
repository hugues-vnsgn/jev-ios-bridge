import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, realpathSync, writeSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createInterface } from 'node:readline';
import { test } from 'node:test';
import { setImmediate, setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import type { Admission } from '../../../src/device/admission.js';

type Sample = { dispatchToCallbackMs: number; wholeDispatchMs: number };
type Distribution = { p50: number; p95: number; max: number };

function summarize(values: number[]): Distribution {
  assert(values.length > 0, 'latency samples must be non-empty');
  const sorted = values.toSorted((a, b) => a - b);
  const percentile = (fraction: number): number => {
    const value = sorted[Math.ceil(fraction * sorted.length) - 1];
    assert(value !== undefined);
    return value;
  };
  return { p50: percentile(0.5), p95: percentile(0.95), max: percentile(1) };
}

function verifyCounts(callbacks: number, settledRows: number): void {
  assert.equal(settledRows, callbacks, 'settled rows must equal callbacks');
}

async function benchmark(commands: number): Promise<void> {
  const { Admission } = await import('../../../src/device/admission.js');
  const { DatabaseSync } = await import('node:sqlite');
  const parent = realpathSync(tmpdir());
  const applicationSupport = join(userInfo().homedir, 'Library', 'Application Support');
  const fromApplicationSupport = relative(applicationSupport, parent);
  assert(isAbsolute(fromApplicationSupport) || fromApplicationSupport === '..' || fromApplicationSupport.startsWith('../'), 'temporary store must be outside Application Support');
  const root = realpathSync(mkdtempSync(join(parent, 'admission-writes-')));
  for (const signal of ['SIGTERM', 'SIGINT'] satisfies NodeJS.Signals[]) {
    process.once(signal, () => {
      writeSync(2, `Interrupted by ${signal}. Store retained at ${root}\n`);
      process.exit(signal === 'SIGTERM' ? 143 : 130);
    });
  }
  console.log(`Fresh private store retained at ${root}`);
  const admission = Admission.forTesting({ root, backend: 'fake', durability: 'full' });
  const attempt = { kind: 'legacy', id: 'admission-writes' } satisfies Parameters<Admission['readAttempt']>[0];
  const acquired = admission.acquire({ device: 'abcdef00-0000-4000-8000-000000000001', attempt, digest: 'admission-writes-v1', intent: { commands } });
  assert(acquired.kind === 'acquired', 'benchmark must acquire its sole owner');
  const session = acquired.claim.bindDriver('fake');
  const samples: Sample[] = [];
  let callbacks = 0;
  const started = performance.now();
  for (let index = 0; index < commands; index++) {
    let callbackAt = 0;
    const dispatchAt = performance.now();
    try {
      await session.dispatch('capture', async () => {
        callbackAt = performance.now();
        callbacks++;
      });
    } catch (cause) {
      throw new Error(`Dispatch failed. ${callbacks} callbacks, ${samples.length} successes, 1 failure. Store retained at ${root}`, { cause });
    }
    const settledAt = performance.now();
    samples.push({ dispatchToCallbackMs: callbackAt - dispatchAt, wholeDispatchMs: settledAt - dispatchAt });
    await setImmediate();
  }
  const elapsedMs = performance.now() - started;
  assert.equal(acquired.claim.finalize({ outcome: 'completed', disposition: 'available', payload: { commands }, evidenceRefs: [] }).authority, 'committed');
  const reopened = Admission.forTesting({ root, backend: 'fake', durability: 'full', initialize: false });
  assert.equal(reopened.readAttempt(attempt)?.terminal?.outcome, 'completed');
  const db = new DatabaseSync(join(root, 'admission.sqlite'), { readOnly: true });
  let settledRows: number;
  try {
    const row = db.prepare("SELECT count(*) AS total, count(CASE WHEN state='settled' THEN 1 END) AS settled FROM commands").get();
    assert(row && typeof row.total === 'number' && typeof row.settled === 'number');
    assert.equal(row.total, commands, 'persisted command rows must equal requested commands');
    settledRows = row.settled;
    verifyCounts(callbacks, settledRows);
    assert.equal(callbacks, commands, 'callbacks must equal requested commands');
    assert.equal(db.prepare('PRAGMA integrity_check').get()?.integrity_check, 'ok');
    assert.equal(db.prepare('PRAGMA journal_mode').get()?.journal_mode, 'delete');
  } finally {
    db.close();
  }
  for (const [label, distribution] of [
    ['dispatch-to-callback', summarize(samples.map(sample => sample.dispatchToCallbackMs))],
    ['whole-dispatch', summarize(samples.map(sample => sample.wholeDispatchMs))],
  ] satisfies [string, Distribution][]) {
    console.log(`${label} ms p50=${distribution.p50.toFixed(3)} p95=${distribution.p95.toFixed(3)} max=${distribution.max.toFixed(3)}`);
  }
  console.log(`${callbacks} callbacks`);
  console.log(`${settledRows} settled rows`);
  console.log(`${samples.length} successes, 0 failures; measured loop ${elapsedMs.toFixed(3)} ms`);
  assert(commands !== 1000 || elapsedMs < 60_000, 'measurement unusable: 1,000 commands took 60 seconds or longer');
}

function main(args: string[]): Promise<void> | void {
  if (args.length === 1 && args[0] === '--self-test') return selfTest();
  const commands = args.length === 0 ? 1000 : args.length === 2 && args[0] === '--commands' ? Number(args[1]) : NaN;
  if (!Number.isSafeInteger(commands) || commands <= 0) {
    console.error('Usage: admission-writes.ts [--commands <positive integer>] | --self-test');
    process.exitCode = 2;
    return;
  }
  return benchmark(commands);
}

function selfTest(): void {
  test('nearest-rank percentiles use literal ranks and preserve singleton samples', () => {
    assert.deepEqual(summarize([20, 1, 19, 2, 18, 3, 17, 4, 16, 5, 15, 6, 14, 7, 13, 8, 12, 9, 11, 10]), { p50: 10, p95: 19, max: 20 });
    assert.deepEqual(summarize([7]), { p50: 7, p95: 7, max: 7 });
    assert.throws(() => summarize([]), /latency samples must be non-empty/);
  });
  test('the bench refuses a persisted row count different from its callbacks', () => {
    verifyCounts(10, 10);
    assert.throws(() => verifyCounts(10, 9), /settled rows must equal callbacks/);
  });
  test('ten dispatches print both latency distributions and ten reopened settled rows', () => {
    const result = spawnSync(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), '--commands', '10'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /dispatch-to-callback ms.*p50=.*p95=.*max=/);
    assert.match(result.stdout, /whole-dispatch ms.*p50=.*p95=.*max=/);
    assert.match(result.stdout, /10 callbacks/);
    assert.match(result.stdout, /10 settled rows/);
  });
  for (const args of [['--commands', '0'], ['--commands', '-5'], ['--commands', 'abc'], ['--commands']]) {
    test(`${args.join(' ')} refuses with only usage before creating a store`, () => {
      const result = spawnSync(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), ...args], { encoding: 'utf8' });
      assert.equal(result.status, 2);
      assert.equal(result.stderr, 'Usage: admission-writes.ts [--commands <positive integer>] | --self-test\n');
      assert.equal(result.stdout, '');
    });
  }
  for (const signal of ['SIGTERM', 'SIGINT'] satisfies NodeJS.Signals[]) {
    test(`${signal} stops the bench within two seconds and names its retained store`, async () => {
      const child = spawn(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), '--commands', '1000'], { env: { ...process.env, NODE_NO_WARNINGS: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
      const exited = once(child, 'close');
      const lines = createInterface({ input: child.stdout });
      let stderr = '';
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });
      let deadline: ReturnType<typeof setTimeout> | undefined;
      let timedOut = false;
      try {
        const [banner] = await once(lines, 'line', { signal: AbortSignal.timeout(15_000) });
        assert(typeof banner === 'string');
        const store = /^Fresh private store retained at (.+)$/.exec(banner)?.[1];
        assert(store, 'child must announce its private store');
        await delay(1000);
        const started = performance.now();
        deadline = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 2000);
        assert(child.kill(signal), 'signal must reach the benchmark node');
        const [code, exitSignal] = await exited;
        assert(!timedOut && performance.now() - started < 2000, `${signal} did not stop the bench within two seconds`);
        assert.equal(code, signal === 'SIGTERM' ? 143 : 130);
        assert.equal(exitSignal, null);
        assert.equal(stderr, `Interrupted by ${signal}. Store retained at ${store}\n`);
      } finally {
        clearTimeout(deadline);
        child.kill('SIGKILL');
        lines.close();
      }
    });
  }
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
