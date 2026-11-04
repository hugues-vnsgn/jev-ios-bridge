import { z } from 'zod/v4';

export const DEVICE_SCOPES = ['ios-simulator', 'android-emulator', 'android-phone'] as const;
export type DeviceScope = typeof DEVICE_SCOPES[number];

const text = z.string().min(1);
/** `path:line`, `path:start-end`, or `<git object>:path:line` for a file that exists only in history. */
const source = z.string().regex(/^(?:[0-9a-f]{7,40}:)?[^:\s]+:\d+(?:-\d+)?$/);

export const liveRowSchema = z.strictObject({
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]*$/),
  group: z.enum(['category', 'observed', 'carry-over', 'baseline']),
  title: text,
  source,
  devices: z.array(z.enum(DEVICE_SCOPES)).min(1),
  steps: z.array(text).min(1),
  expected: text,
  evidence: z.array(text).min(1),
  /** storeActivation: the row runs the bridge against a device, which opens the real per-user admission store. */
  needs: z.strictObject({ storeActivation: z.boolean(), phone: z.boolean(), jevKey: z.boolean() }),
  /** `cycles` rows run the repeated-cleanup harness; `operator` rows are driven by hand and recorded through the runner. */
  executor: z.enum(['cycles', 'operator']),
  status: z.literal('untested'),
});
export type LiveRow = z.infer<typeof liveRowSchema>;

export const liveMatrixSchema = z.strictObject({
  version: z.literal(1),
  spec: text,
  rows: z.array(liveRowSchema).min(1).refine(rows => new Set(rows.map(row => row.id)).size === rows.length, 'Row ids must be unique'),
});
export type LiveMatrix = z.infer<typeof liveMatrixSchema>;
