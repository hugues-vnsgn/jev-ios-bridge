import { createHash } from 'node:crypto';

/** One node of the device agent's `device.dump.ui` tree, as the agent sends it. */
export type AgentNode = Record<string, unknown> & { 'resource-id'?: unknown; children?: AgentNode[] | null };
/** What one `device.dump.ui` call returns. */
export type UiTree = { hierarchy: AgentNode[] };
/** One `device.dump.ui` call. */
export type Capture = (signal: AbortSignal) => Promise<UiTree>;
/** Injected so tests run the rule on fake time. */
export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}
/** The capture a step goes on with; `settled: false` marks the step "screen still changing". */
export type SettledCapture = { tree: UiTree; screenHash: string; settled: boolean };

/** Measured from when the earlier capture returned to when the later one starts (release spec phase 4 item 7). */
export const SETTLE_GAP_MS = 250;
/** Measured from the rule's start. No capture starts at or after it; one already running may return after it. */
export const SETTLE_CAP_MS = 3_000;

/** A system bar node's resource-id prefix: the settle rule leaves it out, and the mapping drops it. */
export const STATUS_BAR_ID_PREFIX = 'com.android.systemui:';

/**
 * The screen's identity, and the only comparison the settle rule makes: two captures match exactly when
 * their hashes are equal. It covers every field outside the status bar. A status bar node is left out with
 * everything inside it, because its icons (battery, notifications) often carry no systemui id of their own.
 */
export function screenHash(tree: UiTree): string {
  return createHash('sha256').update(JSON.stringify(canonicalNodes(tree.hierarchy))).digest('hex');
}

function canonicalNodes(nodes: AgentNode[] | null | undefined): unknown[] {
  return (nodes ?? []).filter(node => !String(node['resource-id'] ?? '').startsWith(STATUS_BAR_ID_PREFIX))
    .map(({ children, ...fields }) => ({ ...sortedKeys(fields) as object, children: canonicalNodes(children) }));
}

function sortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortedKeys((value as Record<string, unknown>)[key])]));
  }
  return value;
}

/**
 * Capture until two captures at least `SETTLE_GAP_MS` apart match, the newer one becoming the one to match
 * each time they don't. At `SETTLE_CAP_MS` the last capture comes back with `settled: false`.
 */
export async function settle(capture: Capture, clock: Clock, signal: AbortSignal): Promise<SettledCapture> {
  const startedAt = clock.now();
  const take = async () => {
    if (signal.aborted) throw signal.reason;
    const tree = await capture(signal);
    return { tree, screenHash: screenHash(tree), returnedAt: clock.now() };
  };
  const result = ({ tree, screenHash }: { tree: UiTree; screenHash: string }, settled: boolean) => ({ tree, screenHash, settled });
  let previous = await take();
  while (true) {
    const nextStart = previous.returnedAt + SETTLE_GAP_MS;
    if (nextStart - startedAt >= SETTLE_CAP_MS) return result(previous, false);
    const wait = nextStart - clock.now();
    if (wait > 0) await clock.sleep(wait);
    const next = await take();
    if (next.screenHash === previous.screenHash) return result(next, true);
    previous = next;
  }
}
