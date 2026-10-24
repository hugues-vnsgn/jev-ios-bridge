import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { TestContext } from 'node:test';
import { Admission } from '../../../src/device/admission.js';
import type { VerifiedStack } from '../../../src/appium/stack.js';
import type { FenceRunner } from '../../../src/appium/fence/index.js';
import type { FenceEffect } from '../../../src/appium/fence/schema.js';
import type { NativeCommand, NativeExit, NativeOutput, NativeProcess, NativeRunner } from '../../../src/appium/native/process.js';
import { AppiumDriver, type AppiumDriverOptions } from '../../../src/appium/driver.js';
import { clientFixture } from './client-fixture.js';
import { imageStack } from './image-stack.js';

export const UDID = 'ABCDEF00-0000-4000-8000-000000000001';
export const WDA_BUNDLE = 'com.facebook.WebDriverAgentRunner.xctrunner';

/** One stack that verifies both the private SDK (client) and sharp (observation). */
export function driverStack(t: TestContext): VerifiedStack {
  const client = clientFixture(t).stack; const image = imageStack(t).stack;
  return { ...image, wdaRunner: client.wdaRunner, manifest: { ...image.manifest, lockSha256: client.manifest.lockSha256, files: { ...image.manifest.files, ...client.manifest.files },
    packages: [...image.manifest.packages, ...client.manifest.packages], androidApks: client.manifest.androidApks, wda: client.manifest.wda } };
}

/** A recording with the hand-authored device name replaced by the admitted identity. */
export function rewriteRecording(root: string, source: string, replacements: [string, string][], name = 'recording.jsonl'): string {
  const [header, ...lines] = readFileSync(resolve(source), 'utf8').trim().split('\n');
  const body = lines.map(line => replacements.reduce((text, [from, to]) => text.replaceAll(from, to), line));
  const path = join(root, name);
  writeFileSync(path, [header, ...body].join('\n') + '\n');
  return path;
}

/** Splices the client/server exchanges of several recordings into one, keeping the first header. */
export function spliceRecordings(root: string, parts: { source: string; from: number; to?: number }[], replacements: [string, string][], name = 'spliced.jsonl'): string {
  const header = readFileSync(resolve(parts[0]!.source), 'utf8').trim().split('\n')[0]!;
  const body = parts.flatMap(part => readFileSync(resolve(part.source), 'utf8').trim().split('\n').slice(1).slice(part.from, part.to));
  const path = join(root, name);
  writeFileSync(path, [header, ...body.map(line => replacements.reduce((text, [from, to]) => text.replaceAll(from, to), line))].join('\n') + '\n');
  return path;
}

export type FakeHelper = { command: NativeCommand; output: NativeOutput; child: NativeProcess; exit: (exit: NativeExit) => void; stops: number };
export function fakeNativeRunner(reply: (command: NativeCommand) => string | undefined = () => undefined) {
  const calls: FakeHelper[] = [];
  const runner: NativeRunner = async (command, output, signal) => {
    signal.throwIfAborted();
    let exit!: (exit: NativeExit) => void;
    const exited = new Promise<NativeExit>(done => { exit = done; });
    const child: NativeProcess = { process: { pid: 4000 + calls.length, incarnation: `helper-${String(4000 + calls.length)}` }, exited,
      stop: async () => { call.stops++; exit({ kind: 'exited', code: 0 }); } };
    const call: FakeHelper = { command, output, child, exit, stops: 0 };
    calls.push(call);
    const stdout = reply(command);
    if (stdout !== undefined) setImmediate(() => { output.stdout(stdout); exit({ kind: 'exited', code: 0 }); });
    return child;
  };
  return { runner, calls };
}

export class FakeFence {
  effects: FenceEffect[] = [];
  wda: { udid: string; bundleId: string; pid: number }[] = [];
  forwards: { serial: string; local: string; remote: string }[] = [];
  values: Record<string, string | null> = { hidden_api_policy: '1', hidden_api_policy_p_apps: '1', hidden_api_policy_pre_p_apps: '1', accessibility_enabled: '1' };
  processes = new Map<number, string>();
  run: FenceRunner = async effect => {
    this.effects.push(structuredClone(effect));
    switch (effect.kind) {
      case 'host-inventory': return [];
      case 'host-signal': case 'host-signal-group': return { ok: true };
      case 'wda-inventory': return structuredClone(this.wda.filter(row => row.udid === effect.udid));
      case 'wda-stop': this.wda = this.wda.filter(row => row.pid !== effect.pid); return { ok: true };
      case 'android-process': { const startTime = this.processes.get(effect.pid); return startTime ? { kind: 'running', startTime } : { kind: 'absent' }; }
      case 'android-stop': this.processes.delete(effect.process.pid); return { ok: true };
      case 'forward-inventory': return structuredClone(this.forwards);
      case 'forward-remove': this.forwards = this.forwards.filter(row => row.serial !== effect.serial || row.local !== effect.local); return { ok: true };
      case 'settings-read': return structuredClone(this.values);
      case 'settings-write': this.values[effect.key] = effect.value; return { ok: true };
    }
  };
}

export function driverFixture(t: TestContext, recording: (root: string) => string, options: Partial<AppiumDriverOptions> & Pick<AppiumDriverOptions, 'target' | 'identityProbe'>, fault = 'none',
  nativeReply?: (command: NativeCommand) => string | undefined) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'appium-driver-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const name of ['homes', 'logs', 'shots', 'locks', 'admission']) mkdirSync(join(root, name), { mode: 0o700 });
  const admission = options.admission ?? Admission.forTesting({ root: join(root, 'admission'), backend: 'fake', durability: 'fast' });
  const trace = join(root, 'trace.jsonl');
  const fence = new FakeFence();
  const native = fakeNativeRunner(nativeReply);
  let port = 18100;
  const driver = new AppiumDriver({ stack: driverStack(t), admission, backend: 'fake', homeRoot: join(root, 'homes'), logFolder: join(root, 'logs'),
    screenshotFolder: join(root, 'shots'), lockRoot: join(root, 'locks'), fence: fence.run, nativeRunner: native.runner, freePort: async () => port++,
    startLookup: pid => `host-${String(pid)}`, runMarker: () => '0123456789abcdef0123456789abcdef', runId: 'run-1', timeoutMs: 20_000,
    child: { entrypoint: resolve('tests/fixtures/appium-wire/fake-mcp.ts'), args: [recording(root), fault, trace, join(root, 'environment.json')], nodeArgs: ['--import', import.meta.resolve('tsx')] },
    ...options });
  const calls = () => { try { return readFileSync(trace, 'utf8').trim().split('\n').map(line => JSON.parse(line) as { method?: string; params?: { name?: string; arguments?: Record<string, unknown> } }); } catch { return []; } };
  const tools = () => calls().filter(call => call.method === 'tools/call').map(call => call.params!.name!);
  return { root, admission, driver, fence, native, trace, calls, tools };
}
