import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Cleanups } from './image-stack.js';
import type { AppiumHost } from '../../../src/appium/composition.js';
import type { AppiumDriverOptions, AppiumTarget } from '../../../src/appium/driver.js';
import type { NativeCommand } from '../../../src/appium/native/process.js';
import { Admission } from '../../../src/device/admission.js';
import { FakeFence, driverStack, fakeNativeRunner, virtualClock } from './driver-fixture.js';
import { worldSchema, type World } from './world-schema.js';

type Call = { method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };
export type HostOptions = Pick<AppiumDriverOptions, 'identityProbe'> & Partial<Pick<AppiumDriverOptions, 'adb' | 'freePort'>> & {
  /** The world each new driver opens on, in order; the last one repeats. */
  worlds: World[];
  nativeReply?: (command: NativeCommand) => string | undefined;
  admission?: Admission;
  root?: string;
};

/** The production composition's seam served by world providers: every driver an entry point builds opens the next world. */
export function worldHost(t: Cleanups, options: HostOptions) {
  const root = options.root ?? realpathSync(mkdtempSync(join(tmpdir(), 'appium-host-')));
  if (!options.root) t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
  for (const name of ['homes', 'logs', 'shots', 'locks', 'admission']) mkdirSync(join(root, name), { recursive: true, mode: 0o700 });
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
      environment: (): string[] => JSON.parse(readFileSync(trace + '.env', 'utf8')) as string[],
      goto: (screen: string) => writeFileSync(trace + '.goto', screen), release: () => writeFileSync(trace + '.release', ''),
      child: { entrypoint: fileURLToPath(new URL('./world-mcp.ts', import.meta.url)), args: [file, trace], nodeArgs: ['--import', import.meta.resolve('tsx')] } };
  };
  const host: AppiumHost = async ({ target, admission: shared }) => {
    const driver = opening(opened.length, target, shared);
    opened.push(driver);
    return { stack, admission: driver.admission, backend: 'fake', target, homeRoot: join(root, 'homes'), logFolder: join(root, 'logs'),
      screenshotFolder: join(root, 'shots'), lockRoot: join(root, 'locks'), fence: fence.run, nativeRunner: native.runner,
      freePort: options.freePort ?? (async () => port++), startLookup: pid => `host-${String(pid)}`, runMarker: () => '0123456789abcdef0123456789abcdef',
      timeoutMs: 20_000, fenceClock: virtualClock(), identityProbe: options.identityProbe, child: driver.child, ...(options.adb ? { adb: options.adb } : {}) };
  };
  return { root, admission, fence, native, opened, host };
}
