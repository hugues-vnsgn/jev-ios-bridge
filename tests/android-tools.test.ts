import assert from 'node:assert/strict';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { mock, test } from 'node:test';
import { androidTools, adbEnvironment, findAdb } from '../src/device/android/tools.js';
import { DeviceReasonError } from '../src/device/index.js';

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

test('the tools check reports a missing adb first, before it reads the mobilecli program', async () => {
  await withAdbs([], async (root) => {
    let programReads = 0;
    const refused = await refusal(androidTools({
      environment: { PATH: join(root, 'empty') },
      home: join(root, 'user'),
      readProgram: async () => { programReads += 1; return new Uint8Array(); },
      cacheFolder: join(root, 'cache'),
    }));
    assert.match(refused.message, /adb/);
    assert.equal(programReads, 0);
  });
});

test('the tools check finds adb, then the agent; a missing mobilecli program is ANDROID_TOOLS_UNAVAILABLE', async () => {
  await withAdbs(['bin/adb'], async (root) => {
    const refused = await refusal(androidTools({
      environment: { PATH: join(root, 'bin') },
      home: join(root, 'user'),
      readProgram: async () => { throw Object.assign(new Error('not installed'), { code: 'MODULE_NOT_FOUND' }); },
      cacheFolder: join(root, 'cache'),
    }));
    assert.match(refused.message, /mobilecli/);
  });
});

const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
const installed = (() => {
  try {
    const mobilecli = createRequire(import.meta.url).resolve('mobilecli/package.json');
    createRequire(mobilecli).resolve(`@mobilenext/mobilecli-darwin-${arch}/package.json`);
    return true;
  } catch {
    return false;
  }
})();

test('the tools check reads the installed mobilecli program and never asks any spawn to execute anything', {
  skip: installed ? false : `@mobilenext/mobilecli-darwin-${arch} is not installed`,
}, async () => {
  const childProcess = createRequire(import.meta.url)('node:child_process') as Record<string, (...args: unknown[]) => unknown>;
  const spawners = ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'] as const;
  const spies = spawners.map(name => mock.method(childProcess, name, () => { throw new Error(`${name} was called`); }));
  syncBuiltinESMExports();
  try {
    await withAdbs(['bin/adb'], async (root) => {
      const tools = await androidTools({ environment: { PATH: join(root, 'bin') }, home: join(root, 'user'), cacheFolder: join(root, 'cache') });
      assert.equal(tools.adb, join(root, 'bin/adb'));
      assert.equal(tools.agent.sha256, '0e0865d0617bc6e4abf0a7b24a956da1ca25cfc795c30d8e32c64eb0d1f6258f');
      assert.deepEqual(await readdir(join(root, 'cache')), [`${tools.agent.sha256}.dex`]);
    });
  } finally {
    for (const spy of spies) spy.mock.restore();
    syncBuiltinESMExports();
  }
  assert.deepEqual(spies.map(spy => spy.mock.callCount()), spawners.map(() => 0));
});

test('nothing in src/ imports mobilecli\'s JavaScript; the package is only a place to read the program from', async () => {
  const sources = await readdir(new URL('../src/', import.meta.url), { recursive: true });
  for (const source of sources.filter(name => name.endsWith('.ts'))) {
    const text = await readFile(new URL(`../src/${source}`, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /\bfrom\s+['"](mobilecli|@mobilenext\/)|\bimport\(\s*['"](mobilecli|@mobilenext\/)|\brequire\(\s*['"](mobilecli|@mobilenext\/)/, source);
  }
});
