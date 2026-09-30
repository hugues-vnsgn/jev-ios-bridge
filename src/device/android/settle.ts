import { createHash } from 'node:crypto';

/** One node of the device agent's `device.dump.ui` tree, as the agent sends it. */
export type AgentNode = Record<string, unknown> & { 'resource-id'?: unknown; children?: AgentNode[] | null };
export type UiTree = { hierarchy: AgentNode[] };
/** One `device.dump.ui` call. */
export type Capture = (signal: AbortSignal) => Promise<UiTree>;
export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}
export type SettledCapture = { tree: UiTree; screenHash: string; settled: boolean };

/** Measured from when the earlier capture returned to when the later one starts (release spec phase 4 item 7). */
export const SETTLE_GAP_MS = 250;
export const SETTLE_CAP_MS = 3_000;

const STATUS_BAR_ID = 'com.android.systemui:';

/**
 * The screen's identity, and the only comparison the settle rule makes: two captures match exactly when
 * their hashes are equal. It covers every field outside the status bar. A status bar node is left out with
 * everything inside it, because its icons (battery, notifications) often carry no systemui id of their own.
 */
export function screenHash(tree: UiTree): string {
  return createHash('sha256').update(JSON.stringify(canonical(tree.hierarchy))).digest('hex');
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.filter(item => !String((item as AgentNode | null)?.['resource-id'] ?? '').startsWith(STATUS_BAR_ID)).map(canonical);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])]));
  }
  return value;
}

/**
 * Capture until two captures at least `SETTLE_GAP_MS` apart match, the newer one becoming the one to match
 * each time they don't. No capture starts at or after `SETTLE_CAP_MS`; the last capture then comes back
 * with `settled: false`, the step's "screen still changing".
 */
export async function settle(capture: Capture, clock: Clock, signal: AbortSignal): Promise<SettledCapture> {
  const startedAt = clock.now();
  const take = async () => {
    if (signal.aborted) throw signal.reason;
    const tree = await capture(signal);
    return { tree, screenHash: screenHash(tree), returnedAt: clock.now() };
  };
  let previous = await take();
  for (;;) {
    const nextStart = previous.returnedAt + SETTLE_GAP_MS;
    if (nextStart - startedAt >= SETTLE_CAP_MS) return { tree: previous.tree, screenHash: previous.screenHash, settled: false };
    const wait = nextStart - clock.now();
    if (wait > 0) await clock.sleep(wait);
    const next = await take();
    if (next.screenHash === previous.screenHash) return { tree: next.tree, screenHash: next.screenHash, settled: true };
    previous = next;
  }
}
