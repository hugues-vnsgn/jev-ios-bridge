import { z } from 'zod/v4';
import type { Scenario } from '../contracts/index.js';

const printableAscii = /^[\x20-\x7e]*$/;
const valueKey = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const bundleId = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
const udid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const scenarioSchema = z.strictObject({
  goal: z.string().trim().min(1).max(2_000),
  app: z.strictObject({ bundleId: z.string().regex(bundleId) }),
  assertions: z.array(z.strictObject({
    id: z.string().regex(valueKey),
    claim: z.string().trim().min(1).max(1_000),
  })).min(1).max(20).refine(
    (assertions) => new Set(assertions.map((assertion) => assertion.id)).size === assertions.length,
    'Assertion IDs must be unique',
  ),
  values: z.record(z.string().regex(valueKey), z.string().max(2_048).regex(printableAscii, 'Typed values must use printable US keyboard characters')),
  preconditions: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  device: z.strictObject({ udid: z.string().regex(udid).optional() }).optional(),
});

export function parseScenario(input: unknown): Scenario {
  const parsed = scenarioSchema.parse(input);
  return {
    goal: parsed.goal,
    app: parsed.app,
    assertions: parsed.assertions,
    values: parsed.values,
    ...(parsed.preconditions !== undefined ? { preconditions: parsed.preconditions } : {}),
    ...(parsed.device !== undefined ? { device: parsed.device.udid !== undefined ? { udid: parsed.device.udid } : {} } : {}),
  };
}
