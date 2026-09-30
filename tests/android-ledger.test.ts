import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inLedger, OutcomeUnknownError } from '../src/device/android/ledger.js';
import type { DeviceCommandKind } from '../src/device/lease.js';

function ledger(): { log: string[]; lease: { command(kind: DeviceCommandKind): { exited(): void; unknown(): void } } } {
  const log: string[] = [];
  return {
    log,
    lease: { command: (kind) => { log.push(kind); return { exited: () => log.push('exited'), unknown: () => log.push('unknown') }; } },
  };
}

test('inLedger records the command before it runs and marks it exited when it returns', async () => {
  const { log, lease } = ledger();
  const result = await inLedger(lease, 'adb', async () => { log.push('run'); return 'done'; });
  assert.equal(result, 'done');
  assert.deepEqual(log, ['adb', 'run', 'exited']);
});

test('inLedger marks a command that failed with a known outcome exited, and rethrows', async () => {
  const { log, lease } = ledger();
  const failure = new Error('agent refused');
  await assert.rejects(inLedger(lease, 'agent', async () => { throw failure; }), (error: unknown) => error === failure);
  assert.deepEqual(log, ['agent', 'exited']);
});

test('inLedger marks a command whose outcome is unknown as unknown, and rethrows', async () => {
  const { log, lease } = ledger();
  const lost = new OutcomeUnknownError('agent', 'The device agent request timed out');
  await assert.rejects(inLedger(lease, 'agent', async () => { throw lost; }), (error: unknown) => error === lost);
  assert.deepEqual(log, ['agent', 'unknown']);
});
