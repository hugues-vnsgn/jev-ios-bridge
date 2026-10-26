#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync, openSync, closeSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';

const root = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const cli = join(root, 'dist/cli.js');
const base = join(root, '.jev-runs/verification');
const stamp = join(root, 'dist/.verification-build.json');
const { positionals, values } = parseArgs({ allowPositionals: true, options: {
  evidence: { type: 'string' }, avd: { type: 'string' }, port: { type: 'string' }, serial: { type: 'string' },
} });
const [mode] = positionals;
assert.equal(positionals.length, 1, 'Usage: verify.mjs build|doctor|smoke|android-start|cleanup [--evidence DIR] [--avd NAME] [--port N] [--serial ID]');
assert(Number(process.versions.node.split('.')[0]) >= 24, 'Node 24 or newer required');
const evidence = values.evidence && resolve(values.evidence);
const cleanEnv = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: tmpdir(),
  ANDROID_HOME: process.env.ANDROID_HOME, ANDROID_SDK_ROOT: process.env.ANDROID_SDK_ROOT,
  JEV_LOG_PANE: 'off' };
function command(bin, args, options = {}) {
  const result = spawnSync(bin, args, { cwd: root, env: cleanEnv, encoding: 'utf8',
    timeout: 15000, maxBuffer: 4 * 1024 * 1024, ...options });
  assert(!result.error, `${bin}: ${result.error?.message}`);
  assert.equal(result.status, 0, `${bin} ${args.join(' ')}: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}
function digest(paths) {
  const hash = createHash('sha256');
  function add(path) {
    if (path === 'dist/.verification-build.json') return;
    const absolute = join(root, path);
    if (statSync(absolute).isDirectory()) {
      for (const entry of readdirSync(absolute).sort()) add(`${path}/${entry}`);
    } else hash.update(path).update('\0').update(readFileSync(absolute)).update('\0');
  }
  paths.forEach(add);
  return hash.digest('hex');
}
function identity() {
  return { root, revision: command('git', ['rev-parse', 'HEAD']), node: process.version,
    version: JSON.parse(readFileSync(join(root, 'package.json'))).version,
    sourceSha256: digest(['src', 'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.build.json']),
    distSha256: digest(['dist']) };
}
function built() {
  assert(existsSync(cli) && existsSync(stamp), 'Run verify.mjs build first');
  const now = identity();
  const recorded = JSON.parse(readFileSync(stamp));
  for (const key of ['root', 'revision', 'sourceSha256', 'distSha256']) {
    assert.equal(now[key], recorded[key], `Build receipt mismatch for ${key}. Run verify.mjs build`);
  }
  const version = command(process.execPath, [cli, '--version']);
  assert.equal(version, now.version, 'Built CLI version differs from package');
  assert.match(command(process.execPath, [cli, '--help']), /Observed prepare\/start requires JEV_EXPERIMENTAL_OBSERVED=1/);
  return now;
}
function save(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
}
function ownerFile() {
  assert(evidence, '--evidence DIR is required');
  return join(evidence, 'emulator.json');
}
function startTime(pid) {
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'lstart='], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}
function owned() {
  const state = JSON.parse(readFileSync(ownerFile()));
  assert(state.root === root && Number.isInteger(state.pid) && state.pid > 1 && state.started,
    'Invalid emulator ownership receipt');
  assert(/^emulator-\d+$/.test(state.serial), 'Only an owned emulator is supported');
  assert.equal(startTime(state.pid), state.started, 'Owned emulator is absent or its PID was reused');
  const running = command('ps', ['-p', String(state.pid), '-o', 'command=']);
  assert(running.includes(`-avd ${state.avd} `) && running.includes(`-port ${state.serial.slice(9)} `),
    'PID no longer identifies the launched AVD and port');
  return state;
}
function ready(state) {
  assert.equal(command('adb', ['-s', state.serial, 'get-state']), 'device');
  assert.equal(command('adb', ['-s', state.serial, 'emu', 'avd', 'name']).split('\n')[0].trim(), state.avd);
  assert.equal(command('adb', ['-s', state.serial, 'shell', 'getprop', 'sys.boot_completed']), '1');
  assert.match(command('adb', ['-s', state.serial, 'shell', 'pm', 'path', 'android']), /^package:/m);
}
async function freePort(port) {
  await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => server.close(resolvePort));
  });
}
async function androidStart() {
  const file = ownerFile();
  assert(!existsSync(file), 'Use a fresh evidence directory for each launch');
  const avd = values.avd;
  const port = Number(values.port ?? '5588');
  assert(avd && !avd.startsWith('-'), '--avd must name the task-assigned AVD');
  assert(Number.isInteger(port) && port >= 5554 && port <= 5682 && port % 2 === 0, 'Use an even emulator port between 5554 and 5682');
  assert(command('emulator', ['-list-avds']).split('\n').includes(avd), 'Assigned AVD is missing');
  const devices = command('adb', ['devices']);
  const serial = `emulator-${port}`;
  assert(!devices.includes(serial), 'Requested emulator serial already exists');
  for (const line of devices.split('\n')) {
    const existing = line.match(/^(emulator-\d+)\s+device$/)?.[1];
    if (existing) assert.notEqual(command('adb', ['-s', existing, 'emu', 'avd', 'name']).split('\n')[0].trim(), avd,
      'Assigned AVD is already running. Do not take over another instance');
  }
  await freePort(port);
  await freePort(port + 1);
  mkdirSync(evidence, { recursive: true, mode: 0o700 });
  const log = openSync(join(evidence, 'emulator.log'), 'ax', 0o600);
  const args = ['-avd', avd, '-port', String(port), '-no-snapshot-save'];
  const child = spawn('emulator', args, { cwd: root, env: cleanEnv, detached: true, stdio: ['ignore', log, log] });
  try { await new Promise((resolveSpawn, reject) => { child.once('spawn', resolveSpawn); child.once('error', reject); }); }
  finally { closeSync(log); }
  const state = { root, avd, serial, pid: child.pid, started: startTime(child.pid), command: ['emulator', ...args] };
  save(file, state);
  child.unref();
  assert(state.started, 'Emulator exited before ownership could be recorded. Inspect emulator.log');
  const deadline = Date.now() + 240000;
  while (Date.now() < deadline) {
    assert.equal(startTime(state.pid), state.started, 'Emulator exited during boot. Inspect emulator.log');
    try { ready(state); console.log(JSON.stringify(state, null, 2)); return; } catch { await delay(1000); }
  }
  throw new Error('Emulator readiness timed out. Run cleanup --evidence with this directory');
}
async function cleanup() {
  const file = ownerFile();
  if (!existsSync(file)) { console.log('No emulator ownership receipt. No process signalled.'); return; }
  const state = JSON.parse(readFileSync(file));
  const current = startTime(state.pid);
  if (current) {
    owned();
    process.kill(state.pid, 'SIGTERM');
    for (let i = 0; i < 200 && startTime(state.pid) === state.started; i++) await delay(100);
    if (startTime(state.pid) === state.started) {
      process.kill(state.pid, 'SIGKILL');
      for (let i = 0; i < 100 && startTime(state.pid) === state.started; i++) await delay(100);
    }
    assert.notEqual(startTime(state.pid), state.started, 'Owned emulator process did not stop');
  }
  let connected;
  for (let i = 0; i < 100; i++) {
    connected = command('adb', ['devices']);
    if (!connected.split('\n').some(line => line.startsWith(`${state.serial}\t`))) break;
    await delay(100);
  }
  assert(!connected.split('\n').some(line => line.startsWith(`${state.serial}\t`)), 'Owned emulator serial remains attached');
  const receipt = { pid: state.pid, serial: state.serial, stopped: true, evidenceRetained: existsSync(file) };
  save(join(evidence, 'cleanup.json'), receipt);
  console.log(JSON.stringify(receipt, null, 2));
}
function smoke() {
  const provenance = built();
  const scratch = mkdtempSync(join(tmpdir(), 'jev-verification-'));
  mkdirSync(evidence ?? base, { recursive: true, mode: 0o700 });
  const output = mkdtempSync(join(evidence ?? base, 'cli-'));
  const env = { PATH: process.env.PATH, TMPDIR: tmpdir(), JEV_PROJECT_DIR: scratch,
    JEV_RUNS_DIR: join(scratch, 'runs'), JEV_LOG_PANE: 'off' };
  const results = [];
  let failure;
  function drive(name, args, status, pattern) {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd: scratch, env, encoding: 'utf8',
      timeout: 15000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024 });
    const row = { name, command: [process.execPath, cli, ...args], status: result.status, signal: result.signal,
      stdout: result.stdout ?? '', stderr: result.stderr ?? '', error: result.error?.message };
    results.push(row);
    save(join(output, `${name}.json`), row);
    assert.equal(result.error, undefined, `${name}: process failed`);
    assert.equal(result.status, status, `${name}: unexpected exit code`);
    assert.match(row.stdout + row.stderr, pattern, `${name}: expected output missing`);
  }
  try {
    drive('version', ['--version'], 0, new RegExp(provenance.version.replaceAll('.', '\\.')));
    drive('help', ['--help'], 0, /Observed prepare\/start requires/);
    writeFileSync(join(scratch, 'broken.json'), '{', { mode: 0o600 });
    drive('invalid-json', ['run', 'broken.json', '--json'], 3, /not valid JSON/);
    drive('unknown-report', ['report', 'verification-missing', '--json'], 3, /No readable run verification-missing in /);
    assert(!existsSync(join(scratch, 'runs')), 'Refused requests created a run directory');
    assert.deepEqual(readdirSync(scratch), ['broken.json'], 'Unexpected project side effects');
  } catch (error) { failure = error; }
  finally {
    rmSync(scratch, { recursive: true, force: true });
    save(join(output, 'summary.json'), { ...provenance, passed: !failure, failure: failure?.message,
      scratchRemoved: !existsSync(scratch), coverage: 'CLI version, help, malformed-script refusal and unknown-report refusal only',
      cases: results.map(({ name, status }) => ({ name, status })),
      untested: ['device actions', 'live Jev', 'MCP lifecycle', 'capture', 'driven handbacks', 'observed actions', 'native cleanup'] });
    assert(existsSync(join(output, 'summary.json')), 'Evidence lost during cleanup');
    console.log(output);
  }
  if (failure) throw failure;
}
try {
  switch (mode) {
    case 'build': {
      const before = digest(['src', 'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.build.json']);
      command('npm', ['run', 'build'], { timeout: 300000 });
      const receipt = identity();
      assert.equal(receipt.sourceSha256, before, 'Source changed during build. Rebuild before driving');
      save(stamp, receipt);
      console.log(JSON.stringify(built(), null, 2));
      break;
    }
    case 'doctor': {
      const receipt = built();
      if (values.serial) {
        assert(/^emulator-\d+$/.test(values.serial), 'Live doctor accepts only an owned emulator. Physical phones need a separate explicit assignment and recipe');
        const state = owned();
        assert.equal(values.serial, state.serial, 'Device differs from ownership receipt');
        ready(state);
        assert.match(command('adb', ['-s', state.serial, 'shell', 'pm', 'path', 'dev.jevbridge.diagnostic']), /^package:/m, 'Diagnostic APK is not installed');
        assert(process.env.TYPESAFE_API_KEY?.trim(), 'Jev key absent. Use node --env-file with the original checkout path');
        receipt.device = { serial: state.serial, avd: state.avd, pid: state.pid, ready: true, keyPresent: true };
      }
      console.log(JSON.stringify(receipt, null, 2));
      break;
    }
    case 'smoke': smoke(); break;
    case 'android-start': await androidStart(); break;
    case 'cleanup': await cleanup(); break;
    default: throw new Error('Usage: verify.mjs build|doctor|smoke|android-start|cleanup');
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
