/**
 * Preservation matrix, scripted version 1 (P3.9): the real bridge service and runner drive the Appium driver, its
 * private client, session, observation, operations, fence and admission. Only the private MCP provider is a fake.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import type { RunEvent } from '../src/contracts/index.js';
import type { Admission } from '../src/device/admission.js';
import { readRunEvents } from '../src/log/index.js';
import { runScriptedScenario } from '../src/scripted/run.js';
import { UDID, WDA_BUNDLE } from './fixtures/appium-wire/driver-fixture.js';
import { ANDROID_DEVICE, IOS_DEVICE, SERIAL, androidTarget, authorized, bridge, filesContaining, iosTarget, passingJudge } from './fixtures/appium-wire/matrix.js';
import { androidScreen, iosScreen, world, worldFixture, type IosNode, type WorldRule } from './fixtures/appium-wire/world.js';
import { withRunLog } from './fixtures/run-log.js';

const SECRET = 'synthetic-secret-4d2c';
const header: IosNode = { type: 'StaticText', name: 'title', label: 'Header', frame: [16, 60, 200, 40] };
const loading = iosScreen([header, { type: 'StaticText', label: 'Loading', frame: [16, 200, 200, 40] }]);
const iosScreens = {
  home: iosScreen([header, { type: 'StaticText', name: 'home', label: 'Home', frame: [16, 120, 200, 40] }, { type: 'Button', name: 'search.open', label: 'Search', frame: [20, 200, 200, 44] }]),
  search: iosScreen([header, { type: 'TextField', name: 'search.field', label: 'Query', value: '{{typed}}', placeholder: 'Search', frame: [20, 200, 300, 44] },
    { type: 'Button', name: 'search.go', label: 'Go', frame: [20, 300, 100, 44] }]),
  loading1: loading, loading2: loading, loading3: loading,
  results: iosScreen([header, { type: 'StaticText', name: 'results', label: 'Results', frame: [16, 200, 200, 40] }]),
};
/** Tapping Search opens the field; Go shows one settled loading screen, then the results. */
const flow: WorldRule[] = [
  { tool: 'appium_perform_actions', when: 'home', to: 'search' },
  { tool: 'appium_perform_actions', when: 'search', to: 'loading1' },
  { tool: 'appium_get_page_source', when: 'loading1', to: 'loading2' },
  { tool: 'appium_get_page_source', when: 'loading2', to: 'loading3' },
  { tool: 'appium_get_page_source', when: 'loading3', to: 'results' },
];
const steps = (field: string, go: string, results: string, home: string) => [
  { id: 'open', kind: 'action', guard: { present: [{ identifier: home }] }, action: { kind: 'tap', selector: { role: 'button', label: 'Search' } } },
  { id: 'type', kind: 'action', guard: { present: [{ identifier: field }] }, action: { kind: 'replaceText', selector: { identifier: field, role: 'text-field' }, valueKey: 'query' } },
  { id: 'go', kind: 'action', guard: { present: [{ identifier: go }] }, action: { kind: 'tap', selector: { identifier: go } } },
  { id: 'settle', kind: 'wait', guard: { present: [{ label: 'Header' }] }, until: { present: [{ identifier: results }] }, timeoutMs: 5000 },
  { id: 'verify', kind: 'checkpoint', guard: { present: [{ identifier: results }] }, assertions: [{ id: 'shown', claim: 'Results are shown.' }] },
];
const iosScript = { version: 1, app: { bundleId: 'example.app', launchArgs: ['-route', 'search'] }, device: { udid: UDID }, values: { query: SECRET },
  steps: steps('search.field', 'search.go', 'results', 'home') };

const id = (name: string) => `example.app:id/${name}`;
const androidHeader = { className: 'android.widget.TextView', text: 'Header', bounds: [16, 20, 216, 60] as [number, number, number, number] };
const androidLoading = androidScreen([androidHeader, { className: 'android.widget.TextView', text: 'Loading', bounds: [16, 200, 216, 240] }]);
const androidScreens = {
  home: androidScreen([androidHeader, { className: 'android.widget.TextView', text: 'Home', id: id('home'), bounds: [16, 100, 216, 140] },
    { className: 'android.widget.Button', text: 'Search', id: id('search_open'), clickable: true, bounds: [20, 200, 220, 244] }]),
  search: androidScreen([androidHeader, { className: 'android.widget.EditText', text: '{{typed}}', hint: 'Search', id: id('query'), clickable: true, bounds: [20, 200, 300, 244] },
    { className: 'android.widget.Button', text: 'Go', id: id('go'), clickable: true, bounds: [20, 300, 120, 344] }]),
  loading1: androidLoading, loading2: androidLoading, loading3: androidLoading,
  results: androidScreen([androidHeader, { className: 'android.widget.TextView', text: 'Results', id: id('results'), bounds: [16, 200, 216, 240] }]),
};
const androidScript = { version: 1, platform: 'android', app: { package: 'example.app', activity: '.Main', intentExtras: { route: 'search' } }, device: { serial: SERIAL },
  values: { query: SECRET }, steps: steps(id('query'), id('go'), id('results'), id('home')) };

type Fixture = ReturnType<typeof worldFixture>;
const iosWorld = (rules: WorldRule[] = [], screens: Record<string, string> = iosScreens) => world('ios', screens, [...rules, ...flow]);
function ios(t: TestContext, rules: WorldRule[] = [], timeoutMs?: number, screens?: Record<string, string>) {
  return worldFixture(t, iosWorld(rules, screens), { ...iosTarget, ...(timeoutMs ? { timeoutMs } : {}) });
}
const terminalOf = (admission: Admission, attempt: string) => admission.readAttempt({ kind: 'legacy', id: attempt })!.terminal;
const recoveriesOf = (admission: Admission, attempt: string) => admission.readGeneration(admission.readAttempt({ kind: 'legacy', id: attempt })!.owner).recoveries;
function assertReleased(f: Fixture, attempt = 'run-1') {
  assert.deepEqual(terminalOf(f.admission, attempt), { outcome: 'completed', disposition: 'available', payload: {}, evidenceRefs: [] });
  assert.deepEqual(recoveriesOf(f.admission, attempt), [], 'a clean close never needs a recovery claim');
}
function assertHeld(f: Fixture, device = IOS_DEVICE, attempt = 'run-1') {
  assert.deepEqual(terminalOf(f.admission, attempt), { outcome: 'inconclusive', disposition: 'quarantined', payload: {}, evidenceRefs: [] });
  assert.equal(f.admission.inspect(device)!.state, 'quarantined');
  assert.equal(recoveriesOf(f.admission, attempt).length, 1, 'the uncertain owner is fenced by one recovery claim');
}
const errors = (events: RunEvent[]) => events.filter(event => event.type === 'error').map(event => [event.data.phase, event.data.code, event.data.vendorCode ?? null]);
const pointOf = (call: { params?: { arguments?: Record<string, unknown> } }) => {
  const [move] = (call.params!.arguments!.actions as { actions: { type: string; x?: number; y?: number }[] }[])[0]!.actions;
  return [move!.x, move!.y];
};

/** One run through the bridge service, then a second run on a fresh driver over the same admission and lease root. */
async function runTwice(t: TestContext, f: Fixture, script: object, next: Parameters<Fixture['open']>[0]) {
  const second = f.open(next);
  const b = await bridge(t, [f.driver, second.driver]);
  const first = await b.service.start(script);
  const done = await b.finished(first.runId);
  const events = await readRunEvents(b.service.baseDir, first.runId);
  const report = JSON.parse(await readFile(join(b.runDir(first.runId), 'report.json'), 'utf8')) as Record<string, unknown>;
  const again = async () => (await b.finished((await b.service.start(script)).runId)).report;
  return { b, done, events, report, again, second };
}

test('scripted v1 on iOS: launch options, tap, replace, wait and checkpoint pass on Appium with exact attempts, a masked value, full cleanup and a next admission', async t => {
  const f = ios(t);
  f.fence.wda = [{ udid: UDID, bundleId: WDA_BUNDLE, pid: 777 }];
  const { b, done, events, report, again, second } = await runTwice(t, f, iosScript, iosWorld());
  assert.deepEqual([done.report.verdict, done.report.reason], ['passed', 'ALL_CHECKPOINTS_PASSED']);
  assert.deepEqual(authorized(f.admission, 'run-1'), { 'appium-observe': 3, 'appium-replace-text': 1, 'appium-session-create': 1,
    'appium-tap': 2, 'appium-terminate': 1, launch: 1 });
  assert.deepEqual(f.native.calls[0]!.command.args, ['simctl', 'launch', '--console-pty', '--terminate-running-process', UDID, 'example.app', '-route', 'search']);
  const wire = f.toolCalls();
  assert.deepEqual(wire.filter(call => call.params!.name === 'appium_perform_actions').map(pointOf), [[120, 222], [70, 322]], 'each tap lands once on its target centre');
  assert.deepEqual(wire.filter(call => call.params!.name === 'jev_replace_text').map(call => call.params!.arguments!.locator), [
    { using: '-ios predicate string', value: 'type IN {"XCUIElementTypeTextField", "XCUIElementTypeSecureTextField", "XCUIElementTypeTextView"} AND name == "search.field"' }]);
  assert.deepEqual(f.tools().filter(name => !['appium_get_page_source', 'jev_screen'].includes(name)), ['appium_session_management', 'jev_settings', 'appium_perform_actions',
    'jev_replace_text', 'appium_perform_actions', 'jev_terminate_app', 'appium_session_management']);
  assert.equal(events.find(event => event.type === 'action' && event.data.stepId === 'type')!.data.shownValue, '[REDACTED]');
  assert.deepEqual([report.verdict, report.reason, report.error, report.launchArgs, (report.prepared as { stack: { backend: string } }).stack.backend],
    ['passed', 'ALL_CHECKPOINTS_PASSED', null, ['-route', 'search'], 'appium']);
  assert.deepEqual(await filesContaining(f.root, SECRET), [], 'the typed value is in no bridge-written file, admission store included');
  assert.deepEqual(await filesContaining(b.root, SECRET), []);
  assert.deepEqual(f.fence.effects.filter(effect => effect.kind === 'wda-stop'), [{ kind: 'wda-stop', udid: UDID, bundleId: WDA_BUNDLE, pid: 777 }]);
  assert.deepEqual(f.native.calls.slice(0, 2).map(call => [call.command.kind, call.stops]), [['ios-console', 1], ['ios-log-stream', 1]]);
  assertReleased(f);
  assert.deepEqual([(await again()).verdict, second.tools().at(-1)], ['passed', 'appium_session_management'], 'the next admission on the same device runs and closes');
  assertReleased(f, 'run-2');
});

test('scripted v1 on Android: activity and intent extras restart through the extension, the typed field is redacted in report.json, and every component is fenced', async t => {
  const phone = androidTarget();
  const f = worldFixture(t, world('android', androidScreens, flow), phone.options, phone.nativeReply);
  f.fence.processes.set(5001, '424242'); f.fence.processes.set(5002, '424242');
  f.fence.forwards = [{ serial: SERIAL, local: 'tcp:18200', remote: 'tcp:6790' }];
  const { b, done, events, report, again } = await runTwice(t, f, androidScript, world('android', androidScreens, flow));
  assert.deepEqual([done.report.verdict, done.report.reason], ['passed', 'ALL_CHECKPOINTS_PASSED']);
  assert.deepEqual(authorized(f.admission, 'run-1'), { 'android-wake': 1, 'appium-observe': 3, 'appium-replace-text': 1, 'appium-restart': 1,
    'appium-session-create': 1, 'appium-tap': 2, 'appium-terminate': 1, 'uiautomator2-identity': 1 });
  const wire = f.toolCalls();
  assert.deepEqual(wire.find(call => call.params!.name === 'jev_start_activity')!.params!.arguments, { extensionVersion: 1, sessionId: 'android-session',
    package: 'example.app', activity: '.Main', intentExtras: { route: 'search' } });
  assert.deepEqual(wire.filter(call => call.params!.name === 'appium_perform_actions').map(pointOf), [[120, 222], [70, 322]]);
  assert.deepEqual(wire.find(call => call.params!.name === 'jev_replace_text')!.params!.arguments!.locator, { using: 'id', value: id('query') });
  assert.deepEqual(report.typedFields, [{ stepId: 'type', shownValue: '[REDACTED]' }]);
  assert.deepEqual([report.platform, report.package, report.activity, report.intentExtras], ['android', 'example.app', '.Main', { route: 'search' }]);
  assert.equal(events.find(event => event.type === 'prepared')!.data.serial, SERIAL);
  assert.deepEqual(await filesContaining(f.root, SECRET), []);
  assert.deepEqual(await filesContaining(b.root, SECRET), []);
  assert.deepEqual(f.fence.forwards, [], 'the owned forward is removed');
  assert.equal(f.fence.processes.size, 0, 'both UiAutomator2 processes are stopped');
  assertReleased(f);
  assert.equal((await again()).verdict, 'passed');
  assert.equal(f.admission.inspect(ANDROID_DEVICE)!.state, 'available');
});

test('a secure text field shows only bullets: the shown value is masked and the typed text is in no written file', async t => {
  const screens = { ...iosScreens, search: iosScreen([header, { type: 'SecureTextField', name: 'search.field', label: 'Query', value: '{{typed}}', frame: [20, 200, 300, 44] },
    { type: 'Button', name: 'search.go', label: 'Go', frame: [20, 300, 100, 44] }]) };
  const f = ios(t, [], undefined, screens);
  const { b, done, events } = await runTwice(t, f, iosScript, iosWorld([], screens));
  assert.equal(done.report.verdict, 'passed');
  assert.equal(events.find(event => event.type === 'action' && event.data.stepId === 'type')!.data.shownValue, '•'.repeat(SECRET.length));
  assert.deepEqual([...await filesContaining(f.root, SECRET), ...await filesContaining(b.root, SECRET)], []);
});

test('a run cancelled before it starts sends nothing: no child, no admission, CANCELLED', async t => {
  const f = ios(t);
  const cancelled = new AbortController(); cancelled.abort();
  const report = await withRunLog('cancel-first', log => runScriptedScenario({ runId: 'cancel-first', scenario: iosScript as never, driver: f.driver, judge: passingJudge, log, signal: cancelled.signal }));
  assert.deepEqual([report.verdict, report.reason], ['inconclusive', 'CANCELLED']);
  assert.deepEqual(f.calls(), [], 'the private child never started');
  assert.equal(f.admission.inspect(IOS_DEVICE), undefined, 'the device was never admitted');
});

async function cancelOn(t: TestContext, tool: string) {
  const f = ios(t, [{ tool, nth: 1, fault: { kind: 'held' } }]);
  const b = await bridge(t, [f.driver]);
  const { runId } = await b.service.start(iosScript);
  for (let waited = 0; !f.tools().includes(tool) && waited < 10_000; waited += 20) await delay(20);
  await b.service.cancel(runId);
  return { f, done: await b.finished(runId), events: await readRunEvents(b.service.baseDir, runId) };
}

test('a run cancelled while it observes, before any input: no input is sent, and the device is held as on the legacy path', async t => {
  const { f, done, events } = await cancelOn(t, 'appium_get_page_source');
  assert.deepEqual([done.report.verdict, done.report.reason], ['inconclusive', 'CLEANUP_FAILED']);
  assert.equal(f.tools().includes('appium_perform_actions'), false);
  assert.deepEqual(errors(events), [['observe', 'CANCELLED', null], ['cleanup', 'CLEANUP_FAILED', null]]);
  assertHeld(f);
});

test('a run cancelled after its tap was dispatched: the tap is sent once, never resent, and the device is held', async t => {
  const { f, done, events } = await cancelOn(t, 'appium_perform_actions');
  assert.deepEqual([done.report.verdict, done.report.reason], ['inconclusive', 'CLEANUP_FAILED']);
  assert.equal(f.tools().filter(name => name === 'appium_perform_actions').length, 1);
  assert.deepEqual(authorized(f.admission, 'run-1')['appium-tap'], 1);
  assert.deepEqual(errors(events), [['act', 'CANCELLED', null], ['cleanup', 'CLEANUP_FAILED', null]]);
  assertHeld(f);
});

test('the extension refusing a replacement before input (NOT_UNIQUE) is TARGET_AMBIGUOUS, and the answered command releases the device', async t => {
  const f = ios(t, [{ tool: 'jev_replace_text', fault: { kind: 'error', code: 'NOT_UNIQUE' } }]);
  const { done, events, again } = await runTwice(t, f, iosScript, iosWorld());
  assert.deepEqual([done.report.verdict, done.report.reason], ['inconclusive', 'TARGET_AMBIGUOUS']);
  assert.deepEqual(errors(events), [['act', 'TARGET_AMBIGUOUS', null]]);
  assert.equal(f.tools().filter(name => name === 'jev_replace_text').length, 1);
  assertReleased(f);
  assert.equal((await again()).verdict, 'passed');
});

test('a text field the bridge cannot single out is refused as TARGET_AMBIGUOUS before any input', async t => {
  const screens = { twin: iosScreen([header, { type: 'TextField', name: 'field', label: 'First', frame: [20, 200, 300, 44] }, { type: 'TextField', name: 'field', label: 'Second', frame: [20, 300, 300, 44] }]) };
  const f = ios(t, [], undefined, screens);
  const script = { ...iosScript, steps: [{ id: 'type', kind: 'action', guard: { present: [{ label: 'First' }] }, action: { kind: 'replaceText', selector: { label: 'First' }, valueKey: 'query' } }, iosScript.steps[4]] };
  const { done, events } = await runTwice(t, f, script, iosWorld());
  assert.deepEqual([done.report.verdict, done.report.reason], ['inconclusive', 'TARGET_AMBIGUOUS']);
  assert.deepEqual(errors(events), [['act', 'TARGET_AMBIGUOUS', null]]);
  assert.equal(f.tools().includes('jev_replace_text'), false);
  assert.equal(authorized(f.admission, 'run-1')['appium-replace-text'], undefined);
  assertReleased(f);
});

test('a late reply inside the deadline completes the step once, with no resend', async t => {
  const f = ios(t, [{ tool: 'appium_perform_actions', nth: 1, when: 'home', to: 'search', fault: { kind: 'late', ms: 400 } }]);
  const { done } = await runTwice(t, f, iosScript, iosWorld());
  assert.equal(done.report.verdict, 'passed');
  assert.equal(f.tools().filter(name => name === 'appium_perform_actions').length, 2);
  assertReleased(f);
});

for (const [name, fault, sentTap] of [
  ['a reply lost past the deadline', { kind: 'lost' }, true],
  ['the private MCP child dying on the tap', { kind: 'exit', code: 9 }, true],
  ['the provider closing its output on the tap', { kind: 'disconnect' }, true],
  ['a malformed JSON-RPC reply to the tap', { kind: 'malformed' }, true],
  ['a tap acknowledgement that fails the result schema', { kind: 'schema' }, true],
] as const) {
  test(`${name}: the tap is sent once and never resent, the step is unconfirmed, and the device is held so the next admission is refused`, async t => {
    const f = ios(t, [{ tool: 'appium_perform_actions', nth: 1, fault }], 8000);
    const { done, events, again } = await runTwice(t, f, iosScript, iosWorld());
    assert.deepEqual([done.report.verdict, done.report.reason], ['inconclusive', 'CLEANUP_FAILED']);
    assert.deepEqual(errors(events), [['act', 'UI_ACTION_UNCONFIRMED', null], ['cleanup', 'CLEANUP_FAILED', null]]);
    assert.equal(f.tools().filter(tool => tool === 'appium_perform_actions').length, sentTap ? 1 : 0);
    assert.equal(f.tools().includes('jev_terminate_app'), false, 'nothing more is sent to an unconfirmed session');
    assertHeld(f);
    assert.deepEqual([(await again()).reason], ['DEVICE_QUARANTINED']);
  });
}

test('a tap the provider answers with DRIVER_ERROR is unconfirmed: it is sent once and nothing more is sent to that session', async t => {
  const f = ios(t, [{ tool: 'appium_perform_actions', nth: 1, fault: { kind: 'error', code: 'DRIVER_ERROR' } }]);
  const { events } = await runTwice(t, f, iosScript, iosWorld());
  assert.deepEqual(errors(events)[0], ['act', 'UI_ACTION_UNCONFIRMED', null]);
  assert.deepEqual(f.tools().slice(f.tools().indexOf('appium_perform_actions')), ['appium_perform_actions', 'appium_session_management']);
});

test('a run that reports UI_ACTION_UNCONFIRMED keeps the device, as the legacy drivers do when an input is unconfirmed',
  { todo: 'D2 (reported to the root): an answered DRIVER_ERROR tap is reported unconfirmed but finalizes completed and available' }, async t => {
    const f = ios(t, [{ tool: 'appium_perform_actions', nth: 1, fault: { kind: 'error', code: 'DRIVER_ERROR' } }]);
    const { done } = await runTwice(t, f, iosScript, iosWorld());
    assert.deepEqual([done.report.verdict, done.report.reason], ['inconclusive', 'CLEANUP_FAILED']);
    assertHeld(f);
  });

test('the private MCP child dying during an observation, before any input: no input is sent and the device is held for recovery', async t => {
  const f = ios(t, [{ tool: 'appium_get_page_source', nth: 1, fault: { kind: 'exit', code: 9 } }], 8000);
  const { done, events } = await runTwice(t, f, iosScript, iosWorld());
  assert.deepEqual([done.report.verdict, done.report.reason], ['inconclusive', 'CLEANUP_FAILED']);
  assert.equal(errors(events)[0]![0], 'observe');
  assert.equal(f.tools().includes('appium_perform_actions'), false);
  assertHeld(f);
});

test('an Android phone that disconnects during a tap: the fence cannot revalidate the serial, so nothing is released and the next admission is refused', async t => {
  const phone = androidTarget();
  const f = worldFixture(t, world('android', androidScreens, [{ tool: 'appium_perform_actions', nth: 1, fault: { kind: 'exit', code: 9 } }, ...flow]), phone.options, phone.nativeReply);
  f.fence.forwards = [{ serial: SERIAL, local: 'tcp:18200', remote: 'tcp:6790' }];
  const b = await bridge(t, [f.driver, f.open(world('android', androidScreens, flow)).driver]);
  const { runId } = await b.service.start(androidScript);
  for (let waited = 0; !f.tools().includes('appium_perform_actions') && waited < 10_000; waited += 20) await delay(20);
  phone.device.state = 'offline';
  const done = await b.finished(runId);
  assert.deepEqual([done.report.verdict, done.report.reason], ['inconclusive', 'CLEANUP_FAILED']);
  assert.deepEqual(f.fence.forwards, [{ serial: SERIAL, local: 'tcp:18200', remote: 'tcp:6790' }], 'no effect names a serial the phone no longer answers at');
  assert.equal(f.admission.inspect(ANDROID_DEVICE)!.state, 'quarantined');
  phone.device.state = 'device';
  assert.equal((await b.finished((await b.service.start(androidScript)).runId)).report.reason, 'DEVICE_QUARANTINED');
});

test('a screen that never settles is recorded as still changing, and the step acts on the last capture once, as on Android today', async t => {
  const ticking = { ...iosScreens, home2: iosScreens.home.replace('label="Home"', 'label="Home" value="tick"') };
  const rules: WorldRule[] = [{ tool: 'appium_get_page_source', when: 'home', to: 'home2' }, { tool: 'appium_get_page_source', when: 'home2', to: 'home' },
    { tool: 'appium_perform_actions', when: 'home2', to: 'search' }];
  const f = ios(t, rules, undefined, ticking);
  const { done, events } = await runTwice(t, f, iosScript, iosWorld());
  assert.equal(done.report.verdict, 'passed');
  assert.equal(events.find(event => event.type === 'step' && event.data.stepId === 'open')!.data.settled, false);
  assert.equal(f.tools().filter(name => name === 'appium_perform_actions').length, 2, 'one tap per tap step');
  assertReleased(f);
});

test('malformed and schema-invalid scripts are refused before any device work', async t => {
  const f = ios(t);
  const b = await bridge(t, [f.driver]);
  await assert.rejects(b.service.start('{"version": 1, "app": '));
  await assert.rejects(b.service.start({ ...iosScript, steps: [{ id: 'open', kind: 'action', guard: { present: [{ identifier: 'home' }] }, action: { kind: 'pinch' } }] }));
  assert.deepEqual(f.calls(), []);
  assert.equal(f.admission.inspect(IOS_DEVICE), undefined);
});

test('a stack whose private client SDK does not match the frozen manifest is refused before the child starts or any session opens', async t => {
  const f = ios(t);
  const stack = f.driver['options'].stack;
  const tampered = { ...stack, manifest: { ...stack.manifest, packages: stack.manifest.packages.map(pkg => pkg.name === '@modelcontextprotocol/sdk' ? { ...pkg, integrity: 'sha512-tampered' } : pkg) } };
  const refused = f.open(iosWorld(), { stack: tampered });
  const b = await bridge(t, [refused.driver]);
  const done = await b.finished((await b.service.start(iosScript)).runId);
  assert.deepEqual([done.report.verdict, done.report.reason], ['inconclusive', 'DEVICE_ERROR']);
  const events = await readRunEvents(b.service.baseDir, done.report.runId);
  assert.deepEqual(events.filter(event => event.type === 'error').map(event => [event.data.code, event.data.vendorCode, event.data.vendorSource]), [['DEVICE_ERROR', 'SDK_IDENTITY_MISMATCH', 'appium']]);
  assert.deepEqual(refused.calls(), []);
  assert.equal(f.admission.inspect(IOS_DEVICE)!.state, 'available');
});

test.todo('P3.10: `jev-ios-bridge run <script>` on the Appium composition exits 0 for passed, 1 for failed, 2 for inconclusive and 3 for could-not-start, with the same --json report as run_scenario');
test.todo('P3.10: MCP run_scenario and get_report on the Appium composition return the same envelopes as tests/golden/report-json.json, plus prepared.stack and error.vendorSource');
test.todo('P3.10: a tampered stack archive, extraction marker, manifest or WDA runner is refused at composition before the driver opens any session (packaging proof, both archives)');
