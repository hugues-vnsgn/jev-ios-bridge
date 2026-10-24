import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createBridgePlugin } from '../src/appium/extension/plugin.js';
import { TOOL_NAMES, SOURCE_SETTINGS, checkedToolReply, type ToolReply } from '../src/appium/wire-schemas.js';

test('controlled bootstrap starts through public core and exposes exactly ten tools', async t => {
  const root = mkdtempSync(join(tmpdir(), 'jev-extension-server-'));
  const profile = join(root, 'profile.json');
  writeFileSync(profile, JSON.stringify({ platform: 'ios', device: 'test-only', capabilities: { 'appium:udid': 'test-only' } }));
  const transport = new StdioClientTransport({ command: process.execPath,
    args: ['--import', import.meta.resolve('tsx'), resolve('src/appium/extension/entry.ts'), resolve('.scratch/appium-mcp-migration/candidate-stack'), profile],
    stderr: 'pipe', env: { HOME: root, APPIUM_HOME: root, APPIUM_MCP_ON_CLIENT_DISCONNECT: 'delete_all', ALLOW_REMOTE_APP_URLS: 'false', PATH: '/usr/bin:/bin' } });
  const client = new Client({ name: 'host-contract-test', version: '1' });
  t.after(async () => {
    await Promise.allSettled([client.close()]);
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });
  let stderr = '';
  transport.stderr?.on('data', chunk => { stderr += String(chunk); });
  await client.connect(transport);
  const tools = (await client.listTools()).tools;
  assert.deepEqual(tools.map(tool => tool.name).sort(), [...TOOL_NAMES].sort());
  assert.equal(tools.find(tool => tool.name === 'jev_replace_text')?.inputSchema.properties?.text !== undefined, true);
  for (const [args, code] of [[{ extensionVersion: 2, sessionId: 'foreign' }, 'VERSION_MISMATCH'], [{ extensionVersion: 1, sessionId: 'foreign' }, 'SESSION_MISMATCH']] as const) {
    const reply = await client.callTool({ name: 'jev_screen', arguments: args });
    assert.deepEqual(reply.structuredContent, { error: { code, message: code } });
  }
  const refused = await client.callTool({ name: 'appium_session_management', arguments: { action: 'attach', sessionId: 'foreign', remoteServerUrl: 'http://example.invalid' } });
  assert.deepEqual(refused.structuredContent, { error: { code: 'NOT_ALLOWED', message: 'NOT_ALLOWED' } });
  const secret = await client.callTool({ name: 'jev_replace_text', arguments: { extensionVersion: 1, sessionId: 'foreign',
    locator: { using: 'accessibility id', value: 'password' }, text: 'private-test-value' } });
  assert.deepEqual(secret.structuredContent, { error: { code: 'SESSION_MISMATCH', message: 'SESSION_MISMATCH' } });
  await client.close();
  assert.equal(stderr.includes('private-test-value'), false);
  assert.deepEqual([...new Set(stderr.trim().split('\n'))], ['[private appium stderr redacted]']);
});

test('public hooks guard the pinned profile, bind the session and check exact completions', async () => {
  const profile = { platform: 'ios' as const, device: 'device-1', capabilities: { 'appium:udid': 'device-1' } };
  let sessions: unknown[] = [];
  const plugin = createBridgePlugin(profile, schema => schema);
  const registered: string[] = [];
  plugin.register({ addTool: definition => { registered.push(definition.name); } }, {
    listSessions: () => sessions, getDriver: () => ({}), getSessionInfo: () => null,
  });
  assert.deepEqual(registered, ['jev_session_inventory', 'jev_settings', 'jev_screen', 'jev_replace_text', 'jev_android_back', 'jev_start_activity', 'jev_terminate_app']);
  const wrong = await plugin.beforeCall({ toolName: 'appium_session_management', args: { action: 'create', platform: 'ios', capabilities: JSON.stringify({ ...profile.capabilities, app: 'unexpected' }) } });
  assert.deepEqual(wrong?.structuredContent, { error: { code: 'NOT_ALLOWED', message: 'NOT_ALLOWED' } });
  const create = { toolName: 'appium_session_management', args: { action: 'create', platform: 'ios', capabilities: JSON.stringify(profile.capabilities) } };
  assert.equal(await plugin.beforeCall(create), undefined);
  sessions = [{ sessionId: 'session-1', ownership: 'owned', platform: 'iOS', capabilities: profile.capabilities }];
  const reply = await plugin.afterCall(create, { content: [{ type: 'text', text: 'Session created' }], isError: false });
  assert.deepEqual(reply.structuredContent, { extensionVersion: 1, sessions: [{ sessionId: 'session-1', ownership: 'owned', platform: 'ios', device: 'device-1' }] });
  assert.deepEqual((await plugin.beforeCall({ toolName: 'appium_get_page_source', args: { sessionId: 'other', saveToFile: false } }))?.structuredContent,
    { error: { code: 'SESSION_MISMATCH', message: 'SESSION_MISMATCH' } });
  const source = { toolName: 'appium_get_page_source', args: { sessionId: 'session-1', saveToFile: false } };
  assert.equal(await plugin.beforeCall(source), undefined);
  assert.deepEqual((await plugin.afterCall(source, { isError: false, content: [{ type: 'text', text: 'Page source retrieved successfully: \n```xml <Appium/>```' }] })).structuredContent,
    { extensionVersion: 1, sessionId: 'session-1', xml: '<Appium/>' });
});

test('shared result parser treats malformed public and extension acknowledgements as lost', () => {
  const base = { extensionVersion: 1, sessionId: 'session-1' };
  assert.deepEqual(checkedToolReply('jev_android_back', base, { content: [], structuredContent: { ...base, acknowledged: true } }).structuredContent, { ...base, acknowledged: true });
  for (const [name, args, structuredContent] of [
    ['jev_android_back', base, { ...base, acknowledged: 'yes' }],
    ['jev_screen', base, { ...base, pngBase64: 'invalid', rect: {}, orientation: 'PORTRAIT' }],
    ['jev_settings', { ...base, settings: SOURCE_SETTINGS.ios }, { ...base }],
    ['appium_perform_actions', { sessionId: 'session-1', actions: [] }, { ...base, acknowledged: false }],
    ['appium_get_page_source', { sessionId: 'session-1', saveToFile: false }, { ...base, xml: 23 }],
  ]) assert.throws(() => checkedToolReply(String(name), args, { content: [], structuredContent }), { code: 'ACKNOWLEDGEMENT_LOST' });
  assert.throws(() => checkedToolReply('jev_android_back', base, { content: [{ type: 'text', text: 'secret' }], isError: true,
    structuredContent: { error: { code: 'ARBITRARY', message: 'secret' } } }), { code: 'ACKNOWLEDGEMENT_LOST' });
});
test('a failed extension mutation closes public input dispatch too', async () => {
  const profile = { platform: 'ios' as const, device: 'device-1', capabilities: { 'appium:udid': 'device-1' } };
  let sessions: unknown[] = [];
  const plugin = createBridgePlugin(profile, schema => schema);
  const tools = new Map<string, (args: unknown) => Promise<ToolReply>>();
  const driver = { findElements: async () => [{ ELEMENT: 'field-1' }], clear: async () => { throw new Error('lost'); } };
  plugin.register({ addTool: definition => { tools.set(definition.name, definition.execute); } },
    { listSessions: () => sessions, getDriver: () => driver, getSessionInfo: () => null });
  const create = { toolName: 'appium_session_management', args: { action: 'create', platform: 'ios', capabilities: JSON.stringify(profile.capabilities) } };
  assert.equal(await plugin.beforeCall(create), undefined);
  sessions = [{ sessionId: 'session-1', ownership: 'owned', platform: 'iOS', capabilities: profile.capabilities }];
  assert.deepEqual((await plugin.afterCall(create, { content: [], isError: false })).structuredContent,
    { extensionVersion: 1, sessions: [{ sessionId: 'session-1', ownership: 'owned', platform: 'ios', device: 'device-1' }] });
  const replace = tools.get('jev_replace_text');
  if (!replace) assert.fail('replace tool must be registered');
  assert.deepEqual((await replace({ extensionVersion: 1, sessionId: 'session-1', locator: { using: 'id', value: 'field' }, text: 'new' })).structuredContent,
    { error: { code: 'DRIVER_ERROR', message: 'DRIVER_ERROR' } });
  assert.deepEqual((await plugin.beforeCall({ toolName: 'appium_perform_actions', args: { sessionId: 'session-1',
    actions: [{ type: 'pointer', id: 'finger', actions: [{ type: 'pointerDown', button: 0 }] }] } }))?.structuredContent,
    { error: { code: 'NOT_ALLOWED', message: 'NOT_ALLOWED' } });
});
