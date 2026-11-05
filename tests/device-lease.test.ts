import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { UDID } from './fixtures/appium-wire/driver-fixture.js';
import { IOS_DEVICE, iosTarget } from './fixtures/appium-wire/matrix.js';
import { iosScreen, world, worldFixture } from './fixtures/appium-wire/world.js';

const live = () => AbortSignal.timeout(20_000);
const home = world('ios', { home: iosScreen([{ type: 'StaticText', name: 'home', label: 'Home', frame: [16, 100, 200, 40] }]) });
const app = { app: { bundleId: 'example.app' } };

test('an iOS run writes the lease file a 1.1 bridge reads, exactly pid, token, deviceId and createdAt, and removes it at release', async t => {
  const f = worldFixture(t, home, iosTarget);
  const path = join(f.root, 'locks', `${UDID}.lock`);
  await f.driver.prepare(app, live());
  const written = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  assert.deepEqual(Object.keys(written), ['pid', 'token', 'deviceId', 'createdAt']);
  assert.deepEqual([written.pid, written.deviceId, written.token], [process.pid, UDID, f.admission.inspect(IOS_DEVICE)?.owner?.token]);
  await f.driver.close(live());
  assert.equal(existsSync(path), false);
});

test('a lease file that can no longer be read at release makes close fail and stays in place, so the next run is refused', async t => {
  const f = worldFixture(t, home, iosTarget);
  const path = join(f.root, 'locks', `${UDID}.lock`);
  await f.driver.prepare(app, live());
  writeFileSync(path, '{not json');
  await assert.rejects(f.driver.close(live()), { code: 'CLEANUP_FAILED' });
  assert.equal(readFileSync(path, 'utf8'), '{not json');
  const next = f.open(home);
  await assert.rejects(next.driver.prepare(app, live()), { code: 'DEVICE_BUSY' });
  assert.deepEqual(next.tools(), []);
});
