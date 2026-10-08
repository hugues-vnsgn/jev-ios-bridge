import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { appendFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Admission } from '../../src/device/admission.js';
import { createObservedDriver } from '../../src/device/factory.js';
import type { CliRunner } from '../../src/device/index.js';
import { ObservedAllocator } from '../../src/observed/allocation.js';
import { ObservedActionService } from '../../src/observed/service.js';
import { readAllocationConfig, type InstalledHost } from '../../src/observed/allocation-config.js';
import type { SourceProcess } from '../../src/observed/create-source.js';
import { runCli } from '../../src/cli.js';
import type { AdmissionDependencies } from '../../src/device/admission.js';
import type { ObservedEvidenceStore } from '../../src/observed/evidence.js';
import { createObservedComposition, isObservedCommand, validateObservedStartConfiguration } from '../../src/observed/cli.js';
import { allocationFixture, fixtureDevice } from './observed-allocation-backend.js';

export async function setupPublicFixture(root: string) {
  const fixture = await allocationFixture();
  const context = { root: fixture.root, home: fixture.home, store: fixture.store, runsDir: fixture.runsDir, app: fixture.app };
  await fs.writeFile(join(root, 'fixture.json'), JSON.stringify(context), { mode: 0o600 });
  return { ...context, request: fixture.request, cleanup: fixture.cleanup, configPath: fixture.configPath };
}
export function fixtureObserved(root: string, enabled = true, mode = 'observed', hooks: { fault?: AdmissionDependencies['fault']; before?: (operation: string) => Promise<void>; evidence?: ObservedEvidenceStore } = {}) {
  let admission: Admission;
  let config: () => Promise<unknown>;
  return createObservedComposition({ enabled, async create() {
    const context = JSON.parse(await fs.readFile(join(root, 'fixture.json'), 'utf8')) as {root:string;home:string;store:string;runsDir:string;app:string};
    const trace = (operation: string) => appendFileSync(join(root, 'calls.jsonl'), JSON.stringify(operation) + '\n', { mode: 0o600 });
    trace('open');
    admission = Admission.forTesting({ root: context.store, backend: 'fake', initialize: false,
      ...(hooks.fault ? { fault: hooks.fault } : {}),
      ...(mode === 'unresolved' ? { fault(point, operation) { if (point === 'beforeCommit' && operation === 'finalize') throw new Error('Fixture finalization fault'); } } : {}) });
    const map = (path: string) => /^\/(?:Applications|Library|System|usr)(?:\/|$)/.test(path) ? join(context.root, 'host', path) : path;
    const fakeFs = { ...fs,
      lstat: ((p: string, ...args: []) => fs.lstat(map(p), ...args)) as typeof fs.lstat,
      open: ((p: string, ...args: [number, number?]) => fs.open(map(p), ...args)) as typeof fs.open,
      readdir: ((p: string, ...args: []) => fs.readdir(map(p), ...args)) as typeof fs.readdir,
      statfs: (async (_path: string) => ({ type: 0, bsize: 1, blocks: 1000000, bfree: 1000000, bavail: 1000000, files: 100000, ffree: 100000 })) as typeof fs.statfs,
    };
    const host: InstalledHost = { fs: fakeFs, account: { homedir: context.home, uid: process.getuid!() }, platform: 'darwin', architecture: 'arm64' };
    config = () => readAllocationConfig({ account: host.account, fs: fakeFs });
    const source: SourceProcess = async (executable, args, options) => {
      await hooks.before?.(executable === '/usr/bin/plutil' ? 'plist' : 'create');
      assert.equal(options.shell, false); assert.equal(options.signal.aborted, false);
      if (executable === '/usr/bin/plutil') {
        trace('plist');
        return { stdout: args[5]!.endsWith('.app/Info.plist') ? JSON.stringify({ CFBundleIdentifier: 'org.example.fixture', CFBundleExecutable: 'Fixture', CFBundlePackageType: 'APPL', CFBundleSupportedPlatforms: ['iPhoneSimulator'], MinimumOSVersion: '17.0' }) : await fs.readFile(map(args[5]!), 'utf8'), stderr: '', exitCode: 0 };
      }
      assert.equal(executable, '/usr/bin/xcrun'); assert.deepEqual(args.slice(0, 2), ['simctl', 'create']);
      trace('create'); return { stdout: fixtureDevice + '\n', stderr: '', exitCode: 0 };
    };
    let touched = false;
    const runner: CliRunner = async args => {
      const operation = args[1]!; trace(operation); await hooks.before?.(operation);
      if ((mode === 'pending' && operation === 'snapshot-ui' && admission.readAllocationForAction('one')?.state === 'executing') || (mode === 'pending-preparation' && operation === 'boot')) return new Promise(() => {});
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
    };
    const window = async () => assert.fail('No real or fake window presentation');
    const allocator = new ObservedAllocator({ runsDir: context.runsDir, admission, fakeBackend: { process: source, runner, window, host } });
    return new ObservedActionService({ admission, allocator, runsDir: context.runsDir, bridgeVersion: 'fixture', backend: 'fake', enabled, ...(hooks.evidence ? { evidence: hooks.evidence } : {}),
      createDriver: () => createObservedDriver({ cwd: context.root, admission, lockRoot: join(context.root, 'leases'), runner, deviceWindow: window,
        capture: 'full', screenshots: true, reuseActionCapture: false, verifyScreenshotAgreement: false,
        fakeBackend: { runner, window } }) });
  }, async beforeStart(request) { await validateObservedStartConfiguration(admission, request, config); } });
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
  await runCli([command, ...(argument ? [argument] : []), '--json', ...(process.argv[5] !== undefined ? ['--wait-ms', process.argv[5]] : [])], { observed: module, projectDir: root });
  process.exit(process.exitCode);
}
