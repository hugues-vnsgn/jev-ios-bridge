import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Snapshot } from '../../../src/contracts/index.js';
import { parseSnapshot } from '../../../src/device/index.js';
import { parseScriptedScenario } from '../schema.js';
import { assertScreenGuard, resolveActionTarget, ScriptSelectionError } from '../select.js';

const root = process.cwd();
const read = (path: string) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const scripted = read('spikes/scripted/corpus/corpus.json') as { cases: { id: string; snapshot: Snapshot }[] };
const v3 = read('spikes/feasibility/corpus-v3/corpus.json') as { cases: { id: string; fullSnapshot: Snapshot }[] };
const udid = '0E42FDE2-5E09-42D3-9876-9EF0037FCBE7';
const pinnedTapAlias = { tapAliasRule: 'mobilebuildmcp-2.7.1' } as const;
const byId = (id: string): Snapshot => {
  const current = scripted.cases.find(item => item.id === id);
  if (current) return current.snapshot;
  const old = v3.cases.find(item => item.id === id);
  if (old) return old.fullSnapshot;
  const raw = read(`spikes/scripted/integration/preflight/${id}.full.json`);
  return parseSnapshot(raw.data, udid);
};
const fixtures: Record<string, string[]> = {
  'w01-locations-open': ['s04-weather-lisbon-main', 'v3-w01-location-picker'],
  'w02-distance-km': ['s04-weather-lisbon-main', 's05-weather-lisbon-distance-mi',
    's06-weather-lisbon-distance-km', 's06-weather-lisbon-distance-km'],
  'w03-distance-mi-claim': ['s04-weather-lisbon-main', 's05-weather-lisbon-distance-mi',
    's06-weather-lisbon-distance-km', 's06-weather-lisbon-distance-km'],
  'c01-nina-no-results': ['launch-contacts-plain', 's14-contacts-nina-calder-no-results', 's14-contacts-nina-calder-no-results'],
  'c02-nina-card-claim': ['launch-contacts-plain', 's14-contacts-nina-calder-no-results', 's14-contacts-nina-calder-no-results'],
  'c03-nolan-edit-final': ['launch-contacts-plain', 'nolan-duplicate-result',
    'nolan-duplicate-result', 's12-contacts-nolan-new-email-saved', 's11-contacts-nolan-new-email-unsaved'],
  'r01-signal-kit-note': ['reminders-lists', 's21-reminders-charge-lantern-note-saved'],
  'r02-signal-kit-empty-claim': ['reminders-lists', 's21-reminders-charge-lantern-note-saved'],
  'r03-reminders-search-claim': ['reminders-lists', 'reminders-search'],
  'd01-bread-selected': ['v3-d01-shop-empty', 's22-diagnostic-bread-selected', 's22-diagnostic-bread-selected'],
  'd02-bread-first-total-claim': ['v3-d01-shop-empty', 's22-diagnostic-bread-selected',
    's23-diagnostic-bread-apple-selected', 's24-diagnostic-bread-first-total2'],
  'd03-apple-first-order-claim': ['v3-d01-shop-empty', 'v3-d02-apple-selected', 'v3-d03-both-selected', 'v3-d03-both-selected'],
};
let checked = 0;
for (const [id, states] of Object.entries(fixtures)) {
  const script = parseScriptedScenario(read(`spikes/scripted/integration/scenarios/${id}.json`));
  if (script.steps.length !== states.length) throw new Error(`${id}: fixture count mismatch`);
  for (const [index, step] of script.steps.entries()) {
    const snapshot = byId(states[index]!);
    try {
      assertScreenGuard(snapshot, step.guard, pinnedTapAlias);
      if (step.kind === 'action') {
        const capability = step.action.kind === 'replaceText' ? 'typeText'
          : step.action.kind === 'swipe' ? 'swipeWithin' : 'tap';
        resolveActionTarget(snapshot, step.action.selector, capability, pinnedTapAlias);
      }
      if (step.kind === 'wait') assertScreenGuard(snapshot, step.until, pinnedTapAlias);
      checked++;
    } catch (error) {
      throw new Error(`${id}/${step.id} fixture ${states[index]}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
for (const id of ['c01-nina-no-results', 'c02-nina-card-claim', 'c03-nolan-edit-final']) {
  const script = parseScriptedScenario(read(`spikes/scripted/integration/scenarios/${id}.json`));
  const step = script.steps[0]!;
  if (step.kind !== 'action') throw new Error(`${id}: expected initial action`);
  for (const restored of ['launch-contacts-after-card', 'launch-contacts-after-list']) {
    const restoredSearch = byId(restored);
    assertScreenGuard(restoredSearch, step.guard, pinnedTapAlias);
    resolveActionTarget(restoredSearch, step.action.selector, 'typeText', pinnedTapAlias);
  }
  for (const excluded of ['s11-contacts-nolan-new-email-unsaved', 's12-contacts-nolan-new-email-saved']) {
    try { assertScreenGuard(byId(excluded), step.guard, pinnedTapAlias); }
    catch (error) {
      if (error instanceof ScriptSelectionError && error.code.startsWith('GUARD_')) continue;
      throw error;
    }
    throw new Error(`${id}: first guard accepted ${excluded}`);
  }
}
const faultFixtures = [
  ['f01-missing-target', 'v3-d01-shop-empty', 'TARGET_MISSING'],
  ['f02-ambiguous-target', 'v3-d01-shop-empty', 'TARGET_AMBIGUOUS'],
] as const;
for (const [id, fixture, expected] of faultFixtures) {
  const scenario = parseScriptedScenario(read(`spikes/scripted/integration/faults/${id}.json`));
  const step = scenario.steps[0]!;
  if (step.kind !== 'action') throw new Error(`${id}: expected action`);
  const snapshot = byId(fixture);
  assertScreenGuard(snapshot, step.guard, pinnedTapAlias);
  try { resolveActionTarget(snapshot, step.action.selector, 'tap', pinnedTapAlias); }
  catch (error) {
    if (error instanceof ScriptSelectionError && error.code === expected) continue;
    throw error;
  }
  throw new Error(`${id}: failed to produce ${expected}`);
}
const cancel = parseScriptedScenario(read('spikes/scripted/integration/faults/f03-cancel-wait.json'));
const waitStep = cancel.steps[0]!;
if (waitStep.kind !== 'wait') throw new Error('f03: expected wait');
assertScreenGuard(byId('v3-d01-shop-empty'), waitStep.guard, pinnedTapAlias);
let markerMissing = false;
try { assertScreenGuard(byId('v3-d01-shop-empty'), waitStep.until, pinnedTapAlias); }
catch (error) {
  if (!(error instanceof ScriptSelectionError) || error.code !== 'GUARD_MISSING') throw error;
  markerMissing = true;
}
if (!markerMissing) throw new Error('f03: cancellation marker already present');
process.stdout.write(`Validated ${checked} guarded steps, six alternate Contacts starts, six rejected card/editor starts, and three fault setups against saved full simulator snapshots. No Jev calls.\n`);
