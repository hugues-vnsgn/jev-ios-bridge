import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Action, ActionScenarioContext, Element } from '../src/contracts/index.js';
import { DeviceCliError, MobileBuildMcpDriver, type CliResult, type CliRunner } from '../src/device/index.js';

/**
 * The driven-mode actions on the iOS driver (jev-drives build Issue 01): back, scroll and tapAt, against a fake
 * MobileBuildMCP CLI. MobileBuildMCP 2.7.1 has no tap at a point, so tapAt is refused on iOS.
 */

const udid = '0E42FDE2-5E09-42D3-9876-9EF0037FCBE7';
const scenario: ActionScenarioContext = { app: { bundleId: 'com.example.app' }, values: {}, device: { udid } };
const signal = () => new AbortController().signal;
const ok = (stdout: string): CliResult => ({ stdout, stderr: '', exitCode: 0 });

function envelope(schema: string, data: Record<string, unknown>): string {
  return JSON.stringify({ schema, schemaVersion: '2', didError: false, error: null,
    data: { summary: { status: 'SUCCEEDED' }, ...data, artifacts: { simulatorId: udid, ...(data.artifacts as object | undefined) },
      ...(schema.endsWith('launch-result') || schema.endsWith('stop-result') ? { diagnostics: {} } : {}) } });
}

const frame = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const visible = { enabled: true, visible: true };
/** A 440 × 956 point screen: the application element, then `elements`. */
const screenOf = (...elements: Omit<Element, 'actions'>[]): Element[] => [
  { ref: 'e1', role: 'application', label: 'Example', frame: frame(0, 0, 440, 956), state: visible, actions: [] },
  ...elements.map(element => ({ state: visible, ...element,
    actions: element.role === 'scroll-view' ? ['swipeWithin'] : element.role === 'button' ? ['tap', 'longPress', 'touch'] : [] })),
];

interface Fake {
  calls: string[][];
  driver: MobileBuildMcpDriver;
}

/**
 * A prepared driver on full captures with screenshots. Each capture shows the next of `screens` (the last
 * repeats), and each screenshot is 368 × 800, as MobileBuildMCP shrinks one.
 */
async function withDriver(screens: Element[][], fn: (fake: Fake) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-driven-'));
  const calls: string[][] = [];
  const queue = [...screens];
  let shots = 0;
  const runner: CliRunner = async args => {
    calls.push(args);
    if (args.includes('launch-app')) return ok(envelope('mobilebuildmcp.output.launch-result', {}));
    if (args.includes('stop')) return ok(envelope('mobilebuildmcp.output.stop-result', {}));
    if (args.includes('screenshot')) {
      return ok(envelope('mobilebuildmcp.output.capture-result', { artifacts: { screenshotPath: `/tmp/shot-${String(++shots)}.jpg` },
        capture: { format: 'image/jpeg', width: 368, height: 800 } }));
    }
    if (args.includes('snapshot-ui')) {
      const elements = queue.length > 1 ? queue.shift()! : queue[0]!;
      const expiresAtMs = Date.now() + 60_000;
      return ok(envelope('mobilebuildmcp.output.capture-result', { capture: { type: 'runtime-snapshot', rs: '1',
        screenHash: 'same', seq: 1, count: elements.length,
        capturedAtMs: expiresAtMs - 60_000, expiresAtMs, elements } }));
    }
    return ok(envelope('mobilebuildmcp.output.ui-action-result', { action: { type: args[1] } }));
  };
  const driver = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner, capture: 'full', screenshots: true });
  try {
    await driver.prepare(scenario, signal());
    await fn({ calls, driver });
  } finally {
    await driver.close(signal()).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
}

/** Observe, then act on that observation, returning the MobileBuildMCP calls the action made. */
async function act(fake: Fake, action: Action): Promise<{ calls: string[][] }> {
  const before = await fake.driver.observe(signal());
  fake.calls.length = 0;
  await fake.driver.act(action, before, scenario, signal());
  return { calls: [...fake.calls] };
}

const unsupported = (error: unknown) => error instanceof DeviceCliError && error.code === 'UNSUPPORTED_ACTION';

test('back taps the navigation bar\'s BackButton by its reference, and records the path', async () => {
  const screen = screenOf(
    { ref: 'e2', role: 'button', label: 'Settings', identifier: 'BackButton', frame: frame(16, 62, 100, 44) },
    { ref: 'e3', role: 'button', label: 'Edit', frame: frame(380, 62, 44, 44) },
  );
  await withDriver([screen], async fake => {
    const { calls } = await act(fake, { kind: 'back' });
    assert.deepEqual(calls, [['ui-automation', 'tap', '--simulator-id', udid, '--element-ref', 'e2', '--output', 'json']]);
    assert.deepEqual(fake.driver.actPath(), { path: 'back-button', targetRef: 'e2' });
  });
});

test('without a BackButton, back taps the leftmost back-labelled button in the top bar, never one lower on the screen', async () => {
  const screen = screenOf(
    { ref: 'e2', role: 'button', label: 'Back', frame: frame(150, 500, 36, 36) },
    { ref: 'e3', role: 'button', label: 'Back to list', frame: frame(120, 60, 120, 44) },
    { ref: 'e4', role: 'button', label: 'back', frame: frame(8, 60, 60, 44) },
  );
  await withDriver([screen], async fake => {
    const { calls } = await act(fake, { kind: 'back' });
    assert.deepEqual(calls, [['ui-automation', 'tap', '--simulator-id', udid, '--element-ref', 'e4', '--output', 'json']]);
    assert.deepEqual(fake.driver.actPath(), { path: 'back-button', targetRef: 'e4' });
  });
});

test('with no back button in the top bar, back swipes in from the left edge with the screen\'s size in points', async () => {
  const screen = screenOf(
    { ref: 'e2', role: 'button', label: 'Back', frame: frame(150, 500, 36, 36) },
    { ref: 'e3', role: 'button', label: 'Done', frame: frame(16, 62, 60, 44) },
  );
  await withDriver([screen], async fake => {
    const { calls } = await act(fake, { kind: 'back' });
    assert.deepEqual(calls, [['ui-automation', 'gesture', '--simulator-id', udid, '--preset', 'swipe-from-left-edge',
      '--screen-width', '440', '--screen-height', '956', '--output', 'json']]);
    assert.deepEqual(fake.driver.actPath(), { path: 'edge-swipe' });
  });
});

test('scroll swipes inside the largest scroll view with a centred stroke, the finger moving against the scroll\'s direction', async () => {
  const screen = screenOf(
    { ref: 'e2', role: 'scroll-view', frame: frame(0, 100, 440, 200) },
    { ref: 'e3', role: 'scroll-view', frame: frame(0, 320, 440, 600) },
  );
  await withDriver([screen], async fake => {
    // --distance 0.4 keeps the stroke between 30% and 70% of the view, clear of a fixed header at its top: the
    // default stroke starts at 15%, so a finger-down stroke began on the header and the list never moved.
    const down = await act(fake, { kind: 'scroll', direction: 'down' });
    assert.deepEqual(down.calls, [['ui-automation', 'swipe', '--simulator-id', udid, '--within-element-ref', 'e3', '--direction', 'up',
      '--distance', '0.4', '--output', 'json']]);
    assert.deepEqual(fake.driver.actPath(), { path: 'scroll-within', targetRef: 'e3' });
    const up = await act(fake, { kind: 'scroll', direction: 'up' });
    assert.deepEqual(up.calls, [['ui-automation', 'swipe', '--simulator-id', udid, '--within-element-ref', 'e3', '--direction', 'down',
      '--distance', '0.4', '--output', 'json']]);
  });
});

test('a version 1 swipe keeps MobileBuildMCP\'s default stroke: no --distance', async () => {
  const screen = screenOf({ ref: 'e3', role: 'scroll-view', frame: frame(0, 320, 440, 600) });
  await withDriver([screen], async fake => {
    const { calls } = await act(fake, { kind: 'swipe', targetRef: 'e3', direction: 'up' });
    assert.deepEqual(calls, [['ui-automation', 'swipe', '--simulator-id', udid, '--within-element-ref', 'e3', '--direction', 'up', '--output', 'json']]);
  });
});

test('scroll with no scroll view uses the AXe preset named for the finger\'s direction, in the screen\'s centre, with the screen\'s size in points', async () => {
  const screen = screenOf({ ref: 'e2', role: 'button', label: 'Done', frame: frame(16, 62, 60, 44) });
  await withDriver([screen], async fake => {
    // AXe's presets name the finger's direction: `scroll-up` reveals content further down (measured on iOS 18.6).
    const down = await act(fake, { kind: 'scroll', direction: 'down' });
    assert.deepEqual(down.calls, [['ui-automation', 'gesture', '--simulator-id', udid, '--preset', 'scroll-up',
      '--screen-width', '440', '--screen-height', '956', '--output', 'json']]);
    assert.deepEqual(fake.driver.actPath(), { path: 'screen-middle' });
    const up = await act(fake, { kind: 'scroll', direction: 'up' });
    assert.deepEqual(up.calls, [['ui-automation', 'gesture', '--simulator-id', udid, '--preset', 'scroll-down',
      '--screen-width', '440', '--screen-height', '956', '--output', 'json']]);
  });
});

test('tapAt is UNSUPPORTED_ACTION on iOS before any device command: MobileBuildMCP 2.7.1 has no tap at a point', async () => {
  const screen = screenOf({ ref: 'e2', role: 'button', label: 'Done', frame: frame(16, 62, 60, 44) });
  await withDriver([screen], async fake => {
    const before = await fake.driver.observe(signal());
    fake.calls.length = 0;
    await assert.rejects(fake.driver.act({ kind: 'tapAt', x: 184, y: 400 }, before, scenario, signal()), unsupported);
    assert.deepEqual(fake.calls, []);
    assert.equal(fake.driver.actPath(), undefined);
  });
});
