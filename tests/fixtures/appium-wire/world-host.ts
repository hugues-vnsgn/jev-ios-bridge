import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Cleanups } from './image-stack.js';
import type { AppiumHost } from '../../../src/appium/composition.js';
import type { AppiumDriverOptions, AppiumTarget } from '../../../src/appium/driver.js';
import type { FenceRunner } from '../../../src/appium/fence/index.js';
import type { NativeCommand } from '../../../src/appium/native/process.js';
import { Admission } from '../../../src/device/admission.js';
import type { AdbRunner } from '../../../src/device/android/adb.js';
import { FakeFence, WDA_BUNDLE, driverStack, fakeNativeRunner, virtualClock } from './driver-fixture.js';
import { worldSchema, type World } from './world-schema.js';

type Call = { method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };
export type HostOptions = Pick<AppiumDriverOptions, 'identityProbe'> & Partial<Pick<AppiumDriverOptions, 'adb' | 'freePort' | 'presentation'>> & {
  worlds: World[];
  nativeReply?: (command: NativeCommand) => string | undefined;
  admission?: Admission;
  root?: string;
};
const UIAUTOMATOR2_PIDS = [5001, 5002];

export function worldHost(t: Cleanups, options: HostOptions) {
  if (options.root) mkdirSync(options.root, { recursive: true, mode: 0o700 });
  const root = realpathSync(options.root ?? mkdtempSync(join(tmpdir(), 'appium-host-')));
  if (!options.root) t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
  for (const name of ['homes', 'logs', 'shots', 'locks', 'admission']) mkdirSync(join(root, name), { mode: 0o700 });
  const admission = options.admission ?? Admission.forTesting({ root: join(root, 'admission'), backend: 'fake', durability: 'fast' });
  const fence = new FakeFence();
  const native = fakeNativeRunner(options.nativeReply);
  const stack = driverStack(t);
  let port = 18100;
  const opened: ReturnType<typeof opening>[] = [];
  const opening = (index: number, target: AppiumTarget, shared: Admission | undefined) => {
    const trace = join(root, `trace-${String(index)}.jsonl`);
    const file = join(root, `world-${String(index)}.json`);
    writeFileSync(file, JSON.stringify(worldSchema.parse(options.worlds[Math.min(index, options.worlds.length - 1)])));
    const calls = (): Call[] => { try { return readFileSync(trace, 'utf8').trim().split('\n').map(line => JSON.parse(line) as Call); } catch { return []; } };
    const toolCalls = () => calls().filter(call => call.method === 'tools/call');
    return { target, trace, admission: shared ?? admission, calls, toolCalls, tools: () => toolCalls().map(call => call.params!.name!),
      creates: () => toolCalls().filter(call => call.params?.arguments?.action === 'create'),
      environment: (): string[] => JSON.parse(readFileSync(trace + '.env', 'utf8')) as string[],
      goto: (screen: string) => writeFileSync(trace + '.goto', screen), release: () => writeFileSync(trace + '.release', ''),
      child: { entrypoint: fileURLToPath(new URL('./world-mcp.ts', import.meta.url)), args: [file, trace], nodeArgs: ['--import', import.meta.resolve('tsx')] } };
  };
  const created = () => opened.flatMap(driver => driver.creates().map(create => ({ driver, create })));
  let runners = 0; let forwarded = 0; let uiautomatorStoppedAt = 0;
  const sync = () => {
    const sessions = created();
    for (const { driver, create } of sessions.slice(Math.max(runners, forwarded))) {
      if (driver.target.platform === 'ios') fence.wda.push({ udid: driver.target.device, bundleId: WDA_BUNDLE, pid: 7001 + runners });
      else {
        const capabilities = JSON.parse(String(create.params!.arguments!.capabilities)) as Record<string, number>;
        fence.forwards.push({ serial: driver.target.device, local: `tcp:${String(capabilities['appium:systemPort'])}`, remote: 'tcp:6790' });
      }
    }
    runners = forwarded = sessions.length;
  };
  const fenceRun: FenceRunner = async (effect, ...rest) => {
    sync();
    const result = await fence.run(effect, ...rest);
    if (effect.kind === 'android-stop' && !UIAUTOMATOR2_PIDS.some(pid => fence.processes.has(pid))) uiautomatorStoppedAt = created().length;
    return result;
  };
  const adb = options.adb;
  const sessionAdb: AdbRunner | undefined = adb && (async (args, ...rest) => {
    sync();
    if (!(args.at(-1) ?? '').includes('pidof') || !(args.at(-1) ?? '').includes('io.appium.uiautomator2')) return adb(args, ...rest);
    if (created().length <= uiautomatorStoppedAt) return { stdout: '', stderr: '', exitCode: 1 };
    for (const pid of UIAUTOMATOR2_PIDS) if (!fence.processes.has(pid)) fence.processes.set(pid, '424242');
    return { stdout: UIAUTOMATOR2_PIDS.join(' ') + '\n', stderr: '', exitCode: 0 };
  });
  const host: AppiumHost = async ({ target, admission: shared }) => {
    const driver = opening(opened.length, target, shared);
    opened.push(driver);
    return { stack, admission: driver.admission, backend: 'fake', target, homeRoot: join(root, 'homes'), logFolder: join(root, 'logs'),
      screenshotFolder: join(root, 'shots'), lockRoot: join(root, 'locks'), fence: fenceRun, nativeRunner: native.runner,
      freePort: options.freePort ?? (async () => port++), startLookup: pid => `host-${String(pid)}`, runMarker: () => '0123456789abcdef0123456789abcdef',
      timeoutMs: 20_000, fenceClock: virtualClock(), identityProbe: options.identityProbe, child: driver.child, ...(sessionAdb ? { adb: sessionAdb } : {}),
      presentation: options.presentation ?? (async () => 'visible') };
  };
  return { root, admission, fence, native, opened, host };
}
