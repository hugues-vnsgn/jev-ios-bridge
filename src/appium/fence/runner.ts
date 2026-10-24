import { z } from 'zod/v4';
import type { AdbResult, AdbRunner } from '../../device/android/adb.js';
import { androidStartTime, processGone, shellCommand } from '../../device/android/recovery.js';
import { androidProcessSchema, forwardInventorySchema, hostInventorySchema, sameForward, settingKeySchema, settingsSchema, wdaInventorySchema,
  type Executor, type FenceEffect, type HostIdentity } from './schema.js';
import { sharedService } from './proof.js';
import { hostFenceIo } from './host.js';
import type { FenceRunner } from './index.js';

export type HostFenceIo = {
  inventory: (signal: AbortSignal) => Promise<unknown>;
  signalGroup: (pgid: number, signal: 'SIGTERM' | 'SIGKILL', abort: AbortSignal) => Promise<void>;
  signalProcess: (process: HostIdentity, signal: 'SIGTERM' | 'SIGKILL', abort: AbortSignal) => Promise<void>;
};
type SimctlRunner = (args: string[], signal: AbortSignal, started?: (host: Executor) => void) => Promise<AdbResult>;
type NativeCall = (args: string[]) => Promise<AdbResult>;
const resultSchema = z.strictObject({ stdout: z.string(), stderr: z.string(), exitCode: z.number().int() });
const simulatorListSchema = z.object({ devices: z.record(z.string(), z.array(z.object({ udid: z.string(), state: z.string() }))) });
const UIAUTOMATOR2_PACKAGES = ['io.appium.uiautomator2.server', 'io.appium.uiautomator2.server.test'];
function checked(raw: unknown): AdbResult {
  const result = resultSchema.parse(raw);
  if (result.exitCode !== 0 || result.stderr !== '') throw new Error('Fence native query failed');
  return result;
}
function forwardRows(result: AdbResult) {
  checked(result);
  const tcp = /^tcp:\d+$/;
  return forwardInventorySchema.parse(result.stdout.trim() ? result.stdout.trim().split(/\r?\n/).map(line => {
    const words = line.trim().split(/\s+/);
    if (words.length !== 3) throw new Error('Malformed forward inventory');
    return { serial: words[0]!, local: words[1]!, remote: words[2]! };
  }).filter(row => tcp.test(row.local) && tcp.test(row.remote)) : []);
}
function settingRows(result: AdbResult): Map<string, string> {
  checked(result);
  const entries = new Map<string, string>();
  for (const line of result.stdout.split(/\r?\n/).filter(Boolean)) {
    const index = line.indexOf('=');
    if (index < 1) throw new Error('Malformed settings inventory');
    const key = line.slice(0, index);
    if (entries.has(key)) throw new Error('Duplicate setting');
    entries.set(key, line.slice(index + 1));
  }
  return entries;
}
function shutDown(udid: string, listing: AdbResult): boolean {
  const devices = Object.values(simulatorListSchema.parse(JSON.parse(checked(listing).stdout)).devices).flat().filter(device => device.udid.toUpperCase() === udid);
  return devices.length === 1 && devices[0]!.state === 'Shutdown';
}
function wdaRows(udid: string, result: AdbResult) {
  checked(result);
  const lines = result.stdout.trim().split(/\r?\n/);
  if (!/^PID\s+Status\s+Label$/.test(lines.shift() ?? '')) throw new Error('Malformed simulator inventory');
  const rows = [];
  for (const line of lines) {
    const match = /^(\d+|-)\s+(-?\d+)\s+(\S+)$/.exec(line.trim());
    if (!match) throw new Error('Truncated simulator inventory');
    const label = match[3] ?? '';
    const bundle = /^UIKitApplication:([^[]+)/.exec(label)?.[1] ?? label;
    if (match[1] !== '-' && /WebDriverAgent/i.test(bundle)) rows.push({ udid, bundleId: bundle, pid: Number(match[1]) });
  }
  return wdaInventorySchema.parse(rows);
}
async function nativeCall<T>(signal: AbortSignal, call: () => Promise<T>): Promise<T> {
  signal.throwIfAborted();
  const result = await call();
  signal.throwIfAborted();
  return result;
}
async function wdaInventory(udid: string, simctl: NativeCall) {
  const listing = await simctl(['spawn', udid, 'launchctl', 'list']);
  if (listing.exitCode === 0 && listing.stderr === '') return wdaRows(udid, listing);
  if (shutDown(udid, await simctl(['list', '-j', 'devices', udid]))) return wdaInventorySchema.parse([]);
  throw new Error('Fence native query failed');
}
async function processState(effect: { serial: string; pid: number }, adb: NativeCall) {
  const result = resultSchema.parse(await adb(shellCommand(effect.serial, ['cat', `/proc/${effect.pid}/stat`])));
  if (processGone(result)) return androidProcessSchema.parse({ kind: 'absent' });
  checked(result);
  const startTime = androidStartTime(result.stdout);
  if (!startTime || !result.stdout.startsWith(`${effect.pid} (`)) throw new Error('Malformed proc identity');
  return androidProcessSchema.parse({ kind: 'running', startTime });
}
export function createFenceRunner(io: { host?: HostFenceIo; adb: AdbRunner; simctl: SimctlRunner }): FenceRunner {
  const host = io.host ?? hostFenceIo();
  return async (effect: FenceEffect, signal, started) => {
    signal.throwIfAborted();
    const adb: NativeCall = args => nativeCall(signal, () => io.adb(args, signal, started));
    const simctl: NativeCall = args => nativeCall(signal, () => io.simctl(args, signal, started));
    const inventory = () => nativeCall(signal, () => host.inventory(signal));
    switch (effect.kind) {
      case 'host-inventory': return hostInventorySchema.parse(await inventory());
      case 'host-signal-group': {
        const rows = hostInventorySchema.parse(await inventory()).filter(row => row.pgid === effect.pgid && row.state === 'running');
        if (rows.some(row => sharedService(row) || !effect.members.some(member => member.pid === row.pid && member.startTime === row.startTime))) throw new Error('Process group identity differs');
        if (rows.length) await nativeCall(signal, () => host.signalGroup(effect.pgid, effect.signal, signal));
        return { ok: true };
      }
      case 'host-signal': {
        const rows = hostInventorySchema.parse(await inventory());
        const current = rows.find(row => row.pid === effect.process.pid && row.startTime === effect.process.startTime);
        if (current && sharedService(current)) throw new Error('Shared service cannot be signalled');
        if (current?.state === 'running') await nativeCall(signal, () => host.signalProcess(effect.process, effect.signal, signal));
        return { ok: true };
      }
      case 'wda-inventory': return wdaInventory(effect.udid, simctl);
      case 'wda-stop': {
        const rows = await wdaInventory(effect.udid, simctl);
        const matches = rows.filter(row => row.bundleId === effect.bundleId || row.pid === effect.pid);
        if (matches.some(row => row.bundleId !== effect.bundleId || row.pid !== effect.pid)) throw new Error('WDA identity differs');
        if (matches.length) checked(await simctl(['terminate', effect.udid, effect.bundleId]));
        return { ok: true };
      }
      case 'android-process': return processState(effect, adb);
      case 'android-stop': {
        const current = await processState({ serial: effect.serial, pid: effect.process.pid }, adb);
        if (current.kind === 'running' && current.startTime === effect.process.startTime) {
          for (const pkg of UIAUTOMATOR2_PACKAGES) checked(await adb(shellCommand(effect.serial, ['am', 'force-stop', pkg])));
        }
        return { ok: true };
      }
      case 'forward-inventory': return forwardRows(await adb(['forward', '--list']));
      case 'forward-remove': {
        if (forwardRows(await adb(['forward', '--list'])).some(row => sameForward(row, effect))) checked(await adb(['-s', effect.serial, 'forward', '--remove', effect.local]));
        return { ok: true };
      }
      case 'settings-read': {
        const global = settingRows(await adb(shellCommand(effect.serial, ['settings', 'list', 'global'])));
        const secure = settingRows(await adb(shellCommand(effect.serial, ['settings', 'list', 'secure'])));
        return settingsSchema.parse(Object.fromEntries(settingKeySchema.options.map(key => [key, (key === 'accessibility_enabled' ? secure : global).get(key) ?? null])));
      }
      case 'settings-write': {
        const namespace = effect.key === 'accessibility_enabled' ? 'secure' : 'global';
        const words = effect.value === null ? ['settings', 'delete', namespace, effect.key] : ['settings', 'put', namespace, effect.key, effect.value];
        checked(await adb(shellCommand(effect.serial, words)));
        return { ok: true };
      }
      default: { const exhaustive: never = effect; return exhaustive; }
    }
  };
}
