import { setTimeout as delay } from 'node:timers/promises';
import type { AppiumHost } from '../../../src/appium/composition.js';
import type { FenceRunner } from '../../../src/appium/fence/index.js';
import type { HostRow } from '../../../src/appium/fence/schema.js';
import type { NativeCommand, NativeProcess } from '../../../src/appium/native/process.js';
import { StackError } from '../../../src/appium/stack.js';
import type { Admission } from '../../../src/device/admission.js';
import { identityProbe, type IdentityProbe } from '../../../src/device/android/probe.js';
import { createPreparationDriver } from '../../../src/device/factory.js';
import type { IosPreparationDriver } from '../../../src/device/index.js';
import { ObservedAllocator } from '../../../src/observed/allocation.js';
import { allocationFixture, fixtureDevice } from '../observed-allocation-backend.js';
import { WDA_BUNDLE, liveGroupRows } from './driver-fixture.js';
import type { Cleanups } from './image-stack.js';
import { iosScreen, world, type IosNode, type World, type WorldRule } from './world.js';
import { worldHost } from './world-host.js';

export const BUNDLE = 'org.example.fixture';
const go: IosNode = { type: 'Button', name: 'go', label: 'Go', frame: [20, 200, 200, 44] };
const done: IosNode = { type: 'StaticText', name: 'done', label: 'Done', frame: [16, 300, 200, 40] };
export const screens = { go: iosScreen([go], BUNDLE), done: iosScreen([done], BUNDLE) };
export const tapLeadsDone: WorldRule[] = [{ tool: 'appium_perform_actions', when: 'go', to: 'done' }];
export const fixtureWorld = (rules: WorldRule[] = tapLeadsDone): World => world('ios', screens, rules);
const helpers = new Set(['ios-boot', 'ios-install', 'ios-launch']);
/** The device effect each preparation helper performs, by the name the public fixtures record. */
export const effectNames: Readonly<Record<string, string>> = { 'ios-boot': 'boot', 'ios-install': 'install', 'ios-launch': 'launch-app' };
/** Runs each device effect (simctl boot, install, launch) through `around`, under its effect name. */
export function aroundEffects(host: AppiumHost, around: (name: string, run: () => Promise<NativeProcess>) => Promise<NativeProcess>): AppiumHost {
  return async request => {
    const parts = await host(request);
    return { ...parts, nativeRunner: (command, output, signal) => {
      const name = effectNames[command.kind];
      const run = () => parts.nativeRunner(command, output, signal);
      return name ? around(name, run) : run();
    } };
  };
}
export const createdDevice = (serial: number) => `ABCDEF00-0000-4000-8000-${String(serial).padStart(12, '0')}`;

export type HostWorld = {
  worlds?: World[];
  nativeExit?: (command: NativeCommand) => number | 'lost' | undefined;
  nativeHeld?: (command: NativeCommand) => boolean;
  groupsSurviveTerm?: () => HostRow[];
  /** The frozen stack fails its check with this code when a command builds its parts. */
  stackRefused?: string;
  /** What `simctl list` reports for every fixture simulator. */
  listed?: () => { state: string; isAvailable: boolean };
  /** Awaited inside each simulator listing, with its 1-based count, before it answers. */
  beforeList?: (count: number) => Promise<void>;
  /** Written to a helper's stderr before `nativeExit` ends it. */
  nativeStderr?: (command: NativeCommand) => string | undefined;
};

/** Every simulator listing the identity probe makes is counted in `lists`. */
function listedProbe(options: HostWorld, lists: number[]): IdentityProbe {
  const udids = Array.from({ length: 12 }, (_, index) => createdDevice(index + 1));
  return identityProbe({ adb: '/fake/adb', environment: {},
    simulatorApp: async ({ bundleId }) => ({ kind: 'installed', reply: `/fake/Applications/${bundleId}.app\n` }),
    simulator: async () => {
      const count = lists.push(Date.now());
      await options.beforeList?.(count);
      const { state, isAvailable } = options.listed?.() ?? { state: 'Booted', isAvailable: true };
      return { deviceSet: '/fake/CoreSimulator/Devices', reply: JSON.stringify({ devices: { 'fake-runtime': udids.map(udid => ({ udid, name: udid, state, isAvailable })) } }) };
    },
    spawn: () => { throw new Error('Unexpected Android probe in simulator fixture'); } });
}

export function observedHost(t: Cleanups, options: HostWorld & { admission: Admission; root: string }) {
  const lists: number[] = [];
  const base = worldHost(t, { worlds: options.worlds ?? [fixtureWorld()], identityProbe: listedProbe(options, lists),
    admission: options.admission, root: options.root,
    nativeReply: command => helpers.has(command.kind) && !options.nativeHeld?.(command) && options.nativeExit?.(command) === undefined ? '' : undefined });
  const stopped = new Set<number>();
  const killed = new Set<number>();
  const runner = (index: number) => 777 + index;
  const fence: FenceRunner = async (effect, ...rest) => {
    if (options.groupsSurviveTerm && effect.kind === 'host-inventory') {
      await base.fence.run(effect, ...rest);
      return options.groupsSurviveTerm().filter(row => !killed.has(row.pgid) && effect.of.some(of => of.pid === row.pid));
    }
    if (options.groupsSurviveTerm && effect.kind === 'host-signal-group') {
      await base.fence.run(effect, ...rest);
      if (effect.signal === 'SIGKILL') killed.add(effect.pgid);
      return { ok: true };
    }
    if (effect.kind === 'wda-inventory') {
      await base.fence.run(effect, ...rest);
      return base.opened.flatMap((driver, index) => driver.tools().includes('appium_session_management') && !stopped.has(runner(index))
        ? [{ udid: effect.udid, bundleId: WDA_BUNDLE, pid: runner(index) }] : []);
    }
    if (effect.kind === 'wda-stop') stopped.add(effect.pid);
    return base.fence.run(effect, ...rest);
  };
  const host: AppiumHost = async request => {
    if (options.stackRefused) throw new StackError(options.stackRefused, 'The frozen stack failed its check.');
    const parts = await base.host(request);
    return { ...parts, fence, ...(options.groupsSurviveTerm ? { fenceClock: { now: () => performance.now(), sleep: (ms: number, signal: AbortSignal) => delay(ms, undefined, { signal }) } } : {}),
      nativeRunner: async (command, output, signal) => {
      const child = await parts.nativeRunner(command, output, signal);
      const code = options.nativeExit?.(command);
      const call = base.native.calls.at(-1)!;
      if (code !== undefined) setImmediate(() => { const stderr = options.nativeStderr?.(command); if (stderr) output.stderr(stderr); call.exit(code === 'lost' ? { kind: 'lost' } : { kind: 'exited', code }); });
      return child;
    } };
  };
  return { ...base, host, stopped, killed, lists };
}

type StoreOptions = NonNullable<Parameters<typeof allocationFixture>[0]>;
export type AllocatorWorld = Omit<HostWorld, 'groupsSurviveTerm'> & { budgets?: Record<string, unknown>; groupsSurviveTerm?: boolean; fault?: StoreOptions['fault']; now?: StoreOptions['now'];
  /** Wraps each preparation driver the allocator builds. */
  wrap?: (driver: IosPreparationDriver) => IosPreparationDriver };

export async function appiumAllocator(t: Cleanups, options: AllocatorWorld = {}) {
  const { budgets, groupsSurviveTerm, fault, now, wrap = driver => driver, ...world } = options;
  const f = await allocationFixture({ ...(fault ? { fault } : {}), ...(now ? { now } : {}) });
  if (budgets) f.configure(budgets);
  const groups = () => f.admission.listActiveAllocations().flatMap(allocation => {
    const owner = f.admission.readAttempt({ kind: 'preparation', id: allocation.allocationId })?.owner;
    return owner && f.admission.readGeneration(owner).components.some(component => component.kind === 'appium-process-group') ? liveGroupRows(f.admission, owner) : [];
  });
  const w = observedHost(t, { ...world, admission: f.admission, root: f.root, ...(groupsSurviveTerm ? { groupsSurviveTerm: groups } : {}) });
  const allocator = new ObservedAllocator({ admission: f.admission, runsDir: f.runsDir, fakeBackend: { process: f.source, host: f.host },
    createDriver: () => wrap(createPreparationDriver({ host: w.host, admission: f.admission })) });
  /** Another allocator over its own handle on the store; it only reads, cancels or recovers, so it never builds a driver. */
  const reader = (admission: Admission) => {
    const other = new ObservedAllocator({ admission, runsDir: f.runsDir, fakeBackend: { process: f.source, host: f.host },
      createDriver: () => { throw new Error('A reading allocator never prepares'); } });
    t.after(() => other.close());
    return other;
  };
  t.after(async () => { await allocator.close(); await f.cleanup(); });
  return { f, w, allocator, reader };
}
