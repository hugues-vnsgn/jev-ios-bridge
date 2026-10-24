import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile, readFile, realpath, mkdir, cp, lstat, chmod, readdir } from 'node:fs/promises';
import { existsSync, readFileSync, appendFileSync } from 'node:fs';
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
type HostOwnerOptions = { gate?: string; mode?: string; fault?: string; enabled?: string; cwd?: string; waitMs?: number; projectDir?: string };
/** Which observed composition the owners run: the legacy fake MobileBuildMCP backend, or the Appium drivers over a world host. */
export type HostComposition = 'legacy' | 'appium';
function launchHostOwner({ root, transport, command, argument, options, composition = 'legacy' }: { root: string; transport: 'cli' | 'mcp'; command: string; argument: string; options: HostOwnerOptions; composition?: HostComposition }) {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, NODE_NO_WARNINGS: '1', JEV_EXPERIMENTAL_OBSERVED: options.enabled ?? '1', HOST_PROJECT_DIR: options.projectDir ?? root,
    ...(composition === 'appium' ? { HOST_COMPOSITION: 'appium' } : {}) };
  delete env.TYPESAFE_API_KEY;
  if (options.waitMs !== undefined) env.HOST_WAIT_MS = String(options.waitMs);
  return spawn(process.execPath, ['--import', import.meta.resolve('tsx'), worker, root, transport, command, argument, options.gate ?? '', options.mode ?? 'observed', options.fault ?? ''], {
    cwd: options.cwd ?? process.cwd(), env, stdio: ['pipe', 'pipe', 'pipe'],
  });
}
function finalTraceErrors({ root, guard = () => {} }: { root: string; guard?: () => void }) {
  const traceErrors: string[] = [];
  for (const name of ['milestones.jsonl', 'calls.jsonl', 'mcp-requests.jsonl', 'public-waits.jsonl']) {
    guard(); const path = join(root, name); if (!existsSync(path)) continue;
    const raw = readFileSync(path, 'utf8');
    if (raw && !raw.endsWith('\n')) traceErrors.push(`${name}: incomplete final record after all owners exited`);
    for (const line of raw.split('\n').slice(0, -1)) {
      try { JSON.parse(line); } catch { traceErrors.push(`${name}: malformed complete final record`); }
    }
  }
  return traceErrors;
}
export async function hostFixture(t: TestContext, composition: HostComposition = 'legacy') {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'jev-host-fault-')));
  await writeFile(join(root, 'test-context.json'), JSON.stringify({ name: t.name }), { mode: 0o600 });
  const fixture = await setupPublicFixture(root);
  type Exit = { code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string };
  const allProtocolErrors: string[] = [];
  const children = new Map<ChildProcess, { transport: 'cli' | 'mcp'; exited: Promise<Exit> }>();
  let commandSequence = 0;
  let partialSequence = 0;
  t.after(async () => {
    for (const [child, { exited }] of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await exited;
    }
    const traceErrors = finalTraceErrors({ root });
    if (process.env.HOST_EVIDENCE_DIR) {
      const archive = join(process.env.HOST_EVIDENCE_DIR, basename(root)); await mkdir(archive, { recursive: true, mode: 0o700 });
      await cp(root, join(archive, 'public'), { recursive: true }); await cp(fixture.root, join(archive, 'backend'), { recursive: true });
    }
    await fixture.cleanup(); await rm(root, { recursive: true, force: true });
    assert.deepEqual(traceErrors, [], 'Final traces must be complete before effect counts are certified');
  }, { timeout: 30000 });
  const observations: PublicObservation[] = [];
  const admission = () => Admission.forTesting({ root: fixture.store, backend: 'fake', initialize: false });
  async function requestFile(value: unknown, name = 'request.json') { const path = join(root, name); await writeFile(path, JSON.stringify(value)); return path; }
  function spawnOwner(transport: 'cli' | 'mcp', command = '', argument = '', options: HostOwnerOptions = {}) {
    const child = launchHostOwner({ root, transport, command, argument, options, composition });
    const sequence = ++commandSequence;
    let stdout = ''; let stderr = '';
    child.stdout!.on('data', data => { stdout += data; }); child.stderr!.on('data', data => { stderr += data; });
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }>(done => child.once('close', (code, signal) => {
      const result = { code, signal, stdout, stderr };
      void writeFile(join(root, `command-${sequence}.json`), JSON.stringify({ transport, command, argument, options, pid: child.pid, ...result }), { mode: 0o600 }).then(() => done(result));
    }));
    children.set(child, { transport, exited });
    const cap = setTimeout(() => child.kill('SIGKILL'), 20000); void exited.finally(() => clearTimeout(cap));
    return { child, exited };
  }
  async function cli(command: string, argument: string, options: Parameters<typeof spawnOwner>[3] = {}) {
    const result = await spawnOwner('cli', command, argument, options).exited;
    const reply = parseCli(result);
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
  return { ...fixture, root, admission, observations, requestFile, spawnOwner, cli, mcp, prepare, milestone,
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

type HostFixture = Awaited<ReturnType<typeof hostFixture>>;
type H01Facts = {
  response: Awaited<ReturnType<HostFixture['cli']>>;
  calls: ReturnType<HostFixture['calls']>;
  allocationForOne: ReturnType<Admission['readAllocationForAction']>;
  capacity: ReturnType<Admission['readAllocationCapacity']>;
  database: Buffer;
};
export type H01CliFixture = {
  request: HostFixture['request'];
  readonly pristine: Buffer;
  test(input: { name: string; command: 'observed-action' | 'observed-allocate'; request: unknown; verify: (facts: H01Facts) => undefined }): Promise<void>;
};
type H01Exit = Awaited<ReturnType<HostFixture['spawnOwner']>['exited']>;
type H01Receipt = { kind: 'persisted'; exit: H01Exit } | { kind: 'failed'; error: unknown };
type H01Owner = {
  child: ReturnType<typeof launchHostOwner>;
  closure: { kind: 'running' } | { kind: 'closed'; exit: H01Exit };
  closed: Promise<H01Exit>;
  receipt: Promise<H01Receipt>;
};
type H01Sequence =
  | { kind: 'setup' }
  | { kind: 'ready' }
  | { kind: 'request'; budget: ReturnType<typeof h01Budget> }
  | { kind: 'stopped'; reason: unknown }
  | { kind: 'complete' };

function h01Budget({ label, stop }: { label: string; stop: (reason: Error) => void }) {
  const controller = new AbortController();
  const deadline = performance.now() + 30000;
  const expired = new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true }));
  void expired.catch(() => {});
  function expire() { const reason = new Error(`H01 ${label} deadline elapsed`); controller.abort(reason); stop(reason); }
  const timer = setTimeout(expire, 30000);
  return {
    expired,
    guard() { if (performance.now() >= deadline && !controller.signal.aborted) expire(); controller.signal.throwIfAborted(); },
    abort(reason: unknown) { controller.abort(reason); },
    dispose() { clearTimeout(timer); },
  };
}

export async function withH01CliFixture({ context, requestCount }: { context: TestContext; requestCount: number }, body: (fixture: H01CliFixture) => Promise<void>) {
  let sequence: H01Sequence = { kind: 'setup' };
  let completed = 0;
  const roots: string[] = [];
  const owners: H01Owner[] = [];
  const callbacks: Promise<void>[] = [];
  let setup: Promise<{ root: string; fixture: Awaited<ReturnType<typeof setupPublicFixture>>; pristine: Buffer }> | undefined;
  let finalizer: Promise<void> | undefined;
  function stop(reason: unknown) {
    if (sequence.kind === 'stopped' || sequence.kind === 'complete') return;
    const previous = sequence;
    sequence = { kind: 'stopped', reason };
    if (previous.kind === 'request') previous.budget.abort(reason);
    if (previous.kind === 'setup') setupBudget.abort(reason);
    for (const owner of owners) if (owner.closure.kind === 'running') owner.child.kill('SIGKILL');
  }
  const setupBudget = h01Budget({ label: 'setup', stop });
  const parentAbort = () => stop(context.signal.reason);
  context.signal.addEventListener('abort', parentAbort, { once: true });
  function setupGuard() { setupBudget.guard(); context.signal.throwIfAborted(); if (sequence.kind !== 'setup') throw new Error('H01 setup is sealed'); }
  function finish() {
    if (finalizer) return finalizer;
    stop(new Error('H01 finalization sealed the request sequence'));
    const cleanupBudget = h01Budget({ label: 'cleanup', stop: () => {} });
    const guard = () => cleanupBudget.guard();
    async function writable(path: string): Promise<void> {
      guard(); const value = await lstat(path); guard();
      if (!value.isDirectory() || value.isSymbolicLink()) return;
      await chmod(path, 0o700); guard();
      const names = await readdir(path); guard();
      for (const name of names) { guard(); await writable(join(path, name)); guard(); }
    }
    const cleanup = (async () => {
      guard();
      const acquired = await setup; guard();
      await Promise.allSettled(callbacks); guard();
      for (const owner of owners) {
        guard(); await owner.closed; guard();
        const receipt = await owner.receipt; guard();
        if (receipt.kind === 'failed') throw receipt.error;
      }
      if (!acquired) throw new Error('H01 setup did not return its owned fixture');
      const { root, fixture } = acquired;
      assert.deepEqual(finalTraceErrors({ root, guard }), [], 'Final traces must be complete before effect counts are certified');
      guard();
      if (process.env.HOST_EVIDENCE_DIR) {
        const archive = join(process.env.HOST_EVIDENCE_DIR, basename(root));
        await mkdir(archive, { recursive: true, mode: 0o700 }); guard();
        await cp(root, join(archive, 'public'), { recursive: true }); guard();
        await cp(fixture.root, join(archive, 'backend'), { recursive: true }); guard();
      }
      for (const root of roots) {
        guard(); await writable(root); guard();
        await rm(root, { recursive: true, force: true }); guard();
      }
    })();
    finalizer = Promise.race([cleanup, cleanupBudget.expired]).then(() => {
      guard(); sequence = { kind: 'complete' };
    }, error => {
      sequence = { kind: 'stopped', reason: error };
      context.diagnostic(`H01 cleanup failed; owned roots retained where present: ${JSON.stringify(roots)}; ${String(error)}`);
      throw error;
    }).finally(() => { cleanupBudget.dispose(); setupBudget.dispose(); context.signal.removeEventListener('abort', parentAbort); });
    return finalizer;
  }
  context.after(finish, { timeout: 30000 });
  setup = (async () => {
    setupGuard();
    const rawRoot = await mkdtemp(join(tmpdir(), 'jev-host-fault-')).then(path => { roots.push(path); return path; }); setupGuard();
    const root = await realpath(rawRoot); setupGuard();
    await writeFile(join(root, 'test-context.json'), JSON.stringify({ name: context.name }), { mode: 0o600 }); setupGuard();
    const rawBackend = await mkdtemp(join(tmpdir(), 'observed-allocator-')).then(path => { roots.push(path); return path; }); setupGuard();
    const backendRoot = await realpath(rawBackend); setupGuard();
    const fixture = await setupPublicFixture(root, { backendRoot }); setupGuard();
    const pristine = await readFile(join(fixture.store, 'admission.sqlite')); setupGuard();
    return { root, fixture, pristine };
  })();
  try {
    const { root, fixture, pristine } = await Promise.race([setup, setupBudget.expired]);
    setupGuard(); setupBudget.dispose(); sequence = { kind: 'ready' };
    await body({
      request: fixture.request,
      get pristine() { return Buffer.from(pristine); },
      async test({ name, command, request, verify }) {
        if (sequence.kind !== 'ready') throw new Error('H01 request sequence is sealed or busy');
        const budget = h01Budget({ label: name, stop });
        sequence = { kind: 'request', budget };
        function guard() {
          budget.guard(); context.signal.throwIfAborted();
          if (sequence.kind !== 'request' || sequence.budget !== budget) throw new Error('H01 request no longer owns the fixture');
        }
        let terminalReached = () => {};
        const terminal = new Promise<void>(resolve => { terminalReached = resolve; });
        const completion: { current: { kind: 'scheduled' } | { kind: 'running'; context: TestContext } | { kind: 'asserted'; context: TestContext } } = { current: { kind: 'scheduled' } };
        try {
          guard();
          await context.test(name, { timeout: 30000 }, childContext => {
            completion.current = { kind: 'running', context: childContext };
            childContext.signal.addEventListener('abort', terminalReached, { once: true });
            if (childContext.signal.aborted) terminalReached();
            const abort = () => stop(childContext.signal.reason);
            childContext.signal.addEventListener('abort', abort, { once: true });
            const work = (async () => {
              try {
                guard(); childContext.signal.throwIfAborted();
                const argument = join(root, 'request.json');
                await writeFile(argument, JSON.stringify(request)); guard();
                const child = launchHostOwner({ root, transport: 'cli', command, argument, options: {} });
                let stdout = ''; let stderr = ''; let spawnError: Error | undefined;
                child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
                child.once('error', error => { spawnError = error; stop(error); });
                const cap = setTimeout(() => child.kill('SIGKILL'), 20000);
                const closed = new Promise<H01Exit>(resolve => child.once('close', (code, signal) => {
                  clearTimeout(cap);
                  const exit = { code, signal, stdout, stderr };
                  owner.closure = { kind: 'closed', exit }; resolve(exit);
                }));
                const ordinal = owners.length + 1;
                const receipt = closed.then(async (exit): Promise<H01Receipt> => {
                  try {
                    await writeFile(join(root, `command-${ordinal}.json`), JSON.stringify({ transport: 'cli', command, argument, options: {}, pid: child.pid, ...exit }), { mode: 0o600 });
                    return { kind: 'persisted', exit };
                  } catch (error) { stop(error); return { kind: 'failed', error }; }
                });
                const owner: H01Owner = { child, closure: { kind: 'running' }, closed, receipt };
                owners.push(owner);
                const exit = await closed; guard();
                const persisted = await receipt; guard();
                if (persisted.kind === 'failed') throw persisted.error;
                if (spawnError) throw spawnError;
                assert.equal(exit.code, 3, exit.stderr); assert.equal(exit.signal, null, exit.stderr);
                const reply = parseCli(exit); guard();
                const calls = fixtureCalls(root).filter(op => op !== 'open'); guard();
                const allocationForOne = Admission.forTesting({ root: fixture.store, backend: 'fake', initialize: false }).readAllocationForAction('one'); guard();
                const capacity = Admission.forTesting({ root: fixture.store, backend: 'fake', initialize: false }).readAllocationCapacity(); guard();
                const database = await readFile(join(fixture.store, 'admission.sqlite')); guard();
                verify({ response: { ...exit, reply }, calls, allocationForOne, capacity, database });
                completion.current = { kind: 'asserted', context: childContext };
              } catch (error) { stop(error); throw error; }
              finally { childContext.signal.removeEventListener('abort', abort); }
            })();
            callbacks.push(work);
            return work;
          });
          await Promise.race([terminal, budget.expired]);
          guard();
          const witness = completion.current;
          if (witness.kind !== 'asserted') throw new Error(`${name} did not complete its assertions`);
          const childContext = witness.context;
          if (!childContext || !('passed' in childContext) || typeof childContext.passed !== 'boolean') throw new Error('H01 requires a supported final child context status');
          assert.equal(childContext.passed, true, `${name} did not pass`);
          guard(); completed++; sequence = { kind: 'ready' };
        } catch (error) { stop(error); throw error; }
        finally { budget.dispose(); }
      },
    });
    if (sequence.kind !== 'ready') throw new Error('H01 sequence did not finish ready');
    assert.equal(completed, requestCount, 'H01 must verify its complete request inventory');
    sequence = { kind: 'complete' };
  } catch (error) { stop(error); throw error; }
}
