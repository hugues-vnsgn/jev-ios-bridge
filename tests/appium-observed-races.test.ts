/**
 * The cross-process observed races and the export-loss rows (H01, H03.01, H05.05, H07.02) on the Appium composition:
 * every owner process runs the real allocator and action service with Appium drivers over a world host, and the same
 * public policy and authority oracles hold as on the legacy backend.
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { bounded } from './fixtures/admission-race-harness.js';
import { actionRequest, hostFixture } from './fixtures/observed-host/harness.js';
import { actionSnapshot, allocation, errorCode, publicAuthority, publicPolicy, snapshot } from './fixtures/public-contention.js';

const appium = (t: test.TestContext) => hostFixture(t, 'appium');
const deviceEffects = (calls: string[]) => calls.filter(call => !['plist', 'window'].includes(call));

for (const transport of ['cli', 'mcp'] as const) {
  test(`H03.01 ${transport} concurrent preparation on Appium has complete closed authority`, { timeout: 60000 }, async t => {
    const f = await appium(t); const request = f.request('one'); const path = await f.requestFile(request);
    const cwd = join(f.root, 'unrelated'); await mkdir(cwd); const alias = join(f.root, 'alias'); await symlink(cwd, alias);
    const actors = await Promise.all([cwd, alias].map(async directory => ({ directory, owner: transport === 'mcp' ? await f.mcp({ cwd: directory, projectDir: directory }) : undefined })));
    const observations = await Promise.all(actors.map(async ({ directory, owner }) => ({ request, reply: (owner ? await owner.call('prepare_observed_allocation', request) : await f.cli('observed-allocate', path, { cwd: directory, projectDir: directory })).reply })));
    publicPolicy({ observations: observations.map(o => ({ ...o, operation: transport === 'mcp' ? 'prepare_observed_allocation' : 'observed-allocate' })) });
    const { events } = await f.closeOwners();
    publicAuthority({ observations: f.observations, admission: f.admission(), requests: observations.map(o => o.request), events });
    assert.deepEqual(deviceEffects(f.calls()), ['create', 'boot', 'install', 'launch-app'], 'one preparation runs, once');
  });
  test(`H03.01 ${transport} concurrent action on Appium has complete closed authority`, { timeout: 60000 }, async t => {
    const f = await appium(t); const prepared = await f.prepare(); const baseline = f.admission().readAllocation(prepared.allocationId)!;
    const request = actionRequest(prepared.allocationId); const path = await f.requestFile(request, 'action.json');
    const actors = await Promise.all([0, 1].map(async () => ({ owner: transport === 'mcp' ? await f.mcp() : undefined })));
    const observations = await Promise.all(actors.map(async ({ owner }) => ({ request, reply: (owner ? await owner.call('start_observed_action', request) : await f.cli('observed-action', path)).reply })));
    publicPolicy({ observations: observations.map(o => ({ ...o, operation: transport === 'mcp' ? 'start_observed_action' : 'observed-action' })) });
    for (const { owner } of actors) if (owner) await owner.call('get_observed_action', { actionId: 'one', waitMs: 10000 });
    const { events } = await f.closeOwners();
    publicAuthority({ observations: f.observations, admission: f.admission(), requests: [f.request('one')], baseline, action: request, events, requireOutcome: 'action_completed' });
    assert.deepEqual(deviceEffects(f.calls()), ['create', 'boot', 'install', 'launch-app', 'touch'], 'one tap across both owners');
  });
  test(`H03.01 ${transport} ordered aliases on Appium duplicate useful preparation and action without replay`, { timeout: 60000 }, async t => {
    const f = await appium(t); const request = f.request('one'); const path = await f.requestFile(request);
    const cwd = join(f.root, 'unrelated'); await mkdir(cwd); const alias = join(f.root, 'alias'); await symlink(cwd, alias);
    const first = transport === 'mcp' ? await f.mcp({ cwd, projectDir: cwd }) : undefined;
    const second = transport === 'mcp' ? await f.mcp({ cwd: alias, projectDir: alias }) : undefined;
    const prepared = allocation((first ? await first.call('prepare_observed_allocation', request) : await f.cli('observed-allocate', path, { cwd, projectDir: cwd })).reply);
    assert.deepEqual([prepared.state, prepared.outcome], ['ready', 'prepared']);
    assert.deepEqual(allocation((second ? await second.call('prepare_observed_allocation', request) : await f.cli('observed-allocate', path, { cwd: alias, projectDir: alias })).reply), prepared);
    const baseline = f.admission().readAllocation(prepared.allocationId)!; const input = actionRequest(prepared.allocationId.toLowerCase()); const actionPath = await f.requestFile(input, 'action.json');
    const started = actionSnapshot((first ? await first.call('start_observed_action', input) : await f.cli('observed-action', actionPath, { cwd })).reply);
    assert.equal(started.disposition, 'started');
    const done = first ? actionSnapshot((await first.call('get_observed_action', { actionId: 'one', waitMs: 10000 })).reply) : started;
    assert.deepEqual([done.outcome, done.authority], ['outcome_observed', 'committed']);
    const repeated = actionSnapshot((second ? await second.call('start_observed_action', input) : await f.cli('observed-action', actionPath, { cwd: alias })).reply);
    assert.deepEqual([repeated.disposition, repeated.outcome], ['retrieved', 'outcome_observed']);
    assert.deepEqual(deviceEffects(f.calls()), ['create', 'boot', 'install', 'launch-app', 'touch']);
    const calls = f.calls(); const bytes = await f.database(); const binding = f.admission().readAllocation(prepared.allocationId);
    const changed = { ...input, timeoutMs: 6000 };
    assert.equal(errorCode((first ? await first.call('start_observed_action', changed) : await f.cli('observed-action', await f.requestFile(changed, 'conflict.json'))).reply), 'ACTION_ID_CONFLICT');
    const disabled = await f.mcp({ enabled: '0', cwd: alias });
    assert.equal(actionSnapshot((await disabled.call('get_observed_action', { actionId: 'one' })).reply).outcome, 'outcome_observed');
    assert.deepEqual(f.calls(), calls); assert.deepEqual(await f.database(), bytes); assert.deepEqual(f.admission().readAllocation(prepared.allocationId), binding);
    const { events } = await f.closeOwners();
    publicAuthority({ observations: f.observations, admission: f.admission(), requests: [request], baseline, action: input, events, requireOutcome: 'action_completed' });
  });
}

test('H05.05 concurrent genuine start/retire on Appium has complete closed authority', { timeout: 60000 }, async t => {
  const f = await appium(t); const prepared = await f.prepare(); const baseline = f.admission().readAllocation(prepared.allocationId)!;
  const request = actionRequest(prepared.allocationId); const path = await f.requestFile(request);
  const [start, retire] = await Promise.all([f.cli('observed-action', path), f.cli('observed-retire', prepared.allocationId)]);
  publicPolicy({ observations: [{ operation: 'observed-action', request, reply: start.reply }] });
  publicPolicy({ observations: [{ operation: 'observed-retire', request, reply: retire.reply }] });
  const { events } = await f.closeOwners();
  publicAuthority({ observations: f.observations, admission: f.admission(), requests: [f.request('one')], baseline, action: request, retire: true, events });
});
for (const order of ['retire-first', 'action-first'] as const) test(`H05.05 ordered ${order} on Appium preserves useful business outcomes`, { timeout: 60000 }, async t => {
  const f = await appium(t); const prepared = await f.prepare(); const baseline = f.admission().readAllocation(prepared.allocationId)!;
  const request = actionRequest(prepared.allocationId); const path = await f.requestFile(request);
  if (order === 'retire-first') {
    const retired = allocation((await f.cli('observed-retire', prepared.allocationId)).reply);
    assert.deepEqual([retired.outcome, retired.reason, retired.cancellationRequested], ['retired_unused', 'RETAINED_UNUSED', false]);
    assert.equal(errorCode((await f.cli('observed-action', path)).reply), 'ALLOCATION_NOT_READY');
    assert.deepEqual(deviceEffects(f.calls()), ['create', 'boot', 'install', 'launch-app']);
  } else {
    assert.equal(actionSnapshot((await f.cli('observed-action', path)).reply).outcome, 'outcome_observed');
    assert.equal(allocation((await f.cli('observed-retire', prepared.allocationId)).reply).outcome, 'action_completed');
    assert.deepEqual(deviceEffects(f.calls()), ['create', 'boot', 'install', 'launch-app', 'touch']);
  }
  const { events } = await f.closeOwners();
  publicAuthority({ observations: f.observations, admission: f.admission(), requests: [f.request('one')], baseline, action: request, retire: true, events, requireOutcome: order === 'retire-first' ? 'retired_unused' : 'action_completed' });
});

for (const fault of ['provisional', 'terminal'] as const) for (const transport of ['cli', 'mcp'] as const) test(`H07.02 ${transport} evidence ${fault} failure on Appium respects authoritative commit`, { timeout: 60000 }, async t => {
  const f = await appium(t); const ready = await f.prepare(); const request = actionRequest(ready.allocationId);
  const server = transport === 'mcp' ? await f.mcp({ fault }) : undefined;
  if (server) await server.call('start_observed_action', request);
  const result = server ? await server.call('get_observed_action', { actionId: 'one', waitMs: 10000 }) : await f.cli('observed-action', await f.requestFile(request), { fault });
  const reply = actionSnapshot(result.reply);
  assert.deepEqual([reply.authority, reply.outcome, reply.admission], fault === 'terminal' ? ['committed', 'outcome_observed', 'available'] : ['committed', 'inconclusive', 'quarantined']);
  if (fault === 'terminal') assert.deepEqual([reply.evidence.exportStatus, reply.evidence.terminal], ['failed', null]);
  assert.deepEqual(deviceEffects(f.calls()), ['create', 'boot', 'install', 'launch-app', 'touch']); const calls = f.calls();
  const read = await f.cli('observed-report', 'one', { enabled: '0' });
  assert.equal(snapshot(read.reply).outcome, reply.outcome); assert.deepEqual(f.calls(), calls);
  if (server) await server.close();
});

for (const winner of ['scripted', 'observed'] as const) {
  test(`H01 cross-process ${winner} winner excludes the other iOS entry point on Appium without losing effects`, { timeout: 60000 }, async t => {
    const f = await appium(t);
    const device = 'ABCDEF00-0000-4000-8000-000000000001';
    f.configure({ inventory: f.inventory(device.toLowerCase()) });
    const input = { ...f.request('one'), source: { kind: 'supplied', inventoryId: 'stock-one' } };
    const args = ['--import', import.meta.resolve('tsx'), fileURLToPath(new URL('./fixtures/scripted-race-owner.ts', import.meta.url)), f.store, device.toLowerCase()];
    if (winner === 'scripted') {
      const owner = spawn(process.execPath, args, { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], env: { PATH: process.env.PATH } });
      let stderr = ''; owner.stderr!.on('data', data => { stderr += data; });
      const exited = new Promise<number | null>(resolve => owner.once('close', resolve));
      t.after(async () => { if (owner.exitCode === null && owner.signalCode === null) owner.kill('SIGKILL'); await bounded('cross-entry cleanup', exited); });
      const message = await bounded('scripted preparation', new Promise<unknown>((resolve, reject) => {
        owner.once('message', resolve); owner.once('error', reject); owner.once('exit', () => reject(new Error(stderr)));
      }));
      assert.deepEqual(message && typeof message === 'object' && 'kind' in message ? message.kind : message, 'prepared');
      const bytes = await f.database(), before = f.calls();
      const loser = await bounded('observed loser', f.cli('observed-allocate', await f.requestFile(input)));
      assert.equal(errorCode(loser.reply), 'INVENTORY_INELIGIBLE');
      assert.equal(f.admission().readAllocationForAction('one'), undefined);
      assert.deepEqual(await f.database(), bytes); assert.deepEqual(deviceEffects(f.calls()), deviceEffects(before));
      assert.equal(f.admission().inspect(device)?.owner?.attempt.id, 'scripted-racer');
      owner.send('close'); assert.equal(await bounded('scripted close', exited), 0, stderr);
      assert.equal(f.admission().inspect(device)?.state, 'available');
    } else {
      const prepared = await bounded('observed preparation', f.cli('observed-allocate', await f.requestFile(input)));
      assert.equal(allocation(prepared.reply).state, 'ready');
      assert.deepEqual(deviceEffects(f.calls()), ['boot', 'install', 'launch-app'], 'supplied stock is never created');
      const bytes = await f.database(), before = f.calls();
      const loser = spawnSync(process.execPath, [...args, 'refuse'], { encoding: 'utf8', timeout: 10000, env: { PATH: process.env.PATH } });
      assert.equal(loser.status, 0, loser.stderr); assert.equal(loser.stdout, 'DEVICE_BUSY; zero backend requests');
      assert.deepEqual(await f.database(), bytes); assert.deepEqual(f.calls(), before);
      assert.equal(f.admission().readAttempt({ kind: 'legacy', id: 'scripted-racer' }), undefined);
    }
  });
}
