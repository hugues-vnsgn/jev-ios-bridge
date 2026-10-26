import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { DeviceReasonError } from '../src/device/index.js';
import { createRunLog } from '../src/log/index.js';
import { UDID, driverFixture, rewriteRecording } from './fixtures/appium-wire/driver-fixture.js';
import { fakeSimulatorProbe } from './fixtures/android-device.js';

const ios = { target: { platform: 'ios', device: UDID }, identityProbe: fakeSimulatorProbe(UDID) } as const;
/** The production composition passes no screenshot folder, so the driver makes its own. */
const ownScreenshotFolder = { screenshotFolder: undefined } as {};
const observeRecording = (root: string) => rewriteRecording(root, 'tests/fixtures/appium-wire/ios/observe-2.jsonl', [['ios-test', UDID]]);
const live = () => new AbortController().signal;
/** Its settle deadline never fires, so the observe dispatch's own deadline is the one that cuts the lost reply short. */
const unboundedSettle = { now: Date.now, sleep: (ms: number) => delay(ms), timeout: () => new AbortController().signal };
function runsFolder(t: TestContext): string {
  const runs = realpathSync(mkdtempSync(join(tmpdir(), 'appium-followups-')));
  t.after(() => rmSync(runs, { recursive: true, force: true }));
  return runs;
}

test('close removes the driver-made screenshot folder after the run log copied its screenshots', async t => {
  const f = driverFixture(t, observeRecording, { ...ios, ...ownScreenshotFolder });
  await f.driver.prepare({ app: { bundleId: 'example.app' } }, live());
  const snapshot = await f.driver.observe(live());
  const folder = dirname(snapshot.screenshotPath!);
  assert.match(basename(folder), /^jev-appium-screens-/);
  const runs = runsFolder(t);
  const log = await createRunLog(runs, 'screens');
  await log.append('step', { step: 1, screenshotPath: snapshot.screenshotPath });
  const shot = readFileSync(snapshot.screenshotPath!);
  await f.driver.close(live());
  assert.deepEqual([existsSync(folder), readFileSync(join(runs, 'screens', 'screen-1.jpg')).equals(shot)], [false, true]);
});

test('close keeps a screenshot folder the caller supplied', async t => {
  const f = driverFixture(t, observeRecording, ios);
  await f.driver.prepare({ app: { bundleId: 'example.app' } }, live());
  const snapshot = await f.driver.observe(live());
  await f.driver.close(live());
  assert.deepEqual([dirname(snapshot.screenshotPath!), existsSync(snapshot.screenshotPath!)], [join(f.root, 'shots'), true]);
});

test('an iOS launch sweeps log files older than three days from the log folder, as Android does', async t => {
  const f = driverFixture(t, observeRecording, ios);
  const logs = join(f.root, 'logs');
  const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
  writeFileSync(join(logs, 'old-console.log'), 'old');
  utimesSync(join(logs, 'old-console.log'), fourDaysAgo, fourDaysAgo);
  writeFileSync(join(logs, 'recent-console.log'), 'recent');
  await f.driver.prepare({ app: { bundleId: 'example.app' } }, live());
  assert.deepEqual(readdirSync(logs).sort(), ['recent-console.log', 'run-1-console.log', 'run-1-os.log']);
});

test('close after a lost observe reply reports CLEANUP_FAILED naming the first failure, not the closed claim', async t => {
  const f = driverFixture(t, observeRecording, { ...ios, timeoutMs: 5000, clock: unboundedSettle }, 'source-lost');
  await f.driver.prepare({ app: { bundleId: 'example.app' } }, live());
  await assert.rejects(f.driver.observe(live()), (error: unknown) => error instanceof DeviceReasonError && error.code === 'TIMEOUT');
  const closed: unknown = await f.driver.close(live()).then(() => undefined, (error: unknown) => error);
  assert.deepEqual(closed instanceof DeviceReasonError ? [closed.code, closed.message] : closed,
    ['CLEANUP_FAILED', 'Close met a closed claim. First failure: TIMEOUT.']);
});
