// Private local candidate. No production admission, driver, or mode integration.
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { stack, publicCore } from './stack-probe.mjs';
import { protocolExtension } from './protocol-extension.mjs';
const fixture = JSON.parse(readFileSync(new URL('../fixtures/protocol.json', import.meta.url), 'utf8'));
if (!isDeepStrictEqual(stack, fixture.stack)) throw new Error('RUNTIME_STACK_MISMATCH');
const platform = process.argv[2];
if (!['ios', 'android'].includes(platform)) throw new Error('INVALID_PLATFORM');
const profile = { platform, caps: JSON.parse(fixture.platforms[platform].calls[0].request.arguments.capabilities) };
const plugin = protocolExtension(stack, profile);
const verification = publicCore.verifyAppiumMcpNames({ plugins: [plugin] });
if (!verification.ok) throw new Error('PLUGIN_REGISTRATION_CONFLICT');
publicCore.configureStdioTransportLogging();
const server = await publicCore.createAppiumMcpServer({ plugins: [plugin], policy: { allowTools: [/^(appium_(session_management|get_page_source|find_elements|gesture|screenshot)|jev_phase1_(stack|inventory))$/] } });
await server.start({ transportType: 'stdio' });
