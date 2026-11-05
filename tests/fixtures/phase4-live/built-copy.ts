import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';

/** A compiled second copy of the product, the way `dist` is: its classes are not the ones `src` defines. */
export function compiledCopy(t: TestContext): string {
  const repo = join(import.meta.dirname, '..', '..', '..');
  mkdirSync(join(repo, 'node_modules', '.cache'), { recursive: true });
  const home = mkdtempSync(join(repo, 'node_modules', '.cache', 'p4-built-copy-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  copyFileSync(join(repo, 'package.json'), join(home, 'package.json'));
  const root = join(home, 'dist');
  const built = spawnSync(process.execPath, [join(repo, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', join(repo, 'tsconfig.build.json'), '--outDir', root], { encoding: 'utf8' });
  assert.equal(built.status, 0, built.stdout + built.stderr);
  writeFileSync(join(root, 'appium', 'stack-identity.js'), 'export default {};\n');
  return root;
}
