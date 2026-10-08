import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { ObservedAllocator } from '../../../src/observed/allocation.js';
import { allocationFixture } from '../../../tests/fixtures/observed-allocation-backend.js';

const output = process.argv[2]!;
assert.ok(output);
const paths = ['tests/observed-allocation.test.ts', 'tests/fixtures/observed-allocation-backend.ts', 'src/observed/allocation.ts', 'src/device/index.ts'];
async function hashes() { return Object.fromEntries(await Promise.all(paths.map(async p => [p, createHash('sha256').update(await readFile(p)).digest('hex')]))); }
const before = await hashes();
const f = await allocationFixture();
f.configure({ bootTimeoutMs: 1100 });
f.setState('Booting');
const allocator = new ObservedAllocator({ admission: f.admission, runsDir: f.runsDir,
  fakeBackend: { process: f.source, runner: f.runner, window: f.window, host: f.host } });
const times: number[] = [];
f.setBefore(async operation => {
  if (operation === 'list') {
    times.push(Date.now());
    if (times.length === 1) await new Promise(done => setTimeout(done, 150));
  }
});
const started = Date.now();
try {
  const result = await allocator.prepare(f.request());
  const after = await hashes();
  const record = { node: process.version, budgetMs: 1100, injectedFirstPollLatencyMs: 150,
    scope: 'Controlled fake backend latency; unchanged production and original exact-two-poll oracle',
    durationMs: Date.now() - started, times, calls: f.calls, result,
    originalOracleExpectedPollCount: 2, actualPollCount: times.length,
    sourceBefore: before, sourceAfter: after, sourceUnchanged: JSON.stringify(before) === JSON.stringify(after) };
  await writeFile(resolve(output), JSON.stringify(record, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ node: record.node, actualPollCount: record.actualPollCount, durationMs: record.durationMs, sourceUnchanged: record.sourceUnchanged }));
  assert.equal(f.calls.filter(operation => operation === 'boot').length, 1);
  assert.ok(!f.calls.includes('install'));
  assert.equal(times.length, 2, 'Unchanged original fixture oracle reproduced');
  assert.ok(times[1]! - times[0]! >= 1000);
} finally {
  await allocator.close();
  await f.cleanup();
}
