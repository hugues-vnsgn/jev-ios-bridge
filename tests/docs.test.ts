import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { REASON_CODES, ROLES } from '../src/scripted/vocabulary.js';

const shippedRoots = ['README.md', 'CHANGELOG.md', 'LICENSE', 'docs/guide'];

function markdownFiles(path: string): string[] {
  if (statSync(path).isFile()) return path.endsWith('.md') ? [path] : [];
  return readdirSync(path).flatMap(name => markdownFiles(join(path, name)));
}

const shipped = ['README.md', 'CHANGELOG.md', ...markdownFiles('docs/guide')];

test('shipped docs link only to files inside the package, and every link resolves', () => {
  for (const file of shipped) {
    for (const [, target] of readFileSync(file, 'utf8').matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^(https?:|mailto:|#)/.test(target!)) continue;
      const path = normalize(join(dirname(file), target!.split('#')[0]!));
      assert.ok(existsSync(path), `${file} links to missing ${target}`);
      assert.ok(shippedRoots.some(root => path === root || !relative(root, path).startsWith('..')),
        `${file} links outside the package: ${target} (use the GitHub URL at the release tag)`);
    }
  }
});

test('the reason-code reference lists exactly the bridge-owned codes', () => {
  const page = readFileSync('docs/guide/reference/reason-codes.md', 'utf8');
  const listed = [...page.matchAll(/^\| `([A-Z_]+)` \|/gm)].map(match => match[1]);
  assert.deepEqual([...listed].sort(), Object.keys(REASON_CODES).sort());
});

test('the script-format reference lists exactly the bridge-owned roles', () => {
  const page = readFileSync('docs/guide/reference/script-format.md', 'utf8');
  const line = page.split('\n').find(row => row.startsWith('| `role` |'))!;
  assert.deepEqual([...line.matchAll(/`([a-z-]+)`/g)].map(match => match[1]).filter(role => role !== 'role'), [...ROLES]);
});
