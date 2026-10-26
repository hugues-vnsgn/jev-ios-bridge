import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { appendFileSync, readFileSync, existsSync, writeFileSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Admission } from '../../src/device/admission.js';
import { createObservedDriver } from '../../src/device/legacy-factory.js';
import type { CliRunner } from '../../src/device/index.js';
import { ObservedAllocator } from '../../src/observed/allocation.js';
import { ObservedActionService } from '../../src/observed/service.js';
import { readAllocationConfig, type InstalledHost } from '../../src/observed/allocation-config.js';
import type { SourceProcess } from '../../src/observed/create-source.js';
import { runCli } from '../../src/cli.js';
import type { AdmissionDependencies } from '../../src/device/admission.js';
import type { ObservedEvidenceStore } from '../../src/observed/evidence.js';
import { createObservedComposition, isObservedCommand, validateObservedStartConfiguration } from '../../src/observed/cli.js';
import { ObservedOperationError } from '../../src/observed/schema.js';
import { fixtureObserver } from './public-contention.js';
import { allocationFixture, fixtureDevice } from './observed-allocation-backend.js';

export const mapPublicFixturePath = (root: string, path: string) =>
  path === root || path.startsWith(root + '/') ? path
    : path === '/' || /^\/(?:Applications|Library|System|usr|private)(?:\/|$)/.test(path) ? join(root, 'host', path) : path;

export async function setupPublicFixture(root: string, ownership?: { backendRoot: string }) {
  const fixture = await allocationFixture(ownership ? { ownedRoot: ownership.backendRoot } : {});
  const context = { root: fixture.root, home: fixture.home, store: fixture.store, runsDir: fixture.runsDir, app: fixture.app };
  await fs.writeFile(join(root, 'fixture.json'), JSON.stringify(context), { mode: 0o600 });
  return { ...context, request: fixture.request, cleanup: fixture.cleanup, configPath: fixture.configPath, configure: fixture.configure, inventory: fixture.inventory };
}
export function fixtureObserved(root: string, enabled = true, mode = 'observed', hooks: { fault?: AdmissionDependencies['fault']; before?: (operation: string) => Promise<void>; evidence?: ObservedEvidenceStore } = {}) {
  let admission: Admission;
  let config: () => Promise<unknown>;
  const actions = new Set<string>();
  const observer = fixtureObserver({ root, admission: () => admission, actions });
  const module = createObservedComposition({ enabled, async create() {
    const context = JSON.parse(await fs.readFile(join(root, 'fixture.json'), 'utf8')) as {root:string;home:string;store:string;runsDir:string;app:string};
    const trace = (operation: string) => appendFileSync(join(root, 'calls.jsonl'), JSON.stringify(operation) + '\n', { mode: 0o600 });
    trace('open');
    if (mode === 'before-admission-open') {
      appendFileSync(join(root, 'milestones.jsonl'), JSON.stringify({ pid: process.pid, key: 'fixture:admission-open:1' }) + '\n', { mode: 0o600 });
      const memory = new Int32Array(new SharedArrayBuffer(4));
      while (!existsSync(join(root, 'release'))) Atomics.wait(memory, 0, 0, 10);
    }
    const admissionOptions: Parameters<typeof Admission.forTesting>[0] = { root: context.store, backend: 'fake', initialize: false,
      fault(point, operation) { if (point === 'afterCommit') observer.commit(operation); hooks.fault?.(point, operation); },
      ...(mode === 'unresolved' ? { fault(point, operation) { if (point === 'beforeCommit' && operation === 'finalize') throw new Error('Fixture finalization fault'); } } : {}) };
    try { admission = Admission.forTesting(admissionOptions); }
    catch { throw new ObservedOperationError('STORE_UNAVAILABLE', 'Existing admission authority is unavailable', { acceptance: 'unknown' }); }
    const map = (path: string) => mapPublicFixturePath(context.root, path);
    const fakeFs = { ...fs,
      lstat: ((p: string, ...args: []) => fs.lstat(map(p), ...args)) as typeof fs.lstat,
      open: ((p: string, ...args: [number, number?]) => fs.open(map(p), ...args)) as typeof fs.open,
      readdir: ((p: string, ...args: []) => fs.readdir(map(p), ...args)) as typeof fs.readdir,
      statfs: (async (_path: string) => ({ type: 0, bsize: 1, blocks: 1000000, bfree: 1000000, bavail: 1000000, files: 100000, ffree: 100000 })) as typeof fs.statfs,
    };
    const host: InstalledHost = { fs: fakeFs, account: { homedir: context.home, uid: process.getuid!() }, platform: 'darwin', architecture: 'arm64' };
    config = () => readAllocationConfig({ account: host.account, fs: fakeFs });
    const source: SourceProcess = (executable, args, options) => observer.effect({ operation: executable === '/usr/bin/plutil' ? 'plist' : 'create', effect: async () => {
      await hooks.before?.(executable === '/usr/bin/plutil' ? 'plist' : 'create');
      assert.equal(options.shell, false); assert.equal(options.signal.aborted, false);
      if (executable === '/usr/bin/plutil') {
        trace('plist');
        return { stdout: args[5]!.endsWith('.app/Info.plist') ? JSON.stringify({ CFBundleIdentifier: 'org.example.fixture', CFBundleExecutable: 'Fixture', CFBundlePackageType: 'APPL', CFBundleSupportedPlatforms: ['iPhoneSimulator'], MinimumOSVersion: '17.0' }) : await fs.readFile(map(args[5]!), 'utf8'), stderr: '', exitCode: 0 };
      }
      assert.equal(executable, '/usr/bin/xcrun'); assert.deepEqual(args.slice(0, 2), ['simctl', 'create']);
      trace('create');
      if (mode === 'lost-create') throw new Error('Lost creation receipt');
      if (mode === 'torn-create') return { stdout: 'ABCDEF00-', stderr: '', exitCode: 0 };
      return { stdout: fixtureDevice + '\n', stderr: '', exitCode: 0 };
    } });
    let touched = false;
    const runner: CliRunner = args => observer.effect({ operation: args[1]!, effect: async () => {
      const operation = args[1]!; trace(operation); await hooks.before?.(operation);
      if ((['pending', 'pending-resource'].includes(mode) && operation === 'snapshot-ui' && admission.readAllocationForAction('one')?.state === 'executing') || (mode === 'pending-preparation' && operation === 'boot')) {
        if (mode === 'pending-resource') { setInterval(() => {}, 1000); trace('resource-live'); }
        return new Promise(() => {});
      }
      if (operation === 'touch') {
        touched = true;
        if (mode === 'inconclusive') throw new Error('Private vendor output must never escape');
      }
      if (operation === 'list') return { stdout: JSON.stringify({ schema: 'mobilebuildmcp.output.simulator-list', schemaVersion: '2', didError: false,
        data: { simulators: [{ simulatorId: fixtureDevice, state: 'Booted', isAvailable: true }] } }), stderr: '', exitCode: 0 };
      assert.ok(['boot', 'install', 'launch-app', 'snapshot-ui', 'screenshot', 'touch'].includes(operation), 'No cleanup/retry backend commands');
      const schema = operation === 'boot' ? 'simulator-action-result' : operation === 'install' ? 'install-result'
        : operation === 'launch-app' ? 'launch-result' : operation === 'touch' ? 'ui-action-result' : 'capture-result';
      const done = mode === 'already' || touched;
      const identifier = mode === 'refused' ? 'other' : done ? 'done' : 'go';
      return { stdout: JSON.stringify({ schema: 'mobilebuildmcp.output.' + schema, schemaVersion: '2', didError: false,
        data: { artifacts: { simulatorId: fixtureDevice }, action: { type: 'tap' }, capture: { type: 'runtime-snapshot', protocol: 'rs/1', capturedAtMs: Date.now(), expiresAtMs: Date.now() + 60000,
          count: 1, elements: [{ ref: 'button', role: 'button', identifier, label: identifier, frame: { x: 0, y: 0, width: 100, height: 30 }, actions: ['tap', 'touch'], state: { visible: true, enabled: true } }] } } }), stderr: '', exitCode: 0 };
    } });
    const window = async () => { trace('window'); assert.fail('No real or fake window presentation'); };
    const allocator = new ObservedAllocator({ runsDir: context.runsDir, admission, fakeBackend: { process: source, runner, window, host } });
    return new ObservedActionService({ admission, allocator, runsDir: context.runsDir, bridgeVersion: 'fixture', backend: 'fake', enabled, ...(hooks.evidence ? { evidence: hooks.evidence } : {}),
      createDriver: () => createObservedDriver({ cwd: context.root, admission, lockRoot: join(context.root, 'leases'), runner, deviceWindow: window,
        capture: 'full', screenshots: true, reuseActionCapture: false, verifyScreenshotAgreement: false,
        fakeBackend: { runner, window } }) });
  }, async beforeStart(request) { await validateObservedStartConfiguration(admission, request, config); } });
  const prepare = module.prepareAllocation.bind(module); module.prepareAllocation = raw => { if (raw && typeof raw === 'object' && 'actionId' in raw && typeof raw.actionId === 'string') actions.add(raw.actionId); return prepare(raw); };
  const start = module.start.bind(module); module.start = raw => { if (raw && typeof raw === 'object' && 'actionId' in raw && typeof raw.actionId === 'string') actions.add(raw.actionId); return start(raw); };
  const close = module.close.bind(module); let closing: Promise<void> | undefined;
  module.close = () => { if (!closing) { observer.close('close-begin'); closing = close().finally(() => observer.close('close-end')); } return closing; };
  return module;
}
export const actionRequest = (allocationId: string, actionId = 'one') => ({ version: 1, actionId, allocationId, app: { bundleId: 'org.example.fixture' },
  action: { kind: 'tap', selector: { identifier: 'go' } }, before: { present: [{ identifier: 'go' }] }, after: { present: [{ identifier: 'done' }] }, timeoutMs: 5000 });
export function fixtureCalls(root: string): string[] {
  return existsSync(join(root, 'calls.jsonl')) ? readFileSync(join(root, 'calls.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as string) : [];
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [root, command, argument] = process.argv.slice(2);
  if (!root || !command || !isObservedCommand(command)) throw new Error('Invalid fixture invocation');
  const module = fixtureObserved(root, process.env.JEV_EXPERIMENTAL_OBSERVED === '1', process.env.OBSERVED_FIXTURE_MODE);
  if (command === 'observed-report') {
    const inspect = module.inspect.bind(module);
    module.inspect = (id, options) => {
      const result = inspect(id, options);
      if ((options?.waitMs ?? 0) > 0) {
        const marker = join(root, `read-wait-${process.pid}`);
        writeFileSync(marker + '.pending', 'ready', { mode: 0o600 });
        renameSync(marker + '.pending', marker);
      }
      return result;
    };
  }
  await runCli([command, ...(argument ? [argument] : []), '--json', ...(process.argv[5] !== undefined ? ['--wait-ms', process.argv[5]] : [])], { observed: module, projectDir: root });
}
