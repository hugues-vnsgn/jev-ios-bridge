import { appendFileSync, writeFileSync, existsSync, openSync, writeSync, fsyncSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { allocationFixture } from '../observed-allocation-backend.js';
import { ObservedAllocator } from '../../../src/observed/allocation.js';
import { ObservedActionService } from '../../../src/observed/service.js';
import { createObservedComposition } from '../../../src/observed/cli.js';
import { runCli } from '../../../src/cli.js';
import type { CliRunner, DeviceWindowOpener } from '../../../src/device/index.js';
import type { SourceProcess } from '../../../src/observed/create-source.js';

process.umask(0o022); delete process.env.TYPESAFE_API_KEY;
const [root, phase] = process.argv.slice(2); if (!root || !phase) throw new Error('Missing early preparation fixture arguments');
const f = await allocationFixture();
writeFileSync(join(root, 'context.json'), JSON.stringify({ backendRoot: f.root, store: f.store }), { mode: 0o600 });
const tracePath = join(root, 'backend-attempts.jsonl');
writeFileSync(tracePath, '', { mode: 0o600 });
let sequence = 0;
function trace(value: object): void {
  const fd = openSync(tracePath, 'a');
  try { writeSync(fd, JSON.stringify({ pid: process.pid, ...value }) + '\n'); fsyncSync(fd); }
  finally { closeSync(fd); }
}
process.once('exit', exitCode => { trace({ kind: 'process-exit', exitCode }); });
const source: SourceProcess = async (executable, args, options) => {
  const id = ++sequence;
  trace({ kind: 'attempt', sequence: id, backend: 'source', operation: executable === '/usr/bin/plutil' ? 'plist' : 'create', executable, args, signalAborted: options.signal.aborted });
  try { const result = await f.source(executable, args, options); trace({ kind: 'result', sequence: id, result }); return result; }
  catch (error) { trace({ kind: 'error', sequence: id, name: error instanceof Error ? error.name : 'Unknown', message: error instanceof Error ? error.message : 'Unknown' }); throw error; }
};
const runner: CliRunner = async (args, signal) => {
  const id = ++sequence; trace({ kind: 'attempt', sequence: id, backend: 'runner', operation: args[1], args, signalAborted: signal.aborted });
  try { const result = await f.runner(args, signal); trace({ kind: 'result', sequence: id, result }); return result; }
  catch (error) { trace({ kind: 'error', sequence: id, name: error instanceof Error ? error.name : 'Unknown', message: error instanceof Error ? error.message : 'Unknown' }); throw error; }
};
const window: DeviceWindowOpener = async (udid, signal) => {
  const id = ++sequence; trace({ kind: 'attempt', sequence: id, backend: 'window', operation: 'window', args: [udid], signalAborted: signal.aborted });
  try { await f.window(); trace({ kind: 'result', sequence: id }); }
  catch (error) { trace({ kind: 'error', sequence: id, name: error instanceof Error ? error.name : 'Unknown', message: error instanceof Error ? error.message : 'Unknown' }); throw error; }
};
async function barrier() {
  appendFileSync(join(root!, 'milestone.jsonl'), JSON.stringify({ phase, pid: process.pid }) + '\n', { mode: 0o600 });
  await new Promise<void>(done => { const timer = setInterval(() => { if (existsSync(join(root!, 'release'))) { clearInterval(timer); done(); } }, 10); });
}
if (phase === 'configuration') {
  const original = f.host.fs.lstat;
  f.host.fs.lstat = (async (...args: Parameters<typeof original>) => { if (String(args[0]) === f.configPath) await barrier(); return original(...args); }) as typeof original;
} else {
  let first = true; let appPlists = 0;
  f.setBefore(async (operation, path) => {
    if (operation === 'plist' && path?.endsWith('.app/Info.plist')) appPlists++;
    if ((phase === 'host-proof' && first && operation === 'plist') || (phase === 'artifact-inspection' && appPlists === 1) || (phase === 'artifact-staging' && appPlists === 2)) { first = false; await barrier(); }
  });
}
const allocator = new ObservedAllocator({ admission: f.admission, runsDir: f.runsDir, fakeBackend: { process: source, runner, window, host: f.host } });
const service = new ObservedActionService({ admission: f.admission, allocator, runsDir: f.runsDir, enabled: true, backend: 'fake', bridgeVersion: 'early-fixture', createDriver: () => assert.fail('No action driver') });
const observed = createObservedComposition({ enabled: true, create: () => service });
const request = join(root, 'request.json'); writeFileSync(request, JSON.stringify(f.request()), { mode: 0o600 });
await runCli(['observed-allocate', request, '--json'], { observed, projectDir: root });
// Production runCli owns signal exits; this fixture never calls process.exit.
