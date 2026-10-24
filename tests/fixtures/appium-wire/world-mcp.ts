import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { isDeepStrictEqual } from 'node:util';
import { JSONRPCMessageSchema } from '@modelcontextprotocol/sdk/types.js';
import { checkedToolReply, EXTENSION_VERSION, extensionFailure, extensionRequestSchema, publicToolRequestSchema, toolDefinitions } from '../../../src/appium/wire-schemas.js';
import { worldSchema, type WorldRule } from './world-schema.js';

const [file, trace] = process.argv.slice(2);
if (!file || !trace) throw new Error('WORLD_REQUIRED');
const world = worldSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
writeFileSync(trace + '.env', JSON.stringify(Object.keys(process.env)), { mode: 0o600 });
let screen = world.start;
let typed = '';
const counts = new Map<string, number>();

function send(message: unknown): void {
  const line = JSON.stringify(message) + '\n';
  appendFileSync(trace + '.replies', line, { mode: 0o600 });
  process.stdout.write(line);
}
function source(): string { return world.screens[screen]!.replaceAll('{{typed}}', typed.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')); }
function contains(actual: unknown, expected: unknown): boolean {
  if (typeof expected !== 'object' || expected === null) return isDeepStrictEqual(actual, expected);
  if (typeof actual !== 'object' || actual === null) return false;
  return Object.entries(expected).every(([key, value]) => contains((actual as Record<string, unknown>)[key], value));
}
function ruleFor(name: string, args: unknown, nth: number): WorldRule | undefined {
  return world.rules.find(rule => rule.tool === name && (rule.nth === undefined || rule.nth === nth)
    && (rule.when === undefined || rule.when === screen) && (rule.match === undefined || contains(args, rule.match)));
}
function result(name: string, args: Record<string, unknown>): unknown {
  const binding = { extensionVersion: EXTENSION_VERSION, sessionId: world.sessionId };
  switch (name) {
    case 'appium_session_management': {
      if (args.action === 'delete') return { ...binding, deleted: true };
      const capabilities = JSON.parse(String(args.capabilities)) as Record<string, unknown>;
      return { extensionVersion: EXTENSION_VERSION, sessions: [{ sessionId: world.sessionId, ownership: 'owned', platform: world.platform, device: String(capabilities['appium:udid']) }] };
    }
    case 'jev_settings': return { ...binding, settings: args.settings };
    case 'appium_get_page_source': return { ...binding, xml: source() };
    case 'jev_screen': return { ...binding, pngBase64: world.png, rect: world.rect, orientation: 'PORTRAIT' };
    case 'jev_replace_text': typed = String(args.text); return { ...binding, acknowledged: true };
    default: return { ...binding, acknowledged: true };
  }
}
function reply(id: string | number, name: string, args: Record<string, unknown>, rule: WorldRule | undefined): void {
  const fault = rule?.fault;
  if (fault?.kind === 'exit') process.exit(fault.code);
  if (fault?.kind === 'disconnect') { process.stdout.end(); return; }
  if (fault?.kind === 'malformed') { send({ jsonrpc: 'broken', id: 'bad', result: null }); return; }
  if (fault?.kind === 'schema') { send({ jsonrpc: '2.0', id, result: { content: [], isError: false, structuredContent: { extensionVersion: EXTENSION_VERSION, sessionId: world.sessionId, acknowledged: 'yes' } } }); return; }
  const answer = fault?.kind === 'error' ? extensionFailure(fault.code)
    : { content: [{ type: 'text', text: 'World reply.' }], isError: false, structuredContent: result(name, args) };
  checkedToolReply(name, args, answer);
  if (rule?.to !== undefined) screen = rule.to;
  const message = { jsonrpc: '2.0', id, result: answer };
  if (fault?.kind === 'lost') return;
  if (fault?.kind === 'late') { setTimeout(() => send(message), fault.ms); return; }
  if (fault?.kind === 'held') {
    const timer = setInterval(() => { if (existsSync(trace + '.release')) { clearInterval(timer); send(message); } }, 5);
    return;
  }
  send(message);
}
const input = createInterface({ input: process.stdin });
input.on('close', () => process.exit(0));
input.on('line', line => {
  try {
    const request = JSONRPCMessageSchema.parse(JSON.parse(line));
    appendFileSync(trace, JSON.stringify(request) + '\n', { mode: 0o600 });
    if (existsSync(trace + '.goto')) { screen = readFileSync(trace + '.goto', 'utf8').trim(); rmSync(trace + '.goto'); }
    if (!('method' in request) || !('id' in request) || request.id === undefined) return;
    if (request.method === 'initialize') {
      const params = request.params as { protocolVersion: string };
      send({ jsonrpc: '2.0', id: request.id, result: { protocolVersion: params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'MCP Appium', version: '1.97.0' } } });
      return;
    }
    if (request.method === 'tools/list') { send({ jsonrpc: '2.0', id: request.id, result: { tools: toolDefinitions() } }); return; }
    if (request.method !== 'tools/call') throw new Error('WORLD_UNKNOWN_METHOD');
    const params = (request.params as { name: string }).name.startsWith('jev_') ? extensionRequestSchema.parse(request.params) : publicToolRequestSchema.parse(request.params);
    const nth = (counts.get(params.name) ?? 0) + 1;
    counts.set(params.name, nth);
    reply(request.id, params.name, params.arguments as Record<string, unknown>, ruleFor(params.name, params.arguments, nth));
  } catch { process.stderr.write('INVALID_APPIUM_WIRE\n'); process.exit(2); }
});
