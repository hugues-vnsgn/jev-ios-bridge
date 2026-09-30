/**
 * A started, initialized MCP session over stdio. Call close() in a finally block: it lets the server
 * finish its runs and exit, then deletes any temporary folder this session made.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

export interface McpSession {
  /** Calls a tool and resolves with the JSON-RPC result. */
  callTool(name: string, args: object): Promise<any>;
  /** Lists the server's tools (name, description, inputSchema, ...), as `tools/list` returns them. */
  listTools(): Promise<any[]>;
  close(): Promise<void>;
}

export interface McpSessionOptions {
  /**
   * Which server to start. `'fixture'` (the default) runs tests/fixtures/mcp-server.ts in its own
   * temporary run folder. `'cli'` runs the real `src/cli.ts mcp`, inheriting the test process's working
   * directory, for checks that need the bridge's actual tool descriptions and driver wiring.
   */
  entryPoint?: 'fixture' | 'cli';
  /** Environment overrides, merged over process.env. Only meaningful with entryPoint: 'cli'. */
  env?: NodeJS.ProcessEnv;
}

export async function openMcpSession(clientName: string, options: McpSessionOptions = {}): Promise<McpSession> {
  const cli = options.entryPoint === 'cli';
  const root = cli ? undefined : await mkdtemp(join(tmpdir(), `jev-mcp-${clientName}-`));
  const child = cli
    ? spawn(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'mcp'],
        { env: { ...process.env, ...options.env }, stdio: ['pipe', 'pipe', 'pipe'] })
    : spawn(process.execPath, ['--import', 'tsx', 'tests/fixtures/mcp-server.ts', root!],
        { stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map<number, (value: any) => void>();
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => { const value = JSON.parse(line); pending.get(value.id)?.(value); pending.delete(value.id); });
  let nextId = 1;
  const request = (method: string, params: object) => new Promise<any>(done => {
    const id = nextId++;
    pending.set(id, done);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  const close = async () => {
    const exited = child.exitCode !== null ? Promise.resolve() : new Promise<void>(done => child.once('exit', () => done()));
    child.stdin.end();
    lines.close();
    const timer = setTimeout(() => child.kill('SIGTERM'), 5_000);
    await exited;
    clearTimeout(timer);
    if (root) await rm(root, { recursive: true, force: true });
  };
  try {
    await request('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: clientName, version: '1' } });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  } catch (error) { await close(); throw error; }
  return {
    async callTool(name, args) { return (await request('tools/call', { name, arguments: args })).result; },
    async listTools() { return (await request('tools/list', {})).result.tools; },
    close,
  };
}
