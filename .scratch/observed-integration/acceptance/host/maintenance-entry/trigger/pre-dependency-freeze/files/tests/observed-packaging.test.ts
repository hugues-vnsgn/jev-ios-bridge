import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';
import { rewriteSkill } from '../scripts/build-plugin.mjs';

test('H09 installed observed guide and maintenance entry are included by package files', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  for (const root of ['dist', 'skills', 'docs/guide']) assert.ok(pkg.files.includes(root));
  for (const file of ['docs/guide/14-observed-actions.md', 'docs/guide/reference/observed-format.md',
    'skills/test-ios/SKILL.md', 'src/device/admission-maintenance.ts']) assert.ok(existsSync(file), file);
  assert.equal(pkg.bin['jev-ios-bridge'], 'dist/cli.js');
});
test('plugin skill rewrite retains the installed observed workflow references', () => {
  const skill = rewriteSkill('test-ios', readFileSync('skills/test-ios/SKILL.md', 'utf8'));
  assert.ok(skill.includes('${CLAUDE_PLUGIN_ROOT}/docs/guide/'));
  assert.ok(skill.includes('14-observed-actions.md')); assert.ok(skill.includes('reference/observed-format.md'));
  assert.ok(!skill.includes('node_modules/jev-ios-bridge/docs/guide/'));
});
test('mandatory integration proof has a bounded key-free help entry; this unit check does not assert installation', async () => {
  const env = { ...process.env }; delete env.TYPESAFE_API_KEY;
  const child = spawn(process.execPath, ['tests/fixtures/observed-packaging/proof.mjs', '--help'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', bytes => { stdout += bytes; }); child.stderr.on('data', bytes => { stderr += bytes; });
  const code = await new Promise<number | null>(done => child.once('exit', done));
  assert.equal(code, 0, stderr); assert.match(stdout, /Mandatory H09 integration proof/);
  assert.match(stdout, /No.*skip branch/);
});
