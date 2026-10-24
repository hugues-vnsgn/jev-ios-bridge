import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { z } from 'zod/v4';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { JSONRPCMessageSchema, type JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { OwnerIdentity } from '../device/admission.js';
import type { VerifiedStack } from './stack.js';
import { validateSessionCapabilities, type SessionProfile } from './session.js';
import { AppiumError, CLIENT_SDK, EXTENSION_VERSION, FROZEN_PROTOCOL_VERSIONS, SOURCE_SETTINGS,
  creationResultSchema, deletionResultSchema, extensionErrorSchema, sessionManagementSchema,
  settingsResultSchema, checkedToolReply, extensionRequestSchema, extensionResults, type ExtensionCall, type ExtensionResult,
  type AppiumErrorCode, type AppiumPlatform, type AppiumSessionId } from './wire-schemas.js';

export type AppiumComponentRecord =
  | { kind: 'appium-child'; owner: OwnerIdentity; pid: number; home: string }
  | { kind: 'appium-session'; owner: OwnerIdentity; childPid: number; sessionId: AppiumSessionId; platform: AppiumPlatform; device: string };
type Child = { entrypoint: string; args?: string[]; nodeArgs?: string[] };
type OpenOptions = { stack: VerifiedStack; owner: OwnerIdentity; homeRoot: string; child?: Child; profile?: SessionProfile; timeoutMs?: number; androidSdkRoot?: string;
  onComponent: (record: AppiumComponentRecord) => void | Promise<void> };
type ChildOptions = OpenOptions & { child: Child };
type ManagementResult = { kind: 'created'; sessionId: AppiumSessionId } | { kind: 'deleted' };

function verifyClientSdk(stack: VerifiedStack): void {
  const sdkPath = 'node_modules/@modelcontextprotocol/sdk';
  const selected = stack.manifest.packages.filter(pkg => pkg.path === sdkPath && pkg.name === '@modelcontextprotocol/sdk');
  if (selected.length !== 1 || selected[0]?.version !== CLIENT_SDK.version || selected[0]?.integrity !== CLIENT_SDK.integrity)
    throw new AppiumError('SDK_IDENTITY_MISMATCH');
  const root = resolve(dirname(fileURLToPath(import.meta.resolve('@modelcontextprotocol/sdk/client/index.js'))), '../../..');
  const prefix = sdkPath + '/';
  const expected = Object.entries(stack.manifest.files).filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('node_modules/'));
  if (expected.length === 0) throw new AppiumError('SDK_IDENTITY_MISMATCH');
  try {
    const actual = new Set<string>();
    const walk = (directory: string): void => {
      for (const item of readdirSync(join(root, directory), { withFileTypes: true })) {
        if (!directory && item.name === 'node_modules') continue;
        const path = directory ? directory + '/' + item.name : item.name;
        if (item.isDirectory()) walk(path); else actual.add(path);
      }
    };
    walk('');
    if (actual.size !== expected.length) throw new AppiumError('SDK_IDENTITY_MISMATCH');
    for (const [path, entry] of expected) {
      const relative = path.slice(prefix.length); const full = join(root, relative);
      if (!actual.has(relative) || entry.kind !== 'file' || !lstatSync(full).isFile()
        || createHash('sha256').update(readFileSync(full)).digest('hex') !== entry.sha256)
        throw new AppiumError('SDK_IDENTITY_MISMATCH');
    }
  } catch { throw new AppiumError('SDK_IDENTITY_MISMATCH'); }
}

class PrivateStdioTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  private child: ChildProcessWithoutNullStreams | undefined;
  private closed = false;
  private pending = Buffer.alloc(0);
  private stderrTail = Buffer.alloc(0);
  private closing: Promise<void> | undefined;
  constructor(private readonly options: ChildOptions, private readonly home: string, private readonly recordPid: (pid: number) => Promise<void>) {}
  setProtocolVersion(version: string): void {
    if (!FROZEN_PROTOCOL_VERSIONS.includes(version)) throw new AppiumError('PROTOCOL_VERSION_MISMATCH');
  }
  async start(): Promise<void> {
    const env: Record<string, string> = { HOME: this.home, PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'C.UTF-8',
      APPIUM_HOME: this.home, TMPDIR: this.home, APPIUM_MCP_ON_CLIENT_DISCONNECT: 'delete_all', ALLOW_REMOTE_APP_URLS: 'false' };
    if (this.options.androidSdkRoot !== undefined) {
      env.ANDROID_HOME = this.options.androidSdkRoot; env.ANDROID_SDK_ROOT = this.options.androidSdkRoot;
    }
    this.child = spawn(process.execPath, [...(this.options.child.nodeArgs ?? []), this.options.child.entrypoint, ...(this.options.child.args ?? [])],
      { cwd: this.options.stack.root, env, stdio: ['pipe', 'pipe', 'pipe'], shell: false });
    const child = this.child;
    child.on('error', () => this.fail());
    child.on('exit', () => this.end());
    child.stdout.on('end', () => this.end());
    child.stdout.on('error', () => this.fail());
    child.stdin.on('error', () => this.fail());
    child.stderr.on('error', () => this.fail());
    child.stderr.on('data', () => {
      this.stderrTail = Buffer.concat([this.stderrTail, Buffer.from('[private appium stderr redacted]\n')]).subarray(-65536);
    });
    child.stdout.on('data', (chunk: Buffer) => {
      if (this.closed) return;
      this.pending = Buffer.concat([this.pending, chunk]);
      if (this.pending.length > 16 * 1024 * 1024) { this.fail(); return; }
      for (let newline = this.pending.indexOf(10); newline !== -1; newline = this.pending.indexOf(10)) {
        const line = this.pending.subarray(0, newline); this.pending = this.pending.subarray(newline + 1);
        try { this.onmessage?.(JSONRPCMessageSchema.parse(JSON.parse(line.toString('utf8')))); }
        catch { this.fail(); return; }
      }
    });
    await once(child, 'spawn');
    if (child.pid === undefined) throw new AppiumError('CONNECTION_LOST');
    await this.recordPid(child.pid);
  }
  private fail(): void { this.onerror?.(new AppiumError('ACKNOWLEDGEMENT_LOST')); this.end(); }
  private end(): void {
    if (this.closed) return;
    this.closed = true; this.onclose?.();
  }
  async send(message: JSONRPCMessage): Promise<void> {
    const child = this.child;
    if (this.closed || !child) throw new AppiumError('CONNECTION_LOST');
    await new Promise<void>((done, fail) => child.stdin.write(JSON.stringify(message) + '\n', error => error ? fail(new AppiumError('CONNECTION_LOST')) : done()));
  }
  close(): Promise<void> { this.closing ??= this.closeOnce(); return this.closing; }
  private async closeOnce(): Promise<void> {
    this.end(); this.pending = Buffer.alloc(0); this.stderrTail.fill(0); this.stderrTail = Buffer.alloc(0);
    const child = this.child;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    child.stdin.end();
    const exited = new Promise<void>(done => child.once('exit', () => done()));
    const wait = async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try { await Promise.race([exited, new Promise<void>(done => { timer = setTimeout(done, 2000); })]); }
      finally { clearTimeout(timer); }
    };
    await wait();
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await wait(); }
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await wait(); }
  }
}

export class PrivateAppiumClient {
  private readonly sdk = new Client({ name: 'jev-ios-bridge-private', version: '1' }, { capabilities: {} });
  private readonly records: AppiumComponentRecord[] = [];
  private readonly transport: PrivateStdioTransport;
  private dispatch = true;
  private inFlight = false;
  private created = false;
  private session: { id: AppiumSessionId; profile: SessionProfile } | undefined;
  private closing: Promise<void> | undefined;
  private constructor(private readonly options: ChildOptions, home: string) {
    this.transport = new PrivateStdioTransport(options, home, async pid => {
      const record = { kind: 'appium-child', owner: structuredClone(options.owner), pid, home } satisfies AppiumComponentRecord;
      this.records.push(record); await options.onComponent(structuredClone(record));
    });
    this.sdk.onerror = () => { this.dispatch = false; };
    this.sdk.onclose = () => { this.dispatch = false; };
  }
  static async open(options: OpenOptions): Promise<PrivateAppiumClient> {
    verifyClientSdk(options.stack);
    if (!isAbsolute(options.homeRoot) || (options.child !== undefined && !isAbsolute(options.child.entrypoint)) || (!options.child && !options.profile)
      || (options.androidSdkRoot !== undefined && !isAbsolute(options.androidSdkRoot))) throw new AppiumError('NOT_ALLOWED');
    mkdirSync(options.homeRoot, { recursive: true, mode: 0o700 });
    const directory = lstatSync(options.homeRoot);
    if (!directory.isDirectory() || directory.uid !== process.getuid?.() || (directory.mode & 0o077) !== 0) throw new AppiumError('NOT_ALLOWED');
    const home = mkdtempSync(join(options.homeRoot, 'command-'));
    let child = options.child;
    if (!child) {
      const profileFile = join(home, 'profile.json');
      writeFileSync(profileFile, JSON.stringify(options.profile), { mode: 0o600, flag: 'wx' });
      child = { entrypoint: fileURLToPath(new URL('./extension/entry.js', import.meta.url)), args: [options.stack.root, profileFile] };
    }
    const client = new PrivateAppiumClient({ ...options, child }, home);
    try { await client.sdk.connect(client.transport, { timeout: options.timeoutMs ?? 120000 }); return client; }
    catch (error) {
      await client.close();
      if (error instanceof AppiumError) throw error;
      if (error instanceof Error && error.message.startsWith("Server's protocol version is not supported:")) throw new AppiumError('PROTOCOL_VERSION_MISMATCH');
      throw new AppiumError('CONNECTION_LOST');
    }
  }
  get components(): readonly AppiumComponentRecord[] { return structuredClone(this.records); }
  get dispatchOpen(): boolean { return this.dispatch; }
  stopDispatch(): void { this.dispatch = false; }
  private fault(code: AppiumErrorCode): never { this.dispatch = false; throw new AppiumError(code); }
  private async call(name: string, args: Record<string, unknown>, timeoutMs?: number) {
    if (!this.dispatch) throw new AppiumError('CONNECTION_LOST');
    if (this.inFlight) throw new AppiumError('NOT_ALLOWED');
    this.inFlight = true;
    try {
      const result: unknown = await this.sdk.callTool({ name, arguments: args }, undefined, { timeout: timeoutMs ?? this.options.timeoutMs ?? 120000, resetTimeoutOnProgress: false });
      const parsed = checkedToolReply(name, args, result);
      if (parsed.isError) {
        const failure = extensionErrorSchema.safeParse(parsed.structuredContent);
        return this.fault(failure.success ? failure.data.error.code : 'ACKNOWLEDGEMENT_LOST');
      }
      return parsed;
    } catch (error) {
      this.dispatch = false;
      if (error instanceof AppiumError) throw error;
      throw new AppiumError('ACKNOWLEDGEMENT_LOST');
    } finally { this.inFlight = false; }
  }
  async callExtension(request: Extract<ExtensionCall, { name: 'jev_session_inventory' }>, timeoutMs?: number): Promise<ExtensionResult<'jev_session_inventory'>>;
  async callExtension(request: Extract<ExtensionCall, { name: 'jev_settings' }>, timeoutMs?: number): Promise<ExtensionResult<'jev_settings'>>;
  async callExtension(request: Extract<ExtensionCall, { name: 'jev_screen' }>, timeoutMs?: number): Promise<ExtensionResult<'jev_screen'>>;
  async callExtension(request: Extract<ExtensionCall, { name: 'jev_replace_text' }>, timeoutMs?: number): Promise<ExtensionResult<'jev_replace_text'>>;
  async callExtension(request: Extract<ExtensionCall, { name: 'jev_android_back' }>, timeoutMs?: number): Promise<ExtensionResult<'jev_android_back'>>;
  async callExtension(request: Extract<ExtensionCall, { name: 'jev_start_activity' }>, timeoutMs?: number): Promise<ExtensionResult<'jev_start_activity'>>;
  async callExtension(request: Extract<ExtensionCall, { name: 'jev_terminate_app' }>, timeoutMs?: number): Promise<ExtensionResult<'jev_terminate_app'>>;
  async callExtension(request: ExtensionCall, timeoutMs?: number) {
    const session = this.session;
    if (!session) throw new AppiumError('SESSION_MISMATCH');
    const parsed = extensionRequestSchema.safeParse({ name: request.name,
      arguments: { ...request.arguments, sessionId: session.id, extensionVersion: EXTENSION_VERSION } });
    if (!parsed.success) throw new AppiumError('NOT_ALLOWED');
    const reply = await this.call(parsed.data.name, parsed.data.arguments, timeoutMs);
    return z.parse(extensionResults[parsed.data.name], reply.structuredContent);
  }
  async manageSession(input: unknown, profile: SessionProfile, timeoutMs?: number): Promise<ManagementResult> {
    const parsed = sessionManagementSchema.safeParse(input);
    if (!parsed.success) throw new AppiumError('NOT_ALLOWED');
    const args = parsed.data;
    if (args.action === 'create') {
      if (this.created || args.platform !== profile.platform) throw new AppiumError('NOT_ALLOWED');
      let caps: unknown;
      try { caps = JSON.parse(args.capabilities); } catch { throw new AppiumError('NOT_ALLOWED'); }
      validateSessionCapabilities(profile, caps);
      this.created = true;
      const reply = await this.call('appium_session_management', args, timeoutMs);
      const result = creationResultSchema.safeParse(reply.structuredContent);
      if (!result.success) return this.fault('ACKNOWLEDGEMENT_LOST');
      const owned = result.data.sessions[0];
      if (owned.platform !== profile.platform || owned.device !== profile.device) return this.fault('SESSION_MISMATCH');
      const child = this.records.find(record => record.kind === 'appium-child');
      if (!child || child.kind !== 'appium-child') return this.fault('CONNECTION_LOST');
      this.session = { id: owned.sessionId, profile };
      const record = { kind: 'appium-session', owner: structuredClone(this.options.owner), childPid: child.pid,
        sessionId: owned.sessionId, platform: owned.platform, device: owned.device } satisfies AppiumComponentRecord;
      this.records.push(record);
      try { await this.options.onComponent(structuredClone(record)); }
      catch { return this.fault('ACKNOWLEDGEMENT_LOST'); }
      return { kind: 'created', sessionId: owned.sessionId };
    }
    if (!this.session || args.sessionId !== this.session.id) throw new AppiumError('SESSION_MISMATCH');
    const reply = await this.call('appium_session_management', args, timeoutMs);
    const result = deletionResultSchema.safeParse(reply.structuredContent);
    if (!result.success || result.data.sessionId !== this.session.id) return this.fault('ACKNOWLEDGEMENT_LOST');
    return { kind: 'deleted' };
  }
  async applySettings(profile: SessionProfile, timeoutMs?: number): Promise<void> {
    const session = this.session;
    if (!session || session.profile !== profile) throw new AppiumError('SESSION_MISMATCH');
    const settings = SOURCE_SETTINGS[profile.platform];
    let reply;
    try { reply = await this.call('jev_settings', { extensionVersion: EXTENSION_VERSION, sessionId: session.id, settings }, timeoutMs); }
    catch (error) {
      if (error instanceof AppiumError && error.code === 'DRIVER_ERROR') throw new AppiumError('SETTINGS_READBACK_MISMATCH');
      throw error;
    }
    if (reply.structuredContent?.sessionId !== session.id) return this.fault('SESSION_MISMATCH');
    if (reply.structuredContent?.extensionVersion !== EXTENSION_VERSION) return this.fault('VERSION_MISMATCH');
    const result = settingsResultSchema.safeParse(reply.structuredContent);
    if (!result.success || !Object.entries(settings).every(([key, value]) => result.data.settings[key] === value)) return this.fault('SETTINGS_READBACK_MISMATCH');
  }
  close(): Promise<void> {
    this.dispatch = false; this.closing ??= this.transport.close(); return this.closing;
  }
}
