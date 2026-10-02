import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { isActOutcome, type Action, type Snapshot } from '../src/contracts/index.js';
import { DeviceReasonError, StaleSnapshotError } from '../src/device/index.js';
import type { AndroidNode, DeviceAgentClient } from '../src/device/android/agent-client.js';
import { PINNED_AGENT_SHA256 } from '../src/device/android/agent-supply.js';
import { AndroidDriver, jpegSize } from '../src/device/android/driver.js';
import { AGENT_CACHE, FakeAdb, fakeAgents, fakeClock, FakeStreams } from './fixtures/android-device.js';

/**
 * The driven-mode actions on the Android driver (jev-drives build Issue 01): back, scroll and tapAt, against
 * the same fakes as `android-driver.test.ts`.
 */

type Hierarchy = AndroidNode[];
const FIXTURES = join(import.meta.dirname, 'fixtures', 'android');
const hierarchyOf = async (name: string): Promise<Hierarchy> =>
  (JSON.parse(await readFile(join(FIXTURES, name), 'utf8')) as { hierarchy: Hierarchy }).hierarchy;
const signal = () => new AbortController().signal;
const scenario = { app: { package: 'com.example.android' }, values: {} };
const DUMP = { method: 'device.dump.ui', params: { waitUntilIdle: 2000 } };
const SHOT = { method: 'device.screenshot', params: { format: 'jpeg', maxSize: 800 } };
const SETTLED = [DUMP, DUMP, SHOT];

/** A 1080 × 2400 window holding `children`, as the agent's dump starts with each window's root. */
const window = (children: AndroidNode[]): AndroidNode =>
  ({ class: 'android.widget.FrameLayout', visible: true, rect: { x: 0, y: 0, width: 1080, height: 2400 }, children });
const button = (id: string, rect: NonNullable<AndroidNode['rect']>): AndroidNode =>
  ({ class: 'android.widget.Button', 'resource-id': id, text: id, clickable: true, enabled: true, visible: true, rect });
const list = (id: string, rect: NonNullable<AndroidNode['rect']>): AndroidNode =>
  ({ class: 'androidx.recyclerview.widget.RecyclerView', 'resource-id': id, scrollable: true, enabled: true, visible: true, rect });

/** The smallest JPEG header the size reader needs: SOI, then a baseline SOF0 frame of `width` × `height`. */
function jpegOf(width: number, height: number): Buffer {
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03,
    0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]);
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])]);
}

interface Prepared {
  driver: AndroidDriver;
  agents: ReturnType<typeof fakeAgents>;
}

/**
 * A prepared driver whose agent shows `screens`. With `shot`, each screenshot is a JPEG of that size, as the
 * agent sends one; without it, the fake's `jpeg-<n>` bytes, whose size can't be read.
 */
async function withPrepared(screens: Hierarchy[], fn: (setup: Prepared) => Promise<void>, shot?: { width: number; height: number }): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'jev-android-driven-'));
  const adb = new FakeAdb({ serial: 'emulator-5554', avd: 'jev-actions-api31' });
  const agents = fakeAgents(adb, { screens });
  const agentClient = (port: number): DeviceAgentClient => {
    const client = agents.agentClient(port);
    if (!shot) return client;
    return { ...client, async screenshot(maxSize, abort) { await client.screenshot(maxSize, abort); return jpegOf(shot.width, shot.height); } };
  };
  const driver = new AndroidDriver({ device: { avd: 'jev-actions-api31' }, runner: adb.run, agentClient, clock: fakeClock(),
    leaseRoot: root, screenshotFolder: root, freePort: async () => 49526, logcat: new FakeStreams(adb), logFolder: false,
    tools: async () => ({ adb: '/sdk/platform-tools/adb', agent: { path: AGENT_CACHE, sha256: PINNED_AGENT_SHA256 } }) });
  try {
    await driver.prepare(scenario, signal());
    await fn({ driver, agents });
  } finally {
    await driver.close(signal()).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
}

/** Observe, then act on that observation, returning only the agent calls the action made. */
async function act(setup: Prepared, action: Action): Promise<{ calls: unknown[]; after: Snapshot }> {
  const before = await setup.driver.observe(signal());
  setup.agents.calls.length = 0;
  const result = await setup.driver.act(action, before, scenario, signal());
  assert.ok(!isActOutcome(result));
  return { calls: [...setup.agents.calls], after: result };
}

const unsupported = (error: unknown) => error instanceof DeviceReasonError && error.code === 'UNSUPPORTED_ACTION';

test('back sends the system Back key through the agent, then the settle rule, and records the path', async () => {
  const screen = [window([button('home.next', { x: 40, y: 400, width: 1000, height: 150 })])];
  await withPrepared([screen], async setup => {
    const { calls, after } = await act(setup, { kind: 'back' });
    assert.deepEqual(calls, [{ method: 'device.io.keys', params: { keys: [{ keycode: 'KEYCODE_BACK' }] } }, ...SETTLED]);
    assert.ok(after.sequence > 0);
    assert.deepEqual(setup.driver.actPath(), { path: 'back-key' });
  });
});

test('scroll down swipes the finger up inside the largest scrollable element, over the swipe\'s 1000 ms', async () => {
  // list.lazy (x 21, y 305, 1038 × 683) is larger than list.column (1038 × 525) and the horizontal list.row.
  const lists = await hierarchyOf('api36-lists-scrollable.json');
  await withPrepared([lists], async setup => {
    const down = await act(setup, { kind: 'scroll', direction: 'down' });
    assert.deepEqual(down.calls, [{ method: 'device.io.swipe', params: { x1: 540, y1: 920, x2: 540, y2: 373, duration: 1000 } }, ...SETTLED]);
    const lazy = down.after.elements.find(element => element.identifier === 'list.lazy');
    assert.deepEqual(setup.driver.actPath(), { path: 'scroll-within', targetRef: lazy?.ref });
    const up = await act(setup, { kind: 'scroll', direction: 'up' });
    assert.deepEqual(up.calls, [{ method: 'device.io.swipe', params: { x1: 540, y1: 373, x2: 540, y2: 920, duration: 1000 } }, ...SETTLED]);
  });
});

test('scroll picks the largest scrollable element by area, not the first one listed', async () => {
  const screen = [window([
    list('list.small', { x: 0, y: 200, width: 1080, height: 300 }),
    list('list.big', { x: 100, y: 600, width: 800, height: 1000 }),
  ])];
  await withPrepared([screen], async setup => {
    const { calls } = await act(setup, { kind: 'scroll', direction: 'down' });
    // list.big: centre x 500; 90% of its height is y 1500, 10% y 700.
    assert.deepEqual(calls[0], { method: 'device.io.swipe', params: { x1: 500, y1: 1500, x2: 500, y2: 700, duration: 1000 } });
  });
});

test('scroll with no scrollable element swipes the screen\'s middle, 70% to 30% of its height for down, the reverse for up', async () => {
  const screen = [window([button('home.next', { x: 40, y: 400, width: 1000, height: 150 })])];
  await withPrepared([screen], async setup => {
    const down = await act(setup, { kind: 'scroll', direction: 'down' });
    assert.deepEqual(down.calls, [{ method: 'device.io.swipe', params: { x1: 540, y1: 1680, x2: 540, y2: 720, duration: 1000 } }, ...SETTLED]);
    assert.deepEqual(setup.driver.actPath(), { path: 'screen-middle' });
    const up = await act(setup, { kind: 'scroll', direction: 'up' });
    assert.deepEqual(up.calls, [{ method: 'device.io.swipe', params: { x1: 540, y1: 720, x2: 540, y2: 1680, duration: 1000 } }, ...SETTLED]);
  });
});

test('tapAt scales a point on the 360 × 800 screenshot to the 1080 × 2400 screen, then settles', async () => {
  const screen = [window([button('home.next', { x: 40, y: 400, width: 1000, height: 150 })])];
  await withPrepared([screen], async setup => {
    const { calls, after } = await act(setup, { kind: 'tapAt', x: 100, y: 200.5 });
    assert.deepEqual(calls, [{ method: 'device.io.tap', params: { x: 300, y: 602 } }, ...SETTLED]);
    assert.ok(after.sequence > 0);
    assert.equal(setup.driver.actPath(), undefined);
  }, { width: 360, height: 800 });
});

test('tapAt outside the screenshot, or not a number, is UNSUPPORTED_ACTION before any device call, and the snapshot stays usable', async () => {
  const screen = [window([button('home.next', { x: 40, y: 400, width: 1000, height: 150 })])];
  await withPrepared([screen], async setup => {
    const before = await setup.driver.observe(signal());
    setup.agents.calls.length = 0;
    for (const [x, y] of [[-1, 10], [10, -0.5], [360, 10], [10, 800], [Number.NaN, 10], [10, Number.POSITIVE_INFINITY]] as const) {
      await assert.rejects(setup.driver.act({ kind: 'tapAt', x, y }, before, scenario, signal()), unsupported, `${String(x)}, ${String(y)}`);
    }
    assert.deepEqual(setup.agents.calls, []);
    // The edges inside the screenshot are on the screen.
    await setup.driver.act({ kind: 'tapAt', x: 359, y: 799 }, before, scenario, signal());
    assert.deepEqual(setup.agents.calls[0], { method: 'device.io.tap', params: { x: 1077, y: 2397 } });
  }, { width: 360, height: 800 });
});

test('tapAt is UNSUPPORTED_ACTION when the screenshot\'s size can\'t be read', async () => {
  const screen = [window([button('home.next', { x: 40, y: 400, width: 1000, height: 150 })])];
  await withPrepared([screen], async setup => {
    const before = await setup.driver.observe(signal());
    setup.agents.calls.length = 0;
    await assert.rejects(setup.driver.act({ kind: 'tapAt', x: 10, y: 10 }, before, scenario, signal()), unsupported);
    assert.deepEqual(setup.agents.calls, []);
  });
});

test('back, scroll and tapAt on an older snapshot are StaleSnapshotError, and nothing reaches the device', async () => {
  const screen = [window([button('home.next', { x: 40, y: 400, width: 1000, height: 150 })])];
  await withPrepared([screen], async setup => {
    const older = await setup.driver.observe(signal());
    await setup.driver.observe(signal());
    setup.agents.calls.length = 0;
    for (const action of [{ kind: 'back' }, { kind: 'scroll', direction: 'down' }, { kind: 'tapAt', x: 1, y: 1 }] as const) {
      await assert.rejects(setup.driver.act(action, older, scenario, signal()), StaleSnapshotError, action.kind);
    }
    assert.deepEqual(setup.agents.calls, []);
  }, { width: 360, height: 800 });
});

test('an element action clears the recorded path', async () => {
  const screen = [window([button('home.next', { x: 40, y: 400, width: 1000, height: 150 })])];
  await withPrepared([screen], async setup => {
    await act(setup, { kind: 'back' });
    const before = await setup.driver.observe(signal());
    const next = before.elements.find(element => element.identifier === 'home.next');
    assert.ok(next);
    await setup.driver.act({ kind: 'tap', targetRef: next.ref }, before, scenario, signal());
    assert.equal(setup.driver.actPath(), undefined);
  });
});

test('jpegSize reads a baseline or progressive frame\'s size, and gives undefined for anything else', () => {
  assert.deepEqual(jpegSize(jpegOf(360, 800)), { width: 360, height: 800 });
  const progressive = jpegOf(800, 450);
  progressive[9] = 0xc2;
  assert.deepEqual(jpegSize(progressive), { width: 800, height: 450 });
  assert.equal(jpegSize(Buffer.from('jpeg-1')), undefined);
  assert.equal(jpegSize(jpegOf(360, 800).subarray(0, 12)), undefined);
  assert.equal(jpegSize(jpegOf(0, 800)), undefined);
});
