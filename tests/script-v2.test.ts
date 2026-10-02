/**
 * Script format version 2: the `do` step, top-level `goal` and `start`. Version 1 behaviour is pinned by
 * tests/scripted-schema-parity.test.ts and tests/golden/scripts.json; this file covers what version 2 adds.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { z } from 'zod/v4';
import type { DeviceDriver, RunEvent, RunLog } from '../src/contracts/index.js';
import type { ScriptedScenario } from '../src/scripted/contracts.js';
import { runScriptedScenario } from '../src/scripted/run.js';
import { DRIVEN_SCRIPT_VERSION, parseScriptedScenario, parseScriptedScenarioSource, resolveScriptValues,
  safeParseScriptedScenario, SCRIPT_VERSION, scriptedScenarioSchema } from '../src/scripted/schema.js';

type Script = Record<string, any>;

const checkpoint = { id: 'verify', kind: 'checkpoint', guard: { present: [{ role: 'text', label: 'Marker' }] },
  assertions: [{ id: 'shown', claim: 'The marker is visible.' }] };
const doStep = { id: 'signIn', kind: 'do', intent: 'Sign in with the test account',
  doneWhen: 'The home screen shows the account name', effect: 'none' };

const iosV2: Script = { version: 2, app: { bundleId: 'com.example.app' }, values: { user: 'ops@example.com' },
  steps: [doStep, checkpoint] };
const androidV2: Script = { version: 2, platform: 'android', app: { package: 'com.example.app' },
  values: { user: 'ops@example.com' }, steps: [doStep, checkpoint] };

const clone = (script: Script): Script => structuredClone(script);

/** The issues a script gets from the parse the bridge runs, as path and message, or [] when it's accepted. */
function issuesOf(input: unknown): Array<{ path: string; message: string }> {
  const parsed = safeParseScriptedScenario(input);
  return parsed.success ? []
    : parsed.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message }));
}

function withStep(script: Script, step: Script): Script {
  return { ...clone(script), steps: [step, checkpoint] };
}

test('the script version vocabulary stays 1, with 2 beside it for driven scripts', () => {
  assert.equal(SCRIPT_VERSION, 1);
  assert.equal(DRIVEN_SCRIPT_VERSION, 2);
});

test('a version 2 script with a do step, goal and start parses on iOS and Android', () => {
  for (const base of [iosV2, androidV2]) {
    const input = { ...clone(base), goal: 'Reach the home screen signed in', start: 'attach',
      steps: [{ ...doStep, effect: 'test_write', values: ['user'], localOnly: true }, checkpoint] };
    const parsed = parseScriptedScenario(input);
    assert.equal(parsed.version, 2);
    assert.equal(parsed.goal, 'Reach the home screen signed in');
    assert.equal(parsed.start, 'attach');
    assert.deepEqual(parsed.steps[0], { id: 'signIn', kind: 'do', intent: 'Sign in with the test account',
      doneWhen: 'The home screen shows the account name', effect: 'test_write', values: ['user'], localOnly: true });
  }
});

test('a version 2 script mixes do steps with action, wait and checkpoint steps', () => {
  const action = { id: 'open', kind: 'action', guard: { present: [{ label: 'Menu' }] },
    action: { kind: 'tap', selector: { label: 'Menu' } } };
  const wait = { id: 'loaded', kind: 'wait', guard: { present: [{ label: 'Menu' }] },
    until: { present: [{ label: 'Home' }] }, timeoutMs: 1_000 };
  const second = { ...doStep, id: 'second', effect: 'destructive' };
  assert.deepEqual(issuesOf({ ...clone(iosV2), steps: [action, doStep, wait, { ...checkpoint, id: 'midway' }, second, checkpoint] }), []);
});

test('goal and start are optional in version 2; start is restart or attach', () => {
  assert.deepEqual(issuesOf({ ...clone(iosV2), start: 'restart' }), []);
  assert.deepEqual(issuesOf({ ...clone(iosV2), start: 'reuse' }),
    [{ path: 'start', message: 'start must be "restart" or "attach"' }]);
  assert.deepEqual(issuesOf({ ...clone(iosV2), goal: '' }),
    [{ path: 'goal', message: 'goal must be 1 to 500 characters' }]);
  assert.deepEqual(issuesOf({ ...clone(iosV2), goal: '   ' }),
    [{ path: 'goal', message: 'goal must be 1 to 500 characters' }]);
  assert.deepEqual(issuesOf({ ...clone(iosV2), goal: 'x'.repeat(501) }),
    [{ path: 'goal', message: 'goal must be 1 to 500 characters' }]);
  assert.deepEqual(issuesOf({ ...clone(iosV2), goal: 'x'.repeat(500) }), []);
});

test('a do step needs intent and doneWhen of 1 to 500 characters', () => {
  for (const field of ['intent', 'doneWhen']) {
    for (const bad of ['', '  ', 'x'.repeat(501)]) {
      assert.deepEqual(issuesOf(withStep(iosV2, { ...doStep, [field]: bad })),
        [{ path: `steps.0.${field}`, message: `A do step's ${field} must be 1 to 500 characters` }], `${field}: ${bad.length}`);
    }
    assert.deepEqual(issuesOf(withStep(iosV2, { ...doStep, [field]: 'x'.repeat(500) })), []);
    const { [field]: _omitted, ...without } = doStep as Script;
    assert.deepEqual(issuesOf(withStep(iosV2, without)),
      [{ path: `steps.0.${field}`, message: `A do step's ${field} must be 1 to 500 characters` }]);
  }
});

test('a do step needs an effect of none, test_write or destructive', () => {
  for (const effect of ['none', 'test_write', 'destructive']) {
    assert.deepEqual(issuesOf(withStep(iosV2, { ...doStep, effect })), []);
  }
  const { effect: _effect, ...without } = doStep;
  for (const step of [without, { ...doStep, effect: 'write' }]) {
    assert.deepEqual(issuesOf(withStep(iosV2, step)),
      [{ path: 'steps.0.effect', message: 'A do step\'s effect must be "none", "test_write" or "destructive"' }]);
  }
});

test('a do step\'s values must each name a supplied value', () => {
  assert.deepEqual(issuesOf(withStep(iosV2, { ...doStep, values: [] })), []);
  assert.deepEqual(issuesOf(withStep(iosV2, { ...doStep, values: ['user', 'password'] })),
    [{ path: 'steps.0.values.1', message: 'A do step\'s values must each name a supplied value' }]);
  assert.deepEqual(issuesOf(withStep(androidV2, { ...doStep, values: ['missing'] })),
    [{ path: 'steps.0.values.0', message: 'A do step\'s values must each name a supplied value' }]);
  assert.equal(issuesOf(withStep(iosV2, { ...doStep, values: ['not a key'] }))[0]?.path, 'steps.0.values.0');
  assert.equal(issuesOf(withStep(iosV2, { ...doStep, values: 'user' }))[0]?.path, 'steps.0.values');
});

test('a do step\'s values may name a value read from the environment', () => {
  const input = { ...withStep(iosV2, { ...doStep, values: ['password'] }), values: { password: { fromEnv: 'TEST_PASSWORD' } } };
  const source = parseScriptedScenarioSource(input);
  assert.deepEqual(source.values, { password: { fromEnv: 'TEST_PASSWORD' } });
  const resolved = resolveScriptValues(source, { TEST_PASSWORD: 'secret-for-test' });
  assert.equal(resolved.values.password, 'secret-for-test');
  assert.equal(resolved.version, 2);
  assert.deepEqual(resolved.steps[0], { ...doStep, values: ['password'] });
  assert.throws(() => parseScriptedScenario(input), /resolveScriptValues/);
});

test('localOnly is a boolean', () => {
  assert.deepEqual(issuesOf(withStep(iosV2, { ...doStep, localOnly: false })), []);
  assert.equal(issuesOf(withStep(iosV2, { ...doStep, localOnly: 'yes' }))[0]?.path, 'steps.0.localOnly');
});

test('a do step has no guard, and takes no other unknown field', () => {
  assert.deepEqual(issuesOf(withStep(iosV2, { ...doStep, guard: { present: [{ label: 'Marker' }] } })),
    [{ path: 'steps.0.guard', message: 'A do step has no guard: the bridge reads the screen itself' }]);
  assert.equal(issuesOf(withStep(iosV2, { ...doStep, selector: { label: 'Go' } }))[0]?.message,
    'Unrecognized key: "selector"');
});

test('version 2 keeps version 1\'s step rules: unique IDs and a final checkpoint', () => {
  assert.deepEqual(issuesOf({ ...clone(iosV2), steps: [doStep, { ...checkpoint, id: doStep.id }] }),
    [{ path: 'steps.1.id', message: 'Step IDs must be unique' }]);
  assert.deepEqual(issuesOf({ ...clone(iosV2), steps: [checkpoint, doStep] }),
    [{ path: 'steps', message: 'A script must end at an assertion checkpoint' }]);
  assert.deepEqual(issuesOf({ ...clone(iosV2), steps: [{ ...doStep, id: '1bad' }, checkpoint] })[0]?.path, 'steps.0.id');
});

test('version 2 keeps each platform\'s own field and value rules', () => {
  assert.deepEqual(issuesOf({ ...clone(iosV2), values: { user: '-flag' } }),
    [{ path: 'values', message: 'MobileBuildMCP 2.7.1 cannot type text starting with a leading hyphen' }]);
  assert.deepEqual(issuesOf({ ...clone(androidV2), values: { user: '-Đà Nẵng' } }), []);
  assert.deepEqual(issuesOf({ ...clone(androidV2), app: { bundleId: 'com.example.app', package: 'com.example.app' } }),
    [{ path: 'app.bundleId', message: 'app.bundleId is not supported on Android; use app.package' }]);
});

test('a version 1 script with a do step, goal or start is told to use version 2', () => {
  for (const base of [iosV2, androidV2]) {
    const v1 = { ...clone(base), version: 1 };
    assert.deepEqual(issuesOf(v1),
      [{ path: 'steps.0', message: 'A "do" step needs "version": 2; this script says "version": 1' }]);
    const plain = { ...v1, steps: [checkpoint] };
    assert.deepEqual(issuesOf({ ...plain, goal: 'Reach home' }),
      [{ path: 'goal', message: '"goal" needs "version": 2; this script says "version": 1' }]);
    assert.deepEqual(issuesOf({ ...plain, start: 'attach' }),
      [{ path: 'start', message: '"start" needs "version": 2; this script says "version": 1' }]);
  }
});

test('the old goal-mode form, a version 1 goal beside top-level assertions, reads exactly as in 1.2', () => {
  // tests/golden/scripts.json (legacyGoalForm) freezes this.
  assert.deepEqual(issuesOf({ version: 1, goal: 'Open settings', app: { bundleId: 'com.example.app' }, values: {},
    assertions: [{ id: 'shown', claim: 'Settings are open.' }] }), [
    { path: 'steps', message: 'Invalid input: expected array, received undefined' },
    { path: '', message: 'Unrecognized keys: "goal", "assertions"' },
  ]);
});

test('a version 1 script\'s other issues still read as before beside the version 2 hint', () => {
  const v1 = { version: 1, app: {}, values: {}, steps: [doStep, checkpoint] };
  assert.deepEqual(issuesOf(v1).map(issue => issue.path), ['app.bundleId', 'steps.0']);
});

test('a script with a version 2 field but no version, or a version other than 1 or 2, is told about version 2', () => {
  const { version: _version, ...noVersion } = iosV2;
  assert.deepEqual(issuesOf(noVersion), [{ path: 'version',
    message: 'Add "version": 2 to the script; a script with a "do" step, "goal" or "start" uses script format version 2' }]);
  for (const version of [3, '2', 0]) {
    assert.deepEqual(issuesOf({ ...clone(iosV2), version }), [{ path: 'version',
      message: 'Unsupported script version; a script with a "do" step, "goal" or "start" needs "version": 2' }]);
  }
});

test('a "version": 2 script with no version 2 field reads exactly as in 1.2', () => {
  // tests/golden/scripts.json (futureVersion) and tests/scripted-schema-parity.test.ts pin this: until a script
  // uses a do step, goal or start, "version": 2 gets 1.2's message.
  assert.deepEqual(issuesOf({ ...clone(iosV2), steps: [checkpoint] }),
    [{ path: 'version', message: 'Unsupported script version; this bridge reads "version": 1' }]);
  assert.deepEqual(issuesOf({ ...clone(androidV2), steps: [checkpoint] }),
    [{ path: 'version', message: 'Unsupported script version; this bridge reads "version": 1' }]);
});

test('the MCP tool validates version 2 exactly as the platform parse does', () => {
  for (const input of [iosV2, androidV2, withStep(iosV2, { ...doStep, effect: 'oops' }), { ...clone(iosV2), version: 1 }]) {
    const direct = safeParseScriptedScenario(input);
    const mcp = scriptedScenarioSchema.safeParse(input);
    assert.equal(mcp.success, direct.success);
    if (!mcp.success && !direct.success) {
      assert.deepEqual(mcp.error.issues.map(issue => [issue.path, issue.message]),
        direct.error.issues.map(issue => [issue.path, issue.message]));
    }
  }
});

test('the published MCP schema describes version 2, the do step, goal, start and fromEnv values', () => {
  const json = JSON.stringify(z.toJSONSchema(scriptedScenarioSchema, { io: 'input' }));
  const published = JSON.parse(json) as { properties: Record<string, any> };
  assert.deepEqual(published.properties.version.enum, [1, 2]);
  assert.deepEqual(published.properties.start.enum, ['restart', 'attach']);
  assert.equal(published.properties.goal.maxLength, 500);
  const stepKinds = (published.properties.steps.items.oneOf ?? published.properties.steps.items.anyOf)
    .map((step: any) => step.properties.kind.const);
  assert.deepEqual(stepKinds, ['action', 'wait', 'checkpoint', 'do']);
  assert.ok(json.includes('"fromEnv"'));
  assert.ok(json.includes('"doneWhen"'));
  assert.ok(json.includes('"localOnly"'));
});

function recordingLog(): RunLog & { events: RunEvent[] } {
  const events: RunEvent[] = [];
  return { events,
    async append(type, data) { events.push({ version: 1, runId: 'v2', sequence: events.length + 1,
      at: new Date().toISOString(), type, data }); },
    async read() { return events; },
  };
}

test('the run loop refuses a do step before touching the device when it was given no driven seams', async () => {
  const touched: string[] = [];
  const driver: DeviceDriver = {
    async prepare() { touched.push('prepare'); },
    async observe() { touched.push('observe'); throw new Error('unreachable'); },
    async act() { touched.push('act'); },
    async close() { touched.push('close'); },
  };
  const log = recordingLog();
  const scenario = parseScriptedScenario(iosV2) as ScriptedScenario;
  await assert.rejects(runScriptedScenario({ runId: 'v2', scenario, driver, log,
    judge: { async judge() { throw new Error('unreachable'); } } }),
  { message: 'This run can\'t perform "do" steps: step signIn is a do step, and the run was given no driven judge or hand-back' });
  assert.deepEqual(touched, []);
  assert.deepEqual(log.events, []);
});

test('the run loop runs start: attach, passing the start mode to prepare (Issue 11 removed the stop-gap refusal)', async () => {
  const prepared: unknown[] = [];
  const driver: DeviceDriver = {
    async prepare(context) { prepared.push(context); },
    async observe() { throw new Error('the screen is not needed here'); },
    async act() {},
    async close() {},
  };
  const log = recordingLog();
  const scenario = parseScriptedScenario({ ...clone(iosV2), start: 'attach', steps: [checkpoint] });
  await runScriptedScenario({ runId: 'v2', scenario, driver, log, judge: { async judge() { throw new Error('unreachable'); } } });
  assert.deepEqual(prepared, [{ app: { bundleId: 'com.example.app' }, start: 'attach' }]);
  assert.equal(log.events[0]?.data.start, 'attach');
});

test('the script-format reference\'s version 2 example parses as version 2', async () => {
  const page = await readFile('docs/guide/reference/script-format.md', 'utf8');
  const section = page.slice(page.indexOf('## Version 2'));
  const example = /```json\n([\s\S]*?)```/.exec(section)?.[1];
  assert.ok(example, 'the version 2 section has a JSON example');
  const parsed = parseScriptedScenarioSource(JSON.parse(example));
  assert.equal(parsed.version, 2);
  assert.ok(parsed.steps.some(step => step.kind === 'do'));
});
