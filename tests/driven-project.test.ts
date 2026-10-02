/**
 * The project files for driven mode (Issue 09): `.jev/config.json` and `.jev/preflight.json`, the opt-in (E13),
 * the preflight (E12) and the local-only screen rules (E14). Temporary project folders only; the preflight
 * commands are `node -e` one-liners. No device, no TypeSafe call.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Element, RunEvent, RunLog, Snapshot } from '../src/contracts/index.js';
import type { ScriptedScenario } from '../src/scripted/contracts.js';
import { parseScriptedScenario } from '../src/scripted/schema.js';
import { DrivenProjectError, EXPERIMENTAL_DRIVEN_ENV, experimentalDrivenOn, localOnlyScreen, openDrivenProject,
  projectDirFrom, readPreflight, readProjectConfig, runPreflight } from '../src/driven/project.js';

async function project(files: Record<string, unknown> = {}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'jev-project-'));
  await mkdir(join(dir, '.jev'));
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(dir, '.jev', name), typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}

const node = process.execPath;

function recordingLog(): RunLog & { events: RunEvent[] } {
  const events: RunEvent[] = [];
  return { events,
    async append(type, data) { events.push({ version: 1, runId: 'project', sequence: events.length + 1,
      at: new Date().toISOString(), type, data: structuredClone(data) }); },
    async read() { return events; },
  };
}

const doStep = (effect = 'none') => ({ id: 'go', kind: 'do', intent: 'Open settings', doneWhen: 'Settings shows', effect });
const checkpoint = { id: 'verify', kind: 'checkpoint', guard: { present: [{ role: 'text', label: 'Settings' }] },
  assertions: [{ id: 'shown', claim: 'Settings is shown.' }] };
const v2 = (steps: unknown[]): ScriptedScenario => parseScriptedScenario({ version: 2,
  app: { bundleId: 'com.example.app' }, values: {}, steps });
const v1 = (): ScriptedScenario => parseScriptedScenario({ version: 1, app: { bundleId: 'com.example.app' },
  values: {}, steps: [checkpoint] });

const element = (ref: string, extra: Partial<Element>): Element => ({ ref, role: 'text',
  frame: { x: 0, y: 0, width: 10, height: 10 }, state: { visible: true, enabled: true }, actions: [], ...extra });
const snapshot = (elements: Element[]): Snapshot => ({ deviceId: 'fake', sequence: 1, capturedAt: 0, expiresAt: 1,
  truncated: false, elements });

// ---------- where the project is ----------

test('the project folder is JEV_PROJECT_DIR, trimmed, else the working directory', () => {
  assert.equal(projectDirFrom({ JEV_PROJECT_DIR: ' /tmp/app ' }, '/elsewhere'), '/tmp/app');
  assert.equal(projectDirFrom({ JEV_PROJECT_DIR: '  ' }, '/elsewhere'), '/elsewhere');
  assert.equal(projectDirFrom({}, '/elsewhere'), '/elsewhere');
});

// ---------- .jev/config.json ----------

test('config.json: missing means driven mode off and no local-only screens', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jev-project-'));
  try { assert.deepEqual(await readProjectConfig(dir), { drivenMode: false, localOnlyScreens: [] }); }
  finally { await rm(dir, { recursive: true, force: true }); }
});

test('config.json: a valid file is read with its rules', async () => {
  const dir = await project({ 'config.json': { drivenMode: true,
    localOnlyScreens: [{ identifier: '^payment\\.' }, { label: 'Card number', identifier: 'card' }] } });
  try {
    assert.deepEqual(await readProjectConfig(dir), { drivenMode: true,
      localOnlyScreens: [{ identifier: '^payment\\.' }, { label: 'Card number', identifier: 'card' }] });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('config.json: every bad shape is refused with a message naming the file', async () => {
  const bad: [string, unknown][] = [
    ['not JSON', '{ drivenMode: true'],
    ['an array', '[]'],
    ['drivenMode not a boolean', { drivenMode: 'yes' }],
    ['an unknown key', { drivenMode: true, drivenmode: true }],
    ['localOnlyScreens not an array', { localOnlyScreens: { label: 'x' } }],
    ['a rule with no field', { localOnlyScreens: [{}] }],
    ['a rule with an unknown field', { localOnlyScreens: [{ role: 'button' }] }],
    ['an empty pattern', { localOnlyScreens: [{ label: '' }] }],
    ['an invalid regex', { localOnlyScreens: [{ identifier: '([' }] }],
  ];
  for (const [what, content] of bad) {
    const dir = await project({ 'config.json': content });
    try {
      await assert.rejects(readProjectConfig(dir), (error: unknown) => {
        assert.ok(error instanceof DrivenProjectError, what);
        assert.equal(error.code, 'INVALID_PROJECT_FILE', what);
        assert.match(error.message, /\.jev\/config\.json/, what);
        return true;
      });
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
});

// ---------- .jev/preflight.json ----------

test('preflight.json: missing is undefined; timeoutMs defaults to 10 s', async () => {
  const dir = await project({ 'other.json': {} });
  try {
    assert.equal(await readPreflight(dir), undefined);
    await writeFile(join(dir, '.jev', 'preflight.json'), JSON.stringify({ command: ['./scripts/is-test-env.sh'] }));
    assert.deepEqual(await readPreflight(dir), { command: ['./scripts/is-test-env.sh'], timeoutMs: 10_000 });
    await writeFile(join(dir, '.jev', 'preflight.json'), JSON.stringify({ command: ['a', 'b'], timeoutMs: 2500 }));
    assert.deepEqual(await readPreflight(dir), { command: ['a', 'b'], timeoutMs: 2500 });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('preflight.json: every bad shape is refused with a message naming the file', async () => {
  const bad: [string, unknown][] = [
    ['not JSON', 'command'],
    ['no command', { timeoutMs: 1000 }],
    ['a string command (no shell)', { command: './scripts/is-test-env.sh' }],
    ['an empty command', { command: [] }],
    ['an empty program', { command: [''] }],
    ['a non-string argument', { command: ['a', 3] }],
    ['a zero timeout', { command: ['a'], timeoutMs: 0 }],
    ['a fractional timeout', { command: ['a'], timeoutMs: 1.5 }],
    ['a timeout over 2 minutes', { command: ['a'], timeoutMs: 120_001 }],
    ['an unknown key', { command: ['a'], shell: true }],
  ];
  for (const [what, content] of bad) {
    const dir = await project({ 'preflight.json': content });
    try {
      await assert.rejects(readPreflight(dir), (error: unknown) => {
        assert.ok(error instanceof DrivenProjectError, what);
        assert.equal(error.code, 'INVALID_PROJECT_FILE', what);
        assert.match(error.message, /\.jev\/preflight\.json/, what);
        return true;
      });
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
});

// ---------- the experimental switch ----------

test('the experimental switch is on for 1 or true, off otherwise', () => {
  assert.equal(EXPERIMENTAL_DRIVEN_ENV, 'JEV_EXPERIMENTAL_DRIVEN');
  for (const on of ['1', 'true', 'TRUE', ' true ']) assert.equal(experimentalDrivenOn({ JEV_EXPERIMENTAL_DRIVEN: on }), true, on);
  for (const off of [undefined, '', '0', 'false', 'yes', '${user_config.experimentalDriven}']) {
    assert.equal(experimentalDrivenOn(off === undefined ? {} : { JEV_EXPERIMENTAL_DRIVEN: off }), false, String(off));
  }
});

// ---------- the opt-in gate (E13) ----------

test('a script without do steps reads no project file, even a broken one', async () => {
  const dir = await project({ 'config.json': 'broken', 'preflight.json': 'broken' });
  try { assert.equal(await openDrivenProject(v1(), { JEV_PROJECT_DIR: dir }), undefined); }
  finally { await rm(dir, { recursive: true, force: true }); }
});

test('a do script is refused with DRIVEN_NOT_ENABLED unless both drivenMode and the switch are on', async () => {
  const cases: [string, Record<string, unknown>, string | undefined, RegExp][] = [
    ['no config, no switch', {}, undefined, /"drivenMode": true.*JEV_EXPERIMENTAL_DRIVEN=1/s],
    ['config on, no switch', { 'config.json': { drivenMode: true } }, undefined, /JEV_EXPERIMENTAL_DRIVEN=1/],
    ['config on, switch 0', { 'config.json': { drivenMode: true } }, '0', /JEV_EXPERIMENTAL_DRIVEN=1/],
    ['switch on, no config', {}, '1', /"drivenMode": true/],
    ['switch on, drivenMode false', { 'config.json': { drivenMode: false } }, '1', /"drivenMode": true/],
  ];
  for (const [what, files, switchValue, message] of cases) {
    const dir = await project(files);
    try {
      const env = { JEV_PROJECT_DIR: dir, ...(switchValue === undefined ? {} : { JEV_EXPERIMENTAL_DRIVEN: switchValue }) };
      await assert.rejects(openDrivenProject(v2([doStep(), checkpoint]), env), (error: unknown) => {
        assert.ok(error instanceof DrivenProjectError, what);
        assert.equal(error.code, 'DRIVEN_NOT_ENABLED', what);
        assert.match(error.message, /^DRIVEN_NOT_ENABLED: /, what);
        assert.match(error.message, message, what);
        return true;
      });
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
});

test('a broken config.json is refused before the opt-in is judged', async () => {
  const dir = await project({ 'config.json': { drivenMode: 'on' } });
  try {
    await assert.rejects(openDrivenProject(v2([doStep(), checkpoint]), { JEV_PROJECT_DIR: dir }),
      (error: unknown) => error instanceof DrivenProjectError && error.code === 'INVALID_PROJECT_FILE');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a broken preflight.json refuses a do script even when driven mode is on', async () => {
  const dir = await project({ 'config.json': { drivenMode: true }, 'preflight.json': { command: 'x' } });
  try {
    await assert.rejects(openDrivenProject(v2([doStep(), checkpoint]), { JEV_PROJECT_DIR: dir, JEV_EXPERIMENTAL_DRIVEN: '1' }),
      (error: unknown) => error instanceof DrivenProjectError && error.code === 'INVALID_PROJECT_FILE');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('with both on, the project opens with its config and preflight', async () => {
  const dir = await project({ 'config.json': { drivenMode: true, localOnlyScreens: [{ label: 'PIN' }] },
    'preflight.json': { command: ['./check.sh'] } });
  try {
    const opened = await openDrivenProject(v2([doStep(), checkpoint]), { JEV_PROJECT_DIR: dir, JEV_EXPERIMENTAL_DRIVEN: '1' });
    assert.ok(opened);
    assert.equal(opened.projectDir, dir);
    assert.deepEqual(opened.config.localOnlyScreens, [{ label: 'PIN' }]);
    assert.deepEqual(opened.preflight, { command: ['./check.sh'], timeoutMs: 10_000 });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

// ---------- local-only screens (E14) ----------

test('a local-only rule matches an element by identifier, label, or both together', () => {
  const screen = snapshot([element('a', { label: 'Card number', identifier: 'payment.card' }),
    element('b', { label: 'Welcome' })]);
  assert.equal(localOnlyScreen([], screen), false);
  assert.equal(localOnlyScreen([{ identifier: '^payment\\.' }], screen), true);
  assert.equal(localOnlyScreen([{ label: 'Card' }], screen), true);
  assert.equal(localOnlyScreen([{ label: 'card' }], screen), false, 'case-sensitive, as written');
  assert.equal(localOnlyScreen([{ label: 'Card', identifier: '^login' }], screen), false, 'both fields must match one element');
  assert.equal(localOnlyScreen([{ label: 'Welcome', identifier: 'payment' }], screen), false, 'not across elements');
  assert.equal(localOnlyScreen([{ identifier: 'welcome' }], screen), false, 'an element without the field never matches');
  assert.equal(localOnlyScreen([{ label: 'nothing' }, { label: '^Welcome$' }], screen), true, 'any rule');
});

test('hidden elements count: a screen holding a matching element anywhere stays local', () => {
  const screen = snapshot([element('a', { label: 'PIN', state: { visible: false, enabled: true } })]);
  assert.equal(localOnlyScreen([{ label: 'PIN' }], screen), true);
});

// ---------- the preflight (E12) ----------

test('preflight: missing file is logged missing; Jev may not perform test writes', async () => {
  const dir = await project();
  try {
    const log = recordingLog();
    const result = await runPreflight(undefined, dir, log);
    assert.equal(result, false);
    assert.deepEqual(log.events.map(event => event.data), [{ status: 'missing', exitCode: null, durationMs: 0 }]);
    assert.equal(log.events[0]!.type, 'preflight');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('preflight: exit 0 is ok; it runs in the project folder, without a shell', async () => {
  const dir = await project();
  try {
    await writeFile(join(dir, 'is-test-env.sh'), '#!/bin/sh\n[ -f .jev/marker ] && exit 0\nexit 4\n');
    await chmod(join(dir, 'is-test-env.sh'), 0o755);
    await writeFile(join(dir, '.jev', 'marker'), '');
    const log = recordingLog();
    assert.equal(await runPreflight({ command: ['./is-test-env.sh'], timeoutMs: 10_000 }, dir, log), true);
    const [event] = log.events.map(e => e.data);
    assert.equal(event!.status, 'ok');
    assert.equal(event!.exitCode, 0);
    assert.equal(typeof event!.durationMs, 'number');
    // No shell: a shell-only word is a program name that doesn't exist.
    const noShell = recordingLog();
    assert.equal(await runPreflight({ command: ['exit 0'], timeoutMs: 10_000 }, dir, noShell), false);
    assert.equal(noShell.events[0]!.data.status, 'failed');
    assert.equal(noShell.events[0]!.data.failure, 'spawn');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('preflight: a non-zero exit is failed, with its exit code', async () => {
  const dir = await project();
  try {
    const log = recordingLog();
    assert.equal(await runPreflight({ command: [node, '-e', 'process.exit(3)'], timeoutMs: 10_000 }, dir, log), false);
    assert.deepEqual({ ...log.events[0]!.data, durationMs: 0 }, { status: 'failed', exitCode: 3, failure: 'exit', durationMs: 0 });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('preflight: a command past its timeout is killed and failed', async () => {
  const dir = await project();
  try {
    const log = recordingLog();
    const began = Date.now();
    assert.equal(await runPreflight({ command: [node, '-e', 'setInterval(() => {}, 1000)'], timeoutMs: 300 }, dir, log), false);
    assert.ok(Date.now() - began < 5_000, 'killed near its timeout');
    const event = log.events[0]!.data;
    assert.equal(event.status, 'failed');
    assert.equal(event.failure, 'timeout');
    assert.equal(event.exitCode, null);
    assert.ok((event.durationMs as number) >= 300);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('preflight: its output never reaches the run log, and it never gets the TypeSafe key', async () => {
  const dir = await project();
  const saved = process.env.TYPESAFE_API_KEY;
  process.env.TYPESAFE_API_KEY = 'synthetic-key-for-preflight-test';
  try {
    const code = 'console.log("PREFLIGHT_STDOUT_MARKER"); console.error("PREFLIGHT_STDERR_MARKER");' +
      'process.exit(process.env.TYPESAFE_API_KEY === undefined ? 0 : 9)';
    const log = recordingLog();
    assert.equal(await runPreflight({ command: [node, '-e', code], timeoutMs: 10_000 }, dir, log), true);
    const written = JSON.stringify(log.events);
    assert.ok(!written.includes('PREFLIGHT_STDOUT_MARKER'));
    assert.ok(!written.includes('PREFLIGHT_STDERR_MARKER'));
    assert.deepEqual(Object.keys(log.events[0]!.data).sort(), ['durationMs', 'exitCode', 'status']);
  } finally {
    if (saved === undefined) delete process.env.TYPESAFE_API_KEY; else process.env.TYPESAFE_API_KEY = saved;
    await rm(dir, { recursive: true, force: true });
  }
});

test('preflight: a cancelled run kills the command and logs nothing', async () => {
  const dir = await project();
  try {
    const log = recordingLog();
    const controller = new AbortController();
    const running = runPreflight({ command: [node, '-e', 'setInterval(() => {}, 1000)'], timeoutMs: 60_000 }, dir, log,
      controller.signal);
    setTimeout(() => controller.abort(), 100);
    assert.equal(await running, false);
    assert.deepEqual(log.events, []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the project runs its preflight once per run, at the first test write, and remembers the answer', async () => {
  const dir = await project({ 'config.json': { drivenMode: true },
    'preflight.json': { command: [node, '-e', 'process.exit(0)'] } });
  try {
    const opened = await openDrivenProject(v2([doStep('test_write'), checkpoint]),
      { JEV_PROJECT_DIR: dir, JEV_EXPERIMENTAL_DRIVEN: '1' });
    const log = recordingLog();
    const options = opened!.drivenOptions(log);
    assert.equal(log.events.length, 0, 'nothing runs until a test write asks');
    const signal = new AbortController().signal;
    assert.equal(await options.testWritesAllowed(signal), true);
    assert.equal(await options.testWritesAllowed(signal), true);
    assert.deepEqual(log.events.map(event => event.data.status), ['ok']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('preflight: a command spawn refuses outright (a NUL byte) is failed, not a run error', async () => {
  const dir = await project();
  try {
    const log = recordingLog();
    assert.equal(await runPreflight({ command: ['bad\u0000name'], timeoutMs: 1_000 }, dir, log), false);
    assert.deepEqual(log.events.map(e => [e.data.status, e.data.failure]), [['failed', 'spawn']]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
