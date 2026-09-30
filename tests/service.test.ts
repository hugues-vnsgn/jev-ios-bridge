import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BridgeService } from '../src/service.js';
import type { DeviceDriver } from '../src/contracts/index.js';
import type { AppIdentity } from '../src/contracts/index.js';
import type { ScriptedJudge } from '../src/scripted/contracts.js';

const screen = () => ({ deviceId: 'test', sequence: 1, capturedAt: Date.now(),
  expiresAt: Date.now() + 60_000, truncated: false,
  elements: [{ ref: 'marker', role: 'text', label: 'SCREEN_EVIDENCE_MARKER',
    frame: { x: 0, y: 0, width: 100, height: 30 },
    state: { visible: true, enabled: true }, actions: [] }],
});
const checkpoint = (id: string, claim = 'Marker visible') => ({
  id, kind: 'checkpoint', guard: { present: [{ role: 'text', label: 'SCREEN_EVIDENCE_MARKER' }] },
  assertions: [{ id: 'shown', claim }],
});
const script = (steps = [checkpoint('verify')]) => ({ version: 1, app: { bundleId: 'com.example.app' },
  values: {}, steps });

test('scripted start returns a recoverable run id and report reflects assertion verdict', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-service-'));
  let closed = false;
  const driver: DeviceDriver = {
    async prepare() {}, async observe() { return screen(); },
    async act() { assert.fail('A checkpoint-only script must not act'); },
    async close() { closed = true; },
  };
  const judge: ScriptedJudge = { async judge() { return { probabilities: { shown: 1 },
    inputTokens: 42, latencyMs: 1, model: 'jev-1.13.0' }; } };
  const options = { baseDir: root, createDriver: () => driver, createJudge: () => judge };
  const service = new BridgeService(options);
  try {
    const start = await service.start(script());
    assert.match(start.watchUrl, /127\.0\.0\.1/);
    const status = await service.status(start.runId, 2_000);
    assert.equal(status.state, 'finished');
    assert.equal(status.report.verdict, 'passed');
    assert.equal(status.report.inputTokens, 42);
    assert.equal(status.report.checkpoints[0]?.stepId, 'verify');
    assert.ok(closed);
    const reader = new BridgeService(options);
    assert.equal((await reader.status(start.runId)).report.verdict, 'passed');
    await reader.close();
  } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
});

test('an Android scenario gives its driver a package identity, never a bundle ID', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-service-android-'));
  let preparedApp: AppIdentity | undefined;
  const driver: DeviceDriver = {
    async prepare(scenario) { preparedApp = scenario.app; }, async observe() { return screen(); },
    async act() { assert.fail('A checkpoint-only script must not act'); },
    async close() {},
  };
  const judge: ScriptedJudge = { async judge() { return { probabilities: { shown: 1 },
    inputTokens: 1, latencyMs: 1, model: 'jev-1.13.0' }; } };
  const service = new BridgeService({ baseDir: root, createDriver: () => driver, createJudge: () => judge });
  try {
    const androidScript = { version: 1, platform: 'android', app: { package: 'com.example.app' },
      device: { serial: 'emulator-5554' }, values: {}, steps: [checkpoint('verify')] };
    const start = await service.start(androidScript);
    const status = await service.status(start.runId, 2_000);
    assert.equal(status.state, 'finished');
    assert.equal(status.report.verdict, 'passed');
    assert.deepEqual(preparedApp, { package: 'com.example.app' });
  } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
});

test('service redacts supplied values and keeps a global scripted step budget', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-scripted-service-'));
  let prepares = 0, closes = 0;
  const service = new BridgeService({ baseDir: root,
    createDriver: () => ({
      async prepare() { prepares++; }, async observe() { return screen(); },
      async act() { assert.fail('A checkpoint-only script must not act'); },
      async close() { closes++; },
    }),
    createJudge: () => ({ async judge() { return { probabilities: { shown: 1 },
      inputTokens: 10, latencyMs: 1, model: 'jev-1.13.0' }; } }),
  });
  const scenario = { ...script([checkpoint('first', 'private-one visible'),
    checkpoint('second', 'private-two visible')]),
    values: { first: 'private-one', second: 'private-two' } };
  try {
    const { runId } = await service.start(scenario, { maxSteps: 1 });
    const status = await service.status(runId, 2_000);
    assert.equal(status.state, 'finished');
    assert.equal(status.report.verdict, 'inconclusive');
    assert.equal(status.report.events.filter(event => event.type === 'checkpoint').length, 1);
    assert.equal(prepares, 1);
    assert.equal(closes, 1);
    assert.doesNotMatch(JSON.stringify(status.report), /private-one|private-two/);
    await assert.rejects(service.start(scenario, { maxSteps: 101 }));
    assert.equal(prepares, 1);
  } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
});

test('public service rejects legacy autonomous scenarios before creating a device', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-legacy-rejection-'));
  let created = 0;
  const service = new BridgeService({ baseDir: root,
    createDriver: () => { created++; throw new Error('Device should not be created'); },
    createJudge: () => { throw new Error('Judge should not be created'); },
  });
  try {
    for (const scenario of [
      { app: { bundleId: 'com.example.app' }, goal: 'Marker visible', values: {},
        assertions: [{ id: 'shown', claim: 'Marker visible' }] },
      { app: { bundleId: 'com.example.app' }, checkpoints: [
        { id: 'first', goal: 'Marker visible', assertions: [{ id: 'shown', claim: 'Marker visible' }] }] },
    ]) await assert.rejects(service.start(scenario));
    assert.equal(created, 0);
  } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
});

test('createDriver builds a driver per run from that run\'s scenario, and the run reads the tap alias rule from it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-service-driver-per-scenario-'));
  const label = 'Contact photo for Nolan Ames';
  const button = { role: 'button', label, frame: { x: 22, y: 112, width: 40, height: 40 },
    state: { visible: true, enabled: true }, actions: ['tap'] };
  const aliased = () => ({ ...screen(), elements: [...screen().elements,
    { ref: 'e30', ...button }, { ref: 'e117', ...button }] });
  const tapScript = (bundleId: string) => ({ version: 1, app: { bundleId }, values: {}, steps: [{ id: 'open', kind: 'action',
    guard: { present: [{ role: 'text', label: 'SCREEN_EVIDENCE_MARKER' }] },
    action: { kind: 'tap', selector: { role: 'button', label } } }, checkpoint('verify')] });
  const built: string[] = [];
  const taps: string[] = [];
  const service = new BridgeService({ baseDir: root,
    createDriver: (scenario) => {
      built.push(scenario.app.bundleId);
      const driver: DeviceDriver = {
        async prepare() {}, async observe() { return aliased(); },
        async act(action) { taps.push(`${scenario.app.bundleId}:${action.targetRef}`); },
        async close() {},
      };
      return scenario.app.bundleId === 'com.example.pinned' ? { ...driver, tapAliasRule: 'mobilebuildmcp-2.7.1' } : driver;
    },
    createJudge: () => ({ async judge() { return { probabilities: { shown: 1 },
      inputTokens: 1, latencyMs: 1, model: 'jev-1.13.0' }; } }),
  });
  try {
    const pinned = await service.start(tapScript('com.example.pinned'));
    assert.equal((await service.status(pinned.runId, 2_000)).report.verdict, 'passed');
    const strict = await service.start(tapScript('com.example.strict'));
    const status = await service.status(strict.runId, 2_000);
    assert.equal(status.report.verdict, 'inconclusive');
    assert.equal(status.report.reason, 'TARGET_AMBIGUOUS');
    assert.deepEqual(built, ['com.example.pinned', 'com.example.strict']);
    assert.deepEqual(taps, ['com.example.pinned:e30']);
  } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
});
