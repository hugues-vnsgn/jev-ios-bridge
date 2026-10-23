import { createHash } from 'node:crypto';
import { STATUS_BAR_ID_PREFIX, type AndroidNode, type AndroidTree } from './android/agent-client.js';

/** One `device.dump.ui` call. */
export type Capture = (signal: AbortSignal) => Promise<AndroidTree>;
export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
  /** A signal that aborts once `ms` have passed on this clock. */
  timeout(ms: number): AbortSignal;
}
/** The capture a step goes on with; `settled: false` marks the step "screen still changing". */
export type SettledCapture = { tree: AndroidTree; screenHash: string; settled: boolean };

/** Measured from when the earlier capture returned to when the later one starts (release spec phase 4 item 7). */
export const SETTLE_GAP_MS = 250;
/** Measured from the rule's start. The last completed capture returns by this deadline. Late replies are discarded. */
export const SETTLE_CAP_MS = 3_000;


/**
 * The screen's identity, and the only comparison the settle rule makes: two captures match exactly when
 * their hashes are equal. It covers every field outside the status bar. A status bar node is left out with
 * everything inside it, because its icons (battery, notifications) often carry no systemui id of their own.
 */
export function screenHash(tree: AndroidTree): string {
  return createHash('sha256').update(JSON.stringify(canonicalNodes(tree.hierarchy))).digest('hex');
}

function canonicalNodes(nodes: AndroidNode[] | null | undefined): unknown[] {
  return (nodes ?? []).filter(node => !(node['resource-id'] ?? '').startsWith(STATUS_BAR_ID_PREFIX))
    .map(({ children, ...fields }) => ({ ...sortedKeys(fields) as object, children: canonicalNodes(children) }));
}

function sortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortedKeys((value as Record<string, unknown>)[key])]));
  }
  return value;
}

export class SettleDeadlineError extends Error {
  constructor() { super('No capture completed before the settle deadline.'); }
}

type Completed<T> = { tree: T; screenHash: string; returnedAt: number };
function beforeDeadline<T>(work: Promise<T>, deadline: AbortSignal, signal: AbortSignal): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { deadline.removeEventListener('abort', expired); signal.removeEventListener('abort', cancelled); };
    const expired = () => { cleanup(); resolve(undefined); };
    const cancelled = () => { cleanup(); reject(signal.reason); };
    deadline.addEventListener('abort', expired, { once: true });
    signal.addEventListener('abort', cancelled, { once: true });
    work.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    if (signal.aborted) cancelled();
    else if (deadline.aborted) expired();
  });
}

export async function settleCaptures<T>(capture: (signal: AbortSignal) => Promise<T>, hash: (tree: T) => string,
  clock: Clock, signal: AbortSignal): Promise<{ tree: T; screenHash: string; settled: boolean }> {
  const end = clock.now() + SETTLE_CAP_MS;
  let previous: Completed<T> | undefined;
  while (clock.now() < end) {
    signal.throwIfAborted();
    const remaining = end - clock.now();
    const work = capture(signal).then(tree => ({ tree, screenHash: hash(tree), returnedAt: clock.now() }));
    const next = await beforeDeadline(work, clock.timeout(remaining), signal);
    if (!next || next.returnedAt >= end) break;
    if (previous && next.screenHash === previous.screenHash) return { tree: next.tree, screenHash: next.screenHash, settled: true };
    previous = next;
    if (next.returnedAt + SETTLE_GAP_MS >= end) break;
    await beforeDeadline(clock.sleep(SETTLE_GAP_MS).then(() => true), clock.timeout(end - clock.now()), signal);
  }
  if (!previous) throw new SettleDeadlineError();
  return { tree: previous.tree, screenHash: previous.screenHash, settled: false };
}

export function settle(capture: Capture, clock: Clock, signal: AbortSignal): Promise<SettledCapture> {
  return settleCaptures(capture, screenHash, clock, signal);
}
