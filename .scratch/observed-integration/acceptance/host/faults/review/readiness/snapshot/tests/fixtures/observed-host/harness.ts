import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile, readFile, realpath, mkdir, cp } from 'node:fs/promises';
import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import type { TestContext } from 'node:test';
import { Admission } from '../../../src/device/admission.js';
import { setupPublicFixture, fixtureCalls, actionRequest } from '../observed-cli-server.js';

export { actionRequest, fixtureCalls };
const worker = fileURLToPath(new URL('./owner.ts', import.meta.url));
export async function hostFixture(t: TestContext) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'jev-host-fault-')));
  await writeFile(join(root, 'test-context.json'), JSON.stringify({ name: t.name }), { mode: 0o600 });
  const fixture = await setupPublicFixture(root);
  const children = new Map<ChildProcess, Promise<unknown>>();
  let commandSequence = 0;
  let partialSequence = 0;
  t.after(async () => {
    for (const [child, exited] of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await exited;
    }
    const traceErrors: string[] = [];
    for (const name of ['milestones.jsonl', 'calls.jsonl', 'mcp-requests.jsonl']) {
      const path = join(root, name); if (!existsSync(path)) continue;
      const raw = readFileSync(path, 'utf8');
      if (raw && !raw.endsWith('\n')) traceErrors.push(`${name}: incomplete final record after all owners exited`);
      for (const line of raw.split('\n').slice(0, -1)) {
        try { JSON.parse(line); } catch { traceErrors.push(`${name}: malformed complete final record`); }
      }
    }
    if (process.env.HOST_EVIDENCE_DIR) {
      const archive = join(process.env.HOST_EVIDENCE_DIR, basename(root)); await mkdir(archive, { recursive: true, mode: 0o700 });
      await cp(root, join(archive, 'public'), { recursive: true }); await cp(fixture.root, join(archive, 'backend'), { recursive: true });
    }
    await fixture.cleanup(); await rm(root, { recursive: true, force: true });
    assert.deepEqual(traceErrors, [], 'Final traces must be complete before effect counts are certified');
  });
  const admission = () => Admission.forTesting({ root: fixture.store, backend: 'fake', initialize: false });
  async function requestFile(value: unknown, name = 'request.json') { const path = join(root, name); await writeFile(path, JSON.stringify(value)); return path; }
  function spawnOwner(transport: 'cli' | 'mcp', command = '', argument = '', options: { gate?: string; mode?: string; fault?: string; enabled?: string; cwd?: string; waitMs?: number; projectDir?: string } = {}) {
    const env: NodeJS.ProcessEnv = { ...process.env, JEV_EXPERIMENTAL_OBSERVED: options.enabled ?? '1', HOST_PROJECT_DIR: options.projectDir ?? root };
    delete env.TYPESAFE_API_KEY;
    if (options.waitMs !== undefined) env.HOST_WAIT_MS = String(options.waitMs);
    const child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), worker, root, transport, command, argument, options.gate ?? '', options.mode ?? 'observed', options.fault ?? ''], {
      cwd: options.cwd ?? process.cwd(), env, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const sequence = ++commandSequence;
    let stdout = ''; let stderr = '';
    child.stdout!.on('data', data => { stdout += data; }); child.stderr!.on('data', data => { stderr += data; });
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }>(done => child.once('close', (code, signal) => {
      const result = { code, signal, stdout, stderr };
      void writeFile(join(root, `command-${sequence}.json`), JSON.stringify({ transport, command, argument, options, pid: child.pid, ...result }), { mode: 0o600 }).then(() => done(result));
    }));
    children.set(child, exited);
    return { child, exited };
  }
  async function cli(command: string, argument: string, options: Parameters<typeof spawnOwner>[3] = {}) {
    const result = await spawnOwner('cli', command, argument, options).exited;
    assert.equal(result.signal, null, result.stderr);
    assert.equal(result.stdout.trim().split('\n').length, 1, result.stdout + result.stderr);
    return { ...result, reply: JSON.parse(result.stdout) };
  }
  async function mcp(options: Parameters<typeof spawnOwner>[3] = {}) {
    const owner = spawnOwner('mcp', '', '', options);
    let next = 0;
    const pending = new Map<number, { done: (value: any) => void; fail: (error: Error) => void }>();
    const lines = createInterface({ input: owner.child.stdout! });
    lines.on('line', line => { const response = JSON.parse(line); pending.get(response.id)?.done(response); pending.delete(response.id); });
    owner.child.on('exit', () => { for (const p of pending.values()) p.fail(new Error('Owner exited')); pending.clear(); lines.close(); });
    const rpc = (method: string, params: object = {}) => {
      const id = ++next;
      const message = JSON.stringify({ jsonrpc: '2.0', id, method, params });
      appendFileSync(join(root, 'mcp-requests.jsonl'), JSON.stringify({ pid: owner.child.pid, message: JSON.parse(message) }) + '\n', { mode: 0o600 });
      const result = new Promise<any>((done, fail) => { pending.set(id, { done, fail }); owner.child.stdin!.write(message + '\n'); });
      return { id, result };
    };
    const initialized = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'host-fault', version: '1' } }).result;
    assert.equal(initialized.result.serverInfo.name, 'jev-ios-bridge');
    owner.child.stdin!.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const begin = (name: string, args: object) => rpc('tools/call', { name, arguments: args }).result.then(response => {
      assert.ok(response.result, JSON.stringify(response)); const result = response.result;
      assert.equal(result.content.length, 2); assert.equal(result.content[0].type, 'text'); assert.equal(result.content[1].type, 'text');
      return { reply: JSON.parse(result.content[1].text), isError: result.isError };
    });
    return { ...owner, rpc, begin, call: begin, async close() { owner.child.stdin!.end(); return owner.exited; } };
  }
  async function prepare() {
    const path = await requestFile(fixture.request('one'), 'prepare.json');
    const result = await cli('observed-allocate', path); assert.equal(result.code, 0, result.stdout + result.stderr); assert.equal(result.reply.state, 'ready');
    return result.reply;
  }
  async function milestone(key: string, pid?: number) {
    const end = Date.now() + 7000;
    while (true) {
      if (existsSync(join(root, 'milestones.jsonl'))) {
        // A concurrent append may be visible before its trailing newline. Only
        // complete records are milestone evidence; retry the unfinished tail.
        const raw = readFileSync(join(root, 'milestones.jsonl'), 'utf8');
        if (raw && !raw.endsWith('\n')) await writeFile(join(root, `partial-milestones-${++partialSequence}.txt`), raw, { mode: 0o600 });
        const events = raw.split('\n').slice(0, -1).map(line => JSON.parse(line));
        if (events.some(event => event.key === key && (pid === undefined || event.pid === pid))) return;
      }
      assert.ok(Date.now() < end, `Fixture setup: milestone ${key} not reached`); await new Promise(done => setTimeout(done, 10));
    }
  }
  return { ...fixture, root, admission, requestFile, spawnOwner, cli, mcp, prepare, milestone,
    calls: () => fixtureCalls(root).filter(op => op !== 'open'),
    release: () => writeFile(join(root, 'release'), ''),
    async database() { return readFile(join(fixture.store, 'admission.sqlite')); },
  };
}
