import { z } from 'zod/v4';
import { PLATFORMS, type Platform } from '../contracts/index.js';
import type { ScriptedScenario, ScriptedScenarioSource, ScriptValue } from './contracts.js';
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
// device.serial is the adb serial as `adb devices` prints it (network serials carry a `:`). Exported so
// the CLI's device choice can check JEV_ANDROID_DEVICE against the same pattern.
export const androidSerial = /^[A-Za-z0-9._:-]{1,100}$/;
// device.avd is an emulator's AVD name. Exported for the same reason.
export const androidAvd = /^[A-Za-z0-9._-]{1,100}$/;
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
/** The script format version of a script with a `do` step, `goal` or `start` (driven mode). */
export const DRIVEN_SCRIPT_VERSION = 2;

const versionSchema = z.literal(SCRIPT_VERSION, { error: issue => issue.input === undefined
  ? 'Add "version": 1 to the script; this bridge reads script format version 1'
  : 'Unsupported script version; this bridge reads "version": 1' });

const DRIVEN_SCRIPT_PHRASE = 'a script with a "do" step, "goal" or "start"';
const drivenVersionSchema = z.literal(DRIVEN_SCRIPT_VERSION, { error: issue => issue.input === undefined
  ? `Add "version": 2 to the script; ${DRIVEN_SCRIPT_PHRASE} uses script format version 2`
  : `Unsupported script version; ${DRIVEN_SCRIPT_PHRASE} needs "version": 2` });

/** The message a version 1 script gets for a field only version 2 has. */
function needsVersion2(field: string): string {
  return `${field} needs "version": 2; this script says "version": 1`;
}

/** A short printable-ASCII string (1 to 200 characters), the shape both `launchArgs` items and
 *  `intentExtras` values take: intent extras are passed with `am start --es`, so they share launchArgs'
 *  value limits. */
function printableAsciiField(message: string) {
  return z.string().min(1).max(200).regex(/^[\x20-\x7e]+$/, message);
}

const launchArgument = printableAsciiField('Launch arguments must be printable ASCII text');
const intentExtraValue = printableAsciiField('app.intentExtras values must be printable ASCII text');
const intentExtrasSchema = z.record(z.string().min(1).max(200), intentExtraValue)
  .refine(extras => Object.keys(extras).length <= 20, 'A script may supply at most 20 intent extras');

const scriptedStepSchemas = [
  z.strictObject({ id: z.string().regex(key), kind: z.literal('action'), guard: screenGuardSchema,
    action: actionSchema }),
  z.strictObject({ id: z.string().regex(key), kind: z.literal('wait'), guard: screenGuardSchema,
    until: screenGuardSchema, timeoutMs: z.number().int().min(1).max(60_000) }),
  z.strictObject({ id: z.string().regex(key), kind: z.literal('checkpoint'), guard: screenGuardSchema,
    assertions: assertionsSchema }),
] as const;

/** Version 2 text a person writes for Jev: 1 to 500 characters, not blank. */
function driverText(message: string) {
  return z.string({ error: message }).trim().min(1, message).max(500, message);
}

/** A `do` step as the MCP tool publishes it. */
const publishedDoStepSchema = z.strictObject({
  id: z.string().regex(key),
  kind: z.literal('do'),
  intent: driverText('A do step\'s intent must be 1 to 500 characters'),
  doneWhen: driverText('A do step\'s doneWhen must be 1 to 500 characters'),
  effect: z.enum(['none', 'test_write', 'destructive'],
    { error: 'A do step\'s effect must be "none", "test_write" or "destructive"' }),
  /** The keys of `values` this step may type. */
  values: z.array(z.string().regex(key)).max(32).optional(),
  localOnly: z.boolean().optional(),
});
// Declared (rather than left to "unrecognized key") so a guard copied from a scripted step gets a message
// saying why a do step has none.
const doStepSchema = publishedDoStepSchema.extend({
  guard: z.never({ error: 'A do step has no guard: the bridge reads the screen itself' }).optional(),
});
/** A version 1 script's do step, read only to say it needs version 2. */
const doStepInVersion1Schema = z.object({ id: z.unknown(), kind: z.literal('do') }).superRefine((_step, context) => {
  context.addIssue({ code: 'custom', message: needsVersion2('A "do" step') });
});

const stepsSchema = z.array(z.discriminatedUnion('kind', [...scriptedStepSchemas, doStepInVersion1Schema]))
  .min(1).max(100);
const drivenStepsSchema = z.array(z.discriminatedUnion('kind', [...scriptedStepSchemas, doStepSchema])).min(1).max(100);

type Step = z.infer<typeof stepsSchema>[number] | z.infer<typeof drivenStepsSchema>[number];
type StepsAndValues = { steps: readonly Step[]; values: Record<string, unknown> };

interface StepCheckContext {
  addIssue(issue: { code: 'custom'; message: string; path: (string | number)[] }): void;
}

/** The steps checks shared by every platform: a script ends at a checkpoint, step IDs are unique, and a
 *  replaceText step's valueKey, or a do step's values, name supplied values. The Android schema runs its
 *  app and device checks before these. */
function checkSteps(scenario: StepsAndValues, context: StepCheckContext): void {
  if (scenario.steps.at(-1)?.kind !== 'checkpoint') {
    context.addIssue({ code: 'custom', message: 'A script must end at an assertion checkpoint', path: ['steps'] });
  }
  const seen = new Set<unknown>();
  for (const [index, step] of scenario.steps.entries()) {
    if (seen.has(step.id)) context.addIssue({ code: 'custom', message: 'Step IDs must be unique', path: ['steps', index, 'id'] });
    seen.add(step.id);
    if (step.kind === 'action' && step.action.kind === 'replaceText' &&
        !Object.hasOwn(scenario.values, step.action.valueKey)) {
      context.addIssue({ code: 'custom', message: 'replaceText valueKey must name a supplied value',
        path: ['steps', index, 'action', 'valueKey'] });
    }
    if (step.kind === 'do' && 'values' in step && Array.isArray(step.values)) {
      for (const [position, valueKey] of step.values.entries()) {
        if (typeof valueKey === 'string' && !Object.hasOwn(scenario.values, valueKey)) {
          context.addIssue({ code: 'custom', message: 'A do step\'s values must each name a supplied value',
            path: ['steps', index, 'values', position] });
        }
      }
    }
  }
}

/** The top-level fields version 2 adds. */
const drivenFields = {
  goal: driverText('goal must be 1 to 500 characters').optional(),
  start: z.enum(['restart', 'attach'], { error: 'start must be "restart" or "attach"' }).optional(),
};
/** Version 1 declares them only to say they need version 2. */
const drivenFieldsInVersion1 = {
  goal: z.never({ error: needsVersion2('"goal"') }).optional(),
  start: z.never({ error: needsVersion2('"start"') }).optional(),
};
// The old goal-mode form (a `goal` beside top-level `assertions`, no steps) leaves `goal` an unrecognized key,
// as in 1.2: tests/golden/scripts.json (legacyGoalForm) freezes that message.
const { goal: _goal, ...drivenFieldsInGoalForm } = drivenFieldsInVersion1;

/** The parts of a platform schema that differ by script version. */
interface VersionParts {
  version: z.ZodType<number>;
  fields: Record<string, z.ZodType>;
  steps: z.ZodType<Step[]>;
}
const version1Parts = { version: versionSchema, fields: drivenFieldsInVersion1, steps: stepsSchema } satisfies VersionParts;
const goalFormParts = { version: versionSchema, fields: drivenFieldsInGoalForm, steps: stepsSchema } satisfies VersionParts;
const version2Parts = { version: drivenVersionSchema, fields: drivenFields, steps: drivenStepsSchema } satisfies VersionParts;

// ---------- Fields, each defined once and shared by the schemas below ----------

const bundleIdField = z.string().regex(bundleId);
/** Passed to the app process at launch, for example a debug-only entry point such as -of-evidence-gallery. */
const launchArgsField = z.array(launchArgument).max(20);
/** The installed app's package name. */
const packageField = z.string().regex(androidPackage,
  'app.package must be an Android package name: two or more dot-separated parts, each starting with a ' +
  'letter, then letters, digits or "_"');
/** A specific activity to start instead of the launcher activity: relative or fully qualified. */
const activityField = z.string().min(1).max(200).regex(androidActivity,
  'app.activity must be a relative (".DebugGalleryActivity") or fully qualified activity name');
const udidField = z.string().regex(udid);
/** The adb serial exactly as `adb devices` prints it. */
const serialField = z.string().regex(androidSerial, `device.serial must match ${androidSerial.source}`);
/** An emulator's AVD name, stable across start order. */
const avdField = z.string().regex(androidAvd, `device.avd must match ${androidAvd.source}`);
const preconditionsField = z.array(z.string().trim().min(1).max(500)).max(20);

/** An environment variable's name, as a shell writes one. */
const envName = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
/** A typed value read from the bridge's environment when a run starts, so a secret stays out of the script. */
const fromEnvSchema = z.strictObject({ fromEnv: z.string().regex(envName,
  'fromEnv must name an environment variable: letters, digits and "_", not starting with a digit') });

/** Typed values by key, at most 32 of them, each value read by `value`. */
function typedValues(value: z.ZodType<ScriptValue>) {
  return z.record(z.string().regex(key), value)
    .refine(values => Object.keys(values).length <= 32, 'A script may supply at most 32 typed values');
}

// ---------- iOS: the 1.1 schema, plus an optional "platform": "ios" ----------

const LEADING_HYPHEN_MESSAGE = 'MobileBuildMCP 2.7.1 cannot type text starting with a leading hyphen';
const iosValue = z.string().max(2_048).regex(printableAscii, 'Typed values must use printable US keyboard characters');
const iosValuesSchema = typedValues(z.union([iosValue, fromEnvSchema]))
  .refine(values => Object.values(values).every(value => typeof value !== 'string' || !value.startsWith('-')),
    LEADING_HYPHEN_MESSAGE);

function iosSchema<Parts extends VersionParts>(parts: Parts) {
  return z.strictObject({
    version: parts.version,
    /** Absent, or "ios": every other value routes to this schema too, and fails on this field. */
    platform: z.literal('ios').optional(),
    app: z.strictObject({
      bundleId: bundleIdField,
      launchArgs: launchArgsField.optional(),
    }),
    device: z.strictObject({ udid: udidField.optional() }).optional(),
    preconditions: preconditionsField.optional(),
    ...parts.fields,
    values: iosValuesSchema,
    steps: parts.steps,
  }).superRefine((scenario, context) => checkSteps(scenario as StepsAndValues, context));
}

/** An iOS script, version 1. */
export const iosScriptedScenarioSchema = iosSchema(version1Parts);
const goalFormIosScriptedScenarioSchema = iosSchema(goalFormParts);
const drivenIosScriptedScenarioSchema = iosSchema(version2Parts);

// ---------- Android: its own schema, not a refinement of the iOS one ----------

const androidValue = z.string().max(2_048)
  .refine(value => !controlCharacter.test(value), 'Typed values must not contain control characters');
const androidValuesSchema = typedValues(z.union([androidValue, fromEnvSchema]));

function androidSchema<Parts extends VersionParts>(parts: Parts) {
  return z.strictObject({
    version: parts.version,
    platform: z.literal('android'),
    app: z.strictObject({
      // bundleId and launchArgs are declared (rather than omitted) so a script that supplies them gets a
      // message naming the Android replacement, instead of zod's generic "unrecognized key".
      bundleId: bundleIdField.optional(),
      launchArgs: launchArgsField.optional(),
      // Required: optional here only so a missing package gets its own message below.
      package: packageField.optional(),
      activity: activityField.optional(),
      /** Passed to the launch intent with `am start --es <key> <value>`. */
      intentExtras: intentExtrasSchema.optional(),
    }),
    device: z.strictObject({
      // Declared for the same reason as app.bundleId above.
      udid: udidField.optional(),
      // At most one of serial or avd.
      serial: serialField.optional(),
      avd: avdField.optional(),
    }).optional(),
    preconditions: preconditionsField.optional(),
    ...parts.fields,
    values: androidValuesSchema,
    steps: parts.steps,
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

    checkSteps(scenario as StepsAndValues, context);
  });
}

/** An Android script, version 1. */
export const androidScriptedScenarioSchema = androidSchema(version1Parts);
const goalFormAndroidScriptedScenarioSchema = androidSchema(goalFormParts);
const drivenAndroidScriptedScenarioSchema = androidSchema(version2Parts);

// ---------- Both platforms' fields in one object, used only to describe the MCP tool's input ----------

const scriptedScenarioStructure = z.strictObject({
  version: z.literal([SCRIPT_VERSION, DRIVEN_SCRIPT_VERSION]),
  platform: z.enum(PLATFORMS).optional(),
  app: z.strictObject({
    bundleId: bundleIdField.optional(),
    launchArgs: launchArgsField.optional(),
    package: packageField.optional(),
    activity: activityField.optional(),
    intentExtras: intentExtrasSchema.optional(),
  }),
  device: z.strictObject({
    udid: udidField.optional(),
    serial: serialField.optional(),
    avd: avdField.optional(),
  }).optional(),
  preconditions: preconditionsField.optional(),
  ...drivenFields,
  values: typedValues(z.union([z.string().max(2_048), fromEnvSchema])),
  steps: z.array(z.discriminatedUnion('kind', [...scriptedStepSchemas, publishedDoStepSchema])).min(1).max(100),
});

const { $schema: _dialect, ...scriptedScenarioJsonSchema } = z.toJSONSchema(scriptedScenarioStructure, { io: 'input' });

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
function platformOf(input: unknown): Platform {
  return typeof input === 'object' && input !== null && 'platform' in input &&
    (input as { platform?: unknown }).platform === 'android' ? 'android' : 'ios';
}

/** Whether a script uses a field only version 2 has: a `do` step, `goal` or `start`. */
function usesVersion2Fields(input: object): boolean {
  const steps = (input as { steps?: unknown }).steps;
  return Object.hasOwn(input, 'goal') || Object.hasOwn(input, 'start') || (Array.isArray(steps) &&
    steps.some(step => typeof step === 'object' && step !== null && (step as { kind?: unknown }).kind === 'do'));
}

/** The schema that reads a script. A script that uses a version 2 field reads as version 2 unless it says
 *  "version": 1, which then reports each such field. Any other script reads as version 1, so a "version": 2
 *  script without a version 2 field gets 1.2's unsupported-version message (tests/golden/scripts.json). */
function schemaFor(input: unknown) {
  const android = platformOf(input) === 'android';
  if (typeof input !== 'object' || input === null) return android ? androidScriptedScenarioSchema : iosScriptedScenarioSchema;
  if (usesVersion2Fields(input) && (input as { version?: unknown }).version !== SCRIPT_VERSION) {
    return android ? drivenAndroidScriptedScenarioSchema : drivenIosScriptedScenarioSchema;
  }
  if (Object.hasOwn(input, 'assertions')) {
    return android ? goalFormAndroidScriptedScenarioSchema : goalFormIosScriptedScenarioSchema;
  }
  return android ? androidScriptedScenarioSchema : iosScriptedScenarioSchema;
}

/** Parses a script as written: a value may still be `{ "fromEnv": NAME }`. */
export function parseScriptedScenarioSource(input: unknown): ScriptedScenarioSource {
  return withoutUndefined(schemaFor(input).parse(input)) as ScriptedScenarioSource;
}

/** Parses a script whose values are all text, as {@link resolveScriptValues} returns one. */
export function parseScriptedScenario(input: unknown): ScriptedScenario {
  const script = parseScriptedScenarioSource(input);
  if (Object.values(script.values).some(value => typeof value !== 'string')) {
    throw new Error('Script values must be resolved before a run reads them: call resolveScriptValues first');
  }
  return script as ScriptedScenario;
}

/** A script value that can't be read from the environment. The message names the key and the variable,
 *  never a value, so it is safe to print. */
export class ScriptValueError extends Error {
  constructor(message: string, readonly reason?: 'MISSING_VALUE') {
    super(message);
    this.name = 'ScriptValueError';
  }
}

const iosResolvedValue = iosValue.refine(value => !value.startsWith('-'), LEADING_HYPHEN_MESSAGE);

/**
 * Reads every `{ "fromEnv": NAME }` value from `env`, once, and checks it against the platform's typed
 * value rules. A variable that is unset or empty is MISSING_VALUE. Over MCP, `env` is the MCP server's
 * environment, not the shell Claude runs commands in.
 */
export function resolveScriptValues(script: ScriptedScenarioSource,
  env: Readonly<Record<string, string | undefined>>): ScriptedScenario {
  const rule = script.platform === 'android' ? androidValue : iosResolvedValue;
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(script.values)) {
    if (typeof value === 'string') { values[key] = value; continue; }
    const text = Object.hasOwn(env, value.fromEnv) ? env[value.fromEnv] : undefined;
    if (!text) {
      throw new ScriptValueError(`MISSING_VALUE: values.${key} reads environment variable ${value.fromEnv}, which ` +
        'is not set or is empty in the bridge\'s environment (over MCP, the MCP server\'s environment)', 'MISSING_VALUE');
    }
    const checked = rule.safeParse(text);
    if (!checked.success) {
      throw new ScriptValueError(`values.${key} (environment variable ${value.fromEnv}): ` +
        checked.error.issues.map(issue => issue.message).join('; '));
    }
    values[key] = text;
  }
  return { ...script, values } as ScriptedScenario;
}

/** Parses by platform like {@link parseScriptedScenarioSource}, without throwing: `fromEnv` values stay unread. */
export function safeParseScriptedScenario(input: unknown) {
  return schemaFor(input).safeParse(input);
}

/**
 * A script, validated exactly as {@link safeParseScriptedScenario} does, with the same issues at the same
 * paths. Its JSON Schema lists both platforms' fields in one object, since a JSON Schema can't express
 * the per-platform rules; the MCP tool publishes that and validates with this.
 */
export const scriptedScenarioSchema = z.unknown().superRefine((input, context) => {
  const parsed = safeParseScriptedScenario(input);
  if (!parsed.success) for (const issue of parsed.error.issues) context.addIssue({ ...issue });
}).meta(scriptedScenarioJsonSchema);
