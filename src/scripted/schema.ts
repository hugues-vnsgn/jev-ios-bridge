import { z } from 'zod/v4';
import { PLATFORMS } from '../contracts/index.js';
import type { ScriptedScenario } from './contracts.js';
import { ROLES } from './vocabulary.js';

const key = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const bundleId = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
const udid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const printableAscii = /^[\x20-\x7e]*$/;
const identity = z.string().min(1).max(500).refine(value => value.trim().length > 0);

// Android's own rule: two or more dot-separated parts, each starting with a letter, then letters, digits or `_`.
const androidPackage = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;
// Relative (a leading dot, then a dotted name) or fully qualified (two or more dot-separated parts). A bare
// name with neither a leading dot nor an internal one is ambiguous, so it's rejected.
const androidActivity = /^(?:\.[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*|[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+)$/;
// device.serial is the adb serial as `adb devices` prints it (network serials carry a `:`).
const androidSerial = /^[A-Za-z0-9._:-]{1,100}$/;
// device.avd is an emulator's AVD name.
const androidAvd = /^[A-Za-z0-9._-]{1,100}$/;
// Any control character (C0, DEL, and C1), banned from Android typed values.
const controlCharacter = /[\u0000-\u001f\u007f-\u009f]/;

const EMPTY_VALUE_MESSAGE = 'A selector value cannot be empty: captures omit the value of an empty field ' +
  '(Compose) or report its placeholder (native), so emptiness is not selectable';

const roleSchema = z.enum(ROLES, { error: `role must be one of: ${ROLES.join(', ')}` });

export const selectorSchema = z.strictObject({
  identifier: identity.optional(),
  role: roleSchema.optional(),
  label: identity.optional(),
  value: z.string().min(1, EMPTY_VALUE_MESSAGE).max(500).optional(),
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

const actionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('tap'), selector: selectorSchema }),
  z.strictObject({ kind: z.literal('replaceText'), selector: selectorSchema, valueKey: z.string().regex(key) }),
  z.strictObject({ kind: z.literal('swipe'), selector: selectorSchema,
    direction: z.enum(['up', 'down', 'left', 'right']) }),
]);

export const SCRIPT_VERSION = 1;

const versionSchema = z.literal(SCRIPT_VERSION, { error: issue => issue.input === undefined
  ? 'Add "version": 1 to the script; this bridge reads script format version 1'
  : 'Unsupported script version; this bridge reads "version": 1' });

const launchArgument = z.string().min(1).max(200)
  .regex(/^[\x20-\x7e]+$/, 'Launch arguments must be printable ASCII text');

// Intent extras are passed with `am start --es`, so they share launchArgs' value limits.
const intentExtraValue = z.string().min(1).max(200)
  .regex(/^[\x20-\x7e]+$/, 'app.intentExtras values must be printable ASCII text');
const intentExtrasSchema = z.record(z.string().min(1).max(200), intentExtraValue)
  .refine(extras => Object.keys(extras).length <= 20, 'A script may supply at most 20 intent extras');

const stepsSchema = z.array(z.discriminatedUnion('kind', [
  z.strictObject({ id: z.string().regex(key), kind: z.literal('action'), guard: screenGuardSchema,
    action: actionSchema }),
  z.strictObject({ id: z.string().regex(key), kind: z.literal('wait'), guard: screenGuardSchema,
    until: screenGuardSchema, timeoutMs: z.number().int().min(1).max(60_000) }),
  z.strictObject({ id: z.string().regex(key), kind: z.literal('checkpoint'), guard: screenGuardSchema,
    assertions: assertionsSchema }),
])).min(1).max(100);

type Steps = z.infer<typeof stepsSchema>;

interface StepCheckContext {
  addIssue(issue: { code: 'custom'; message: string; path: (string | number)[] }): void;
}

/** The steps checks shared by every platform: a script ends at a checkpoint, step IDs are unique, and a
 *  replaceText step's valueKey names a supplied value. Each schema below runs its own platform-specific
 *  checks first, so an iOS script's issue order matches 1.1's exactly (app, then values, then steps). */
function checkSteps(scenario: { steps: Steps; values: Record<string, string> }, context: StepCheckContext): void {
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
}

// ---------- iOS: exactly 1.1's schema (frozen at 819ea10), plus an optional "platform": "ios" ----------

const iosValuesSchema = z.record(z.string().regex(key), z.string().max(2_048)
  .regex(printableAscii, 'Typed values must use printable US keyboard characters'))
  .refine(values => Object.keys(values).length <= 32, 'A script may supply at most 32 typed values')
  .refine(values => Object.values(values).every(value => !value.startsWith('-')),
    'MobileBuildMCP 2.7.1 cannot type text starting with a leading hyphen');

export const iosScriptedScenarioSchema = z.strictObject({
  version: versionSchema,
  /** Absent, or "ios": every other value routes to this schema too, and fails on this field. */
  platform: z.literal('ios').optional(),
  app: z.strictObject({
    bundleId: z.string().regex(bundleId),
    /** Passed to the app process at launch, for example a debug-only entry point such as -of-evidence-gallery. */
    launchArgs: z.array(launchArgument).max(20).optional(),
  }),
  device: z.strictObject({ udid: z.string().regex(udid).optional() }).optional(),
  preconditions: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  values: iosValuesSchema,
  steps: stepsSchema,
}).superRefine(checkSteps);

// ---------- Android: its own schema, not a refinement of the iOS one ----------

const androidValuesSchema = z.record(z.string().regex(key), z.string().max(2_048)
  .refine(value => !controlCharacter.test(value), 'Typed values must not contain control characters'))
  .refine(values => Object.keys(values).length <= 32, 'A script may supply at most 32 typed values');

export const androidScriptedScenarioSchema = z.strictObject({
  version: versionSchema,
  platform: z.literal('android'),
  app: z.strictObject({
    // Declared (rather than omitted) so a script that supplies them gets a message naming the Android
    // replacement, instead of zod's generic "unrecognized key".
    bundleId: z.string().regex(bundleId).optional(),
    launchArgs: z.array(launchArgument).max(20).optional(),
    /** The installed app's package name. Required. */
    package: z.string().regex(androidPackage,
      'app.package must be an Android package name: two or more dot-separated parts, each starting with a ' +
      'letter, then letters, digits or "_"').optional(),
    /** A specific activity to start instead of the launcher activity: relative or fully qualified. */
    activity: z.string().min(1).max(200).regex(androidActivity,
      'app.activity must be a relative (".DebugGalleryActivity") or fully qualified activity name').optional(),
    /** Passed to the launch intent with `am start --es <key> <value>`. */
    intentExtras: intentExtrasSchema.optional(),
  }),
  device: z.strictObject({
    // Declared for the same reason as app.bundleId above.
    udid: z.string().regex(udid).optional(),
    /** The adb serial exactly as `adb devices` prints it. At most one of serial or avd. */
    serial: z.string().regex(androidSerial, 'device.serial must match ^[A-Za-z0-9._:-]{1,100}$').optional(),
    /** An emulator's AVD name, stable across start order. At most one of serial or avd. */
    avd: z.string().regex(androidAvd, 'device.avd must match ^[A-Za-z0-9._-]{1,100}$').optional(),
  }).optional(),
  preconditions: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  values: androidValuesSchema,
  steps: stepsSchema,
}).superRefine((scenario, context) => {
  if (scenario.app.bundleId !== undefined) context.addIssue({ code: 'custom',
    message: 'app.bundleId is not supported on Android; use app.package', path: ['app', 'bundleId'] });
  if (scenario.app.launchArgs !== undefined) context.addIssue({ code: 'custom',
    message: 'app.launchArgs is not supported on Android; use app.intentExtras', path: ['app', 'launchArgs'] });
  if (scenario.app.package === undefined) context.addIssue({ code: 'custom',
    message: 'app.package is required on Android', path: ['app', 'package'] });
  if (scenario.device?.udid !== undefined) context.addIssue({ code: 'custom',
    message: 'device.udid is not supported on Android; use device.serial or device.avd', path: ['device', 'udid'] });
  if (scenario.device?.serial !== undefined && scenario.device?.avd !== undefined) context.addIssue({ code: 'custom',
    message: 'A script may name at most one of device.serial or device.avd', path: ['device'] });

  checkSteps(scenario, context);
});

// ---------- Merged: structure only, to generate the MCP tool's input schema (owner decision A) ----------

export const scriptedScenarioSchema = z.strictObject({
  version: versionSchema,
  platform: z.enum(PLATFORMS).optional(),
  app: z.strictObject({
    bundleId: z.string().regex(bundleId).optional(),
    launchArgs: z.array(launchArgument).max(20).optional(),
    package: z.string().regex(androidPackage,
      'app.package must be an Android package name: two or more dot-separated parts, each starting with a ' +
      'letter, then letters, digits or "_"').optional(),
    activity: z.string().min(1).max(200).regex(androidActivity,
      'app.activity must be a relative (".DebugGalleryActivity") or fully qualified activity name').optional(),
    intentExtras: intentExtrasSchema.optional(),
  }),
  device: z.strictObject({
    udid: z.string().regex(udid).optional(),
    serial: z.string().regex(androidSerial, 'device.serial must match ^[A-Za-z0-9._:-]{1,100}$').optional(),
    avd: z.string().regex(androidAvd, 'device.avd must match ^[A-Za-z0-9._-]{1,100}$').optional(),
  }).optional(),
  preconditions: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  values: z.record(z.string().regex(key), z.string().max(2_048))
    .refine(values => Object.keys(values).length <= 32, 'A script may supply at most 32 typed values'),
  steps: stepsSchema,
});

function withoutUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutUndefined);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)
      .map(([name, field]) => [name, withoutUndefined(field)]));
  }
  return value;
}

/** A script's own `platform` field decides which schema reads it; anything but exactly "android" reads as
 *  iOS, whose schema then reports its own `platform` mismatch if the value isn't "ios" either. */
function platformOf(input: unknown): 'ios' | 'android' {
  return typeof input === 'object' && input !== null && 'platform' in input &&
    (input as { platform?: unknown }).platform === 'android' ? 'android' : 'ios';
}

export function parseScriptedScenario(input: unknown): ScriptedScenario {
  const schema = platformOf(input) === 'android' ? androidScriptedScenarioSchema : iosScriptedScenarioSchema;
  return withoutUndefined(schema.parse(input)) as ScriptedScenario;
}

/** Parses by platform like {@link parseScriptedScenario}, without throwing. */
export function safeParseScriptedScenario(input: unknown) {
  return platformOf(input) === 'android' ? androidScriptedScenarioSchema.safeParse(input)
    : iosScriptedScenarioSchema.safeParse(input);
}
