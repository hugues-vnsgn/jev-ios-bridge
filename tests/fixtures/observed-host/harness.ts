import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile, readFile, realpath, mkdir, cp } from 'node:fs/promises';
import { existsSync, readFileSync, appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { errorMonitor, type EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import type { TestContext } from 'node:test';
import { Admission } from '../../../src/device/admission.js';
import { setupPublicFixture, fixtureCalls, actionRequest } from '../observed-cli-server.js';

import { type PublicObservation, parseCli, parseTool, allocation, rpcResponseSchema, fixtureEvents, traceOracle } from '../public-contention.js';
import { z } from 'zod/v4';
export { actionRequest, fixtureCalls };
const worker = fileURLToPath(new URL('./owner.ts', import.meta.url));
type LifecycleEvent = 'case-start' | 'fixture-ready' | 'request-start' | 'request-written' | 'request-write-failed'
  | 'owner-spawn-requested' | 'owner-spawn' | 'owner-spawn-failed' | 'output-complete' | 'owner-close'
  | 'receipt-persisted' | 'receipt-write-failed' | 'reply-parsed' | 'assertions-complete' | 'body-complete'
  | 'abort-observed' | 'teardown-start' | 'owner-kill' | 'archive-start' | 'archive-end' | 'teardown-end'
  | 'lifecycle-complete' | 'diagnostic-limit';
type RequestIdentity = { requestKind: 'action' | 'preparation'; requestId: string; ordinal: number; requestDigest: string };
function h0101Lifecycle(t: TestContext) {
  const directory = process.env.H0101_LIFECYCLE_DIR;
  if (!directory || t.name !== 'H01.01 cli strict action/preparation rejection leaves no calls or reservations') return undefined;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(mkdtempSync(join(directory, 'h0101-cli-')), 'lifecycle.jsonl');
  writeFileSync(path, '', { flag: 'wx', mode: 0o600 });
  const start = process.hrtime.bigint();
  let request: RequestIdentity | undefined;
  let ordinal = 0; let records = 0; let bytes = 0; let exhausted = false;
  let ownerPid: number | null = null;
  let killReason: 'owner-cap' | 'teardown' | null = null;
  let assertionStage = 'fixture';
  let phase = 'body';
  const digest = (value: string) => createHash('sha256').update(value).digest('hex');
  function event(event: LifecycleEvent, extra: { exitCode?: number | null; signal?: NodeJS.Signals | null; replyDigest?: string } = {}) {
    if (exhausted) throw new Error('H01.01 lifecycle diagnostic already exceeded its bound');
    const now = process.hrtime.bigint();
    const row = { caseId: 'H01.01', transport: 'cli', requestKind: request?.requestKind ?? null,
      requestId: request?.requestId ?? null, ordinal: request?.ordinal ?? null, requestDigest: request?.requestDigest ?? null,
      event, ownerPid, monotonicNs: String(now), elapsedMs: Number(now - start) / 1e6,
      caseDeadlineMs: 30000, ownerCapMs: 20000, exitCode: extra.exitCode ?? null, signal: extra.signal ?? null,
      killReason, replyDigest: extra.replyDigest ?? null, assertionStage, phase };
    const line = JSON.stringify(row) + '\n';
    if (records >= 1023 || bytes + Buffer.byteLength(line) > 1047552) {
      exhausted = true;
      appendFileSync(path, JSON.stringify({ ...row, event: 'diagnostic-limit' }) + '\n');
      throw new Error('H01.01 lifecycle diagnostic exceeded its 1024-record/1 MiB bound');
    }
    appendFileSync(path, line); records++; bytes += Buffer.byteLength(line);
    if (event === 'teardown-start' || event === 'archive-end') phase = 'teardown';
    if (event === 'archive-start') phase = 'archive';
    if (event === 'lifecycle-complete') { phase = 'complete'; t.signal.removeEventListener('abort', aborted); }
  }
  event('case-start');
  function aborted() { event('abort-observed'); }
  t.signal.addEventListener('abort', aborted, { once: true });
  return { event,
    request(kind: RequestIdentity['requestKind'], id: string, value: unknown) {
      request = { requestKind: kind, requestId: id, ordinal: ++ordinal, requestDigest: digest(JSON.stringify(value)) };
      ownerPid = null; killReason = null; assertionStage = 'request'; event('request-start');
    },
    spawn(pid: number | undefined) { ownerPid = pid ?? null; event('owner-spawn'); },
    kill(reason: 'owner-cap' | 'teardown') { killReason = reason; event('owner-kill'); },
    reply(value: unknown) { assertionStage = 'assertions'; event('reply-parsed', { replyDigest: digest(JSON.stringify(value)) }); },
    assertionsComplete() { event('assertions-complete'); assertionStage = 'between-requests'; },
    bodyComplete() { assertionStage = 'body-complete'; event('body-complete'); },
  };
}
export async function hostFixture(t: TestContext) {
  const lifecycle = h0101Lifecycle(t);
  const root = await realpath(await mkdtemp(join(tmpdir(), 'jev-host-fault-')));
  await writeFile(join(root, 'test-context.json'), JSON.stringify({ name: t.name }), { mode: 0o600 });
  const fixture = await setupPublicFixture(root);
  lifecycle?.event('fixture-ready');
  type Exit = { code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string };
  const allProtocolErrors: string[] = [];
  const children = new Map<ChildProcess, { transport: 'cli' | 'mcp'; exited: Promise<Exit> }>();
  let commandSequence = 0;
  let partialSequence = 0;
  t.after(async () => {
    lifecycle?.event('teardown-start');
    for (const [child, { exited }] of children) {
      if (child.exitCode === null && child.signalCode === null) { lifecycle?.kill('teardown'); child.kill('SIGKILL'); }
      await exited;
    }
    const traceErrors: string[] = [];
    for (const name of ['milestones.jsonl', 'calls.jsonl', 'mcp-requests.jsonl', 'public-waits.jsonl']) {
      const path = join(root, name); if (!existsSync(path)) continue;
      const raw = readFileSync(path, 'utf8');
      if (raw && !raw.endsWith('\n')) traceErrors.push(`${name}: incomplete final record after all owners exited`);
      for (const line of raw.split('\n').slice(0, -1)) {
        try { JSON.parse(line); } catch { traceErrors.push(`${name}: malformed complete final record`); }
      }
    }
    lifecycle?.event('archive-start');
    if (process.env.HOST_EVIDENCE_DIR) {
      const archive = join(process.env.HOST_EVIDENCE_DIR, basename(root)); await mkdir(archive, { recursive: true, mode: 0o700 });
      await cp(root, join(archive, 'public'), { recursive: true }); await cp(fixture.root, join(archive, 'backend'), { recursive: true });
    }
    lifecycle?.event('archive-end');
    await fixture.cleanup(); await rm(root, { recursive: true, force: true });
    lifecycle?.event('teardown-end');
    assert.deepEqual(traceErrors, [], 'Final traces must be complete before effect counts are certified');
    lifecycle?.event('lifecycle-complete');
  });
  const observations: PublicObservation[] = [];
  const admission = () => Admission.forTesting({ root: fixture.store, backend: 'fake', initialize: false });
  async function requestFile(value: unknown, name = 'request.json') {
    const path = join(root, name);
    try { await writeFile(path, JSON.stringify(value)); } catch (error) { lifecycle?.event('request-write-failed'); throw error; }
    lifecycle?.event('request-written'); return path;
  }
  function spawnOwner(transport: 'cli' | 'mcp', command = '', argument = '', options: { gate?: string; mode?: string; fault?: string; enabled?: string; cwd?: string; waitMs?: number; projectDir?: string } = {}) {
    const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, NODE_NO_WARNINGS: '1', JEV_EXPERIMENTAL_OBSERVED: options.enabled ?? '1', HOST_PROJECT_DIR: options.projectDir ?? root };
    delete env.TYPESAFE_API_KEY;
    if (options.waitMs !== undefined) env.HOST_WAIT_MS = String(options.waitMs);
    lifecycle?.event('owner-spawn-requested');
    let child: ChildProcess & Pick<EventEmitter, 'once'>;
    try { child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), worker, root, transport, command, argument, options.gate ?? '', options.mode ?? 'observed', options.fault ?? ''], {
      cwd: options.cwd ?? process.cwd(), env, stdio: ['pipe', 'pipe', 'pipe'],
    }); } catch (error) { lifecycle?.event('owner-spawn-failed'); throw error; }
    if (lifecycle) {
      child.once('spawn', () => lifecycle.spawn(child.pid));
      child.once(errorMonitor, () => lifecycle.event('owner-spawn-failed'));
      let streams = 0;
      const ended = () => { if (++streams === 2) lifecycle.event('output-complete'); };
      child.stdout!.once('end', ended); child.stderr!.once('end', ended);
    }
    const sequence = ++commandSequence;
    let stdout = ''; let stderr = '';
    child.stdout!.on('data', data => { stdout += data; }); child.stderr!.on('data', data => { stderr += data; });
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }>(done => child.once('close', (code, signal) => {
      lifecycle?.event('owner-close', { exitCode: code, signal });
      const result = { code, signal, stdout, stderr };
      void writeFile(join(root, `command-${sequence}.json`), JSON.stringify({ transport, command, argument, options, pid: child.pid, ...result }), { mode: 0o600 }).then(() => { lifecycle?.event('receipt-persisted', { exitCode: code, signal }); done(result); }, error => { lifecycle?.event('receipt-write-failed'); throw error; });
    }));
    children.set(child, { transport, exited });
    const cap = setTimeout(() => { lifecycle?.kill('owner-cap'); child.kill('SIGKILL'); }, 20000); void exited.finally(() => clearTimeout(cap));
    return { child, exited };
  }
  async function cli(command: string, argument: string, options: Parameters<typeof spawnOwner>[3] = {}) {
    const result = await spawnOwner('cli', command, argument, options).exited;
    const reply = parseCli(result);
    lifecycle?.reply(reply);
    let input: unknown = command === 'observed-report' ? { actionId: argument } : { allocationId: argument };
    if (command === 'observed-allocate' || command === 'observed-action') { try { input = JSON.parse(await readFile(argument, 'utf8')); } catch { input = null; } }
    observations.push({ operation: command, argument: input, reply });
    return { ...result, reply };
  }
  async function mcp(options: Parameters<typeof spawnOwner>[3] = {}) {
    const owner = spawnOwner('mcp', '', '', options);
    let next = 0;
    const pending = new Map<number, { done: (value: z.infer<typeof rpcResponseSchema>) => void; fail: (error: Error) => void }>();
    const protocolErrors: string[] = [];
    const lines = createInterface({ input: owner.child.stdout! });
    lines.on('line', line => { try { const response = rpcResponseSchema.parse(JSON.parse(line)); const p = pending.get(response.id); assert.ok(p, 'Unmatched or duplicate RPC response'); pending.delete(response.id); p.done(response); } catch (error) { protocolErrors.push(String(error)); allProtocolErrors.push(String(error)); for (const p of pending.values()) p.fail(new Error(String(error))); pending.clear(); } });
    owner.child.on('exit', () => { for (const p of pending.values()) p.fail(new Error('Owner exited')); pending.clear(); lines.close(); });
    const rpc = (method: string, params: object = {}) => {
      const id = ++next;
      const message = JSON.stringify({ jsonrpc: '2.0', id, method, params });
      appendFileSync(join(root, 'mcp-requests.jsonl'), JSON.stringify({ pid: owner.child.pid, message: JSON.parse(message) }) + '\n', { mode: 0o600 });
      const result = new Promise<z.infer<typeof rpcResponseSchema>>((done, fail) => { pending.set(id, { done, fail }); owner.child.stdin!.write(message + '\n'); });
      return { id, result };
    };
    const initialized = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'host-fault', version: '1' } }).result;
    assert.equal(z.object({ serverInfo: z.object({ name: z.literal('jev-ios-bridge') }) }).parse(initialized.result).serverInfo.name, 'jev-ios-bridge');
    owner.child.stdin!.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const begin = (name: string, args: object) => rpc('tools/call', { name, arguments: args }).result.then(response => {
      assert.equal(response.error, undefined); assert.ok(response.result, JSON.stringify(response)); const result = parseTool(response.result); observations.push({ operation: name, argument: args, reply: result.reply }); return result;
    });
    return { ...owner, rpc, begin, call: begin, async close() { owner.child.stdin!.end(); const result = await owner.exited; assert.equal(result.code, 0, result.stderr); assert.equal(result.signal, null); assert.deepEqual(protocolErrors, []); return result; } };
  }
  async function prepare() {
    const path = await requestFile(fixture.request('one'), 'prepare.json');
    const result = await cli('observed-allocate', path); assert.equal(result.code, 0, result.stdout + result.stderr); assert.equal(allocation(result.reply).state, 'ready');
    return allocation(result.reply);
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
  return { ...fixture, root, admission, observations, lifecycle, requestFile, spawnOwner, cli, mcp, prepare, milestone,
    calls: () => fixtureCalls(root).filter(op => op !== 'open'),
    async closeOwners() {
      for (const [child, owner] of children) if (owner.transport === 'mcp' && child.exitCode === null && child.signalCode === null) child.stdin!.end();
      const receipts = await Promise.all([...children].map(async ([child, owner]) => { const receipt = await owner.exited; assert.equal(receipt.signal, null, receipt.stderr); if (owner.transport === 'mcp') assert.equal(receipt.code, 0, receipt.stderr); else parseCli(receipt); return { actor: child.pid!, transport: owner.transport, ...receipt }; }));
      assert.deepEqual(allProtocolErrors, []); const events = fixtureEvents(root); traceOracle({ events, actors: receipts.map(r => r.actor) }); return { receipts, events };
    },
    release: () => writeFile(join(root, 'release'), ''),
    async database() { return readFile(join(fixture.store, 'admission.sqlite')); },
  };
}
