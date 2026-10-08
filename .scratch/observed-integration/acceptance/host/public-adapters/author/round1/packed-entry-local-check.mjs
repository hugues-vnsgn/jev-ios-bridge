import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createInterface } from 'node:readline';
const execute = promisify(execFile);
const evidence = resolve('.scratch/observed-integration/acceptance/host/public-adapters');
const root = await mkdtemp(join(tmpdir(), 'jev-public-packed-'));
try {
  const { stdout: packed } = await execute('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', root]);
  const manifest = JSON.parse(packed)[0];
  assert.ok(manifest.files.some(value => value.path === 'dist/observed/cli.js'));
  assert.ok(manifest.files.some(value => value.path === 'dist/mcp/observed.js'));
  assert.ok(!manifest.files.some(value => value.path.endsWith('.env')));
  const app = join(root, 'install'); await mkdir(app);
  await writeFile(join(app, 'package.json'), JSON.stringify({ private: true }));
  await execute('tar', ['-xzf', join(root, manifest.filename), '-C', root]);
  const unpacked = join(root, 'package');
  await symlink(resolve('node_modules'), join(unpacked, 'node_modules'));
  await execute('npm', ['install', '--prefix', app, '--offline', '--ignore-scripts', '--no-audit', '--no-fund', unpacked], { timeout: 60000 });
  const bin = join(app, 'node_modules/.bin/jev-ios-bridge');
  const env = { ...process.env, JEV_EXPERIMENTAL_OBSERVED: '0' }; delete env.TYPESAFE_API_KEY;
  const receipts = [];
  for (const executable of [bin, '/Users/hugues_mini/.npm/_npx/2c6eebc6231f3284/node_modules/node/bin/node']) {
    const prefix = executable === bin ? [] : [bin];
    const version = await execute(executable, [...prefix, '--version'], { env, cwd: app });
    assert.equal(version.stdout, '1.3.1\n');
    const help = await execute(executable, [...prefix, '--help'], { env, cwd: app });
    for (const command of ['observed-allocate', 'observed-allocation', 'observed-retire', 'observed-allocation-cancel', 'observed-action', 'observed-report', 'observed-cancel']) assert.ok(help.stdout.includes(command));
    const disabled = await execute(executable, [...prefix, 'observed-action', '/never/read.json', '--json'], { env, cwd: app }).then(() => assert.fail('Disabled action must refuse'), error => error);
    assert.equal(disabled.code, 3); assert.equal(disabled.stdout.trim().split('\n').length, 1); assert.equal(JSON.parse(disabled.stdout).code, 'OBSERVED_DISABLED');
    const toolCounts = [];
    for (const enabled of ['0', '1']) {
      const child = spawn(executable, [...prefix, 'mcp'], { env: { ...env, JEV_EXPERIMENTAL_OBSERVED: enabled }, cwd: app, stdio: ['pipe', 'pipe', 'pipe'] });
      let stderr = ''; child.stderr.on('data', value => { stderr += value; });
      const lines = createInterface({ input: child.stdout }); const pending = new Map(); let next = 0;
      lines.on('line', line => { const reply = JSON.parse(line); pending.get(reply.id)?.(reply); pending.delete(reply.id); });
      const request = (method, params = {}) => new Promise(done => { const id = ++next; pending.set(id, done); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
      const timer = setTimeout(() => child.kill('SIGTERM'), 5000);
      try {
        const init = await request('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'packed', version: '1' } });
        assert.equal(init.result.serverInfo.name, 'jev-ios-bridge');
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
        const list = await request('tools/list'); const names = list.result.tools.map(value => value.name).filter(value => value.includes('observed')).sort();
        const expected = ['cancel_observed_action', 'cancel_observed_allocation', 'get_observed_action', 'get_observed_allocation', 'retire_observed_allocation', ...(enabled === '1' ? ['prepare_observed_allocation', 'start_observed_action'] : [])].sort();
        assert.deepEqual(names, expected); toolCounts.push({ enabled, observedTools: names.length });
      } finally {
        const stopped = child.exitCode === null ? new Promise(done => child.once('exit', done)) : Promise.resolve();
        child.stdin.end(); await stopped; clearTimeout(timer); lines.close();
      }
    }
    receipts.push({ toolCounts, executable: executable === bin ? 'installed npm .bin shebang' : 'exact Node24 installed .bin', version: version.stdout.trim(), helpCommands: 7, disabledExit: disabled.code });
  }
  await writeFile(join(evidence, 'packed-entry-local-result.json'), JSON.stringify({ tarball: manifest.filename, files: manifest.files.length, actualBin: await realpath(bin), receipts }, null, 2) + '\n');
  console.log(JSON.stringify({ npmLocalFolderInstallOfExactTarball: true, receipts }, null, 2));
} finally { await rm(root, { recursive: true, force: true }); }
