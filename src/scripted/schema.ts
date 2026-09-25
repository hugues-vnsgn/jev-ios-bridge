import { z } from 'zod/v4';
import type { ScriptedScenario } from './contracts.js';

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
