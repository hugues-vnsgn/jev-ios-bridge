import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

async function cliInProject(t: { after(done: () => Promise<void>): void }, args: string[]) {
  const root = await mkdtemp(join(tmpdir(), 'jev-cli-project-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runs = join(root, 'service-runs');
  await writeFile(join(root, 'scenario.json'), JSON.stringify({ version: 1, platform: 'android', app: { package: 'com.example.app' },
    device: { serial: 'emulator-5554' }, values: {}, steps: [{ id: 'check', kind: 'checkpoint',
      guard: { present: [{ role: 'text', label: 'Marker' }] }, assertions: [{ id: 'shown', claim: 'Visible' }] }] }));
  await mkdir(join(root, '.jev-runs', 'recorded-run'), { recursive: true });
  await writeFile(join(root, '.jev-runs', 'recorded-run', 'run.jsonl'), JSON.stringify({ version: 1, runId: 'recorded-run', sequence: 1,
    at: '2026-10-26T00:00:00.000Z', type: 'prepared', data: { logSources: { logcat: '/logs/recorded-run.log' } } }) + '\n');
  const entry = join(root, 'cli-fixture.mjs');
  await writeFile(entry, `
    import { runCli } from ${JSON.stringify(pathToFileURL(resolve('src/cli.ts')).href)};
    import { BridgeService } from ${JSON.stringify(pathToFileURL(resolve('src/service.ts')).href)};
    const root = ${JSON.stringify(root)};
    const service = new BridgeService({ baseDir: ${JSON.stringify(runs)}, env: {},
      createDriver: () => ({ async prepare() {}, async close() {}, async act() {}, async observe() {
        return { deviceId: 'fixture', sequence: 1, capturedAt: Date.now(), expiresAt: Date.now() + 60000, truncated: false,
          elements: [{ ref: 'marker', role: 'text', label: 'Marker', frame: { x: 0, y: 0, width: 10, height: 10 },
            state: { visible: true, enabled: true }, actions: [] }] };
      } }),
      createJudge: () => ({ async judge() { return { probabilities: { shown: 1 }, inputTokens: 0, latencyMs: 0, model: 'jev-1.13.0' }; } }) });
    await runCli(${JSON.stringify(args)}, { legacy: service, projectDir: root });
  `);
  const { JEV_PROJECT_DIR: _project, JEV_RUNS_DIR: _runs, ...environment } = process.env;
  const result = spawnSync(process.execPath, ['--import', 'tsx', entry], { encoding: 'utf8', timeout: 20_000,
    env: { ...environment, TYPESAFE_API_KEY: 'fixture-only' } });
  return { ...result, runs };
}

test('`run` reads a relative script path from the composed project folder, not the working directory', async t => {
  const result = await cliInProject(t, ['run', 'scenario.json', '--json']);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(JSON.parse(result.stdout).verdict, 'passed');
  assert.ok((await readdir(result.runs)).includes(JSON.parse(result.stdout).runId), 'the run lands in the service folder');
});

test('`logs` finds a recorded run under the composed project folder, not the working directory', async t => {
  const result = await cliInProject(t, ['logs', 'recorded-run']);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(result.stdout, 'Run recorded-run is not running, so there is no live log to follow.\n' +
    'The app\'s own log files (not masked): /logs/recorded-run.log\n');
});
