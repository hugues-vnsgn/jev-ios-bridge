import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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
test('the installed smoke guard refuses Appium driver construction and the shipped stack, but leaves the test stack open', async () => {
  const root = mkdtempSync(join(tmpdir(), 'jev-packaging-guard-')); const appium = join(root, 'dist/appium');
  mkdirSync(appium, { recursive: true }); writeFileSync(join(root, 'package.json'), '{"type":"module"}');
  writeFileSync(join(appium, 'driver.js'), 'export class AppiumDriver {\n    options;\n    constructor(options) {\n        this.options = options;\n    }\n}\n');
  writeFileSync(join(appium, 'stack.js'), 'export class FrozenStack {\n    static shipped() {\n        return "shipped";\n    }\n    static forTesting(inputs) { return inputs; }\n}\n');
  const log = join(root, 'forbidden.jsonl'); writeFileSync(log, '');
  const script = `
    const { pathToFileURL } = await import('node:url');
    const load = name => import(pathToFileURL(process.argv[1] + '/dist/appium/' + name).href);
    const { AppiumDriver } = await load('driver.js'); const { FrozenStack } = await load('stack.js');
    const attempt = effect => { try { return effect(); } catch (error) { return error.message; } };
    console.log(JSON.stringify([attempt(() => new AppiumDriver({}).options), attempt(() => FrozenStack.shipped()), FrozenStack.forTesting('test')]));`;
  const child = spawn(process.execPath, ['--import', resolve('tests/fixtures/observed-packaging/guard.mjs'), '--input-type=module', '-e', script, root],
    { env: { ...process.env, JEV_PACKAGING_GUARD_LOG: log }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', bytes => { stdout += bytes; }); child.stderr.on('data', bytes => { stderr += bytes; });
  const code = await new Promise<number | null>(done => child.once('exit', done));
  assert.equal(code, 0, stderr);
  assert.deepEqual(JSON.parse(stdout), ['Installed smoke attempted forbidden effect: AppiumDriver',
    'Installed smoke attempted forbidden effect: FrozenStack.shipped', 'test']);
  assert.equal(readFileSync(log, 'utf8'), '{"forbidden":"AppiumDriver"}\n{"forbidden":"FrozenStack.shipped"}\n');
});
test('the installed smoke guard loads a device module with no driver class and still refuses subprocesses', async () => {
  const root = mkdtempSync(join(tmpdir(), 'jev-packaging-guard-device-')); const device = join(root, 'dist/device');
  mkdirSync(device, { recursive: true }); writeFileSync(join(root, 'package.json'), '{"type":"module"}');
  writeFileSync(join(device, 'index.js'), 'export class DeviceReasonError extends Error {\n    constructor(code, message) {\n        super(message);\n        this.code = code;\n    }\n}\n');
  const log = join(root, 'forbidden.jsonl'); writeFileSync(log, '');
  const script = `
    const { pathToFileURL } = await import('node:url'); const { execFile } = await import('node:child_process');
    const { DeviceReasonError } = await import(pathToFileURL(process.argv[1] + '/dist/device/index.js').href);
    const attempt = effect => { try { return effect(); } catch (error) { return error.message; } };
    console.log(JSON.stringify([new DeviceReasonError('NO_DEVICE', 'none').code, attempt(() => execFile('xcrun', ['simctl', 'list']))]));`;
  const child = spawn(process.execPath, ['--import', resolve('tests/fixtures/observed-packaging/guard.mjs'), '--input-type=module', '-e', script, root],
    { env: { ...process.env, JEV_PACKAGING_GUARD_LOG: log }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', bytes => { stdout += bytes; }); child.stderr.on('data', bytes => { stderr += bytes; });
  const code = await new Promise<number | null>(done => child.once('exit', done));
  assert.equal(code, 0, stderr);
  assert.deepEqual(JSON.parse(stdout), ['NO_DEVICE', 'Installed smoke attempted forbidden effect: child_process.execFile']);
  assert.equal(readFileSync(log, 'utf8'), '{"forbidden":"child_process.execFile"}\n');
});
