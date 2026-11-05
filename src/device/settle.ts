import { createHash } from 'node:crypto';
import { STATUS_BAR_ID_PREFIX, type AndroidNode, type AndroidTree } from './android/tree.js';

/** One screen capture. */
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
/** Measured from the rule's start. No capture starts at or after it; see `settleCaptures` for one still running. */
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

type Completed<T> = { tree: T; screenHash: string; returnedAt: number };
/** `work`'s value, or undefined once `deadline` aborts. Cancelling rejects with its reason. Neither cancels `work`. */
function awaitCapture<T>(work: Promise<T>, signal: AbortSignal): Promise<T>;
function awaitCapture<T>(work: Promise<T>, signal: AbortSignal, deadline: AbortSignal): Promise<T | undefined>;
function awaitCapture<T>(work: Promise<T>, signal: AbortSignal, deadline?: AbortSignal): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { deadline?.removeEventListener('abort', expired); signal.removeEventListener('abort', cancelled); };
    const expired = () => { cleanup(); resolve(undefined); };
    const cancelled = () => { cleanup(); reject(signal.reason); };
    deadline?.addEventListener('abort', expired, { once: true });
    signal.addEventListener('abort', cancelled, { once: true });
    work.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    if (signal.aborted) cancelled();
    else if (deadline?.aborted) expired();
  });
}

/**
 * Capture until two captures at least `SETTLE_GAP_MS` apart match, the newer one becoming the one to match each
 * time they don't. No capture starts at or after `SETTLE_CAP_MS`. The legacy Android driver keeps a capture that
 * started before the cap, however late it returns. With `returnDeadline`, the Appium path waits for the first
 * capture however late it returns, since nothing else can be returned. After that it returns the last capture
 * completed by the cap, and discards a later one without cancelling it.
 */
export async function settleCaptures<T>(capture: (signal: AbortSignal) => Promise<T>, hash: (tree: T) => string,
  clock: Clock, signal: AbortSignal, options: { returnDeadline?: boolean } = {}): Promise<{ tree: T; screenHash: string; settled: boolean }> {
  const end = clock.now() + SETTLE_CAP_MS;
  const take = (): Promise<Completed<T>> => {
    signal.throwIfAborted();
    return capture(signal).then(tree => ({ tree, screenHash: hash(tree), returnedAt: clock.now() }));
  };
  let previous = await (options.returnDeadline ? awaitCapture(take(), signal) : take());
  while (previous.returnedAt + SETTLE_GAP_MS < end) {
    const wait = previous.returnedAt + SETTLE_GAP_MS - clock.now();
    if (wait > 0) await clock.sleep(wait);
    if (options.returnDeadline && clock.now() >= end) break;
    const next = await (options.returnDeadline ? awaitCapture(take(), signal, clock.timeout(end - clock.now())) : take());
    if (!next || (options.returnDeadline && next.returnedAt >= end)) break;
    if (next.screenHash === previous.screenHash) return { tree: next.tree, screenHash: next.screenHash, settled: true };
    previous = next;
  }
  return { tree: previous.tree, screenHash: previous.screenHash, settled: false };
}

export function settle(capture: Capture, clock: Clock, signal: AbortSignal): Promise<SettledCapture> {
  return settleCaptures(capture, screenHash, clock, signal);
}
