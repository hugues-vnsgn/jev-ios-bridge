import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
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
import { BUNDLE, aroundEffects, fixtureWorld, observedHost, screens } from '../appium-wire/observed-allocator.js';
import { fixtureDevice } from '../observed-allocation-backend.js';
import { fixtureObserver } from '../public-contention.js';

export const mapPublicFixturePath = (root: string, path: string) =>
  path === root || path.startsWith(root + '/') ? path
    : path === '/' || /^\/(?:Applications|Library|System|usr|private)(?:\/|$)/.test(path) ? join(root, 'host', path) : path;

/** The one tap is answered once the fixture's `touch` hook resolves, so a gated hook models a late tap reply. */
const tapWorld = fixtureWorld([{ tool: 'appium_perform_actions', when: 'go', to: 'done', fault: { kind: 'held' } }]);
const actionWorlds: Record<string, World> = {
  observed: tapWorld,
  already: world('ios', { done: screens.done }),
  refused: world('ios', { other: iosScreen([{ type: 'Button', name: 'other', label: 'Other', frame: [20, 200, 200, 44] }], BUNDLE) }),
  inconclusive: fixtureWorld([{ tool: 'appium_perform_actions', fault: { kind: 'error', code: 'DRIVER_ERROR' } }]),
  unresolved: tapWorld,
};
export type ObservedHooks = { fault?: AdmissionDependencies['fault']; before?: (operation: string) => Promise<void>; evidence?: ObservedEvidenceStore };

/**
 * The public observed composition on the Appium drivers over the world host. `calls.jsonl` records each effect by
 * name: open, plist, create, boot, install, launch-app, touch. `hooks.before` also sees `readiness`, once the readiness stage
 * is authorized, and each action `observe`.
 * Modes: the action worlds above; `lost-create` and `torn-create` creation receipts; `pending` and `pending-resource`,
 * an action observation the device never answers (the second also keeps a live timer); `pending-preparation`, a boot
 * that never ends; and `before-admission-open`, an owner that waits for `release` before it opens the store.
 */
export function appiumObserved(root: string, enabled = true, mode = 'observed', hooks: ObservedHooks = {}) {
  let admission: Admission;
  let config: () => Promise<unknown>;
  let touch: (() => void) | undefined;
  let readiness = false;
  const actions = new Set<string>();
  const cleanups: (() => unknown)[] = [];
  const observer = fixtureObserver({ root, admission: () => admission, actions });
  const trace = (operation: string) => appendFileSync(join(root, 'calls.jsonl'), JSON.stringify(operation) + '\n', { mode: 0o600 });
  const module = createObservedComposition({ enabled, async create() {
    const context = JSON.parse(await fs.readFile(join(root, 'fixture.json'), 'utf8')) as { root: string; home: string; store: string; runsDir: string };
    trace('open');
    if (mode === 'before-admission-open') {
      appendFileSync(join(root, 'milestones.jsonl'), JSON.stringify({ pid: process.pid, key: 'fixture:admission-open:1' }) + '\n', { mode: 0o600 });
      const memory = new Int32Array(new SharedArrayBuffer(4));
      while (!existsSync(join(root, 'release'))) Atomics.wait(memory, 0, 0, 10);
    }
    const admissionOptions: Parameters<typeof Admission.forTesting>[0] = { root: context.store, backend: 'fake', initialize: false, fault(point, operation) {
      if (point === 'afterCommit') observer.commit(operation);
      if (mode === 'unresolved' && point === 'beforeCommit' && operation === 'finalize') throw new Error('Fixture finalization fault');
      hooks.fault?.(point, operation);
      if (point === 'afterCommit' && operation === 'authorize' && touch && [...actions].some(id => admission.readAllocationForAction(id)?.actionEvidence?.actionAttempted === null)) {
        touch(); touch = undefined;
      }
      if (point === 'afterCommit' && operation === 'authorize' && !readiness && [...actions].some(id => admission.readAllocationForAction(id)?.phase === 'readiness')) {
        readiness = true; void hooks.before?.('readiness');
      }
    } };
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
        return { stdout: args[5]!.endsWith('.app/Info.plist') ? JSON.stringify({ CFBundleIdentifier: BUNDLE, CFBundleExecutable: 'Fixture', CFBundlePackageType: 'APPL', CFBundleSupportedPlatforms: ['iPhoneSimulator'], MinimumOSVersion: '17.0' }) : await fs.readFile(map(args[5]!), 'utf8'), stderr: '', exitCode: 0 };
      }
      assert.equal(executable, '/usr/bin/xcrun'); assert.deepEqual(args.slice(0, 2), ['simctl', 'create']);
      trace('create');
      if (mode === 'lost-create') throw new Error('Lost creation receipt');
      if (mode === 'torn-create') return { stdout: 'ABCDEF00-', stderr: '', exitCode: 0 };
      return { stdout: fixtureDevice + '\n', stderr: '', exitCode: 0 };
    } });
    const w = observedHost({ after: cleanup => { cleanups.push(cleanup); } }, { admission, root: join(context.root, `appium-${String(process.pid)}`),
      worlds: [actionWorlds[mode] ?? tapWorld], nativeHeld: command => mode === 'pending-preparation' && command.kind === 'ios-boot' });
    const appium = aroundEffects(w.host, (name, run) => observer.effect({ operation: name, effect: async () => { trace(name); await hooks.before?.(name); return run(); } }));
    const allocator = new ObservedAllocator({ runsDir: context.runsDir, admission, fakeBackend: { process: source, host },
      createDriver: () => createPreparationDriver({ host: appium, admission }) });
    return new ObservedActionService({ admission, allocator, runsDir: context.runsDir, bridgeVersion: 'fixture', backend: 'fake', enabled, ...(hooks.evidence ? { evidence: hooks.evidence } : {}),
      createDriver: () => {
        const driver = createObservedDriver({ host: appium, admission });
        const observe = driver.observe.bind(driver); const tapOnce = driver.tapOnce.bind(driver);
        driver.observe = async signal => {
          await hooks.before?.('observe');
          if (mode !== 'pending' && mode !== 'pending-resource') return observe(signal);
          trace('observe');
          if (mode === 'pending-resource') { setInterval(() => {}, 1000); trace('resource-live'); }
          return new Promise(() => {});
        };
        driver.tapOnce = (...args) => {
          const opened = w.opened.at(-1);
          let tapped!: ReturnType<typeof tapOnce>;
          touch = () => {
            trace('touch');
            void Promise.resolve(hooks.before?.('touch')).then(() => opened?.release());
            void observer.effect({ operation: 'touch', effect: () => tapped }).catch(() => {});
          };
          tapped = tapOnce(...args);
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
