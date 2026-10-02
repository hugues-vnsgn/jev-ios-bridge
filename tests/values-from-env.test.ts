import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod/v4';
import type { ActionScenarioContext, DeviceDriver, Element, Snapshot } from '../src/contracts/index.js';
import type { ScriptedScenario } from '../src/scripted/contracts.js';
import {
  parseScriptedScenario, parseScriptedScenarioSource, resolveScriptValues, safeParseScriptedScenario,
  scriptedScenarioSchema, ScriptValueError,
} from '../src/scripted/schema.js';
import { renderScriptedReport } from '../src/scripted/report.js';
import { BridgeService } from '../src/service.js';
import { attachLogPane } from '../src/logpane/attach.js';
import { Capture } from './fixtures/capture.js';
import { openMcpSession } from './fixtures/mcp-session.js';

const execute = promisify(execFile);

const checkpoint = { id: 'verify', kind: 'checkpoint', guard: { present: [{ role: 'text', label: 'Marker' }] },
  assertions: [{ id: 'shown', claim: 'The marker is visible.' }] };
const iosScript = (values: Record<string, unknown>) => ({ version: 1, app: { bundleId: 'com.example.app' }, values, steps: [checkpoint] });
const androidScript = (values: Record<string, unknown>) => ({ version: 1, platform: 'android',
  app: { package: 'com.example.app' }, device: { serial: 'emulator-5554' }, values, steps: [checkpoint] });

// ---------- Schema ----------

test('a value may name an environment variable, on iOS, on Android and in the MCP schema', () => {
  for (const script of [iosScript({ password: { fromEnv: 'APP_PASSWORD' } }), androidScript({ password: { fromEnv: 'APP_PASSWORD' } })]) {
    assert.deepEqual(parseScriptedScenarioSource(script).values, { password: { fromEnv: 'APP_PASSWORD' } });
    assert.ok(safeParseScriptedScenario(script).success);
    assert.ok(scriptedScenarioSchema.safeParse(script).success);
  }
});

test('a fromEnv entry takes exactly one variable name, and the name has the shell\'s shape', () => {
  for (const value of [{ fromEnv: '' }, { fromEnv: '1PASSWORD' }, { fromEnv: 'HAS SPACE' }, { fromEnv: 'A=B' },
    { fromEnv: 'OK', default: 'x' }, {}, { fromEnv: 42 }]) {
    for (const script of [iosScript({ password: value }), androidScript({ password: value })]) {
      assert.equal(safeParseScriptedScenario(script).success, false, JSON.stringify(value));
    }
  }
  assert.ok(safeParseScriptedScenario(iosScript({ a: { fromEnv: '_lower_ok_1' } })).success);
});

test('a literal value keeps its platform rules and their messages', () => {
  const ios = safeParseScriptedScenario(iosScript({ query: 'Đà Nẵng' }));
  assert.equal(ios.success, false);
  assert.match(z.prettifyError(ios.error!), /printable US keyboard characters/);
  const hyphen = safeParseScriptedScenario(iosScript({ query: '-Berlin', other: { fromEnv: 'X' } }));
  assert.match(z.prettifyError(hyphen.error!), /leading hyphen/);
  const android = safeParseScriptedScenario(androidScript({ query: 'a\u0007b' }));
  assert.match(z.prettifyError(android.error!), /control characters/);
});

test('resolving reads each variable once and returns a script of literal values only', () => {
  const source = parseScriptedScenarioSource(iosScript({ user: 'ops@example.com', password: { fromEnv: 'APP_PASSWORD' } }));
  const reads: string[] = [];
  const env = new Proxy({ APP_PASSWORD: 'synthetic-pass-1' } as Record<string, string>, {
    get(target, name: string) { reads.push(name); return target[name]; },
  });
  const resolved = resolveScriptValues(source, env);
  assert.deepEqual(resolved.values, { user: 'ops@example.com', password: 'synthetic-pass-1' });
  assert.deepEqual(reads, ['APP_PASSWORD']);
  // The source is left as written.
  assert.deepEqual(source.values.password, { fromEnv: 'APP_PASSWORD' });
  // A resolved script reads like any literal script.
  assert.deepEqual(parseScriptedScenario(resolved), resolved);
});

test('a literal-only script resolves to exactly what parseScriptedScenario returns', () => {
  const script = androidScript({ name: 'Ann' });
  assert.deepEqual(resolveScriptValues(parseScriptedScenarioSource(script), {}), parseScriptedScenario(script));
});

test('parseScriptedScenario refuses a script whose values are not resolved yet', () => {
  assert.throws(() => parseScriptedScenario(iosScript({ password: { fromEnv: 'P' } })), /resolve/i);
});

test('a missing or empty variable is MISSING_VALUE, naming the variable and the key, never a value', () => {
  const source = parseScriptedScenarioSource(androidScript({ user: 'synthetic-user-3b', password: { fromEnv: 'APP_PASSWORD' } }));
  for (const env of [{}, { APP_PASSWORD: '' }, { OTHER: 'synthetic-other-5d' }]) {
    assert.throws(() => resolveScriptValues(source, env), (error: unknown) => {
      assert.ok(error instanceof ScriptValueError);
      assert.equal(error.reason, 'MISSING_VALUE');
      assert.match(error.message, /APP_PASSWORD/);
      assert.match(error.message, /values\.password/);
      assert.ok(!error.message.includes('synthetic-'));
      return true;
    });
  }
});

test('platform value rules run on the resolved value, and the message never carries it', () => {
  const cases: Array<[unknown, string, RegExp]> = [
    [iosScript({ p: { fromEnv: 'V' } }), 'Đà-synthetic', /printable US keyboard characters/],
    [iosScript({ p: { fromEnv: 'V' } }), '-synthetic', /leading hyphen/],
    [iosScript({ p: { fromEnv: 'V' } }), 'synthetic'.repeat(300), /2048/],
    [androidScript({ p: { fromEnv: 'V' } }), 'synthetic\u0007', /control characters/],
    [androidScript({ p: { fromEnv: 'V' } }), 'synthetic'.repeat(300), /2048/],
  ];
  for (const [script, value, message] of cases) {
    assert.throws(() => resolveScriptValues(parseScriptedScenarioSource(script), { V: value }), (error: unknown) => {
      assert.ok(error instanceof ScriptValueError);
      assert.notEqual(error.reason, 'MISSING_VALUE');
      assert.match(error.message, message);
      assert.match(error.message, /values\.p\b.*\bV\b/);
      assert.ok(!error.message.includes('synthetic'));
      return true;
    });
  }
  // Android allows what iOS doesn't.
  assert.equal(resolveScriptValues(parseScriptedScenarioSource(androidScript({ p: { fromEnv: 'V' } })), { V: '-Đà Nẵng' }).values.p, '-Đà Nẵng');
});

// ---------- Service ----------

const marker = (label: string, ref = 'marker'): Element => ({ ref, role: 'text', label, actions: [],
  frame: { x: 0, y: 40, width: 100, height: 30 }, state: { enabled: true, visible: true } });
const screen = (elements: Element[]): Snapshot => ({ deviceId: 'test', sequence: 1, capturedAt: Date.now(),
  expiresAt: Date.now() + 60_000, truncated: false, elements });
const field: Element = { ref: 'password-field', role: 'text-field', identifier: 'password-field', actions: ['typeText'],
  frame: { x: 0, y: 0, width: 100, height: 30 }, state: { enabled: true, visible: true } };
const loginScript = (platform: 'ios' | 'android') => ({
  ...(platform === 'android' ? androidScript({}) : iosScript({})),
  values: { password: { fromEnv: 'JEV_TEST_PASSWORD' } },
  steps: [
    { id: 'type', kind: 'action', guard: { present: [{ identifier: 'password-field' }] },
      action: { kind: 'replaceText', selector: { identifier: 'password-field' }, valueKey: 'password' } },
    checkpoint,
  ],
});
const passingJudge = { async judge() { return { probabilities: { shown: 0.97 }, inputTokens: 1, latencyMs: 1, model: 'jev-1.13.0' }; } };

async function until(check: () => boolean): Promise<void> {
  for (let tries = 0; !check(); tries++) {
    if (tries > 300) assert.fail('timed out waiting');
    await new Promise(done => setTimeout(done, 10));
  }
}

for (const platform of ['ios', 'android'] as const) {
  test(`${platform}: the service types the variable's value; driver and run see only resolved strings`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'jev-from-env-'));
    const typed: string[] = [];
    const scenarios: ScriptedScenario[] = [];
    const service = new BridgeService({ baseDir: root, env: { JEV_TEST_PASSWORD: 'synthetic-pass-2' },
      createDriver: scenario => {
        scenarios.push(scenario);
        let done = false;
        return { async prepare() {}, async observe() { return screen(done ? [marker('Marker')] : [field]); },
          async act(action, _snapshot, context: ActionScenarioContext) {
            if (action.kind === 'type') typed.push(context.values[action.valueKey]!);
            done = true;
            return screen([marker('Marker')]);
          }, async close() {} } satisfies DeviceDriver;
      },
      createJudge: () => passingJudge });
    try {
      const { runId } = await service.start(loginScript(platform));
      const { report } = await service.status(runId, 3_000);
      assert.equal(report.verdict, 'passed');
      assert.deepEqual(typed, ['synthetic-pass-2']);
      assert.deepEqual(scenarios.map(scenario => scenario.values), [{ password: 'synthetic-pass-2' }]);
    } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
  });
}

test('a missing variable fails start with MISSING_VALUE before any driver is built or evidence written', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-from-env-missing-'));
  let built = 0;
  const service = new BridgeService({ baseDir: root, env: {},
    createDriver: () => { built++; return { async prepare() { assert.fail('no device'); }, async observe() { return screen([]); },
      async act() { assert.fail('no device'); }, async close() {} }; },
    createJudge: () => { built++; return passingJudge; } });
  try {
    await assert.rejects(service.start(loginScript('ios')), (error: unknown) =>
      error instanceof ScriptValueError && error.reason === 'MISSING_VALUE' && /JEV_TEST_PASSWORD/.test(error.message));
    assert.equal(built, 0);
    assert.deepEqual(await readdir(root), []);
  } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
});

test('a fromEnv value never appears in the script, run.jsonl, report.json, the watch page, the log pane or the reports', async () => {
  const secret = 'synthetic-from-env-4e2b';
  const root = await mkdtemp(join(tmpdir(), 'jev-from-env-leak-'));
  const logcat = join(root, 'app.log');
  await writeFile(logcat, `2026-09-28 23:16:14.927 10226  9784  9784 I System.out: login as ${secret}\n`);
  let release!: () => void;
  const held = new Promise<void>(done => { release = done; });
  const notices: string[] = [];
  const service = new BridgeService({ baseDir: join(root, 'runs'), env: { JEV_TEST_PASSWORD: secret },
    createDriver: () => {
      let done = false;
      return { async prepare() {}, logSources: () => ({ logcat }), appRunning: () => true,
        async observe() { await held; return screen(done ? [marker('Marker'), marker(`Welcome ${secret}`, 'greeting')] : [field]); },
        async act() { done = true; return { screen: screen([marker('Marker'), marker(`Welcome ${secret}`, 'greeting')]), shownValue: secret }; },
        async close() {} };
    },
    createJudge: () => passingJudge,
    logPane: { cliPath: '/bridge/cli.js', openWindow: false, onNotice: (_runId, text) => { notices.push(text); } } });
  const script = loginScript('android');
  const pane = new Capture();
  try {
    assert.ok(!JSON.stringify(script).includes(secret));
    const start = await service.start(script);
    assert.ok(!JSON.stringify(start).includes(secret));
    await until(() => notices.length > 0);
    const attached = attachLogPane(start.runId, pane as unknown as NodeJS.WriteStream, { keepOpen: false });
    await until(() => pane.text.includes('login as'));
    release();
    const { state, report } = await service.status(start.runId, 3_000);
    assert.equal(state, 'finished');
    assert.equal(report.verdict, 'passed');
    await attached;
    const directory = join(root, 'runs', start.runId);
    const written = (await readdir(directory)).filter(name => !/^screen-\d+\.(jpg|png)$/.test(name)).sort();
    assert.deepEqual(written, ['report.json', 'run.jsonl']);
    const files = await Promise.all(written.map(name => readFile(join(directory, name), 'utf8')));
    const url = new URL(start.watchUrl);
    const events = await fetch(`${url.origin}/events?run=${start.runId}`,
      { headers: { Authorization: `Bearer ${url.searchParams.get('token')}` } });
    assert.equal(events.status, 200);
    const surfaces: Record<string, string> = {
      'run.jsonl': files[1]!, 'report.json': files[0]!, 'watch page': await events.text(),
      'log pane': pane.text, 'prose report': renderScriptedReport(report),
      'report json': JSON.stringify(await service.reportJson(start.runId)),
    };
    assert.match(surfaces['log pane']!, /login as \[value:password\]/);
    for (const [name, text] of Object.entries(surfaces)) assert.ok(!text.includes(secret), `${secret} survived in ${name}`);
  } finally { release(); await service.close(); await rm(root, { recursive: true, force: true }); }
});

// ---------- MCP ----------

test('over MCP, a fromEnv value is read from the server\'s environment, typed and shown, and never appears in tool output', { timeout: 20_000 }, async () => {
  const secret = 'synthetic-mcp-env-8a1d';
  const session = await openMcpSession('from-env', { fixture: 'tests/fixtures/mcp-env-server.ts', env: { JEV_TEST_PASSWORD: secret } });
  try {
    const script = { ...loginScript('ios'),
      steps: [loginScript('ios').steps[0], { ...checkpoint, guard: { present: [{ role: 'text', label: 'SCREEN_EVIDENCE_MARKER' }] } }] };
    const started = await session.callTool('start_scenario', { scenario: script });
    assert.notEqual(started.isError, true, JSON.stringify(started));
    const { runId } = JSON.parse(started.content[0].text) as { runId: string };
    const report = await session.callTool('get_report', { runId, waitMs: 10_000 });
    assert.match(report.content[0].text, /Status: finished/);
    assert.match(report.content[0].text, /passed/);
    for (const output of [started, report]) assert.ok(!JSON.stringify(output).includes(secret));
  } finally { await session.close(); }
});

test('start_scenario\'s description tells Claude about fromEnv', { timeout: 10_000 }, async () => {
  const session = await openMcpSession('from-env-description', { entryPoint: 'cli' });
  try {
    const tools = await session.listTools();
    assert.match(tools.find((tool: { name: string }) => tool.name === 'start_scenario').description, /fromEnv/);
  } finally { await session.close(); }
});

test('over MCP, a missing variable is an error naming the variable and MISSING_VALUE', { timeout: 20_000 }, async () => {
  const session = await openMcpSession('from-env-missing');
  try {
    const result = await session.callTool('start_scenario', { scenario: iosScript({ password: { fromEnv: 'JEV_TEST_UNSET_VARIABLE_7C' } }) });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /MISSING_VALUE/);
    assert.match(result.content[0].text, /JEV_TEST_UNSET_VARIABLE_7C/);
  } finally { await session.close(); }
});

// ---------- CLI ----------

test('the CLI pre-check fails a missing variable with exit 3, naming it, before asking for an API key or a device', { timeout: 20_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-from-env-cli-'));
  try {
    const path = join(root, 'script.json');
    await writeFile(path, JSON.stringify(iosScript({ password: { fromEnv: 'JEV_TEST_UNSET_VARIABLE_7C' } })));
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.TYPESAFE_API_KEY;
    delete env.JEV_TEST_UNSET_VARIABLE_7C;
    const failure = await execute(process.execPath, ['--import', import.meta.resolve('tsx'), join(process.cwd(), 'src/cli.ts'), 'run', path],
      { cwd: root, env }).then(() => assert.fail('must exit 3'), (error: { code: number; stderr: string }) => error);
    assert.equal(failure.code, 3);
    assert.match(failure.stderr, /MISSING_VALUE/);
    assert.match(failure.stderr, /JEV_TEST_UNSET_VARIABLE_7C/);
    assert.doesNotMatch(failure.stderr, /TYPESAFE_API_KEY/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('the CLI pre-check reports a resolved value that breaks the platform rule, without printing it', { timeout: 20_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-from-env-cli-rule-'));
  try {
    const path = join(root, 'script.json');
    await writeFile(path, JSON.stringify(iosScript({ password: { fromEnv: 'JEV_TEST_BAD_VALUE' } })));
    const env: NodeJS.ProcessEnv = { ...process.env, JEV_TEST_BAD_VALUE: '-synthetic-hyphen' };
    delete env.TYPESAFE_API_KEY;
    const failure = await execute(process.execPath, ['--import', import.meta.resolve('tsx'), join(process.cwd(), 'src/cli.ts'), 'run', path],
      { cwd: root, env }).then(() => assert.fail('must exit 3'), (error: { code: number; stderr: string }) => error);
    assert.equal(failure.code, 3);
    assert.match(failure.stderr, /JEV_TEST_BAD_VALUE/);
    assert.match(failure.stderr, /leading hyphen/);
    assert.doesNotMatch(failure.stderr, /synthetic/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
