/**
 * Proves an iOS script reads exactly as in 1.1: the same parsed script, or the same issues (paths,
 * messages, order) and the same z.prettifyError text. Compares the public parse entry points against a
 * frozen copy of 1.1's schema on a generated set of scripts: the valid script, every single fault, and
 * every pair and triple of the faults below, each with no platform and with an explicit "platform": "ios".
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod/v4';
import { parseScriptedScenario, safeParseScriptedScenario, scriptedScenarioSchema } from '../src/scripted/schema.js';
import { parseScriptedScenario as frozenParse, scriptedScenarioSchema as frozenSchema }
  from './fixtures/frozen-schema-819ea10/schema.js';

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

/** What a reader of a parse result sees: the parsed script, or the issues and their printed form. */
function outcomeOf(result: z.ZodSafeParseResult<unknown>): unknown {
  return result.success ? { data: result.data }
    : { issues: result.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })),
      printed: z.prettifyError(result.error) };
}

/** parseScriptedScenario's outcome: its parsed script, or the issues and printed form of what it threw. */
function thrownOutcomeOf(parse: (input: unknown) => unknown, input: unknown): unknown {
  try { return { data: parse(input) }; }
  catch (error) {
    assert.ok(error instanceof z.ZodError);
    return outcomeOf({ success: false, error });
  }
}

const cases = [...combinationsOf(names, 0), ...combinationsOf(names, 1), ...combinationsOf(names, 2),
  ...combinationsOf(names, 3)];

test(`an iOS script reads as in 1.1, for the valid script and every single fault, pair and triple of ${names.length} faults`, () => {
  assert.ok(cases.length > 800, `expected a thorough combination set, got ${cases.length}`);
  const mismatches: string[] = [];
  for (const combo of cases) {
    const input = apply(base, combo);
    const expected = outcomeOf(frozenSchema.safeParse(input));
    const expectedParsed = thrownOutcomeOf(frozenParse, input);
    for (const platform of [undefined, 'ios'] as const) {
      const live = platform ? { ...input, platform } : input;
      // 1.1 had no platform field, so an explicit "ios" appears only in the live parse's output.
      const withPlatform = (outcome: unknown): unknown => platform && typeof outcome === 'object' && outcome &&
        'data' in outcome ? { data: { ...(outcome.data as object), platform } } : outcome;
      const label = `${combo.join(' + ') || 'valid'}${platform ? ' (platform: ios)' : ''}`;
      try {
        assert.deepEqual(outcomeOf(safeParseScriptedScenario(live)), withPlatform(expected));
        assert.deepEqual(outcomeOf(scriptedScenarioSchema.safeParse(live)),
          'data' in (expected as object) ? { data: live } : expected);
        assert.deepEqual(thrownOutcomeOf(parseScriptedScenario, live), withPlatform(expectedParsed));
      } catch { mismatches.push(label); }
    }
  }
  assert.deepEqual(mismatches, []);
});
