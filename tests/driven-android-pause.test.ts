/**
 * PR #36 review, P1: a screen that changes while a step is paused for Claude. The review's probe, through
 * `runScriptedScenario` with the real Android driver, the fake adb and the fake device agent: the step paused on one
 * screen, the device moved to another, and Claude's answer reached the device anyway. No device, no TypeSafe call.
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { AndroidNode, DeviceAgentClient } from '../src/device/android/agent-client.js';
import { PINNED_AGENT_SHA256 } from '../src/device/android/agent-supply.js';
import { AndroidDriver } from '../src/device/android/driver.js';
import type { HandbackAnswer, HandbackPacket } from '../src/driven/step.js';
import { runScriptedScenario } from '../src/scripted/run.js';
import { parseScriptedScenario } from '../src/scripted/schema.js';
import { AGENT_CACHE, FakeAdb, fakeAgents, fakeClock, FakeStreams } from './fixtures/android-device.js';
import { fakeDrivenJudge } from './fixtures/driven-judge.js';
import { withRunLog } from './fixtures/run-log.js';

const window = (children: AndroidNode[]): AndroidNode =>
  ({ class: 'android.widget.FrameLayout', visible: true, rect: { x: 0, y: 0, width: 1080, height: 2400 }, children });
const button = (id: string, text: string): AndroidNode => ({ class: 'android.widget.Button', 'resource-id': id, text,
  clickable: true, enabled: true, visible: true, rect: { x: 40, y: 1000, width: 1000, height: 160 } });
/** The screen Claude was shown, and the one the device moved to during the pause: another control in the same place. */
const SHOWN = [window([button('com.example.android:id/next', 'Next')])];
const MOVED = [window([button('com.example.android:id/delete', 'Delete account')])];

/** The smallest JPEG header the size reader needs: SOI, then a baseline SOF0 frame of `width` × `height`. */
function jpegOf(width: number, height: number): Buffer {
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03,
    0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]);
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])]);
}

/** A localOnly step paused on SHOWN; the device shows MOVED by the time Claude answers; then Claude stops. */
async function pausedThenMoved(answer: (packet: HandbackPacket) => HandbackAnswer) {
  const root = await mkdtemp(join(tmpdir(), 'jev-android-pause-'));
  const adb = new FakeAdb({ serial: 'emulator-5554', avd: 'jev-actions-api31' });
  // Two matching dumps settle SHOWN for the pause; every later dump is MOVED.
  const agents = fakeAgents(adb, { screens: [SHOWN, SHOWN, MOVED] });
  // A 1080 × 2400 screen as the agent's 800-pixel screenshot, so a point tap can be scaled.
  const agentClient = (port: number): DeviceAgentClient => {
    const client = agents.agentClient(port);
    return { ...client, async screenshot(maxSize, abort) { await client.screenshot(maxSize, abort); return jpegOf(360, 800); } };
  };
  const driver = new AndroidDriver({ device: { avd: 'jev-actions-api31' }, runner: adb.run, agentClient, clock: fakeClock(),
    leaseRoot: root, screenshotFolder: root, freePort: async () => 49526, logcat: new FakeStreams(adb), logFolder: false,
    tools: async () => ({ adb: '/sdk/platform-tools/adb', agent: { path: AGENT_CACHE, sha256: PINNED_AGENT_SHA256 } }) });
  const scenario = parseScriptedScenario({ version: 2, platform: 'android', app: { package: 'com.example.android' },
    values: {}, steps: [
      { id: 'next', kind: 'do', intent: 'Go to the next page', doneWhen: 'The next page shows', effect: 'none', localOnly: true },
      { id: 'verify', kind: 'checkpoint', guard: { present: [{ role: 'text', label: 'Done' }] },
        assertions: [{ id: 'shown', claim: 'Done is shown.' }] }] });
  const packets: HandbackPacket[] = [];
  const answers = [answer, (): HandbackAnswer => ({ kind: 'stop' })];
  try {
    return await withRunLog('android-pause', async log => {
      const report = await runScriptedScenario({ runId: 'android-pause', log, scenario, driver,
        judge: { async judge() { throw new Error('no checkpoint is reached'); } },
        driven: { judge: fakeDrivenJudge([]), testWritesAllowed: false,
          handback: async packet => { packets.push(packet); return answers.shift()!(packet); } } });
      return { report, packets, calls: agents.calls };
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const answers: [string, (packet: HandbackPacket) => HandbackAnswer][] = [
  ['tap', packet => ({ kind: 'tap', ref: packet.snapshot.elements.find(element => element.label === 'Next')!.ref })],
  ['back', () => ({ kind: 'back' })],
  // The middle of Next on the screenshot: Delete account on the moved screen.
  ['tapAt', () => ({ kind: 'tapAt', x: 180, y: 360 })],
];

for (const [kind, answer] of answers) {
  test(`Android: Claude's ${kind} answer for a screen that changed during the pause never reaches the device`, async () => {
    const { report, packets, calls } = await pausedThenMoved(answer);
    assert.deepEqual(packets.map(packet => packet.reason), ['LOCAL_ONLY_STEP', 'SCREEN_CHANGED']);
    assert.deepEqual(calls.filter(call => call.method.startsWith('device.io.')), [], 'no tap, key or swipe');
    assert.match(packets[1]!.screen, /Delete account/, 'the new pause shows the screen as it is now');
    assert.equal(report.reason, 'STOPPED_BY_CLAUDE');
  });
}
