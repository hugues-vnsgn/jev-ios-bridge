import assert from 'node:assert/strict';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { mock, test } from 'node:test';
import { PINNED_AGENT_SHA256 } from '../src/device/android/agent-supply.js';
import { androidTools, adbEnvironment, findAdb } from '../src/device/android/tools.js';
import { installed, refusal } from './fixtures/android-tools.js';

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

test('the tools check only reads the mobilecli program: no spawn is ever asked to execute anything', async () => {
  const childProcess = createRequire(import.meta.url)('node:child_process') as Record<string, (...args: unknown[]) => unknown>;
  const spawners = ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'] as const;
  const spies = spawners.map(name => mock.method(childProcess, name, () => { throw new Error(`${name} was called`); }));
  syncBuiltinESMExports();
  try {
    await withAdbs(['bin/adb'], async (root) => {
      const check = androidTools({ environment: { PATH: join(root, 'bin') }, home: join(root, 'user'), cacheFolder: join(root, 'cache') });
      if (!installed) {
        // CI on Linux has no Mac program: the check refuses, still without running anything.
        await refusal(check);
        return;
      }
      const tools = await check;
      assert.equal(tools.adb, join(root, 'bin/adb'));
      assert.equal(tools.agent.sha256, PINNED_AGENT_SHA256);
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
