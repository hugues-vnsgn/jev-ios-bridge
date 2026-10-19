import assert from 'node:assert/strict';
import { readFile, mkdir, open, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { journal } from './stop-journal.mjs';

const run = promisify(execFile);
const [platform, mode, caseName] = process.argv.slice(2);
assert.ok(['ios', 'android'].includes(platform));
assert.ok(['cancel', 'process-failure'].includes(mode));
assert.match(caseName, /^[a-z0-9-]+$/);
const source = import.meta.dirname;
const root = resolve(source, '../..');
const preparationPath = join(root, 'evidence/dedicated-device-preparation.json');
const preparation = JSON.parse(await readFile(preparationPath, 'utf8'));
const directory = join(root, 'evidence/stop-recovery', caseName);
await mkdir(directory, { recursive: false, mode: 0o700 });
const work = join(root, 'runtime', caseName); await mkdir(work, { mode: 0o700 });
const device = platform === 'ios' ? preparation.ios.udid : preparation.android.name;
const identity = { runId: caseName, platform, device };
journal(directory, 'initialize', identity);
const state = { ...identity, status: 'started', outcome: 'inconclusive', quarantined: true, leaseReleased: false };
state.sources = JSON.parse(await readFile(join(root, 'evidence/stop-recovery/sources.json'), 'utf8'));
for (const entry of state.sources.sources) assert.equal(createHash('sha256').update(await readFile(join(root, entry.path))).digest('hex'), entry.sha256);
const nativeEnv = { PATH: process.env.PATH, HOME: process.env.HOME, USER: process.env.USER };
async function command(file, args, timeout = 90_000) {
  return run(file, args, { timeout, maxBuffer: 4 * 1024 * 1024, env: nativeEnv });
}
async function persist(name, value) {
  const file = join(directory, name); const fd = await open(file + '.tmp', 'w', 0o600);
  try { await fd.writeFile(JSON.stringify(value, null, 2) + '\n'); await fd.sync(); } finally { await fd.close(); }
  await rename(file + '.tmp', file);
  const parent = await open(directory, 'r'); try { await parent.sync(); } finally { await parent.close(); }
}
async function waitFor(read, predicate, timeout = 10_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Bounded experiment event was not observed');
}
async function native(mode) {
  const { stdout } = await command('python3', [join(source, 'stop-owned-device.py'), preparationPath, platform, mode], 100_000);
  return JSON.parse(stdout);
}
async function stopGroup(ownerPath) {
  const { stdout } = await command('python3', [join(source, 'stop-group.py'), ownerPath], 15_000);
  return JSON.parse(stdout);
}
async function prepare() {
  state.beforePreparation = await native('verify');
  await persist('client.json', state);
  if (platform === 'ios') {
    await command('xcrun', ['simctl', '--set', preparation.ios.set, 'boot', preparation.ios.udid]);
    await command('xcrun', ['simctl', '--set', preparation.ios.set, 'bootstatus', preparation.ios.udid, '-b']);
  } else {
    const [, ...originalArgs] = preparation.android.launchArgs;
    const emulatorRecord = JSON.parse(await readFile(join(root, 'evidence/stop-recovery/alternate-emulator.json'), 'utf8'));
    const executable = emulatorRecord.executablePath;
    assert.equal(createHash('sha256').update(await readFile(executable)).digest('hex'), emulatorRecord.executableSha256);
    state.emulatorRuntime = emulatorRecord;
    const args = [...originalArgs, '-cores', '2'];
    state.emulatorLaunchArgs = [executable, ...args];
    const emulatorLog = await open(join(work, 'emulator.log'), 'w', 0o600);
    const sdk = join(process.env.HOME, 'Library/Android/sdk');
    const emulator = spawn(executable, args, { detached: true, stdio: ['ignore', emulatorLog.fd, emulatorLog.fd], env: { ...nativeEnv, ANDROID_AVD_HOME: preparation.android.avdHome, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk } });
    emulator.unref(); state.emulatorLaunchPid = emulator.pid;
    emulator.on('exit', (code, signal) => { state.emulatorExit = { code, signal }; });
    await emulatorLog.close(); await persist('client.json', state);
    await waitFor(async () => {
      if (state.emulatorExit) throw new Error('Owned emulator exited before boot: ' + JSON.stringify(state.emulatorExit));
      try { return (await command('adb', ['-s', preparation.android.serial, 'shell', 'getprop', 'sys.boot_completed'], 5000)).stdout.trim(); }
      catch { return ''; }
    }, value => value === '1', 90_000);
    const name = (await command('adb', ['-s', preparation.android.serial, 'emu', 'avd', 'name'])).stdout.split(/\r?\n/)[0];
    assert.equal(name, preparation.android.name);
    const artifact = await readFile(preparation.android.app.path);
    assert.equal(createHash('sha256').update(artifact).digest('hex'), preparation.android.app.sha256);
    await command('adb', ['-s', preparation.android.serial, 'install', '-r', preparation.android.app.path]);
  }
}
const vendor = await open(join(work, 'vendor.log'), 'w', 0o600);
const env = { PATH: process.env.PATH, HOME: work, TMPDIR: work, ANDROID_HOME: join(process.env.HOME, 'Library/Android/sdk'), ANDROID_SDK_ROOT: join(process.env.HOME, 'Library/Android/sdk'), AI_VISION_ENABLED: 'false', APPIUM_MCP_OTEL_ENABLED: 'false', APPIUM_MCP_ON_CLIENT_DISCONNECT: 'skip' };
assert.ok(!Object.keys({ ...getDefaultEnvironment(), ...env }).includes('TYPESAFE_API_KEY'));
async function connect(ownerPath) {
  const transport = new StdioClientTransport({ command: 'python3', args: [join(source, 'owned-launcher.py'), ownerPath, process.execPath, join(source, 'stop-server.mjs'), preparationPath, platform, directory], cwd: work, env, stderr: vendor.fd });
  const client = new Client({ name: 'jev-phase1-stop-recovery', version: '0.1.0' }, { capabilities: {} });
  await client.connect(transport);
  assert.deepEqual(client.getServerVersion(), { name: 'MCP Appium', version: '1.97.0' });
  const owner = JSON.parse(await readFile(ownerPath, 'utf8'));
  assert.equal(owner.pid, transport.pid); assert.equal(owner.pgid, owner.pid);
  return { client, transport, ownerPath };
}
const caps = platform === 'ios' ? { platformName: 'iOS', 'appium:automationName': 'XCUITest', 'appium:udid': preparation.ios.udid, 'appium:simulatorDevicesSetPath': preparation.ios.set, 'appium:bundleId': 'dev.jevbridge.diagnostic', 'appium:usePreinstalledWDA': true, 'appium:prebuiltWDAPath': join(root, 'runtime/wda-16.14.2/Build/Products/Debug-iphonesimulator/WebDriverAgentRunner-Runner.app'), 'appium:wdaLocalPort': 18100, 'appium:mjpegServerPort': 18101, 'appium:shutdownOtherSimulators': false, 'appium:noReset': true, 'appium:shouldTerminateApp': false } : { platformName: 'Android', 'appium:automationName': 'UiAutomator2', 'appium:udid': preparation.android.serial, 'appium:appPackage': 'dev.jevbridge.diagnostic', 'appium:appActivity': '.MainActivity', 'appium:systemPort': 18200, 'appium:mjpegServerPort': 18201, 'appium:noReset': true, 'appium:shouldTerminateApp': false };
const creation = { name: 'appium_session_management', arguments: { action: 'create', platform, capabilities: JSON.stringify(caps) } };
let active;
let restarted;
try {
  await prepare();
  active = await connect(join(directory, 'owner.json'));
  const reply = await active.client.callTool(creation, undefined, { timeout: 240_000 });
  assert.ok(!reply.isError); assert.equal(reply.structuredContent?.sessions.length, 1);
  const sessionId = reply.structuredContent.sessions[0].sessionId;
  state.sessionId = sessionId; state.capabilities = caps;
  const action = { name: 'appium_gesture', arguments: { sessionId, action: 'long_press', x: 100, y: 700, duration: 4000 } };
  const controller = new AbortController(); let confirmed = false;
  const pending = active.client.callTool(action, undefined, { timeout: 30_000, signal: controller.signal })
    .then(result => { confirmed = true; return { reply: result }; }, error => ({ failure: String(error) }));
  await waitFor(async () => journal(directory, 'inspect'), value => value.commands.at(-1)?.tool === 'appium_gesture' && value.commands.at(-1).disposition === 'outstanding');
  const log = await waitFor(async () => readFile(join(work, 'vendor.log'), 'utf8'), value => value.split('\n').some(line => /Proxying \[POST \/actions\]/.test(line) && line.includes('4000')));
  state.nativeDispatchLine = log.split('\n').find(line => /Proxying \[POST \/actions\]/.test(line) && line.includes('4000'));
  assert.equal(confirmed, false); assert.equal(journal(directory, 'inspect').commands.at(-1).disposition, 'outstanding');
  journal(directory, 'close'); // Commit closure before cancellation or signals.
  if (mode === 'process-failure') process.kill(active.transport.pid, 'SIGKILL');
  else controller.abort(new Error('Injected cancellation after native proxy dispatch'));
  state.interruptedReply = await pending; assert.ok(state.interruptedReply.failure);
  state.hostStop = await stopGroup(active.ownerPath); await active.client.close(); active.stopped = true;
  state.nativeStop = await native('stop');
  await persist('native-stop.json', { host: state.hostStop, native: state.nativeStop });
  const receiptSha256 = createHash('sha256').update(await readFile(join(directory, 'native-stop.json'))).digest('hex');
  const fence = journal(directory, 'record-fence', { device, receiptSha256, hostGroupStopped: state.hostStop.groupStopped, deviceOffline: state.nativeStop.deviceOffline, ownedPortsClosed: state.nativeStop.ownedPortsClosed });
  assert.equal(fence.accepted, true);
  state.recovery = JSON.parse((await command(process.execPath, [join(source, 'stop-journal.mjs'), directory, 'recover'])).stdout);
  assert.equal(state.recovery.closed, true); assert.equal(state.recovery.outcome, 'inconclusive');
  restarted = await connect(join(directory, 'recovery-owner.json'));
  for (const request of [action, creation]) {
    const refusal = await restarted.client.callTool(request, undefined, { timeout: 10_000 });
    assert.equal(refusal.isError, true); assert.equal(refusal.content[0].text, 'DISPATCH_CLOSED');
  }
  state.afterRestart = await native('verify');
  state.recoveryHostStop = await stopGroup(restarted.ownerPath); await restarted.client.close(); restarted.stopped = true;
  state.final = journal(directory, 'recover');
  assert.deepEqual(state.final, state.recovery);
  assert.equal(state.final.commands.length, 2);
  assert.equal(state.final.commands.filter(x => x.tool === 'appium_gesture').length, 1);
  assert.equal(state.final.leaseReleased, false); assert.equal(state.final.quarantined, true);
  state.status = 'passed-scoped-stop-recovery';
  await persist('client.json', state);
  console.log(JSON.stringify({ platform, mode, status: state.status, nativeDeviceOffline: true, restartRequestsRefused: 2, actionAttempts: 1, outcome: state.final.outcome, leaseReleased: false }));
} catch (error) {
  state.failure = String(error);
  try { state.journalAtFailure = journal(directory, 'inspect'); } catch (snapshotError) { state.snapshotFailure = String(snapshotError); }
  await persist('client.json', state); throw error;
} finally {
  if (state.status !== 'passed-scoped-stop-recovery') {
    try { journal(directory, 'close'); } catch (error) { state.dispatchClosureFailure = String(error); }
  }
  for (const connection of [active, restarted]) if (connection && !connection.stopped) {
    try { await stopGroup(connection.ownerPath); await connection.client.close(); }
    catch (error) { state.cleanupFailure = String(error); }
  }
  if (state.status !== 'passed-scoped-stop-recovery') {
    try { state.failureNativeStop = await native('stop'); }
    catch (error) { state.nativeCleanupFailure = String(error); }
  }
  await vendor.close(); await persist('client.json', state);
}
