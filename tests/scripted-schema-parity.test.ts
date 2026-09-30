/**
 * Proves an iOS script's issue list (paths, messages, and order) didn't move when Android's fields were
 * added. Compares the live iOS schema against a frozen copy of 1.1's schema (commit 819ea10, before
 * Android) on a generated set of scripts: every single fault, and every pair and triple of 17 faults
 * (2026-09-30, owner ruling: a reviewer found 189 of 697 multi-error iOS inputs printed differently under
 * "one object schema plus a platform-aware refinement", the design this replaces).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { iosScriptedScenarioSchema } from '../src/scripted/schema.js';
import { scriptedScenarioSchema as frozenSchema } from './fixtures/frozen-schema-819ea10/schema.js';

const base = {
  version: 1,
  app: { bundleId: 'com.example.app', launchArgs: ['-flag'] },
  device: { udid: '0E42FDE2-5E09-42D3-9876-9EF0037FCBE7' },
  values: { query: 'Berlin' },
  steps: [
    { id: 'type', kind: 'action', guard: { present: [{ identifier: 'search.field', role: 'text-field' }] },
      action: { kind: 'replaceText', selector: { identifier: 'search.field', role: 'text-field' }, valueKey: 'query' } },
    { id: 'verify', kind: 'checkpoint', guard: { present: [{ role: 'text', label: 'Marker' }] },
      assertions: [{ id: 'shown', claim: 'Marker visible.' }] },
  ],
};

type Script = Record<string, unknown>;
const clone = (script: Script): Script => structuredClone(script);

/** Each fault mutates one part of an otherwise-valid script. Applying several composes their mutations,
 *  so a pair or triple exercises more than one rejected field or check at once. */
const faults: Record<string, (script: Script) => Script> = {
  missingVersion: script => { delete script.version; return script; },
  futureVersion: script => { script.version = 2; return script; },
  missingBundleId: script => { delete (script.app as Script).bundleId; return script; },
  malformedBundleId: script => { (script.app as Script).bundleId = 'not valid!!'; return script; },
  controlCharacterLaunchArg: script => { (script.app as Script).launchArgs = ['-a\nb']; return script; },
  emptyLaunchArg: script => { (script.app as Script).launchArgs = ['']; return script; },
  badUdid: script => { (script.device as Script).udid = 'not-a-udid'; return script; },
  unknownRole: script => {
    const checkpoint = (script.steps as Script[])[1];
    if (checkpoint) (checkpoint.guard as Script).present = [{ role: 'StaticText', label: 'Marker' }];
    return script;
  },
  selectorWithoutIdentity: script => {
    const checkpoint = (script.steps as Script[])[1];
    if (checkpoint) (checkpoint.guard as Script).present = [{ value: 'x' }];
    return script;
  },
  leadingHyphenValue: script => { script.values = { query: '-Berlin' }; return script; },
  nonAsciiValue: script => { script.values = { query: 'Đà Nẵng' }; return script; },
  tooManyValues: script => {
    script.values = Object.fromEntries(Array.from({ length: 33 }, (_, index) => [`v${index}`, 'x']));
    return script;
  },
  duplicateStepIds: script => {
    const [first, second] = script.steps as Script[];
    if (first && second) first.id = second.id;
    return script;
  },
  endsWithAction: script => { script.steps = [(script.steps as Script[])[0]]; return script; },
  unknownValueKey: script => {
    ((script.steps as Script[])[0]!.action as Script).valueKey = 'missing';
    return script;
  },
  duplicateAssertionIds: script => {
    const checkpoint = (script.steps as Script[])[1];
    if (checkpoint) checkpoint.assertions = [{ id: 'shown', claim: 'A' }, { id: 'shown', claim: 'B' }];
    return script;
  },
  unrecognizedTopLevelKey: script => { script.extra = 'nope'; return script; },
};

const names = Object.keys(faults);

function apply(script: Script, combo: string[]): Script {
  return combo.reduce((current, name) => faults[name]!(current), clone(script));
}

function combinationsOf(pool: string[], size: number): string[][] {
  if (size === 0) return [[]];
  if (pool.length < size) return [];
  const [head, ...tail] = pool;
  if (head === undefined) return [];
  return [...combinationsOf(tail, size - 1).map(rest => [head, ...rest]), ...combinationsOf(tail, size)];
}

function issuesOf(result: ReturnType<typeof iosScriptedScenarioSchema.safeParse>): Array<{ path: string; message: string }> {
  return result.success ? [] : result.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message }));
}

const cases = [...combinationsOf(names, 1), ...combinationsOf(names, 2), ...combinationsOf(names, 3)];

test(`an iOS script's issue list matches 1.1's, for every single fault and every pair and triple of ${names.length} faults`, () => {
  assert.ok(cases.length > 800, `expected a thorough combination set, got ${cases.length}`);
  const mismatches: string[] = [];
  for (const combo of cases) {
    const input = apply(base, combo);
    const frozenResult = frozenSchema.safeParse(input);
    const liveResult = iosScriptedScenarioSchema.safeParse(input);
    const frozenIssues = issuesOf(frozenResult as ReturnType<typeof iosScriptedScenarioSchema.safeParse>);
    const liveIssues = issuesOf(liveResult);
    try { assert.deepEqual(liveIssues, frozenIssues); }
    catch { mismatches.push(combo.join(' + ')); }
  }
  assert.deepEqual(mismatches, []);
});
