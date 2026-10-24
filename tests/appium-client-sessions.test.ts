import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import type { VerifiedStack } from '../src/appium/stack.js';
import type { OwnerIdentity } from '../src/device/admission.js';
import { PrivateAppiumClient, type AppiumComponentRecord } from '../src/appium/client.js';
import { AppiumCommandSession, createSessionProfile } from '../src/appium/session.js';
import { readRecording } from './fixtures/appium-wire/recording.js';

const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const owner: OwnerIdentity = { category: 'ios-simulator', device: 'ios-test', attempt: { kind: 'legacy', id: 'run-1' },
  token: 'owner-token', generation: 7, process: { pid: process.pid, incarnation: 'host-test' } };
const sdkRoot = resolve(dirname(fileURLToPath(import.meta.resolve('@modelcontextprotocol/sdk/client/index.js'))), '../../..');
const lock = JSON.parse(readFileSync('stack/package-lock.json', 'utf8'));
const freeze = JSON.parse(readFileSync('stack/freeze.json', 'utf8'));
const sdkFiles: VerifiedStack['manifest']['files'] = {};
function walk(directory: string): void {
  for (const entry of readdirSync(join(sdkRoot, directory), { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.isFile()) sdkFiles['node_modules/@modelcontextprotocol/sdk/' + path] = {
      kind: 'file', sha256: sha(readFileSync(join(sdkRoot, path))), mode: 0o644,
    };
  }
}
walk('');
function fixture(t: TestContext, platform: 'ios' | 'android' = 'ios') {
  const root = mkdtempSync(join(tmpdir(), 'jev-private-client-'));
  const clients: PrivateAppiumClient[] = [];
  t.after(async () => {
    await Promise.allSettled(clients.map(client => client.close()));
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });
  const stack: VerifiedStack = { root, nodeModules: join(root, 'node_modules'), wdaRunner: '/verified/wda.app', warnings: [],
    identity: { version: 1, stackSha256: '1'.repeat(64), wdaSha256: '2'.repeat(64), manifestSha256: '3'.repeat(64) },
    manifest: { version: 1, lockSha256: freeze.lockSha256, files: sdkFiles, loaded: Object.keys(sdkFiles),
      packages: [{ path: 'node_modules/@modelcontextprotocol/sdk', name: '@modelcontextprotocol/sdk',
        version: '1.32.1', integrity: lock.packages['node_modules/@modelcontextprotocol/sdk'].integrity,
        integritySource: 'node_modules/@modelcontextprotocol/sdk', resolved: null }], androidApks: freeze.androidApks,
      wda: { version: '16.14.2', path: 'wda/runner.app', treeSha256: '5d1fc1c99908e253303f6de35bf26ed4a74a75817f704e7a3646b72b5271ba04' } } };
  const records: AppiumComponentRecord[] = [];
  const trace = join(root, 'trace.jsonl'); const environment = join(root, 'environment.json');
  const recording = resolve(`tests/fixtures/appium-wire/${platform}/minimal.jsonl`);
  const profile = createSessionProfile(stack, platform === 'ios'
    ? { platform, device: 'ios-test', path: 'run', presentation: 'visible' }
    : { platform, device: 'android-test', path: 'capture', serverInstallation: { kind: 'install' } });
  async function open(fault = 'none', file = recording) {
    const client = await PrivateAppiumClient.open({ stack, owner, homeRoot: join(root, 'homes'), timeoutMs: 20000,
      child: { entrypoint: resolve('tests/fixtures/appium-wire/fake-mcp.ts'), args: [file, fault, trace, environment], nodeArgs: ['--import', import.meta.resolve('tsx')] },
      onComponent: record => { records.push(record); } });
    clients.push(client); return client;
  }
  const calls = () => existsSync(trace) ? readFileSync(trace, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : [];
  return { root, stack, profile, records, trace, environment, recording, clients, open, calls };
}

test('private child receives only the restricted environment and a mode-700 HOME', async t => {
  const f = fixture(t); const client = await f.open();
  const env = JSON.parse(readFileSync(f.environment, 'utf8'));
  assert.equal(env.APPIUM_MCP_ON_CLIENT_DISCONNECT, 'delete_all');
  assert.equal(env.ALLOW_REMOTE_APP_URLS, 'false');
  assert.equal(Object.hasOwn(env, 'CAPABILITIES_CONFIG'), false);
  assert.equal(Object.hasOwn(env, 'TYPESAFE_API_KEY'), false);
  assert.equal(Object.hasOwn(env, 'NODE_OPTIONS'), false);
  assert.deepEqual(Object.keys(env).filter(key => key !== '__CF_USER_TEXT_ENCODING').sort(),
    ['ALLOW_REMOTE_APP_URLS', 'APPIUM_HOME', 'APPIUM_MCP_ON_CLIENT_DISCONNECT', 'HOME', 'LANG', 'PATH', 'TMPDIR']);
  assert.equal(lstatSync(env.HOME).mode & 0o777, 0o700);
  assert.equal(dirname(env.HOME), join(f.root, 'homes'));
  assert.equal(f.records[0]?.kind, 'appium-child');
  assert.equal(client.components[0]?.owner.generation, 7);
  assert.equal(f.calls()[0].params.protocolVersion, '2025-11-25');
});

test('a recorded older protocol can negotiate through the plain initialize handshake', async t => {
  const f = fixture(t); const path = join(f.root, 'older-protocol.jsonl');
  const lines = readFileSync(f.recording, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  lines[2].message.result.protocolVersion = '2025-03-26';
  writeFileSync(path, lines.map(line => JSON.stringify(line)).join('\n') + '\n');
  const client = await f.open('none', path); const session = await AppiumCommandSession.start({ client, profile: f.profile });
  assert.equal(session.sessionId, 'ios-session'); await session.finish();
});

test('the child uses an explicitly selected Android SDK without inheriting environment overrides', async t => {
  const f = fixture(t); const environment = join(f.root, 'android-env.json');
  const client = await PrivateAppiumClient.open({ stack: f.stack, owner, homeRoot: join(f.root, 'homes'), androidSdkRoot: '/verified/android-sdk',
    child: { entrypoint: resolve('tests/fixtures/appium-wire/fake-mcp.ts'), nodeArgs: ['--import', import.meta.resolve('tsx')], args: [f.recording, 'none', f.trace, environment] },
    onComponent: () => {} });
  f.clients.push(client);
  const env = JSON.parse(readFileSync(environment, 'utf8'));
  assert.equal(env.ANDROID_HOME, '/verified/android-sdk');
  assert.equal(env.ANDROID_SDK_ROOT, '/verified/android-sdk');
  assert.equal(env.HOME.startsWith(join(f.root, 'homes', 'command-')), true);
});

for (const fault of ['sdk-version', 'sdk-integrity', 'sdk-file']) test(`${fault} refuses before the child starts`, async t => {
  const f = fixture(t);
  if (fault === 'sdk-version') f.stack.manifest.packages[0]!.version = '1.32.0';
  if (fault === 'sdk-integrity') f.stack.manifest.packages[0]!.integrity = 'sha512-wrong';
  if (fault === 'sdk-file') f.stack.manifest.files = { ...sdkFiles, 'node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js': { kind: 'file', sha256: '0'.repeat(64), mode: 0o644 } };
  await assert.rejects(f.open(), { code: 'SDK_IDENTITY_MISMATCH' });
  assert.equal(existsSync(f.trace), false);
});

test('an unrecorded negotiated protocol refuses before any tool call', async t => {
  const f = fixture(t);
  await assert.rejects(f.open('protocol'), { code: 'PROTOCOL_VERSION_MISMATCH' });
  assert.deepEqual(f.calls().map(x => x.method), ['initialize']);
  assert.equal(f.records[0]?.kind, 'appium-child');
});

for (const platform of ['ios', 'android'] as const) test(`${platform} creates one owned session, verifies settings, and deletes it`, async t => {
  const f = fixture(t, platform); const client = await f.open();
  const session = await AppiumCommandSession.start({ client, profile: f.profile });
  assert.equal(session.sessionId, `${platform}-session`);
  assert.equal(session.state, 'ready');
  assert.deepEqual(f.calls().filter(x => x.method === 'tools/call').map(x => x.params.name), ['appium_session_management', 'jev_settings']);
  const creation = f.calls().find(x => x.params?.arguments?.action === 'create');
  const caps = JSON.parse(creation.params.arguments.capabilities);
  assert.equal(caps['appium:skipLogCapture'], true);
  assert.equal(caps['appium:autoLaunch'], false);
  if (platform === 'android') {
    assert.equal(caps['appium:skipDeviceInitialization'], true);
    assert.equal(caps['appium:skipServerInstallation'], false);
    assert.equal(caps['appium:autoGrantPermissions'], false);
    assert.equal(Object.hasOwn(caps, 'appium:appPackage'), false);
  } else {
    assert.equal(caps['appium:usePreinstalledWDA'], true);
    assert.equal(caps['appium:prebuiltWDAPath'], '/verified/wda.app');
    assert.equal(caps['appium:isHeadless'], false);
  }
  await assert.rejects(AppiumCommandSession.start({ client, profile: f.profile }), { code: 'NOT_ALLOWED' });
  await session.finish();
  assert.equal(session.state, 'closed');
  assert.equal(f.calls().filter(x => x.params?.arguments?.action === 'delete').length, 1);
  assert.equal(client.components.find(x => x.kind === 'appium-session')?.sessionId, `${platform}-session`);
});

const forbidden = ['webDriverAgentUrl', 'settings[pageSourceExcludedAttributes]', 'usePrebuiltWDA', 'prebuildWDA', 'useNewWDA',
  'derivedDataPath', 'bootstrapPath', 'agentPath', 'useXctestrunFile', 'updatedWDABundleId', 'updatedWDABundleIdSuffix',
  'xcodeOrgId', 'xcodeSigningId', 'keychainPath', 'keychainPassword', 'shutdownOtherSimulators', 'forceSimulatorSoftwareKeyboardPresence', 'app'];
for (const name of forbidden) test(`capability ${name} refuses before the call`, async t => {
  const f = fixture(t); const client = await f.open();
  await assert.rejects(client.manageSession({ action: 'create', platform: 'ios',
    capabilities: JSON.stringify({ ...f.profile.capabilities, [`appium:${name}`]: true }) }, f.profile), { code: 'NOT_ALLOWED' });
  assert.deepEqual(f.calls().filter(x => x.method !== 'notifications/initialized').map(x => x.method), ['initialize']);
});
test('missing skipLogCapture and changed pinned values refuse before the call', async t => {
  const f = fixture(t); const client = await f.open();
  for (const changes of [{ 'appium:skipLogCapture': undefined }, { 'appium:skipLogCapture': false }, { 'appium:isHeadless': true }]) {
    await assert.rejects(client.manageSession({ action: 'create', platform: 'ios', capabilities: JSON.stringify({ ...f.profile.capabilities, ...changes }) }, f.profile), { code: 'NOT_ALLOWED' });
  }
  assert.equal(f.calls().filter(x => x.method === 'tools/call').length, 0);
});
for (const action of ['attach', 'select', 'list', 'detach']) test(`session action ${action} refuses before the call`, async t => {
  const f = fixture(t); const client = await f.open();
  await assert.rejects(client.manageSession({ action, sessionId: 'foreign' }, f.profile), { code: 'NOT_ALLOWED' });
  assert.equal(f.calls().filter(x => x.method === 'tools/call').length, 0);
});
test('remoteServerUrl refuses even on an otherwise valid create', async t => {
  const f = fixture(t); const client = await f.open();
  await assert.rejects(client.manageSession({ action: 'create', platform: 'ios', capabilities: JSON.stringify(f.profile.capabilities), remoteServerUrl: 'http://localhost:4723' }, f.profile), { code: 'NOT_ALLOWED' });
  assert.equal(f.calls().filter(x => x.method === 'tools/call').length, 0);
});

test('Android skips server installation only for matching verified packaged APKs', t => {
  const f = fixture(t, 'android');
  const apks = f.stack.manifest.androidApks.filter(apk => apk.package !== 'io.appium.settings').map(({ package: name, sha256 }) => ({ package: name, sha256 }));
  const profile = createSessionProfile(f.stack, { platform: 'android', device: 'android-test', path: 'observed-action', serverInstallation: { kind: 'verified', device: 'android-test', apks } });
  assert.equal(profile.capabilities['appium:skipServerInstallation'], true);
  assert.equal(profile.capabilities['appium:skipDeviceInitialization'], true);
  assert.throws(() => createSessionProfile(f.stack, { platform: 'android', device: 'android-test', path: 'capture', serverInstallation: { kind: 'verified', device: 'foreign', apks } }), { code: 'NOT_ALLOWED' });
  assert.throws(() => createSessionProfile(f.stack, { platform: 'android', device: 'android-test', path: 'capture', serverInstallation: { kind: 'verified', device: 'android-test', apks: [{ package: 'io.appium.uiautomator2.server', sha256: '0'.repeat(64) }] } }), { code: 'NOT_ALLOWED' });
});

for (const fault of ['settings-error', 'settings-unequal', 'settings-missing', 'foreign-session', 'foreign-version', 'create-unowned', 'create-duplicate']) test(`${fault} refuses and preserves component records`, async t => {
  const f = fixture(t); const client = await f.open(fault);
  await assert.rejects(AppiumCommandSession.start({ client, profile: f.profile }), { code: fault.startsWith('create-') ? 'ACKNOWLEDGEMENT_LOST' : fault === 'foreign-session' ? 'SESSION_MISMATCH' : fault === 'foreign-version' ? 'VERSION_MISMATCH' : 'SETTINGS_READBACK_MISMATCH' });
  assert.equal(client.components[0]?.kind, 'appium-child');
  if (!fault.startsWith('create-')) assert.equal(client.components.find(x => x.kind === 'appium-session')?.sessionId, 'ios-session');
  assert.equal(f.calls().filter(x => x.params?.arguments?.action === 'create').length, 1);
});

for (const fault of ['late', 'lost', 'malformed', 'dead-child', 'disconnect']) test(`${fault} closes dispatch with retained child and session identities`, async t => {
  const f = fixture(t); const client = await f.open(fault);
  const created = await client.manageSession({ action: 'create', platform: 'ios', capabilities: JSON.stringify(f.profile.capabilities) }, f.profile);
  assert.deepEqual(created, { kind: 'created', sessionId: 'ios-session' });
  await assert.rejects(client.applySettings(f.profile, 75));
  assert.equal(client.components[0]?.kind, 'appium-child');
  assert.equal(client.components.find(x => x.kind === 'appium-session')?.sessionId, 'ios-session');
  assert.equal(client.dispatchOpen, false);
  await assert.rejects(client.manageSession({ action: 'delete', sessionId: 'ios-session' }, f.profile));
  assert.equal(f.calls().filter(x => x.params?.name === 'jev_settings').length, 1);
});

test('a reply delivered after the deadline cannot reopen dispatch', async t => {
  const f = fixture(t); const client = await f.open('late');
  await client.manageSession({ action: 'create', platform: 'ios', capabilities: JSON.stringify(f.profile.capabilities) }, f.profile);
  await assert.rejects(client.applySettings(f.profile, 75), { code: 'ACKNOWLEDGEMENT_LOST' });
  const replies = f.trace + '.replies'; const deadline = Date.now() + 2000;
  while ((!existsSync(replies) || !readFileSync(replies, 'utf8').includes('"id":2')) && Date.now() < deadline) await delay(20);
  assert.equal(existsSync(replies), true);
  const wire = readFileSync(replies, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.equal(wire.at(-1).id, 2);
  assert.equal(client.dispatchOpen, false);
  await assert.rejects(client.manageSession({ action: 'delete', sessionId: 'ios-session' }, f.profile), { code: 'CONNECTION_LOST' });
  assert.equal(f.calls().filter(x => x.params?.arguments?.action === 'delete').length, 0);
});

test('driven pause retains the session and refreshes before resuming', async t => {
  const f = fixture(t); const client = await f.open(); const session = await AppiumCommandSession.start({ client, profile: f.profile });
  session.pause(); assert.equal(session.state, 'paused');
  const result = await session.resume(async id => `fresh:${id}`);
  assert.deepEqual(result, { kind: 'refreshed', observation: 'fresh:ios-session' });
  assert.equal(session.state, 'ready');
  await session.finish();
  assert.equal(f.calls().filter(x => x.params?.arguments?.action === 'create').length, 1);
});
test('a vanished paused session requires replacement and fresh handback without another create on the old child', async t => {
  const f = fixture(t); const client = await f.open(); const session = await AppiumCommandSession.start({ client, profile: f.profile });
  session.pause();
  const result = await session.resume(async () => { throw Object.assign(new Error('gone'), { code: 'SESSION_MISMATCH' }); });
  assert.deepEqual(result, { kind: 'session-lost' });
  assert.equal(session.state, 'lost');
  assert.equal(f.calls().filter(x => x.params?.arguments?.action === 'create').length, 1);
});

test('a lost paused session can reopen on a fresh child and returns a fresh handback', async t => {
  const first = fixture(t); const second = fixture(t);
  const session = await AppiumCommandSession.start({ client: await first.open(), profile: first.profile }); session.pause();
  let captures = 0;
  const result = await session.resume(async () => {
    if (++captures === 1) throw Object.assign(new Error('gone'), { code: 'SESSION_MISMATCH' });
    return 'fresh replacement screen';
  }, async () => AppiumCommandSession.start({ client: await second.open(), profile: second.profile }));
  assert.equal(result.kind, 'handback');
  if (result.kind !== 'handback') assert.fail('replacement must hand back');
  assert.equal(result.observation, 'fresh replacement screen');
  assert.equal(result.session.state, 'ready');
  assert.equal(session.state, 'lost');
  assert.equal(first.calls().filter(x => x.params?.arguments?.action === 'create').length, 1);
  assert.equal(second.calls().filter(x => x.params?.arguments?.action === 'create').length, 1);
  await result.session.finish();
});

test('a foreign session delete and a duplicate finish dispatch no extra commands', async t => {
  const f = fixture(t); const client = await f.open(); const session = await AppiumCommandSession.start({ client, profile: f.profile });
  await assert.rejects(client.manageSession({ action: 'delete', sessionId: 'foreign' }, f.profile), { code: 'SESSION_MISMATCH' });
  await Promise.all([session.finish(), session.finish()]);
  assert.equal(f.calls().filter(x => x.params?.arguments?.action === 'delete').length, 1);
  assert.equal(session.state, 'closed');
});

test('recording headers reject stale lock, WDA and extension identities', t => {
  const f = fixture(t); const lines = readFileSync(f.recording, 'utf8').trim().split('\n');
  for (const [key, value] of [['stackLockSha256', '0'.repeat(64)], ['wdaTreeSha256', '0'.repeat(64)], ['extensionVersion', 2]] as const) {
    const header = { ...JSON.parse(lines[0]!), [key]: value }; const file = join(f.root, String(key) + '.jsonl');
    writeFileSync(file, [JSON.stringify(header), ...lines.slice(1)].join('\n') + '\n');
    assert.throws(() => readRecording(file), { message: 'STALE_APPIUM_RECORDING' });
  }
  assert.equal(readRecording(f.recording).header.provenance, 'hand-authored');
});
test('the recorder masks typed values and secrets before writing replayable JSONL', t => {
  const f = fixture(t); const output = join(f.root, 'recorded.jsonl'); const input = join(f.root, 'input.jsonl');
  writeFileSync(input, readFileSync(f.recording, 'utf8').replace('Session created.', 'Session created. private-test-value'));
  const command = process.execPath;
  const result = spawnSync(command, ['--import', 'tsx', 'scripts/record-appium-wire.mjs', '--input', input, '--output', output,
    '--mask', 'private-test-value'], { encoding: 'utf8', input: '' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readRecording(output).header.provenance, 'hand-authored');
  assert.equal(readFileSync(output, 'utf8').includes('private-test-value'), false);
  assert.equal(readFileSync(output, 'utf8').includes('Session created. <masked>'), true);
  assert.equal(lstatSync(output).mode & 0o777, 0o600);
});

test('a named host case records stdio exchanges which replay through the client', async t => {
  const f = fixture(t); const output = join(f.root, 'recorded-case.jsonl'); const config = join(f.root, 'case.json');
  const input = readRecording(f.recording);
  writeFileSync(config, JSON.stringify({ platform: 'ios', fixtureAppSha256: input.header.fixtureAppSha256,
    homeRoot: join(f.root, 'recorder-homes'), entrypoint: resolve('tests/fixtures/appium-wire/recorder-child.mjs'),
    args: [f.recording, 'none'], requests: input.lines.filter(line => line.direction === 'client').map(line => line.message), timeoutMs: 20000 }));
  const result = spawnSync(process.execPath, ['scripts/record-appium-wire.mjs', '--case', config, '--output', output], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  const recording = readRecording(output);
  assert.equal(recording.header.provenance, 'recorded');
  assert.equal(recording.lines.length, 9);
  const session = await AppiumCommandSession.start({ client: await f.open('none', output), profile: f.profile });
  assert.equal(session.sessionId, 'ios-session'); await session.finish();
});
