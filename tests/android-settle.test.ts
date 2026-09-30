import assert from 'node:assert/strict';
import { test } from 'node:test';
import { screenHash, settle, type AgentNode, type Clock, type UiTree } from '../src/device/android/settle.js';

function node(fields: Partial<AgentNode> & { children?: AgentNode[] | null } = {}): AgentNode {
  return { class: 'android.view.View', text: '', 'content-desc': '', 'resource-id': '',
    rect: { x: 0, y: 0, width: 1080, height: 100 }, children: null, ...fields };
}

/** The shape real captures have: a status bar whose icons carry no systemui id of their own, and the app's window. */
function screen(appText: string, clock = '10:30', battery = 'Battery charging, 100 percent.'): UiTree {
  return { hierarchy: [
    node({ class: 'android.widget.FrameLayout', children: [
      node({ 'resource-id': 'com.android.systemui:id/status_bar', children: [
        node({ 'resource-id': 'com.android.systemui:id/clock', text: clock }),
        node({ 'content-desc': battery }),
      ] }),
    ] }),
    node({ class: 'android.widget.FrameLayout', children: [node({ class: 'android.widget.TextView', text: appText })] }),
  ] };
}

/** A fake clock and a capture call that takes `durationMs` of fake time and replays `trees` (the last one repeats). */
function fakeCapture(trees: UiTree[], durationMs = 0) {
  let time = 0;
  const starts: number[] = [];
  const clock: Clock = { now: () => time, sleep: async (ms) => { time += ms; } };
  const capture = async (_signal: AbortSignal) => {
    starts.push(time);
    time += durationMs;
    return trees[Math.min(starts.length - 1, trees.length - 1)]!;
  };
  return { clock, capture, starts, now: () => time };
}

const live = () => new AbortController().signal;

test('the 250 ms runs from the first capture\'s return to the second\'s start, and a matching second capture settles when it returns', async () => {
  const fake = fakeCapture([screen('Home'), screen('Home')], 600);
  const result = await settle(fake.capture, fake.clock, live());
  assert.deepEqual(fake.starts, [0, 850]);
  assert.equal(fake.now(), 1450);
  assert.equal(result.settled, true);
  assert.deepEqual(result.tree, screen('Home'));
  assert.equal(result.screenHash, screenHash(screen('Home')));
});

test('nothing settles on a single capture: a second capture always follows the first', async () => {
  const fake = fakeCapture([screen('Home')]);
  const result = await settle(fake.capture, fake.clock, live());
  assert.deepEqual(fake.starts, [0, 250]);
  assert.equal(result.settled, true);
});

test('a change only in the status bar, including an icon with no systemui id, still settles', async () => {
  const fake = fakeCapture([screen('Home', '10:30', 'Battery 99 percent.'), screen('Home', '10:31', 'Battery 100 percent.')]);
  const result = await settle(fake.capture, fake.clock, live());
  assert.deepEqual(fake.starts, [0, 250]);
  assert.equal(result.settled, true);
  assert.equal(screenHash(screen('Home', '10:30')), screenHash(screen('Home', '10:31', 'Wifi')));
});

test('a screen that changes once then holds settles on the newer capture', async () => {
  const fake = fakeCapture([screen('Loading'), screen('Home'), screen('Home')], 100);
  const result = await settle(fake.capture, fake.clock, live());
  assert.deepEqual(fake.starts, [0, 350, 700]);
  assert.equal(result.settled, true);
  assert.deepEqual(result.tree, screen('Home'));
  assert.equal(result.screenHash, screenHash(screen('Home')));
});

test('a screen that keeps changing stops at the 3 s cap, not settled, with the last capture', async () => {
  const trees = Array.from({ length: 30 }, (_, index) => screen(`Frame ${index}`));
  const fake = fakeCapture(trees, 100);
  const result = await settle(fake.capture, fake.clock, live());
  assert.equal(result.settled, false);
  assert.ok(fake.starts.every(start => start < 3000), `a capture started after the cap: ${fake.starts}`);
  assert.deepEqual(fake.starts, [0, 350, 700, 1050, 1400, 1750, 2100, 2450, 2800]);
  assert.deepEqual(result.tree, trees[fake.starts.length - 1]);
  assert.equal(result.screenHash, screenHash(trees[fake.starts.length - 1]!));
});

test('no capture starts at exactly 3 s', async () => {
  const trees = Array.from({ length: 30 }, (_, index) => screen(`Frame ${index}`));
  const fake = fakeCapture(trees, 125);
  const result = await settle(fake.capture, fake.clock, live());
  assert.deepEqual(fake.starts, [0, 375, 750, 1125, 1500, 1875, 2250, 2625]);
  assert.equal(result.settled, false);
  assert.deepEqual(result.tree, trees[7]);
});

test('an aborted signal stops the rule before its next capture', async () => {
  const controller = new AbortController();
  let captures = 0;
  const clock: Clock = { now: () => 0, sleep: async () => { controller.abort(new Error('cancelled')); } };
  await assert.rejects(settle(async () => { captures++; return screen('Home'); }, clock, controller.signal), /cancelled/);
  assert.equal(captures, 1);
});

test('an already aborted signal issues no capture at all', async () => {
  const controller = new AbortController();
  controller.abort(new Error('cancelled'));
  const fake = fakeCapture([screen('Home')]);
  await assert.rejects(settle(fake.capture, fake.clock, controller.signal), /cancelled/);
  assert.deepEqual(fake.starts, []);
});

test('the screen hash sees every change outside the status bar and ignores key order', () => {
  const base = screenHash(screen('Home'));
  assert.notEqual(screenHash(screen('Home ')), base);
  const moved = screen('Home');
  moved.hierarchy[1]!.children![0]!.rect = { x: 0, y: 1, width: 1080, height: 100 };
  assert.notEqual(screenHash(moved), base);
  const focused = screen('Home');
  focused.hierarchy[1]!.children![0]!.focused = true;
  assert.notEqual(screenHash(focused), base);
  const reordered: UiTree = JSON.parse(JSON.stringify(screen('Home')), (_key, value) =>
    value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse()) : value);
  assert.equal(screenHash(reordered), base);
  assert.match(base, /^[0-9a-f]{64}$/);
});
