import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { PINNED_AGENT_SHA256, pinnedAgent } from '../src/device/android/agent-supply.js';
import { installed, refusal } from './fixtures/android-tools.js';

/** A minimal DEX file: the `dex\n035\0` header with a valid length field, Adler-32 checksum and SHA-1 signature. */
function dexFile(body: string): Buffer {
  const dex = Buffer.alloc(0x70 + body.length);
  dex.write('dex\n035\0', 0, 'latin1');
  dex.writeUInt32LE(dex.length, 32);
  dex.write(body, 0x70, 'latin1');
  createHash('sha1').update(dex.subarray(32)).digest().copy(dex, 12);
  let a = 1, b = 0;
  for (const byte of dex.subarray(12)) { a = (a + byte) % 65521; b = (b + a) % 65521; }
  dex.writeUInt32LE(((b << 16) | a) >>> 0, 8);
  return dex;
}

/** Program bytes around the given DEX files, with padding that looks nothing like a DEX header. */
function program(...parts: Buffer[]): Buffer {
  return Buffer.concat([Buffer.from('\x7fELF-ish program start '), ...parts.flatMap(part => [part, Buffer.from(' padding ')])]);
}

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

async function withCacheFolder(run: (folder: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'jev-agent-supply-'));
  try {
    await run(join(root, 'jev-android-agent'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('the one valid DEX file in the program is found and cached as <sha256>.dex, folder 0700 and file 0600', async () => {
  const agent = dexFile('the device agent');
  await withCacheFolder(async (cacheFolder) => {
    const found = await pinnedAgent({ readProgram: async () => program(agent), cacheFolder, pinnedSha256: sha256(agent) });
    assert.deepEqual(found, { path: join(cacheFolder, `${sha256(agent)}.dex`), sha256: sha256(agent) });
    assert.deepEqual(await readFile(found.path), agent);
    assert.equal((await stat(cacheFolder)).mode & 0o777, 0o700);
    assert.equal((await stat(found.path)).mode & 0o777, 0o600);
  });
});

test('a program with no DEX file, or two valid ones, is ANDROID_TOOLS_UNAVAILABLE and caches nothing', async () => {
  await withCacheFolder(async (cacheFolder) => {
    const none = await refusal(pinnedAgent({ readProgram: async () => program(), cacheFolder }));
    assert.match(none.message, /0 valid device agents/);
    const [first, second] = [dexFile('agent one'), dexFile('agent two')];
    const two = await refusal(pinnedAgent({ readProgram: async () => program(first, second), cacheFolder, pinnedSha256: sha256(first) }));
    assert.match(two.message, /2 valid device agents/);
    await assert.rejects(stat(cacheFolder), { code: 'ENOENT' });
  });
});

test('a DEX header whose Adler-32 checksum, SHA-1 signature or length field is wrong does not count as a device agent', async () => {
  const agent = dexFile('the device agent');
  const badChecksum = Buffer.from(agent);
  badChecksum.writeUInt32LE((badChecksum.readUInt32LE(8) ^ 1) >>> 0, 8);
  const badSignature = Buffer.from(agent);
  badSignature[12]! ^= 1;
  const badLength = Buffer.from(agent);
  badLength.writeUInt32LE(agent.length + 4096, 32);
  await withCacheFolder(async (cacheFolder) => {
    for (const broken of [badChecksum, badSignature, badLength]) {
      const refused = await refusal(pinnedAgent({ readProgram: async () => program(broken), cacheFolder, pinnedSha256: sha256(agent) }));
      assert.match(refused.message, /0 valid device agents/);
    }
    // A broken copy beside the real one leaves exactly one valid agent.
    const found = await pinnedAgent({ readProgram: async () => program(badChecksum, agent, badSignature), cacheFolder, pinnedSha256: sha256(agent) });
    assert.deepEqual(await readFile(found.path), agent);
  });
});

test('a valid DEX file whose SHA-256 is not the pinned one is ANDROID_TOOLS_UNAVAILABLE and caches nothing', async () => {
  await withCacheFolder(async (cacheFolder) => {
    const refused = await refusal(pinnedAgent({ readProgram: async () => program(dexFile('another agent')), cacheFolder }));
    assert.match(refused.message, /pinned SHA-256/);
    await assert.rejects(stat(cacheFolder), { code: 'ENOENT' });
  });
});

test('a missing or unreadable mobilecli program is ANDROID_TOOLS_UNAVAILABLE', async () => {
  await withCacheFolder(async (cacheFolder) => {
    const missing = Object.assign(new Error("Cannot find module '@mobilenext/mobilecli-darwin-arm64/package.json'"), { code: 'MODULE_NOT_FOUND' });
    const refused = await refusal(pinnedAgent({ readProgram: async () => { throw missing; }, cacheFolder }));
    assert.match(refused.message, /npm install/);
  });
});

test('a tampered cache file is detected and rewritten with the pinned agent, and its mode reset to 0600', async () => {
  const agent = dexFile('the device agent');
  const options = (cacheFolder: string) => ({ readProgram: async () => program(agent), cacheFolder, pinnedSha256: sha256(agent) });
  await withCacheFolder(async (cacheFolder) => {
    const first = await pinnedAgent(options(cacheFolder));
    await writeFile(first.path, 'not the agent', { mode: 0o644 });
    await chmod(first.path, 0o644);
    const second = await pinnedAgent(options(cacheFolder));
    assert.equal(second.path, first.path);
    assert.deepEqual(await readFile(second.path), agent);
    assert.equal((await stat(second.path)).mode & 0o777, 0o600);
    assert.deepEqual(await readdir(cacheFolder), [`${sha256(agent)}.dex`]);
  });
});

test('a cache folder that cannot be created is ANDROID_TOOLS_UNAVAILABLE', async () => {
  const agent = dexFile('the device agent');
  await withCacheFolder(async (cacheFolder) => {
    await writeFile(cacheFolder, 'a file where the cache folder should be');
    const refused = await refusal(pinnedAgent({ readProgram: async () => program(agent), cacheFolder, pinnedSha256: sha256(agent) }));
    assert.match(refused.message, /cache/);
  });
});

test('the installed mobilecli 1.0.14 program holds exactly one device agent, 72,660 bytes, with the pinned SHA-256', {
  skip: installed ? false : 'the Mac mobilecli program is not installed',
}, async () => {
  await withCacheFolder(async (cacheFolder) => {
    const found = await pinnedAgent({ cacheFolder });
    assert.equal(found.sha256, '0e0865d0617bc6e4abf0a7b24a956da1ca25cfc795c30d8e32c64eb0d1f6258f');
    assert.equal(found.sha256, PINNED_AGENT_SHA256);
    const agent = await readFile(found.path);
    assert.equal(agent.length, 72_660);
    assert.equal(sha256(agent), PINNED_AGENT_SHA256);
  });
});
