import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { readOnly } from '../src/appium/fence/schema.js';
import type { Admission, AttemptIdentity } from '../src/device/admission.js';
import { cycleScenario, runCycles, type CycleRecord } from '../scripts/phase4/live/cycles.js';
import { Refusal } from '../scripts/phase4/live/records.js';
import { UDID, WDA_BUNDLE } from './fixtures/appium-wire/driver-fixture.js';
import { SERIAL } from './fixtures/appium-wire/matrix.js';
import { IOS_SCENARIO, androidScenario, cycleWorld, iosScenario, worldCycles } from './fixtures/phase4-live/world-cycles.js';

function logRoot(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'p4-cycles-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
const generationOf = (admission: Admission, attempt: AttemptIdentity) => admission.readGeneration(admission.readAttempt(attempt)!.owner);
const kindsOf = (admission: Admission, attempt: AttemptIdentity) => new Set(generationOf(admission, attempt).components.map(component => component.kind));
const componentOf = (admission: Admission, attempt: AttemptIdentity, kind: string) =>
  generationOf(admission, attempt).components.find(component => component.kind === kind)!.declaration as Record<string, unknown>;
const released = (record: CycleRecord) => [record.attemptState, record.disposition, record.device, record.owner, record.leftovers, record.scenario.reachedCheckpoint];

test('20 independent iOS cycles each release the simulator with nothing owned left, and the harness only reads the fence', { timeout: 240_000 }, async t => {
  const { f, reads, backend } = worldCycles(t, { platform: 'ios' });
  const reported: CycleRecord[] = [];
  const result = await runCycles(20, backend(iosScenario(), logRoot(t)), { onCycle: record => reported.push(record) });
  assert.equal(result.passed, true, JSON.stringify(result.failure));
  assert.equal(result.failure, undefined);
  assert.deepEqual(reported, result.cycles, 'each cycle is reported as it ends');
  assert.deepEqual(result.cycles.map(record => record.cycle), Array.from({ length: 20 }, (_, index) => index + 1));
  assert.equal(new Set(result.cycles.map(record => record.attempt.id)).size, 20, 'every cycle is its own admission attempt');
  for (const record of result.cycles) {
    assert.deepEqual(released(record), ['terminal', 'available', 'available', null, [], true], `cycle ${String(record.cycle)} released the device`);
    assert.ok(kindsOf(f.admission, record.attempt).has('appium-wda'), `cycle ${String(record.cycle)} recorded its own WDA runner`);
    assert.equal(record.owned, generationOf(f.admission, record.attempt).components.filter(component => component.kind.startsWith('appium-') && component.kind !== 'appium-fence-command').length);
  }
  assert.deepEqual(f.fence.wda, [], 'no runner is left on the simulator');
  assert.ok(reads.length > 0 && reads.every(readOnly), 'the harness sends the fence read effects only');
  assert.deepEqual([...new Set(reads.map(effect => effect.kind))].sort(), ['host-inventory', 'wda-inventory']);
});

test('Android phone cycles fence the forward, the UiAutomator2 processes and the settings, and leave none of them', { timeout: 120_000 }, async t => {
  const { f, reads, backend } = worldCycles(t, { platform: 'android' });
  const result = await runCycles(3, backend(androidScenario(), logRoot(t)));
  assert.equal(result.passed, true, JSON.stringify(result.failure));
  for (const record of result.cycles) {
    assert.deepEqual(released(record), ['terminal', 'available', 'available', null, [], true], `cycle ${String(record.cycle)} released the phone`);
    for (const kind of ['appium-forward', 'appium-uiautomator2', 'appium-settings']) assert.ok(kindsOf(f.admission, record.attempt).has(kind), `cycle ${String(record.cycle)} recorded ${kind}`);
  }
  assert.deepEqual([f.fence.forwards, f.fence.processes.size], [[], 0]);
  assert.ok(reads.every(readOnly));
  assert.deepEqual([...new Set(reads.map(effect => effect.kind))].sort(), ['android-process', 'forward-inventory', 'host-inventory', 'settings-read']);
});

test('a WDA runner that survives fails the harness at that cycle and names it, including one an earlier cycle recorded', { timeout: 120_000 }, async t => {
  const runners: { cycle: number; id: string; pid: number }[] = [];
  const { backend } = worldCycles(t, { platform: 'ios', afterCycle: (index, run, f) => {
    const wda = componentOf(f.admission, run.attempt, 'appium-wda') as { id: string; udid: string; bundleId: string; pid: number };
    runners.push({ cycle: index, id: wda.id, pid: wda.pid });
    if (index === 2) for (const runner of runners) f.fence.wda.push({ udid: UDID, bundleId: WDA_BUNDLE, pid: runner.pid });
  } });
  const result = await runCycles(4, backend(iosScenario(), logRoot(t)));
  assert.equal(result.passed, false);
  assert.deepEqual([result.failure?.cycle, result.failure?.code], [2, 'leftovers']);
  assert.match(result.failure!.reason, /appium-wda/);
  assert.equal(result.cycles.length, 2, 'no cycle runs after the first failure');
  const leftovers = result.cycles[1]!.leftovers;
  assert.deepEqual(leftovers.map(leftover => [leftover.cycle, leftover.component, leftover.kind]), runners.map(runner => [runner.cycle, runner.id, 'appium-wda']),
    'each leftover names the cycle and component that recorded it');
  assert.deepEqual(leftovers.map(leftover => leftover.found), runners.map(runner => [{ udid: UDID, bundleId: WDA_BUNDLE, pid: runner.pid }]));
  assert.deepEqual([result.cycles[1]!.device, result.cycles[1]!.disposition], ['available', 'available'], 'the bridge believed it released the device');
});

test('a surviving forward fails an Android cycle and names the forward', { timeout: 120_000 }, async t => {
  const { backend } = worldCycles(t, { platform: 'android', afterCycle: (_index, run, f) => {
    const forward = componentOf(f.admission, run.attempt, 'appium-forward') as { serial: string; local: string; remote: string };
    f.fence.forwards.push({ serial: forward.serial, local: forward.local, remote: forward.remote });
  } });
  const result = await runCycles(2, backend(androidScenario(), logRoot(t)));
  assert.deepEqual([result.passed, result.failure?.cycle, result.failure?.code], [false, 1, 'leftovers']);
  assert.match(result.failure!.reason, /appium-forward/);
  assert.deepEqual(result.cycles[0]!.leftovers.map(leftover => [leftover.kind, leftover.found]), [['appium-forward', [{ serial: SERIAL, local: 'tcp:18200', remote: 'tcp:6790' }]]]);
});

test('a cycle that ends with the device quarantined fails the harness and names the device state', { timeout: 120_000 }, async t => {
  const { backend } = worldCycles(t, { platform: 'ios',
    worldFor: index => index === 2 ? cycleWorld('ios', [{ tool: 'appium_perform_actions', nth: 1, fault: { kind: 'exit', code: 9 } }]) : cycleWorld('ios') });
  const result = await runCycles(3, backend(iosScenario(), logRoot(t)));
  assert.deepEqual([result.passed, result.failure?.cycle], [false, 2]);
  assert.match(result.failure!.reason, /device \S+ is quarantined/);
  assert.equal(result.cycles.length, 2);
  assert.deepEqual([result.cycles[1]!.attemptState, result.cycles[1]!.disposition, result.cycles[1]!.device], ['terminal', 'quarantined', 'quarantined']);
});

test('a cycle whose scenario stops before its final checkpoint fails even though the device was released', { timeout: 120_000 }, async t => {
  const { backend } = worldCycles(t, { platform: 'ios', worldFor: index => cycleWorld('ios', [], index === 2 ? 'done' : 'home') });
  const result = await runCycles(3, backend(iosScenario(), logRoot(t)));
  assert.deepEqual([result.passed, result.failure?.cycle, result.failure?.code], [false, 2, 'scenario-incomplete']);
  assert.deepEqual([result.cycles[1]!.device, result.cycles[1]!.disposition, result.cycles[1]!.scenario.reachedCheckpoint], ['available', 'available', false]);
});

test('a cycle scenario is refused up front unless it ends at its only checkpoint, has no do step and names the assigned device', () => {
  const base = JSON.parse(readFileSync(IOS_SCENARIO, 'utf8')) as { steps: object[] } & Record<string, unknown>;
  const ios = { category: 'ios-simulator', device: UDID } as const;
  const refused = (raw: unknown, assigned: Parameters<typeof cycleScenario>[1], pattern: RegExp) =>
    assert.throws(() => cycleScenario(raw, assigned), (error: unknown) => error instanceof Refusal && error.code === 'scenario-refused' && pattern.test(error.message), String(pattern));
  assert.equal(cycleScenario(base, { category: 'ios-simulator', device: UDID.toLowerCase() }).steps.length, 3, 'a UDID matches whatever its case');
  refused({ ...base, steps: [{ ...base.steps[2], id: 'early' }, ...base.steps] }, ios, /checkpoint/);
  refused({ ...base, version: 2, steps: [{ id: 'explore', kind: 'do', intent: 'Open settings', doneWhen: 'Settings are shown', effect: 'none' }, base.steps[2]] }, ios, /do step/);
  refused(base, { category: 'ios-simulator', device: '11111111-2222-4333-8444-555555555555' }, /device/);
  refused(base, { category: 'android-phone', device: SERIAL }, /device/);
  refused({ ...base, device: {} }, ios, /device/);
  refused({ ...base, steps: [] }, ios, /scenario/i);
  const android = JSON.parse(readFileSync(IOS_SCENARIO.replace('ios-cycle', 'android-cycle'), 'utf8')) as Record<string, unknown>;
  assert.equal(cycleScenario(android, { category: 'android-emulator', device: SERIAL }).platform, 'android');
  refused({ ...android, device: { avd: 'Pixel_9' } }, { category: 'android-emulator', device: 'emulator-5554' }, /device/);
  refused(android, { category: 'android-phone', device: SERIAL.toLowerCase() }, /device/);
});
