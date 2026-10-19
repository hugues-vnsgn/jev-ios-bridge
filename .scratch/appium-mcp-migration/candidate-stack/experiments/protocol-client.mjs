// Research-only protocol tracer; no production entry point uses this program.
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { creation, xmlText, elements, completion, screenshot } from './protocol-contract.mjs';
const fixture = JSON.parse(readFileSync(new URL('../fixtures/protocol.json', import.meta.url), 'utf8'));
const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const client = new Client({ name: 'jev-phase1-protocol', version: '0.1.0' }, { capabilities: {} });
const transport = new StdioClientTransport({ ...config.provider, env: { PATH: process.env.PATH, AI_VISION_ENABLED: 'false', APPIUM_MCP_OTEL_ENABLED: 'false', APPIUM_MCP_ON_CLIENT_DISCONNECT: 'skip' }, stderr: 'ignore' });
const safeReasons = new Set(['SERVER_IDENTITY_MISMATCH', 'TOOL_SCHEMA_MISMATCH', 'RUNTIME_STACK_MISMATCH', 'INVALID_CREATION_RESULT', 'INVALID_XML_RESULT', 'INVALID_ELEMENTS_RESULT', 'INVALID_COMPLETION_RESULT', 'INVALID_SCREENSHOT_RESULT', 'INVALID_RESULT_ENVELOPE', 'VENDOR_ERROR', 'PROVIDER_UNAVAILABLE', 'TARGET_NOT_UNIQUE', 'VISIBLE_CHECK_FAILED']);
let output;
let dispatched = false;
async function call(request, invalidReason) {
  try { return await client.callTool(request, undefined, { timeout: 5000 }); }
  catch (error) { throw new Error(Array.isArray(error.issues) ? invalidReason : 'PROVIDER_UNAVAILABLE'); }
}
try {
  await client.connect(transport, { timeout: 5000 });
  if (!isDeepStrictEqual(client.getServerVersion(), fixture.server)) throw new Error('SERVER_IDENTITY_MISMATCH');
  const tools = (await client.listTools({}, { timeout: 5000 })).tools;
  for (const expected of fixture.tools) {
    const matches = tools.filter(tool => tool.name === expected.name);
    if (matches.length !== 1 || !isDeepStrictEqual(matches[0].inputSchema, expected.inputSchema) || !isDeepStrictEqual(matches[0].outputSchema, expected.outputSchema)) throw new Error('TOOL_SCHEMA_MISMATCH');
  }
  const stackReply = await call({ name: 'jev_phase1_stack', arguments: {} }, 'RUNTIME_STACK_MISMATCH');
  if (stackReply.isError || !isDeepStrictEqual(stackReply.structuredContent, fixture.stack)) throw new Error('RUNTIME_STACK_MISMATCH');
  const request = fixture.platforms[config.platform].calls[0].request;
  const caps = JSON.parse(request.arguments.capabilities);
  dispatched = true;
  const reply = await call(request, 'INVALID_CREATION_RESULT');
  const sessionId = creation(reply, config.platform, caps);
  const sourceReply = await call({ name: 'appium_get_page_source', arguments: { sessionId } }, 'INVALID_XML_RESULT');
  const parsed = spawnSync('python3', [fileURLToPath(new URL('./validate-xml.py', import.meta.url))], { input: JSON.stringify({ platform: config.platform, xml: xmlText(sourceReply) }), encoding: 'utf8', timeout: 5000, env: { PATH: process.env.PATH } });
  if (parsed.status !== 0) throw new Error('INVALID_XML_RESULT');
  const before = JSON.parse(parsed.stdout);
  if (before.summary !== 'Selected: None') throw new Error('VISIBLE_CHECK_FAILED');
  const located = fixture.platforms[config.platform].calls[2].request;
  const matches = elements(await call({ ...located, arguments: { ...located.arguments, sessionId } }, 'INVALID_ELEMENTS_RESULT'));
  if (matches.length !== 1) throw new Error('TARGET_NOT_UNIQUE');
  const action = { name: 'appium_gesture', arguments: { sessionId, action: 'tap', maxScrollAttempts: 10, elementUUID: matches[0] } };
  let actionReply;
  try { actionReply = await client.callTool(action, undefined, { timeout: 5000 }); } catch { throw new Error('PROVIDER_UNAVAILABLE'); }
  completion(actionReply, action);
  const afterReply = await call({ name: 'appium_get_page_source', arguments: { sessionId } }, 'INVALID_XML_RESULT');
  const afterParsed = spawnSync('python3', [fileURLToPath(new URL('./validate-xml.py', import.meta.url))], { input: JSON.stringify({ platform: config.platform, xml: xmlText(afterReply) }), encoding: 'utf8', timeout: 5000, env: { PATH: process.env.PATH } });
  if (afterParsed.status !== 0) throw new Error('INVALID_XML_RESULT');
  const after = JSON.parse(afterParsed.stdout);
  if (before.summary !== 'Selected: None' || after.summary !== 'Selected: Apple') throw new Error('VISIBLE_CHECK_FAILED');
  const image = screenshot(await call({ name: 'appium_screenshot', arguments: { sessionId, returnRawBase64: true } }, 'INVALID_SCREENSHOT_RESULT'));
  const deletion = { name: 'appium_session_management', arguments: { action: 'delete', sessionId } };
  completion(await call(deletion, 'INVALID_COMPLETION_RESULT'), deletion);
  output = { status: 'passed-host-protocol', before: before.summary, after: after.summary, screenshot: image, quarantined: true, leaseReleased: false, nativeFenceEstablished: false };

} catch (error) { output = { status: 'refused', reason: safeReasons.has(error.message) ? error.message : 'PROVIDER_UNAVAILABLE', quarantined: dispatched, leaseReleased: false }; }
finally { await client.close(); }
console.log(JSON.stringify(output));
