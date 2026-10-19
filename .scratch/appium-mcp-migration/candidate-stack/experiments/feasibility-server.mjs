import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// Disposable feasibility experiment, through the public extension API.
import * as publicCore from 'appium-mcp/core';
const record = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const platform = process.argv[3];
let core;
const plugin = {
  name: 'jev-feasibility-session-result', version: '0.1.0',
  register(_registry, availableCore) { core = availableCore; },
  beforeCall(ctx) {
    if (ctx.toolName === 'appium_session_management' && ctx.args.action === 'create') {
      const caps = JSON.parse(ctx.args.capabilities);
      assert.equal(core.listSessions().length, 0);
      assert.equal(caps['appium:udid'], platform === 'ios' ? record.ios.udid : record.android.serial);
      if (platform === 'ios') assert.equal(caps['appium:simulatorDevicesSetPath'], record.ios.set);
      assert.equal(ctx.args.remoteServerUrl, undefined);
    } else if (ctx.toolName !== 'appium_session_management' || ctx.args.action !== 'list') {
      assert.equal(typeof ctx.args.sessionId, 'string');
      assert.ok(core.getSessionInfo(ctx.args.sessionId));
    }
  },
  afterCall(ctx, reply) {
    if (ctx.toolName === 'appium_session_management' && ctx.args.action === 'create' && !reply.isError) {
      const sessions = core.listSessions();
      assert.equal(sessions.length, 1);
      return { ...reply, structuredContent: { extensionVersion: 1, sessions } };
    }
  },
};
publicCore.configureStdioTransportLogging();
const server = await publicCore.createAppiumMcpServer({ plugins: [plugin], policy: {
  allowTools: [/^appium_(session_management|get_page_source|find_elements|gesture|screenshot)$/],
} });
await server.start({ transportType: 'stdio' });
