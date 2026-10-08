import assert from 'node:assert/strict';
import test from 'node:test';
import { ObservedAllocator } from '../../../../../src/observed/allocation.js';
import { allocationFixture } from '../../../../../tests/fixtures/observed-allocation-backend.js';

test('a slow first boot-state response consumes the same 1100 ms stage budget', async t => {
  const f = await allocationFixture();
  f.configure({ bootTimeoutMs: 1100 }); f.setState('Booting');
  const allocator = new ObservedAllocator({ admission: f.admission, runsDir: f.runsDir,
    fakeBackend: { process: f.source, runner: f.runner, window: f.window, host: f.host } });
  const times: number[] = [];
  f.setBefore(async operation => {
    if (operation === 'list') { times.push(Date.now()); await new Promise(resolve => setTimeout(resolve, 150)); }
  });
  try {
    const began = Date.now(); const result = await allocator.prepare(f.request());
    assert.ok(!('kind' in result)); if ('kind' in result) throw new Error('Unexpected preparation error');
    t.diagnostic(JSON.stringify({ elapsed: Date.now() - began, times, state: result.state, reason: result.reason, calls: f.calls }));
    assert.notEqual(result.state, 'ready'); assert.equal(times.length, 1);
    assert.equal(f.calls.filter(operation => operation === 'boot').length, 1);
    assert.ok(!f.calls.includes('install'));
  } finally { await allocator.close(); await f.cleanup(); }
});
