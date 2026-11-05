import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TestContext } from 'node:test';
import type { FenceEffect } from '../../../src/appium/fence/schema.js';
import type { ScriptedScenario } from '../../../src/scripted/contracts.js';
import { scriptedCycle, cycleScenario, type CycleBackend, type CycleRun } from '../../../scripts/phase4/live/cycles.js';
import { sourceProduct } from './source-product.js';
import { UDID } from '../appium-wire/driver-fixture.js';
import { ANDROID_DEVICE, IOS_DEVICE, SERIAL, androidTarget, iosTarget } from '../appium-wire/matrix.js';
import { androidScreen, iosScreen, world, worldFixture, type IosNode, type World, type WorldRule } from '../appium-wire/world.js';

export const IOS_SCENARIO = resolve('tests/fixtures/phase4-live/ios-cycle.json');
export const ANDROID_SCENARIO = resolve('tests/fixtures/phase4-live/android-cycle.json');
export const iosScenario = () => cycleScenario(JSON.parse(readFileSync(IOS_SCENARIO, 'utf8')), { category: 'ios-simulator', device: UDID });
export const androidScenario = () => cycleScenario(JSON.parse(readFileSync(ANDROID_SCENARIO, 'utf8')), { category: 'android-phone', device: SERIAL });

const header: IosNode = { type: 'StaticText', name: 'title', label: 'Header', frame: [16, 60, 200, 40] };
const iosScreens = {
  home: iosScreen([header, { type: 'StaticText', name: 'home', label: 'Home', frame: [16, 120, 200, 40] }, { type: 'Button', name: 'go', label: 'Go', frame: [20, 200, 200, 44] }]),
  done: iosScreen([header, { type: 'StaticText', name: 'done', label: 'Done', frame: [16, 200, 200, 40] }]),
};
const id = (name: string) => `example.app:id/${name}`;
const androidHeader = { className: 'android.widget.TextView', text: 'Header', bounds: [16, 20, 216, 60] as [number, number, number, number] };
const androidScreens = {
  home: androidScreen([androidHeader, { className: 'android.widget.TextView', text: 'Home', id: id('home'), bounds: [16, 100, 216, 140] },
    { className: 'android.widget.Button', text: 'Go', id: id('go'), clickable: true, bounds: [20, 200, 220, 244] }]),
  done: androidScreen([androidHeader, { className: 'android.widget.TextView', text: 'Done', id: id('done'), bounds: [16, 200, 216, 240] }]),
};
const flow: WorldRule[] = [{ tool: 'appium_perform_actions', when: 'home', to: 'done' }];
/** The cycle scenario's app: Home shows Go, a tap on it shows Done. */
export const cycleWorld = (platform: 'ios' | 'android', rules: WorldRule[] = [], start = 'home'): World =>
  world(platform, platform === 'ios' ? iosScreens : androidScreens, [...rules, ...flow], start);

type Fixture = ReturnType<typeof worldFixture>;
export type WorldCycleOptions = {
  platform: 'ios' | 'android';
  /** The world cycle `index` (from 1) opens; each cycle gets a fresh driver over the same admission and fence. */
  worldFor?: (index: number) => World;
  afterCycle?: (index: number, run: CycleRun, f: Fixture) => void;
};

/** A cycle backend on the world provider: the real driver, admission and scripted run, with the fence faked. */
export function worldCycles(t: TestContext, options: WorldCycleOptions) {
  const phone = androidTarget();
  const f = options.platform === 'ios' ? worldFixture(t, cycleWorld('ios'), iosTarget) : worldFixture(t, cycleWorld('android'), phone.options, phone.nativeReply);
  const reads: FenceEffect[] = [];
  const worldFor = options.worldFor ?? (() => cycleWorld(options.platform));
  const backend = (scenario: ScriptedScenario, logRoot: string): CycleBackend => {
    const cycle = scriptedCycle({ scenario, logRoot, runtime: sourceProduct, driver: ({ runId, index }) => f.open(worldFor(index), { runId }).driver });
    return { admission: f.admission, device: options.platform === 'ios' ? IOS_DEVICE : ANDROID_DEVICE,
      fence: (effect, signal) => { reads.push(structuredClone(effect)); return f.fence.run(effect, signal); },
      cycle: async (index, signal) => {
        const run = await cycle(index, signal);
        options.afterCycle?.(index, run, f);
        return run;
      } };
  };
  return { f, reads, backend };
}
