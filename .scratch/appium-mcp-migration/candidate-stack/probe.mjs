// Discovery evidence only. This script cannot create a session or dispatch input.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const output = process.argv[2];
if (!output) throw new Error('Usage: node probe.mjs <evidence.json>');
const entry = fileURLToPath(import.meta.resolve('appium-mcp'));
const workspace = await mkdtemp(join(tmpdir(), 'jev-appium-discovery-'));
const env = {
  PATH: process.env.PATH ?? '', HOME: workspace, TMPDIR: workspace,
  AI_VISION_ENABLED: 'false', APPIUM_MCP_OTEL_ENABLED: 'false',
  APPIUM_MCP_ON_CLIENT_DISCONNECT: 'skip',
};
const environmentKeys = Object.keys({ ...getDefaultEnvironment(), ...env });
assert.ok(!environmentKeys.includes('TYPESAFE_API_KEY'));
const transport = new StdioClientTransport({
  command: process.execPath, args: [entry], cwd: workspace, env, stderr: 'ignore',
});
const client = new Client(
  { name: 'jev-appium-feasibility-discovery', version: '0.1.0' },
  { capabilities: {} },
);
const deadline = setTimeout(() => { void transport.close(); }, 20_000);
try {
  await client.connect(transport);
  const server = client.getServerVersion();
  assert.deepEqual(server, { name: 'MCP Appium', version: '1.97.0' });
  const { tools } = await client.listTools();
  assert.ok(!tools.some(tool => /vision|with_ai/.test(tool.name)));
  const requests = [
    { name: 'appium_session_management', arguments: { action: 'list' } },
    { name: 'appium_get_page_source', arguments: { sessionId: 'jev-probe-nonexistent-session' } },
    { name: 'appium_find_elements', arguments: {
      sessionId: 'jev-probe-nonexistent-session', strategy: 'id', selector: 'jev-probe-nonexistent-element',
    } },
    { name: 'appium_screenshot', arguments: { sessionId: 'jev-probe-nonexistent-session' } },
  ];
  const results = [];
  for (const request of requests) {
    assert.ok(tools.some(tool => tool.name === request.name));
    const reply = await client.callTool(request);
    if (request.name !== 'appium_session_management') assert.equal(reply.isError, true);
    results.push({ request, reply });
  }
  const record = {
    kind: 'appium-candidate-discovery', candidate: true, server, node: process.version,
    environmentKeys, explicitEnvironmentKeys: Object.keys(env), tools, results,
    nativeSessionsCreated: 0, nativeInputAttempts: 0, nativeFenceEstablished: false,
  };
  const encoded = JSON.stringify(record, null, 2) + '\n';
  await writeFile(output, encoded);
  console.log(JSON.stringify({
    server, toolCount: tools.length,
    sha256: createHash('sha256').update(encoded).digest('hex'),
    nativeSessionsCreated: 0, nativeInputAttempts: 0, nativeFenceEstablished: false,
  }));
} finally {
  clearTimeout(deadline);
  try {
    await client.close();
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
