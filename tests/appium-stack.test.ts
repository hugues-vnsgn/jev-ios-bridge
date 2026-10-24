import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { StackIdentity } from '../src/appium/stack.js';

const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const host = { platform: 'darwin', arch: 'arm64', node: '24.0.0' };
const runner = 'wda/WebDriverAgentRunner-Runner.app/runner';
const loaded = 'node_modules/appium-mcp/index.js';
function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'jev-stack-test-'));
  const artifactRoot = join(base, 'artifacts'); const tree = join(base, 'tree');
  const dataRoot = join(base, 'Application Support', 'jev-ios-bridge');
  mkdirSync(artifactRoot); const files: Record<string, { kind: 'file'; sha256: string; mode: number }> = {};
  for (const [path, content] of [[loaded, 'export const frozen = 1;\n'], [runner, 'qualified runner\n']]) {
    const pathName = path!; const bytes = content!;
    mkdirSync(dirname(join(tree, pathName)), { recursive: true }); writeFileSync(join(tree, pathName), bytes);
    chmodSync(join(tree, pathName), 0o755);
    files[pathName] = { kind: 'file', sha256: digest(bytes), mode: 0o755 };
  }
  execFileSync('tar', ['-czf', join(artifactRoot, 'stack.tar.gz'), '-C', tree, 'node_modules']);
  execFileSync('tar', ['-czf', join(artifactRoot, 'wda.tar.gz'), '-C', tree, 'wda']);
  const manifest = { version: 1, lockSha256: digest('lock'), files, loaded: [loaded], packages: [], androidApks: [],
    wda: { version: '16.14.2', path: 'wda/WebDriverAgentRunner-Runner.app', treeSha256: digest(Buffer.concat([
      Buffer.from('runner\0'), Buffer.from(digest('qualified runner\n'), 'hex'),
    ])) } };
  writeFileSync(join(artifactRoot, 'manifest.json'), JSON.stringify(manifest));
  const identity = { version: 1, stackSha256: digest(readFileSync(join(artifactRoot, 'stack.tar.gz'))),
    wdaSha256: digest(readFileSync(join(artifactRoot, 'wda.tar.gz'))), manifestSha256: digest(readFileSync(join(artifactRoot, 'manifest.json'))) } satisfies StackIdentity;
  return { base, artifactRoot, dataRoot, identity, host };
}
async function open(options: ReturnType<typeof fixture>) {
  const { FrozenStack } = await import('../src/appium/stack.js');
  return FrozenStack.forTesting(options);
}

test('first use extracts offline through a path containing Application Support and reuses it', async t => {
  const f = fixture(); t.after(() => rmSync(f.base, { recursive: true, force: true }));
  const stack = await open(f); const first = await stack.prepare(); const second = await stack.prepare();
  assert.equal(second.root, first.root);
  assert.equal(readFileSync(join(first.root, loaded), 'utf8'), 'export const frozen = 1;\n');
  assert.equal(readFileSync(join(first.root, runner), 'utf8'), 'qualified runner\n');
  assert.equal(first.wdaRunner, join(first.root, 'wda/WebDriverAgentRunner-Runner.app'));
  assert.deepEqual(first.warnings, []);
  assert.equal(readdirSync(f.dataRoot).length, 1);
});

for (const [file, code] of [['stack.tar.gz', 'STACK_ARCHIVE_MISMATCH'], ['wda.tar.gz', 'WDA_ARCHIVE_MISMATCH'], ['manifest.json', 'STACK_MANIFEST_MISMATCH']]) {
  test(`tampered ${file} refuses before extraction`, async t => {
    const f = fixture(); t.after(() => rmSync(f.base, { recursive: true, force: true }));
    writeFileSync(join(f.artifactRoot, file!), 'tampered');
    await assert.rejects((await open(f)).prepare(), { code });
    assert.equal(existsSync(f.dataRoot), false);
  });
}
for (const [file, code] of [['.verified.json', 'STACK_MARKER_MISMATCH'], [runner, 'WDA_MISMATCH'], [loaded, 'STACK_FILE_MISMATCH']]) {
  test(`tampered extracted ${file} refuses on the next start`, async t => {
    const f = fixture(); t.after(() => rmSync(f.base, { recursive: true, force: true }));
    const stack = await open(f); const first = await stack.prepare();
    writeFileSync(join(first.root, file!), 'tampered');
    await assert.rejects(stack.prepare(), { code });
    assert.equal(readFileSync(join(first.root, file!), 'utf8'), 'tampered');
  });
}
for (const facts of [{ ...host, arch: 'x64' }, { ...host, node: '22.22.2' }, { ...host, platform: 'linux' }]) {
  test(`unsupported host ${facts.platform}/${facts.arch}/${facts.node} refuses before any filesystem effect`, async t => {
    const f = fixture(); t.after(() => rmSync(f.base, { recursive: true, force: true }));
    rmSync(f.artifactRoot, { recursive: true });
    await assert.rejects((await open({ ...f, host: facts })).prepare(), { code: 'UNSUPPORTED_HOST' });
    assert.equal(existsSync(f.dataRoot), false);
  });
}
test('off-range iOS and Xcode warn and continue with the verified runner', async t => {
  const f = fixture(); t.after(() => rmSync(f.base, { recursive: true, force: true }));
  const result = await (await open(f)).prepare({ iosVersion: '26.4', xcodeVersion: '26.3' });
  assert.deepEqual(result.warnings, ['Unsupported iOS 26.4; qualified version is 26.5.', 'Unsupported Xcode 26.3; qualified version is 27.0.']);
  assert.equal(readFileSync(join(result.root, runner), 'utf8'), 'qualified runner\n');
  const supported = await (await open(f)).prepare({ iosVersion: '26.5', xcodeVersion: '27.0' });
  assert.deepEqual(supported.warnings, []);
});
test('two processes race first use and publish one complete extracted tree', async t => {
  const f = fixture(); t.after(() => rmSync(f.base, { recursive: true, force: true }));
  await open(f);
  const module = pathToFileURL(resolve('src/appium/stack.ts')).href;
  const script = `import { FrozenStack } from ${JSON.stringify(module)};
    process.stdout.write('ready\\n');
    await new Promise(done => process.stdin.once('data', done));
    const result = await FrozenStack.forTesting(JSON.parse(process.argv[1])).prepare();
    process.stdout.write(JSON.stringify(result)+'\\n'); process.stdin.destroy();`;
  const children = [0, 1].map(() => spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script, JSON.stringify(f)], { stdio: ['pipe', 'pipe', 'pipe'] }));
  const runs = children.map(child => {
    let stdout = ''; let stderr = '';
    const ready = new Promise<void>(done => child.stdout.on('data', chunk => { stdout += chunk; if (stdout.startsWith('ready\n')) done(); }));
    child.stderr.on('data', chunk => { stderr += chunk; });
    const done = new Promise<string>((done, fail) => { child.once('error', fail); child.once('close', code => code === 0 ? done(stdout) : fail(new Error(stderr))); });
    return { ready, done };
  });
  const timeout = setTimeout(() => children.forEach(child => child.kill('SIGKILL')), 15000); t.after(() => clearTimeout(timeout));
  await Promise.all(runs.map(run => run.ready)); children.forEach(child => child.stdin.end('go'));
  const results = (await Promise.all(runs.map(run => run.done))).map(stdout => JSON.parse(stdout.split('\n')[1]!));
  assert.equal(results[0].root, results[1].root);
  assert.equal(readFileSync(join(results[0].root, runner), 'utf8'), 'qualified runner\n');
  assert.deepEqual(readdirSync(f.dataRoot), [results[0].root.split('/').at(-1)]);
});
