import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ownedGroup } from '../src/appium/fence/proof.js';
import { appiumComponentSchema, hostInventorySchema } from '../src/appium/fence/schema.js';
import { createSessionProfile } from '../src/appium/session.js';
import { allocateHostPorts, portComponents } from '../src/appium/ports.js';
import { clientFixture } from './fixtures/appium-wire/client-fixture.js';

test('session profiles take per-allocation host ports and keep the fixed ones only by default', t => {
  const f = clientFixture(t);
  const ios = createSessionProfile(f.stack, { platform: 'ios', device: 'ios-test', path: 'run', presentation: 'visible', ports: { wdaLocalPort: 18110, mjpegServerPort: 18111 } });
  assert.equal(ios.capabilities['appium:wdaLocalPort'], 18110);
  assert.equal(ios.capabilities['appium:mjpegServerPort'], 18111);
  const android = createSessionProfile(f.stack, { platform: 'android', device: 'serial-one', path: 'run', serverInstallation: { kind: 'install' }, ports: { systemPort: 18210 } });
  assert.equal(android.capabilities['appium:systemPort'], 18210);
  assert.equal(createSessionProfile(f.stack, { platform: 'ios', device: 'ios-test', path: 'run', presentation: 'visible' }).capabilities['appium:wdaLocalPort'], 18100);
  assert.equal(createSessionProfile(f.stack, { platform: 'android', device: 'serial-one', path: 'run', serverInstallation: { kind: 'install' } }).capabilities['appium:systemPort'], 18200);
});

test('two allocations on one host get distinct ports, and Android ports become the owned forward by value', async () => {
  let next = 20000;
  const freePort = async () => next++;
  const first = await allocateHostPorts('ios', freePort);
  const second = await allocateHostPorts('android', freePort);
  assert.deepEqual(first, { platform: 'ios', wdaLocalPort: 20000, mjpegServerPort: 20001 });
  assert.deepEqual(second, { platform: 'android', systemPort: 20002 });
  assert.deepEqual(portComponents(second, 'serial-one', () => 'forward-1'), [{ id: 'forward-1', kind: 'appium-forward', serial: 'serial-one', local: 'tcp:20002', remote: 'tcp:6790' }]);
  assert.deepEqual(portComponents(first, 'serial-one', () => 'forward-1'), []);
  const real = await allocateHostPorts('ios');
  assert.notEqual(real.wdaLocalPort, real.mjpegServerPort);
});

test('the private child runs in its own process group and carries the run marker and launch ancestry', async t => {
  const f = clientFixture(t);
  const ancestry = [{ pid: process.pid, startTime: 'Fri Oct 24 09:00:00 2026' }];
  const client = await f.open('none', f.recording, { launch: { runMarker: '0123456789abcdef0123456789abcdef', ancestry } });
  const child = client.components.find(record => record.kind === 'appium-child');
  if (child?.kind !== 'appium-child') assert.fail('child record missing');
  const pgid = Number(execFileSync('/bin/ps', ['-p', String(child.pid), '-o', 'pgid='], { encoding: 'utf8' }).trim());
  assert.equal(pgid, child.pid);
  const env = JSON.parse(readFileSync(f.environment, 'utf8'));
  assert.equal(env.JEV_PHASE1_RUN_MARKER, '0123456789abcdef0123456789abcdef');
  const inherited = JSON.parse(Buffer.from(env.JEV_PHASE1_ANCESTRY, 'base64url').toString('utf8')) as typeof ancestry;
  assert.deepEqual(inherited, ancestry);
  const leader = { pid: child.pid, startTime: 'Fri Oct 24 09:00:01 2026' };
  const rows = hostInventorySchema.parse([{ ...leader, ppid: process.pid, pgid: child.pid, state: 'running', executable: '/usr/local/bin/node',
    runMarker: env.JEV_PHASE1_RUN_MARKER, launchChain: inherited }]);
  const group = (launcher?: (typeof ancestry)[number]) => appiumComponentSchema.parse({ id: 'group', kind: 'appium-process-group', leader, runMarker: env.JEV_PHASE1_RUN_MARKER,
    pgid: child.pid, members: [], ...(launcher ? { launcher } : {}) }) as Parameters<typeof ownedGroup>[0];
  assert.deepEqual(ownedGroup(group(ancestry[0]), rows).map(row => row.pid), [child.pid], 'a chain that starts at the recorded launcher is owned');
  assert.throws(() => ownedGroup(group(), rows), /Launch ancestry is unprovable/);
  const plain = await f.open();
  const other = plain.components.find(record => record.kind === 'appium-child');
  if (other?.kind !== 'appium-child') assert.fail('child record missing');
  assert.notEqual(Number(execFileSync('/bin/ps', ['-p', String(other.pid), '-o', 'pgid='], { encoding: 'utf8' }).trim()), other.pid);
});
