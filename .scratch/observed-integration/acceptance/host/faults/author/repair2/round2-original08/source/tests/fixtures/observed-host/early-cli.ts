import { appendFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { allocationFixture } from '../observed-allocation-backend.js';
import { ObservedAllocator } from '../../../src/observed/allocation.js';
import { ObservedActionService } from '../../../src/observed/service.js';
import { createObservedComposition } from '../../../src/observed/cli.js';
import { runCli } from '../../../src/cli.js';

process.umask(0o022); delete process.env.TYPESAFE_API_KEY;
const [root, phase] = process.argv.slice(2); if (!root || !phase) throw new Error('Missing early preparation fixture arguments');
const f = await allocationFixture();
writeFileSync(join(root, 'context.json'), JSON.stringify({ backendRoot: f.root, store: f.store }), { mode: 0o600 });
function record() { writeFileSync(join(root!, 'calls.json'), JSON.stringify(f.calls), { mode: 0o600 }); }
async function barrier() {
  record(); appendFileSync(join(root!, 'milestone.jsonl'), JSON.stringify({ phase, pid: process.pid }) + '\n', { mode: 0o600 });
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
const allocator = new ObservedAllocator({ admission: f.admission, runsDir: f.runsDir, fakeBackend: { process: f.source, runner: f.runner, window: f.window, host: f.host } });
const service = new ObservedActionService({ admission: f.admission, allocator, runsDir: f.runsDir, enabled: true, backend: 'fake', bridgeVersion: 'early-fixture', createDriver: () => assert.fail('No action driver') });
const observed = createObservedComposition({ enabled: true, create: () => service });
const request = join(root, 'request.json'); writeFileSync(request, JSON.stringify(f.request()), { mode: 0o600 });
await runCli(['observed-allocate', request, '--json'], { observed, projectDir: root });
record();
// Production runCli owns signal exits; this fixture never calls process.exit.
