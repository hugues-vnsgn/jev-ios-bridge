import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod/v4';
import { AppiumError, EXTENSION_VERSION, SOURCE_SETTINGS, checkedToolReply, extensionFailure, extensionRequestSchema,
  capabilitiesSchema, inventoryResultSchema, pngSchema, rectSchema, type AppiumPlatform, type ToolReply } from '../wire-schemas.js';

export type ExtensionSession = { ownership: string; platform: string; device: string; driver: unknown };
export type ExtensionOptions = { platform: AppiumPlatform; device: string; getSession: (id: string) => ExtensionSession | null; timeoutMs?: number };
const envelope = z.object({ extensionVersion: z.number(), sessionId: z.string() });
const elementSchema = z.object({ ELEMENT: z.string().min(1).optional(), 'element-6066-11e4-a52e-4f735466cecf': z.string().min(1).optional() })
  .refine(row => !!(row.ELEMENT ?? row['element-6066-11e4-a52e-4f735466cecf']));
type NativeMethod = (...args: unknown[]) => Promise<unknown>;
const methodSchema = z.custom<NativeMethod>(value => typeof value === 'function');
function method(driver: unknown, name: string): NativeMethod {
  if (typeof driver !== 'object' || driver === null) throw new AppiumError('DRIVER_ERROR');
  return methodSchema.parse(Reflect.get(driver, name)).bind(driver);
}
function acknowledged(sessionId: string): ToolReply {
  return { isError: false, content: [{ type: 'text', text: 'Acknowledged.' }], structuredContent: { extensionVersion: EXTENSION_VERSION, sessionId, acknowledged: true } };
}
function driverFact(driver: unknown, path: string[]): unknown {
  let value = driver;
  for (const key of path) {
    if (typeof value !== 'object' || value === null) return undefined;
    value = Reflect.get(value, key);
  }
  return value;
}
function inventory(options: ExtensionOptions, sessionId: string, driver: unknown): ToolReply {
  const ports: z.infer<typeof inventoryResultSchema>['ports'] = [];
  for (const [key, name] of [['wdaLocalPort', 'wda'], ['mjpegServerPort', 'mjpeg'], ['systemPort', 'uiautomator2']] as const) {
    const port = driverFact(driver, ['opts', key]);
    if (port !== undefined && port !== 0) ports.push({ name, port: z.number().int().min(1).max(65535).parse(port) });
  }
  const hostProcesses: z.infer<typeof inventoryResultSchema>['hostProcesses'] = [];
  const pid = driverFact(driver, ['wda', 'xcodebuild', 'xcodebuild', 'proc', 'pid']);
  if (pid !== undefined) hostProcesses.push({ kind: 'xcodebuild', pid: z.number().int().positive().parse(pid) });
  const serverPid = driverFact(driver, ['serverPid']);
  if (serverPid !== undefined) hostProcesses.push({ kind: 'server', pid: z.number().int().positive().parse(serverPid) });
  return { isError: false, content: [{ type: 'text', text: 'Driver inventory only.' }], structuredContent: {
    extensionVersion: EXTENSION_VERSION, sessionId, platform: options.platform, device: options.device,
    ports, hostProcesses, deviceProcesses: { status: 'unknown' } } };
}
export function createExtensionHandler(options: ExtensionOptions) {
  let phase: 'ready' | 'in-flight' | 'closed' = 'ready';
  async function call(name: string, input: unknown, signal?: AbortSignal): Promise<ToolReply> {
    const raw = envelope.safeParse(input);
    if (raw.success && raw.data.extensionVersion !== EXTENSION_VERSION) return extensionFailure('VERSION_MISMATCH');
    const parsed = extensionRequestSchema.safeParse({ name, arguments: input });
    if (!parsed.success) return extensionFailure('NOT_ALLOWED');
    const request = parsed.data;
    const args = request.arguments;
    const session = options.getSession(args.sessionId);
    if (!session || session.ownership !== 'owned' || session.platform.toLowerCase() !== options.platform || session.device !== options.device)
      return extensionFailure('SESSION_MISMATCH');
    if (phase !== 'ready') return extensionFailure('NOT_ALLOWED');
    if ((request.name === 'jev_android_back' || request.name === 'jev_start_activity') && options.platform !== 'android') return extensionFailure('NOT_ALLOWED');
    if (request.name === 'jev_settings' && !isDeepStrictEqual(request.arguments.settings, SOURCE_SETTINGS[options.platform])) return extensionFailure('NOT_ALLOWED');
    phase = 'in-flight';
    const deadline = performance.now() + (options.timeoutMs ?? 120000);
    const invoke = async (name: string, ...args: unknown[]) => {
      const remaining = deadline - performance.now();
      if (phase !== 'in-flight' || signal?.aborted || remaining <= 0) throw new AppiumError('TIMEOUT');
      let timer: ReturnType<typeof setTimeout> | undefined;
      let onAbort: (() => void) | undefined;
      try {
        const cancelled = new Promise<never>((_, reject) => {
          const expire = () => { phase = 'closed'; reject(new AppiumError('TIMEOUT')); };
          timer = setTimeout(expire, remaining);
          onAbort = expire; signal?.addEventListener('abort', expire, { once: true });
        });
        return await Promise.race([method(session.driver, name)(...args), cancelled]);
      } finally { clearTimeout(timer); if (onAbort) signal?.removeEventListener('abort', onAbort); }
    };
    try {
      let reply: ToolReply;
      switch (request.name) {
        case 'jev_session_inventory': reply = inventory(options, args.sessionId, session.driver); break;
        case 'jev_replace_text': {
          const { locator, text } = request.arguments;
          const elements = z.array(elementSchema).parse(await invoke('findElements', locator.using, locator.value));
          if (elements.length !== 1) return extensionFailure('NOT_UNIQUE');
          const element = elements[0];
          const id = z.string().min(1).parse(element?.ELEMENT ?? element?.['element-6066-11e4-a52e-4f735466cecf']);
          if (options.platform === 'ios') { await invoke('clear', id); await invoke('setValue', text, id); }
          else await invoke('execute', 'mobile: replaceElementValue', [{ elementId: id, text }]);
          reply = acknowledged(args.sessionId); break;
        }
        case 'jev_android_back':
          await invoke('pressKeyCode', 4); reply = acknowledged(args.sessionId); break;
        case 'jev_start_activity': {
          const { package: pkg, activity, intentExtras } = request.arguments;
          await invoke('execute', 'mobile: startActivity', [{ component: `${pkg}/${activity}`, stop: true, wait: true,
            extras: Object.entries(intentExtras).map(([key, value]) => ['s', key, value]) }]);
          reply = acknowledged(args.sessionId); break;
        }
        case 'jev_terminate_app':
          await invoke('terminateApp', request.arguments.appId); reply = acknowledged(args.sessionId); break;
        case 'jev_settings': {
          const settings = SOURCE_SETTINGS[options.platform];
          await invoke('updateSettings', settings);
          const readback = capabilitiesSchema.parse(await invoke('getSettings'));
          if (!Object.entries(settings).every(([key, value]) => readback[key] === value)) throw new AppiumError('DRIVER_ERROR');
          reply = { isError: false, content: [{ type: 'text', text: 'Settings read back.' }],
            structuredContent: { extensionVersion: EXTENSION_VERSION, sessionId: args.sessionId, settings: Object.fromEntries(Object.entries(readback).filter(([key]) => key in settings)) } };
          break;
        }
        case 'jev_screen': {
          const pngBase64 = pngSchema.parse(await invoke('getScreenshot'));
          const rect = rectSchema.parse(await invoke('getWindowRect'));
          const orientation = z.enum(['PORTRAIT', 'LANDSCAPE']).parse(options.platform === 'android'
            ? await invoke('getOrientation') : await invoke('proxyCommand', '/orientation', 'GET'));
          reply = { isError: false, content: [{ type: 'text', text: 'Screen captured.' }],
            structuredContent: { extensionVersion: EXTENSION_VERSION, sessionId: args.sessionId, pngBase64, rect, orientation } };
          break;
        }
      }
      return checkedToolReply(name, input, reply);
    } catch (error) {
      phase = 'closed';
      return extensionFailure(error instanceof AppiumError && error.code === 'TIMEOUT' ? 'TIMEOUT' : 'DRIVER_ERROR');
    } finally { if (phase === 'in-flight') phase = 'ready'; }
  }
  return { call, get dispatchOpen() { return phase === 'ready'; }, close: () => { phase = 'closed'; } };
}
