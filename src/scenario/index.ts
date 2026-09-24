import { z } from 'zod/v4';
import type { RunScenario } from '../contracts/index.js';

const printableAscii = /^[\x20-\x7e]*$/;
const valueKey = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const bundleId = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
const udid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const assertionSchema = z.strictObject({
  id: z.string().regex(valueKey),
  claim: z.string().trim().min(1).max(1_000),
});
const assertionsSchema = z.array(assertionSchema).min(1).max(20).refine(
  (assertions) => new Set(assertions.map((assertion) => assertion.id)).size === assertions.length,
  'Assertion IDs must be unique within a checkpoint',
);
const valuesSchema = z.record(z.string().regex(valueKey), z.string().max(2_048)
  .regex(printableAscii, 'Typed values must use printable US keyboard characters'))
  .refine(values => Object.keys(values).length <= 32, 'A checkpoint may supply at most 32 typed values')
  .refine(values => Object.values(values).every(value => !value.startsWith('-')),
    'MobileBuildMCP 2.7.1 AXe cannot type text starting with a leading hyphen');
const common = {
  app: z.strictObject({ bundleId: z.string().regex(bundleId) }),
  preconditions: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  device: z.strictObject({ udid: z.string().regex(udid).optional() }).optional(),
};

const legacyScenarioSchema = z.strictObject({
  ...common,
  goal: z.string().trim().min(1).max(2_000),
  assertions: assertionsSchema,
  values: valuesSchema,
});

const checkpointScenarioSchema = z.strictObject({
  ...common,
  checkpoints: z.array(z.strictObject({
    id: z.string().regex(valueKey),
    goal: z.string().trim().min(1).max(2_000),
    assertions: assertionsSchema,
    values: valuesSchema.optional(),
  })).min(2).max(10).refine(
    checkpoints => new Set(checkpoints.map(checkpoint => checkpoint.id)).size === checkpoints.length,
    'Checkpoint IDs must be unique',
  ),
});

export const scenarioSchema = z.union([legacyScenarioSchema, checkpointScenarioSchema]);

export function parseScenario(input: unknown): RunScenario {
  const parsed = scenarioSchema.parse(input);
  const commonFields = {
    app: parsed.app,
    ...(parsed.preconditions !== undefined ? { preconditions: parsed.preconditions } : {}),
    ...(parsed.device !== undefined ? { device: parsed.device.udid !== undefined ? { udid: parsed.device.udid } : {} } : {}),
  };
  return 'checkpoints' in parsed
    ? { ...commonFields, checkpoints: parsed.checkpoints.map(checkpoint => ({
        id: checkpoint.id, goal: checkpoint.goal, assertions: checkpoint.assertions,
        ...(checkpoint.values !== undefined ? { values: checkpoint.values } : {}),
      })) }
    : { ...commonFields, goal: parsed.goal, assertions: parsed.assertions, values: parsed.values };
}
