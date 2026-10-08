import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { mkdir, writeFile, readFile, chmod, symlink, rm, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { Admission } from '../src/device/admission.js';
import { MobileBuildMcpDriver } from '../src/device/index.js';
import { migrateAdmissionForTesting, type MigrationDeclaration } from '../src/device/admission-migration.js';
import { runObservedExperiment } from '../src/experimental/observed-run.js';
import { hostFixture, actionRequest } from './fixtures/observed-host/harness.js';
import { allocatorPublic } from './fixtures/observed-host/allocator-public.js';
import { fixtureDevice, runtimeProfilePath } from './fixtures/observed-allocation-backend.js';
import { parsePrepareAllocation } from '../src/observed/allocation-schema.js';

const unknownId = 'ABCDEF00-0000-4000-8000-000000000099';
const deviceCalls = (calls: string[]) => calls.filter(value => !['open', 'plist'].includes(value));
for (const transport of ['cli', 'mcp'] as const) {
  test(`H01.01 ${transport} strict action/preparation rejection leaves no calls or reservations`, { timeout: 30000 }, async t => {
    const f = await hostFixture(t); const server = transport === 'mcp' ? await f.mcp() : undefined;
    const action = actionRequest(unknownId); const prep = f.request('one');
    const pristine = await f.database();
    const actionCases: [string, unknown][] = [
      ['missing-version', { ...action, version: undefined }], ['unsupported-version', { ...action, version: 2 }],
      ['extra-field', { ...action, privateVendor: 'never-echo' }], ['raw-udid', { ...action, deviceId: fixtureDevice }],
      ['coordinates', { ...action, action: { kind: 'tap', x: 1, y: 1 } }],
      ['timeout-min-adjacent', { ...action, timeoutMs: 99 }], ['timeout-max-adjacent', { ...action, timeoutMs: 60001 }], ['timeout-fraction', { ...action, timeoutMs: 100.5 }],
      ['id-empty', { ...action, actionId: '' }], ['id-max-adjacent', { ...action, actionId: 'a'.repeat(81) }], ['id-path', { ...action, actionId: '../escape' }],
      ['allocation-id', { ...action, allocationId: 'raw-device' }], ['guard-empty', { ...action, before: { present: [] } }],
      ['guard-max-adjacent', { ...action, after: { present: Array.from({ length: 13 }, () => ({ identifier: 'done' })) } }],
      ['absent-max-adjacent', { ...action, before: { present: [{ identifier: 'go' }], absent: Array.from({ length: 13 }, () => ({ identifier: 'x' })) } }],
      ['after-absent-max-adjacent', { ...action, after: { present: [{ identifier: 'done' }], absent: Array.from({ length: 13 }, () => ({ identifier: 'x' })) } }],
      ['selector-empty', { ...action, action: { kind: 'tap', selector: {} } }], ['selector-value-only', { ...action, action: { kind: 'tap', selector: { value: 'x' } } }],
      ['selector-max-adjacent', { ...action, action: { kind: 'tap', selector: { identifier: 'x'.repeat(501) } } }],
      ['guard-extra', { ...action, before: { present: [{ identifier: 'go' }], secret: 'never-echo' } }],
    ];
    const preparationCases: [string, unknown][] = [
      ['missing-version', { ...prep, version: undefined }], ['unsupported-version', { ...prep, version: 2 }],
      ['extra-field', { ...prep, root: 'never-echo' }], ['raw-udid', { ...prep, source: { kind: 'supplied', udid: fixtureDevice } }],
      ['timeout-min-adjacent', { ...prep, timeoutMs: 999 }], ['timeout-max-adjacent', { ...prep, timeoutMs: 900001 }],
      ['id-empty', { ...prep, actionId: '' }], ['id-max-adjacent', { ...prep, actionId: 'a'.repeat(81) }],
      ['path-relative', { ...prep, app: { ...prep.app, artifactPath: './Fixture.app' } }],
      ['path-max-adjacent', { ...prep, app: { ...prep.app, artifactPath: '/' + 'x'.repeat(4096) } }],
      ['path-null', { ...prep, app: { ...prep.app, artifactPath: '/x\0.app' } }],
      ['source-extra', { ...prep, source: { ...prep.source, cleanup: true } }],
    ];
    for (const [kind, cases] of [['action', actionCases], ['preparation', preparationCases]] as const) for (const [id, request] of cases) {
      const response = server ? await server.call(kind === 'action' ? 'start_observed_action' : 'prepare_observed_allocation', request as object)
        : await f.cli(kind === 'action' ? 'observed-action' : 'observed-allocate', await f.requestFile(request));
      const expected = id === 'unsupported-version' || kind === 'action' && id === 'missing-version' ? 'UNSUPPORTED_VERSION' : 'INVALID_REQUEST';
      assert.equal(response.reply.kind, 'observed-operation-error', id); assert.equal(response.reply.code, expected, id);
      assert.equal(response.reply.acceptance, 'no', id); assert.equal(response.reply.acceptanceKind, kind, id);
      if ('code' in response) assert.equal(response.code, 3, id); else assert.equal(response.isError, true, id);
      assert.ok(!JSON.stringify(response.reply).includes('never-echo'), id);
      assert.deepEqual(f.calls(), [], id); assert.equal(f.admission().readAllocationForAction('one'), undefined, id);
      assert.deepEqual(f.admission().readAllocationCapacity(), { heldAllocations: 0, reservedBytes: 0 }, id); assert.deepEqual(await f.database(), pristine, id);
    }
    if (server) await server.close();
  });

  test(`H01.02 ${transport} valid ID/guard/selector/timeout boundaries reach authority without effects`, { timeout: 15000 }, async t => {
    const f = await hostFixture(t); const server = transport === 'mcp' ? await f.mcp() : undefined;
    for (const [id, timeout, length, guards] of [['min', 100, 1, 1], ['min+1', 101, 2, 2], ['max-1', 59999, 79, 11], ['max', 60000, 80, 12]] as const) {
      const request = { ...actionRequest(unknownId), actionId: 'a'.repeat(length), timeoutMs: timeout,
        action: { kind: 'tap', selector: { identifier: 'x'.repeat(id === 'max' ? 500 : 1) } },
        before: { present: Array.from({ length: guards }, () => ({ identifier: 'go' })), absent: [] } };
      const response = server ? await server.call('start_observed_action', request) : await f.cli('observed-action', await f.requestFile(request));
      assert.equal(response.reply.code, 'ALLOCATION_NOT_FOUND', id); assert.deepEqual(f.calls(), []);
    }
    for (const waitMs of [0, 1, 44999, 45000]) {
      const response = server ? await server.call('get_observed_action', { actionId: 'absent', waitMs }) : await f.cli('observed-report', 'absent', { waitMs });
      assert.equal(response.reply.code, 'ACTION_NOT_FOUND');
    }
    for (const absent of [1, 11, 12]) for (const guard of ['before', 'after'] as const) {
      const request = { ...actionRequest(unknownId), [guard]: { present: [{ identifier: 'go' }], absent: Array.from({ length: absent }, () => ({ identifier: 'x' })) } };
      const response = server ? await server.call('start_observed_action', request) : await f.cli('observed-action', await f.requestFile(request));
      assert.equal(response.reply.code, 'ALLOCATION_NOT_FOUND', `${guard} absent${absent}`); assert.deepEqual(f.calls(), []);
    }
    for (const waitMs of [-1, 45001, 0.5]) {
      const response = server ? await server.call('get_observed_action', { actionId: 'absent', waitMs }) : await f.cli('observed-report', 'absent', { waitMs });
      assert.equal(response.reply.code, 'INVALID_REQUEST');
    }
    assert.equal(f.admission().readAllocationCapacity().heldAllocations, 0); if (server) await server.close();
  });
}

function sizedAction(bytes: number) {
  const request: any = actionRequest(unknownId);
  request.before.present = Array.from({ length: 12 }, () => ({ identifier: 'x', label: 'x', value: 'x' }));
  request.after.present = Array.from({ length: 12 }, () => ({ identifier: 'x', label: 'x', value: 'x' }));
  for (const selector of [...request.before.present, ...request.after.present]) for (const name of ['identifier', 'label', 'value']) {
    const remaining = bytes - Buffer.byteLength(JSON.stringify(request)); if (!remaining) return request;
    const unicode = Math.min(499, Math.floor(remaining / 3)); const ascii = Math.min(499 - unicode, remaining - unicode * 3);
    selector[name] += '界'.repeat(unicode) + 'x'.repeat(ascii);
  }
  assert.equal(Buffer.byteLength(JSON.stringify(request)), bytes); return request;
}

for (const transport of ['cli', 'mcp'] as const) for (const [mode, outcome, exit, touches] of [
  ['observed', 'outcome_observed', 0, 1], ['already', 'already_satisfied', 0, 0], ['refused', 'refused', 3, 0],
  ['inconclusive', 'inconclusive', 2, 1], ['unresolved', null, 2, 1],
] as const) test(`H02.01 ${transport} seven public operations and ${mode} envelope are key/network free`, { timeout: 15000 }, async t => {
  const f = await hostFixture(t); const ready = await f.prepare(); const request = actionRequest(ready.allocationId);
  const server = transport === 'mcp' ? await f.mcp({ mode }) : undefined;
  if (server) {
    const tools = await server.rpc('tools/list').result;
    assert.equal(tools.result.tools.filter((tool: any) => tool.name.includes('observed')).length, 7);
  }
  if (server) await server.call('start_observed_action', request);
  const result = server ? await server.call('get_observed_action', { actionId: 'one', waitMs: 5000 }) : await f.cli('observed-action', await f.requestFile(request), { mode });
  assert.equal(result.reply.outcome, outcome); assert.equal(result.reply.authority, outcome === null ? 'unconfirmed' : 'committed');
  if ('code' in result) assert.equal(result.code, exit); else assert.equal(result.isError, undefined);
  assert.equal(f.calls().filter(op => op === 'touch').length, touches); const calls = f.calls();
  const disabled = await f.mcp({ enabled: '0' });
  const toolList = await disabled.rpc('tools/list').result;
  assert.deepEqual(toolList.result.tools.filter((tool: any) => tool.name.includes('observed')).map((tool: any) => tool.name).sort(), ['cancel_observed_action', 'cancel_observed_allocation', 'get_observed_action', 'get_observed_allocation', 'retire_observed_allocation']);
  const read = await disabled.call('get_observed_action', { actionId: 'one' }); assert.equal(read.reply.outcome, outcome);
  for (const [command, tool, argument] of [['observed-report', 'get_observed_action', 'one'], ['observed-cancel', 'cancel_observed_action', 'one'], ['observed-allocation', 'get_observed_allocation', ready.allocationId], ['observed-retire', 'retire_observed_allocation', ready.allocationId], ['observed-allocation-cancel', 'cancel_observed_allocation', ready.allocationId]] as const) {
    const reply = transport === 'cli' ? await f.cli(command, argument, { enabled: '0' }) : await disabled.call(tool, command === 'observed-report' || command === 'observed-cancel' ? { actionId: argument } : { allocationId: argument });
    if (command === 'observed-report' || command === 'observed-cancel') assert.equal(reply.reply.outcome, outcome); else assert.ok(['retained', 'quarantined', 'executing'].includes(reply.reply.state) || reply.reply.code === 'ALLOCATION_BUSY');
  }
  assert.deepEqual(f.calls(), calls); assert.ok(!(await readFile(join(f.root, 'milestones.jsonl'), 'utf8')).includes('forbidden:network'));
  await disabled.close(); if (server) await server.close();
});

for (const transport of ['cli', 'mcp'] as const) test(`H07.03 ${transport} healthy active owner public reads preserve exact database and logical state`, { timeout: 15000 }, async t => {
  const f = await hostFixture(t); const ready = await f.prepare(); const request = actionRequest(ready.allocationId); const gate = 'backend:snapshot-ui:1';
  const owner = f.spawnOwner('cli', 'observed-action', await f.requestFile(request), { gate }); await f.milestone(gate, owner.child.pid);
  const before = f.admission().readAction('one'); const bytes = await f.database(); const calls = f.calls(); const server = transport === 'mcp' ? await f.mcp() : undefined;
  for (let i = 0; i < 3; i++) {
    const read = server ? await server.call('get_observed_action', { actionId: 'one' }) : await f.cli('observed-report', 'one');
    assert.equal(read.reply.state, 'running'); assert.equal(read.reply.authority, 'none'); assert.equal(read.reply.cancellationRequested, false); assert.equal(read.reply.outcome, null);
    if ('code' in read) assert.equal(read.code, 2); else assert.equal(read.isError, undefined);
    assert.deepEqual(f.admission().readAction('one'), before); assert.deepEqual(await f.database(), bytes); assert.deepEqual(f.calls(), calls);
  }
  await f.release(); assert.equal((await owner.exited).code, 0); if (server) await server.close();
});

for (const fault of ['readonly', 'full'] as const) for (const transport of ['cli', 'mcp'] as const) test(`H07.04 ${transport} isolated ${fault} write fault refuses reservation with no alternative root`, async t => {
  const f = await hostFixture(t); const bytes = await f.database(); const files = await readdir(f.store);
  if (fault === 'readonly') await chmod(f.store, 0o500);
  const options = fault === 'full' ? { fault: 'sqlite-full' } : {};
  const server = transport === 'mcp' ? await f.mcp(options) : undefined;
  const result = server ? await server.call('prepare_observed_allocation', f.request('one')) : await f.cli('observed-allocate', await f.requestFile(f.request('one')), options);
  if (fault === 'readonly') await chmod(f.store, 0o700);
  assert.equal(result.reply.code, 'STATE_UNAVAILABLE'); assert.equal(f.admission().readAllocationForAction('one'), undefined);
  assert.deepEqual(await f.database(), bytes); assert.deepEqual(await readdir(f.store), files); assert.deepEqual(deviceCalls(f.calls()), []);
  if (server) await server.close();
});
for (const transport of ['cli', 'mcp'] as const) test(`H01.03 ${transport} original UTF8 65535/65536/65537-byte boundaries`, { timeout: 15000 }, async t => {
  const f = await hostFixture(t); const server = transport === 'mcp' ? await f.mcp() : undefined;
  for (const size of [65535, 65536, 65537]) {
    const request = sizedAction(size); assert.equal(Buffer.byteLength(JSON.stringify(request)), size);
    const response = server ? await server.call('start_observed_action', request) : await f.cli('observed-action', await f.requestFile(request));
    assert.equal(response.reply.code, size > 65536 ? 'INVALID_REQUEST' : 'ALLOCATION_NOT_FOUND'); assert.deepEqual(f.calls(), []);
    assert.equal(f.admission().readAllocationCapacity().heldAllocations, 0);
  }
  if (server) await server.close();
});

for (const transport of ['cli', 'mcp'] as const) {
  test(`H04.01 ${transport} capacity7/8/9 exact bytes include retained and quarantined allocations`, { timeout: 15000 }, async t => {
    const f = await allocatorPublic(t); const server = transport === 'mcp' ? await f.mcp() : undefined;
    const prepare = async (id: string) => server ? server.call('prepare_observed_allocation', f.request(id)) : f.cli('observed-allocate', f.request(id));
    for (let i = 1; i <= 8; i++) {
      if (i === 8) f.setCommandResult('boot', { exitCode: 1, stdout: '', stderr: 'ignored-raw-vendor' });
      const value = (await prepare('allocation-' + i)).reply; assert.equal(value.reservation.capacityHeld, true);
      if (i <= 7) assert.equal(value.state, 'ready'); else assert.equal(value.state, 'quarantined');
      if (i === 1) {
        const retired = server ? await server.call('retire_observed_allocation', { allocationId: value.allocationId }) : await f.cli('observed-retire', value.allocationId);
        assert.equal(retired.reply.outcome, 'retired_unused');
      }
      assert.deepEqual(f.admission.readAllocationCapacity(), { heldAllocations: i, reservedBytes: i * 1000 });
    }
    const calls = deviceCalls(f.calls); const ninth = (await prepare('allocation-9')).reply;
    assert.equal(ninth.code, 'BUDGET_EXHAUSTED'); assert.deepEqual(deviceCalls(f.calls), calls); assert.equal(f.admission.readAllocationForAction('allocation-9'), undefined);
    assert.deepEqual(f.admission.readAllocationCapacity(), { heldAllocations: 8, reservedBytes: 8000 });
    f.configure({ maxRetainedAllocations: 9, reservationBytesPerAllocation: 500, maxReservedBytes: 8000 });
    const lowerEstimate = (await prepare('allocation-lower-estimate')).reply; assert.equal(lowerEstimate.code, 'BUDGET_EXHAUSTED');
    assert.deepEqual(deviceCalls(f.calls), calls); assert.deepEqual(f.admission.readAllocationCapacity(), { heldAllocations: 8, reservedBytes: 8000 });
    if (server) await server.close();
  });

  for (const receipt of ['malformed', 'lost', 'protected', 'collision'] as const) test(`H04.02 ${transport} ${receipt} create receipt blocks legacy/supplied/ready successors`, { timeout: 15000 }, async t => {
    const f = await allocatorPublic(t); const server = transport === 'mcp' ? await f.mcp() : undefined;
    const call = async (cli: string, tool: string, input: object | string) => server ? server.call(tool, typeof input === 'string' ? { allocationId: input } : input) : f.cli(cli, input);
    const ready = (await call('observed-allocate', 'prepare_observed_allocation', f.request('ready'))).reply; assert.equal(ready.state, 'ready');
    f.setCreateResult({ exitCode: receipt === 'lost' ? null : 0, stderr: '', stdout: receipt === 'protected' ? '73997430-DB8A-48C8-8146-12320CE6AEFE\n' : receipt === 'collision' ? fixtureDevice + '\n' : 'not-a-uuid\n' });
    const failed = (await call('observed-allocate', 'prepare_observed_allocation', f.request('unknown'))).reply;
    assert.equal(failed.state, 'quarantined'); assert.equal(failed.reason, 'CREATE_UNCONFIRMED'); assert.equal(failed.hostCreationBlocked, true);
    assert.equal(deviceCalls(f.calls).filter(op => op === 'create').length, 2);
    const calls = deviceCalls(f.calls);
    assert.deepEqual(f.admission.acquire({ device: unknownId, attempt: { kind: 'legacy', id: 'legacy' }, digest: 'legacy', intent: {} }), { kind: 'refused', reason: 'HOST_CREATION_UNRESOLVED', blockingAllocationId: failed.allocationId });
    const legacy = new MobileBuildMcpDriver({ cwd: f.root, admission: f.admission, lockRoot: join(f.root, 'legacy-locks'), stopAppOnClose: false, fakeBackend: { runner: f.runner, window: undefined } });
    await assert.rejects(legacy.prepare({ app: { bundleId: 'org.example.fixture' }, device: { udid: unknownId } }, new AbortController().signal), /HOST_CREATION_UNRESOLVED/);
    f.configure({ inventory: f.inventory(unknownId) });
    const supplied = (await call('observed-allocate', 'prepare_observed_allocation', { ...f.request('supplied'), source: { kind: 'supplied', inventoryId: 'stock-one' } })).reply;
    assert.equal(supplied.code, 'HOST_CREATION_UNRESOLVED');
    const readyAction = (await call('observed-action', 'start_observed_action', actionRequest(ready.allocationId, 'ready'))).reply;
    assert.equal(readyAction.code, 'HOST_CREATION_UNRESOLVED'); assert.equal(f.admission.readAllocation(ready.allocationId)!.actionDigest, null);
    assert.deepEqual(deviceCalls(f.calls), calls); assert.equal(f.admission.readAllocationForAction('supplied'), undefined);
    if (server) await server.close();
  });
}

for (const volume of ['simulator', 'staging'] as const) for (const [name, offset] of [['below', -1], ['at', 0], ['above', 1]] as const) for (const transport of ['cli', 'mcp'] as const) test(`H04.03 ${transport} storage ${volume} boundary ${name} respects exact held and artifact bytes`, async t => {
  const f = await allocatorPublic(t); const artifactBytes = (await readFile(join(f.app, 'Fixture'))).length + (await readFile(join(f.app, 'Info.plist'))).length;
  f.setStorage(volume === 'simulator' ? 3000 + offset : 100000, volume === 'staging' ? 3000 + artifactBytes + offset : 100000);
  const server = transport === 'mcp' ? await f.mcp() : undefined;
  const result = server ? await server.call('prepare_observed_allocation', f.request()) : await f.cli('observed-allocate', f.request());
  if (offset < 0) { assert.equal(result.reply.code, 'STORAGE_UNAVAILABLE'); assert.equal(result.reply.acceptance, 'no'); assert.equal(f.admission.readAllocationForAction('allocate-one'), undefined); assert.deepEqual(deviceCalls(f.calls), []); assert.deepEqual(f.admission.readAllocationCapacity(), { heldAllocations: 0, reservedBytes: 0 }); }
  else { assert.equal(result.reply.state, 'ready'); assert.equal(result.reply.outcome, 'prepared'); assert.equal(result.reply.authority, 'committed'); assert.equal(f.admission.readAllocation(result.reply.allocationId)!.artifactBytes, artifactBytes); assert.deepEqual(f.admission.readAllocationCapacity(), { heldAllocations: 1, reservedBytes: 1000 }); assert.deepEqual(deviceCalls(f.calls), ['create', 'boot', 'list', 'install', 'launch-app', 'list', 'snapshot-ui', 'screenshot']); }
  if (server) await server.close();
});

for (const stage of ['pre-create', 'pre-install'] as const) for (const volume of ['simulator', 'staging'] as const) for (const transport of ['cli', 'mcp'] as const) test(`H04.07 ${transport} ${volume} storage depletion ${stage} fences the next dispatch`, async t => {
  const f = await allocatorPublic(t); const artifactBytes = (await readFile(join(f.app, 'Fixture'))).length + (await readFile(join(f.app, 'Info.plist'))).length; let appPlists = 0;
  f.setBefore(async (operation, path) => {
    if (operation === 'plist' && path?.endsWith('.app/Info.plist')) appPlists++;
    if (stage === 'pre-create' && operation === 'plist' && appPlists === 2 || stage === 'pre-install' && operation === 'boot') f.setStorage(volume === 'simulator' ? 2999 : 100000, volume === 'staging' ? 2999 + artifactBytes : 100000);
  });
  const server = transport === 'mcp' ? await f.mcp() : undefined;
  const result = server ? await server.call('prepare_observed_allocation', f.request()) : await f.cli('observed-allocate', f.request());
  assert.equal(result.reply.reason, 'STORAGE_UNAVAILABLE'); assert.equal(result.reply.state, 'retained'); assert.equal(result.reply.outcome, 'refused'); assert.equal(result.reply.authority, 'committed'); assert.equal(result.reply.hostCreationBlocked, false);
  assert.deepEqual(result.reply.reservation, { bytes: 1000, capacityHeld: stage === 'pre-install' });
  const record = f.admission.readAllocation(result.reply.allocationId)!; assert.equal(record.reason, 'STORAGE_UNAVAILABLE'); assert.equal(record.actionDigest, null); assert.equal(record.artifactBytes, artifactBytes);
  assert.deepEqual(f.admission.readAllocationCapacity(), { heldAllocations: stage === 'pre-install' ? 1 : 0, reservedBytes: stage === 'pre-install' ? 1000 : 0 });
  assert.deepEqual(deviceCalls(f.calls), stage === 'pre-install' ? ['create', 'boot', 'list'] : []);
  if (server) await server.close();
});

for (const failure of ['symlink', 'source-mutation', 'staged-mutation', 'oversize', 'runtime'] as const) for (const transport of ['cli', 'mcp'] as const) test(`H04.04 ${transport} artifact/runtime ${failure} refuses before install without rebuild`, async t => {
  const f = await allocatorPublic(t);
  if (failure === 'symlink') { await rm(join(f.app, 'Fixture')); await symlink('/bin/echo', join(f.app, 'Fixture')); }
  if (failure === 'oversize') f.configure({ maxArtifactBytes: 1 });
  if (failure === 'runtime') f.write(runtimeProfilePath, { platformIdentifier: 'com.apple.platform.macosx', supportedArchs: ['arm64'] });
  if (failure === 'source-mutation') {
    let seen = 0; f.setBefore(async (operation, path) => { if (operation === 'plist' && path?.endsWith('.app/Info.plist') && ++seen === 2) await writeFile(join(f.app, 'Fixture'), 'changed'); });
  }
  if (failure === 'staged-mutation') f.setBefore(async operation => { if (operation === 'boot') {
    const record = f.admission.readAllocationForAction('allocate-one')!;
    await chmod(record.staged!.stagedPath, 0o700); await chmod(join(record.staged!.stagedPath, 'Fixture'), 0o600); await writeFile(join(record.staged!.stagedPath, 'Fixture'), 'changed');
  } });
  const server = transport === 'mcp' ? await f.mcp() : undefined;
  const response = server ? await server.call('prepare_observed_allocation', f.request()) : await f.cli('observed-allocate', f.request()); assert.notEqual(response.reply.outcome, 'prepared');
  if (failure === 'source-mutation' || failure === 'staged-mutation') {
    assert.equal(response.reply.reason, 'ARTIFACT_INVALID'); assert.equal(response.reply.state, 'retained'); assert.equal(response.reply.outcome, 'refused'); assert.equal(response.reply.authority, 'committed'); assert.equal(response.reply.hostCreationBlocked, false);
    assert.deepEqual(response.reply.reservation, { bytes: 1000, capacityHeld: failure === 'staged-mutation' });
    const record = f.admission.readAllocation(response.reply.allocationId)!; assert.equal(record.reason, 'ARTIFACT_INVALID'); assert.equal(record.actionDigest, null);
    assert.deepEqual(f.admission.readAllocationCapacity(), { heldAllocations: failure === 'staged-mutation' ? 1 : 0, reservedBytes: failure === 'staged-mutation' ? 1000 : 0 });
  } else {
    assert.equal(response.reply.code, failure === 'runtime' ? 'HOST_PREREQUISITE_MISSING' : 'ARTIFACT_INVALID'); assert.equal(response.reply.acceptance, 'no'); assert.equal(f.admission.readAllocationForAction('allocate-one'), undefined);
    assert.deepEqual(f.admission.readAllocationCapacity(), { heldAllocations: 0, reservedBytes: 0 });
  }
  assert.deepEqual(deviceCalls(f.calls), failure === 'staged-mutation' ? ['create', 'boot', 'list'] : []);
  assert.equal(deviceCalls(f.calls).filter(op => op === 'install').length, 0); assert.equal(deviceCalls(f.calls).filter(op => op === 'touch').length, 0);
  assert.ok(deviceCalls(f.calls).filter(op => op === 'create').length <= 1);
  if (server) await server.close();
});

for (const fault of ['missing', 'corrupt', 'unknown-schema'] as const) for (const transport of ['cli', 'mcp'] as const) test(`H07.01 ${transport} real isolated ${fault} store fails closed without alternate root`, async t => {
  const f = await hostFixture(t); const path = join(f.store, 'admission.sqlite');
  if (fault === 'missing') await rm(path);
  if (fault === 'corrupt') await writeFile(path, 'not a sqlite database', { mode: 0o600 });
  if (fault === 'unknown-schema') { const db = new DatabaseSync(path); try { db.exec('UPDATE metadata SET schema_version=999'); } finally { db.close(); } }
  const files = await readdir(f.store); const before = fault === 'missing' ? null : await readFile(path);
  const server = transport === 'mcp' ? await f.mcp({ enabled: '0' }) : undefined;
  const value = server ? (await server.call('get_observed_action', { actionId: 'one' })).reply : (await f.cli('observed-report', 'one', { enabled: '0' })).reply;
  assert.equal(value.code, 'STORE_UNAVAILABLE'); assert.deepEqual(f.calls(), []); assert.deepEqual(await readdir(f.store), files);
  if (before) assert.deepEqual(await readFile(path), before); if (server) await server.close();
});

for (const fault of ['provisional', 'terminal'] as const) for (const transport of ['cli', 'mcp'] as const) test(`H07.02 ${transport} evidence ${fault} failure respects authoritative commit`, async t => {
  const f = await hostFixture(t); const ready = await f.prepare(); const request = actionRequest(ready.allocationId);
  const server = transport === 'mcp' ? await f.mcp({ fault }) : undefined;
  if (server) await server.call('start_observed_action', request);
  const result = server ? await server.call('get_observed_action', { actionId: 'one', waitMs: 5000 }) : await f.cli('observed-action', await f.requestFile(request), { fault });
  assert.equal(result.reply.authority, 'committed'); assert.equal(result.reply.outcome, fault === 'terminal' ? 'outcome_observed' : 'inconclusive');
  assert.equal(result.reply.admission, fault === 'terminal' ? 'available' : 'quarantined');
  if (fault === 'terminal') { assert.equal(result.reply.evidence.exportStatus, 'failed'); assert.equal(result.reply.evidence.terminal, null); }
  assert.equal(f.calls().filter(op => op === 'touch').length, 1); const calls = f.calls();
  const read = await f.cli('observed-report', 'one', { enabled: '0' }); assert.equal(read.reply.outcome, result.reply.outcome); assert.deepEqual(f.calls(), calls);
  if (server) await server.close();
});

const declaration: MigrationDeclaration = { version: 1, writersStopped: true, historicalRootsDeclaredOrExcluded: true, additionalJournalRoots: [], additionalLeaseRoots: [], excludedDevices: [] };
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
async function tree(path: string): Promise<unknown> {
  const entries = await readdir(path, { withFileTypes: true }); const values = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) values.push([entry.name, entry.isDirectory() ? await tree(join(path, entry.name)) : (await readFile(join(path, entry.name))).toString('hex')]);
  return values;
}
for (const state of ['completed', 'unfinished', 'quarantine', 'malformed', 'dead', 'live'] as const) test(`H08.01 isolated ${state} historical migration preserves sources and conservative public authority`, async t => {
  const f = await hostFixture(t); const root = join(f.root, 'migration-store'); const journal = join(f.root, 'history'); const leases = join(f.root, 'leases');
  await mkdir(journal, { mode: 0o700 }); await mkdir(leases, { mode: 0o700 });
  const directory = join(journal, digest(fixtureDevice.toLowerCase())); await mkdir(directory, { mode: 0o700 });
  const old = { deviceId: fixtureDevice.toLowerCase(), actionId: 'old', intent: { tap: 'old' } };
  await writeFile(join(directory, digest('old') + '.intent.json'), JSON.stringify({ ...old, status: 'in-flight' }), { mode: 0o600 });
  if (state !== 'unfinished') await writeFile(join(directory, digest('old') + '.result.json'), JSON.stringify({ ...old, status: 'completed', result: { status: 'outcome_observed', actionAttempted: true, actionAcknowledged: true, observations: 2 } }), { mode: 0o600 });
  if (state === 'quarantine') {
    const alias = join(journal, digest(fixtureDevice)); await mkdir(alias, { mode: 0o700 });
    await writeFile(join(alias, 'quarantine.json'), JSON.stringify({ deviceId: fixtureDevice, reason: 'old' }), { mode: 0o600 });
  }
  if (['malformed', 'dead', 'live'].includes(state)) await writeFile(join(leases, fixtureDevice + '.lock'), state === 'malformed' ? '{partial' : JSON.stringify({ deviceId: fixtureDevice, pid: state === 'live' ? process.pid : 2147483647, token: 'old', createdAt: '2026-10-08T00:00:00Z' }), { mode: 0o600 });
  const before = [await tree(journal), await tree(leases)]; const options = { root, backend: 'fake' as const, defaultRoots: { journal, leases } };
  if (state === 'live') { assert.throws(() => migrateAdmissionForTesting(declaration, options), { code: 'STATE_UNAVAILABLE' }); }
  else {
    migrateAdmissionForTesting(declaration, options);
    const admission = Admission.forTesting({ root, backend: 'fake', initialize: false }); const imported = admission.readImportedAction('old')!;
    assert.equal(imported.readOnly, true); assert.equal(imported.device, fixtureDevice);
    assert.equal(admission.inspect(fixtureDevice)!.state, state === 'completed' ? 'available' : 'quarantined');
    const context = JSON.parse(await readFile(join(f.root, 'fixture.json'), 'utf8')); await writeFile(join(f.root, 'fixture.json'), JSON.stringify({ ...context, store: root }));
    {
      for (const transport of ['cli', 'mcp'] as const) {
        const server = transport === 'mcp' ? await f.mcp({ enabled: '0' }) : undefined;
        const read = server ? await server.call('get_observed_allocation', { allocationId: imported.allocationId.toLowerCase() }) : await f.cli('observed-allocation', imported.allocationId.toLowerCase(), { enabled: '0' });
        assert.equal(read.reply.readOnly, true); assert.equal(read.reply.historicalOutcome, state === 'completed' ? 'outcome_observed' : 'inconclusive');
        if (server) await server.close();
        const bytes = await readFile(join(root, 'admission.sqlite')); const calls = f.calls();
        const active = transport === 'mcp' ? await f.mcp() : undefined;
        const retired = active ? await active.call('retire_observed_allocation', { allocationId: imported.allocationId }) : await f.cli('observed-retire', imported.allocationId);
        assert.equal(retired.reply.readOnly, true); assert.deepEqual(await readFile(join(root, 'admission.sqlite')), bytes);
        const start = active ? await active.call('start_observed_action', actionRequest(imported.allocationId, 'old')) : await f.cli('observed-action', await f.requestFile(actionRequest(imported.allocationId, 'old')));
        assert.equal(start.reply.code, 'ACTION_ID_CONFLICT');
        const prepare = active ? await active.call('prepare_observed_allocation', f.request('old')) : await f.cli('observed-allocate', await f.requestFile(f.request('old')));
        assert.equal(prepare.reply.code, 'ACTION_ID_CONFLICT');
        assert.deepEqual(await readFile(join(root, 'admission.sqlite')), bytes); assert.deepEqual(f.calls(), calls);
        if (active) await active.close();
      }
    }
    assert.deepEqual(deviceCalls(f.calls()), []);
  }
  assert.deepEqual([await tree(journal), await tree(leases)], before);
});

test('H08.02 declaration/quiescence omissions refuse activation; experimental raw device cannot bypass admission', async t => {
  const f = await hostFixture(t); const options = { root: join(f.root, 'never-initialize'), backend: 'fake' as const, defaultRoots: { journal: join(f.root, 'history'), leases: join(f.root, 'leases') } };
  for (const raw of [{}, { ...declaration, writersStopped: false }, { ...declaration, historicalRootsDeclaredOrExcluded: false }]) assert.throws(() => migrateAdmissionForTesting(raw as MigrationDeclaration, options), { code: 'INVALID_REQUEST' });
  await assert.rejects(runObservedExperiment({ experimental: 'observed-tap-v1', actionId: 'raw', deviceId: fixtureDevice, app: { bundleId: 'org.example.fixture' }, selector: { identifier: 'go' }, before: { present: [{ identifier: 'go' }] }, after: { present: [{ identifier: 'done' }] }, timeoutMs: 5000 }, join(f.root, 'raw-evidence'), { cwd: f.root }), { code: 'MIGRATION_REQUIRED' });
  assert.deepEqual(f.calls(), []); assert.equal(f.admission().readAllocationCapacity().heldAllocations, 0);
});

for (const ordering of ['legacy-first', 'observed-first'] as const) for (const transport of ['cli', 'mcp'] as const) test(`H03.04 ${transport} ${ordering} canonical supplied admission excludes the successor`, async t => {
  const f = await allocatorPublic(t); f.configure({ inventory: f.inventory(fixtureDevice.toLowerCase()) });
  const legacy = () => f.admission.acquire({ device: fixtureDevice.toLowerCase(), attempt: { kind: 'legacy', id: 'legacy' }, digest: 'legacy', intent: {} });
  const driver = new MobileBuildMcpDriver({ cwd: f.root, admission: f.admission, lockRoot: join(f.root, 'legacy-locks'), stopAppOnClose: false, fakeBackend: { runner: f.runner, window: undefined } });
  const context = { app: { bundleId: 'org.example.fixture' }, device: { udid: fixtureDevice.toLowerCase() }, values: {} };
  if (ordering === 'legacy-first') await driver.prepare(context, new AbortController().signal);
  const before = deviceCalls(f.calls);
  const request = { ...f.request(), source: { kind: 'supplied', inventoryId: 'stock-one' } };
  const server = transport === 'mcp' ? await f.mcp() : undefined;
  const observed = server ? await server.call('prepare_observed_allocation', request) : await f.cli('observed-allocate', request);
  if (ordering === 'legacy-first') { assert.equal(observed.reply.code, 'INVENTORY_INELIGIBLE'); assert.deepEqual(deviceCalls(f.calls), before); assert.equal(f.admission.readAllocationForAction(request.actionId), undefined); }
  else {
    assert.equal(observed.reply.state, 'ready'); const record = f.admission.readAllocation(observed.reply.allocationId)!; const preparedCalls = deviceCalls(f.calls);
    assert.deepEqual(legacy(), { kind: 'refused', reason: 'DEVICE_QUARANTINED' }); assert.equal(f.calls.filter(op => op === 'create').length, 0);
    await assert.rejects(driver.prepare(context, new AbortController().signal), { code: 'DEVICE_BUSY' });
    assert.deepEqual(f.admission.readAllocation(observed.reply.allocationId), record); assert.deepEqual(deviceCalls(f.calls), preparedCalls);
  }
  await driver.close(new AbortController().signal);
  if (server) await server.close();
});

for (const offset of [-1, 0, 1]) for (const transport of ['cli', 'mcp'] as const) test(`H05.04 ${transport} action start at ready expiry offset ${offset} is transactional`, async t => {
  let now = Date.now(); const f = await allocatorPublic(t, { now: () => now });
  const ready = (await f.cli('observed-allocate', f.request('one'))).reply; const record = f.admission.readAllocation(ready.allocationId)!; const calls = [...f.calls];
  now = record.expiresAt! + offset;
  const server = transport === 'mcp' ? await f.mcp() : undefined;
  let result = server ? await server.call('start_observed_action', actionRequest(ready.allocationId)) : await f.cli('observed-action', actionRequest(ready.allocationId));
  if (server && offset < 0) result = await server.call('get_observed_action', { actionId: 'one', waitMs: 5000 });
  if (offset >= 0) { assert.equal(result.reply.code, 'ALLOCATION_NOT_READY'); assert.equal(f.admission.readAllocation(ready.allocationId)!.reason, 'READY_EXPIRED'); assert.equal(f.admission.readAllocation(ready.allocationId)!.actionDigest, null); assert.equal(f.admission.readAllocation(ready.allocationId)!.outcome, 'retired_unused'); }
  else { assert.equal(result.reply.outcome, 'inconclusive'); assert.notEqual(f.admission.readAllocation(ready.allocationId)!.actionDigest, null); }
  assert.deepEqual(f.calls, calls); assert.deepEqual(f.admission.readAllocationCapacity(), { heldAllocations: 1, reservedBytes: 1000 });
  if (server) await server.close();
});

for (const transport of ['cli', 'mcp'] as const) test(`H01.04 ${transport} valid preparation timeout/build/path boundaries and no-reservation failures`, { timeout: 15000 }, async t => {
  const f = await allocatorPublic(t); const server = transport === 'mcp' ? await f.mcp() : undefined;
  const call = async (request: object) => server ? server.call('prepare_observed_allocation', request) : f.cli('observed-allocate', request);
  for (const timeoutMs of [1000, 1001, 899999, 900000]) {
    const request = { ...f.request('t' + timeoutMs), timeoutMs, app: { ...f.request().app, build: { id: 'x'.repeat(500), origin: 'x'.repeat(500) } } };
    assert.equal(parsePrepareAllocation(request).timeoutMs, timeoutMs);
    const result = await call(request);
    // A valid 1000ms request may exhaust its real preparation deadline under
    // host load. Acceptance of the schema does not promise preparation success.
    assert.notEqual(result.reply.code, 'INVALID_REQUEST'); assert.notEqual(result.reply.code, 'UNSUPPORTED_VERSION');
    const record = f.admission.readAllocationForAction('t' + timeoutMs); if (record) assert.equal((record.preparation as { timeoutMs: number }).timeoutMs, timeoutMs);
  }
  for (const length of [1, 2, 4095, 4096]) {
    const actionId = 'path' + length;
    const result = await call({ ...f.request(actionId), app: { ...f.request().app, artifactPath: '/' + 'x'.repeat(length - 1) } });
    assert.equal(result.reply.code, 'ARTIFACT_INVALID'); assert.equal(f.admission.readAllocationForAction(actionId), undefined);
  }
  if (server) await server.close();
});

for (const transport of ['cli', 'mcp'] as const) test(`H04.05 ${transport} all protected supplied UUIDs and unattested inventory refuse without reservation`, async t => {
  const f = await allocatorPublic(t); const server = transport === 'mcp' ? await f.mcp() : undefined;
  const call = async (request: object) => server ? server.call('prepare_observed_allocation', request) : f.cli('observed-allocate', request);
  for (const device of ['73997430-DB8A-48C8-8146-12320CE6AEFE', '2FE383F2-2D0F-4286-8797-D3ACEFCD6220', '6A8C5F93-F59A-456B-B157-10642209B734', '0E42FDE2-5E09-42D3-9876-9EF0037FCBE7']) {
    f.configure({ inventory: f.inventory(device.toLowerCase()) });
    const result = await call({ ...f.request('protected'), source: { kind: 'supplied', inventoryId: 'stock-one' } });
    assert.equal(result.reply.code, 'INVENTORY_INELIGIBLE'); assert.equal(f.admission.readAllocationForAction('protected'), undefined); assert.deepEqual(deviceCalls(f.calls), []);
  }
  f.configure({ inventory: f.inventory().map(entry => ({ ...entry, attestation: { exclusive: false, freshUnused: true } })) });
  const result = await call({ ...f.request('unattested'), source: { kind: 'supplied', inventoryId: 'stock-one' } });
  assert.equal(result.reply.code, 'CONFIG_INVALID'); assert.equal(f.admission.readAllocationForAction('unattested'), undefined); assert.deepEqual(deviceCalls(f.calls), []);
  if (server) await server.close();
});

for (const offset of [-1, 0, 1]) for (const transport of ['cli', 'mcp'] as const) test(`H04.06 ${transport} artifact byte boundary offset ${offset} is measured from supplied bytes`, async t => {
  const f = await allocatorPublic(t);
  const bytes = (await readFile(join(f.app, 'Fixture'))).length + (await readFile(join(f.app, 'Info.plist'))).length;
  f.configure({ maxArtifactBytes: bytes + offset }); const server = transport === 'mcp' ? await f.mcp() : undefined;
  const result = server ? await server.call('prepare_observed_allocation', f.request()) : await f.cli('observed-allocate', f.request());
  if (offset < 0) { assert.equal(result.reply.code, 'ARTIFACT_INVALID'); assert.equal(f.admission.readAllocationForAction('allocate-one'), undefined); assert.deepEqual(deviceCalls(f.calls), []); }
  else { assert.equal(result.reply.outcome, 'prepared'); assert.equal(f.admission.readAllocation(result.reply.allocationId)!.artifactBytes, bytes); }
  if (server) await server.close();
});

for (const phase of ['configuration', 'host-proof', 'artifact-inspection', 'artifact-staging'] as const) test(`H05.09 MCP close during ${phase} fences ignored-abort preparation`, { timeout: 15000 }, async t => {
  const f = await allocatorPublic(t); let reached!: () => void; let release!: () => void;
  const barrier = new Promise<void>(done => { reached = done; }); const pending = new Promise<void>(done => { release = done; });
  if (phase === 'configuration') {
    const original = f.host.fs.lstat;
    f.host.fs.lstat = (async (...args: Parameters<typeof original>) => { if (String(args[0]) === f.configPath) { reached(); await pending; } return original(...args); }) as typeof original;
  } else {
    let appPlists = 0; let first = true;
    f.setBefore(async (operation, path) => {
      const isApp = operation === 'plist' && path?.endsWith('.app/Info.plist'); if (isApp) appPlists++;
      if ((phase === 'host-proof' && operation === 'plist' && first) || (phase === 'artifact-inspection' && isApp && appPlists === 1) || (phase === 'artifact-staging' && isApp && appPlists === 2)) { first = false; reached(); await pending; }
    });
  }
  const server = await f.mcp(); const preparing = server.call('prepare_observed_allocation', f.request()); await barrier;
  const closing = server.close(); const result = await preparing;
  assert.notEqual(result.reply.outcome, 'prepared'); assert.deepEqual(deviceCalls(f.calls), []);
  const record = f.admission.readAllocationForAction('allocate-one');
  if (phase === 'artifact-staging') { assert.ok(record); assert.equal(record.cancellationRequested, true); assert.equal(record.capacityHeld, false); }
  else assert.equal(record, undefined);
  release(); await closing;
  assert.deepEqual(deviceCalls(f.calls), []); assert.equal(f.admission.readAllocationForAction('allocate-one')?.outcome === 'prepared', false);
});

test('H03.05 preparation duplicate/conflict and changed runs root preserve immutable original evidence', async t => {
  const f = await hostFixture(t); const ready = await f.prepare(); const bytes = await f.database(); const calls = f.calls();
  const contextPath = join(f.root, 'fixture.json'); const context = JSON.parse(await readFile(contextPath, 'utf8'));
  await writeFile(contextPath, JSON.stringify({ ...context, runsDir: join(f.root, 'alternate-runs') }));
  const server = await f.mcp();
  for (const transport of ['cli', 'mcp'] as const) {
    const duplicate = transport === 'mcp' ? await server.call('prepare_observed_allocation', f.request('one')) : await f.cli('observed-allocate', await f.requestFile(f.request('one'))); assert.deepEqual(duplicate.reply, ready);
    const conflicting = { ...f.request('one'), timeoutMs: 1000 };
    const conflict = transport === 'mcp' ? await server.call('prepare_observed_allocation', conflicting) : await f.cli('observed-allocate', await f.requestFile(conflicting));
    assert.equal(conflict.reply.code, 'ACTION_ID_CONFLICT'); if ('isError' in conflict) assert.equal(conflict.isError, true); else assert.equal(conflict.code, 3);
  }
  assert.deepEqual(await f.database(), bytes); assert.deepEqual(f.calls(), calls); await server.close();
});

test('H08.03 historical lexical aliases consolidate clean completion and explicitly missing roots refuse', async t => {
  const f = await hostFixture(t); const journal = join(f.root, 'historical'); const leases = join(f.root, 'old-leases'); await mkdir(journal, { mode: 0o700 });
  for (const deviceId of [fixtureDevice, fixtureDevice.toLowerCase()]) {
    const directory = join(journal, digest(deviceId)); await mkdir(directory, { mode: 0o700 });
    const record = { deviceId, actionId: 'alias', intent: {} };
    await writeFile(join(directory, digest('alias') + '.intent.json'), JSON.stringify({ ...record, status: 'in-flight' }), { mode: 0o600 });
    await writeFile(join(directory, digest('alias') + '.result.json'), JSON.stringify({ ...record, status: 'completed', result: { status: 'outcome_observed', actionAttempted: true, actionAcknowledged: true, observations: 2 } }), { mode: 0o600 });
  }
  const before = await tree(journal); const root = join(f.root, 'aliased-migration');
  const receipt = migrateAdmissionForTesting({ ...declaration, additionalJournalRoots: [journal + '/.'] }, { root, backend: 'fake', defaultRoots: { journal, leases } });
  assert.equal(receipt.importedActions, 1); assert.equal(receipt.sources.filter(source => source.kind === 'journal').length, 1);
  const imported = Admission.forTesting({ root, backend: 'fake', initialize: false }).readImportedAction('alias')!; assert.equal(imported.records.length, 4); assert.equal(imported.outcome, 'outcome_observed');
  assert.deepEqual(await tree(journal), before);
  assert.throws(() => migrateAdmissionForTesting({ ...declaration, additionalJournalRoots: [join(f.root, 'missing-history')] }, { root: join(f.root, 'missing-root-migration'), backend: 'fake', defaultRoots: { journal, leases } }), { code: 'STATE_UNAVAILABLE' });
  assert.deepEqual(await tree(journal), before);
});

test('H01.05 CLI allocation raw-file 65535/65536/65537 byte boundaries retain the original reservation', async t => {
  const f = await hostFixture(t); const raw = JSON.stringify(f.request('one'));
  for (const length of [65535, 65536, 65537]) {
    const path = join(f.root, 'size.json'); await writeFile(path, raw + ' '.repeat(length - Buffer.byteLength(raw))); assert.equal((await readFile(path)).length, length);
    const before = f.calls(); const result = await f.cli('observed-allocate', path);
    if (length <= 65536) assert.equal(result.reply.outcome, 'prepared'); else { assert.equal(result.reply.code, 'INVALID_REQUEST'); assert.deepEqual(f.calls(), before); }
    assert.equal(f.admission().readAllocationCapacity().heldAllocations, 1);
  }
  for (const op of ['create', 'boot', 'install', 'launch-app']) assert.equal(f.calls().filter(value => value === op).length, 1);
});

for (const transport of ['cli', 'mcp'] as const) test(`H02.02 ${transport} exact enable flag retains parked reads/cancel/retire with no new effects`, async t => {
  const f = await hostFixture(t); const allocation = await f.prepare(); const calls = f.calls();
  for (const enabled of ['0', 'true', 'yes', '']) {
    if (transport === 'cli') { const denied = await f.cli('observed-action', '/never/read/this', { enabled }); assert.equal(denied.reply.code, 'OBSERVED_DISABLED'); assert.equal(denied.code, 3); }
    else {
      const disabled = await f.mcp({ enabled }); const bytes = await f.database();
      const tools = await disabled.rpc('tools/list').result;
      assert.deepEqual(tools.result.tools.filter((tool: any) => tool.name.includes('observed')).map((tool: any) => tool.name).sort(), ['cancel_observed_action', 'cancel_observed_allocation', 'get_observed_action', 'get_observed_allocation', 'retire_observed_allocation']);
      for (const name of ['start_observed_action', 'prepare_observed_allocation']) {
        const denied = await disabled.rpc('tools/call', { name, arguments: {} }).result; assert.equal(denied.error.code, -32602); assert.equal(denied.error.message, `Tool ${name} not found`); assert.equal(denied.result, undefined);
      }
      assert.deepEqual(await f.database(), bytes); assert.deepEqual(f.calls(), calls); await disabled.close();
    }
  }
  const server = transport === 'mcp' ? await f.mcp({ enabled: '0' }) : undefined;
  const read = server ? await server.call('get_observed_allocation', { allocationId: allocation.allocationId }) : await f.cli('observed-allocation', allocation.allocationId, { enabled: '0' });
  assert.equal(read.reply.state, 'ready');
  const cancelled = server ? await server.call('cancel_observed_allocation', { allocationId: allocation.allocationId }) : await f.cli('observed-allocation-cancel', allocation.allocationId, { enabled: '0' });
  assert.equal(cancelled.reply.outcome, 'retired_unused'); assert.equal(cancelled.reply.cancellationRequested, true); assert.equal(cancelled.reply.reservation.capacityHeld, true);
  const retired = server ? await server.call('retire_observed_allocation', { allocationId: allocation.allocationId }) : await f.cli('observed-retire', allocation.allocationId, { enabled: '0' });
  assert.deepEqual(retired.reply, cancelled.reply); assert.deepEqual(f.calls(), calls); if (server) await server.close();
});

for (const transport of ['cli', 'mcp'] as const) test(`H02.03 ${transport} acknowledged preparation refusal has committed error-free snapshot semantics`, async t => {
  const f = await allocatorPublic(t); f.setCommandResult('boot', { exitCode: 1, stderr: 'never-echo-vendor', stdout: JSON.stringify({ schema: 'mobilebuildmcp.output.simulator-action-result', schemaVersion: '2', didError: true, error: { code: 'VENDOR_PRIVATE', message: 'never-echo-vendor' }, data: { artifacts: { simulatorId: fixtureDevice } } }) });
  const server = transport === 'mcp' ? await f.mcp() : undefined;
  const result = server ? await server.call('prepare_observed_allocation', f.request()) : await f.cli('observed-allocate', f.request());
  assert.equal(result.reply.outcome, 'refused'); assert.equal(result.reply.authority, 'committed'); assert.equal(result.reply.reason, 'BOOT_FAILED');
  if ('code' in result) assert.equal(result.code, 3); else assert.equal(result.isError, undefined);
  assert.ok(!JSON.stringify(result.reply).includes('never-echo-vendor')); assert.equal(f.calls.filter(op => op === 'boot').length, 1); assert.equal(f.calls.filter(op => op === 'install').length, 0);
  if (server) await server.close();
});
