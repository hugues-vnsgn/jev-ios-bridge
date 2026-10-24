import { z } from 'zod/v4';

const text = z.string().min(1).max(4096).refine(value => !value.includes('\0'));
const hostPid = z.number().int().min(2).brand<'HostPid'>();
const androidPid = z.number().int().positive().brand<'AndroidPid'>();
const hostStartTime = z.string().transform(value => value.replace(/\s+/g, ' ').trim()).pipe(text).brand<'HostStartTime'>();
export const hostIdentitySchema = z.strictObject({ pid: hostPid, startTime: hostStartTime });
export const androidIdentitySchema = z.strictObject({ pid: androidPid, startTime: z.string().regex(/^\d+$/).brand<'AndroidStartTime'>() });
const serial = text.brand<'AndroidSerial'>();
const udid = z.string().regex(/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i).transform(value => value.toUpperCase()).brand<'SimulatorUdid'>();
const port = z.string().regex(/^tcp:([1-9]\d{0,4})$/).refine(value => Number(value.slice(4)) <= 65535);
export const settingsSchema = z.strictObject({ hidden_api_policy: text.nullable(), hidden_api_policy_p_apps: text.nullable(),
  hidden_api_policy_pre_p_apps: text.nullable(), accessibility_enabled: text.nullable() });
export const settingKeySchema = z.enum(['hidden_api_policy', 'hidden_api_policy_p_apps', 'hidden_api_policy_pre_p_apps', 'accessibility_enabled']);
export type SettingKey = z.infer<typeof settingKeySchema>;
const runMarker = z.string().regex(/^[a-f0-9]{32}$/).brand<'LaunchMarker'>();
const groupSchema = z.strictObject({ id: text, kind: z.literal('appium-process-group'), leader: hostIdentitySchema, runMarker,
  pgid: z.number().int().min(2).brand<'ProcessGroupId'>(), members: z.array(hostIdentitySchema).max(4096) })
  .refine(value => Number(value.pgid) === Number(value.leader.pid) && !value.members.some(member => member.pid === value.leader.pid)
    && new Set(value.members.map(member => member.pid)).size === value.members.length, 'Invalid owned group');
export const appiumComponentSchema = z.discriminatedUnion('kind', [
  groupSchema,
  z.strictObject({ id: text, kind: z.literal('appium-wda'), udid, bundleId: text, pid: hostPid }),
  z.strictObject({ id: text, kind: z.literal('appium-uiautomator2'), serial, processes: z.array(androidIdentitySchema).min(1).max(4096) })
    .refine(value => new Set(value.processes.map(process => process.pid)).size === value.processes.length),
  z.strictObject({ id: text, kind: z.literal('appium-forward'), serial, local: port, remote: port }),
  z.strictObject({ id: text, kind: z.literal('appium-settings'), serial, values: settingsSchema }),
  z.strictObject({ id: text, kind: z.literal('appium-native-helper'), role: z.enum(['console', 'log-stream', 'logcat', 'exit-watch']), process: hostIdentitySchema }),
]);
export type AppiumComponent = z.infer<typeof appiumComponentSchema>;
export const hostRowSchema = hostIdentitySchema.extend({ ppid: z.number().int().nonnegative(), pgid: z.number().int().nonnegative(),
  state: z.enum(['running', 'zombie']), executable: text, sharedService: z.literal(true).optional(), runMarker: runMarker.optional(), launchChain: z.array(hostIdentitySchema).max(4096).optional() });
export const hostInventorySchema = z.array(hostRowSchema).max(65536).refine(rows => new Set(rows.map(row => row.pid)).size === rows.length);
export const wdaInventorySchema = z.array(z.strictObject({ udid, bundleId: text, pid: hostPid })).max(4096);
export const forwardInventorySchema = z.array(z.strictObject({ serial, local: port, remote: port })).max(4096);
export const androidProcessSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('absent') }),
  z.strictObject({ kind: z.literal('running'), startTime: androidIdentitySchema.shape.startTime }),
]);
export const fenceEffectSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('host-inventory') }),
  z.strictObject({ kind: z.literal('host-signal-group'), pgid: groupSchema.shape.pgid, members: z.array(hostIdentitySchema).min(1).max(4096), signal: z.enum(['SIGTERM', 'SIGKILL']) }),
  z.strictObject({ kind: z.literal('host-signal'), process: hostIdentitySchema, signal: z.enum(['SIGTERM', 'SIGKILL']) }),
  z.strictObject({ kind: z.literal('wda-inventory'), udid }),
  z.strictObject({ kind: z.literal('wda-stop'), udid, bundleId: text, pid: hostPid }),
  z.strictObject({ kind: z.literal('android-process'), serial, pid: androidPid }),
  z.strictObject({ kind: z.literal('android-stop'), serial, process: androidIdentitySchema }),
  z.strictObject({ kind: z.literal('forward-inventory') }),
  z.strictObject({ kind: z.literal('forward-remove'), serial, local: port, remote: port }),
  z.strictObject({ kind: z.literal('settings-read'), serial }),
  z.strictObject({ kind: z.literal('settings-write'), serial, key: settingKeySchema, value: text.nullable() }),
]);
export type FenceEffect = z.infer<typeof fenceEffectSchema>;
export const fenceCommandSchema = z.strictObject({ id: text, kind: z.literal('appium-fence-command'), effect: fenceEffectSchema });
export const appiumProofSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('appium-group-stopped'), beforeCommandId: text, afterCommandId: text }),
  z.strictObject({ kind: z.literal('appium-wda-stopped'), commandId: text }),
  z.strictObject({ kind: z.literal('appium-uiautomator2-stopped'), commandIds: z.array(text).min(1).max(4096) }),
  z.strictObject({ kind: z.literal('appium-forward-removed'), commandId: text }),
  z.strictObject({ kind: z.literal('appium-settings-restored'), commandId: text }),
  z.strictObject({ kind: z.literal('appium-helper-stopped'), commandId: text }),
]);
export type AppiumProof = z.infer<typeof appiumProofSchema>;
export type HostIdentity = z.infer<typeof hostIdentitySchema>;
export type HostRow = z.infer<typeof hostRowSchema>;
export type Transcript = { id: string; effect: FenceEffect; result: unknown };
export const successSchema = z.strictObject({ ok: z.literal(true) });
export function parseEffectResult(effect: FenceEffect, raw: unknown) {
  switch (effect.kind) {
    case 'host-inventory': return hostInventorySchema.parse(raw);
    case 'wda-inventory': return wdaInventorySchema.parse(raw);
    case 'android-process': return androidProcessSchema.parse(raw);
    case 'forward-inventory': return forwardInventorySchema.parse(raw);
    case 'settings-read': return settingsSchema.parse(raw);
    case 'host-signal': case 'host-signal-group': case 'wda-stop': case 'android-stop': case 'forward-remove': case 'settings-write': return successSchema.parse(raw);
    default: { const exhaustive: never = effect; return exhaustive; }
  }
}
