// Public Appium MCP extension used only by the stop/recovery experiment.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, renameSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { journal } from './stop-journal.mjs';
import { join } from 'node:path';
import * as publicCore from 'appium-mcp/core';
import { logger } from '@appium/support';

const [preparationPath, platform, directory] = process.argv.slice(2);
const preparation = JSON.parse(readFileSync(preparationPath, 'utf8'));
const ownerPath = process.env.JEV_STOP_GROUP_RECORD;
const owner = JSON.parse(readFileSync(ownerPath, 'utf8'));
let core;
let sequence = 0;
const calls = new WeakMap();
function captureGroup() {
  const rows = execFileSync('ps', ['-axo', 'pid=,pgid=,lstart='], { encoding: 'utf8', timeout: 5000 });
  const members = rows.trim().split('\n').map(row => row.trim().split(/\s+/)).filter(parts => Number(parts[1]) === owner.pgid)
    .map(parts => ({ pid: Number(parts[0]), birth: parts.slice(2).join(' ') }));
  const incarnations = JSON.parse(execFileSync('python3', [join(import.meta.dirname, 'stop-group.py'), 'identities', ...members.map(x => String(x.pid))], { encoding: 'utf8', timeout: 5000 }));
  for (const member of members) member.incarnation = incarnations.find(x => x.pid === member.pid).incarnation;
  owner.members = [...new Map([...owner.members, ...members].map(x => [x.pid + ':' + x.birth, x])).values()];
  writeFileSync(ownerPath + '.tmp', JSON.stringify(owner), { mode: 0o600 });
  const fd = openSync(ownerPath + '.tmp', 'r'); try { fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(ownerPath + '.tmp', ownerPath);
  const parent = openSync(directory, 'r'); try { fsyncSync(parent); } finally { closeSync(parent); }
}
const plugin = {
  name: 'jev-phase1-stop-recovery', version: '0.1.0',
  register(_registry, availableCore) { core = availableCore; captureGroup(); },
  beforeCall(ctx) {
    const id = 'command-' + (++sequence);
    const authorization = journal(directory, 'authorize', { id, tool: ctx.toolName, arguments: ctx.args });
    if (!authorization.accepted) return { isError: true, content: [{ type: 'text', text: authorization.reason }] };
    logger.getLogger('appium-mcp').level = 'debug';
    calls.set(ctx, id);
    if (ctx.toolName === 'appium_session_management') {
      assert.equal(ctx.args.action, 'create');
      assert.equal(core.listSessions().length, 0);
      const caps = JSON.parse(ctx.args.capabilities);
      assert.equal(caps['appium:udid'], platform === 'ios' ? preparation.ios.udid : preparation.android.serial);
      if (platform === 'ios') assert.equal(caps['appium:simulatorDevicesSetPath'], preparation.ios.set);
      assert.equal(ctx.args.remoteServerUrl, undefined);
    } else {
      assert.equal(ctx.toolName, 'appium_gesture');
      assert.ok(core.getSessionInfo(ctx.args.sessionId));
    }
    captureGroup();
  },
  afterCall(ctx, reply) {
    const id = calls.get(ctx);
    assert.ok(id);
    const completion = journal(directory, 'complete', { id });
    if (!completion.accepted) return { isError: true, content: [{ type: 'text', text: completion.reason }] };
    if (ctx.toolName === 'appium_session_management' && !reply.isError) {
      const sessions = core.listSessions(); assert.equal(sessions.length, 1);
      return { ...reply, structuredContent: { extensionVersion: 1, sessions } };
    }
    return reply;
  },
};
const monitor = setInterval(captureGroup, 250); monitor.unref();
publicCore.configureStdioTransportLogging();
// The synthetic experiment records the actual native proxy dispatch. Keep the
// public logger on stderr so JSON-RPC remains clean.
logger.getLogger('appium-mcp').level = 'debug';
const server = await publicCore.createAppiumMcpServer({ plugins: [plugin], policy: { allowTools: [/^appium_(session_management|gesture)$/] } });
await server.start({ transportType: 'stdio' });
