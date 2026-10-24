import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { crc32, deflateSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import type { TestContext } from 'node:test';
import { AppiumDriver, type AppiumDriverOptions } from '../../../src/appium/driver.js';
import { Admission } from '../../../src/device/admission.js';
import type { AdbRunner } from '../../../src/device/android/adb.js';
import type { NativeCommand } from '../../../src/appium/native/process.js';
import { FakeFence, WDA_BUNDLE, driverStack, fakeNativeRunner } from './driver-fixture.js';
import { worldSchema, type World, type WorldRule } from './world-schema.js';

export { worldSchema, type World, type WorldRule } from './world-schema.js';

export const ONE_PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4z8AAAAMBAQCc479ZAAAAAElFTkSuQmCC';

/** A plain grey PNG of the given size, for a screen whose screenshot must keep the window's aspect (Android tapAt). */
export function png(width: number, height: number): string {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 0;
  const rows = Buffer.concat(Array.from({ length: height }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(width, 0x80)])));
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}

export function world(platform: 'ios' | 'android', screens: Record<string, string>, rules: WorldRule[] = [], start = Object.keys(screens)[0]!): World {
  return { platform, sessionId: `${platform}-session`, start, screens, rules, png: ONE_PIXEL_PNG, rect: { x: 0, y: 0, width: 1, height: 1 } };
}

const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
export type IosNode = { type: 'Button' | 'TextField' | 'SecureTextField' | 'StaticText' | 'Switch' | 'Cell'; name?: string; label?: string; value?: string;
  placeholder?: string; frame: [number, number, number, number]; enabled?: boolean };
/** An iOS page source with the nodes under one window. `{{typed}}` in a value is the last replaced text. */
export function iosScreen(nodes: IosNode[], bundleId = 'example.app'): string {
  const attributes = (node: IosNode) => [`type="XCUIElementType${node.type}"`, node.name ? `name="${escape(node.name)}"` : '', node.label ? `label="${escape(node.label)}"` : '',
    node.value !== undefined ? `value="${node.value === '{{typed}}' ? node.value : escape(node.value)}"` : '', node.placeholder ? `placeholderValue="${escape(node.placeholder)}"` : '',
    `enabled="${String(node.enabled ?? true)}"`, 'visible="true"', 'accessible="true"', `x="${String(node.frame[0])}"`, `y="${String(node.frame[1])}"`,
    `width="${String(node.frame[2])}"`, `height="${String(node.frame[3])}"`].filter(Boolean).join(' ');
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<AppiumAUT>',
    `<XCUIElementTypeApplication type="XCUIElementTypeApplication" name="Example" label="Example" enabled="true" visible="true" accessible="false" x="0" y="0" width="402" height="874" bundleId="${bundleId}">`,
    '<XCUIElementTypeWindow type="XCUIElementTypeWindow" enabled="true" visible="true" accessible="false" x="0" y="0" width="402" height="874">',
    ...nodes.map(node => `<XCUIElementType${node.type} ${attributes(node)}/>`),
    '</XCUIElementTypeWindow>', '</XCUIElementTypeApplication>', '</AppiumAUT>'].join('\n');
}

export type AndroidView = { className: string; text?: string; hint?: string; description?: string; id?: string; bounds: [number, number, number, number];
  clickable?: boolean; password?: boolean; enabled?: boolean; focused?: boolean };
/** A UiAutomator2 page source with the views under one frame. `{{typed}}` in a text is the last replaced text. */
export function androidScreen(views: AndroidView[], pkg = 'example.app'): string {
  const flags = (view: Partial<AndroidView>) => ['checkable="false"', 'checked="false"', `clickable="${String(view.clickable ?? false)}"`, `enabled="${String(view.enabled ?? true)}"`,
    'displayed="true"', `focused="${String(view.focused ?? false)}"`, 'selected="false"', 'scrollable="false"', `password="${String(view.password ?? false)}"`].join(' ');
  const node = (view: AndroidView) => [`<${view.className} class="${view.className}" package="${pkg}"`, `text="${view.text === '{{typed}}' ? view.text : escape(view.text ?? '')}"`,
    view.hint ? `hint="${escape(view.hint)}"` : '', view.description ? `content-desc="${escape(view.description)}"` : '', view.id ? `resource-id="${escape(view.id)}"` : '',
    flags(view), `bounds="[${String(view.bounds[0])},${String(view.bounds[1])}][${String(view.bounds[2])},${String(view.bounds[3])}]"/>`].filter(Boolean).join(' ');
  return ["<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>", '<hierarchy index="0" class="hierarchy" rotation="0" width="320" height="640">',
    `<android.widget.FrameLayout class="android.widget.FrameLayout" package="${pkg}" text="" ${flags({})} bounds="[0,0][320,640]">`,
    ...views.map(node), '</android.widget.FrameLayout>', '</hierarchy>'].join('\n');
}

const UIAUTOMATOR2_PIDS = [5001, 5002];
type Overrides = Partial<AppiumDriverOptions> & Pick<AppiumDriverOptions, 'target' | 'identityProbe'>;
type Call = { method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };

/** A driver on the real client, session, observation, operations and admission, against a world provider. More
 *  drivers can join the same admission and lease root, so a test can prove the next admission. */
export function worldFixture(t: TestContext, first: World, options: Overrides, nativeReply?: (command: NativeCommand) => string | undefined) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'appium-world-')));
  const drivers: AppiumDriver[] = [];
  t.after(async () => {
    for (const opened of drivers) await opened.close(AbortSignal.timeout(30_000)).catch(() => undefined);
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });
  for (const name of ['homes', 'logs', 'shots', 'locks', 'admission']) mkdirSync(join(root, name), { mode: 0o700 });
  const admission = options.admission ?? Admission.forTesting({ root: join(root, 'admission'), backend: 'fake', durability: 'fast' });
  const fence = new FakeFence();
  const traces: string[] = [];
  const created = () => traces.reduce((count, trace) => {
    try { return count + readFileSync(trace, 'utf8').split('\n').filter(line => line.includes('"action":"create"')).length; } catch { return count; }
  }, 0);
  let runners = 0;
  let forwarded = 0;
  // A created Android session forwards its UiAutomator2 system port, listed until the fence removes it.
  const syncForward = () => {
    if (options.target.platform !== 'android' || created() <= forwarded) return;
    forwarded = created();
    fence.forwards.push({ serial: options.target.device, local: `tcp:${String(systemPort())}`, remote: 'tcp:6790' });
  };
  const systemPort = () => {
    const capabilities = traces.flatMap(trace => { try { return readFileSync(trace, 'utf8').trim().split('\n'); } catch { return []; } })
      .map(line => JSON.parse(line) as Call).filter(call => call.params?.arguments?.action === 'create').at(-1)!.params!.arguments!.capabilities;
    return (JSON.parse(String(capabilities)) as Record<string, number>)['appium:systemPort'];
  };
  // A created iOS session starts its own WDA runner, which the simulator lists until the fence stops it.
  const run = fence.run;
  fence.run = async (effect, ...rest) => {
    syncForward();
    if (effect.kind === 'wda-inventory' && options.target.platform === 'ios' && created() > runners) {
      runners = created();
      fence.wda.push({ udid: options.target.device, bundleId: WDA_BUNDLE, pid: 7000 + runners });
    }
    const result = await run(effect, ...rest);
    if (effect.kind === 'android-stop' && !UIAUTOMATOR2_PIDS.some(pid => fence.processes.has(pid))) uiautomatorStoppedAt = created();
    return result;
  };
  // A created Android session starts UiAutomator2, which `pidof` lists until the fence stops both processes.
  let uiautomatorStoppedAt = 0;
  const adb = options.adb;
  const sessionAdb: AdbRunner | undefined = adb && (async (args, ...rest) => {
    syncForward();
    if (!(args.at(-1) ?? '').includes('pidof')) return adb(args, ...rest);
    if (created() <= uiautomatorStoppedAt) return { stdout: '', stderr: '', exitCode: 1 };
    for (const pid of UIAUTOMATOR2_PIDS) if (!fence.processes.has(pid)) fence.processes.set(pid, '424242');
    return { stdout: UIAUTOMATOR2_PIDS.join(' ') + '\n', stderr: '', exitCode: 0 };
  });
  const native = fakeNativeRunner(nativeReply);
  let port = 18100;
  let opened = 0;
  const open = (state: World, overrides: Partial<AppiumDriverOptions> = {}) => {
    const index = opened++;
    const trace = join(root, `trace-${String(index)}.jsonl`);
    traces.push(trace);
    const file = join(root, `world-${String(index)}.json`);
    writeFileSync(file, JSON.stringify(worldSchema.parse(state)));
    const driver = new AppiumDriver({ stack: driverStack(t), admission, backend: 'fake', homeRoot: join(root, 'homes'), logFolder: join(root, 'logs'),
      screenshotFolder: join(root, 'shots'), lockRoot: join(root, 'locks'), fence: (...args) => fence.run(...args), nativeRunner: native.runner, freePort: async () => port++,
      startLookup: pid => `host-${String(pid)}`, runMarker: () => '0123456789abcdef0123456789abcdef', runId: `run-${String(index + 1)}`, timeoutMs: 20_000,
      child: { entrypoint: resolve('tests/fixtures/appium-wire/world-mcp.ts'), args: [file, trace], nodeArgs: ['--import', import.meta.resolve('tsx')] },
      ...options, ...(sessionAdb ? { adb: sessionAdb } : {}), ...overrides });
    drivers.push(driver);
    const calls = (): Call[] => { try { return readFileSync(trace, 'utf8').trim().split('\n').map(line => JSON.parse(line) as Call); } catch { return []; } };
    const toolCalls = () => calls().filter(call => call.method === 'tools/call');
    const environment = (): string[] => JSON.parse(readFileSync(trace + '.env', 'utf8')) as string[];
    return { driver, trace, calls, toolCalls, environment, tools: () => toolCalls().map(call => call.params!.name!),
      goto: (screen: string) => writeFileSync(trace + '.goto', screen), release: () => writeFileSync(trace + '.release', '') };
  };
  return { root, admission, fence, native, drivers, open, ...open(first) };
}
