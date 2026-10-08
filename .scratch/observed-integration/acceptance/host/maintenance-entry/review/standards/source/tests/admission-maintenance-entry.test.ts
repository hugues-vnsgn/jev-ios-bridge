import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const entry = realpathSync(resolve('src/device/admission-maintenance.ts'));
function child(args: string[]) {
  const env = { ...process.env };
  delete env.TYPESAFE_API_KEY;
  delete env.NODE_OPTIONS;
  delete env.NODE_NO_WARNINGS;
  return spawnSync(process.execPath, ['--import', 'tsx', ...args], {
    cwd: process.cwd(), env, encoding: 'utf8', timeout: 5000,
  });
}
function help(path: string) {
  const result = child([path, '--help']);
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^Usage: node dist\/device\/admission-maintenance\.js migrate <declaration\.json>\n/);
  assert.match(result.stdout, /no destination override/);
  assert.match(result.stdout, /Sources are never rewritten or deleted/);
}

test('maintenance direct canonical entry prints offline help', () => help(entry));

test('maintenance file symlink entry prints the same offline help', t => {
  const root = mkdtempSync(join(tmpdir(), 'jev-maintenance-entry-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'package.json'), '{"type":"module"}', { mode: 0o600 });
  const alias = join(root, 'maintenance.ts');
  symlinkSync(entry, alias);
  help(alias);
});

test('maintenance directory alias entry prints the same offline help', t => {
  const root = mkdtempSync(join(tmpdir(), 'jev-maintenance-directory-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const alias = join(root, 'device');
  symlinkSync(dirname(entry), alias, 'dir');
  help(join(alias, 'admission-maintenance.ts'));
});

for (const hostEntry of [undefined, '/nonexistent/jev-maintenance-import-host.mjs']) {
  test(`maintenance import stays inert with ${hostEntry ? 'missing' : 'no'} host entry`, () => {
    const code = `process.argv[1] = ${JSON.stringify(hostEntry) ?? 'undefined'}; await import(${JSON.stringify(pathToFileURL(entry).href)}); process.stdout.write('import-inert\\n');`;
    const result = child(['--input-type=module', '-e', code]);
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'import-inert\n');
  });
}
