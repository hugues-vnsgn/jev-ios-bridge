import { z } from 'zod/v4';
import type { ScriptedCorpus, ScriptedScenario } from './contracts.js';

const key = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const bundleId = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
const udid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const printableAscii = /^[\x20-\x7e]*$/;
const identity = z.string().min(1).max(500).refine(value => value.trim().length > 0);

export const selectorSchema = z.strictObject({
  identifier: identity.optional(),
  role: identity.optional(),
  label: identity.optional(),
  value: z.string().max(500).optional(),
}).refine(selector => Boolean(selector.identifier || selector.role || selector.label),
  'A selector needs an identifier, role, or label; value is only a filter');

export const screenGuardSchema = z.strictObject({
  present: z.array(selectorSchema).min(1).max(12),
  absent: z.array(selectorSchema).max(12).optional(),
});

const assertionSchema = z.strictObject({
  id: z.string().regex(key),
  claim: z.string().trim().min(1).max(1_000),
});
const assertionsSchema = z.array(assertionSchema).min(1).max(20).refine(
  assertions => new Set(assertions.map(assertion => assertion.id)).size === assertions.length,
  'Assertion IDs must be unique within a checkpoint',
);
const valuesSchema = z.record(z.string().regex(key), z.string().max(2_048)
  .regex(printableAscii, 'Typed values must use printable US keyboard characters'))
  .refine(values => Object.keys(values).length <= 32, 'A script may supply at most 32 typed values')
  .refine(values => Object.values(values).every(value => !value.startsWith('-')),
    'MobileBuildMCP 2.7.1 cannot type text starting with a leading hyphen');

const actionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('tap'), selector: selectorSchema }),
  z.strictObject({ kind: z.literal('replaceText'), selector: selectorSchema, valueKey: z.string().regex(key) }),
  z.strictObject({ kind: z.literal('swipe'), selector: selectorSchema,
    direction: z.enum(['up', 'down', 'left', 'right']) }),
]);

export const scriptedScenarioSchema = z.strictObject({
  app: z.strictObject({ bundleId: z.string().regex(bundleId) }),
  device: z.strictObject({ udid: z.string().regex(udid).optional() }).optional(),
  preconditions: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  values: valuesSchema,
  steps: z.array(z.discriminatedUnion('kind', [
    z.strictObject({ id: z.string().regex(key), kind: z.literal('action'), guard: screenGuardSchema,
      action: actionSchema }),
    z.strictObject({ id: z.string().regex(key), kind: z.literal('wait'), guard: screenGuardSchema,
      until: screenGuardSchema, timeoutMs: z.number().int().min(1).max(60_000) }),
    z.strictObject({ id: z.string().regex(key), kind: z.literal('checkpoint'), guard: screenGuardSchema,
      assertions: assertionsSchema }),
  ])).min(1).max(100),
}).superRefine((scenario, context) => {
  if (scenario.steps.at(-1)?.kind !== 'checkpoint') {
    context.addIssue({ code: 'custom', message: 'A script must end at an assertion checkpoint', path: ['steps'] });
  }
  const seen = new Set<string>();
  for (const [index, step] of scenario.steps.entries()) {
    if (seen.has(step.id)) context.addIssue({ code: 'custom', message: 'Step IDs must be unique', path: ['steps', index, 'id'] });
    seen.add(step.id);
    if (step.kind === 'action' && step.action.kind === 'replaceText' &&
        !Object.hasOwn(scenario.values, step.action.valueKey)) {
      context.addIssue({ code: 'custom', message: 'replaceText valueKey must name a supplied value',
        path: ['steps', index, 'action', 'valueKey'] });
    }
  }
});

function withoutUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutUndefined);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)
      .map(([name, field]) => [name, withoutUndefined(field)]));
  }
  return value;
}

export function parseScriptedScenario(input: unknown): ScriptedScenario {
  return withoutUndefined(scriptedScenarioSchema.parse(input)) as ScriptedScenario;
}

const frameSchema = z.strictObject({ x: z.number().finite(), y: z.number().finite(),
  width: z.number().finite(), height: z.number().finite() });
const elementSchema = z.strictObject({
  ref: z.string().min(1), role: z.string().min(1), label: z.string().optional(), value: z.string().optional(),
  identifier: z.string().optional(), frame: frameSchema.optional(),
  state: z.strictObject({ enabled: z.boolean(), visible: z.boolean(), focused: z.boolean().optional(),
    selected: z.boolean().optional() }).optional(),
  actions: z.array(z.string()),
});
const snapshotSchema = z.strictObject({
  deviceId: z.string().min(1), capturedAt: z.number().finite(), expiresAt: z.number().finite(),
  sequence: z.number().int().nonnegative(), elements: z.array(elementSchema).min(1),
  truncated: z.literal(false), screenHash: z.string().optional(), screenshotPath: z.string().optional(),
  logTails: z.record(z.string(), z.string()).optional(),
});
const hash = /^[a-f0-9]{64}$/;
const corpusClaimSchema = z.strictObject({
  id: z.enum(['a', 'b']), claim: z.string().trim().min(1).max(1_000),
  expected: z.boolean(), rationale: z.string().trim().min(1).max(1_000),
});
const assertionCaseSchema = z.strictObject({
  id: z.string().regex(key), workflowGroup: z.string().regex(key),
  app: z.strictObject({ bundleId: z.string().regex(bundleId) }),
  setupSteps: z.array(z.string().trim().min(1).max(500)).min(1).max(30),
  snapshot: snapshotSchema,
  claims: z.tuple([corpusClaimSchema, corpusClaimSchema]).refine(
    claims => claims[0].id !== claims[1].id && claims[0].expected !== claims[1].expected,
    'Each screen needs neutral a/b IDs and one true plus one false claim'),
  assets: z.strictObject({ fullPath: z.string().min(1), screenshotPath: z.string().min(1),
    sha256: z.strictObject({ full: z.string().regex(hash), screenshot: z.string().regex(hash) }) }),
});

export const scriptedCorpusSchema = z.strictObject({
  version: z.literal(1), cases: z.array(assertionCaseSchema).length(24),
}).superRefine((corpus, context) => {
  if (new Set(corpus.cases.map(item => item.id)).size !== 24) {
    context.addIssue({ code: 'custom', message: 'Case IDs must be unique', path: ['cases'] });
  }
  if (new Set(corpus.cases.map(item => item.workflowGroup)).size < 8) {
    context.addIssue({ code: 'custom', message: 'At least eight workflow groups are required', path: ['cases'] });
  }
  if (new Set(corpus.cases.map(item => item.app.bundleId)).size < 3) {
    context.addIssue({ code: 'custom', message: 'At least three apps are required', path: ['cases'] });
  }
  if (corpus.cases.filter(item => item.claims[0].expected).length !== 12) {
    context.addIssue({ code: 'custom', message: 'Claim order must be balanced 12 true-first and 12 false-first', path: ['cases'] });
  }
  if (corpus.cases.filter(item => item.claims.find(claim => claim.id === 'a')?.expected).length !== 12) {
    context.addIssue({ code: 'custom', message: 'Neutral ID a must be true on 12 cases and false on 12', path: ['cases'] });
  }
});

export function parseScriptedCorpus(input: unknown): ScriptedCorpus {
  return withoutUndefined(scriptedCorpusSchema.parse(input)) as ScriptedCorpus;
}
