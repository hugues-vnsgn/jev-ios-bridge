import assert from 'node:assert/strict';
import { mkdir, realpath, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
test('OperationTracker waits for work without making an ownership decision', { timeout: 2000 }, async () => {
  const { OperationTracker } = await import('../src/device/operation-tracker.js');
  const tracker = new OperationTracker();
  let finish!: () => void;
  const pending = tracker.track(() => new Promise<void>(resolve => { finish = resolve; }));
  await new Promise<void>(resolve => setImmediate(resolve));
  let settled = false;
  const draining = tracker.settle(AbortSignal.timeout(1000)).then(() => { settled = true; });
  assert.equal(settled, false);
  finish();
  await pending;
  await draining;
  assert.equal(settled, true);
  assert.equal('take' in tracker, false);
  assert.equal('command' in tracker, false);
});

test('L10 marker appears after admission and disappears only after authoritative release', async () => {
  const { Admission } = await import('../src/device/admission.js');
  const { CompatibilityMarker } = await import('../src/device/lease.js');
  const root = await realpath(await mkdtemp(join(tmpdir(), 'p28-marker-')));
  try {
    await mkdir(join(root, 'store'), { mode: 0o700 });
    const admission = Admission.forTesting({ root: join(root, 'store'), backend: 'fake' });
    const acquired = admission.acquire({ category: 'android-phone', device: 'hardware', attempt: { kind: 'legacy', id: 'marker' }, digest: 'marker', intent: {} });
    if (acquired.kind !== 'acquired') assert.fail('Expected owner');
    const marker = new CompatibilityMarker({ root: join(root, 'markers') });
    await marker.take('usb-transport', acquired.claim);
    assert.equal(JSON.parse(await readFile(join(root, 'markers', 'USB-TRANSPORT.lock'), 'utf8')).token, acquired.claim.identity.token);
    await assert.rejects(marker.release(), /not released/i);
    assert.equal(acquired.claim.finalize({ outcome: 'completed', disposition: 'available', payload: {}, evidenceRefs: [] }).authority, 'committed');
    await marker.release();
    assert.deepEqual(await readdir(join(root, 'markers')), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('L7 unknown marker refuses even when its PID is dead', { timeout: 5000 }, async () => {
  const { Admission } = await import('../src/device/admission.js');
  const { CompatibilityMarker, DeviceLeaseBusyError } = await import('../src/device/lease.js');
  const root = await realpath(await mkdtemp(join(tmpdir(), 'p28-unknown-marker-')));
  try {
    await mkdir(join(root, 'store'), { mode: 0o700 });
    const admission = Admission.forTesting({ root: join(root, 'store'), backend: 'fake', ownerLiveness: () => 'dead' });
    const acquired = admission.acquire({ category: 'android-phone', device: 'hardware', attempt: { kind: 'legacy', id: 'marker' }, digest: 'marker', intent: {} });
    if (acquired.kind !== 'acquired') assert.fail('Expected owner');
    const path = join(root, 'PHONE.lock');
    const content = JSON.stringify({ pid: 2147483647, token: 'unknown-old-binary', deviceId: 'phone', createdAt: 'old' });
    await writeFile(path, content);
    await assert.rejects(new CompatibilityMarker({ root }).take('phone', acquired.claim), DeviceLeaseBusyError);
    assert.equal(await readFile(path, 'utf8'), content);
    acquired.claim.finalize({ outcome: 'refused', disposition: 'available', payload: {}, evidenceRefs: [] });
  } finally { await rm(root, { recursive: true, force: true }); }
});
