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

test('checkpoint service redacts every phase value and honors one global budget', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-checkpoint-service-'));
  let prepares = 0, closes = 0;
  const service = new BridgeService({ baseDir: root,
    createDriver: () => ({
      async prepare() { prepares++; },
      async observe() { return { deviceId: 'fixture', capturedAt: Date.now(), expiresAt: Date.now()+60000, sequence: 1, elements: [], truncated: false }; },
      async act() { assert.fail('Completed checkpoint must not act'); },
      async close() { closes++; },
    }),
    createJudge: () => ({ async judge(scenario) {
      return { choice: 'stop-goal', confidence: 1, probabilities: {'stop-goal':1}, goalReached: 1,
        assertions: Object.fromEntries(scenario.assertions.map(assertion => [assertion.id, 1])),
        inputTokens: 10, latencyMs: 1, model: 'fixture' };
    } }),
  });
  const scenario = { app: { bundleId: 'com.example.app' }, checkpoints: [
    { id: 'first', goal: 'First private-one visible', assertions: [{id:'visible',claim:'private-one visible'}], values: {first:'private-one'} },
    { id: 'second', goal: 'Second private-two visible', assertions: [{id:'visible',claim:'private-two visible'}], values: {second:'private-two'} },
  ] };
  try {
    const {runId} = await service.start(scenario, {maxSteps:1});
    let status = await service.status(runId);
    for(let i=0;status.state==='running'&&i<100;i++){await new Promise(done=>setTimeout(done,5));status=await service.status(runId);}
    assert.equal(status.state,'finished');
    assert.equal(status.report.verdict,'inconclusive');
    assert.equal(status.report.events.filter(event=>event.type==='checkpoint').length,1);
    assert.equal(prepares,1);assert.equal(closes,1);
    assert.doesNotMatch(JSON.stringify(status.report),/private-one|private-two/);
    await assert.rejects(service.start(scenario,{maxSteps:1001}));
    assert.equal(prepares,1);
  } finally {await service.close();await rm(root,{recursive:true,force:true});}
});
