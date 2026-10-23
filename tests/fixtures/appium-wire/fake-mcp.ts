import { appendFileSync, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod/v4';
import { JSONRPCMessageSchema, type JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { readRecording, validateRecordedResult } from './recording.js';
import { toolDefinitions } from '../../../src/appium/wire-schemas.js';

const [file, fault = 'none', trace, environment] = process.argv.slice(2);
if (!file) throw new Error('RECORDING_REQUIRED');
const { lines } = readRecording(file);
if (environment) writeFileSync(environment, JSON.stringify(process.env), { mode: 0o600 });
let index = 0;
let sources = 0;
let screens = 0;
const ids = new Map<string | number, string | number>();
function normalized(message: JSONRPCMessage) {
  const output = structuredClone(message);
  if ('id' in output) output.id = 0;
  if ('params' in output && output.method === 'tools/call') {
    const params = z.object({ name: z.string(), arguments: z.record(z.string(), z.unknown()) }).parse(output.params);
    if (typeof params.arguments.capabilities === 'string') params.arguments.capabilities = JSON.parse(params.arguments.capabilities);
    return { ...output, params };
  }
  return output;
}
function send(message: unknown) {
  const line = JSON.stringify(message) + '\n';
  if (trace) appendFileSync(trace + '.replies', line, { mode: 0o600 });
  process.stdout.write(line);
}
function lateReply(reply: unknown): void {
  if (!fault.endsWith('-held')) { setTimeout(() => send(reply), 250); return; }
  const timer = setInterval(() => {
    if (trace && existsSync(trace + '.release')) { clearInterval(timer); send(reply); }
  }, 5);
}
const input = createInterface({ input: process.stdin });
input.on('close', () => process.exit(0));
input.on('line', line => {
  try {
    const request = JSONRPCMessageSchema.parse(JSON.parse(line));
    if (trace) appendFileSync(trace, JSON.stringify(request) + '\n', { mode: 0o600 });
    if ('method' in request && request.method === 'notifications/cancelled') return;
    if ('method' in request && request.method === 'tools/list' && 'id' in request) {
      send({ jsonrpc: '2.0', id: request.id, result: { tools: toolDefinitions() } }); return;
    }
    if ('params' in request && request.method === 'tools/call' && request.params?.name === 'appium_session_management'
      && typeof request.params.arguments === 'object' && request.params.arguments !== null && 'action' in request.params.arguments
      && request.params.arguments.action === 'delete') {
      const deletion = lines.findIndex((line, at) => at >= index && line.direction === 'client' && 'method' in line.message
        && line.message.method === 'tools/call' && line.message.params?.name === 'appium_session_management');
      if (deletion !== -1) index = deletion;
    }
    const expected = lines[index++];
    if (!expected || expected.direction !== 'client' || !isDeepStrictEqual(normalized(request), normalized(expected.message))) throw new Error('WIRE_REQUEST_MISMATCH');
    if ('id' in request && request.id !== undefined && 'id' in expected.message && expected.message.id !== undefined) ids.set(expected.message.id, request.id);
    while (lines[index]?.direction === 'server') {
      const reply = structuredClone(lines[index++]!.message);
      if ('id' in reply && reply.id !== undefined) reply.id = ids.get(reply.id) ?? reply.id;
      if (!('result' in reply)) { send(reply); continue; }
      if ('method' in request && request.method === 'initialize') {
        if (fault === 'protocol') { send({ ...reply, result: { ...reply.result, protocolVersion: '2099-01-01' } }); return; }
      } else if ('params' in request && request.method === 'tools/call') {
        validateRecordedResult(request.params, reply.result);
        const params = z.object({ name: z.string(), arguments: z.object({ action: z.string().optional() }).passthrough() }).parse(request.params);
        const result = z.object({ structuredContent: z.record(z.string(), z.unknown()) }).passthrough().parse(reply.result);
        if (params.arguments.action === 'create') {
          if (fault === 'create-unowned') {
            const data = z.object({ sessions: z.array(z.record(z.string(), z.unknown())) }).parse(result.structuredContent);
            data.sessions[0]!.ownership = 'attached'; result.structuredContent.sessions = data.sessions;
          }
          if (fault === 'create-duplicate') {
            const data = z.object({ sessions: z.array(z.unknown()) }).parse(result.structuredContent);
            result.structuredContent.sessions = [...data.sessions, ...data.sessions];
          }
        }
        if (params.name === 'appium_get_page_source') {
          sources++;
          if ((fault.startsWith('source-late-first') && sources === 1) || (fault.startsWith('source-late-second') && sources === 2)) {
            lateReply(reply); return;
          }
          if (fault === 'source-lost') return;
        }
        if (params.name === 'jev_screen' && ++screens === 2 && fault.startsWith('screen-late-second')) {
          lateReply(reply); return;
        }
        if (params.name === 'jev_settings') {
          if (fault === 'lost') return;
          if (fault === 'late') { setTimeout(() => send(reply), 250); return; }
          if (fault === 'dead-child') process.exit(17);
          if (fault === 'disconnect') { process.stdout.end(); return; }
          if (fault === 'malformed') { send({ jsonrpc: 'broken', id: 'bad', result: null }); return; }
          if (fault === 'settings-error') { send({ ...reply, result: { content: [{ type: 'text', text: 'private-test-value' }], isError: true } }); return; }
          if (fault === 'settings-unequal') result.structuredContent.settings = { pageSourceExcludedAttributes: 'visible' };
          if (fault === 'settings-missing') delete result.structuredContent.settings;
          if (fault === 'foreign-session') result.structuredContent.sessionId = 'foreign';
          if (fault === 'foreign-version') result.structuredContent.extensionVersion = 2;
        }
        if (params.name.startsWith('jev_') && params.name !== 'jev_settings') {
          if (fault === 'extension-malformed') result.structuredContent = { extensionVersion: 1, sessionId: 'ios-session', acknowledged: 'yes' };
          if (fault === 'extension-error-secret') {
            process.stderr.write('private-test-value\n');
            send({ ...reply, result: { isError: true, content: [{ type: 'text', text: 'private-test-value' }],
              structuredContent: { error: { code: 'DRIVER_ERROR', message: 'private-test-value' } } } }); return;
          }
        }
        reply.result = result;
      }
      send(reply);
    }
  } catch { process.stderr.write('INVALID_APPIUM_WIRE\n'); process.exit(2); }
});
