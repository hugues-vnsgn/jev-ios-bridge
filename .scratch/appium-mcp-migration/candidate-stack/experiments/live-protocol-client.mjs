import assert from 'node:assert/strict';
import { fstatSync, statSync, readFileSync } from 'node:fs';
import { readdir, readFile, writeFile, mkdir, open, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFile, spawn, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { creation, xmlText, elements, completion, screenshot } from './protocol-contract.mjs';
import { journal } from './stop-journal.mjs';
import { experimentPassed } from './live-experiment-result.mjs';
const [platform, caseName, cleanup = 'shutdown', faultMode = 'normal'] = process.argv.slice(2);
assert.ok(['ios', 'android'].includes(platform)); assert.ok(['shutdown', 'automation'].includes(cleanup)); assert.ok(['normal', 'lost-create', 'lost-action', 'late-action', 'cancel', 'process-failure'].includes(faultMode)); assert.match(caseName, /^[a-z0-9-]+$/);
const source = import.meta.dirname, root = resolve(source, '../..');
const lockPath = join(root, 'runtime/devices', 'phase1-' + platform + '.lock');
if (!process.env.JEV_EXPERIMENT_LOCK_FD) {
  const guarded = spawnSync('python3', [join(source, 'experiment-device-lock.py'), lockPath, process.execPath, ...process.argv.slice(1)], { stdio: 'inherit', env: { PATH: process.env.PATH, HOME: process.env.HOME, USER: process.env.USER } });
  process.exit(guarded.status ?? 1);
}
const lockFd = Number(process.env.JEV_EXPERIMENT_LOCK_FD);
assert.equal(fstatSync(lockFd).ino, statSync(lockPath).ino);
assert.equal(JSON.parse(readFileSync(lockPath, 'utf8')).pid, process.pid);
const prepPath = join(root, 'evidence/phase1-freeze-20261018.json');
const prep = JSON.parse(await readFile(prepPath, 'utf8'));
assert.equal(prep.ios.udid, '15013501-2535-42EB-A67F-45B015DF18F4');
assert.equal(prep.ios.set, join(root, 'runtime/devices/simulators'));
assert.equal(prep.android.name, 'jev_appium_phase1_20261018'); assert.equal(prep.android.serial, 'emulator-5570');
const directory = join(root, 'evidence/live-protocol', caseName), work = join(root, 'runtime', caseName);
await mkdir(directory, { recursive: false, mode: 0o700 }); await mkdir(work, { mode: 0o700 });
const device = platform === 'ios' ? prep.ios.udid : prep.android.name;
const frozenSources = [];
for (const name of (await readdir(source)).filter(name => /\.(mjs|py)$/.test(name)).sort()) { const bytes = await readFile(join(source, name)); frozenSources.push({ name, sha256: createHash('sha256').update(bytes).digest('hex'), source: bytes.toString('utf8') }); }
await writeFile(join(directory, 'source-record.json'), JSON.stringify({ version: 1, files: frozenSources }, null, 2) + '\n', { mode: 0o600 });
journal(directory, 'initialize', { runId: caseName, platform, device });
const state = { platform, runId: caseName, device, status: 'started', requests: [], leaseReleased: false, quarantined: true, fullNativeFenceProven: false };
async function persist(file, value) {
  const path = join(directory, file); const handle = await open(path + '.tmp', 'w', 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); } finally { await handle.close(); }
  await rename(path + '.tmp', path); const parent = await open(directory, 'r'); try { await parent.sync(); } finally { await parent.close(); }
}
const run = promisify(execFile), nativeEnv = { PATH: process.env.PATH, HOME: process.env.HOME, USER: process.env.USER };
async function command(file, args, timeout = 90_000) { return run(file, args, { timeout, maxBuffer: 4 * 1024 * 1024, env: nativeEnv }); }
async function native(mode) { return JSON.parse((await command('python3', [join(source, 'stop-private-device.py'), prepPath, platform, mode], 100_000)).stdout); }
async function descendantInventory(mode) {
  let output;
  try { output = (await command('python3', [join(source, 'verify-native-descendants.py'), directory, ownerPath, mode], 25_000)).stdout; }
  catch (error) { if (!error.stdout) throw error; output = error.stdout; }
  return JSON.parse(output);
}
async function prepare() {
  state.beforePreparation = await native('verify'); state.preparationAuthorized = true; await persist('client.json', state);
  if (platform === 'ios') {
    await command('xcrun', ['simctl', '--set', prep.ios.set, 'boot', prep.ios.udid]);
    await command('xcrun', ['simctl', '--set', prep.ios.set, 'bootstatus', prep.ios.udid, '-b']);
    state.deviceRoot = JSON.parse((await command('python3', [join(source, 'process-ownership.py'), 'device-root', join(directory, 'profile.json')], 15_000)).stdout);
    await persist('device-root.json', state.deviceRoot);
  } else {
    const record = prep.emulator;
    assert.equal(createHash('sha256').update(await readFile(record.executablePath)).digest('hex'), record.executableSha256);
    const [, ...args] = prep.android.launchArgs;
    const log = await open(join(work, 'emulator.log'), 'w', 0o600);
    const sdk = join(process.env.HOME, 'Library/Android/sdk');
    const child = spawn(record.executablePath, [...args, '-cores', '2'], { detached: true, stdio: ['ignore', log.fd, log.fd], env: { ...nativeEnv, ANDROID_AVD_HOME: prep.android.avdHome, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk } });
    child.unref(); let exited; child.on('exit', (code, signal) => { exited = { code, signal }; }); await log.close();
    state.emulator = { record, pid: child.pid };
    const deadline = Date.now() + 180_000; let booted = false;
    while (Date.now() < deadline) {
      if (exited) throw new Error('Owned emulator exited before readiness');
      try { booted = (await command('adb', ['-s', prep.android.serial, 'shell', 'getprop', 'sys.boot_completed'], 5000)).stdout.trim() === '1'; } catch {}
      if (booted) break; await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(booted); assert.equal((await command('adb', ['-s', prep.android.serial, 'emu', 'avd', 'name'])).stdout.split(/\r?\n/)[0], prep.android.name);
    assert.equal(createHash('sha256').update(await readFile(prep.android.app.path)).digest('hex'), prep.android.app.sha256);
    await command('adb', ['-s', prep.android.serial, 'install', '-r', prep.android.app.path]);
  }
}
const caps = platform === 'ios' ? { platformName: 'iOS', 'appium:automationName': 'XCUITest', 'appium:udid': prep.ios.udid, 'appium:simulatorDevicesSetPath': prep.ios.set, 'appium:bundleId': 'dev.jevbridge.diagnostic', 'appium:usePreinstalledWDA': true, 'appium:prebuiltWDAPath': join(root, 'runtime/wda-16.14.2/Build/Products/Debug-iphonesimulator/WebDriverAgentRunner-Runner.app'), 'appium:wdaLocalPort': 18100, 'appium:wdaLaunchTimeout': 120000, 'appium:mjpegServerPort': 18101, 'appium:shutdownOtherSimulators': false, 'appium:noReset': true, 'appium:shouldTerminateApp': cleanup === 'automation', 'appium:settings[pageSourceExcludedAttributes]': '' } : { platformName: 'Android', 'appium:automationName': 'UiAutomator2', 'appium:udid': prep.android.serial, 'appium:appPackage': 'dev.jevbridge.diagnostic', 'appium:appActivity': '.MainActivity', 'appium:systemPort': 18200, 'appium:mjpegServerPort': 18201, 'appium:uiautomator2ServerInstallTimeout': 120000, 'appium:adbExecTimeout': 120000, 'appium:noReset': true, 'appium:shouldTerminateApp': cleanup === 'automation' };
await persist('profile.json', { platform, caps, faultMode });
const vendor = await open(join(work, 'vendor.log'), 'w', 0o600);
const env = { PATH: process.env.PATH, HOME: work, TMPDIR: work, ANDROID_HOME: join(process.env.HOME, 'Library/Android/sdk'), ANDROID_SDK_ROOT: join(process.env.HOME, 'Library/Android/sdk'), AI_VISION_ENABLED: 'false', APPIUM_MCP_OTEL_ENABLED: 'false', APPIUM_MCP_ON_CLIENT_DISCONNECT: 'skip' };
assert.ok(!Object.keys({ ...getDefaultEnvironment(), ...env }).includes('TYPESAFE_API_KEY'));
const ownerPath = join(directory, 'owner.json');
const transport = new StdioClientTransport({ command: 'python3', args: [join(source, 'owned-launcher.py'), ownerPath, process.execPath, join(source, 'live-protocol-server.mjs'), directory], cwd: work, env, stderr: vendor.fd });
const client = new Client({ name: 'jev-live-validated-protocol', version: '0.1.0' }, { capabilities: {} });
async function waitForFile(file) { const end = Date.now() + 240000; while (Date.now() < end) { if (state.pendingRequestError || state.pendingReplyObserved) throw new Error('PROVIDER_RETURNED_BEFORE_FAULT_BARRIER'); try { return JSON.parse(await readFile(join(directory, file), 'utf8')); } catch {} await new Promise(resolve => setTimeout(resolve, 25)); } throw new Error('FAULT_BARRIER_NOT_OBSERVED'); }
async function call(request, decode) {
  if (journal(directory, 'inspect').closed) throw new Error('DISPATCH_CLOSED');
  const entry = { request, disposition: 'outstanding' }; state.requests.push(entry); await persist('client.json', state);
  const reply = await client.callTool(request, undefined, { timeout: request.arguments.action === 'create' ? 240_000 : 30_000 });
  entry.reply = reply; await persist('client.json', state);
  const result = decode(reply);
  if (request.name === 'appium_screenshot') await writeFile(join(directory, 'screenshot.png'), Buffer.from(reply.content[0].data, 'base64'), { mode: 0o600 }); entry.disposition = 'validated'; entry.reply = request.name === 'appium_screenshot' ? { image: result } : reply; await persist('client.json', state); return result;
}
async function proveLocalClosure(request) {
  const before = journal(directory, 'inspect');
  const requestCount = state.requests.length;
  await assert.rejects(call(request, () => { throw new Error('UNEXPECTED_RESPONSE'); }), /DISPATCH_CLOSED/);
  assert.equal(state.requests.length, requestCount);
  assert.deepEqual(journal(directory, 'inspect'), before);
  state.localClosureProof = { reason: 'DISPATCH_CLOSED', requestCount, commandCount: before.commands.length, commandsUnchanged: true };
  state.retryBlockedBeforeWire = true;
}
function xml(reply) {
  const result = spawnSync('python3', [join(source, 'validate-xml.py')], { input: JSON.stringify({ platform, xml: xmlText(reply) }), encoding: 'utf8', timeout: 5000, env: { PATH: process.env.PATH } });
  assert.equal(result.status, 0, 'INVALID_XML_RESULT'); return JSON.parse(result.stdout);
}
try {
  await prepare(); await client.connect(transport, { timeout: 30_000 });
  const fixture = JSON.parse(await readFile(join(root, 'candidate-stack/fixtures/protocol.json'), 'utf8'));
  assert.deepEqual(client.getServerVersion(), fixture.server);
  const tools = (await client.listTools()).tools;
  for (const expected of fixture.tools) { const matches = tools.filter(x => x.name === expected.name); assert.equal(matches.length, 1); assert.deepEqual(matches[0].inputSchema, expected.inputSchema); }
  assert.deepEqual((await client.callTool({ name: 'jev_phase1_stack', arguments: {} })).structuredContent, fixture.stack);
  const createRequest = { name: 'appium_session_management', arguments: { action: 'create', platform, capabilities: JSON.stringify(caps) } };
  if (faultMode === 'lost-create') {
    const controller = new AbortController(); let returned = false;
    state.requests.push({ request: createRequest, disposition: 'outstanding' }); await persist('client.json', state);
    const pending = client.callTool(createRequest, undefined, { timeout: 240000, signal: controller.signal }).then(reply => { returned = true; state.pendingReplyObserved = true; state.unexpectedReply = reply; return { reply }; }, error => { state.pendingRequestError = String(error); return { failure: String(error) }; });
    await waitForFile('fault-barrier.json'); assert.equal(returned, false);
    journal(directory, 'close'); controller.abort(new Error('Injected creation response loss'));
    state.lostReply = await pending; assert.ok(state.lostReply.failure); state.faultExpected = true;
    const inventory = await client.callTool({ name: 'jev_phase1_inventory', arguments: {} }); state.reconciliation = inventory.structuredContent;
    assert.equal(state.reconciliation.sessions.length, 1); assert.equal(state.reconciliation.sessions[0].ownership, 'owned');
    await proveLocalClosure(createRequest);
  } else {
  const sessionId = await call(createRequest, reply => creation(reply, platform, caps)); state.sessionId = sessionId;
  const before = await call({ name: 'appium_get_page_source', arguments: { sessionId } }, xml); assert.equal(before.summary, 'Selected: None'); state.before = before;
  const found = await call({ name: 'appium_find_elements', arguments: { sessionId, strategy: platform === 'ios' ? 'accessibility id' : 'xpath', selector: platform === 'ios' ? 'choose.apple' : "//*[@resource-id='choose.apple']" } }, elements); assert.equal(found.length, 1);
  const action = { name: 'appium_gesture', arguments: ['cancel', 'process-failure'].includes(faultMode) ? { sessionId, action: 'long_press', maxScrollAttempts: 10, x: 100, y: 700, duration: 4000 } : { sessionId, action: 'tap', maxScrollAttempts: 10, elementUUID: found[0] } };
  if (faultMode !== 'normal') {
    const controller = new AbortController(); let returned = false;
    state.requests.push({ request: action, disposition: 'outstanding' }); await persist('client.json', state);
    const pending = client.callTool(action, undefined, { timeout: 30000, signal: controller.signal }).then(reply => { returned = true; state.pendingReplyObserved = true; state.unexpectedReply = reply; return { reply }; }, error => { state.pendingRequestError = String(error); return { failure: String(error) }; });
    if (['cancel', 'process-failure'].includes(faultMode)) {
      const deadline = Date.now() + 15000; let line;
      while (Date.now() < deadline) { const log = await readFile(join(work, 'vendor.log'), 'utf8'); line = log.split('\n').find(line => line.includes('Proxying [POST /actions]') && line.includes('4000')); if (line) break; await new Promise(resolve => setTimeout(resolve, 25)); }
      assert.ok(line); state.nativeDispatchLine = line;
    } else await waitForFile('fault-barrier.json');
    assert.equal(returned, false); journal(directory, 'close');
    if (faultMode === 'process-failure') process.kill(transport.pid, 'SIGKILL'); else controller.abort(new Error('Injected interruption after native dispatch'));
    state.lostReply = await pending; assert.ok(state.lostReply.failure); state.faultExpected = true;
    await new Promise(resolve => setTimeout(resolve, 5000));
    await proveLocalClosure(action);
    if (faultMode === 'late-action') state.lateReply = JSON.parse(await readFile(join(directory, 'late-reply.json'), 'utf8'));
  } else {
  await call(action, reply => completion(reply, action));
  const after = await call({ name: 'appium_get_page_source', arguments: { sessionId } }, xml); assert.equal(after.summary, 'Selected: Apple'); state.after = after;
  state.screenshot = await call({ name: 'appium_screenshot', arguments: { sessionId, returnRawBase64: true } }, screenshot);
  const deletion = { name: 'appium_session_management', arguments: { action: 'delete', sessionId } }; await call(deletion, reply => completion(reply, deletion));
  state.roundTrip = 'passed-live-validated-protocol';
  }
  }
  if (state.faultExpected) state.roundTrip = 'passed-live-fault-control';
} catch (error) { state.failure = String(error); }
finally {
  try { journal(directory, 'close'); state.dispatchClosed = true; } catch (error) { state.closureFailure = String(error); }
  try { state.descendantSnapshot = await descendantInventory('snapshot'); await persist('descendants-before-stop.json', state.descendantSnapshot); } catch (error) { state.descendantSnapshotFailure = String(error); state.descendantSnapshot = { inspectionComplete: false, verified: false, quarantined: true, reason: String(error) }; await persist('descendants-before-stop.json', state.descendantSnapshot); }
  try { state.hostStop = JSON.parse((await command('python3', [join(source, 'stop-group.py'), ownerPath], 15_000)).stdout); } catch (error) { state.hostStopFailure = String(error); }
  try { state.childStop = JSON.parse((await command('python3', [join(source, 'stop-native-children.py'), directory, ownerPath, 'stop'], 60_000)).stdout); } catch (error) { state.childStopFailure = String(error); }
  try { await client.close(); } catch {}
  if (cleanup === 'automation' && state.roundTrip) {
    try { state.automationFence = JSON.parse((await command('python3', [join(source, 'fence-owned-automation.py'), prepPath, platform, join(directory, 'native-runtime.json')], 90_000)).stdout); } catch (error) { state.automationFenceFailure = String(error); }
  }
  try { state.descendantVerification = await descendantInventory('verify'); } catch (error) { state.descendantVerificationFailure = String(error); state.descendantVerification = { verified: false, quarantined: true, reason: String(error) }; }
  try {
  if (state.automationFence?.ownedAutomationInert && state.hostStop?.groupStopped && state.childStop?.recordedChildrenStopped && state.descendantVerification?.verified) {
    await persist('automation-stop.json', { host: state.hostStop, children: state.childStop, native: state.automationFence, coverage: state.descendantVerification });
    const receiptSha256 = createHash('sha256').update(await readFile(join(directory, 'automation-stop.json'))).digest('hex');
    const fence = journal(directory, 'record-automation-fence', { device, receiptSha256, hostGroupStopped: true, recordedChildrenStopped: true, ownedAutomationInert: true, automationPortsClosed: true, completeCoverage: true });
    assert.equal(fence.accepted, true); state.releasePredicateRecorded = true; state.fullNativeFenceProven = true;
  }
  } catch (error) { state.fenceRecordingFailure = String(error); }
  try { if (state.preparationAuthorized) state.nativeStop = await native('stop'); } catch (error) { state.nativeStopFailure = String(error); }
  state.final = journal(directory, 'inspect'); await vendor.close(); state.status = experimentPassed(state, cleanup) ? state.roundTrip : 'failed'; await persist('client.json', state);
  console.log(JSON.stringify({ platform, caseName, status: state.status, failure: state.failure, actionAttempts: state.requests.filter(x => x.request.name === 'appium_gesture').length, nativeDeviceOffline: state.nativeStop?.deviceOffline, fullNativeFenceProven: state.fullNativeFenceProven, leaseReleased: false }));
}
if (state.status === 'failed') process.exitCode = 1;
