import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readProfile, ProfileError, profileLimits } from '../src/profiles.js';
import { spawnSync } from 'node:child_process';

const pixel = { platform: 'android', deviceCategory: 'android-emulator', device: 'Pixel_API_35' };
async function project(body?: unknown) {
  const root = await mkdtemp(join(tmpdir(), 'jev-profiles-'));
  await mkdir(join(root, '.jev'));
  if (body !== undefined) await writeFile(join(root, '.jev/profiles.json'), JSON.stringify(body));
  return root;
}

test('profiles are optional, and explicit selection overrides the project default', async () => {
  const root = await project();
  try {
    assert.equal(await readProfile(root), undefined);
    await assert.rejects(readProfile(root, 'pixel'), (error: unknown) => error instanceof ProfileError && error.code === 'PROFILE_NOT_FOUND');
    await writeFile(join(root, '.jev/profiles.json'), JSON.stringify({ version: 1, defaultProfile: 'pixel',
      profiles: { pixel, spare: { ...pixel, device: 'Spare' } } }));
    assert.equal((await readProfile(root))?.binding.name, 'pixel');
    const selected = await readProfile(root, 'spare');
    assert.equal(selected?.profile.device, 'Spare');
    assert.match(selected!.binding.digest, /^[0-9a-f]{64}$/);
    const before = await readFile(join(root, '.jev/profiles.json'), 'utf8');
    await assert.rejects(readProfile(root, 'unknown'), (error: unknown) => error instanceof ProfileError && error.code === 'PROFILE_NOT_FOUND');
    assert.equal(await readFile(join(root, '.jev/profiles.json'), 'utf8'), before);
    assert.deepEqual(await readdir(root), ['.jev']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('profile budgets are defaults and ceilings, compared independently', async () => {
  const root = await project({ version: 1, profiles: { pixel: { ...pixel,
    budgets: { startupMs: 6000, operationMs: 4000, cleanupMs: 5000 } } } });
  try {
    const selected = (await readProfile(root, 'pixel'))!;
    assert.deepEqual(profileLimits(selected, {}), { startupMs: 6000, operationMs: 4000, cleanupMs: 5000 });
    assert.deepEqual(profileLimits(selected, { startupMs: 1000, cleanupMs: 2000 }),
      { startupMs: 1000, operationMs: 4000, cleanupMs: 2000 });
    for (const limits of [{ startupMs: 6001 }, { operationMs: 4001 }, { cleanupMs: 5001 }]) {
      assert.throws(() => profileLimits(selected, limits), (error: unknown) => error instanceof ProfileError && error.code === 'PROFILE_CONFLICT');
    }
    assert.deepEqual(profileLimits(undefined, {}), {});
    assert.deepEqual(profileLimits(undefined, { startupMs: 600000, cleanupMs: 120000 }),
      { startupMs: 600000, cleanupMs: 120000 });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('unset profile budgets have no profile ceiling', async () => {
  const root = await project({ version: 1, profiles: { pixel } });
  try {
    const selected = (await readProfile(root, 'pixel'))!;
    assert.deepEqual(profileLimits(selected, {}), {});
    assert.deepEqual(profileLimits(selected, { startupMs: 600000, operationMs: 600000, cleanupMs: 120000 }),
      { startupMs: 600000, operationMs: 600000, cleanupMs: 120000 });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a present file rejects malformed, reserved and unknown fields without writes', async () => {
  const root = await project();
  const file = join(root, '.jev/profiles.json');
  const invalid = [
    '{', JSON.stringify({ version: 2, profiles: {} }),
    ...['capabilities', 'prerequisites', 'signing', 'unknown'].map(key => JSON.stringify({ version: 1,
      profiles: { pixel: { ...pixel, [key]: {} } } })),
    ...[{ deviceCategory: 'ios-phone' }, { platform: 'ios' }, { device: '' }, { app: 'bad app' },
      { budgets: { startupMs: 999 } }, { budgets: { operationMs: 600001 } },
      { budgets: { cleanupMs: 120001 } }, { budgets: { operationMs: 1000.5 } },
      { budgets: { other: 1000 } }].map(extra => JSON.stringify({ version: 1, profiles: { pixel: { ...pixel, ...extra } } })),
    JSON.stringify({ version: 1, profiles: { Bad_name: pixel } }),
    JSON.stringify({ version: 1, profiles: {}, extra: true }),
  ];
  try {
    for (const source of invalid) {
      await writeFile(file, source);
      await assert.rejects(readProfile(root), (error: unknown) => error instanceof ProfileError && error.code === 'INVALID_PROFILE_FILE', source);
      assert.equal(await readFile(file, 'utf8'), source);
    }
    assert.deepEqual(await readdir(root), ['.jev']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('run --profile prints the conflict code before credentials, admission or run files', async () => {
  const root = await project({ version: 1, profiles: { pixel } });
  await writeFile(join(root, 'scenario.json'), JSON.stringify({ version: 1, platform: 'android',
    app: { package: 'com.example.app' }, device: { avd: 'Other_AVD' }, values: {},
    steps: [{ id: 'check', kind: 'checkpoint', guard: { present: [{ role: 'text', label: 'Marker' }] },
      assertions: [{ id: 'shown', claim: 'Visible' }] }] }));
  try {
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'run', 'scenario.json', '--profile', 'pixel'],
      { env: { ...process.env, TYPESAFE_API_KEY: '', JEV_PROJECT_DIR: root, JEV_RUNS_DIR: join(root, 'runs') }, encoding: 'utf8' });
    assert.equal(result.status, 3);
    assert.deepEqual(result.stderr.split(/\r?\n/).filter(line => line.startsWith('PROFILE_CONFLICT:')),
      ['PROFILE_CONFLICT: Scenario device conflicts with the selected profile.']);
    assert.deepEqual(await readdir(root), ['.jev', 'scenario.json']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

for (const platform of ['ios', 'android'] as const) {
  test(`CLI run ignores the other-platform default for ${platform} with one profile snapshot`, async () => {
    const udid = 'ABCDEF00-0000-4000-8000-000000000001';
    const root = await project({ version: 1, defaultProfile: 'other', profiles: { other: platform === 'android'
      ? { platform: 'ios', deviceCategory: 'ios-simulator', device: udid }
      : pixel } });
    const runs = join(root, 'runs');
    const scenario = { version: 1, platform, app: platform === 'android'
      ? { package: 'com.example.app' } : { bundleId: 'com.example.app' }, values: {},
      steps: [{ id: 'check', kind: 'checkpoint', guard: { present: [{ role: 'text', label: 'Marker' }] },
        assertions: [{ id: 'shown', claim: 'Visible' }] }] };
    await writeFile(join(root, 'scenario.json'), JSON.stringify(scenario));
    try {
      const refused = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'run', 'scenario.json', '--profile', 'other'],
        { encoding: 'utf8', timeout: 10000, env: { ...process.env, TYPESAFE_API_KEY: '', JEV_PROJECT_DIR: root,
          JEV_RUNS_DIR: runs } });
      assert.equal(refused.status, 3, refused.stderr);
      assert.deepEqual(refused.stderr.split(/\r?\n/).filter(line => line.startsWith('PROFILE_CONFLICT:')),
        ['PROFILE_CONFLICT: Scenario platform conflicts with the selected profile.']);
      assert.deepEqual(await readdir(root), ['.jev', 'scenario.json']);
      const entry = join(root, 'cli-fixture.mjs');
      await writeFile(entry, `
        import { runCli } from ${JSON.stringify(pathToFileURL(resolve('src/cli.ts')).href)};
        import { BridgeService } from ${JSON.stringify(pathToFileURL(resolve('src/service.ts')).href)};
        import { selectAndroidDeviceName, selectDeviceId } from ${JSON.stringify(pathToFileURL(resolve('src/device/index.ts')).href)};
        import { writeFile } from 'node:fs/promises';
        const root = ${JSON.stringify(root)};
        let driverInput;
        const service = new BridgeService({ baseDir: ${JSON.stringify(runs)}, env: { JEV_PROJECT_DIR: root },
          createDriver: (scenario, run) => {
            driverInput = { device: scenario.device ?? null, profile: run.profile ?? null };
            return { async prepare() {
              driverInput.selected = scenario.platform === 'android'
                ? selectAndroidDeviceName(scenario.device, process.env.JEV_ANDROID_DEVICE)
                : await selectDeviceId(root, scenario.device?.udid, process.env.JEV_DEVICE_UDID);
            }, async close() {}, async act() {}, async observe() {
              return { deviceId: 'fixture', sequence: 1, capturedAt: Date.now(), expiresAt: Date.now() + 60000,
                truncated: false, elements: [{ ref: 'marker', role: 'text', label: 'Marker',
                  frame: { x: 0, y: 0, width: 10, height: 10 }, state: { visible: true, enabled: true }, actions: [] }] };
            } };
          }, createJudge: () => ({ async judge() { return { probabilities: { shown: 1 }, inputTokens: 0,
            latencyMs: 0, model: 'jev-1.13.0' }; } }),
        });
        const start = service.start.bind(service);
        service.start = async (...args) => {
          await writeFile(root + '/.jev/profiles.json', '{');
          return start(...args);
        };
        await runCli(['run', root + '/scenario.json', '--json'], { legacy: service, projectDir: root });
        await writeFile(root + '/driver.json', JSON.stringify(driverInput ?? null));
      `);
      const result = spawnSync(process.execPath, ['--import', 'tsx', entry], { encoding: 'utf8', timeout: 10000,
        env: { ...process.env, JEV_PROJECT_DIR: root, JEV_ANDROID_DEVICE: 'Legacy_AVD', JEV_DEVICE_UDID: udid,
          TYPESAFE_API_KEY: 'fixture-only' } });
      assert.equal(result.status, 0, result.stderr + result.stdout);
      assert.equal(JSON.parse(result.stdout).verdict, 'passed');
      assert.deepEqual(JSON.parse(await readFile(join(root, 'driver.json'), 'utf8')),
        { device: null, profile: null, selected: platform === 'android' ? 'Legacy_AVD' : udid });
      const [runId] = (await readdir(runs, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name);
      const events = (await readFile(join(runs, runId!, 'run.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
      assert.equal(Object.hasOwn(events.find(event => event.type === 'started').data, 'profile'), false);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}

for (const initiallySelected of [true, false]) {
  test(`CLI keeps its preflight profile snapshot when the file changes (selected=${initiallySelected})`, async () => {
    const root = await project(initiallySelected ? { version: 1, defaultProfile: 'pixel', profiles: { pixel } } : undefined);
    const runs = join(root, 'runs');
    const scenario = { version: 1, platform: 'android', app: { package: 'com.example.app' }, values: {},
      steps: [{ id: 'check', kind: 'checkpoint', guard: { present: [{ role: 'text', label: 'Marker' }] },
        assertions: [{ id: 'shown', claim: 'Visible' }] }] };
    await writeFile(join(root, 'scenario.json'), JSON.stringify(scenario));
    const entry = join(root, 'cli-fixture.mjs');
    await writeFile(entry, `
      import { runCli } from ${JSON.stringify(pathToFileURL(resolve('src/cli.ts')).href)};
      import { BridgeService } from ${JSON.stringify(pathToFileURL(resolve('src/service.ts')).href)};
      import { writeFile } from 'node:fs/promises';
      const root = ${JSON.stringify(root)};
      let driverInput;
      const service = new BridgeService({ baseDir: ${JSON.stringify(runs)}, env: { JEV_PROJECT_DIR: root },
        createDriver: (scenario, run) => {
          driverInput = { device: scenario.device ?? null, profile: run.profile ?? null };
          return { async prepare() {}, async close() {}, async act() {}, async observe() {
            return { deviceId: 'fixture', sequence: 1, capturedAt: Date.now(), expiresAt: Date.now() + 60000,
              truncated: false, elements: [{ ref: 'marker', role: 'text', label: 'Marker',
                frame: { x: 0, y: 0, width: 10, height: 10 }, state: { visible: true, enabled: true }, actions: [] }] };
          } };
        }, createJudge: () => ({ async judge() { return { probabilities: { shown: 1 }, inputTokens: 0,
          latencyMs: 0, model: 'jev-1.13.0' }; } }),
      });
      const start = service.start.bind(service);
      service.start = async (...args) => {
        await writeFile(root + '/.jev/profiles.json', JSON.stringify({ version: 1, defaultProfile: 'changed', profiles: {
          changed: { platform: 'android', deviceCategory: 'android-emulator', device: 'Changed_AVD' },
        } }));
        return start(...args);
      };
      await runCli(['run', root + '/scenario.json', '--json'], { legacy: service, projectDir: root });
      await writeFile(root + '/driver.json', JSON.stringify(driverInput));
    `);
    try {
      const result = spawnSync(process.execPath, ['--import', 'tsx', entry], { encoding: 'utf8', timeout: 10000,
        env: { ...process.env, JEV_PROJECT_DIR: root, JEV_ANDROID_DEVICE: 'Legacy_AVD', TYPESAFE_API_KEY: 'fixture-only' } });
      assert.equal(result.status, 0, result.stderr + result.stdout);
      const binding = initiallySelected ? { name: 'pixel', digest: 'a7df40867c11718a4dff899139156466875a32747dd5387fb1c95a8006942cc9' } : null;
      assert.deepEqual(JSON.parse(await readFile(join(root, 'driver.json'), 'utf8')),
        { device: initiallySelected ? { avd: 'Pixel_API_35' } : null, profile: binding });
      const [runId] = (await readdir(runs, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name);
      const events = (await readFile(join(runs, runId!, 'run.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
      assert.deepEqual(events.find(event => event.type === 'started').data.profile ?? null, binding);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}
