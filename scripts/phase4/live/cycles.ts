import { appiumComponentSchema, fenceEffectSchema, forwardInventorySchema, hostInventorySchema, settingKeySchema, settingsSchema, wdaInventorySchema, type AppiumComponent, type FenceEffect } from '../../../src/appium/fence/schema.js';
import type { FenceRunner } from '../../../src/appium/fence/index.js';
import { SCRIPTED_JEV_MODEL } from '../../../src/scripted/jev.js';
import type { AssertionJudgment, ScriptedJudge, ScriptedScenario } from '../../../src/scripted/contracts.js';
import { runScriptedScenario } from '../../../src/scripted/run.js';
import { parseScriptedScenario } from '../../../src/scripted/schema.js';
import { randomUUID } from 'node:crypto';
import { createRunLog } from '../../../src/log/index.js';
import type { DeviceDriver } from '../../../src/contracts/index.js';
import type { AttemptIdentity, AttemptView, DeviceIdentity, DeviceView, GenerationView, OwnerIdentity } from '../../../src/device/admission.js';
import { Refusal } from './records.js';
import type { DeviceScope } from './row.js';

/** The device a cycle drives, and the store that records what it owns. */
export interface CycleBackend {
  device: DeviceIdentity;
  /** The bridge's own fence. The harness only ever sends read effects through it. */
  fence: FenceRunner;
  admission: {
    inspect(device: string | DeviceIdentity): DeviceView | undefined;
    readAttempt(identity: AttemptIdentity): AttemptView | undefined;
    readGeneration(expected: OwnerIdentity): GenerationView;
  };
  /** Runs one cycle and says which admission attempt it used. */
  cycle(index: number, signal: AbortSignal): Promise<CycleRun>;
}

/** What a cycle's scenario run said about itself. */
export interface CycleScenarioResult {
  runId: string;
  verdict: string;
  reason: string;
  /** The scenario reached its only checkpoint and every claim there was accepted. */
  reachedCheckpoint: boolean;
}

/** One cycle: its admission attempt, and what its scenario run said. */
export interface CycleRun {
  attempt: AttemptIdentity;
  scenario: CycleScenarioResult;
}

/** A component that outlived its cycle: the cycle that recorded it, and what the inventory still lists. */
export interface Leftover {
  cycle: number;
  component: string;
  kind: AppiumComponent['kind'];
  found: unknown[];
}

/** One cycle's result: what the store says, and what the fence still lists. */
export interface CycleRecord {
  cycle: number;
  attempt: AttemptIdentity;
  attemptState: string;
  disposition: string;
  device: string;
  owner: OwnerIdentity | null;
  leftovers: Leftover[];
  scenario: CycleScenarioResult;
  owned: number;
}

/** Why the harness stopped. */
export interface CycleFailure {
  cycle: number;
  code: string;
  reason: string;
}

export interface CycleResult {
  passed: boolean;
  cycles: CycleRecord[];
  failure?: CycleFailure;
}

/** A component the harness tracks, and the cycle that recorded it. */
interface OwnedComponent {
  cycle: number;
  component: AppiumComponent;
}

/**
 * The cycle scenario, checked against the device the owner assigned: it must name that device, must not hand
 * a decision to Jev, and must end at its only checkpoint.
 */
export function cycleScenario(raw: unknown, assigned: { category: DeviceScope; device: string }): ScriptedScenario {
  const scenario = parseScenario(raw);
  if (scenario.steps.some(step => step.kind === 'do')) {
    throw new Refusal('scenario-refused', 'A cycle scenario has a do step; a cycle must decide nothing itself.');
  }
  const checkpoints = scenario.steps.filter(step => step.kind === 'checkpoint');
  if (checkpoints.length !== 1 || scenario.steps.at(-1)?.kind !== 'checkpoint') {
    throw new Refusal('scenario-refused', 'A cycle scenario must end at its only checkpoint.');
  }
  const android = assigned.category === 'android-emulator' || assigned.category === 'android-phone';
  const platform = scenario.platform ?? 'ios';
  if (android !== (platform === 'android')) {
    throw new Refusal('scenario-refused', `The scenario is an ${platform} scenario, but the assignment names an ${android ? 'Android' : 'iOS'} device.`);
  }
  const named = android
    ? (scenario.device as { serial?: string; avd?: string } | undefined)?.serial ?? (scenario.device as { avd?: string } | undefined)?.avd
    : (scenario.device as { udid?: string } | undefined)?.udid;
  if (named === undefined) {
    throw new Refusal('scenario-refused', `The scenario names no device, so it cannot be checked against the assigned device ${assigned.device}.`);
  }
  const same = android ? named === assigned.device : named.toUpperCase() === assigned.device.toUpperCase();
  if (!same) {
    throw new Refusal('scenario-refused', `The scenario names device ${named}, not the assigned device ${assigned.device}.`);
  }
  return scenario;
}

function parseScenario(raw: unknown): ScriptedScenario {
  try {
    return parseScriptedScenario(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Refusal('scenario-refused', `The scenario is invalid: ${message}`);
  }
}

/** The judge a cycle runs with: it accepts the checkpoint's claim, because a cycle's contract is the cleanup
 *  it leaves behind, not the truth of the claim. The model name is the bridge's own, so the scripted run
 *  accepts the judgment it records. */
const cycleJudge: ScriptedJudge = {
  async judge(assertions): Promise<AssertionJudgment> {
    return { probabilities: Object.fromEntries(assertions.map(assertion => [assertion.id, 1])), inputTokens: 0, latencyMs: 0, model: SCRIPTED_JEV_MODEL };
  },
};

export interface ScriptedCycleOptions {
  scenario: ScriptedScenario;
  /** The folder the cycle's run logs go under. */
  logRoot: string;
  /** The driver for one cycle; it gets the cycle's run id, which is also its admission attempt id. */
  driver: (input: { runId: string; index: number }) => DeviceDriver;
  judge?: ScriptedJudge;
}

/**
 * The cycle runner: one scripted run per cycle, each on its own admission attempt. The run id carries a token
 * of this attempt, because the product keeps each run's log files for days and creates them exclusively, so a
 * second attempt reusing `cycle-1` would fail on the first attempt's files.
 */
export function scriptedCycle(options: ScriptedCycleOptions): (index: number, signal: AbortSignal) => Promise<CycleRun> {
  const token = randomUUID().slice(0, 8);
  return async (index, signal) => {
    const runId = `cycle-${token}-${String(index)}`;
    const log = await createRunLog(options.logRoot, runId);
    const driver = options.driver({ runId, index });
    const report = await runScriptedScenario({
      runId, scenario: options.scenario, driver, judge: options.judge ?? cycleJudge, log, signal,
    });
    const checkpoints = report.checkpoints;
    return {
      attempt: { kind: 'legacy', id: runId },
      scenario: {
        runId,
        verdict: report.verdict,
        reason: report.reason,
        reachedCheckpoint: checkpoints.length > 0 && checkpoints.every(checkpoint => checkpoint.status === 'passed'),
      },
    };
  };
}

function ownedComponents(generation: GenerationView | undefined, cycle: number): OwnedComponent[] {
  return (generation?.components ?? [])
    .filter(component => component.kind.startsWith('appium-') && component.kind !== 'appium-fence-command')
    .flatMap(component => {
      const parsed = appiumComponentSchema.safeParse(component.declaration);
      return parsed.success ? [{ cycle, component: parsed.data }] : [];
    });
}

/** The host processes the harness has to look for: the ones its owned groups and helpers name. */
function hostIdentities(owned: OwnedComponent[]): { pid: number; startTime: string }[] {
  return owned.flatMap(entry => {
    const component = entry.component;
    if (component.kind === 'appium-process-group') return [component.leader, ...component.members];
    if (component.kind === 'appium-native-helper') return [component.process];
    return [];
  });
}

/** The leftovers: a component the inventory still lists, named by the cycle that recorded it. */
async function findLeftovers(backend: CycleBackend, owned: OwnedComponent[], signal: AbortSignal): Promise<Leftover[]> {
  const read = async (effect: FenceEffect): Promise<unknown> => await backend.fence(effect, signal);
  const leftovers: Leftover[] = [];
  const wdaComponents = owned.filter((entry): entry is OwnedComponent & { component: Extract<AppiumComponent, { kind: 'appium-wda' }> } =>
    entry.component.kind === 'appium-wda');
  const forwardComponents = owned.filter((entry): entry is OwnedComponent & { component: Extract<AppiumComponent, { kind: 'appium-forward' }> } =>
    entry.component.kind === 'appium-forward');
  const settingsComponents = owned.filter((entry): entry is OwnedComponent & { component: Extract<AppiumComponent, { kind: 'appium-settings' }> } =>
    entry.component.kind === 'appium-settings');
  const androidComponents = owned.filter((entry): entry is OwnedComponent & { component: Extract<AppiumComponent, { kind: 'appium-uiautomator2' }> } =>
    entry.component.kind === 'appium-uiautomator2');
  const hostComponents = owned.filter((entry): entry is OwnedComponent & { component: Extract<AppiumComponent, { kind: 'appium-process-group' }> | Extract<AppiumComponent, { kind: 'appium-native-helper' }> } =>
    entry.component.kind === 'appium-process-group' || entry.component.kind === 'appium-native-helper');
  const wdaRows = wdaComponents.length ? wdaInventorySchema.parse(await read(fenceEffectSchema.parse({ kind: 'wda-inventory', udid: backend.device.value }))) : [];
  const forwardRows = forwardComponents.length ? forwardInventorySchema.parse(await read({ kind: 'forward-inventory' })) : [];
  const settingsRows = new Map<string, Record<string, string | null>>();
  for (const entry of settingsComponents) {
    if (settingsRows.has(entry.component.serial)) continue;
    settingsRows.set(entry.component.serial, settingsSchema.parse(await read({ kind: 'settings-read', serial: entry.component.serial })));
  }
  const androidRows = new Map<string, { kind: string; startTime?: string }>();
  for (const entry of androidComponents) {
    for (const process of entry.component.processes) {
      const key = `${entry.component.serial}:${String(process.pid)}`;
      if (androidRows.has(key)) continue;
      androidRows.set(key, await read({ kind: 'android-process', serial: entry.component.serial, pid: process.pid }) as { kind: string; startTime?: string });
    }
  }
  const identities = hostIdentities(hostComponents);
  const hostRows = identities.length ? hostInventorySchema.parse(await read(fenceEffectSchema.parse({ kind: 'host-inventory', of: identities }))) : [];
  for (const entry of owned) {
    const component = entry.component;
    switch (component.kind) {
      case 'appium-wda': {
        const found = wdaRows.filter(row => row.udid === component.udid && row.bundleId === component.bundleId && row.pid === component.pid);
        if (found.length) leftovers.push({ cycle: entry.cycle, component: component.id, kind: component.kind, found });
        break;
      }
      case 'appium-forward': {
        const found = forwardRows.filter(row => row.serial === component.serial && row.local === component.local && row.remote === component.remote);
        if (found.length) leftovers.push({ cycle: entry.cycle, component: component.id, kind: component.kind, found });
        break;
      }
      case 'appium-uiautomator2': {
        const found = component.processes.flatMap(process => {
          const state = androidRows.get(`${component.serial}:${String(process.pid)}`);
          return state?.kind === 'running' && state.startTime === process.startTime ? [{ pid: process.pid, startTime: process.startTime }] : [];
        });
        if (found.length) leftovers.push({ cycle: entry.cycle, component: component.id, kind: component.kind, found });
        break;
      }
      case 'appium-settings': {
        const values = settingsRows.get(component.serial);
        const changed = values ? settingKeySchema.options.filter(key => values[key] !== component.values[key])
          .map(key => ({ key, value: values[key] ?? null })) : [];
        if (changed.length) leftovers.push({ cycle: entry.cycle, component: component.id, kind: component.kind, found: changed });
        break;
      }
      case 'appium-process-group': {
        const members = [component.leader, ...component.members];
        const found = hostRows.filter(row => members.some(process => process.pid === row.pid && process.startTime === row.startTime));
        if (found.length) leftovers.push({ cycle: entry.cycle, component: component.id, kind: component.kind, found });
        break;
      }
      case 'appium-native-helper': {
        const found = hostRows.filter(row => row.pid === component.process.pid && row.startTime === component.process.startTime);
        if (found.length) leftovers.push({ cycle: entry.cycle, component: component.id, kind: component.kind, found });
        break;
      }
      default: break;
    }
  }
  return leftovers;
}

/** Why a cycle failed, if it did. The device's own state comes first: a quarantined device explains the rest. */
function failureOf(record: CycleRecord, device: DeviceIdentity): CycleFailure | undefined {
  const at = `cycle ${String(record.cycle)}`;
  if (record.attemptState !== 'terminal') {
    return { cycle: record.cycle, code: 'attempt-open', reason: `${at}: attempt ${record.attempt.id} is ${record.attemptState}, not terminal.` };
  }
  if (record.device !== 'available') {
    return { cycle: record.cycle, code: 'device-not-available', reason: `${at}: device ${device.value} is ${record.device}.` };
  }
  if (record.disposition !== 'available') {
    return { cycle: record.cycle, code: 'not-released', reason: `${at}: attempt ${record.attempt.id} ended as ${record.disposition}.` };
  }
  if (record.owner !== null) {
    return { cycle: record.cycle, code: 'device-owned', reason: `${at}: device ${device.value} still has an owner.` };
  }
  if (record.leftovers.length) {
    const kinds = [...new Set(record.leftovers.map(leftover => leftover.kind))].join(', ');
    return { cycle: record.cycle, code: 'leftovers', reason: `${at}: ${kinds} left behind: ${record.leftovers.map(leftover => leftover.component).join(', ')}.` };
  }
  if (!record.scenario.reachedCheckpoint) {
    return { cycle: record.cycle, code: 'scenario-incomplete', reason: `${at}: the scenario stopped before its final checkpoint (${record.scenario.reason}).` };
  }
  return undefined;
}

export interface RunCyclesOptions {
  /** Called as each cycle ends, so the caller can record it. */
  onCycle?: (record: CycleRecord) => void;
  signal?: AbortSignal;
}

/**
 * Runs the cycles, one after the other, and stops at the first that did not release the device with nothing
 * owned left. Every cycle is its own admission attempt, so a cycle never inherits another's components.
 */
export async function runCycles(count: number, backend: CycleBackend, options: RunCyclesOptions = {}): Promise<CycleResult> {
  const cycles: CycleRecord[] = [];
  const owned: OwnedComponent[] = [];
  for (let index = 1; index <= count; index++) {
    const signal = options.signal ?? new AbortController().signal;
    let run: CycleRun;
    try {
      run = await backend.cycle(index, signal);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { passed: false, cycles, failure: { cycle: index, code: 'cycle-error', reason: `cycle ${String(index)} failed: ${message}` } };
    }
    const attempt = backend.admission.readAttempt(run.attempt);
    const generation = attempt ? backend.admission.readGeneration(attempt.owner) : undefined;
    const view = backend.admission.inspect(backend.device);
    const components = ownedComponents(generation, index);
    owned.push(...components);
    const leftovers = await findLeftovers(backend, owned, signal);
    const record: CycleRecord = {
      cycle: index,
      attempt: run.attempt,
      attemptState: attempt?.state ?? 'unknown',
      disposition: attempt?.terminal?.disposition ?? 'unknown',
      device: view?.state ?? 'unknown',
      owner: view?.owner ?? null,
      leftovers,
      scenario: run.scenario,
      owned: components.length,
    };
    cycles.push(record);
    options.onCycle?.(record);
    const failure = failureOf(record, backend.device);
    if (failure) return { passed: false, cycles, failure };
  }
  return { passed: true, cycles };
}
