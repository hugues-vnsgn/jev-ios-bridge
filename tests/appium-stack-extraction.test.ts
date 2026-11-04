import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { FrozenStack, runTar, StackError } from '../src/appium/stack.js';
import { RELEASE_LOADED, RELEASE_RUNNER, stackRelease } from './fixtures/stack-release.js';

const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

async function prepareUnder<T>(umask: number, run: () => Promise<T>): Promise<T> {
  const before = process.umask(umask);
  try { return await run(); } finally { process.umask(before); }
}

for (const umask of [0o022, 0o027, 0o077]) {
  test(`first use under umask ${umask.toString(8).padStart(3, '0')} extracts the frozen modes and passes the identity check`, async t => {
    const release = stackRelease();
    t.after(() => rmSync(release.base, { recursive: true, force: true }));
    const stack = FrozenStack.forTesting(release);
    const { root } = await prepareUnder(umask, () => stack.prepare());
    assert.equal(statSync(join(root, RELEASE_LOADED)).mode & 0o777, 0o755);
    assert.equal(statSync(join(root, RELEASE_RUNNER)).mode & 0o777, 0o755);
    assert.equal((await stack.prepare()).root, root);
  });
}

test('a frozen file whose mode was changed after extraction still refuses', async t => {
  const release = stackRelease();
  t.after(() => rmSync(release.base, { recursive: true, force: true }));
  const stack = FrozenStack.forTesting(release);
  const { root } = await prepareUnder(0o077, () => stack.prepare());
  chmodSync(join(root, RELEASE_LOADED), 0o644);
  await assert.rejects(stack.prepare(), { code: 'STACK_FILE_MISMATCH' });
});

test('an archive whose modes differ from the manifest refuses on first use, with the advice to reinstall', async t => {
  const release = stackRelease();
  t.after(() => rmSync(release.base, { recursive: true, force: true }));
  const tree = join(release.base, 'tree');
  chmodSync(join(tree, RELEASE_LOADED), 0o644);
  execFileSync('tar', ['-czf', join(release.artifactRoot, 'stack.tar.gz'), '-C', tree, 'node_modules']);
  const identity = { ...release.identity, stackSha256: digest(readFileSync(join(release.artifactRoot, 'stack.tar.gz'))) };
  await assert.rejects(prepareUnder(0o077, () => FrozenStack.forTesting({ ...release, identity }).prepare()), {
    code: 'STACK_FILE_MISMATCH',
    message: `Frozen file differs: ${RELEASE_LOADED}. Reinstall jev-ios-bridge to restore its release files.`,
  });
});

test('an archive tar cannot read refuses with a stack code and tar\'s own words, not a bare command failure', async t => {
  const release = stackRelease();
  t.after(() => rmSync(release.base, { recursive: true, force: true }));
  const broken = Buffer.from('this is not a gzip archive\n');
  writeFileSync(join(release.artifactRoot, 'stack.tar.gz'), broken);
  const identity = { ...release.identity, stackSha256: digest(broken) };
  await assert.rejects(FrozenStack.forTesting({ ...release, identity }).prepare(), (error: unknown) => {
    assert.ok(error instanceof StackError);
    assert.equal(error.code, 'STACK_EXTRACT_FAILED');
    assert.match(error.message, /^tar listing stack\.tar\.gz failed/);
    assert.match(error.message, /Reinstall jev-ios-bridge/);
    return true;
  });
});

test('a tar that outlives its bound is killed and reported as a timeout, naming the bound', async t => {
  const release = stackRelease();
  t.after(() => rmSync(release.base, { recursive: true, force: true }));
  await assert.rejects(runTar(['-tzf', join(release.artifactRoot, 'stack.tar.gz')], 1, 'listing stack.tar.gz'), (error: unknown) => {
    assert.ok(error instanceof StackError);
    assert.equal(error.code, 'STACK_EXTRACT_TIMEOUT');
    assert.match(error.message, /^tar listing stack\.tar\.gz timed out after 0\.001 s/);
    return true;
  });
});
