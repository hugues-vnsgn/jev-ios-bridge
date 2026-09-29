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
// The character rule differs by platform, so it's enforced in the top-level superRefine instead of here:
// this keeps the ASCII pattern off `values` in the exported JSON schema.
const valuesSchema = z.record(z.string().regex(key), z.string().max(2_048))
  .refine(values => Object.keys(values).length <= 32, 'A script may supply at most 32 typed values');

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

export const scriptedScenarioSchema = z.strictObject({
  version: versionSchema,
  /** The device platform this script targets. Absent, or "ios", reads the script exactly as in 1.1. */
  platform: z.enum(PLATFORMS).optional(),
  app: z.strictObject({
    bundleId: z.string().regex(bundleId).optional(),
    /** Passed to the app process at launch, for example a debug-only entry point such as -of-evidence-gallery. */
    launchArgs: z.array(launchArgument).max(20).optional(),
    /** The installed app's package name. Required, Android only. */
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
    udid: z.string().regex(udid).optional(),
    /** The adb serial exactly as `adb devices` prints it. At most one of serial or avd. */
    serial: z.string().regex(androidSerial, 'device.serial must match ^[A-Za-z0-9._:-]{1,100}$').optional(),
    /** An emulator's AVD name, stable across start order. At most one of serial or avd. */
    avd: z.string().regex(androidAvd, 'device.avd must match ^[A-Za-z0-9._-]{1,100}$').optional(),
  }).optional(),
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
  // Checked in the base schema's field order (app, then device, then values, then steps), so an iOS
  // script's issues list in the same order 1.1 produced, before Android added platform-aware checks.
  const platform = scenario.platform ?? 'ios';
  if (platform === 'android') {
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
  } else {
    // Matches the message and path zod's own "required" check gave app.bundleId before it became optional
    // in the base schema (needed so the same field can be required on iOS and forbidden on Android).
    if (scenario.app.bundleId === undefined) context.addIssue({ code: 'invalid_type', expected: 'string',
      input: undefined, message: 'Invalid input: expected string, received undefined', path: ['app', 'bundleId'] });
    if (scenario.app.package !== undefined) context.addIssue({ code: 'custom',
      message: 'app.package requires "platform": "android"', path: ['app', 'package'] });
    if (scenario.app.activity !== undefined) context.addIssue({ code: 'custom',
      message: 'app.activity requires "platform": "android"', path: ['app', 'activity'] });
    if (scenario.app.intentExtras !== undefined) context.addIssue({ code: 'custom',
      message: 'app.intentExtras requires "platform": "android"', path: ['app', 'intentExtras'] });
    if (scenario.device?.serial !== undefined) context.addIssue({ code: 'custom',
      message: 'device.serial requires "platform": "android"', path: ['device', 'serial'] });
    if (scenario.device?.avd !== undefined) context.addIssue({ code: 'custom',
      message: 'device.avd requires "platform": "android"', path: ['device', 'avd'] });
  }

  for (const [valueKey, value] of Object.entries(scenario.values)) {
    if (platform === 'android') {
      if (controlCharacter.test(value)) context.addIssue({ code: 'custom',
        message: 'Typed values must not contain control characters', path: ['values', valueKey] });
    } else if (!printableAscii.test(value)) {
      context.addIssue({ code: 'custom', message: 'Typed values must use printable US keyboard characters',
        path: ['values', valueKey] });
    }
  }
  if (platform !== 'android' && Object.values(scenario.values).some(value => value.startsWith('-'))) {
    context.addIssue({ code: 'custom',
      message: 'MobileBuildMCP 2.7.1 cannot type text starting with a leading hyphen', path: ['values'] });
  }

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
