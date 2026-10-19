// Controllable device-provider boundary, through the REAL public core hooks.
// No session creation and no native backend are performed by this fixture.
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import * as publicCore from 'appium-mcp/core';
import { protocolExtension } from './protocol-extension.mjs';
const fixture = JSON.parse(readFileSync(new URL('../fixtures/protocol.json', import.meta.url), 'utf8'));
const extension = protocolExtension(fixture.stack, { platform: 'ios', caps: JSON.parse(fixture.platforms.ios.calls[0].request.arguments.capabilities) });
const controls = { name: 'controlled-native-provider', version: '0.1.0', register(registry) {
  registry.addTool({ name: 'appium_gesture', parameters: z.fromJSONSchema(fixture.tools.find(x => x.name === 'appium_gesture').inputSchema), execute: async args => args.elementUUID === 'ffffffff-ffff-ffff-ffff-ffffffffffff' ? { isError: true, content: [{ type: 'text', text: 'supplied password: private-test-value' }] } : { isError: false, content: [{ type: 'text', text: `elementId '${args.elementUUID}'\nSuccessfully tapped element ${args.elementUUID}.` }] } });
  registry.addTool({ name: 'appium_session_management', parameters: z.object({ action: z.literal('delete'), sessionId: z.string() }), execute: async args => ({ isError: false, content: [{ type: 'text', text: `Session ${args.sessionId} deleted successfully.` }] }) });
} };
publicCore.configureStdioTransportLogging();
const server = await publicCore.createAppiumMcpServer({ plugins: [extension, controls], policy: { allowTools: [/^(appium_(gesture|session_management)|jev_phase1_stack)$/] } });
await server.start({ transportType: 'stdio' });
