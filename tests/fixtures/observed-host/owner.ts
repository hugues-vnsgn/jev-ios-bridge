import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runCli } from '../../../src/cli.js';
import { FileObservedEvidence } from '../../../src/observed/evidence.js';
import { fixtureObserved } from '../observed-cli-server.js';
import { Admission } from '../../../src/device/admission.js';
import { Socket } from 'node:net';
import { createObservedComposition } from '../../../src/observed/cli.js';
import { ObservedOperationError } from '../../../src/observed/schema.js';

// The fixture changes only backend scheduling and store/evidence fault seams.
// Production runCli composes the real public resolver, allocator and action service.
process.umask(0o022);
delete process.env.TYPESAFE_API_KEY;
const [root, transport, command, argument, gate = '', mode = 'observed', fault = ''] = process.argv.slice(2);
if (!root || !transport) throw new Error('Missing isolated fixture invocation');
const counts = new Map<string, number>();
function milestone(name: string): void {
  const count = (counts.get(name) ?? 0) + 1; counts.set(name, count);
  const key = `${name}:${count}`;
  appendFileSync(join(root!, 'milestones.jsonl'), JSON.stringify({ pid: process.pid, key }) + '\n', { mode: 0o600 });
  if (gate !== key) return;
  // Synchronous commit hooks must remain on the actual owner stack. The file
  // release is independent of its blocked JS loop; SIGKILL leaves durable state.
  const memory = new Int32Array(new SharedArrayBuffer(4));
  while (!existsSync(join(root!, 'release'))) Atomics.wait(memory, 0, 0, 10);
}
globalThis.fetch = async () => { milestone('forbidden:network'); throw new Error('No network in observed host fixtures'); };
Socket.prototype.connect = function () { milestone('forbidden:network'); throw new Error('No network in observed host fixtures'); } as typeof Socket.prototype.connect;
const files = new FileObservedEvidence();
const evidence = {
  prepare: files.prepare.bind(files), observation: files.observation.bind(files),
  async provisional(...args: Parameters<FileObservedEvidence['provisional']>) {
    milestone('evidence:provisional');
    if (fault === 'provisional') throw new Error('Isolated evidence failure');
    await files.provisional(...args);
  },
  async terminal(...args: Parameters<FileObservedEvidence['terminal']>) {
    milestone('evidence:terminal');
    if (fault === 'terminal') throw new Error('Isolated export failure');
    const path = await files.terminal(...args); milestone('evidence:exported'); return path;
  },
};
const fixture = fixtureObserved(root, process.env.JEV_EXPERIMENTAL_OBSERVED === '1', mode, {
  evidence,
  fault(point, operation) {
    milestone(`${point}:${operation}`);
    if (point === 'afterCommit' && operation === 'authorize') {
      const context = JSON.parse(readFileSync(join(root, 'fixture.json'), 'utf8'));
      const record = Admission.forTesting({ root: context.store, backend: 'fake', initialize: false }).readAllocationForAction('one');
      if (record?.actionEvidence?.actionAttempted === null) milestone('durable:tap-authorized');
    }
    if (fault === `${point}:${operation}`) throw new Error('Isolated COMMIT boundary failure');
    if (fault === 'sqlite-full' && point === 'beforeCommit' && operation === 'reserveAllocation') throw Object.assign(new Error('Injected SQLITE_FULL'), { code: 'SQLITE_FULL' });
  },
  async before(operation) {
    milestone(`backend:${operation}`);
    if (gate === `async:backend:${operation}:1`) {
      milestone(`waiting:${operation}`);
      await new Promise<void>(done => {
        const timer = setInterval(() => { if (existsSync(join(root, 'release'))) { clearInterval(timer); done(); } }, 10);
      });
      milestone(`late:${operation}`);
    }
  },
});
// productionObservedComposition translates an unavailable startup store before
// constructing real backends. Apply that factory boundary to the isolated fake
// startup; all lifecycle/authority still delegates to the production classes.
const observed = createObservedComposition({ enabled: fixture.enabled, async create() {
  const context = JSON.parse(readFileSync(join(root, 'fixture.json'), 'utf8'));
  try { Admission.forTesting({ root: context.store, backend: 'fake', initialize: false }); }
  catch { throw new ObservedOperationError('STORE_UNAVAILABLE', 'Existing admission authority is unavailable', { acceptance: 'unknown' }); }
  return fixture;
} });
const inspect = observed.inspect.bind(observed);
observed.inspect = async (...args) => {
  milestone('public:inspect');
  try {
    const result = await inspect(...args);
    appendFileSync(join(root!, 'public-waits.jsonl'), JSON.stringify({ pid: process.pid, operation: 'inspect', waitMs: args[1]?.waitMs, signalAborted: args[1]?.signal?.aborted, result }) + '\n', { mode: 0o600 });
    milestone('public:inspect-settled'); return result;
  } catch (error) {
    appendFileSync(join(root!, 'public-waits.jsonl'), JSON.stringify({ pid: process.pid, operation: 'inspect', waitMs: args[1]?.waitMs, signalAborted: args[1]?.signal?.aborted, errorCode: error instanceof ObservedOperationError ? error.code : 'OTHER_ERROR' }) + '\n', { mode: 0o600 });
    milestone('public:inspect-settled'); throw error;
  }
};
const getAllocation = observed.getAllocation.bind(observed);
observed.getAllocation = async (...args) => {
  milestone('public:get-allocation');
  const result = await getAllocation(...args);
  appendFileSync(join(root!, 'public-waits.jsonl'), JSON.stringify({ pid: process.pid, operation: 'get-allocation', waitMs: args[1]?.waitMs, signalAborted: args[1]?.signal?.aborted, result }) + '\n', { mode: 0o600 });
  milestone('public:get-allocation-settled'); return result;
};
if (transport === 'mcp') await runCli(['mcp'], { observed, projectDir: root });
else {
  const args = [command!, argument!, '--json'];
  if (process.env.HOST_WAIT_MS) args.push('--wait-ms', process.env.HOST_WAIT_MS);
  await runCli(args, { observed, projectDir: process.env.HOST_PROJECT_DIR ?? root });
}
// No process.exit: production shutdown/signal behavior must own termination.
