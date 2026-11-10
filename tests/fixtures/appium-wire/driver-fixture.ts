import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { TestContext } from 'node:test';
import { Admission, type OwnerIdentity } from '../../../src/device/admission.js';
import type { VerifiedStack } from '../../../src/appium/stack.js';
import type { FenceRunner } from '../../../src/appium/fence/index.js';
import { hostInventorySchema, type FenceEffect, type HostRow } from '../../../src/appium/fence/schema.js';
import type { NativeCommand, NativeExit, NativeOutput, NativeProcess, NativeRunner } from '../../../src/appium/native/process.js';
import { AppiumDriver, type AppiumDriverOptions } from '../../../src/appium/driver.js';
import { extensionFailure } from '../../../src/appium/wire-schemas.js';
import { clientFixture } from './client-fixture.js';
import { imageStack, type Cleanups } from './image-stack.js';

export const UDID = 'ABCDEF00-0000-4000-8000-000000000001';
export const WDA_BUNDLE = 'com.facebook.WebDriverAgentRunner.xctrunner';

/** One stack that verifies both the private SDK (client) and sharp (observation). */
export function driverStack(t: Cleanups): VerifiedStack {
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

const recordingLines = (path: string) => readFileSync(resolve(path), 'utf8').trim().split('\n');
const APPLE = 'name="choose.apple" label="Add Apple ($2)" enabled="true" visible="true" accessible="true" x="16" y="284" width="370" height="37"';
/** One settled pair showing control `identifier` at (0, 0, 20, 40), so a tap on it lands at (10, 20) as recorded. */
function controlScreens(observe: string[], identifier: string): string[] {
  return observe.slice(7, 15).map(line => {
    const entry = JSON.parse(line) as { message: { result?: { structuredContent?: { xml?: string } } } };
    const content = entry.message.result?.structuredContent;
    if (content && typeof content.xml === 'string') content.xml = content.xml.replace(APPLE,
      `name="${identifier}" label="Control ${identifier}" enabled="true" visible="true" accessible="true" x="0" y="0" width="20" height="40"`);
    return JSON.stringify(entry);
  });
}
/** An iOS session that shows `go`, takes one tap and then shows `done`; `tap: 'error'` answers the tap with DRIVER_ERROR. */
export function tapRecording(root: string, options: { tap?: 'ok' | 'error' } = {}): string {
  const [header, ...observe] = recordingLines('tests/fixtures/appium-wire/ios/observe-2.jsonl');
  const tap = recordingLines('tests/fixtures/appium-wire/ios/operations-tap.jsonl').slice(1);
  const perform = tap.findIndex(line => (JSON.parse(line) as { message: { params?: { name?: string } } }).message.params?.name === 'appium_perform_actions');
  const [request, answer] = tap.slice(perform, perform + 2) as [string, string];
  const reply = options.tap === 'error' ? (() => { const entry = JSON.parse(answer) as { message: { result: unknown } };
    entry.message.result = extensionFailure('DRIVER_ERROR');
    return JSON.stringify(entry); })() : answer;
  const body = options.tap === 'error'
    ? [...observe.slice(0, 7), ...controlScreens(observe, 'go'), request, reply, ...observe.slice(17)]
    : [...observe.slice(0, 7), ...controlScreens(observe, 'go'), request, reply, ...controlScreens(observe, 'done'), ...controlScreens(observe, 'done'), ...observe.slice(17)];
  const path = join(root, 'tap.jsonl');
  writeFileSync(path, [header, ...body.map(line => line.replaceAll('ios-test', UDID))].join('\n') + '\n');
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
  /** Live host processes as the host sampler reports them; a signal ends the rows it reaches. */
  host: HostRow[] = [];
  /** The WDA runner a created session starts: listed once `sessionStarted` says so, until the fence stops it. */
  sessionRunner: { udid: string; bundleId: string; pid: number } | undefined;
  sessionStarted: () => boolean = () => false;
  private runnerStopped = false;
  private runners() {
    return [...this.wda, ...(this.sessionRunner && this.sessionStarted() && !this.runnerStopped ? [this.sessionRunner] : [])];
  }
  /** Fails the first effect it matches, once, as a lost device answer would. */
  failOnce: ((effect: FenceEffect) => boolean) | undefined;
  run: FenceRunner = async effect => {
    this.effects.push(structuredClone(effect));
    if (this.failOnce?.(effect)) { this.failOnce = undefined; throw new Error(`${effect.kind} failed`); }
    switch (effect.kind) {
      case 'host-inventory': return structuredClone(this.host);
      case 'host-signal': this.host = this.host.filter(row => row.pid !== effect.process.pid || row.startTime !== effect.process.startTime); return { ok: true };
      case 'host-signal-group': this.host = this.host.filter(row => row.pgid !== effect.pgid); return { ok: true };
      case 'wda-inventory': return structuredClone(this.runners().filter(row => row.udid === effect.udid));
      case 'wda-stop':
        this.wda = this.wda.filter(row => row.pid !== effect.pid);
        if (this.sessionRunner?.pid === effect.pid) this.runnerStopped = true;
        return { ok: true };
      case 'android-process': { const startTime = this.processes.get(effect.pid); return startTime ? { kind: 'running', startTime } : { kind: 'absent' }; }
      case 'android-stop': this.processes.delete(effect.process.pid); return { ok: true };
      case 'forward-inventory': return structuredClone(this.forwards);
      case 'forward-remove': this.forwards = this.forwards.filter(row => row.serial !== effect.serial || row.local !== effect.local); return { ok: true };
      case 'settings-read': return structuredClone(this.values);
      case 'settings-write': this.values[effect.key] = effect.value; return { ok: true };
    }
  };
}

/** The fence's TERM, wait and poll steps run on virtual time, so a group stop costs no real 5 s. */
export function virtualClock() {
  let time = 0;
  return { now: () => time, sleep: async (ms: number, signal: AbortSignal) => { signal.throwIfAborted(); time += ms; } };
}

export const hostRows = (rows: unknown[]): HostRow[] => hostInventorySchema.parse(rows);

/** The rows the real host sampler reports for a live private child: the leader, launched by this process. */
export function liveGroupRows(admission: Admission, owner: OwnerIdentity): HostRow[] {
  const group = admission.readGeneration(owner).components.find(component => component.kind === 'appium-process-group')!.declaration as
    { leader: { pid: number; startTime: string }; runMarker: string; pgid: number; launcher: { pid: number; startTime: string } };
  return hostRows([{ ...group.leader, ppid: group.launcher.pid, pgid: group.pgid, state: 'running', executable: '/usr/local/bin/node', runMarker: group.runMarker, launchChain: [group.launcher] }]);
}

export function driverFixture(t: TestContext, recording: (root: string) => string, options: Partial<AppiumDriverOptions> & Pick<AppiumDriverOptions, 'target' | 'identityProbe'>, fault = 'none',
  nativeReply?: (command: NativeCommand) => string | undefined) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'appium-driver-')));
  const drivers: AppiumDriver[] = [];
  // One hook, close before removal: a live fake child writes under root, so removing first can throw and skip the close.
  t.after(async () => {
    for (const opened of drivers) await opened.close(AbortSignal.timeout(30_000)).catch(() => undefined);
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });
  for (const name of ['homes', 'logs', 'shots', 'locks', 'admission']) mkdirSync(join(root, name), { mode: 0o700 });
  const admission = options.admission ?? Admission.forTesting({ root: join(root, 'admission'), backend: 'fake', durability: 'fast' });
  const trace = join(root, 'trace.jsonl');
  const fence = new FakeFence();
  if (options.target.platform === 'ios') fence.sessionRunner = { udid: options.target.device, bundleId: WDA_BUNDLE, pid: 777 };
  const native = fakeNativeRunner(nativeReply);
  let port = 18100;
  const driver = new AppiumDriver({ stack: driverStack(t), admission, backend: 'fake', homeRoot: join(root, 'homes'), logFolder: join(root, 'logs'),
    screenshotFolder: join(root, 'shots'), lockRoot: join(root, 'locks'), fence: fence.run, nativeRunner: native.runner, freePort: async () => port++,
    startLookup: pid => `host-${String(pid)}`, runMarker: () => '0123456789abcdef0123456789abcdef', runId: 'run-1', timeoutMs: 20_000, fenceClock: virtualClock(), presentation: async () => 'visible',
    child: { entrypoint: resolve('tests/fixtures/appium-wire/fake-mcp.ts'), args: [recording(root), fault, trace, join(root, 'environment.json')], nodeArgs: ['--import', import.meta.resolve('tsx')] },
    ...options });
  drivers.push(driver);
  const calls = () => { try { return readFileSync(trace, 'utf8').trim().split('\n').map(line => JSON.parse(line) as { method?: string; params?: { name?: string; arguments?: Record<string, unknown> } }); } catch { return []; } };
  const tools = () => calls().filter(call => call.method === 'tools/call').map(call => call.params!.name!);
  fence.sessionStarted = () => tools().includes('appium_session_management');
  return { root, admission, driver, drivers, fence, native, trace, calls, tools };
}
