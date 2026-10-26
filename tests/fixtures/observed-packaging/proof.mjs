import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

process.umask(0o077);
if (process.argv.includes('--help')) {
  console.log('Usage: node tests/fixtures/observed-packaging/proof.mjs\nMandatory H09 integration proof: isolated build snapshot, clean registry tarball install, installed CLI/MCP, plugin install. No key/device/store effects; no substitute or skip branch.');
  process.exit(0);
}
const checkout = resolve('.');
const source = checkout;
const evidence = process.env.JEV_PACKAGING_EVIDENCE_DIR
  ? resolve(process.env.JEV_PACKAGING_EVIDENCE_DIR) : mkdtempSync(join(tmpdir(), 'jev-installed-proof-'));
mkdirSync(evidence, { recursive: true, mode: 0o700 }); chmodSync(evidence, 0o700);
const snapshot = join(evidence, 'build-source');
const { cpSync, symlinkSync } = await import('node:fs');
mkdirSync(snapshot, { mode: 0o700 });
for (const file of ['src', 'scripts', 'skills', 'docs/guide', 'plugin', 'package.json', 'package-lock.json',
  'tsconfig.build.json', 'tsconfig.json', 'README.md', 'CHANGELOG.md', 'LICENSE']) {
  cpSync(join(checkout, file), join(snapshot, file), { recursive: true });
}
cpSync(join(checkout, 'stack'), join(snapshot, 'stack'), { recursive: true, filter: path => !path.split('/').includes('node_modules') && !path.includes('/stack/release') });
if (existsSync(join(checkout, 'THIRD_PARTY_NOTICES.md'))) cpSync(join(checkout, 'THIRD_PARTY_NOTICES.md'), join(snapshot, 'THIRD_PARTY_NOTICES.md'));
// Build tools may use checkout deps. Installed proof projects never inherit this link.
symlinkSync(realpathSync(join(checkout, 'node_modules')), join(snapshot, 'node_modules'), 'dir');
const commands = join(evidence, 'commands.jsonl');
const env = { ...process.env, PATH: dirname(process.execPath) + ':' + process.env.PATH,
  npm_config_cache: join(evidence, 'registry-cache'), npm_config_fetch_retries: '0', npm_config_fetch_timeout: '45000' };
delete env.TYPESAFE_API_KEY; delete env.NODE_OPTIONS;
const guard = resolve('tests/fixtures/observed-packaging/guard.mjs');
let sequence = 0;
function launch(command, args, options) {
  const previous = process.umask(0o022);
  try { return spawn(command, args, options); } finally { process.umask(previous); }
}
function record(command, args, cwd, result) {
  const id = String(++sequence).padStart(3, '0');
  const stdout = join(evidence, id + '.stdout'); const stderr = join(evidence, id + '.stderr');
  writeFileSync(stdout, result.stdout); writeFileSync(stderr, result.stderr);
  appendFileSync(commands, JSON.stringify({ id, command, args, cwd, node: process.version, exit: result.code,
    signal: result.signal, stdout, stderr }) + '\n');
}
async function run(command, args, cwd = snapshot, extra = {}, timeoutMs = 90000) {
  const child = launch(command, args, { cwd, env: { ...env, ...extra }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = ''; child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
  const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
  const result = await new Promise((done, fail) => {
    child.once('error', fail); child.once('close', (code, signal) => done({ code, signal, stdout, stderr }));
  }); clearTimeout(timer); record(command, args, cwd, result); return result;
}
function ok(result) { assert.equal(result.code, 0, result.stderr + '\n' + result.stdout); assert.equal(result.signal, null); return result.stdout; }
const required = ['docs/guide/14-observed-actions.md', 'docs/guide/reference/observed-format.md', 'skills/test-ios/SKILL.md',
  'dist/cli.js', 'dist/mcp/observed.js', 'dist/observed/cli.js', 'dist/observed/service.js',
  'dist/observed/allocation.js', 'dist/device/admission-maintenance.js', 'dist/device/admission-sqlite.js',
  'dist/appium/stack.js', 'dist/appium/stack-identity.js', 'dist/appium/extension/entry.js', 'dist/appium/extension/server.js',
  'dist/appium/extension/plugin.js', 'dist/appium/extension/operations.js', 'dist/appium/wire-schemas.js', 'stack/release/stack.tar.gz', 'stack/release/wda.tar.gz',
  'stack/release/manifest.json', 'THIRD_PARTY_NOTICES.md'];
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
function manifest(root) { return Object.fromEntries(required.map(file => [file, sha(join(root, file))])); }
async function mcp(cli, cwd, gate, guardLog) {
  const args = ['--import', guard, cli, 'mcp'];
  const child = launch(process.execPath, args, { cwd, env: { ...env, JEV_EXPERIMENTAL_OBSERVED: gate,
    JEV_PACKAGING_GUARD_LOG: guardLog }, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map(); let next = 0; let stdout = ''; let stderr = '';
  child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => { const reply = JSON.parse(line); const waiter = pending.get(reply.id); if (waiter) { pending.delete(reply.id); waiter.resolve(reply); } });
  child.once('exit', () => { for (const p of pending.values()) p.reject(new Error('MCP exited: ' + stderr)); });
  const rpc = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++next; pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  const timer = setTimeout(() => child.kill('SIGKILL'), 12000);
  try {
    const init = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'installed-proof', version: '1' } });
    assert.equal(init.result.serverInfo.name, 'jev-ios-bridge');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const tools = (await rpc('tools/list')).result.tools.filter(t => t.name.includes('observed')).sort((a,b) => a.name.localeCompare(b.name));
    const golden = JSON.parse(readFileSync(join(source, 'tests/golden/observed-mcp-v1.json'), 'utf8')).tools;
    const expected = gate === '1' ? golden : golden.filter(t => !['prepare_observed_allocation', 'start_observed_action'].includes(t.name));
    assert.deepEqual(tools, expected);
    for (const tool of tools) {
      const reply = (await rpc('tools/call', { name: tool.name, arguments: { bogus: 'private-submitted-value' } })).result;
      assert.equal(reply.isError, true); assert.equal(reply.content.length, 2);
      assert.ok(reply.content.every(c => c.type === 'text')); assert.equal(reply.structuredContent, undefined);
      const error = JSON.parse(reply.content[1].text);
      assert.equal(error.kind, 'observed-operation-error'); assert.ok(['INVALID_REQUEST', 'UNSUPPORTED_VERSION'].includes(error.code));
      assert.equal(error.acceptance, 'no'); assert.ok(!JSON.stringify(reply).includes('private-submitted-value'));
    }
  } finally {
    child.stdin.end(); const stopped = child.exitCode === null ? new Promise(done => child.once('close', (code, signal) => done({ code, signal }))) : Promise.resolve({ code: child.exitCode, signal: child.signalCode });
    const result = await stopped; clearTimeout(timer); lines.close(); record(process.execPath, args, cwd, { ...result, stdout, stderr });
    assert.equal(result.code, 0, stderr);
  }
}
async function smoke(root, bin, cwd, name) {
  const cli = join(root, 'dist/cli.js');
  const guardLog = join(evidence, name + '-forbidden.jsonl'); writeFileSync(guardLog, '');
  assert.equal(readFileSync(cli, 'utf8').split('\n')[0], '#!/usr/bin/env node');
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  assert.equal(ok(await run(bin, ['--version'], cwd)).trim(), version);
  assert.equal(ok(await run(process.execPath, [cli, '--version'], cwd)).trim(), version);
  const help = ok(await run(bin, ['--help'], cwd));
  const commandsList = ['observed-allocate', 'observed-allocation', 'observed-allocation-cancel', 'observed-retire',
    'observed-action', 'observed-report', 'observed-cancel'];
  for (const command of commandsList) {
    assert.ok(help.includes(command));
    // Missing/invalid input refuses offline, so no production store is opened.
    const invalid = await run(process.execPath, ['--import', guard, cli, command, '--json'], cwd,
      { JEV_EXPERIMENTAL_OBSERVED: '1', JEV_PACKAGING_GUARD_LOG: guardLog });
    assert.equal(invalid.code, 3, invalid.stderr); const error = JSON.parse(invalid.stdout);
    assert.equal(error.code, 'INVALID_REQUEST'); assert.equal(error.acceptance, 'no');
  }
  const disabled = join(cwd, name + '-action.json');
  writeFileSync(disabled, JSON.stringify({ version: 1, actionId: 'installed-one', allocationId: 'ABCDEF00-0000-4000-8000-000000000001',
    app: { bundleId: 'com.example.app' }, action: { kind: 'tap', selector: { identifier: 'button' } },
    before: { present: [{ identifier: 'before' }] }, after: { present: [{ identifier: 'after' }] }, timeoutMs: 1000 }));
  for (const gate of ['0', 'true']) {
    const result = await run(process.execPath, ['--import', guard, cli, 'observed-action', disabled, '--json'], cwd,
      { JEV_EXPERIMENTAL_OBSERVED: gate, JEV_PACKAGING_GUARD_LOG: guardLog });
    assert.equal(result.code, 3); assert.equal(JSON.parse(result.stdout).code, 'OBSERVED_DISABLED');
  }
  const maintenance = ok(await run(process.execPath, [join(root, 'dist/device/admission-maintenance.js'), '--help'], cwd));
  assert.ok(maintenance.includes('migrate <declaration.json>')); assert.ok(maintenance.includes('no destination override'));
  for (const gate of ['0', 'true', '1']) await mcp(cli, cwd, gate, guardLog);
  assert.equal(readFileSync(guardLog, 'utf8'), '', 'Startup/schema validation attempted a forbidden effect');
}
async function offlineStack(root, dataRoot = join(evidence, 'Application Support', 'stacks')) {
  const script = `
    import assert from 'node:assert/strict';
    import cp from 'node:child_process';
    import net from 'node:net';
    import http from 'node:http';
    import https from 'node:https';
    import { syncBuiltinESMExports } from 'node:module';
    import { promisify } from 'node:util';
    import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
    import { dirname, join } from 'node:path';
    import { pathToFileURL } from 'node:url';
    const refuse = () => { throw new Error('Offline extraction attempted a forbidden effect'); };
    globalThis.fetch = refuse; net.connect = net.createConnection = net.Socket.prototype.connect = refuse;
    http.request = http.get = https.request = https.get = refuse;
    const execFile = cp.execFile;
    let tarCalls = 0;
    const validate = (command, args) => { tarCalls++; assert.equal(command, '/usr/bin/tar'); assert.equal(['-tzf', '-xzf'].includes(args[0]), true); };
    const allowed = (...args) => { validate(...args); return execFile(...args); };
    allowed[promisify.custom] = (...args) => { validate(...args); return execFile[promisify.custom](...args); };
    cp.execFile = allowed;
    for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFileSync', 'fork']) cp[name] = refuse;
    syncBuiltinESMExports();
    const root = process.argv[1];
    const { FrozenStack } = await import(pathToFileURL(join(root, 'dist/appium/stack.js')));
    const { default: identity } = await import(pathToFileURL(join(root, 'dist/appium/stack-identity.js')));
    const host = { platform: 'darwin', arch: 'arm64', node: process.versions.node };
    mkdirSync(dirname(process.argv[2]), { recursive: true, mode: 0o700 });
    const tampered = mkdtempSync(join(dirname(process.argv[2]), 'tampered-'));
    cpSync(join(root, 'stack/release'), join(tampered, 'release'), { recursive: true });
    const archive = join(tampered, 'release/stack.tar.gz'); const bytes = readFileSync(archive); bytes[bytes.length >> 1] ^= 1; writeFileSync(archive, bytes);
    await assert.rejects(FrozenStack.forTesting({ artifactRoot: join(tampered, 'release'), dataRoot: join(tampered, 'stacks'), identity, host }).prepare(),
      { code: 'STACK_ARCHIVE_MISMATCH' });
    assert.equal(existsSync(join(tampered, 'stacks')), false, 'a tampered archive must be refused before extraction');
    assert.equal(tarCalls, 0, 'a tampered archive must be refused before tar runs');
    rmSync(tampered, { recursive: true });
    const stack = FrozenStack.forTesting({ artifactRoot: join(root, 'stack/release'), dataRoot: process.argv[2], identity, host });
    const first = await stack.prepare({ iosVersion: '26.5', xcodeVersion: '27.0' });
    const second = await stack.prepare();
    assert.equal(first.root, second.root);
    assert.equal(first.manifest.wda.treeSha256, '5d1fc1c99908e253303f6de35bf26ed4a74a75817f704e7a3646b72b5271ba04');
    assert.equal(first.manifest.loaded.length, 3499);
    assert.equal(first.manifest.androidApks.length, 3);
    assert.deepEqual(first.warnings, []);
    process.stdout.write(JSON.stringify({ root: first.root, identity, loaded: first.manifest.loaded.length, offline: true }));`;
  return JSON.parse(ok(await run(process.execPath, ['--input-type=module', '-e', script, root, dataRoot])));
}
try {
  assert.ok(!existsSync(join(snapshot, 'dist')) && !existsSync(join(snapshot, 'stack/release')), 'npm pack must build the release inputs itself');
  const packed = JSON.parse(ok(await run('npm', ['pack', '--json', '--pack-destination', evidence], snapshot, {}, 300000)))[0];
  const tarball = join(evidence, packed.filename);
  for (const file of required) assert.ok(packed.files.some(f => f.path === file), 'tarball missing ' + file);
  const clean = join(evidence, 'clean'); mkdirSync(clean, { mode: 0o700 });
  writeFileSync(join(clean, 'package.json'), JSON.stringify({ name: 'isolated-installed-proof', private: true, version: '1.0.0' }));
  assert.deepEqual(readdirSync(clean), ['package.json']); assert.ok(!existsSync(join(clean, 'node_modules')));
  ok(await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], clean));
  const installed = join(clean, 'node_modules/jev-ios-bridge'); const bin = join(clean, 'node_modules/.bin/jev-ios-bridge');
  assert.ok(lstatSync(bin).isSymbolicLink()); assert.equal(realpathSync(bin), realpathSync(join(installed, 'dist/cli.js')));
  assert.ok(!lstatSync(installed).isSymbolicLink());
  assert.deepEqual(manifest(installed), manifest(snapshot));
  await smoke(installed, bin, clean, 'npm');
  const npmStack = await offlineStack(installed);
  ok(await run('npm', ['run', 'build:plugin'], snapshot, {}, 300000));
  const plugin = join(snapshot, 'build/plugin/jev-ios-bridge');
  for (const file of required) assert.ok(existsSync(join(plugin, file)), 'plugin missing ' + file);
  const pluginSkill = readFileSync(join(plugin, 'skills/test-ios/SKILL.md'), 'utf8');
  assert.ok(pluginSkill.includes('${CLAUDE_PLUGIN_ROOT}/docs/guide/')); assert.ok(pluginSkill.includes('14-observed-actions.md'));
  const market = JSON.parse(readFileSync(join(snapshot, 'build/plugin/marketplace.json'), 'utf8'));
  const zip = join(snapshot, 'build/plugin', market.plugins[0].source.url.split('/').at(-1));
  assert.equal(sha(zip), market.plugins[0].source.sha256);
  const pluginInstall = join(evidence, 'plugin');
  mkdirSync(pluginInstall);
  ok(await run('unzip', ['-q', zip, '-d', pluginInstall]));
  for (const file of required) assert.ok(existsSync(join(pluginInstall, file)), 'plugin zip missing ' + file);
  assert.ok(!existsSync(join(pluginInstall, 'node_modules')));
  ok(await run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], pluginInstall));
  // The plugin has no npm bin declaration; invoke its compiled CLI directly.
  const pluginBin = join(pluginInstall, 'dist/cli.js'); chmodSync(pluginBin, 0o755);
  await smoke(pluginInstall, pluginBin, pluginInstall, 'plugin');
  const pluginFreshStack = await offlineStack(pluginInstall, join(evidence, 'Application Support', 'plugin-stacks'));
  assert.deepEqual(pluginFreshStack.identity, npmStack.identity);
  const pluginStack = await offlineStack(pluginInstall);
  assert.deepEqual(pluginStack, npmStack, 'Both installation channels must share the same verified extracted tree');
  for (const file of required.filter(file => file !== 'skills/test-ios/SKILL.md'))
    assert.equal(sha(join(pluginInstall, file)), sha(join(installed, file)), `Installation payload differs: ${file}`);
  const summary = { status: 'PASS', node: process.version, evidence, commands, cleanInstall: true, symlink: true, shebang: true,
    skips: 0, cliOperationsPerInstallation: 7, mcpGateCasesPerInstallation: 3, installations: 2, mcpSchemaErrorCalls: 34, commandCount: sequence, plugin: true, forbiddenEffects: 0,
    tarball: { path: tarball, sha256: sha(tarball) }, pluginZip: { path: zip, sha256: sha(zip) },
    source: manifest(snapshot), installed: manifest(installed), pluginFiles: manifest(pluginInstall),
    stack: { npm: npmStack, plugin: pluginFreshStack, sharedReuse: true, offlineExtractions: 2, tamperedArchivesRefused: 3 } };
  writeFileSync(join(evidence, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary));
} catch (error) {
  const summary = { status: 'FAIL', node: process.version, evidence, commands, error: error.message };
  writeFileSync(join(evidence, 'failure.json'), JSON.stringify(summary, null, 2) + '\n');
  console.error(JSON.stringify(summary)); process.exitCode = 1;
}
