import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import type { Action, ActionScenarioContext, DeviceDriver, DeviceMetrics, Element, PrepareScenarioContext, Snapshot } from '../contracts/index.js';
import { bridgeRole } from '../scripted/vocabulary.js';

type JsonObject = Record<string, unknown>;
export type CliResult = { stdout: string; stderr: string; exitCode: number };
export type CliRunner = (args: string[], signal: AbortSignal) => Promise<CliResult>;

export interface MobileBuildMcpDriverOptions {
  cwd: string;
  executable?: string;
  prefixArgs?: string[];
  defaultUdid?: string;
  capture?: 'compact' | 'full';
  screenshots?: boolean;
  stopAppOnClose?: boolean;
  runner?: CliRunner;
  lockRoot?: string;
  uiCommandTimeoutMs?: number;
  /**
   * Use the settled full capture MobileBuildMCP returns with each action (schema "3") as the next
   * observation, instead of capturing again. Off by default: MobileBuildMCP 2.7.1 can report a screen
   * as settled mid-transition, mixing the old and new screens (spikes/benchmarks/results/v1.0.0/capture-reuse).
   */
  reuseActionCapture?: boolean;
  /**
   * Measurement aid: after each screenshot, capture again and record whether the screen hash still
   * matches the capture the screenshot accompanies. Costs one extra capture per observation.
   */
  verifyScreenshotAgreement?: boolean;
}

const UI_ACTION_RESULT = 'mobilebuildmcp.output.ui-action-result';

/** Envelope versions the pinned MobileBuildMCP 2.7.1 returns: "2", or "3" for a verbose UI action. */
function supportedVersion(schema: unknown, version: unknown): boolean {
  return version === '2' || (schema === UI_ACTION_RESULT && version === '3');
}

export class DeviceCliError extends Error {
  constructor(readonly code: string, message: string, readonly terminalAcknowledged = false) {
    super(message);
    this.name = 'DeviceCliError';
  }
}

export class StaleSnapshotError extends Error {
  constructor(message = 'The screen changed; observe and ask Jev again') {
    super(message);
    this.name = 'StaleSnapshotError';
  }
}

function record(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function terminalPayloadMatches(envelope: JsonObject, expectedSchema: string, success: boolean): boolean {
  if (envelope.schema !== expectedSchema || !supportedVersion(envelope.schema, envelope.schemaVersion)) return false;
  const data = record(envelope.data);
  if (Object.keys(record(data.artifacts)).length === 0) return false;
  if (expectedSchema === UI_ACTION_RESULT && Object.keys(record(data.action)).length === 0) return false;
  if (expectedSchema === 'mobilebuildmcp.output.capture-result' && success && Object.keys(record(data.capture)).length === 0) return false;
  return true;
}

function parseEnvelope(result: CliResult, expectedSchema?: string): JsonObject {
  let envelope: JsonObject;
  try {
    envelope = record(JSON.parse(result.stdout));
  } catch {
    throw new DeviceCliError('INVALID_JSON', `MobileBuildMCP returned invalid JSON (exit ${result.exitCode})`);
  }
  if (envelope.didError === true || result.exitCode !== 0) {
    const uiError = record(record(envelope.data).uiError);
    const legacyError = record(envelope.error);
    const terminalAcknowledged = expectedSchema !== undefined && terminalPayloadMatches(envelope, expectedSchema, false);
    throw new DeviceCliError(
      string(uiError.code) ?? string(legacyError.code) ?? 'DEVICE_ERROR',
      string(uiError.message) ?? string(envelope.error) ?? string(legacyError.message) ?? `MobileBuildMCP failed (exit ${result.exitCode})`,
      terminalAcknowledged,
    );
  }
  if (!supportedVersion(envelope.schema, envelope.schemaVersion) || !envelope.data || typeof envelope.data !== 'object' || Array.isArray(envelope.data)) {
    throw new DeviceCliError('INVALID_ENVELOPE', 'MobileBuildMCP returned an unsupported envelope');
  }
  if (expectedSchema && !terminalPayloadMatches(envelope, expectedSchema, true)) {
    throw new DeviceCliError('TERMINAL_ACK_MISSING', 'MobileBuildMCP did not return the expected terminal result');
  }
  return record(envelope.data);
}

function parseCompactRow(row: unknown): Element | undefined {
  if (typeof row !== 'string') return undefined;
  const [ref, action, role, label, value, identifier] = row.split('|');
  if (!ref || !role) return undefined;
  const actions = (action ?? '').split(',').flatMap((name) => {
    if (name === 'swipe') return ['swipeWithin'];
    if (name === 'type') return ['typeText'];
    if (name === 'text' || !name) return [];
    return [name];
  });
  return {
    ref,
    role: bridgeRole(role),
    ...(label ? { label } : {}),
    ...(value ? { value } : {}),
    ...(identifier ? { identifier } : {}),
    actions,
  };
}

function parseFullElement(value: unknown): Element | undefined {
  const item = record(value);
  const ref = string(item.ref);
  const role = string(item.role);
  if (!ref || !role) return undefined;
  const frame = record(item.frame);
  const state = record(item.state);
  const hasFrame = ['x', 'y', 'width', 'height'].every((key) => number(frame[key]) !== undefined);
  return {
    ref,
    role: bridgeRole(role),
    ...(string(item.label) !== undefined ? { label: string(item.label)! } : {}),
    ...(string(item.value) !== undefined ? { value: string(item.value)! } : {}),
    ...(string(item.identifier) !== undefined ? { identifier: string(item.identifier)! } : {}),
    ...(hasFrame ? { frame: { x: number(frame.x)!, y: number(frame.y)!, width: number(frame.width)!, height: number(frame.height)! } } : {}),
    ...(typeof state.enabled === 'boolean' && typeof state.visible === 'boolean'
      ? { state: { enabled: state.enabled, visible: state.visible,
          ...(typeof state.focused === 'boolean' ? { focused: state.focused } : {}),
          ...(typeof state.selected === 'boolean' ? { selected: state.selected } : {}) } }
      : {}),
    actions: Array.isArray(item.actions) ? item.actions.filter((action): action is string => typeof action === 'string') : [],
  };
}

export function parseSnapshot(data: JsonObject, deviceId: string, screenshotPath?: string): Snapshot {
  const capture = record(data.capture);
  if (capture.type !== 'runtime-snapshot' || !['rs/1', '1'].includes(string(capture.protocol) ?? string(capture.rs) ?? '')) {
    throw new DeviceCliError('INVALID_CAPTURE', 'MobileBuildMCP returned no runtime snapshot');
  }
  const full = Array.isArray(capture.elements);
  const normalized: Element[] = full
    ? (capture.elements as unknown[]).map(parseFullElement).filter((element): element is Element => element !== undefined)
    : [...(Array.isArray(capture.targets) ? capture.targets : []),
        ...(Array.isArray(capture.scroll) ? capture.scroll : []),
        ...(Array.isArray(capture.text) ? capture.text : [])]
      .map(parseCompactRow).filter((element): element is Element => element !== undefined)
      .reduce<Element[]>((items, element) => {
        const existing = items.find(item => item.ref === element.ref);
        if (!existing) items.push(element);
        else existing.actions = [...new Set([...existing.actions, ...element.actions])];
        return items;
      }, []);
  if (normalized.length === 0 && number(capture.count) !== 0) {
    throw new DeviceCliError('EMPTY_CAPTURE', 'MobileBuildMCP returned no usable elements');
  }
  const capturedAt = number(capture.capturedAtMs) ?? Date.now();
  return {
    deviceId,
    capturedAt,
    expiresAt: number(capture.expiresAtMs) ?? capturedAt + 60_000,
    sequence: number(capture.seq) ?? 0,
    elements: normalized,
    truncated: !full && [
      Array.isArray(capture.targets) && capture.targets.length >= 64,
      Array.isArray(capture.scroll) && capture.scroll.length >= 32,
      Array.isArray(capture.text) && capture.text.length >= 64,
    ].some(Boolean),
    ...(string(capture.screenHash) ? { screenHash: string(capture.screenHash)! } : {}),
    ...(screenshotPath ? { screenshotPath } : {}),
  };
}

/** The environment for device-layer processes: the bridge's own, minus the Jev key, with vendor telemetry off. */
export function deviceEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const { TYPESAFE_API_KEY: _jevKey, ...environment } = source;
  return { ...environment, MOBILEBUILDMCP_SENTRY_DISABLED: 'true' };
}

/** The pinned MobileBuildMCP CLI installed with the bridge, run directly by Node (no npx round trip). */
export function pinnedMobileBuildMcpCli(): string {
  return createRequire(import.meta.url).resolve('mobilebuildmcp');
}

function defaultRunner(options: MobileBuildMcpDriverOptions): CliRunner {
  const executable = options.executable ?? process.execPath;
  const prefix = options.prefixArgs ?? (options.executable ? [] : [pinnedMobileBuildMcpCli()]);
  return (args, signal) => new Promise((resolveResult, reject) => {
    execFile(executable, [...prefix, ...args], {
      cwd: resolve(options.cwd),
      env: deviceEnvironment(),
      signal,
      maxBuffer: 8 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error && (error as NodeJS.ErrnoException).code === 'ABORT_ERR') {
        reject(error);
        return;
      }
      resolveResult({ stdout, stderr, exitCode: error && 'code' in error && typeof error.code === 'number' ? error.code : error ? 1 : 0 });
    });
  });
}

async function configuredUdid(cwd: string): Promise<string | undefined> {
  try {
    const yaml = await readFile(join(cwd, '.mobilebuildmcp', 'config.yaml'), 'utf8');
    return yaml.match(/^\s*simulatorId:\s*([0-9a-fA-F-]{36})\s*$/m)?.[1];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

const SIMULATOR_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The dedicated simulator a run will use: the script's UDID, then the configured default
 * (JEV_DEVICE_UDID), then `.mobilebuildmcp/config.yaml`. Aliases such as `booted` are refused.
 */
export async function selectDeviceId(cwd: string, scriptUdid?: string, defaultUdid?: string): Promise<string> {
  const selected = scriptUdid ?? defaultUdid ?? await configuredUdid(cwd);
  if (!selected) throw new DeviceCliError('NO_DEVICE', 'Set a dedicated simulator UDID in the scenario or MobileBuildMCP config');
  if (!SIMULATOR_UUID.test(selected)) {
    throw new DeviceCliError('INVALID_DEVICE', 'Set a dedicated simulator UUID; device aliases are not supported');
  }
  return selected.toUpperCase();
}

/** Where device locks live. Documented so a person can inspect one; the bridge clears stale ones itself. */
export const DEFAULT_LOCK_ROOT = join(tmpdir(), 'jev-ios-bridge-device-locks');

function processAlive(pid: unknown): boolean {
  if (!Number.isSafeInteger(pid) || (pid as number) <= 0) return true; // unknown owner: never assume stale
  try { process.kill(pid as number, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}

async function lockOwner(path: string): Promise<{ pid?: unknown } | undefined> {
  try { return JSON.parse(await readFile(path, 'utf8')) as { pid?: unknown }; }
  catch { return undefined; }
}

async function acquireLock(root: string, deviceId: string): Promise<() => Promise<void>> {
  await mkdir(root, { recursive: true });
  const path = join(root, `${deviceId.toUpperCase()}.lock`);
  const token = randomUUID();
  let file;
  for (let attempt = 0; !file; attempt++) {
    try { file = await open(path, 'wx', 0o600); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const owner = await lockOwner(path);
      // A lock whose bridge process has exited can't be protecting an in-flight command.
      if (attempt === 0 && owner && !processAlive(owner.pid)) {
        await unlink(path).catch((unlinkError: NodeJS.ErrnoException) => { if (unlinkError.code !== 'ENOENT') throw unlinkError; });
        continue;
      }
      const holder = owner && Number.isSafeInteger(owner.pid) ? `bridge process ${String(owner.pid)}` : 'another bridge process';
      throw new DeviceCliError('DEVICE_BUSY', `Device ${deviceId} is locked by ${holder} (lock file ${path}). ` +
        'Wait for that run to finish, or stop that process; the next run then clears the lock.');
    }
  }
  try { await file.writeFile(JSON.stringify({ pid: process.pid, token, deviceId, createdAt: new Date().toISOString() })); }
  catch (error) { await file.close(); await unlink(path); throw error; }
  await file.close();
  return async () => {
    try {
      const current = JSON.parse(await readFile(path, 'utf8')) as { token?: string };
      if (current.token === token) await unlink(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  };
}

function sameScreen(before: Snapshot, after: Snapshot): boolean {
  if (before.screenHash && after.screenHash) return before.screenHash === after.screenHash;
  const identity = (snapshot: Snapshot) => snapshot.elements.map(({ ref: _ref, ...element }) => element);
  return JSON.stringify(identity(before)) === JSON.stringify(identity(after));
}

async function awaitSettlement(pending: Promise<unknown>, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw signal.reason;
  await new Promise<void>((resolveDone, reject) => {
    const onAbort = () => { signal.removeEventListener('abort', onAbort); reject(signal.reason); };
    signal.addEventListener('abort', onAbort, { once: true });
    pending.then(
      () => { signal.removeEventListener('abort', onAbort); resolveDone(); },
      () => { signal.removeEventListener('abort', onAbort); resolveDone(); },
    );
  });
}

function awaitResultOrAbort<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolveResult, reject) => {
    const onAbort = () => { signal.removeEventListener('abort', onAbort); reject(signal.reason); };
    signal.addEventListener('abort', onAbort, { once: true });
    pending.then(
      result => { signal.removeEventListener('abort', onAbort); resolveResult(result); },
      error => { signal.removeEventListener('abort', onAbort); reject(error); },
    );
  });
}

function rematch(target: Element, fresh: Snapshot): Element {
  const matches = target.identifier
    ? fresh.elements.filter((element) => element.identifier === target.identifier)
    : fresh.elements.filter((element) => element.role === target.role && element.label === target.label);
  if (matches.length !== 1) throw new StaleSnapshotError(matches.length ? 'Refreshed screen has ambiguous target' : 'Target disappeared from refreshed screen');
  return matches[0]!;
}

async function readLogTail(path: string): Promise<string> {
  try {
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await file.stat();
      if (!stat.isFile()) return '[unavailable: not a regular file]';
      const length = Math.min(stat.size, 4_096);
      if (length === 0) return '';
      const bytes = Buffer.alloc(length);
      const { bytesRead } = await file.read(bytes, 0, length, stat.size - length);
      return bytes.subarray(0, bytesRead).toString('utf8');
    } finally { await file.close(); }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return `[unavailable: ${code && /^[A-Z0-9_]+$/.test(code) ? code : 'READ_FAILED'}]`;
  }
}

export class MobileBuildMcpDriver implements DeviceDriver {
  private readonly runner: CliRunner;
  private deviceId?: string;
  private bundleId?: string;
  private releaseLock: (() => Promise<void>) | undefined;
  private launched = false;
  private logPaths: Record<string, string> = {};
  private logNotes: Record<string, string> = {};
  private referenceRefreshes = 0;
  private referenceExpiries = 0;
  private nearTtlRefreshes = 0;
  private readonly unconfirmedCommands = new Set<symbol>();
  private readonly pendingOperations = new Set<Promise<unknown>>();
  private closing: Promise<void> | undefined;
  private lateCleanup: Promise<void> | undefined;
  private readonly uiCommandTimeoutMs: number;

  constructor(private readonly options: MobileBuildMcpDriverOptions) {
    this.runner = options.runner ?? defaultRunner(options);
    const timeout = options.uiCommandTimeoutMs ?? 35_000;
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 300_000) throw new RangeError('uiCommandTimeoutMs must be between 1 and 300000');
    this.uiCommandTimeoutMs = timeout;
  }

  /**
   * Whether the launched app is still running, from the console helper MobileBuildMCP started for it
   * (its PID is in the log file name, and it exits with the app). Undefined when that can't be told.
   */
  appRunning(): boolean | undefined {
    const pid = Number(this.logPaths.runtime?.match(/_helperpid(\d+)_/)?.[1]);
    if (!this.launched || !Number.isSafeInteger(pid) || pid <= 0) return undefined;
    try { process.kill(pid, 0); return true; }
    catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
  }

  logSources(): { runtime?: string; os?: string } {
    return { ...(this.logPaths.runtime ? { runtime: this.logPaths.runtime } : {}),
      ...(this.logPaths.os ? { os: this.logPaths.os } : {}) };
  }

  metrics(): DeviceMetrics {
    return {
      referenceRefreshes: this.referenceRefreshes,
      referenceExpiries: this.referenceExpiries,
      nearTtlRefreshes: this.nearTtlRefreshes,
    };
  }

  private async call(args: string[], signal: AbortSignal, expectedSchema?: string): Promise<JsonObject> {
    if (signal.aborted) throw signal.reason ?? new Error('Aborted');
    return parseEnvelope(await this.runner([...args, '--output', 'json'], signal), expectedSchema);
  }

  private trackOperation<T>(operation: () => Promise<T>): Promise<T> {
    const pending = Promise.resolve().then(operation);
    this.pendingOperations.add(pending);
    void pending.then(
      () => { this.pendingOperations.delete(pending); },
      () => { this.pendingOperations.delete(pending); },
    );
    return pending;
  }

  private async issueCommand(args: string[], runSignal: AbortSignal, expectedSchema: string): Promise<JsonObject> {
    if (runSignal.aborted) throw runSignal.reason;
    const command = new AbortController();
    const deadline = setTimeout(() => command.abort(new Error('UI command deadline reached')), this.uiCommandTimeoutMs);
    const token = Symbol(expectedSchema);
    this.unconfirmedCommands.add(token);
    try {
      const result = await awaitResultOrAbort(this.call(args, command.signal, expectedSchema), command.signal);
      this.unconfirmedCommands.delete(token);
      return result;
    } catch (error) {
      if (error instanceof DeviceCliError && error.terminalAcknowledged) this.unconfirmedCommands.delete(token);
      throw error;
    } finally {
      clearTimeout(deadline);
    }
  }

  prepare(scenario: PrepareScenarioContext, signal: AbortSignal): Promise<void> {
    return this.trackOperation(() => this.prepareIssued(scenario, signal));
  }

  private async prepareIssued(scenario: PrepareScenarioContext, signal: AbortSignal): Promise<void> {
    if (this.releaseLock) throw new Error('Driver is already prepared');
    if (signal.aborted) throw signal.reason;
    const deviceId = await selectDeviceId(this.options.cwd, scenario.device?.udid, this.options.defaultUdid);
    this.releaseLock = await acquireLock(this.options.lockRoot ?? DEFAULT_LOCK_ROOT, deviceId);
    this.referenceRefreshes = 0;
    this.referenceExpiries = 0;
    this.nearTtlRefreshes = 0;
    this.unconfirmedCommands.clear();
    this.deviceId = deviceId;
    this.bundleId = scenario.app.bundleId;
    try {
      const launchArgs = scenario.app.launchArgs ?? [];
      // Array parameters go through --json, so arguments that start with "-" aren't read as CLI flags.
      const launched = await this.issueCommand(['simulator', 'launch-app', '--simulator-id', deviceId, '--bundle-id', scenario.app.bundleId,
        ...(launchArgs.length ? ['--json', JSON.stringify({ launchArgs })] : [])], signal,
        'mobilebuildmcp.output.launch-result');
      const artifacts = record(launched.artifacts);
      this.logPaths = {};
      this.logNotes = {};
      for (const [name, field] of [['runtime', 'runtimeLogPath'], ['os', 'osLogPath']] as const) {
        const path = string(artifacts[field]);
        if (path && isAbsolute(path)) this.logPaths[name] = path;
        else if (path) this.logNotes[name] = '[unavailable: invalid vendor log path]';
        else this.logNotes[name] = '[unavailable: vendor supplied no log path]';
      }
      this.launched = true;
    } catch (error) {
      if (this.unconfirmedCommands.size === 0) {
        await this.releaseLock();
        this.releaseLock = undefined;
      }
      throw error;
    }
  }

  observe(signal: AbortSignal): Promise<Snapshot> {
    return this.trackOperation(() => this.observeIssued(signal));
  }

  private captureArgs(deviceId: string): string[] {
    return ['ui-automation', 'snapshot-ui', '--simulator-id', deviceId, ...(this.options.capture === 'full' ? ['--verbose'] : [])];
  }

  private async screenshot(deviceId: string, signal: AbortSignal): Promise<string | undefined> {
    const shot = await this.issueCommand(['ui-automation', 'screenshot', '--simulator-id', deviceId, '--return-format', 'path'], signal,
      'mobilebuildmcp.output.capture-result');
    return string(record(shot.artifacts).screenshotPath) ?? string(record(shot.capture).path) ?? string(shot.path);
  }

  /** Complete a capture with its screenshot, app log tails, and the optional screenshot agreement check. */
  private async evidence(data: JsonObject, deviceId: string, screenshotPath: string | undefined, signal: AbortSignal,
    extra: Partial<Snapshot> = {}): Promise<Snapshot> {
    const snapshot = parseSnapshot(data, deviceId, screenshotPath);
    let verification: Partial<Snapshot> = {};
    if (this.options.verifyScreenshotAgreement && screenshotPath && extra.screenshotAgreement === undefined) {
      const began = performance.now();
      const after = parseSnapshot(await this.issueCommand(this.captureArgs(deviceId), signal, 'mobilebuildmcp.output.capture-result'), deviceId);
      verification = { screenshotAgreement: sameScreen(snapshot, after), verifyMs: performance.now() - began };
    }
    const logTails = { ...this.logNotes };
    for (const [name, path] of Object.entries(this.logPaths)) logTails[name] = await readLogTail(path);
    return { ...snapshot, ...extra, ...verification, ...(Object.keys(logTails).length ? { logTails } : {}) };
  }

  private async observeIssued(signal: AbortSignal): Promise<Snapshot> {
    const deviceId = this.deviceId;
    if (!deviceId || !this.releaseLock) throw new Error('Driver is not prepared');
    // The capture and the screenshot run concurrently. Wait for both to settle, so a failure in one
    // never leaves the other in flight after this operation reports done.
    const captureWithScreenshot = async () => {
      const [capture, shot] = await Promise.allSettled([
        this.issueCommand(this.captureArgs(deviceId), signal, 'mobilebuildmcp.output.capture-result'),
        this.options.screenshots ? this.screenshot(deviceId, signal) : Promise.resolve(undefined),
      ]);
      if (capture.status === 'rejected') throw capture.reason;
      if (shot.status === 'rejected') throw shot.reason;
      return { data: capture.value, screenshotPath: shot.value };
    };
    if (!this.options.verifyScreenshotAgreement || !this.options.screenshots) {
      const { data, screenshotPath } = await captureWithScreenshot();
      return this.evidence(data, deviceId, screenshotPath, signal);
    }
    // Measurement mode. MobileBuildMCP resolves element references against its latest capture, so the
    // extra agreement capture must never leave the run holding references from an older one. When the
    // screen moved, capture again until the screenshot and capture agree (at most 3 tries). If they never
    // agree, the run gets the newest capture. All of this time counts as measurement time, not observation.
    let spentOnRetries = 0;
    for (let attempt = 1; ; attempt++) {
      const attemptBegan = performance.now();
      const { data, screenshotPath } = await captureWithScreenshot();
      const snapshot = parseSnapshot(data, deviceId, screenshotPath);
      const checkBegan = performance.now();
      const after = await this.issueCommand(this.captureArgs(deviceId), signal, 'mobilebuildmcp.output.capture-result');
      const agrees = sameScreen(snapshot, parseSnapshot(after, deviceId));
      if (agrees || attempt === 3) {
        const verifyMs = spentOnRetries + (performance.now() - checkBegan);
        return this.evidence(agrees ? data : after, deviceId, screenshotPath, signal,
          { screenshotAgreement: agrees, verifyMs, ...(attempt > 1 ? { verifyAttempts: attempt } : {}) });
      }
      spentOnRetries += performance.now() - attemptBegan;
    }
  }

  act(action: Action, snapshot: Snapshot, scenario: ActionScenarioContext, signal: AbortSignal): Promise<Snapshot | undefined> {
    return this.trackOperation(() => this.actIssued(action, snapshot, scenario, signal));
  }

  private get reusesActionCapture(): boolean {
    return this.options.reuseActionCapture === true && this.options.capture === 'full';
  }

  /**
   * The settled screen MobileBuildMCP captured after the action, completed with its screenshot, or
   * undefined when it returned none (the screen didn't settle within its 2.5 s window) or it can't be parsed.
   */
  private async settledCapture(result: JsonObject, signal: AbortSignal): Promise<Snapshot | undefined> {
    if (!this.reusesActionCapture || !this.deviceId || Object.keys(record(result.capture)).length === 0) return undefined;
    try { parseSnapshot(result, this.deviceId); } catch { return undefined; }
    const screenshotPath = this.options.screenshots ? await this.screenshot(this.deviceId, signal) : undefined;
    return this.evidence(result, this.deviceId, screenshotPath, signal, { reusedFromAction: true });
  }

  private async actIssued(action: Action, snapshot: Snapshot, scenario: ActionScenarioContext, signal: AbortSignal): Promise<Snapshot | undefined> {
    if (!this.deviceId || snapshot.deviceId !== this.deviceId) throw new Error('Snapshot belongs to a different device');
    const old = snapshot.elements.find((element) => element.ref === action.targetRef);
    if (!old) throw new StaleSnapshotError('Target reference is absent from observation');
    const requiredAction = action.kind === 'type' ? 'typeText' : action.kind === 'swipe' ? 'swipeWithin' : 'tap';
    if (!old.actions.includes(requiredAction)) throw new DeviceCliError('UNSUPPORTED_ACTION', `Target does not support ${action.kind}`);
    if (action.kind === 'type' && !Object.hasOwn(scenario.values, action.valueKey)) throw new DeviceCliError('MISSING_VALUE', `Scenario value ${action.valueKey} is absent`);
    if (action.kind === 'type' && scenario.values[action.valueKey]!.startsWith('-')) {
      throw new DeviceCliError('UNSUPPORTED_LEADING_DASH_TEXT', 'MobileBuildMCP 2.7.1 cannot type a value beginning with a hyphen');
    }

    let selected = old;
    if (Date.now() >= snapshot.expiresAt - 5_000) {
      const fresh = await this.observe(signal);
      this.referenceRefreshes++;
      this.nearTtlRefreshes++;
      if (!sameScreen(snapshot, fresh)) throw new StaleSnapshotError();
      selected = rematch(old, fresh);
    }
    const verbose = this.reusesActionCapture ? ['--verbose'] : [];
    const perform = (ref: string) => {
      const base = ['ui-automation'];
      if (action.kind === 'tap') return [...base, 'tap', '--simulator-id', this.deviceId!, '--element-ref', ref, ...verbose];
      if (action.kind === 'type') return [...base, 'type-text', '--json', JSON.stringify({
        simulatorId: this.deviceId!, elementRef: ref, text: scenario.values[action.valueKey]!, replaceExisting: true,
      }), ...verbose];
      return [...base, 'swipe', '--simulator-id', this.deviceId!, '--within-element-ref', ref, '--direction', action.direction, ...verbose];
    };
    if (signal.aborted) throw signal.reason;
    try {
      return await this.settledCapture(await this.issueCommand(perform(selected.ref), signal, UI_ACTION_RESULT), signal);
    } catch (error) {
      if (signal.aborted || !(error instanceof DeviceCliError) || !['SNAPSHOT_EXPIRED', 'ELEMENT_REF_NOT_FOUND'].includes(error.code)) throw error;
      if (error.code === 'SNAPSHOT_EXPIRED') this.referenceExpiries++;
      const fresh = await this.observe(signal);
      this.referenceRefreshes++;
      if (!sameScreen(snapshot, fresh)) throw new StaleSnapshotError();
      selected = rematch(old, fresh);
      if (signal.aborted) throw signal.reason;
      return this.settledCapture(await this.issueCommand(perform(selected.ref), signal, UI_ACTION_RESULT), signal);
    }
  }

  close(signal: AbortSignal): Promise<void> {
    if (this.closing) return this.closing;
    this.closing = this.finishClose(signal).catch((error: unknown) => {
      if (error instanceof DeviceCliError && error.code === 'UI_ACTION_UNCONFIRMED') this.finishWhenAcknowledged();
      throw error;
    }).finally(() => { this.closing = undefined; });
    return this.closing;
  }

  /**
   * Cleanup gave up while an issued command was still running. When that command does acknowledge,
   * finish cleanup (stop the app, release the lock) so the device doesn't stay locked for the life
   * of this process. A command whose outcome stays unknown keeps the lock, as before.
   */
  private finishWhenAcknowledged(): void {
    if (this.pendingOperations.size === 0 || this.lateCleanup) return;
    this.lateCleanup = Promise.allSettled([...this.pendingOperations])
      .then(() => this.close(AbortSignal.timeout(this.uiCommandTimeoutMs + 5_000)))
      .catch(() => {})
      .finally(() => { this.lateCleanup = undefined; });
  }

  private async finishClose(signal: AbortSignal): Promise<void> {
    while (this.pendingOperations.size > 0) {
      try { await awaitSettlement(Promise.allSettled([...this.pendingOperations]), signal); }
      catch { throw new DeviceCliError('UI_ACTION_UNCONFIRMED', 'Cleanup ended before the issued device operation acknowledged; device lock retained'); }
    }
    const release = this.releaseLock;
    if (!release) return;
    // A lost CLI response has no proven acknowledgement. A new daemon snapshot
    // alone cannot establish that an earlier request will never arrive late.
    if (this.unconfirmedCommands.size > 0) throw new DeviceCliError('UI_ACTION_UNCONFIRMED', 'Device operation outcome is unknown; device lock retained');
    if (this.launched && this.options.stopAppOnClose !== false && this.deviceId && this.bundleId) {
      // Stop is not in MobileBuildMCP's UI queue. Keep our lock if its CLI
      // response is lost, so another run cannot overlap uncertain cleanup.
      try {
        await this.call(['simulator', 'stop', '--simulator-id', this.deviceId, '--bundle-id', this.bundleId], signal,
          'mobilebuildmcp.output.stop-result');
      } catch (error) {
        // An acknowledged stop failure (typically: the app already exited) leaves no command in flight.
        if (!(error instanceof DeviceCliError && error.terminalAcknowledged)) throw error;
      }
    }
    await release();
    this.releaseLock = undefined;
    this.launched = false;
    this.logPaths = {};
    this.logNotes = {};
  }
}

export function createMobileBuildMcpDriver(options: MobileBuildMcpDriverOptions): DeviceDriver {
  return new MobileBuildMcpDriver(options);
}
