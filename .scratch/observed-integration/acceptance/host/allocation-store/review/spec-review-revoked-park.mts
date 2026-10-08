import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Admission } from '../../../../../src/device/admission.ts';
const uuid = 'ABCDEF00-0000-4000-8000-000000000001';
const digest = 'a'.repeat(64);
function input(actionId = 'one'): AllocationReservationInput {
  return { actionId, preparationDigest: digest, preparation: { version: 1, actionId }, appBundleId: 'dev.fixture',
    source: { kind: 'create', deviceTypeId: 'com.apple.CoreSimulator.SimDeviceType.iPhone-17', runtimeId: 'com.apple.CoreSimulator.SimRuntime.iOS-27-0' },
    inspectedContentDigest: digest, artifactBytes: 100, configVersion: 1, configDigest: digest,
    budgets: { maxRetainedAllocations: 8, maxConcurrentPreparations: 1, reservationBytesPerAllocation: 800, maxReservedBytes: 6400, minFreeBytes: 2000, maxArtifactBytes: 200,
      createTimeoutMs: 60000, bootTimeoutMs: 120000, installTimeoutMs: 120000, launchTimeoutMs: 30000, readinessTimeoutMs: 30000, readyTtlMs: 300000, timeoutMs: 360000 },
    storage: { simulatorFreeBytes: 10000, stagingFreeBytes: 10000 }, evidenceDirectory: '/isolated/evidence/one' };
}
function staged() { return { stagedPath: '/isolated/staged/Fixture.app', contentDigest: digest, bytes: 100, maxBytes: 200,
  metadata: { bundleId: 'dev.fixture', executable: 'Fixture', architecture: 'arm64' as const, minimumOSVersion: '27.0', build: { id: 'build', origin: 'fixture' } } }; }
function created(id: string, device = uuid) { return { status: 'created' as const, udid: device, provenance: { kind: 'simctl-create' as const,
  allocationId: id, name: `jev-observed-${id}`, deviceTypeId: input().source.deviceTypeId, runtimeId: input().source.runtimeId } }; }
function binding(allocationId: string, actionId = 'one') { return { allocationId, actionId, actionDigest: digest, request: { actionId, allocationId, action: 'tap' }, appBundleId: 'dev.fixture',
  evidence: { bridgeVersion: '1.3.1', directory: '/isolated/evidence/action', request: '/isolated/evidence/action/request.json' } }; }

const violations: string[] = [];
for (const mode of ['control', 'cancel-write-failure', 'terminal-write-failure']) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'allocation-spec-review-')));
  let failing = '';
  try {
    const admission = Admission.forTesting({root, backend:'fake', fault:(point, operation)=>{
      if(point === 'beforeCommit' && operation === failing) throw Error('isolated injected failure');
    }});
    const reserved = admission.reserveAllocation(input());
    assert.equal(reserved.kind, 'reserved');
    const r = reserved.reservation;
    r.stage(staged());
    await r.create(async()=>created(r.identity.allocationId));
    const admitted = r.admit();
    assert.equal(admitted.kind, 'admitted');
    const claim = admitted.claim;
    const driver = claim.bindDriver('fake');
    for(const stage of ['boot','install','launch','readiness']) await driver.dispatch(stage, async()=>true);
    if(mode === 'cancel-write-failure') {
      failing='cancel';
      assert.throws(()=>claim.cancel(), /isolated injected failure/);
    }
    if(mode === 'terminal-write-failure') {
      failing='failAllocation';
      assert.equal(r.fail('PREPARATION_UNCONFIRMED').authority, 'unconfirmed');
    }
    failing='';
    if(mode !== 'control') assert.throws(()=>driver.dispatch('capture', async()=>true), /closed/i);
    const parked = claim.park(['/isolated/readiness.json']);
    const consumed = admission.consumeAllocation(binding(r.identity.allocationId));
    let calls=0;
    if(consumed.kind==='consumed') await consumed.claim.bindDriver('fake').dispatch('tap', async()=>{calls++;});
    if(mode !== 'control' && consumed.kind === 'consumed') violations.push(mode);
    console.log(JSON.stringify({mode, parkAuthority:parked.authority, parkedState:parked.allocation?.state, consumed:consumed.kind, newActionEffects:calls}));
  } finally {rmSync(root,{recursive:true,force:true});}
}

assert.deepEqual(violations, [], 'Locally revoked preparation must not park and transfer new action authority');
