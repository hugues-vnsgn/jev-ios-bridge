import { createHash } from 'node:crypto';
import { cpSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import type { VerifiedStack } from '../../../src/appium/stack.js';
/** A test's cleanup hooks, or a fixture process's own list. */
export type Cleanups = { after(cleanup: () => unknown): void };

export function imageStack(t: Cleanups, omit: (name: string) => boolean = () => false) {
  const root = mkdtempSync(join(tmpdir(), 'jev-image-stack-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = fileURLToPath(new URL('../../../.scratch/appium-mcp-migration/candidate-stack/node_modules', import.meta.url));
  const available = ['sharp', 'detect-libc', 'semver', ...readdirSync(join(source, '@img')).map(n => `@img/${n}`)];
  const names = available.filter(name => !omit(name));
  const files: VerifiedStack['manifest']['files'] = {};
  const packages: VerifiedStack['manifest']['packages'] = [];
  for (const name of names) {
    const path = `node_modules/${name}`;
    cpSync(join(source, name), join(root, path), { recursive: true });
    packages.push({ name, path, version: 'test', integrity: null, integritySource: path, resolved: null });
    const walk = (directory: string) => {
      for (const item of readdirSync(join(root, directory), { withFileTypes: true })) {
        const rel = directory + '/' + item.name;
        if (item.isDirectory()) walk(rel);
        else files[rel] = { kind: 'file', mode: lstatSync(join(root, rel)).mode & 0o777,
          sha256: createHash('sha256').update(readFileSync(join(root, rel))).digest('hex') };
      }
    };
    walk(path);
  }
  const stack: VerifiedStack = { root, nodeModules: join(root, 'node_modules'), wdaRunner: '/test/wda', warnings: [],
    identity: { version: 1, stackSha256: '1'.repeat(64), wdaSha256: '2'.repeat(64), manifestSha256: '3'.repeat(64) },
    manifest: { version: 1, lockSha256: '4'.repeat(64), files, loaded: ['node_modules/sharp/package.json'], packages, androidApks: [],
      wda: { version: '16.14.2', path: 'wda', treeSha256: '5'.repeat(64) } } };
  const binary = Object.keys(files).find(p => p.endsWith('.node')) ?? 'node_modules/missing.node';
  if (!files[binary] && names.length === available.length) throw new Error('Sharp native fixture missing');
  return { stack, binary: join(root, binary) };
}
