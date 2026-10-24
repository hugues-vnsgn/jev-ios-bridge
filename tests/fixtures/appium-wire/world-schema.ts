import { z } from 'zod/v4';
import { extensionErrorCodeSchema } from '../../../src/appium/wire-schemas.js';

const faultSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('lost') }),
  z.strictObject({ kind: z.literal('late'), ms: z.number().int().min(0) }),
  z.strictObject({ kind: z.literal('held') }),
  z.strictObject({ kind: z.literal('error'), code: extensionErrorCodeSchema }),
  z.strictObject({ kind: z.literal('exit'), code: z.number().int() }),
  z.strictObject({ kind: z.literal('disconnect') }),
  z.strictObject({ kind: z.literal('malformed') }),
  z.strictObject({ kind: z.literal('schema') }),
]);
const ruleSchema = z.strictObject({ tool: z.string(), nth: z.number().int().min(1).optional(), when: z.string().optional(),
  match: z.record(z.string(), z.unknown()).optional(), to: z.string().optional(), fault: faultSchema.optional() });
/** A controllable private MCP provider: screens as page sources, and rules that answer, fault or move to another screen
 *  per tool call. Every request and reply passes the bridge's shared wire schemas. */
export const worldSchema = z.strictObject({ platform: z.enum(['ios', 'android']), sessionId: z.string(), start: z.string(),
  screens: z.record(z.string(), z.string()), rules: z.array(ruleSchema), png: z.string(),
  rect: z.strictObject({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }) });
export type World = z.infer<typeof worldSchema>;
export type WorldRule = z.infer<typeof ruleSchema>;
