import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { DeviceReasonError } from '../src/device/index.js';
import { adbEnvironment, findAdb } from '../src/device/android/tools.js';

/** The refusal `promise` rejects with: an `ANDROID_TOOLS_UNAVAILABLE` `DeviceReasonError`. */
async function refusal(promise: Promise<unknown>): Promise<DeviceReasonError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof DeviceReasonError, `expected a DeviceReasonError, got ${String(error)}`);
    assert.equal(error.code, 'ANDROID_TOOLS_UNAVAILABLE');
    return error;
  }
  assert.fail('expected ANDROID_TOOLS_UNAVAILABLE');
}

/** A temporary tree with an executable `adb` at each of the given relative paths. */
async function withAdbs(paths: string[], run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'jev-android-tools-'));
  try {
    for (const path of paths) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), '#!/bin/sh\n');
      await chmod(join(root, path), 0o755);
    }
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const everywhere = ['home-sdk/platform-tools/adb', 'sdk-root/platform-tools/adb', 'bin/adb', 'user/Library/Android/sdk/platform-tools/adb'];

test('adb is found in ANDROID_HOME, then ANDROID_SDK_ROOT, then PATH, then ~/Library/Android/sdk/platform-tools', async () => {
  await withAdbs(everywhere, async (root) => {
    const environment = {
      ANDROID_HOME: join(root, 'home-sdk'),
      ANDROID_SDK_ROOT: join(root, 'sdk-root'),
      PATH: [join(root, 'empty'), join(root, 'bin')].join(':'),
    };
    const home = join(root, 'user');
    assert.equal(await findAdb({ environment, home }), join(root, 'home-sdk/platform-tools/adb'));
    assert.equal(await findAdb({ environment: { ...environment, ANDROID_HOME: join(root, 'empty') }, home }), join(root, 'sdk-root/platform-tools/adb'));
    assert.equal(await findAdb({ environment: { PATH: environment.PATH }, home }), join(root, 'bin/adb'));
    assert.equal(await findAdb({ environment: { PATH: join(root, 'empty') }, home }), join(root, 'user/Library/Android/sdk/platform-tools/adb'));
  });
});

test('an adb that is missing, not a file or not executable is skipped, and none found is ANDROID_TOOLS_UNAVAILABLE', async () => {
  await withAdbs(['not-executable/adb', 'folder/adb/placeholder'], async (root) => {
    await chmod(join(root, 'not-executable/adb'), 0o644);
    const refused = await refusal(findAdb({
      environment: { ANDROID_HOME: '', PATH: ['', join(root, 'not-executable'), join(root, 'folder'), 'relative/bin'].join(':') },
      home: join(root, 'user'),
    }));
    assert.match(refused.message, /adb/);
    assert.match(refused.message, /ANDROID_HOME/);
  });
});

test('adbEnvironment strips TYPESAFE_API_KEY and keeps ANDROID_ADB_SERVER_PORT, so the private adb server is used', () => {
  const environment = adbEnvironment({ TYPESAFE_API_KEY: 'jev-key', ANDROID_ADB_SERVER_PORT: '5099', PATH: '/usr/bin' });
  assert.equal('TYPESAFE_API_KEY' in environment, false);
  assert.equal(environment.ANDROID_ADB_SERVER_PORT, '5099');
  assert.equal(environment.PATH, '/usr/bin');
});
