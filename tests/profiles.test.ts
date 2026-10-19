import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    budgets: { startupMs: 6000, operationMs: 4000 } } } });
  try {
    const selected = (await readProfile(root, 'pixel'))!;
    assert.deepEqual(profileLimits(selected, {}), { startupMs: 6000, operationMs: 4000, cleanupMs: 45000 });
    assert.deepEqual(profileLimits(selected, { startupMs: 1000, cleanupMs: 2000 }),
      { startupMs: 1000, operationMs: 4000, cleanupMs: 2000 });
    for (const limits of [{ startupMs: 6001 }, { operationMs: 4001 }, { cleanupMs: 45001 }]) {
      assert.throws(() => profileLimits(selected, limits), (error: unknown) => error instanceof ProfileError && error.code === 'PROFILE_CONFLICT');
    }
    assert.deepEqual(profileLimits(undefined, {}), {});
    assert.deepEqual(profileLimits(undefined, { startupMs: 600000, cleanupMs: 120000 }),
      { startupMs: 600000, cleanupMs: 120000 });
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
    assert.equal(result.stderr.trim(), 'PROFILE_CONFLICT');
    assert.deepEqual(await readdir(root), ['.jev', 'scenario.json']);
  } finally { await rm(root, { recursive: true, force: true }); }
});
