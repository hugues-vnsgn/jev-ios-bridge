import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import type { Action, DeviceDriver, Element, Scenario, Snapshot } from '../contracts/index.js';

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
}

export class DeviceCliError extends Error {
  constructor(readonly code: string, message: string) {
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

function parseEnvelope(result: CliResult): JsonObject {
  let envelope: JsonObject;
  try {
    envelope = record(JSON.parse(result.stdout));
  } catch {
    throw new DeviceCliError('INVALID_JSON', `MobileBuildMCP returned invalid JSON (exit ${result.exitCode})`);
  }
  if (envelope.didError === true || result.exitCode !== 0) {
    const uiError = record(record(envelope.data).uiError);
    const legacyError = record(envelope.error);
    throw new DeviceCliError(
      string(uiError.code) ?? string(legacyError.code) ?? 'CLI_ERROR',
      string(uiError.message) ?? string(envelope.error) ?? string(legacyError.message) ?? `MobileBuildMCP failed (exit ${result.exitCode})`,
    );
  }
  if (envelope.schemaVersion !== '2' || !envelope.data || typeof envelope.data !== 'object' || Array.isArray(envelope.data)) {
    throw new DeviceCliError('INVALID_ENVELOPE', 'MobileBuildMCP returned an unsupported envelope');
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
    role,
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
    role,
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

function defaultRunner(options: MobileBuildMcpDriverOptions): CliRunner {
  const executable = options.executable ?? 'npx';
  const prefix = options.prefixArgs ?? (options.executable ? [] : ['--yes', 'mobilebuildmcp@2.7.1']);
  return (args, signal) => new Promise((resolveResult, reject) => {
    execFile(executable, [...prefix, ...args], {
      cwd: resolve(options.cwd),
      env: { ...process.env, MOBILEBUILDMCP_SENTRY_DISABLED: 'true' },
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

async function acquireLock(root: string, deviceId: string): Promise<() => Promise<void>> {
  await mkdir(root, { recursive: true });
  const path = join(root, `${deviceId.toUpperCase()}.lock`);
  const token = randomUUID();
  let file;
  try { file = await open(path, 'wx', 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new DeviceCliError('DEVICE_BUSY', `Device ${deviceId} is already locked`);
    throw error;
  }
  try { await file.writeFile(JSON.stringify({ pid: process.pid, token })); }
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

  constructor(private readonly options: MobileBuildMcpDriverOptions) {
    this.runner = options.runner ?? defaultRunner(options);
  }

  private async call(args: string[], signal: AbortSignal): Promise<JsonObject> {
    if (signal.aborted) throw signal.reason ?? new Error('Aborted');
    return parseEnvelope(await this.runner([...args, '--output', 'json'], signal));
  }

  async prepare(scenario: Scenario, signal: AbortSignal): Promise<void> {
    if (this.releaseLock) throw new Error('Driver is already prepared');
    const deviceId = scenario.device?.udid ?? this.options.defaultUdid ?? await configuredUdid(this.options.cwd);
    if (!deviceId) throw new DeviceCliError('NO_DEVICE', 'Set a dedicated simulator UDID in the scenario or MobileBuildMCP config');
    this.releaseLock = await acquireLock(this.options.lockRoot ?? join(tmpdir(), 'jev-ios-bridge-device-locks'), deviceId);
    this.deviceId = deviceId;
    this.bundleId = scenario.app.bundleId;
    try {
      const launched = await this.call(['simulator', 'launch-app', '--simulator-id', deviceId, '--bundle-id', scenario.app.bundleId], signal);
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
      await this.releaseLock();
      this.releaseLock = undefined;
      throw error;
    }
  }

  async observe(signal: AbortSignal): Promise<Snapshot> {
    const deviceId = this.deviceId;
    if (!deviceId || !this.releaseLock) throw new Error('Driver is not prepared');
    const args = ['ui-automation', 'snapshot-ui', '--simulator-id', deviceId];
    if (this.options.capture === 'full') args.push('--verbose');
    const data = await this.call(args, signal);
    let screenshotPath: string | undefined;
    if (this.options.screenshots) {
      const shot = await this.call(['ui-automation', 'screenshot', '--simulator-id', deviceId, '--return-format', 'path'], signal);
      screenshotPath = string(record(shot.artifacts).screenshotPath) ?? string(record(shot.capture).path) ?? string(shot.path);
    }
    const logTails = { ...this.logNotes };
    for (const [name, path] of Object.entries(this.logPaths)) logTails[name] = await readLogTail(path);
    return { ...parseSnapshot(data, deviceId, screenshotPath),
      ...(Object.keys(logTails).length ? { logTails } : {}) };
  }

  async act(action: Action, snapshot: Snapshot, scenario: Scenario, signal: AbortSignal): Promise<void> {
    if (action.kind === 'wait') return;
    if (!('targetRef' in action)) throw new Error(`Cannot send ${action.kind} to device`);
    if (!this.deviceId || snapshot.deviceId !== this.deviceId) throw new Error('Snapshot belongs to a different device');
    const old = snapshot.elements.find((element) => element.ref === action.targetRef);
    if (!old) throw new StaleSnapshotError('Target reference is absent from observation');
    const requiredAction = action.kind === 'type' ? 'typeText' : action.kind === 'swipe' ? 'swipeWithin' : 'tap';
    if (!old.actions.includes(requiredAction)) throw new DeviceCliError('UNSUPPORTED_ACTION', `Target does not support ${action.kind}`);
    if (action.kind === 'type' && !Object.hasOwn(scenario.values, action.valueKey)) throw new DeviceCliError('MISSING_VALUE', `Scenario value ${action.valueKey} is absent`);

    let selected = old;
    if (Date.now() >= snapshot.expiresAt - 5_000) {
      const fresh = await this.observe(signal);
      if (!sameScreen(snapshot, fresh)) throw new StaleSnapshotError();
      selected = rematch(old, fresh);
    }
    const perform = (ref: string) => {
      const base = ['ui-automation'];
      if (action.kind === 'tap') return [...base, 'tap', '--simulator-id', this.deviceId!, '--element-ref', ref];
      if (action.kind === 'type') return [...base, 'type-text', '--simulator-id', this.deviceId!, '--element-ref', ref, '--text', scenario.values[action.valueKey]!, '--replace-existing'];
      return [...base, 'swipe', '--simulator-id', this.deviceId!, '--within-element-ref', ref, '--direction', action.direction];
    };
    try {
      await this.call(perform(selected.ref), signal);
    } catch (error) {
      if (!(error instanceof DeviceCliError) || !['SNAPSHOT_EXPIRED', 'ELEMENT_REF_NOT_FOUND'].includes(error.code)) throw error;
      const fresh = await this.observe(signal);
      if (!sameScreen(snapshot, fresh)) throw new StaleSnapshotError();
      selected = rematch(old, fresh);
      await this.call(perform(selected.ref), signal);
    }
  }

  async close(signal: AbortSignal): Promise<void> {
    const release = this.releaseLock;
    this.releaseLock = undefined;
    if (!release) return;
    let stopError: unknown;
    try {
      if (this.launched && this.options.stopAppOnClose !== false && this.deviceId && this.bundleId) {
        await this.call(['simulator', 'stop', '--simulator-id', this.deviceId, '--bundle-id', this.bundleId], signal);
      }
    } catch (error) {
      stopError = error;
    } finally {
      this.launched = false;
      this.logPaths = {};
      this.logNotes = {};
      await release();
    }
    if (stopError) throw stopError;
  }
}

export function createMobileBuildMcpDriver(options: MobileBuildMcpDriverOptions): DeviceDriver {
  return new MobileBuildMcpDriver(options);
}
