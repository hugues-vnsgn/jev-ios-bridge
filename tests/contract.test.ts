/**
 * Golden-file contract tests for the 1.0 stability promise (ADR-0005). A failing test here means a
 * frozen surface changed. If the change is deliberate and 1.x-compatible (an addition), regenerate with
 * `UPDATE_GOLDEN=1 npm test` and review the golden diff; renames, removals, and meaning changes need 2.0.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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
import type { ScriptedStep } from '../src/scripted/contracts.js';
import { REPORT_VERSION } from '../src/scripted/report-json.js';
import { SCRIPT_VERSION, scriptedScenarioSchema } from '../src/scripted/schema.js';
import { REASON_CODES, ROLES } from '../src/scripted/vocabulary.js';
import { BridgeService } from '../src/service.js';
import { captureCommand } from '../src/capture.js';
import { PINNED_AGENT_SHA256 } from '../src/device/android/agent-supply.js';
import { AGENT_CACHE, FakeAdb, fakeAgents, fakeClock } from './fixtures/android-device.js';
import { androidScript } from './fixtures/android-script.js';
import { openMcpSession } from './fixtures/mcp-session.js';

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
  androidWithSerial: { version: 1, platform: 'android', app: { package: 'com.hugues.test_cmp' },
    device: { serial: 'emulator-5554' }, values: {}, steps: [checkpoint] },
  androidWithAvd: { version: 1, platform: 'android', app: { package: 'com.hugues.test_cmp' },
    device: { avd: 'jev-actions-api31' }, values: {}, steps: [checkpoint] },
  androidWithActivityAndIntentExtras: { version: 1, platform: 'android',
    app: { package: 'com.hugues.test_cmp', activity: '.DebugGalleryActivity', intentExtras: { screen: 'gallery' } },
    device: { serial: 'emulator-5554' }, values: {}, steps: [checkpoint] },
  androidTypedValues: { version: 1, platform: 'android', app: { package: 'com.hugues.test_cmp' },
    device: { serial: 'emulator-5554' }, values: { query: '-Đà Nẵng' }, steps: [checkpoint] },
  androidRejectsBundleId: { version: 1, platform: 'android', app: { bundleId: 'com.example.app' },
    device: { serial: 'emulator-5554' }, values: {}, steps: [checkpoint] },
  androidRejectsLaunchArgs: { version: 1, platform: 'android',
    app: { package: 'com.hugues.test_cmp', launchArgs: ['-of-evidence-gallery'] },
    device: { serial: 'emulator-5554' }, values: {}, steps: [checkpoint] },
  androidRejectsDeviceUdid: { version: 1, platform: 'android', app: { package: 'com.hugues.test_cmp' },
    device: { udid: '0E42FDE2-5E09-42D3-9876-9EF0037FCBE7' }, values: {}, steps: [checkpoint] },
  androidMissingPackage: { version: 1, platform: 'android', app: {},
    device: { serial: 'emulator-5554' }, values: {}, steps: [checkpoint] },
  androidDeviceConflict: { version: 1, platform: 'android', app: { package: 'com.hugues.test_cmp' },
    device: { serial: 'emulator-5554', avd: 'jev-actions-api31' }, values: {}, steps: [checkpoint] },
  androidInvalidSerial: { version: 1, platform: 'android', app: { package: 'com.hugues.test_cmp' },
    device: { serial: 'has a space' }, values: {}, steps: [checkpoint] },
  androidInvalidAvd: { version: 1, platform: 'android', app: { package: 'com.hugues.test_cmp' },
    device: { avd: 'has a space' }, values: {}, steps: [checkpoint] },
  androidControlCharacterValue: { version: 1, platform: 'android', app: { package: 'com.hugues.test_cmp' },
    device: { serial: 'emulator-5554' }, values: { query: 'a\u0007b' }, steps: [checkpoint] },
  iosScriptUsesAndroidPackage: { ...validScript, app: { bundleId: 'com.example.app', package: 'com.hugues.test_cmp' } },
  iosScriptUsesAndroidSerial: { ...validScript, device: { serial: 'emulator-5554' } },
  missingBundleId: { version: 1, app: {}, values: {}, steps: [checkpoint] },
  iosMultipleErrors: { version: 1, app: { bundleId: 'not valid!!' }, values: { query: 'Đà Nẵng' },
    steps: [checkpoint, checkpoint] },
  androidActivityBareName: { version: 1, platform: 'android',
    app: { package: 'com.hugues.test_cmp', activity: 'MainActivity' },
    device: { serial: 'emulator-5554' }, values: {}, steps: [checkpoint] },
  androidMalformedPackage: { version: 1, platform: 'android', app: { package: 'nodots' },
    device: { serial: 'emulator-5554' }, values: {}, steps: [checkpoint] },
  androidTooManyIntentExtras: { version: 1, platform: 'android',
    app: { package: 'com.hugues.test_cmp',
      intentExtras: Object.fromEntries(Array.from({ length: 21 }, (_, index) => [`k${index}`, 'v'])) },
    device: { serial: 'emulator-5554' }, values: {}, steps: [checkpoint] },
  androidNonAsciiIntentExtraValue: { version: 1, platform: 'android',
    app: { package: 'com.hugues.test_cmp', intentExtras: { screen: 'Đà Nẵng' } },
    device: { serial: 'emulator-5554' }, values: {}, steps: [checkpoint] },
  androidIntentExtraValueTooLong: { version: 1, platform: 'android',
    app: { package: 'com.hugues.test_cmp', intentExtras: { screen: 'x'.repeat(201) } },
    device: { serial: 'emulator-5554' }, values: {}, steps: [checkpoint] },
  androidValueTooLong: { version: 1, platform: 'android', app: { package: 'com.hugues.test_cmp' },
    device: { serial: 'emulator-5554' }, values: { query: 'x'.repeat(2049) }, steps: [checkpoint] },
  androidTooManyValues: { version: 1, platform: 'android', app: { package: 'com.hugues.test_cmp' },
    device: { serial: 'emulator-5554' },
    values: Object.fromEntries(Array.from({ length: 33 }, (_, index) => [`k${index}`, 'v'])), steps: [checkpoint] },
  // iOS scripts with several errors at once: each gives 1.1's issues, in 1.1's order.
  // tests/scripted-schema-parity.test.ts checks this across many more combinations.
  nonAsciiValuePlusUnknownRole: { ...validScript, values: { query: 'Đà Nẵng' },
    steps: [{ ...checkpoint, guard: { present: [{ role: 'StaticText', label: 'Marker' }] } }] },
  leadingHyphenPlusMissingVersion: { app: validScript.app, values: { query: '-Berlin' }, steps: [checkpoint] },
  missingBundleIdPlusBadRole: { version: 1, app: {}, values: {},
    steps: [{ ...checkpoint, guard: { present: [{ role: 'StaticText', label: 'Marker' }] } }] },
  missingBundleIdPlusDuplicateStepIds: { version: 1, app: {}, values: {}, steps: [checkpoint, checkpoint] },
  missingBundleIdPlusBadUdid: { version: 1, app: {}, device: { udid: 'not-a-udid' }, values: {}, steps: [checkpoint] },
  missingBundleIdPlusValueTooLong: { version: 1, app: {}, values: { query: 'x'.repeat(2049) }, steps: [checkpoint] },
  // A script whose platform is neither "ios" nor "android" routes to the iOS schema (anything but exactly
  // "android" does), which then reports its own platform mismatch.
  unknownPlatform: { ...validScript, platform: 'windows' },
};

test('contract: accepted and rejected scripts, with exact messages', async () => {
  const results = Object.fromEntries(Object.entries(scriptCases).map(([name, input]) => {
    const parsed = scriptedScenarioSchema.safeParse(input);
    return [name, parsed.success ? { accepted: true }
      : { accepted: false, issues: parsed.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })) }];
  }));
  await golden('scripts', results);
});

test('contract: start_scenario accepts every script the scripts golden accepts, iOS and Android', { timeout: 15_000 }, async () => {
  const accepted = Object.entries(JSON.parse(await readFile(join(goldenDir, 'scripts.json'), 'utf8')) as
    Record<string, { accepted: boolean }>).filter(([, result]) => result.accepted).map(([name]) => name);
  assert.ok(accepted.some(name => name.startsWith('android')) && accepted.some(name => !name.startsWith('android')));
  const session = await openMcpSession('contract-accepts');
  try {
    for (const name of accepted) {
      const result = await session.callTool('start_scenario', { scenario: scriptCases[name] });
      assert.equal(result.isError, undefined, `${name}: ${result.content[0].text}`);
      assert.equal(typeof JSON.parse(result.content[0].text).runId, 'string', name);
    }
  } finally { await session.close(); }
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

// An Android run's report.json carries fields no iOS run has (ADR-0005 only adds); it gets its own golden
// file rather than a fourth entry in report-json.json, whose existing three-entry shape is frozen above.
test('contract: report.json shape for an Android run', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-contract-report-android-'));
  try {
    const nameField: Snapshot = { deviceId: 'android-golden', sequence: 1, capturedAt: 0, expiresAt: 60_000, truncated: false,
      elements: [{ ref: 'name-field', role: 'text-field', identifier: 'name-field', actions: ['typeText'],
        frame: { x: 0, y: 0, width: 100, height: 30 }, state: { enabled: true, visible: true } }] };
    const markerScreen: Snapshot = { deviceId: 'android-golden', sequence: 2, capturedAt: 0, expiresAt: 60_000, truncated: false,
      elements: [{ ref: 'marker', role: 'text', label: 'Marker', actions: [],
        frame: { x: 0, y: 0, width: 100, height: 30 }, state: { enabled: true, visible: true } }] };
    const driver: DeviceDriver = { async prepare() {}, async observe() { return nameField; },
      async act() { return { screen: markerScreen, shownValue: 'placeholder-text' }; },
      async close() {}, preparation: () => ({ deviceIdentity: 'jev-actions-api31', serial: 'emulator-5554', agentSha256: 'deadbeef' }) };
    const scenario = { version: 1, platform: 'android',
      app: { package: 'com.hugues.test_cmp', activity: '.DebugGalleryActivity', intentExtras: { screen: 'gallery' } },
      device: { serial: 'emulator-5554' }, values: { name: 'Ann' }, steps: [
        { id: 'type', kind: 'action', guard: { present: [{ identifier: 'name-field' }] },
          action: { kind: 'replaceText', selector: { identifier: 'name-field' }, valueKey: 'name' } },
        checkpoint,
      ] } as const;
    const service = new BridgeService({ baseDir: root, createDriver: () => driver, createJudge: () => judge(1) });
    let runId: string;
    try {
      ({ runId } = await service.start(scenario));
      for (let attempt = 0; attempt < 200 && (await service.status(runId)).state === 'running'; attempt++) {
        await new Promise(done => setTimeout(done, 10));
      }
    } finally { await service.close(); }
    const parsed = JSON.parse(await readFile(join(root, runId, 'report.json'), 'utf8')) as Record<string, unknown>;
    assert.equal(parsed.platform, 'android');
    assert.equal(parsed.package, 'com.hugues.test_cmp');
    assert.equal(parsed.activity, '.DebugGalleryActivity');
    assert.deepEqual(parsed.intentExtras, { screen: 'gallery' });
    assert.deepEqual(parsed.typedFields, [{ stepId: 'type', shownValue: 'placeholder-text' }]);
    assert.equal('deviceIdentity' in parsed, false, 'the prepared fields stay out of report.json');
    const report = stable(parsed, runId);
    await golden('report-json-android', report);
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
    const androidWithoutDevice = await write('android-no-device.json', JSON.stringify(
      androidScript({ app: { package: 'com.hugues.test_cmp' }, steps: [checkpoint as ScriptedStep] })));
    const empty = join(root, 'empty');
    await mkdir(empty);
    const cli = join(process.cwd(), 'src/cli.ts');
    const tsx = import.meta.resolve('tsx');
    const env = (extra: Record<string, string>): NodeJS.ProcessEnv => {
      const base: NodeJS.ProcessEnv = { ...process.env, JEV_RUNS_DIR: runs };
      delete base.TYPESAFE_API_KEY;
      delete base.JEV_DEVICE_UDID;
      delete base.JEV_ANDROID_DEVICE;
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
      ['runAndroidWithoutDevice', ['run', androidWithoutDevice], { TYPESAFE_API_KEY: 'contract-test-key' }],
      ['runAndroidWithInvalidDevice', ['run', androidWithoutDevice],
        { TYPESAFE_API_KEY: 'contract-test-key', JEV_ANDROID_DEVICE: 'has a space' }],
      ['reportPassed', ['report', 'passed'], {}],
      ['reportFailed', ['report', 'failed'], {}],
      ['reportInconclusive', ['report', 'inconclusive'], {}],
      ['reportInterrupted', ['report', 'interrupted'], {}],
      ['reportPassedJson', ['report', 'passed', '--json'], {}],
      ['reportUnknownRun', ['report', 'missing'], {}],
      ['logsRecordedRun', ['logs', 'passed'], {}],
      ['logsUnknownRun', ['logs', 'missing'], {}],
      ['noLogPaneOnReport', ['report', 'passed', '--no-log-pane'], {}],
      ['captureWithoutDevice', ['capture'], {}],
      ['captureWithEmptyDefaultDevice', ['capture'], { JEV_ANDROID_DEVICE: '' }],
      ['captureWithInvalidSerial', ['capture', '--serial', 'has a space'], {}],
      ['captureWithoutAndroidTools', ['capture', '--avd', 'jev-actions-api31'],
        { ANDROID_HOME: empty, ANDROID_SDK_ROOT: empty, PATH: empty, HOME: empty }],
      ['captureWithJson', ['capture', '--avd', 'jev-actions-api31', '--json'], {}],
      ['captureWithRunLimit', ['capture', '--avd', 'jev-actions-api31', '--max-steps', '3'], {}],
      ['captureWithNoLogPane', ['capture', '--avd', 'jev-actions-api31', '--no-log-pane'], {}],
      ['jevOnReport', ['report', 'passed', '--jev'], {}],
    ];
    const results: Record<string, number> = {};
    for (const [name, args, extra] of cases) {
      const outcome = await execute(process.execPath, ['--import', tsx, cli, ...args], { cwd: root, env: env(extra) })
        .then(() => 0, (error: { code?: number }) => error.code ?? -1);
      results[name] = outcome;
    }
    // A foreign agent needs a device, so the CLI's capture path runs in-process over the fake adb and agent.
    results.captureWithForeignAgent = await captureWithForeignAgent();
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

test('contract: the CLI prints the release version', { timeout: 20_000 }, async () => {
  const { stdout } = await execute(process.execPath, ['--import', import.meta.resolve('tsx'), join(process.cwd(), 'src/cli.ts'), '--version']);
  assert.equal(stdout, '1.3.1\n');
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

test('contract: the CLI names the missing or malformed Android device, and the Android driver\'s refusal once one is chosen', { timeout: 20_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-contract-android-message-'));
  try {
    const cli = join(process.cwd(), 'src/cli.ts');
    const tsx = import.meta.resolve('tsx');
    const env = (extra: Record<string, string>): NodeJS.ProcessEnv => {
      const base: NodeJS.ProcessEnv = { ...process.env, TYPESAFE_API_KEY: 'contract-test-key' };
      delete base.JEV_DEVICE_UDID;
      delete base.JEV_ANDROID_DEVICE;
      return { ...base, ...extra };
    };
    const run = async (script: unknown, extra: Record<string, string>) => {
      const path = join(root, `${randomUUID()}.json`);
      await writeFile(path, JSON.stringify(script));
      return execute(process.execPath, ['--import', tsx, cli, 'run', path], { cwd: root, env: env(extra) })
        .then(() => assert.fail('must not pass'), (error: { code: number; stdout: string; stderr: string }) => error);
    };
    const noDeviceScript = androidScript({ app: { package: 'com.hugues.test_cmp' }, steps: [checkpoint as ScriptedStep] });
    const noDevice = await run(noDeviceScript, {});
    assert.equal(noDevice.code, 3);
    assert.match(noDevice.stderr, /Set device\.serial or device\.avd in the scenario, or JEV_ANDROID_DEVICE/);

    const invalidDevice = await run(noDeviceScript, { JEV_ANDROID_DEVICE: 'has a space' });
    assert.equal(invalidDevice.code, 3);
    assert.match(invalidDevice.stderr, /JEV_ANDROID_DEVICE must be an adb serial/);
    assert.match(invalidDevice.stderr, /AVD name/);

    // The script's own device.serial wins over a malformed JEV_ANDROID_DEVICE, so the pre-run check
    // passes; the run then reaches the Android driver, whose tools check finds no adb anywhere it looks.
    const empty = join(root, 'empty');
    await mkdir(empty);
    const refused = await run(scriptCases.androidWithSerial,
      { JEV_ANDROID_DEVICE: 'has a space', ANDROID_HOME: empty, ANDROID_SDK_ROOT: empty, PATH: empty, HOME: empty });
    assert.equal(refused.code, 2);
    assert.match(refused.stdout, /ANDROID_TOOLS_UNAVAILABLE/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('contract: --help names JEV_ANDROID_DEVICE', { timeout: 10_000 }, async () => {
  const { stdout } = await execute(process.execPath,
    ['--import', import.meta.resolve('tsx'), join(process.cwd(), 'src/cli.ts'), '--help'], { cwd: process.cwd() });
  assert.match(stdout, /JEV_ANDROID_DEVICE/);
});

test('contract: --help lists capture and its options', { timeout: 10_000 }, async () => {
  const { stdout } = await execute(process.execPath,
    ['--import', import.meta.resolve('tsx'), join(process.cwd(), 'src/cli.ts'), '--help'], { cwd: process.cwd() });
  assert.match(stdout, /jev-ios-bridge capture \[--serial S \| --avd A\] \[--jev\]/);
});

/** The CLI's capture path against a fake device whose foreign agent holds it: the exit code, once the refusal is checked. */
async function captureWithForeignAgent(): Promise<number> {
  const root = await mkdtemp(join(tmpdir(), 'jev-contract-capture-'));
  try {
    const adb = new FakeAdb({ serial: 'emulator-5554', avd: 'jev-actions-api31', agents: new Map([[4984, 'foreign']]) });
    let stdout = '';
    let stderr = '';
    const code = await captureCommand({ avd: 'jev-actions-api31' }, { signal: new AbortController().signal,
      driver: { runner: adb.run, agentClient: fakeAgents(adb).agentClient, clock: fakeClock(), leaseRoot: root,
        tools: async () => ({ adb: '/sdk/platform-tools/adb', agent: { path: AGENT_CACHE, sha256: PINNED_AGENT_SHA256 } }) },
      write: { stdout: text => { stdout += text; }, stderr: text => { stderr += text; } } });
    assert.match(stderr, /^DEVICE_BUSY: /);
    assert.equal(stdout, '');
    assert.ok(adb.emulators.get('emulator-5554')!.agents!.has(4984), 'the foreign agent is left running');
    return code;
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('contract: capture refusals print the reason code on stderr and need no TYPESAFE_API_KEY', { timeout: 20_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-contract-capture-message-'));
  try {
    const empty = join(root, 'empty');
    await mkdir(empty);
    const env: NodeJS.ProcessEnv = { ...process.env, ANDROID_HOME: empty, ANDROID_SDK_ROOT: empty, PATH: empty, HOME: empty };
    delete env.TYPESAFE_API_KEY;
    delete env.JEV_ANDROID_DEVICE;
    const capture = (args: string[]) => execute(process.execPath, ['--import', import.meta.resolve('tsx'), join(process.cwd(), 'src/cli.ts'),
      'capture', ...args], { cwd: root, env }).then(() => assert.fail('must exit 3'), (error: { code: number; stdout: string; stderr: string }) => error);
    for (const [args, code] of [[[], 'NO_DEVICE'], [['--serial', 'has a space'], 'INVALID_DEVICE'],
      [['--avd', 'jev-actions-api31'], 'ANDROID_TOOLS_UNAVAILABLE']] as const) {
      const refused = await capture([...args]);
      assert.equal(refused.code, 3);
      assert.match(refused.stderr, new RegExp(`^${code}: \\S`));
      assert.equal(refused.stdout, '');
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
