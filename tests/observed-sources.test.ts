import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulator } from '../src/observed/create-source.js';
const udid = '11111111-2222-4333-8444-555555555555';
const request = { allocationId: 'allocation-1', deviceTypeId: 'com.apple.CoreSimulator.SimDeviceType.iPhone-17', runtimeId: 'com.apple.CoreSimulator.SimRuntime.iOS-27-0', timeoutMs: 1000 };
test('creation needs internal authorization and returns only one valid UUID receipt', async () => {
  const calls: unknown[] = [];
  const created = await createSimulator(request, {
    dispatch: operation => operation(),
    process: async (file, args) => { calls.push([file, args]); return { exitCode: 0, stdout: `${udid}\n`, stderr: '' }; },
  });
  assert.equal(created.status, 'created');
  if (created.status === 'created') assert.equal(created.udid, udid);
  assert.deepEqual(calls, [['/usr/bin/xcrun', ['simctl', 'create', 'jev-observed-allocation-1', request.deviceTypeId, request.runtimeId]]]);
  const denied = await createSimulator(request, { dispatch: async () => undefined, process: async () => { throw new Error('must not spawn'); } });
  assert.deepEqual(denied, { status: 'not-dispatched', reason: 'ADMISSION_REFUSED' });
});
import { selectSuppliedSource } from '../src/observed/supplied-source.js';
test('supplied source requires configured creation provenance and a fresh exclusive attestation', () => {
  const entry = { inventoryId: 'stock-1', udid: udid.toLowerCase(), deviceTypeId: request.deviceTypeId, runtimeId: request.runtimeId,
    creation: { createdAt: '2026-10-08T00:00:00Z', origin: 'operator fixture creation', evidenceRef: '/private/receipt.json' },
    attestation: { freshUnused: true as const, exclusive: true as const } };
  const selected = selectSuppliedSource('stock-1', [entry]);
  assert.equal(selected.status, 'selected');
  if (selected.status === 'selected') assert.equal(selected.source.udid, udid);
  assert.deepEqual(selectSuppliedSource('arbitrary-listed-device', [entry]), { status: 'refused', reason: 'INVENTORY_EXHAUSTED' });
  assert.deepEqual(selectSuppliedSource('stock-1', [{ ...entry, creation: { ...entry.creation, origin: '' } }]), { status: 'refused', reason: 'INVENTORY_INELIGIBLE' });
});
for (const [label, receipt] of [
  ['missing UUID', { exitCode: 0, stdout: '', stderr: '' }],
  ['extra output', { exitCode: 0, stdout: `created ${udid}`, stderr: '' }],
  ['two UUIDs', { exitCode: 0, stdout: `${udid}\n${udid}`, stderr: '' }],
  ['nonzero exit', { exitCode: 1, stdout: udid, stderr: 'private failure' }],
  ['lost exit status', { exitCode: null, stdout: udid, stderr: '' }],
] as const) test(`creation retains uncertainty for ${label} without retry`, async () => {
  let attempts = 0; const diagnostics: unknown[] = [];
  const result = await createSimulator(request, { dispatch: operation => operation(), process: async () => { attempts++; return receipt; }, diagnostics: r => { diagnostics.push(r); } });
  assert.deepEqual(result, { status: 'unknown', reason: 'CREATE_UNCONFIRMED' }); assert.equal(attempts, 1); assert.deepEqual(diagnostics, [receipt]);
});
test('lost process reply and failed dispatch cannot manufacture a creation receipt', async () => {
  const lost = await createSimulator(request, { dispatch: operation => operation(), process: async () => { throw new Error('private lost reply'); } });
  assert.deepEqual(lost, { status: 'unknown', reason: 'CREATE_UNCONFIRMED' });
  let attempts = 0;
  const fake = await createSimulator(request, { dispatch: async () => ({ status: 'created', udid, provenance: { kind: 'simctl-create', allocationId: request.allocationId, name: 'fabricated', deviceTypeId: request.deviceTypeId, runtimeId: request.runtimeId } }), process: async () => { attempts++; throw new Error('must not spawn'); } });
  assert.deepEqual(fake, { status: 'not-dispatched', reason: 'ADMISSION_REFUSED' }); assert.equal(attempts, 0);
});
test('abort ignoring process stays tracked and cannot promote a late successful receipt', async () => {
  const controller = new AbortController(); let settle!: (value: { exitCode: number; stdout: string; stderr: string }) => void;
  let underlyingSettled = false; let tracked: Promise<unknown> | undefined;
  const pending = createSimulator(request, { signal: controller.signal,
    dispatch: operation => { tracked = operation(); void tracked.then(() => { underlyingSettled = true; }); return tracked as ReturnType<typeof operation>; },
    process: () => new Promise(resolve => { settle = resolve; }),
  });
  controller.abort();
  assert.deepEqual(await pending, { status: 'unknown', reason: 'CREATE_UNCONFIRMED' }); assert.equal(underlyingSettled, false);
  settle({ exitCode: 0, stdout: udid, stderr: '' });
  assert.deepEqual(await tracked, { status: 'unknown', reason: 'CREATE_UNCONFIRMED' }); assert.equal(underlyingSettled, true);
});
test('timeout without authorization closes issuance before a late callback', async () => {
  let operation: (() => Promise<unknown>) | undefined; let attempts = 0;
  const result = await createSimulator({ ...request, timeoutMs: 1 }, { dispatch: op => { operation = op; return new Promise(() => {}); }, process: async () => { attempts++; throw new Error('must not spawn'); } });
  assert.equal(result.status, 'not-dispatched'); await assert.rejects(operation!(), /closed/); assert.equal(attempts, 0);
});
test('timeout after starting keeps unknown creation without waiting for an ignoring runner', async () => {
  let tracked: Promise<unknown> | undefined;
  const result = await createSimulator({ ...request, timeoutMs: 1 }, { dispatch: op => { tracked = op(); return tracked as ReturnType<typeof op>; }, process: async () => new Promise(() => {}) });
  assert.deepEqual(result, { status: 'unknown', reason: 'CREATE_UNCONFIRMED' }); assert.ok(tracked);
});
test('invalid explicit identifiers and pre-cancellation never start creation', async () => {
  for (const candidate of [{ ...request, runtimeId: '' }, { ...request, deviceTypeId: 'iPhone;touch /tmp/leak' }, { ...request, allocationId: '$(touch /tmp/leak)' }]) {
    assert.deepEqual(await createSimulator(candidate, { dispatch: op => op(), process: async () => { throw new Error('must not run'); } }), { status: 'not-dispatched', reason: 'INVALID_REQUEST' });
  }
  assert.deepEqual(await createSimulator(request, { signal: AbortSignal.abort(), dispatch: op => op(), process: async () => { throw new Error('must not run'); } }), { status: 'not-dispatched', reason: 'CANCELLED' });
});
test('a second authorized callback cannot start a second creation', async () => {
  let attempts = 0;
  const result = await createSimulator(request, { dispatch: async op => { await op(); return op(); }, process: async () => { attempts++; return { exitCode: 0, stdout: udid, stderr: '' }; } });
  assert.deepEqual(result, { status: 'unknown', reason: 'CREATE_UNCONFIRMED' }); assert.equal(attempts, 1);
});
test('duplicate supplied inventory UUIDs and missing attestation are ineligible', () => {
  const entry = { inventoryId: 'a', udid, deviceTypeId: request.deviceTypeId, runtimeId: request.runtimeId, creation: { createdAt: '2026-10-08T00:00:00Z', origin: 'fixture', evidenceRef: 'receipt' }, attestation: { freshUnused: true, exclusive: true } };
  assert.deepEqual(selectSuppliedSource('a', [entry, { ...entry, inventoryId: 'b' }]), { status: 'refused', reason: 'INVENTORY_INELIGIBLE' });
  assert.deepEqual(selectSuppliedSource('a', [{ ...entry, attestation: {} }]), { status: 'refused', reason: 'INVENTORY_INELIGIBLE' });
});
test('injected clock bounds creation while leaving its underlying operation pending', async () => {
  let deadline!: () => void; let cleared = false;
  const pending = createSimulator(request, { clock: { setTimeout: callback => { deadline = callback; return 1; }, clearTimeout: () => { cleared = true; } },
    dispatch: op => op(), process: async () => new Promise(() => {}) });
  deadline(); assert.deepEqual(await pending, { status: 'unknown', reason: 'CREATE_UNCONFIRMED' }); assert.equal(cleared, true);
});
