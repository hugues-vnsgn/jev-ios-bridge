import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { completion } from './protocol-contract.mjs';
const fixture = JSON.parse(readFileSync(new URL('../fixtures/protocol.json', import.meta.url), 'utf8'));
const work = fileURLToPath(new URL('../../runtime/protocol-public-probe/', import.meta.url)); mkdirSync(work, { recursive: true });
const env = { PATH: process.env.PATH, HOME: work, TMPDIR: work, AI_VISION_ENABLED: 'false', APPIUM_MCP_OTEL_ENABLED: 'false', APPIUM_MCP_ON_CLIENT_DISCONNECT: 'skip' };
assert.ok(!Object.keys({ ...getDefaultEnvironment(), ...env }).includes('TYPESAFE_API_KEY'));
async function connect(script, args = []) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL(script, import.meta.url)), ...args], env, cwd: work, stderr: 'ignore' });
  const client = new Client({ name: 'jev-public-protocol-probe', version: '0.1.0' }, { capabilities: {} });
  await client.connect(transport, { timeout: 10000 });
  return client;
}
const evidence = { kind: 'host-public-extension-probe', requests: [], nativeSessionsCreated: 0, nativeInputAttempts: 0, leaseReleased: false, creationExtensionLiveProven: false };
let client;
try {
  client = await connect('./protocol-server.mjs', ['ios']);
  assert.deepEqual(client.getServerVersion(), fixture.server);
  const tools = (await client.listTools()).tools;
  for (const expected of fixture.tools) {
    const actual = tools.filter(x => x.name === expected.name); assert.equal(actual.length, 1);
    assert.deepEqual(actual[0].inputSchema, expected.inputSchema);
  }
  const stack = await client.callTool({ name: 'jev_phase1_stack', arguments: {} });
  assert.deepEqual(stack.structuredContent, fixture.stack);
  evidence.measuredStackMatched = true; evidence.realServerTools = tools.map(x => x.name);
  const newerCache = work + 'wda-cache/newest/WebDriverAgentRunner-Runner.app';
  mkdirSync(newerCache, { recursive: true }); writeFileSync(newerCache + '/newest-artifact', 'unselected artifact');
  for (const changed of [ { 'appium:prebuiltWDAPath': newerCache }, { 'appium:usePreinstalledWDA': false, 'appium:useNewWDA': true } ]) {
    const args = structuredClone(fixture.platforms.ios.calls[0].request.arguments);
    args.capabilities = JSON.stringify({ ...JSON.parse(args.capabilities), ...changed });
    let rejected = false;
    try { const reply = await client.callTool({ name: 'appium_session_management', arguments: args }); rejected = reply.isError === true; } catch { rejected = true; }
    assert.equal(rejected, true);
  }
  const after = await client.callTool({ name: 'jev_phase1_inventory', arguments: {} });
  assert.equal(after.structuredContent.creationAuthorizedCount, 0); assert.deepEqual(after.structuredContent.sessions, []);
  const unchanged = await client.callTool({ name: 'jev_phase1_stack', arguments: {} }); assert.deepEqual(unchanged.structuredContent, fixture.stack);
  evidence.alternateArtifactRefusals = 2; evidence.unselectedNewerCacheDidNotChangeStack = true; evidence.inventory = after.structuredContent;
  await client.close(); client = await connect('./extension-controlled-server.mjs');
  const sessionId = '175c3947-5920-40e5-bc7e-0ad161166e4d';
  const gesture = { name: 'appium_gesture', arguments: { sessionId, action: 'tap', maxScrollAttempts: 10, elementUUID: '14000000-0000-0000-460A-010000000000' } };
  const reply = await client.callTool(gesture); completion(reply, gesture);
  evidence.requests.push({ request: gesture, reply });
  const deletion = { name: 'appium_session_management', arguments: { action: 'delete', sessionId } };
  const deleted = await client.callTool(deletion); completion(deleted, deletion);
  evidence.requests.push({ request: deletion, reply: deleted });
  const error = await client.callTool({ ...gesture, arguments: { ...gesture.arguments, elementUUID: 'ffffffff-ffff-ffff-ffff-ffffffffffff' } });
  assert.equal(error.isError, true); assert.equal(JSON.stringify(error).includes('private-test-value'), false);
  evidence.filteredVendorError = error;
  let refused = false;
  try { const absent = await client.callTool({ name: 'appium_gesture', arguments: { action: 'tap', maxScrollAttempts: 10, elementUUID: gesture.arguments.elementUUID } }); refused = absent.isError === true; }
  catch { refused = true; }
  assert.equal(refused, true); evidence.missingSessionRefused = true;
  evidence.status = 'passed-host-public-extension';
} finally { if (client) await client.close(); }
console.log(JSON.stringify(evidence, null, 2));
