import { setTimeout as delay } from 'node:timers/promises';
import type { AppiumHost } from '../../../src/appium/composition.js';
import type { FenceRunner } from '../../../src/appium/fence/index.js';
import type { HostRow } from '../../../src/appium/fence/schema.js';
import type { NativeCommand } from '../../../src/appium/native/process.js';
import type { Admission } from '../../../src/device/admission.js';
import { createPreparationDriver } from '../../../src/device/factory.js';
import { ObservedAllocator } from '../../../src/observed/allocation.js';
import { fakeSimulatorProbe } from '../android-device.js';
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
/** The simulators the fake source creates, in order. */
export const createdDevice = (serial: number) => `ABCDEF00-0000-4000-8000-${String(serial).padStart(12, '0')}`;

export type HostWorld = {
  /** The world each new driver opens on, in order; the last one repeats. */
  worlds?: World[];
  /** A native command that exits with this code instead of 0; undefined answers it normally. */
  nativeExit?: (command: NativeCommand) => number | undefined;
  /** A native command left running until the test ends it. */
  nativeHeld?: (command: NativeCommand) => boolean;
  /** Live private groups as the host sampler reports them. A group outlives SIGTERM and ends at SIGKILL, so its stop
   *  waits the fence's full TERM grace, on real time. */
  groupsSurviveTerm?: () => HostRow[];
};

/**
 * The world host for observed roles on one shared store and root. Each session start brings up its own WDA runner,
 * which the fence lists from that session on until a stop ends it, so every session's automation is owned by identity.
 */
export function observedHost(t: Cleanups, options: HostWorld & { admission: Admission; root: string }) {
  const base = worldHost(t, { worlds: options.worlds ?? [fixtureWorld()], identityProbe: fakeSimulatorProbe(fixtureDevice, createdDevice(2), createdDevice(3)),
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
    const parts = await base.host(request);
    return { ...parts, fence, ...(options.groupsSurviveTerm ? { fenceClock: { now: () => performance.now(), sleep: (ms: number, signal: AbortSignal) => delay(ms, undefined, { signal }) } } : {}),
      nativeRunner: async (command, output, signal) => {
      const child = await parts.nativeRunner(command, output, signal);
      const code = options.nativeExit?.(command);
      const call = base.native.calls.at(-1)!;
      if (code !== undefined) setImmediate(() => call.exit({ kind: 'exited', code }));
      return child;
    } };
  };
  return { ...base, host, stopped, killed };
}

type StoreFault = NonNullable<NonNullable<Parameters<typeof allocationFixture>[0]>['fault']>;

/** The real allocator over the fake host and source process, preparing on the Appium preparation driver. */
export async function appiumAllocator(t: Cleanups, options: Omit<HostWorld, 'groupsSurviveTerm'> & { budgets?: Record<string, unknown>; groupsSurviveTerm?: boolean; fault?: StoreFault } = {}) {
  const { budgets, groupsSurviveTerm, fault, ...world } = options;
  const f = await allocationFixture(fault ? { fault } : {});
  if (budgets) f.configure(budgets);
  const groups = () => f.admission.listActiveAllocations().flatMap(allocation => {
    const owner = f.admission.readAttempt({ kind: 'preparation', id: allocation.allocationId })?.owner;
    return owner && f.admission.readGeneration(owner).components.some(component => component.kind === 'appium-process-group') ? liveGroupRows(f.admission, owner) : [];
  });
  const w = observedHost(t, { ...world, admission: f.admission, root: f.root, ...(groupsSurviveTerm ? { groupsSurviveTerm: groups } : {}) });
  const allocator = new ObservedAllocator({ admission: f.admission, runsDir: f.runsDir, fakeBackend: { process: f.source, runner: f.runner, window: f.window, host: f.host },
    createDriver: () => createPreparationDriver({ host: w.host, admission: f.admission, presentation: 'visible' }) });
  t.after(async () => { await allocator.close(); await f.cleanup(); });
  return { f, w, allocator };
}
