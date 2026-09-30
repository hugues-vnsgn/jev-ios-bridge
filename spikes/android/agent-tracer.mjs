#!/usr/bin/env node
/**
 * Phase 4 tracer (release spec, phase 4 item 0; decision J; open point 24). Evidence, not product code.
 *
 * Proves the device-layer design of ADR-0006 on one emulator: the bridge copies mobilecli's device agent
 * out of the pinned mobilecli program (reading it, never running it), starts it itself over adb, and drives
 * it with JSON-RPC. Then it fences the agent, starts mobilecli's own agent through a guarded wrapper, checks
 * that the foreign-agent rule (open point 22) sees that one as foreign and leaves it running, and cleans up.
 *
 * Usage:
 *   node spikes/android/agent-tracer.mjs --serial emulator-5560 --avd jev-actions-api31 \
 *     --mobilecli-dir /tmp/jev-tracer/node_modules --capture <prototype capture .json> --out <results dir>
 *
 * Device rules: every adb call goes to the private adb server on port 5099, and the tracer stops if that
 * server lists anything but an emulator. It never uses `adb shell input`, never changes a device setting,
 * and never clears app data.
 */
import { createHash } from 'node:crypto';
import { execFile, spawnSync } from 'node:child_process';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';

const PINNED_SHA256 = '0e0865d0617bc6e4abf0a7b24a956da1ca25cfc795c30d8e32c64eb0d1f6258f';
const ADB_PORT = '5099';
const AGENT_PATH = '/data/local/tmp/jev-ios-bridge-agent.dex';
const MOBILECLI_AGENT_PATH = '/data/local/tmp/mobilecli.dex';
const AGENT_CLASS = 'com.mobilenext.mobilecli.DeviceServer';
const AGENT_SOCKET = 'localabstract:mobilecli-server';
const FOREIGN_PATTERNS = [AGENT_CLASS, 'UiDumpServer', 'com.mobilenext.devicekit', 'uiautomator', 'io.appium.uiautomator2'];

const { values: args } = parseArgs({ options: {
  serial: { type: 'string' }, avd: { type: 'string' }, 'mobilecli-dir': { type: 'string' },
  capture: { type: 'string' }, out: { type: 'string' },
} });
for (const name of ['serial', 'avd', 'mobilecli-dir', 'capture', 'out']) {
  if (!args[name]) { console.error(`missing --${name}`); process.exit(2); }
}
if (!/^emulator-\d+$/.test(args.serial)) { console.error('--serial must be an emulator serial'); process.exit(2); }

const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(homedir(), 'Library/Android/sdk');
const ADB = join(sdk, 'platform-tools/adb');
const results = [];
/** Pids of the agents this tracer started (its own, and mobilecli's), the only ones cleanup may kill. */
const startedPids = new Set();
const outFile = join(args.out, `${args.avd}.jsonl`);

function record(step, ok, detail = {}) {
  const line = { at: new Date().toISOString(), avd: args.avd, serial: args.serial, step, ok, ...detail };
  results.push(line);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${step}${detail.note ? `: ${detail.note}` : ''}`);
  return ok;
}

// ---------- adb, always through the private server, always guarded ----------

function adbRaw(argv, timeoutMs = 30_000) {
  return new Promise(resolve => {
    execFile(ADB, ['-P', ADB_PORT, ...argv], { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, ANDROID_ADB_SERVER_PORT: ADB_PORT } },
    (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, stdout, stderr }));
  });
}

async function guard() {
  const { stdout } = await adbRaw(['devices']);
  const serials = stdout.split('\n').slice(1).map(line => line.split('\t')[0].trim()).filter(Boolean);
  const other = serials.filter(serial => !serial.startsWith('emulator-'));
  if (other.length) throw new Error(`STOP: non-emulator device on port ${ADB_PORT}: ${other.join(', ')}`);
  if (!serials.includes(args.serial)) throw new Error(`${args.serial} is not on the private adb server`);
}

async function adb(argv, timeoutMs) {
  await guard();
  return adbRaw(['-s', args.serial, ...argv], timeoutMs);
}

const shell = (command, timeoutMs) => adb(['shell', command], timeoutMs);

// ---------- the pinned agent, read out of the mobilecli program ----------

function adler32(bytes) {
  let a = 1, b = 0;
  for (let i = 0; i < bytes.length; i++) { a = (a + bytes[i]) % 65521; b = (b + a) % 65521; }
  return ((b << 16) | a) >>> 0;
}

/** Every DEX file inside `program` whose length, Adler-32 and SHA-1 header checks all pass. */
function validDexFiles(program) {
  const found = [];
  for (let at = program.indexOf('dex\n0'); at !== -1; at = program.indexOf('dex\n0', at + 1)) {
    const magic = program.subarray(at, at + 8).toString('latin1');
    if (!/^dex\n0\d\d\0$/.test(magic) || at + 0x70 > program.length) continue;
    const size = program.readUInt32LE(at + 32);
    if (size < 0x70 || at + size > program.length) continue;
    const dex = program.subarray(at, at + size);
    const checksumOk = adler32(dex.subarray(12)) === dex.readUInt32LE(8);
    const signatureOk = createHash('sha1').update(dex.subarray(32)).digest().equals(dex.subarray(12, 32));
    if (checksumOk && signatureOk) found.push({ offset: at, dex });
  }
  return found;
}

async function pinnedAgent() {
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
  const programPath = join(args['mobilecli-dir'], `@mobilenext/mobilecli-darwin-${arch}`, `mobilecli-darwin-${arch}`);
  const program = await readFile(programPath); // read only; the program is never executed by the bridge side
  const valid = validDexFiles(program);
  const [only] = valid;
  const sha256 = only ? createHash('sha256').update(only.dex).digest('hex') : null;
  const ok = valid.length === 1 && sha256 === PINNED_SHA256;
  record('agent.copy-out', ok, { program: programPath, validDexCount: valid.length, offset: only?.offset,
    bytes: only?.dex.length, format: only?.dex.subarray(4, 7).toString('latin1'), sha256, pinned: PINNED_SHA256 });
  if (!ok) throw new Error('the pinned agent could not be copied out');
  const cacheDir = join(tmpdir(), 'jev-android-agent');
  await mkdir(cacheDir, { recursive: true, mode: 0o700 });
  await chmod(cacheDir, 0o700);
  const cached = join(cacheDir, `${sha256}.dex`);
  await writeFile(cached, only.dex, { mode: 0o600 });
  const reread = createHash('sha256').update(await readFile(cached)).digest('hex');
  record('agent.cache', reread === PINNED_SHA256, { cached, sha256: reread });
  return cached;
}

// ---------- JSON-RPC to the agent: one request per HTTP/1.1 connection ----------

let requestId = 0;
function rpc(port, method, params = {}, timeoutMs = 10_000) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: String(++requestId), method, params });
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: '/', method: 'POST', agent: false, timeout: timeoutMs,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), Connection: 'close' } },
    res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        try {
          const reply = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          // An agent error's message can carry screen text, so only its code is kept.
          if (reply.error) reject(Object.assign(new Error(`agent error ${reply.error.code}`), { rpcCode: reply.error.code }));
          else resolve(reply.result);
        } catch (error) { reject(error); }
      });
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('agent request timed out'), { timedOut: true })));
    req.on('error', reject);
    req.end(body);
  });
}

function freeLocalPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); });
  });
}

async function forwardOnFreePort() {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    const port = await freeLocalPort();
    last = await adb(['forward', `tcp:${port}`, AGENT_SOCKET]);
    if (last.code === 0) return port;
    if (!`${last.stdout}${last.stderr}`.includes('cannot bind')) break;
  }
  throw new Error(`adb forward failed: ${last?.stderr.trim()}`);
}

async function forwardsForSerial() {
  const { stdout } = await adbRaw(['forward', '--list']);
  return stdout.split('\n').filter(Boolean).map(line => line.split(' ')).filter(([serial]) => serial === args.serial)
    .map(([, local, remote]) => ({ local, remote }));
}

// ---------- agents on the device (open point 22) ----------

async function deviceAgents() {
  const { stdout } = await shell('ps -A -o PID,NAME,ARGS');
  const agents = [];
  for (const line of stdout.split('\n').slice(1)) {
    const match = line.trim().match(/^(\d+)\s+(\S+)\s*(.*)$/);
    if (!match) continue;
    const [, pid, name, argv] = match;
    const pattern = FOREIGN_PATTERNS.find(candidate => `${name} ${argv}`.includes(candidate));
    if (!pattern || argv.includes('ps -A')) continue;
    const environ = await shell(`cat /proc/${pid}/environ | tr '\\0' '\\n'`);
    const readable = environ.code === 0 && environ.stdout.length > 0;
    const classpath = environ.stdout.split('\n').find(entry => entry.startsWith('CLASSPATH='));
    const own = pattern === AGENT_CLASS && classpath === `CLASSPATH=${AGENT_PATH}`;
    agents.push({ pid: Number(pid), name, args: argv, pattern, environReadable: readable, classpath: classpath ?? null,
      kind: own ? 'own' : 'foreign' });
  }
  return agents;
}

async function processGone(pid) {
  const { stdout } = await shell(`if [ -d /proc/${pid} ]; then echo alive; else echo gone; fi`);
  return stdout.trim() === 'gone';
}

// ---------- screen helpers ----------

function flatten(hierarchy) {
  const nodes = [];
  const walk = node => { nodes.push(node); for (const child of node.children ?? []) walk(child); };
  for (const root of hierarchy) walk(root);
  return nodes;
}

async function dump(port) {
  const result = await rpc(port, 'device.dump.ui', { waitUntilIdle: 2000 }, 12_000);
  return flatten(result.hierarchy);
}

const centre = node => ({ x: Math.round(node.rect.x + node.rect.width / 2), y: Math.round(node.rect.y + node.rect.height / 2) });
const signature = nodes => createHash('sha256').update(JSON.stringify(nodes.filter(node => node.visible !== false &&
  !String(node['resource-id'] ?? '').startsWith('com.android.systemui:')).map(node =>
  [node.class, node.text, node.hint, node['content-desc'], node['resource-id'], node.rect]))).digest('hex');
const editText = nodes => nodes.find(node => String(node.class).endsWith('EditText'));

async function waitFor(port, predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let nodes = await dump(port);
  while (!predicate(nodes) && Date.now() < deadline) { await sleep(250); nodes = await dump(port); }
  return nodes;
}

// ---------- the tracer ----------

async function main() {
  await mkdir(args.out, { recursive: true });
  await guard();
  const avd = (await shell('getprop ro.boot.qemu.avd_name')).stdout.trim();
  const api = (await shell('getprop ro.build.version.sdk')).stdout.trim();
  record('device.identity', avd === args.avd, { reported: avd, api: Number(api) });
  if (avd !== args.avd) throw new Error('the serial is not the named AVD');

  const before = await deviceAgents();
  record('agents.before', before.length === 0, { agents: before });
  if (before.length) throw new Error('an agent is already running; the tracer starts from a clean device');

  // 1. Copy the agent out and push it to the bridge's own path.
  const cached = await pinnedAgent();
  const push = await adb(['push', cached, AGENT_PATH]);
  record('agent.push', push.code === 0, { path: AGENT_PATH });

  // 2. Start it, forward a port, and check device.version.
  const started = await shell(`CLASSPATH=${AGENT_PATH} nohup app_process / ${AGENT_CLASS} >/dev/null 2>&1 &`);
  record('agent.start', started.code === 0, {});
  const port = await forwardOnFreePort();
  let version, readyAfterMs;
  const startAt = Date.now();
  while (Date.now() - startAt < 5000) {
    try { version = await rpc(port, 'device.version', {}, 1000); if (version?.dexSha256 === PINNED_SHA256) break; }
    catch { /* not up yet */ }
    await sleep(100);
  }
  readyAfterMs = Date.now() - startAt;
  const versionOk = version?.dexSha256 === PINNED_SHA256;
  record('agent.version', versionOk, { port, dexSha256: version?.dexSha256 ?? null, readyAfterMs });
  if (!versionOk) throw new Error('the agent never answered with the pinned SHA-256');
  const running = await deviceAgents();
  const own = running.filter(agent => agent.kind === 'own');
  record('agents.own-recognised', own.length === 1 && running.length === 1 && own[0].environReadable,
    { agents: running, note: `environ readable: ${own[0]?.environReadable}` });
  const ownPid = own[0]?.pid;
  if (ownPid) startedPids.add(ownPid);

  // 3. device.dump.ui has scrollable and password, in the captures' shape.
  await shell('am force-stop com.android.settings');
  const launch = await shell('am start -W -n com.android.settings/.Settings');
  record('app.restart', launch.code === 0 && /Status: ok/.test(launch.stdout), { note: 'am start -W Settings' });
  const settingsNodes = await dump(port);
  const capture = JSON.parse(JSON.parse(await readFile(args.capture, 'utf8')).data.rawData);
  const captureKeys = new Map();
  for (const node of flatten(capture.hierarchy)) for (const [key, value] of Object.entries(node)) {
    if (key !== 'children') captureKeys.set(key, Array.isArray(value) ? 'array' : typeof value);
  }
  const shapeErrors = [];
  for (const node of settingsNodes) for (const [key, type] of captureKeys) {
    if (!(key in node)) shapeErrors.push(`missing ${key}`);
    else if ((Array.isArray(node[key]) ? 'array' : typeof node[key]) !== type) shapeErrors.push(`${key}: ${typeof node[key]} not ${type}`);
  }
  const hasFlags = settingsNodes.every(node => typeof node.scrollable === 'boolean' && typeof node.password === 'boolean');
  const scrollable = settingsNodes.filter(node => node.scrollable && node.visible !== false);
  record('dump.shape', shapeErrors.length === 0 && hasFlags && scrollable.length > 0, { nodes: settingsNodes.length,
    captureKeys: [...captureKeys.keys()].sort(), extraKeys: Object.keys(settingsNodes[0]).filter(key => !captureKeys.has(key) && key !== 'children').sort(),
    scrollableNodes: scrollable.length, shapeErrors: [...new Set(shapeErrors)].slice(0, 10) });

  // 4a. Swipe up within the scrollable list, 90% to 10% of its height along its centre line, over 1000 ms.
  const list = scrollable.sort((a, b) => b.rect.height * b.rect.width - a.rect.height * a.rect.width)[0];
  const { x } = centre(list);
  const swipe = { x1: x, y1: Math.round(list.rect.y + list.rect.height * 0.9), x2: x, y2: Math.round(list.rect.y + list.rect.height * 0.1), duration: 1000 };
  await rpc(port, 'device.io.swipe', swipe, 12_000);
  const afterSwipe = await dump(port);
  record('io.swipe', signature(afterSwipe) !== signature(settingsNodes), swipe);

  // 4b. Tap: open Settings search by tapping its search bar (or, failing that, the first clickable row).
  await shell('am force-stop com.android.settings');
  await shell('am start -W -n com.android.settings/.Settings');
  const home = await dump(port);
  const searchBar = home.find(node => node.visible !== false && node.rect.width > 0 &&
    /search/i.test(`${node['resource-id']} ${node.text} ${node['content-desc']}`) && (node.clickable || node.text));
  const target = searchBar ?? home.find(node => node.clickable && node.visible !== false && node.rect.height > 0 &&
    !String(node['resource-id']).startsWith('com.android.systemui:'));
  const tapAt = centre(target);
  await rpc(port, 'device.io.tap', tapAt);
  const afterTap = await waitFor(port, nodes => searchBar ? Boolean(editText(nodes)) : signature(nodes) !== signature(home));
  record('io.tap', searchBar ? Boolean(editText(afterTap)) : signature(afterTap) !== signature(home),
    { ...tapAt, target: searchBar ? 'search bar' : 'first clickable row', targetId: target['resource-id'] });
  let field = editText(afterTap);
  if (!field) {
    await shell('am start -W -a com.android.settings.action.SETTINGS_SEARCH');
    field = editText(await waitFor(port, nodes => Boolean(editText(nodes))));
  }
  if (field && !field.focused) { await rpc(port, 'device.io.tap', centre(field)); await sleep(500); }

  // 4c. Typing: ASCII through device.io.text (a leading dash and shell characters, unchanged), then ctrl+a,
  // a 0.2 s pause and a separate backspace, then Vietnamese through the clipboard and paste.
  const fieldText = async () => editText(await dump(port))?.text ?? null;
  const clear = async () => {
    await rpc(port, 'device.io.keys', { keys: [{ keycode: 'KEYCODE_A', modifiers: ['KEYCODE_CTRL_LEFT'] }] });
    await sleep(200);
    await rpc(port, 'device.io.keys', { keys: [{ keycode: 'KEYCODE_DEL' }] });
    await sleep(300);
  };
  const ascii = `-5 a"b'c&d; e%`;
  await rpc(port, 'device.io.text', { text: ascii });
  await sleep(500);
  const typed = await fieldText();
  record('io.text.ascii', typed === ascii, { sent: ascii, shown: typed });
  await clear();
  const cleared = await fieldText();
  const clearedField = editText(await dump(port));
  record('io.keys.clear', cleared === '' || (cleared === clearedField?.hint && cleared !== ascii),
    { shown: cleared, hint: clearedField?.hint ?? null, keys: ['KEYCODE_CTRL_LEFT+KEYCODE_A', 'pause 200 ms', 'KEYCODE_DEL'] });
  const vietnamese = 'Tiếng Việt';
  await rpc(port, 'device.clipboard.set', { text: vietnamese });
  await rpc(port, 'device.io.button', { button: 'KEYCODE_PASTE' });
  await rpc(port, 'device.clipboard.clear');
  await sleep(500);
  const pasted = await fieldText();
  const clipboardAfter = (await rpc(port, 'device.clipboard.get')).text;
  record('io.text.vietnamese', pasted === vietnamese && clipboardAfter === '', { sent: vietnamese, shown: pasted, clipboardAfter });
  await clear();

  // 4d. Screenshot.
  const shot = await rpc(port, 'device.screenshot', { format: 'jpeg', maxSize: 800 }, 12_000);
  const image = Buffer.from(shot.data, 'base64');
  const shotPath = join(args.out, `${args.avd}-screenshot.jpg`);
  await writeFile(shotPath, image);
  record('screenshot', image[0] === 0xff && image[1] === 0xd8, { bytes: image.length, file: shotPath });
  await shell('am force-stop com.android.settings');

  // 5. The fence: kill the agent this run started, by pid, see it gone, remove the forward.
  const killed = await shell(`kill ${ownPid}`);
  let gone = false;
  for (let i = 0; i < 20 && !gone; i++) { gone = await processGone(ownPid); if (!gone) await sleep(100); }
  let answersAfter = true;
  try { await rpc(port, 'device.version', {}, 1500); } catch { answersAfter = false; }
  await adb(['forward', '--remove', `tcp:${port}`]);
  const forwardsLeft = await forwardsForSerial();
  record('fence', killed.code === 0 && gone && !answersAfter && forwardsLeft.length === 0,
    { pid: ownPid, gone, answersAfterKill: answersAfter, forwardsLeft });

  // 6. mobilecli's own agent, started through the guarded wrapper, is foreign and is left running.
  const mobilecli = await startMobilecliAgent();
  const seen = await deviceAgents();
  const foreign = seen.filter(agent => agent.kind === 'foreign');
  for (const agent of foreign) startedPids.add(agent.pid);
  const verdict = foreign.length ? 'DEVICE_BUSY' : 'free';
  let stillRunning = false;
  if (foreign[0]) stillRunning = !(await processGone(foreign[0].pid));
  record('agents.foreign', mobilecli.ok && verdict === 'DEVICE_BUSY' && seen.every(agent => agent.kind === 'foreign') &&
    foreign.every(agent => agent.environReadable) && stillRunning,
  { mobilecliDump: mobilecli.ok, agents: seen, verdict, leftRunning: stillRunning });

  // 7. Clean everything up, mobilecli's private daemon included.
  await cleanUp();
}

const MOBILECLI_ENV = () => {
  const env = { ...process.env, ANDROID_ADB_SERVER_PORT: ADB_PORT, MOBILECLI_HOME: '/tmp/jev-tracer/mhome',
    XDG_CONFIG_HOME: '/tmp/jev-tracer/xdg', MOBILECLI_FLEET_URL: 'ws://127.0.0.1:9',
    USBMUXD_SOCKET_ADDRESS: '/tmp/jev-tracer/no-usbmuxd' };
  delete env.MOBILECLI_TOKEN;
  delete env.TYPESAFE_API_KEY;
  return env;
};

/** The guarded wrapper: the private adb server, a private mobilecli home, no keychain, no fleet, no phones. */
async function mobilecliRun(argv, timeoutMs = 60_000) {
  await guard();
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
  const program = join(args['mobilecli-dir'], `@mobilenext/mobilecli-darwin-${arch}`, `mobilecli-darwin-${arch}`);
  await mkdir('/tmp/jev-tracer/mhome', { recursive: true, mode: 0o700 });
  await mkdir('/tmp/jev-tracer/xdg', { recursive: true, mode: 0o700 });
  const result = spawnSync(program, ['--insecure-storage', ...argv], { env: MOBILECLI_ENV(), timeout: timeoutMs, encoding: 'utf8' });
  return { code: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

async function startMobilecliAgent() {
  const result = await mobilecliRun(['dump', 'ui', '--device', args.avd, '--format', 'raw']);
  let ok = false;
  try { ok = JSON.parse(result.stdout).status === 'ok'; } catch { ok = false; }
  return { ok, code: result.code };
}

async function cleanUp() {
  const stop = await mobilecliRun(['daemon', 'stop'], 30_000);
  // Only what this tracer started: its own agent (found by its CLASSPATH if the pid was never read) and
  // the mobilecli agent it launched. An agent that was already running is never touched.
  for (const agent of await deviceAgents()) if (agent.kind === 'own') startedPids.add(agent.pid);
  for (const pid of startedPids) if (!(await processGone(pid))) await shell(`kill ${pid}`);
  await sleep(500);
  for (const { local } of await forwardsForSerial()) await adb(['forward', '--remove', local]);
  await shell(`rm -f ${AGENT_PATH} ${MOBILECLI_AGENT_PATH} /data/local/tmp/mobilecli.so`);
  const agentsLeft = await deviceAgents();
  const forwardsLeft = await forwardsForSerial();
  const daemons = spawnSync('pgrep', ['-fl', 'mobilecli-darwin'], { encoding: 'utf8' }).stdout.trim();
  record('cleanup', agentsLeft.length === 0 && forwardsLeft.length === 0 && daemons === '',
    { daemonStop: stop.code, agentsLeft, forwardsLeft, macMobilecliProcesses: daemons || null });
}

try {
  await main();
} catch (error) {
  record('aborted', false, { note: error.message });
  try { await cleanUp(); } catch (cleanupError) {
    record('cleanup.after-abort', false, { note: cleanupError.message });
  }
} finally {
  await writeFile(outFile, results.map(line => JSON.stringify(line)).join('\n') + '\n');
  const failed = results.filter(line => !line.ok);
  console.log(`\n${results.length - failed.length}/${results.length} steps passed; log: ${outFile}`);
  process.exitCode = failed.length ? 1 : 0;
}
