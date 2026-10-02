/**
 * The driven-mode opt-in (E13, Issue 09) at `BridgeService.start` and over MCP: a script with a `do` step is
 * refused with DRIVEN_NOT_ENABLED before any driver is built or evidence written, unless the project's
 * `.jev/config.json` has `"drivenMode": true` and JEV_EXPERIMENTAL_DRIVEN is on. Fakes only.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeviceDriver } from '../src/contracts/index.js';
import type { ScriptedJudge } from '../src/scripted/contracts.js';
import { BridgeService } from '../src/service.js';
import { DrivenProjectError } from '../src/driven/project.js';
import { openMcpSession } from './fixtures/mcp-session.js';

const marker = { ref: 'm', role: 'text', label: 'Home', frame: { x: 0, y: 0, width: 100, height: 30 },
  state: { visible: true, enabled: true }, actions: [] };
const checkpoint = { id: 'verify', kind: 'checkpoint', guard: { present: [{ role: 'text', label: 'Home' }] },
  assertions: [{ id: 'shown', claim: 'Home is shown.' }] };
const doScript = { version: 2, app: { bundleId: 'com.example.app' }, values: {},
  steps: [{ id: 'go', kind: 'do', intent: 'Open home', doneWhen: 'Home shows', effect: 'none' }, checkpoint] };
const v1Script = { version: 1, app: { bundleId: 'com.example.app' }, values: {}, steps: [checkpoint] };
const judge: ScriptedJudge = { async judge() { return { probabilities: { shown: 1 }, inputTokens: 1, latencyMs: 1,
  model: 'jev-1.13.0' }; } };

async function setup(config?: unknown) {
  const root = await mkdtemp(join(tmpdir(), 'jev-opt-in-'));
  const projectDir = join(root, 'project');
  const runs = join(root, 'runs');
  await mkdir(join(projectDir, '.jev'), { recursive: true });
  await mkdir(runs);
  if (config !== undefined) {
    await writeFile(join(projectDir, '.jev', 'config.json'), typeof config === 'string' ? config : JSON.stringify(config));
  }
  return { root, projectDir, runs };
}

function service(runs: string, env: Record<string, string>) {
  let built = 0;
  const driver: DeviceDriver = { async prepare() {}, async observe() {
    return { deviceId: 'fake', sequence: 1, capturedAt: Date.now(), expiresAt: Date.now() + 60_000, truncated: false,
      elements: [marker] };
  }, async act() {}, async close() {} };
  const bridge = new BridgeService({ baseDir: runs, env,
    createDriver: () => { built++; return driver; }, createJudge: () => judge });
  return { bridge, built: () => built };
}

const refusedNotEnabled = (error: unknown) => {
  assert.ok(error instanceof DrivenProjectError);
  assert.equal(error.code, 'DRIVEN_NOT_ENABLED');
  assert.match(error.message, /^DRIVEN_NOT_ENABLED: /);
  return true;
};

for (const [what, config, switchOn] of [
  ['neither on', undefined, false],
  ['only drivenMode', { drivenMode: true }, false],
  ['only the switch', { drivenMode: false }, true],
] as const) {
  test(`a do script is refused before any driver or evidence: ${what}`, async () => {
    const { root, projectDir, runs } = await setup(config);
    const { bridge, built } = service(runs, { JEV_PROJECT_DIR: projectDir, ...(switchOn ? { JEV_EXPERIMENTAL_DRIVEN: '1' } : {}) });
    try {
      await assert.rejects(bridge.start(doScript), refusedNotEnabled);
      assert.equal(built(), 0);
      assert.deepEqual(await readdir(runs), []);
    } finally { await bridge.close(); await rm(root, { recursive: true, force: true }); }
  });
}

test('a broken .jev/config.json refuses a do script before any driver, naming the file', async () => {
  const { root, projectDir, runs } = await setup({ drivenMode: 'yes' });
  const { bridge, built } = service(runs, { JEV_PROJECT_DIR: projectDir, JEV_EXPERIMENTAL_DRIVEN: '1' });
  try {
    await assert.rejects(bridge.start(doScript), (error: unknown) =>
      error instanceof DrivenProjectError && error.code === 'INVALID_PROJECT_FILE' && /\.jev\/config\.json/.test(error.message));
    assert.equal(built(), 0);
  } finally { await bridge.close(); await rm(root, { recursive: true, force: true }); }
});

test('with drivenMode and the switch on, a do script gets past the gate to the device', async () => {
  const { root, projectDir, runs } = await setup({ drivenMode: true });
  const { bridge, built } = service(runs, { JEV_PROJECT_DIR: projectDir, JEV_EXPERIMENTAL_DRIVEN: '1' });
  try {
    const { runId } = await bridge.start(doScript);
    assert.equal(built(), 1);
    await bridge.status(runId, 3_000);
  } finally { await bridge.close(); await rm(root, { recursive: true, force: true }); }
});

test('a version 1 script ignores the project files and the switch, even broken ones', async () => {
  const { root, projectDir, runs } = await setup('{ not json');
  await writeFile(join(projectDir, '.jev', 'preflight.json'), 'not json either');
  const { bridge } = service(runs, { JEV_PROJECT_DIR: projectDir });
  try {
    const { runId } = await bridge.start(v1Script);
    const { report } = await bridge.status(runId, 3_000);
    assert.equal(report.verdict, 'passed');
  } finally { await bridge.close(); await rm(root, { recursive: true, force: true }); }
});

test('over MCP, the refusal is an error naming DRIVEN_NOT_ENABLED and what to turn on', { timeout: 20_000 }, async () => {
  const { root, projectDir } = await setup();
  const session = await openMcpSession('driven-opt-in', { env: { JEV_PROJECT_DIR: projectDir, JEV_EXPERIMENTAL_DRIVEN: '' } });
  try {
    const result = await session.callTool('start_scenario', { scenario: doScript });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /^DRIVEN_NOT_ENABLED: /);
    assert.match(result.content[0].text, /"drivenMode": true in \.jev\/config\.json/);
    assert.match(result.content[0].text, /JEV_EXPERIMENTAL_DRIVEN=1/);
  } finally { await session.close(); await rm(root, { recursive: true, force: true }); }
});

test('a do script whose typed value contains mask-marker text is refused, naming the key and never the value', async () => {
  const { openDrivenProject, DrivenProjectError } = await import('../src/driven/project.js');
  const scenario = { version: 2, platform: 'android', app: { package: 'com.example' }, values: { pw: 'x⟦value:user⟧y' },
    steps: [{ id: 'go', kind: 'do', intent: 'Open it', doneWhen: 'It is open', effect: 'none' },
      { id: 'check', kind: 'checkpoint', guard: { present: [{ label: 'A' }] }, assertions: [{ id: 'a', claim: 'A shows' }] }] };
  await assert.rejects(() => openDrivenProject(scenario as never, {}), (error: unknown) =>
    error instanceof DrivenProjectError && error.code === 'INVALID_VALUE' && error.message.includes('"pw"') &&
    !error.message.includes('x⟦value:user⟧y'));
});
