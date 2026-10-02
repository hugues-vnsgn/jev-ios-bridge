/**
 * Issue 02 review, P2: the look again before the target search captures the screen once more, and Android's driver
 * acts only on its latest capture. An unchanged screen must be searched from that new capture, so the search's scrolls
 * reach the device as in 1.3.0. Through `runScriptedScenario` with the real Android driver, the fake adb and the fake
 * device agent. No device, no TypeSafe call.
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { AndroidNode } from '../src/device/android/agent-client.js';
import { PINNED_AGENT_SHA256 } from '../src/device/android/agent-supply.js';
import { AndroidDriver } from '../src/device/android/driver.js';
import type { HandbackPacket } from '../src/driven/step.js';
import { runScriptedScenario } from '../src/scripted/run.js';
import { parseScriptedScenario } from '../src/scripted/schema.js';
import { AGENT_CACHE, FakeAdb, fakeAgents, fakeClock, FakeStreams } from './fixtures/android-device.js';
import { fakeDrivenJudge } from './fixtures/driven-judge.js';
import { withRunLog } from './fixtures/run-log.js';

/** A full-screen list holding one row that doesn't do the step; the agent shows it on every dump. */
const LIST: AndroidNode[] = [{ class: 'android.widget.FrameLayout', visible: true, rect: { x: 0, y: 0, width: 1080, height: 2400 },
  children: [{ class: 'android.widget.ScrollView', 'resource-id': 'com.example.android:id/list', scrollable: true,
    visible: true, rect: { x: 0, y: 200, width: 1080, height: 2000 },
    children: [{ class: 'android.widget.TextView', text: 'Row 1', visible: true, rect: { x: 40, y: 260, width: 1000, height: 120 } }] }] }];

test('Android: a screen unchanged after the look is searched from the new capture, and its scrolls reach the device', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-late-screen-'));
  const adb = new FakeAdb({ serial: 'emulator-5554', avd: 'jev-actions-api31' });
  const agents = fakeAgents(adb, { screens: [LIST] });
  const driver = new AndroidDriver({ device: { avd: 'jev-actions-api31' }, runner: adb.run, agentClient: agents.agentClient,
    clock: fakeClock(), leaseRoot: root, screenshotFolder: root, freePort: async () => 49527, logcat: new FakeStreams(adb),
    logFolder: false, tools: async () => ({ adb: '/sdk/platform-tools/adb', agent: { path: AGENT_CACHE, sha256: PINNED_AGENT_SHA256 } }) });
  const scenario = parseScriptedScenario({ version: 2, platform: 'android', app: { package: 'com.example.android' },
    values: {}, steps: [
      { id: 'find', kind: 'do', intent: 'Open the settings row', doneWhen: 'The settings page shows', effect: 'none' },
      { id: 'verify', kind: 'checkpoint', guard: { present: [{ role: 'text', label: 'Settings' }] },
        assertions: [{ id: 'shown', claim: 'Settings is shown.' }] }] });
  const packets: HandbackPacket[] = [];
  const judge = fakeDrivenJudge([{ choice: 'none_fits', confidence: 0.95 }]);
  try {
    await withRunLog('late-screen', async log => {
      const report = await runScriptedScenario({ runId: 'late-screen', log, scenario, driver,
        judge: { async judge() { throw new Error('no checkpoint is reached'); } },
        driven: { judge, testWritesAllowed: false, lateScreenWaitMs: 0,
          handback: async packet => { packets.push(packet); return { kind: 'stop' }; } } });
      const events = await log.read();
      const searches = events.filter(event => event.type === 'search').map(event => event.data);
      assert.ok(searches.length >= 1, 'the target search ran');
      assert.ok(agents.calls.some(call => call.method === 'device.io.swipe'), 'a search scroll reached the device');
      assert.deepEqual(packets.map(packet => packet.reason), ['NONE_FITS']);
      assert.equal(judge.asked.length, 1, 'an unchanged screen isn\'t asked about again');
      assert.equal(report.reason, 'STOPPED_BY_CLAUDE');
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
