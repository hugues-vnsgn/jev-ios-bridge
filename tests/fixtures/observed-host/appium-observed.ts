import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AppiumHost } from '../../../src/appium/composition.js';
import { Admission, type AdmissionDependencies } from '../../../src/device/admission.js';
import { createObservedDriver, createPreparationDriver } from '../../../src/device/factory.js';
import { ObservedAllocator } from '../../../src/observed/allocation.js';
import { readAllocationConfig, type InstalledHost } from '../../../src/observed/allocation-config.js';
import { createObservedComposition, validateObservedStartConfiguration } from '../../../src/observed/cli.js';
import type { SourceProcess } from '../../../src/observed/create-source.js';
import type { ObservedEvidenceStore } from '../../../src/observed/evidence.js';
import { ObservedOperationError } from '../../../src/observed/schema.js';
import { ObservedActionService } from '../../../src/observed/service.js';
import { iosScreen, world, type World } from '../appium-wire/world.js';
import { BUNDLE, fixtureWorld, observedHost, screens } from '../appium-wire/observed-allocator.js';
import { fixtureDevice } from '../observed-allocation-backend.js';
import { mapPublicFixturePath } from '../observed-cli-server.js';
import { fixtureObserver } from '../public-contention.js';

const actionWorlds: Record<string, World> = {
  observed: fixtureWorld(),
  already: world('ios', { done: screens.done }),
  refused: world('ios', { other: iosScreen([{ type: 'Button', name: 'other', label: 'Other', frame: [20, 200, 200, 44] }], BUNDLE) }),
  inconclusive: fixtureWorld([{ tool: 'appium_perform_actions', fault: { kind: 'error', code: 'DRIVER_ERROR' } }]),
  unresolved: fixtureWorld(),
};
const effectNames: Record<string, string> = { 'ios-boot': 'boot', 'ios-install': 'install', 'ios-launch': 'launch-app' };

export function appiumObserved(root: string, enabled: boolean, mode: string, hooks: { fault?: AdmissionDependencies['fault']; before?: (operation: string) => Promise<void>; evidence?: ObservedEvidenceStore } = {}) {
  let admission: Admission;
  let config: () => Promise<unknown>;
  let touch: (() => void) | undefined;
  const actions = new Set<string>();
  const cleanups: (() => unknown)[] = [];
  const observer = fixtureObserver({ root, admission: () => admission, actions });
  const trace = (operation: string) => appendFileSync(join(root, 'calls.jsonl'), JSON.stringify(operation) + '\n', { mode: 0o600 });
  const module = createObservedComposition({ enabled, async create() {
    const context = JSON.parse(await fs.readFile(join(root, 'fixture.json'), 'utf8')) as { root: string; home: string; store: string; runsDir: string };
    trace('open');
    try {
      admission = Admission.forTesting({ root: context.store, backend: 'fake', initialize: false, fault(point, operation) {
        if (point === 'afterCommit') observer.commit(operation);
        if (point === 'afterCommit' && operation === 'authorize' && touch && [...actions].some(id => admission.readAllocationForAction(id)?.actionEvidence?.actionAttempted === null)) {
          touch(); touch = undefined;
        }
        if (mode === 'unresolved' && point === 'beforeCommit' && operation === 'finalize') throw new Error('Fixture finalization fault');
        hooks.fault?.(point, operation);
      } });
    } catch { throw new ObservedOperationError('STORE_UNAVAILABLE', 'Existing admission authority is unavailable', { acceptance: 'unknown' }); }
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
        return { stdout: args[5]!.endsWith('.app/Info.plist') ? JSON.stringify({ CFBundleIdentifier: BUNDLE, CFBundleExecutable: 'Fixture', CFBundlePackageType: 'APPL', CFBundleSupportedPlatforms: ['iPhoneSimulator'], MinimumOSVersion: '17.0' }) : await fs.readFile(map(args[5]!), 'utf8'), stderr: '', exitCode: 0 };
      }
      assert.equal(executable, '/usr/bin/xcrun'); assert.deepEqual(args.slice(0, 2), ['simctl', 'create']);
      trace('create');
      return { stdout: fixtureDevice + '\n', stderr: '', exitCode: 0 };
    } });
    const w = observedHost({ after: cleanup => { cleanups.push(cleanup); } }, { admission, root: join(context.root, `appium-${String(process.pid)}`), worlds: [actionWorlds[mode] ?? fixtureWorld()] });
    const appium: AppiumHost = async request => {
      const parts = await w.host(request);
      return { ...parts, nativeRunner: (command, output, signal) => {
        const name = effectNames[command.kind];
        if (!name) return parts.nativeRunner(command, output, signal);
        return observer.effect({ operation: name, effect: async () => { trace(name); await hooks.before?.(name); return parts.nativeRunner(command, output, signal); } });
      } };
    };
    const allocator = new ObservedAllocator({ runsDir: context.runsDir, admission, fakeBackend: { process: source, runner: () => assert.fail('No MobileBuildMCP command on the Appium composition'),
      window: async () => { trace('window'); assert.fail('No window presentation'); }, host },
    createDriver: () => createPreparationDriver({ host: appium, admission, presentation: 'visible' }) });
    return new ObservedActionService({ admission, allocator, runsDir: context.runsDir, bridgeVersion: 'fixture', backend: 'fake', enabled, ...(hooks.evidence ? { evidence: hooks.evidence } : {}),
      createDriver: () => {
        const driver = createObservedDriver({ host: appium, admission, presentation: 'visible' });
        const tapOnce = driver.tapOnce.bind(driver);
        driver.tapOnce = (...args) => {
          const tapped = tapOnce(...args);
          touch = () => { trace('touch'); void observer.effect({ operation: 'touch', effect: () => tapped }).catch(() => {}); };
          return tapped;
        };
        return driver;
      } });
  }, async beforeStart(request) { await validateObservedStartConfiguration(admission, request, config); } });
  const prepare = module.prepareAllocation.bind(module); module.prepareAllocation = raw => { if (raw && typeof raw === 'object' && 'actionId' in raw && typeof raw.actionId === 'string') actions.add(raw.actionId); return prepare(raw); };
  const start = module.start.bind(module); module.start = raw => { if (raw && typeof raw === 'object' && 'actionId' in raw && typeof raw.actionId === 'string') actions.add(raw.actionId); return start(raw); };
  const close = module.close.bind(module); let closing: Promise<void> | undefined;
  module.close = () => {
    closing ??= (async () => {
      observer.close('close-begin');
      try { await close(); }
      finally { for (const cleanup of cleanups.reverse()) await Promise.resolve().then(cleanup).catch(() => {}); observer.close('close-end'); }
    })();
    return closing;
  };
  return module;
}
