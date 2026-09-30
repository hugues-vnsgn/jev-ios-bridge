import { request } from 'node:http';
import { DeviceReasonError } from '../index.js';
import { OutcomeUnknownError } from './ledger.js';

/**
 * The device agent's client: the anti-corruption layer to mobilecli's agent (see the domain model). Only
 * this module knows JSON-RPC, the agent's method names, their parameter shapes and its errors. The shapes
 * are mobilecli 1.0.14's, as the phase 4 tracer confirmed them on both emulators.
 */

/** A request's time limit; the dump's is its idle wait plus this. */
export const AGENT_REQUEST_TIMEOUT_MS = 10_000;
const MAX_REQUEST_BYTES = 1024 * 1024;
/** Far above a JPEG screenshot at 800 px; a reply this long isn't the agent's. */
const MAX_REPLY_BYTES = 32 * 1024 * 1024;

/** An Android key event, as `device.io.keys` takes it: `KEYCODE_*` names. */
export interface AgentKey { keycode: string; modifiers?: string[] }
export interface AgentSwipe { x1: number; y1: number; x2: number; y2: number; duration: number }

/**
 * One node of the device agent's `device.dump.ui` tree. mobilecli's `dump ui --format raw` has the same
 * shape without `scrollable` and `password`, so one mapping reads both.
 */
export interface AndroidNode {
  class?: string;
  text?: string;
  hint?: string;
  'content-desc'?: string;
  'resource-id'?: string;
  checkable?: boolean;
  checked?: boolean;
  clickable?: boolean;
  enabled?: boolean;
  focused?: boolean;
  selected?: boolean;
  visible?: boolean;
  scrollable?: boolean;
  password?: boolean;
  rect?: { x: number; y: number; width: number; height: number };
  children?: AndroidNode[] | null;
}

/** What one `device.dump.ui` call returns: the settle rule compares it and the mapping reads it. */
export interface AndroidTree { hierarchy: AndroidNode[] }

/** The calls the Android driver makes, and nothing else. Every one takes the run's signal. */
export interface DeviceAgentClient {
  /** `device.version`: the SHA-256 of the running agent's DEX file. */
  version(signal: AbortSignal): Promise<{ dexSha256: string }>;
  /** `device.dump.ui`: the raw tree, read once the app has been idle, or after `waitUntilIdleMs`. */
  dumpUi(waitUntilIdleMs: number, signal: AbortSignal): Promise<AndroidNode[]>;
  tap(point: { x: number; y: number }, signal: AbortSignal): Promise<void>;
  swipe(swipe: AgentSwipe, signal: AbortSignal): Promise<void>;
  keys(keys: AgentKey[], signal: AbortSignal): Promise<void>;
  text(text: string, signal: AbortSignal): Promise<void>;
  /** `device.io.button`, for example `KEYCODE_PASTE`. */
  button(button: string, signal: AbortSignal): Promise<void>;
  clipboardSet(text: string, signal: AbortSignal): Promise<void>;
  clipboardClear(signal: AbortSignal): Promise<void>;
  /** `device.screenshot` as JPEG no larger than `maxSize`, decoded from base64. */
  screenshot(maxSize: number, signal: AbortSignal): Promise<Buffer>;
}

/**
 * The agent answered with an error, or with something that isn't its reply: `DEVICE_ERROR` with
 * `vendorCode` `agent`. Its outcome is known. An agent error's message can carry screen text, so only
 * its numeric JSON-RPC code is kept.
 */
export class DeviceAgentError extends DeviceReasonError {
  declare readonly vendorCode: 'agent';

  constructor(readonly rpcCode?: number) {
    super('DEVICE_ERROR', rpcCode === undefined ? 'The device agent gave no usable reply' : `The device agent returned error ${String(rpcCode)}`,
      { vendorCode: 'agent' });
    this.name = 'DeviceAgentError';
  }
}

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : undefined;
}

function wholeNumbers(values: JsonObject): JsonObject {
  for (const [name, value] of Object.entries(values)) {
    if (!Number.isSafeInteger(value)) throw new TypeError(`The device agent takes whole numbers; ${name} is ${String(value)}`);
  }
  return values;
}

/** The client for an agent reached through `adb forward tcp:<port>`. */
export function deviceAgentClient(options: { port: number; timeoutMs?: number }): DeviceAgentClient {
  const timeoutMs = options.timeoutMs ?? AGENT_REQUEST_TIMEOUT_MS;
  let lastId = 0;
  const call = (method: string, params: JsonObject, signal: AbortSignal, timeLimitMs = timeoutMs) =>
    send(options.port, ++lastId, method, params, signal, timeLimitMs);
  return {
    async version(signal) {
      const dexSha256 = asObject(await call('device.version', {}, signal))?.dexSha256;
      if (typeof dexSha256 !== 'string') throw new DeviceAgentError();
      return { dexSha256 };
    },
    async dumpUi(waitUntilIdleMs, signal) {
      const params = wholeNumbers({ waitUntilIdle: waitUntilIdleMs });
      const hierarchy = asObject(await call('device.dump.ui', params, signal, waitUntilIdleMs + timeoutMs))?.hierarchy;
      if (!Array.isArray(hierarchy)) throw new DeviceAgentError();
      return hierarchy as AndroidNode[];
    },
    async tap(point, signal) { await call('device.io.tap', wholeNumbers({ x: point.x, y: point.y }), signal); },
    async swipe(swipe, signal) {
      await call('device.io.swipe', wholeNumbers({ x1: swipe.x1, y1: swipe.y1, x2: swipe.x2, y2: swipe.y2, duration: swipe.duration }), signal);
    },
    async keys(keys, signal) {
      await call('device.io.keys', { keys: keys.map(key => ({ keycode: key.keycode, ...(key.modifiers ? { modifiers: key.modifiers } : {}) })) }, signal);
    },
    async text(text, signal) { await call('device.io.text', { text }, signal); },
    async button(button, signal) { await call('device.io.button', { button }, signal); },
    async clipboardSet(text, signal) { await call('device.clipboard.set', { text }, signal); },
    async clipboardClear(signal) { await call('device.clipboard.clear', {}, signal); },
    async screenshot(maxSize, signal) {
      const data = asObject(await call('device.screenshot', { format: 'jpeg', ...wholeNumbers({ maxSize }) }, signal))?.data;
      if (typeof data !== 'string') throw new DeviceAgentError();
      return Buffer.from(data, 'base64');
    },
  };
}

/**
 * One JSON-RPC 2.0 request on its own HTTP/1.1 connection, never reused and never re-sent. Once the
 * connection is open the request counts as sent: from then on a timeout, a dropped connection or an
 * abort leaves its outcome unknown (`OutcomeUnknownError`). Before that, nothing reached the agent.
 */
function send(port: number, id: number, method: string, params: JsonObject, signal: AbortSignal, timeLimitMs: number): Promise<unknown> {
  if (signal.aborted) return Promise.reject(signal.reason);
  const body = JSON.stringify({ jsonrpc: '2.0', id, method, params });
  const length = Buffer.byteLength(body);
  if (length >= MAX_REQUEST_BYTES) return Promise.reject(new RangeError(`A device agent request must be under 1 MiB; this one is ${String(length)} bytes`));
  return new Promise((resolveResult, reject) => {
    let sent = false;
    let settled = false;
    const outgoing = request({ host: '127.0.0.1', port, path: '/', method: 'POST', agent: false,
      headers: { 'Content-Type': 'application/json', 'Content-Length': length, Connection: 'close' } });
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      signal.removeEventListener('abort', onAbort);
      outgoing.destroy();
      finish();
    };
    const lost = (message: string, cause?: unknown) => {
      settle(() => { reject(new OutcomeUnknownError('agent', message, cause === undefined ? {} : { cause })); });
    };
    const onAbort = () => {
      if (sent) lost('The device agent request was abandoned after it was sent; its outcome is unknown', signal.reason);
      else settle(() => { reject(signal.reason); });
    };
    const deadline = setTimeout(() => { lost('The device agent request timed out; its outcome is unknown'); }, timeLimitMs);
    signal.addEventListener('abort', onAbort, { once: true });
    outgoing.on('socket', socket => { socket.once('connect', () => { sent = true; }); });
    outgoing.on('error', () => {
      if (sent) lost('The connection to the device agent dropped before its reply; its outcome is unknown');
      else settle(() => { reject(new DeviceAgentError()); });
    });
    outgoing.on('response', response => {
      const chunks: Buffer[] = [];
      let received = 0;
      response.on('data', (chunk: Buffer) => {
        received += chunk.length;
        // The agent answered, so the outcome is known, but the reply isn't one the client can use.
        if (received > MAX_REPLY_BYTES) settle(() => { reject(new DeviceAgentError()); });
        else chunks.push(chunk);
      });
      response.on('error', () => { lost('The connection to the device agent dropped during its reply; its outcome is unknown'); });
      response.on('end', () => {
        settle(() => {
          try { resolveResult(resultOf(Buffer.concat(chunks).toString('utf8'), id)); }
          catch (error) { reject(error as Error); }
        });
      });
      // A reply cut short may close without an error event; settle() ignores this once the reply ended.
      response.on('close', () => { if (!response.complete) lost('The connection to the device agent dropped during its reply; its outcome is unknown'); });
    });
    outgoing.end(body);
  });
}

/** The result of the agent's reply to request `id`, or the `DeviceAgentError` it stands for. */
function resultOf(text: string, id: number): unknown {
  let reply: JsonObject | undefined;
  try { reply = asObject(JSON.parse(text)); } catch { reply = undefined; }
  if (!reply || reply.jsonrpc !== '2.0' || reply.id !== id) throw new DeviceAgentError();
  const error = asObject(reply.error);
  // Only the numeric code survives: the agent's message can carry screen text.
  if (error) throw new DeviceAgentError(Number.isSafeInteger(error.code) ? error.code as number : undefined);
  if (!('result' in reply)) throw new DeviceAgentError();
  return reply.result;
}
