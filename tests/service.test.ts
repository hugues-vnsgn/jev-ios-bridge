import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BridgeService } from '../src/service.js';
import type { DeviceDriver, JevJudge } from '../src/contracts/index.js';

test('start returns a recoverable run id and report reflects policy verdict', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-service-'));
  let closed = false;
  const driver: DeviceDriver = {
    async prepare() {},
    async observe() { return { deviceId: 'test', sequence: 1, capturedAt: Date.now(), expiresAt: Date.now() + 60_000, elements: [], truncated: false }; },
    async act() { assert.fail('A finished scenario must not act'); },
    async close() { closed = true; },
  };
  const judge: JevJudge = { async judge() { return { choice: 'stop-goal', confidence: 1, probabilities: { 'stop-goal': 1 }, goalReached: 1, assertions: { visible: 1 }, inputTokens: 42, latencyMs: 1, model: 'fixture' }; } };
  const service = new BridgeService({ baseDir: root, createDriver: () => driver, createJudge: () => judge });
  try {
    const start = await service.start({ goal: 'Home visible', app: { bundleId: 'com.example.app' }, assertions: [{ id: 'visible', claim: 'Home visible' }], values: {} });
    assert.match(start.watchUrl, /127\.0\.0\.1/);
    let status = await service.status(start.runId);
    for (let i = 0; status.state === 'running' && i < 100; i++) {
      await new Promise(done => setTimeout(done, 5)); status = await service.status(start.runId);
    }
    assert.equal(status.state, 'finished');
    assert.equal(status.report.verdict, 'passed');
    assert.equal(status.report.inputTokens, 42);
    assert.ok(closed);
    const reader = new BridgeService({ baseDir: root, createDriver: () => driver, createJudge: () => judge });
    assert.equal((await reader.status(start.runId)).report.verdict, 'passed');
    await reader.close();
  } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
});
