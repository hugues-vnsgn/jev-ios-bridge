import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { stageArtifact, verifyStagedArtifact } from '../src/observed/artifact.js';
async function cleanup(root: string): Promise<void> {
  async function writable(path: string): Promise<void> {
    const stat = await fs.lstat(path); if (!stat.isDirectory() || stat.isSymbolicLink()) return;
    await fs.chmod(path, 0o700); for (const child of await fs.readdir(path)) await writable(join(path, child));
  }
  await writable(root); await fs.rm(root, { recursive: true, force: true });
}
const plist = { CFBundleIdentifier: 'org.example.fixture', CFBundleExecutable: 'Fixture', CFBundlePackageType: 'APPL', CFBundleSupportedPlatforms: ['iPhoneSimulator'], MinimumOSVersion: '17.0' };
function binary(): Buffer {
  const b = Buffer.alloc(56); b.writeUInt32LE(0xfeedfacf); b.writeUInt32LE(0x100000c, 4); b.writeUInt32LE(2, 12);
  b.writeUInt32LE(1, 16); b.writeUInt32LE(24, 20); b.writeUInt32LE(0x32, 32); b.writeUInt32LE(24, 36); b.writeUInt32LE(7, 40); b.writeUInt32LE(0x110000, 44); return b;
}
async function fixture() {
  const root = await fs.mkdtemp(join(tmpdir(), 'observed-artifact-')); await fs.chmod(root, 0o700);
  const app = join(root, 'Fixture.app'); const stagingRoot = join(root, 'staging'); await fs.mkdir(app); await fs.mkdir(stagingRoot, { mode: 0o700 });
  await fs.cp(fileURLToPath(new URL('./fixtures/observed-artifacts/Fixture.app', import.meta.url)), app, { recursive: true });
  return { root, app, stagingRoot, request: { artifactPath: app, stagingRoot, bundleId: 'org.example.fixture', build: { id: 'fixture-build', origin: 'fixture' }, target: { architecture: 'arm64' as const, runtimeVersion: '27.0' }, maxBytes: 1024 },
    dependencies: { process: async () => ({ exitCode: 0, stdout: JSON.stringify(plist), stderr: '' }) } };
}
test('staging binds unchanged bytes to a private immutable simulator artifact', async () => {
  const f = await fixture();
  try {
    const receipt = await stageArtifact(f.request, f.dependencies);
    assert.notEqual(receipt.stagedPath, f.app); assert.equal(receipt.metadata.bundleId, plist.CFBundleIdentifier);
    assert.equal(receipt.metadata.architecture, 'arm64'); assert.match(receipt.contentDigest, /^[a-f0-9]{64}$/);
    assert.equal((await fs.stat(receipt.stagedPath)).mode & 0o777, 0o500);
    await verifyStagedArtifact(receipt);
    await fs.writeFile(join(f.app, 'Info.plist'), 'changed source');
    await verifyStagedArtifact(receipt);
    await fs.chmod(join(receipt.stagedPath, 'Fixture'), 0o755); await fs.writeFile(join(receipt.stagedPath, 'Fixture'), 'changed stage');
    await assert.rejects(verifyStagedArtifact(receipt), { reason: 'ARTIFACT_INVALID' });
  } finally { await cleanup(f.root); }
});
test('verification refuses staging made writable even before content is changed', async () => {
  const f = await fixture();
  try { const receipt = await stageArtifact(f.request, f.dependencies); await fs.chmod(join(receipt.stagedPath, 'Info.plist'), 0o644);
    await assert.rejects(verifyStagedArtifact(receipt), { reason: 'ARTIFACT_INVALID' });
  } finally { await cleanup(f.root); }
});
test('source mutation before staging completion refuses the copy', async () => {
  const f = await fixture();
  try {
    await assert.rejects(stageArtifact(f.request, { process: async () => { await fs.writeFile(join(f.app, 'Info.plist'), 'source mutated while metadata was read'); return { exitCode: 0, stdout: JSON.stringify(plist), stderr: '' }; } }), { reason: 'ARTIFACT_INVALID' });
    assert.deepEqual(await fs.readdir(f.stagingRoot), []);
  } finally { await cleanup(f.root); }
});
import { inspectArtifact } from '../src/observed/artifact.js';
test('offline inspection reads explicit metadata with an argument array and has no staging effect', async () => {
  const f = await fixture(); const calls: unknown[] = [];
  try {
    const inspected = await inspectArtifact(f.request, { process: async (file, args, options) => { calls.push([file, args, options.shell]); return { exitCode: 0, stdout: JSON.stringify(plist), stderr: '' }; } });
    assert.equal(inspected.metadata.minimumOSVersion, '17.0');
    assert.deepEqual(calls, [['/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', join(f.app, 'Info.plist')], false]]);
    assert.deepEqual(await fs.readdir(f.stagingRoot), []);
  } finally { await cleanup(f.root); }
});
for (const [label, value, reason] of [
  ['bundle identity mismatch', { ...plist, CFBundleIdentifier: 'org.wrong' }, 'ARTIFACT_INVALID'],
  ['missing executable', { ...plist, CFBundleExecutable: undefined }, 'ARTIFACT_INVALID'],
  ['path executable', { ...plist, CFBundleExecutable: '../Fixture' }, 'ARTIFACT_INVALID'],
  ['missing minimum OS', { ...plist, MinimumOSVersion: undefined }, 'ARTIFACT_INVALID'],
  ['future minimum OS', { ...plist, MinimumOSVersion: '28.0' }, 'ARTIFACT_INCOMPATIBLE'],
  ['physical device platform', { ...plist, CFBundleSupportedPlatforms: ['iPhoneOS'] }, 'ARTIFACT_INCOMPATIBLE'],
] as const) test(`artifact refuses ${label}`, async () => {
  const f = await fixture();
  try { await assert.rejects(stageArtifact(f.request, { process: async () => ({ exitCode: 0, stdout: JSON.stringify(value), stderr: '' }) }), { reason }); assert.deepEqual(await fs.readdir(f.stagingRoot), []); }
  finally { await cleanup(f.root); }
});
for (const [label, mutate, reason] of [
  ['physical-device Mach-O', (b: Buffer) => { b.writeUInt32LE(2, 40); }, 'ARTIFACT_INCOMPATIBLE'],
  ['incompatible architecture', (b: Buffer) => { b.writeUInt32LE(0x1000007, 4); }, 'ARTIFACT_INCOMPATIBLE'],
  ['future executable OS', (b: Buffer) => { b.writeUInt32LE(0x1c0000, 44); }, 'ARTIFACT_INCOMPATIBLE'],
  ['malformed load command', (b: Buffer) => { b.writeUInt32LE(128, 36); }, 'ARTIFACT_INVALID'],
  ['missing simulator metadata', (b: Buffer) => { b.writeUInt32LE(0x24, 32); }, 'ARTIFACT_INCOMPATIBLE'],
] as const) test(`artifact refuses ${label} despite a simulator plist`, async () => {
  const f = await fixture();
  try { const b = binary(); mutate(b); await fs.writeFile(join(f.app, 'Fixture'), b); await assert.rejects(stageArtifact(f.request, f.dependencies), { reason }); }
  finally { await cleanup(f.root); }
});
test('safe internal symlinks stay unchanged while escaping links refuse', async () => {
  const f = await fixture();
  try {
    await fs.mkdir(join(f.app, 'Resources')); await fs.writeFile(join(f.app, 'Resources', 'data'), 'payload');
    await fs.symlink('Resources/data', join(f.app, 'data-link'));
    const receipt = await stageArtifact(f.request, f.dependencies); assert.equal(await fs.readlink(join(receipt.stagedPath, 'data-link')), 'Resources/data'); await verifyStagedArtifact(receipt);
    await fs.symlink('../staging', join(f.app, 'escape'));
    await assert.rejects(stageArtifact(f.request, f.dependencies), { reason: 'ARTIFACT_INVALID' });
  } finally { await cleanup(f.root); }
});
test('symlink chains that leave the bundle refuse without a source fallback', async () => {
  const f = await fixture();
  try { await fs.writeFile(join(f.root, 'outside'), 'outside'); await fs.symlink('../outside', join(f.app, 'external')); await fs.symlink('external', join(f.app, 'chain')); await assert.rejects(stageArtifact(f.request, f.dependencies), { reason: 'ARTIFACT_INVALID' }); }
  finally { await cleanup(f.root); }
});
test('artifact and staging filesystem errors are bounded private failures', async () => {
  const f = await fixture();
  try {
    await assert.rejects(stageArtifact({ ...f.request, maxBytes: 1 }, f.dependencies), { reason: 'ARTIFACT_INVALID' });
    await fs.chmod(f.stagingRoot, 0o755); await assert.rejects(stageArtifact(f.request, f.dependencies), { reason: 'ARTIFACT_INVALID' }); await fs.chmod(f.stagingRoot, 0o700);
    await assert.rejects(stageArtifact({ ...f.request, artifactPath: join(f.root, 'missing.app') }, f.dependencies), { reason: 'ARTIFACT_INVALID' });
    await assert.rejects(stageArtifact(f.request, { process: async () => { throw new Error('sensitive private process failure'); } }), error => error instanceof Error && !error.message.includes('sensitive'));
    await assert.rejects(stageArtifact(f.request, { process: async () => ({ exitCode: 1, stdout: 'private', stderr: 'private' }) }), { reason: 'ARTIFACT_INVALID' });
    await assert.rejects(stageArtifact(f.request, { process: async () => ({ exitCode: 0, stdout: '{', stderr: '' }) }), { reason: 'ARTIFACT_INVALID' });
  } finally { await cleanup(f.root); }
});
test('universal executable accepts the declared host slice and simulator minimum OS', async () => {
  const f = await fixture();
  try {
    const arm = binary(); const intel = binary(); intel.writeUInt32LE(0x1000007, 4);
    const fat = Buffer.alloc(48 + arm.length + intel.length); fat.writeUInt32BE(0xcafebabe); fat.writeUInt32BE(2, 4);
    fat.writeUInt32BE(0x100000c, 8); fat.writeUInt32BE(48, 16); fat.writeUInt32BE(arm.length, 20);
    fat.writeUInt32BE(0x1000007, 28); fat.writeUInt32BE(48 + arm.length, 36); fat.writeUInt32BE(intel.length, 40); arm.copy(fat, 48); intel.copy(fat, 48 + arm.length);
    await fs.writeFile(join(f.app, 'Fixture'), fat);
    const receipt = await stageArtifact({ ...f.request, target: { architecture: 'x86_64', runtimeVersion: '27.0' } }, f.dependencies);
    assert.equal(receipt.metadata.architecture, 'x86_64'); await verifyStagedArtifact(receipt);
  } finally { await cleanup(f.root); }
});
test('verification catches added files', async () => {
  const f = await fixture();
  try {
    const receipt = await stageArtifact(f.request, f.dependencies); await fs.chmod(receipt.stagedPath, 0o700);
    await fs.writeFile(join(receipt.stagedPath, 'added'), 'changed', { mode: 0o400 }); await fs.chmod(receipt.stagedPath, 0o500);
    await assert.rejects(verifyStagedArtifact(receipt), { reason: 'ARTIFACT_INVALID' });
  } finally { await cleanup(f.root); }
});
test('metadata cancellation refuses even when its process ignores the abort', { timeout: 1000 }, async () => {
  const f = await fixture(); const controller = new AbortController();
  try {
    const inspecting = inspectArtifact(f.request, { signal: controller.signal, process: () => { controller.abort(); return new Promise(() => {}); } });
    await assert.rejects(inspecting, { reason: 'ARTIFACT_INVALID' });
  } finally { await cleanup(f.root); }
});
test('injected clock bounds an abort-ignoring metadata process', async () => {
  const f = await fixture(); let deadline!: () => void; let cleared = false;
  try {
    await assert.rejects(inspectArtifact(f.request, { clock: { setTimeout: callback => { deadline = callback; return 1; }, clearTimeout: () => { cleared = true; } },
      process: async () => { deadline(); return new Promise(() => {}); } }), { reason: 'ARTIFACT_INVALID' });
    assert.equal(cleared, true);
  } finally { await cleanup(f.root); }
});
test('the filesystem seam detects source mutation during bounded copying', async () => {
  const f = await fixture(); let changed = false;
  const interceptedFs: typeof fs = { ...fs, open: async (...args: Parameters<typeof fs.open>) => {
    if (!changed && String(args[0]).includes('artifact-') && String(args[0]).endsWith('Info.plist') && args[1] === 'wx') {
      changed = true; await fs.writeFile(join(f.app, 'Info.plist'), 'changed during copy');
    }
    return fs.open(...args);
  } };
  try { await assert.rejects(stageArtifact(f.request, { ...f.dependencies, fs: interceptedFs }), { reason: 'ARTIFACT_INVALID' }); assert.equal(changed, true); assert.deepEqual(await fs.readdir(f.stagingRoot), []); }
  finally { await cleanup(f.root); }
});
