import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getEventListeners } from 'node:events';
import { Admission } from '../src/device/admission.js';
import { runObservedTap, boundedObserved, type ObservedTapOptions } from '../src/experimental/observed-tap.js';
import { parseObservedAction } from '../src/observed/schema.js';

test('raw historical tap options cannot bypass prepared allocation admission', async () => {
  let effects = 0;
  await assert.rejects(runObservedTap({ actionId: 'one', deviceId: 'ABCDEF00-0000-4000-8000-000000000001',
    driver: { async observe() { effects++; }, async tapOnce() { effects++; } } } as unknown as ObservedTapOptions), { code: 'MIGRATION_REQUIRED' });
  assert.equal(effects, 0);
});
test('a genuine generic observed claim is insufficient without a full immutable allocation binding', async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'observed-tap-')));
  t.after(() => rmSync(root, { recursive: true, force: true })); mkdirSync(join(root, 'store'), { mode: 0o700 });
  const admission = Admission.forTesting({ root: join(root, 'store'), backend: 'fake' });
  const acquired = admission.acquire({ device: 'ABCDEF00-0000-4000-8000-000000000001', attempt: { kind: 'observed', id: 'one' }, digest: 'generic', intent: {} });
  assert.equal(acquired.kind, 'acquired'); if (acquired.kind !== 'acquired') throw new Error('fixture');
  let effects = 0;
  await assert.rejects(runObservedTap({ admission, claim: acquired.claim as unknown as ObservedTapOptions['claim'], request: parseObservedAction({ version: 1, actionId: 'one',
    allocationId: 'ABCDEF00-0000-4000-8000-000000000002', app: { bundleId: 'dev.fixture' },
    action: { kind: 'tap', selector: { identifier: 'go' } }, before: { present: [{ identifier: 'go' }] },
    after: { present: [{ identifier: 'done' }] }, timeoutMs: 100 }), signal: new AbortController().signal,
    driver: { async attachObserved() { effects++; }, async observe() { effects++; throw new Error('unused'); },
      async tapOnce() { effects++; return undefined; }, revokeIssuance() {}, async close() {} }, async onObservation() { effects++; } }),
    { code: 'MIGRATION_REQUIRED' });
  assert.equal(effects, 0);
});
test('bounded waiting releases its own abort listener immediately when an abort-ignoring operation remains pending', async () => {
  const controller = new AbortController(); let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const wait = boundedObserved(() => pending, controller.signal);
  await Promise.resolve(); controller.abort(new Error('cancelled'));
  await assert.rejects(wait, /cancelled/);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  release(); await pending; assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});
test('bounded waiting never calls an operation after its signal is already cancelled', async () => {
  let effects = 0; const signal = AbortSignal.abort(new Error('cancelled'));
  await assert.rejects(boundedObserved(async () => { effects++; }, signal), /cancelled/); assert.equal(effects, 0);
});
