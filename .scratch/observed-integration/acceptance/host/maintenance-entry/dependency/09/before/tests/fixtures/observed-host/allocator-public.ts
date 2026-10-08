import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { join, basename } from 'node:path';
import { writeFile, appendFile, mkdir, cp } from 'node:fs/promises';
import { runCli } from '../../../src/cli.js';
import { createMcpServer } from '../../../src/mcp/index.js';
import { BridgeService } from '../../../src/service.js';
import { ObservedAllocator } from '../../../src/observed/allocation.js';
import { ObservedActionService } from '../../../src/observed/service.js';
import { createObservedComposition } from '../../../src/observed/cli.js';
import { allocationFixture } from '../observed-allocation-backend.js';
import type { CliRunner } from '../../../src/device/index.js';
import type { SourceProcess } from '../../../src/observed/create-source.js';

export async function allocatorPublic(t: TestContext, options: Parameters<typeof allocationFixture>[0] = {}) {
  const f = await allocationFixture(options);
  t.after(async () => {
    if (process.env.HOST_EVIDENCE_DIR) {
      const archive = join(process.env.HOST_EVIDENCE_DIR, basename(f.root)); await mkdir(archive, { recursive: true, mode: 0o700 });
      await writeFile(join(f.root, 'backend-calls.json'), JSON.stringify(f.calls), { mode: 0o600 }); await cp(f.root, join(archive, 'backend'), { recursive: true });
    }
    await f.cleanup();
  });
  async function record(transport: string, command: string, input: object | string, result: object) {
    await appendFile(join(f.root, 'public-commands.jsonl'), JSON.stringify({ transport, command, input, result, backendCalls: [...f.calls] }) + '\n', { mode: 0o600 });
  }
  const runner: CliRunner = async (args, signal) => {
    await appendFile(join(f.root, 'raw-backends.jsonl'), JSON.stringify({ kind: 'runner', args, aborted: signal.aborted }) + '\n', { mode: 0o600 });
    return f.runner(args, signal);
  };
  const source: SourceProcess = async (executable, args, options) => {
    await appendFile(join(f.root, 'raw-backends.jsonl'), JSON.stringify({ kind: 'source', executable, args, timeoutMs: options.timeoutMs, maxOutputBytes: options.maxOutputBytes, shell: options.shell, aborted: options.signal.aborted }) + '\n', { mode: 0o600 });
    return f.source(executable, args, options);
  };
  const make = () => {
    const allocator = new ObservedAllocator({ admission: f.admission, runsDir: f.runsDir,
      fakeBackend: { process: source, runner, window: f.window, host: f.host } });
    const service = new ObservedActionService({ admission: f.admission, allocator, runsDir: f.runsDir,
      bridgeVersion: 'host-fixture', backend: 'fake', enabled: true, createDriver: () => assert.fail('No action driver in allocator-only proofs') });
    return createObservedComposition({ enabled: true, create: () => service });
  };
  async function cli(command: string, input: object | string) {
    const path = typeof input === 'string' ? input : join(f.root, 'public-request.json');
    if (typeof input !== 'string') await writeFile(path, JSON.stringify(input));
    const original = process.stdout.write; const oldExit = process.exitCode; let stdout = '';
    process.stdout.write = ((chunk: string | Uint8Array, ...args: unknown[]) => {
      stdout += chunk.toString(); const callback = args.find(value => typeof value === 'function') as (() => void) | undefined; callback?.(); return true;
    }) as typeof process.stdout.write;
    try {
      await runCli([command, path, '--json'], { observed: make(), projectDir: f.root });
      assert.equal(stdout.trim().split('\n').length, 1); const result = { reply: JSON.parse(stdout), code: process.exitCode };
      await record('cli', command, input, result); return result;
    } finally { process.stdout.write = original; process.exitCode = oldExit; }
  }
  async function mcp() {
    const module = make(); const legacy = new BridgeService({ baseDir: f.root, createJudge: () => assert.fail('No SDK'), createDriver: () => assert.fail('No legacy driver') });
    const server = createMcpServer(legacy, { observed: module }); let next = 0;
    const pending = new Map<number, (value: any) => void>();
    const transport: Parameters<typeof server.connect>[0] = {
      async start() {}, async close() {},
      async send(message) { if ('id' in message) { pending.get(Number(message.id))?.(message); pending.delete(Number(message.id)); } },
    };
    await server.connect(transport);
    const rpc = (method: string, params: object = {}) => {
      const id = ++next; const result = new Promise<any>(done => pending.set(id, done));
      transport.onmessage!({ jsonrpc: '2.0', id, method, params }); return result;
    };
    await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'fault-fixture', version: '1' } });
    transport.onmessage!({ jsonrpc: '2.0', method: 'notifications/initialized' });
    return { async call(name: string, args: object) {
      const value = await rpc('tools/call', { name, arguments: args }); assert.ok(value.result, JSON.stringify(value)); assert.equal(value.result.content.length, 2);
      const result = { reply: JSON.parse(value.result.content[1].text), isError: value.result.isError };
      await record('mcp', name, args, result); return result;
    }, async close() { await module.close(); await server.close(); } };
  }
  return { ...f, cli, mcp };
}
