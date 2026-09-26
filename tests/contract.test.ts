/**
 * Golden-file contract tests for the 1.0 stability promise (ADR-0005). A failing test here means a
 * frozen surface changed. If the change is deliberate and 1.x-compatible (an addition), regenerate with
 * `UPDATE_GOLDEN=1 npm test` and review the golden diff; renames, removals, and meaning changes need 2.0.
 */
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { test } from 'node:test';
import { promisify } from 'node:util';
import type { DeviceDriver, RunEvent, Snapshot } from '../src/contracts/index.js';
import { DeviceCliError } from '../src/device/index.js';
import { createRunLog } from '../src/log/index.js';
import type { ScriptedJudge } from '../src/scripted/contracts.js';
import { REPORT_VERSION } from '../src/scripted/report-json.js';
import { SCRIPT_VERSION, scriptedScenarioSchema } from '../src/scripted/schema.js';
import { REASON_CODES, ROLES } from '../src/scripted/vocabulary.js';
import { BridgeService } from '../src/service.js';

const execute = promisify(execFile);
const goldenDir = join(import.meta.dirname, 'golden');

async function golden(name: string, actual: unknown): Promise<void> {
  const path = join(goldenDir, `${name}.json`);
  const text = JSON.stringify(actual, null, 2) + '\n';
  if (process.env.UPDATE_GOLDEN === '1') {
    await mkdir(goldenDir, { recursive: true });
    await writeFile(path, text);
    return;
  }
  let expected: string;
  try { expected = await readFile(path, 'utf8'); }
  catch { assert.fail(`Missing golden file ${path}; run UPDATE_GOLDEN=1 npm test and review it`); }
  assert.deepEqual(JSON.parse(text), JSON.parse(expected), `Frozen surface changed: ${name}. See tests/contract.test.ts.`);
}

const checkpoint = { id: 'verify', kind: 'checkpoint', guard: { present: [{ role: 'text', label: 'Marker' }] },
  assertions: [{ id: 'shown', claim: 'The marker is visible.' }] };
const validScript = { version: 1, app: { bundleId: 'com.example.app' }, values: {}, steps: [checkpoint] };

// ---------- vocabularies ----------

test('contract: role, reason-code, exit-code, and version vocabularies', async () => {
  await golden('vocabulary', {
    scriptVersion: SCRIPT_VERSION,
    reportVersion: REPORT_VERSION,
    roles: ROLES,
    reasonCodes: Object.keys(REASON_CODES),
    exitCodes: { passed: 0, failed: 1, inconclusive: 2, couldNotStart: 3, sigint: 130, sigterm: 143 },
    eventTypes: ['started', 'prepared', 'step', 'judgment', 'action', 'checkpoint', 'error', 'verdict'],
  });
});

// ---------- scripts ----------

const scriptCases: Record<string, unknown> = {
  minimal: validScript,
  allStepKinds: { version: 1, app: { bundleId: 'com.example.app' }, device: { udid: '0E42FDE2-5E09-42D3-9876-9EF0037FCBE7' },
    preconditions: ['A synthetic account is signed in.'], values: { query: 'Berlin' }, steps: [
      { id: 'open', kind: 'action', guard: { present: [{ identifier: 'home' }] },
        action: { kind: 'tap', selector: { role: 'button', label: 'Search' } } },
      { id: 'type', kind: 'action', guard: { present: [{ identifier: 'search.field' }] },
        action: { kind: 'replaceText', selector: { identifier: 'search.field', role: 'text-field' }, valueKey: 'query' } },
      { id: 'scroll', kind: 'action', guard: { present: [{ identifier: 'results' }], absent: [{ label: 'Loading' }] },
        action: { kind: 'swipe', selector: { identifier: 'results' }, direction: 'up' } },
      { id: 'settle', kind: 'wait', guard: { present: [{ identifier: 'results' }] },
        until: { present: [{ label: 'Berlin' }] }, timeoutMs: 5000 },
      checkpoint,
    ] },
  missingVersion: { app: validScript.app, values: {}, steps: [checkpoint] },
  futureVersion: { ...validScript, version: 2 },
  unknownRole: { ...validScript, steps: [{ ...checkpoint, guard: { present: [{ role: 'StaticText', label: 'Marker' }] } }] },
  selectorWithoutIdentity: { ...validScript, steps: [{ ...checkpoint, guard: { present: [{ value: 'x' }] } }] },
  leadingHyphenValue: { ...validScript, values: { query: '-Berlin' } },
  nonKeyboardValue: { ...validScript, values: { query: 'Đà Nẵng' } },
  tooManyValues: { ...validScript, values: Object.fromEntries(Array.from({ length: 33 }, (_, index) => [`v${index}`, 'x'])) },
  duplicateStepIds: { ...validScript, steps: [checkpoint, checkpoint] },
  endsWithAction: { ...validScript, steps: [{ id: 'tap', kind: 'action', guard: { present: [{ label: 'Marker' }] },
    action: { kind: 'tap', selector: { label: 'Marker' } } }] },
  unknownValueKey: { ...validScript, steps: [{ id: 'type', kind: 'action', guard: { present: [{ label: 'Marker' }] },
    action: { kind: 'replaceText', selector: { role: 'text-field' }, valueKey: 'missing' } }, checkpoint] },
  duplicateAssertionIds: { ...validScript, steps: [{ ...checkpoint, assertions: [
    { id: 'shown', claim: 'A' }, { id: 'shown', claim: 'B' }] }] },
  withLaunchArgs: { ...validScript, app: { bundleId: 'com.example.app', launchArgs: ['-of-evidence-gallery', '-flag', 'value'] } },
  controlCharacterLaunchArg: { ...validScript, app: { bundleId: 'com.example.app', launchArgs: ['-a\nb'] } },
  emptyLaunchArg: { ...validScript, app: { bundleId: 'com.example.app', launchArgs: [''] } },
  legacyGoalForm: { version: 1, goal: 'Open settings', app: validScript.app, values: {},
    assertions: [{ id: 'shown', claim: 'Settings are open.' }] },
};

test('contract: accepted and rejected scripts, with exact messages', async () => {
  const results = Object.fromEntries(Object.entries(scriptCases).map(([name, input]) => {
    const parsed = scriptedScenarioSchema.safeParse(input);
    return [name, parsed.success ? { accepted: true }
      : { accepted: false, issues: parsed.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })) }];
  }));
  await golden('scripts', results);
});

// ---------- runs, report.json, and evidence layout ----------

const screenshotBytes = Buffer.from('89504e470d0a1a0a', 'hex');

function screen(screenshotPath: string): Snapshot {
  return { deviceId: 'contract', sequence: 1, capturedAt: 0, expiresAt: 60_000, truncated: false, screenshotPath,
    elements: [{ ref: 'marker', role: 'text', label: 'Marker', frame: { x: 0, y: 0, width: 100, height: 30 },
      state: { visible: true, enabled: true }, actions: [] }] };
}

const judge = (probability: number): ScriptedJudge => ({
  async judge(assertions) {
    return { probabilities: Object.fromEntries(assertions.map(assertion => [assertion.id, probability])),
      inputTokens: 10, latencyMs: 1, model: 'jev-1.13.0' };
  },
});

async function recordRun(root: string, driver: DeviceDriver, probability: number): Promise<string> {
  const service = new BridgeService({ baseDir: root, createDriver: () => driver, createJudge: () => judge(probability) });
  try {
    const { runId } = await service.start(validScript);
    for (let attempt = 0; attempt < 200 && (await service.status(runId)).state === 'running'; attempt++) {
      await new Promise(done => setTimeout(done, 10));
    }
    return runId;
  } finally { await service.close(); }
}

/** Replace values that differ between runs, keeping every key and type visible to the golden file. */
function stable(value: unknown, runId: string): unknown {
  if (typeof value === 'string') {
    if (value === runId) return '<runId>';
    if (/^\d{4}-\d\d-\d\dT/.test(value)) return '<timestamp>';
    return value;
  }
  if (Array.isArray(value)) return value.map(item => stable(item, runId));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) =>
      [key, /(?:Ms|durationMs)$/.test(key) && typeof item === 'number' ? '<ms>'
        : key === 'bridgeVersion' && typeof item === 'string' ? '<bridgeVersion>' : stable(item, runId)]));
  }
  return value;
}

test('contract: report.json shape for passed, failed, and device-error runs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-contract-report-'));
  try {
    const image = join(root, 'shot.png');
    await writeFile(image, screenshotBytes);
    const ok: DeviceDriver = { async prepare() {}, async observe() { return screen(image); }, async act() {}, async close() {} };
    const vendorFailure: DeviceDriver = { ...ok, async prepare() { throw new DeviceCliError('APP_NOT_INSTALLED', 'not installed', true); } };
    const reports: Record<string, unknown> = {};
    for (const [name, driver, probability] of [['passed', ok, 1], ['failed', ok, 0], ['deviceError', vendorFailure, 1]] as const) {
      const runId = await recordRun(join(root, name), driver, probability);
      reports[name] = stable(JSON.parse(await readFile(join(root, name, runId, 'report.json'), 'utf8')), runId);
    }
    await golden('report-json', reports);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('contract: evidence folder names, JSONL envelope, event types, and verdict event', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-contract-evidence-'));
  try {
    const image = join(root, 'shot.png');
    await writeFile(image, screenshotBytes);
    const runsDir = join(root, 'runs');
    const runId = await recordRun(runsDir, { async prepare() {}, async observe() { return screen(image); },
      async act() {}, async close() {} }, 1);
    const events = (await readFile(join(runsDir, runId, 'run.jsonl'), 'utf8')).trim().split('\n')
      .map(line => JSON.parse(line) as RunEvent);
    const verdict = events.find(event => event.type === 'verdict')!;
    await golden('evidence-layout', {
      runFolder: '${JEV_RUNS_DIR:-$PWD/.jev-runs}/<run-id>/',
      files: (await readdir(join(runsDir, runId))).sort(),
      envelopeKeys: [...new Set(events.flatMap(event => Object.keys(event)))].sort(),
      envelopeVersion: [...new Set(events.map(event => event.version))],
      eventTypes: events.map(event => event.type),
      startedFields: Object.keys(events[0]!.data).sort(),
      verdictFields: Object.keys(verdict.data).sort(),
    });
  } finally { await rm(root, { recursive: true, force: true }); }
});

// ---------- MCP ----------

test('contract: MCP tool names, input schemas, and the start_scenario reply', { timeout: 15_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-contract-mcp-'));
  const child = spawn(process.execPath, ['--import', 'tsx', 'tests/fixtures/mcp-server.ts', root], { stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map<number, (value: any) => void>();
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => { const value = JSON.parse(line); pending.get(value.id)?.(value); pending.delete(value.id); });
  const request = (id: number, method: string, params: object = {}) => new Promise<any>(done => {
    pending.set(id, done);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  try {
    await request(1, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'contract', version: '1' } });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const list = await request(2, 'tools/list');
    const tools = (list.result.tools as Array<{ name: string; inputSchema: unknown }>)
      .map(tool => ({ name: tool.name, inputSchema: tool.inputSchema }))
      .sort((left, right) => left.name.localeCompare(right.name));
    const start = await request(3, 'tools/call', { name: 'start_scenario', arguments: { scenario: {
      ...validScript, steps: [{ ...checkpoint, guard: { present: [{ role: 'text', label: 'SCREEN_EVIDENCE_MARKER' }] } }] } } });
    const reply = JSON.parse(start.result.content[0].text) as Record<string, unknown>;
    assert.match(String(reply.watchUrl), /^http:\/\/127\.0\.0\.1:\d+\/\?token=[0-9a-f]{64}&run=/);
    await golden('mcp', { tools, startScenarioReplyKeys: Object.keys(reply).sort() });
  } finally {
    // Let the server finish its run and exit before deleting the folder it writes into.
    const exited = child.exitCode !== null ? Promise.resolve() : new Promise<void>(done => child.once('exit', () => done()));
    child.stdin.end();
    lines.close();
    const timer = setTimeout(() => child.kill('SIGTERM'), 5_000);
    await exited;
    clearTimeout(timer);
    await rm(root, { recursive: true, force: true });
  }
});

// ---------- CLI exit codes ----------

test('contract: CLI exit codes for every outcome and start failure', { timeout: 60_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-contract-cli-'));
  try {
    const runs = join(root, 'runs');
    const record = async (runId: string, verdict?: string) => {
      const log = await createRunLog(runs, runId);
      await log.append('started', { mode: 'scripted', bundleId: 'com.example.app', plannedSteps: [] });
      if (verdict) await log.append('verdict', { verdict, reason: verdict === 'passed' ? 'ALL_CHECKPOINTS_PASSED'
        : verdict === 'failed' ? 'ASSERTION_FALSE' : 'ASSERTION_UNCERTAIN', steps: 1, inputTokens: 1, durationMs: 1 });
    };
    await record('passed', 'passed');
    await record('failed', 'failed');
    await record('inconclusive', 'inconclusive');
    await record('interrupted');
    const write = async (name: string, content: string) => { await writeFile(join(root, name), content); return join(root, name); };
    const valid = await write('valid.json', JSON.stringify(validScript));
    const unversioned = await write('unversioned.json', JSON.stringify(scriptCases.missingVersion));
    const broken = await write('broken.json', '{ not json');
    const cli = join(process.cwd(), 'src/cli.ts');
    const tsx = import.meta.resolve('tsx');
    const env = (extra: Record<string, string>): NodeJS.ProcessEnv => {
      const base: NodeJS.ProcessEnv = { ...process.env, JEV_RUNS_DIR: runs };
      delete base.TYPESAFE_API_KEY;
      delete base.JEV_DEVICE_UDID;
      return { ...base, ...extra };
    };
    const cases: Array<[string, string[], Record<string, string>]> = [
      ['version', ['--version'], {}],
      ['help', ['--help'], {}],
      ['unknownCommand', ['bogus'], {}],
      ['runBrokenJson', ['run', broken], {}],
      ['runUnversionedScript', ['run', unversioned], {}],
      ['runWithoutKey', ['run', valid], {}],
      ['runWithoutSimulator', ['run', valid], { TYPESAFE_API_KEY: 'contract-test-key' }],
      ['runWithDeviceAlias', ['run', valid], { TYPESAFE_API_KEY: 'contract-test-key', JEV_DEVICE_UDID: 'booted' }],
      ['reportPassed', ['report', 'passed'], {}],
      ['reportFailed', ['report', 'failed'], {}],
      ['reportInconclusive', ['report', 'inconclusive'], {}],
      ['reportInterrupted', ['report', 'interrupted'], {}],
      ['reportPassedJson', ['report', 'passed', '--json'], {}],
      ['reportUnknownRun', ['report', 'missing'], {}],
      ['logsRecordedRun', ['logs', 'passed'], {}],
      ['logsUnknownRun', ['logs', 'missing'], {}],
      ['noLogPaneOnReport', ['report', 'passed', '--no-log-pane'], {}],
    ];
    const results: Record<string, number> = {};
    for (const [name, args, extra] of cases) {
      const outcome = await execute(process.execPath, ['--import', tsx, cli, ...args], { cwd: root, env: env(extra) })
        .then(() => 0, (error: { code?: number }) => error.code ?? -1);
      results[name] = outcome;
    }
    await golden('cli-exit-codes', results);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('contract: the driver translates unknown vendor roles to other and keeps known ones', async () => {
  const { parseSnapshot } = await import('../src/device/index.js');
  const snapshot = parseSnapshot({ capture: { type: 'runtime-snapshot', protocol: 'rs/1', elements: [
    { ref: 'e1', role: 'button', actions: ['tap'] },
    { ref: 'e2', role: 'future-vendor-role', actions: [] },
  ] } }, 'sim');
  assert.deepEqual(snapshot.elements.map(element => element.role), ['button', 'other']);
});

test('contract: the CLI prints the schema message for an unversioned script', { timeout: 20_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-contract-message-'));
  try {
    const path = join(root, 'script.json');
    await writeFile(path, JSON.stringify(scriptCases.missingVersion));
    const failure = await execute(process.execPath, ['--import', import.meta.resolve('tsx'), join(process.cwd(), 'src/cli.ts'), 'run', path],
      { cwd: root }).then(() => assert.fail('must exit 3'), (error: { code: number; stderr: string }) => error);
    assert.equal(failure.code, 3);
    assert.match(failure.stderr, /Add "version": 1 to the script/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
