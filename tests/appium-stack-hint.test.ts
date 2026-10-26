import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { FrozenStack } from '../src/appium/stack.js';
import { RELEASE_LOADED, stackRelease } from './fixtures/stack-release.js';

test('a tampered extracted stack refuses with the folder to delete, so the next start extracts it again', async t => {
  const release = stackRelease();
  t.after(() => rmSync(release.base, { recursive: true, force: true }));
  const stack = FrozenStack.forTesting(release);
  const { root } = await stack.prepare();
  writeFileSync(join(root, RELEASE_LOADED), 'tampered');
  await assert.rejects(stack.prepare(), { code: 'STACK_FILE_MISMATCH',
    message: `Frozen file differs: ${RELEASE_LOADED}. Delete ${root} and start again; the bridge extracts the stack again from its release.` });
  rmSync(root, { recursive: true });
  assert.equal((await stack.prepare()).root, root);
});

test('a tampered release file refuses with the advice to reinstall the bridge', async t => {
  const release = stackRelease();
  t.after(() => rmSync(release.base, { recursive: true, force: true }));
  writeFileSync(join(release.artifactRoot, 'wda.tar.gz'), 'tampered');
  await assert.rejects(FrozenStack.forTesting(release).prepare(), { code: 'WDA_ARCHIVE_MISMATCH',
    message: 'wda.tar.gz differs from the built bridge. Reinstall jev-ios-bridge to restore its release files.' });
});
