import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DeviceReasonError } from '../src/device/index.js';
import { IOS_DEVICE, iosTarget } from './fixtures/appium-wire/matrix.js';
import { iosScreen, world, worldFixture, type WorldRule } from './fixtures/appium-wire/world.js';

const live = () => AbortSignal.timeout(20_000);
const screens = { home: iosScreen([{ type: 'StaticText', name: 'home', label: 'Home', frame: [16, 100, 200, 40] }]) };
const app = { app: { bundleId: 'example.app' } };
const reason = (code: string, vendorCode?: string) => (error: unknown) =>
  error instanceof DeviceReasonError && error.code === code && (vendorCode === undefined || error.vendorCode === vendorCode);

test('a page source the provider answers with DRIVER_ERROR fails the observe, settles, and close releases the device for the next run', async t => {
  const f = worldFixture(t, world('ios', screens, [{ tool: 'appium_get_page_source', nth: 1, fault: { kind: 'error', code: 'DRIVER_ERROR' } }]), iosTarget);
  await f.driver.prepare(app, live());
  await assert.rejects(f.driver.observe(live()), reason('DEVICE_ERROR', 'OBSERVATION_DRIVER_ERROR'));
  await f.driver.close(live());
  assert.equal(f.admission.inspect(IOS_DEVICE)!.state, 'available');
  const owner = f.admission.readAttempt({ kind: 'legacy', id: 'run-1' })!.owner;
  assert.deepEqual(f.admission.readGeneration(owner).commands.filter(command => command.state !== 'settled').map(command => command.operation), []);
  const next = f.open(world('ios', screens));
  await next.driver.prepare(app, live());
  await next.driver.close(live());
  assert.equal(f.admission.inspect(IOS_DEVICE)!.state, 'available');
});

const lost: [string, WorldRule['fault']][] = [['the private MCP child dying', { kind: 'exit', code: 9 }], ['the provider closing its output', { kind: 'disconnect' }]];
for (const [name, fault] of lost) {
  test(`${name} during an observe stays uncertain: close fences the stack and covers the read, and the next run starts`, async t => {
    const f = worldFixture(t, world('ios', screens, [{ tool: 'appium_get_page_source', nth: 1, fault }]), iosTarget);
    await f.driver.prepare(app, live());
    await assert.rejects(f.driver.observe(live()), reason('DEVICE_ERROR'));
    await f.driver.close(live());
    assert.equal(f.admission.inspect(IOS_DEVICE)!.state, 'available');
    const owner = f.admission.readAttempt({ kind: 'legacy', id: 'run-1' })!.owner;
    assert.deepEqual(f.admission.readGeneration(owner).commands.filter(command => command.state !== 'settled').map(command => [command.operation, command.state]),
      [['appium-observe', 'uncertain']]);
    const next = f.open(world('ios', screens));
    await next.driver.prepare(app, live());
    await next.driver.close(live());
  });
}

test('a lost tap reply stays uncertain: close fails naming the first failure, and the device stays quarantined though every component is stopped', async t => {
  const tapScreens = { home: iosScreen([{ type: 'Button', name: 'go', label: 'Go', frame: [16, 100, 200, 40] }]) };
  const f = worldFixture(t, world('ios', tapScreens, [{ tool: 'appium_perform_actions', nth: 1, fault: { kind: 'exit', code: 9 } }]), iosTarget);
  await f.driver.prepare(app, live());
  const snapshot = await f.driver.observe(live());
  const target = snapshot.elements.find(element => element.label === 'Go')!;
  await assert.rejects(f.driver.act({ kind: 'tap', targetRef: target.ref }, snapshot, { values: {} } as never, live()));
  await assert.rejects(f.driver.close(live()), (error: unknown) => reason('CLEANUP_FAILED')(error)
    && /First failure: (ACKNOWLEDGEMENT_LOST|CONNECTION_LOST|UNCONFIRMED)/.test((error as Error).message));
  assert.equal(f.admission.inspect(IOS_DEVICE)!.state, 'quarantined');
  const next = f.open(world('ios', tapScreens));
  await assert.rejects(next.driver.prepare(app, live()), reason('DEVICE_QUARANTINED'));
});
