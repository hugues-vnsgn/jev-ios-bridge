import { renameSync } from 'node:fs';
import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { migrateAdmissionForTesting } from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-runtime/src/device/admission-migration.js';
import { ObservedActionJournal } from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-runtime/src/experimental/observed-journal.js';
import { runObservedExperiment } from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-runtime/src/experimental/observed-run.js';
import { Admission, type AdmissionDependencies } from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-runtime/src/device/admission.js';
import { ObservedActionService, observedDriverFactory } from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-runtime/src/observed/service.js';
import { createObservedDriver } from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-runtime/src/device/factory.js';
import type { AllocationReservationInput } from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-runtime/src/device/admission-allocation.js';
import { FileObservedEvidence, type ObservedEvidenceStore } from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-runtime/src/observed/evidence.js';
import type { CliRunner } from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-runtime/src/device/index.js';
import { renderObservedAction, observedActionExitCode, observedActionSummary } from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-runtime/src/observed/report.js';
import { parseObservedAction, observedActionDigest } from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-runtime/src/observed/schema.js';
import type { ObservedServiceOptions, ObservedAllocator } from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-runtime/src/observed/service.js';

const device = 'ABCDEF00-0000-4000-8000-000000000001';
const digest = 'a'.repeat(64);
async function ready(admission: Admission, actionId = 'one') {
  const input: AllocationReservationInput = { actionId, preparationDigest: digest, preparation: {}, appBundleId: 'dev.fixture',
    source: { kind: 'supplied', inventoryId: actionId, udid: device, deviceTypeId: 'device', runtimeId: 'runtime',
      creation: { createdAt: 'fixture', origin: 'fixture', evidenceRef: '/isolated/creation' }, attestation: { freshUnused: true, exclusive: true } },
    inspectedContentDigest: digest, artifactBytes: 100, configVersion: 1, configDigest: digest, evidenceDirectory: '/isolated/preparation',
    budgets: { maxRetainedAllocations: 8, maxConcurrentPreparations: 1, reservationBytesPerAllocation: 800, maxReservedBytes: 6400,
      minFreeBytes: 2000, maxArtifactBytes: 200, createTimeoutMs: 60000, bootTimeoutMs: 120000, installTimeoutMs: 120000,
      launchTimeoutMs: 30000, readinessTimeoutMs: 30000, readyTtlMs: 300000, timeoutMs: 360000 },
    storage: { simulatorFreeBytes: 10000, stagingFreeBytes: 10000 } };
  const reserved = admission.reserveAllocation(input); assert.equal(reserved.kind, 'reserved');
  if (reserved.kind !== 'reserved') throw new Error('Fixture reservation refused');
  reserved.reservation.stage({ stagedPath: '/isolated/Fixture.app', contentDigest: digest, bytes: 100, maxBytes: 200,
    metadata: { bundleId: 'dev.fixture', executable: 'Fixture', architecture: 'arm64', minimumOSVersion: '27.0', build: { id: 'fixture', origin: 'fixture' } } });
  const admitted = reserved.reservation.admit(); if (admitted.kind !== 'admitted') throw new Error('Fixture admission refused');
  const session = admitted.claim.bindDriver('fake');
  for (const operation of ['boot', 'install', 'launch', 'readiness']) await session.dispatch(operation, async () => true);
  assert.equal(admitted.claim.park(['/isolated/readiness']).authority, 'committed');
  return reserved.reservation.identity.allocationId;
}
function request(allocationId: string, actionId = 'one') {
  return { version: 1, actionId, allocationId, app: { bundleId: 'dev.fixture' }, action: { kind: 'tap', selector: { identifier: 'go' } },
    before: { present: [{ identifier: 'go' }] }, after: { present: [{ identifier: 'done' }] }, timeoutMs: 5000 };
}
function reply(done: boolean, touch = false) {
  return { stdout: JSON.stringify({ schema: touch ? 'mobilebuildmcp.output.ui-action-result' : 'mobilebuildmcp.output.capture-result',
    schemaVersion: '2', data: { artifacts: { simulatorId: device }, action: { type: 'tap' },
      capture: { type: 'runtime-snapshot', protocol: 'rs/1', capturedAtMs: Date.now(), expiresAtMs: Date.now() + 60000,
        count: 1, elements: [{ ref: 'button', role: 'button', identifier: done ? 'done' : 'go', label: done ? 'Done' : 'Go',
          frame: { x: 0, y: 0, width: 100, height: 30 }, actions: ['tap', 'touch'], state: { visible: true, enabled: true } }] } } }), stderr: '', exitCode: 0 };
}
function fixture(t: TestContext, runner: CliRunner, overrides: Partial<ObservedServiceOptions> = {}, dependencies: AdmissionDependencies = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'observed-service-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'store'), { mode: 0o700 });
  const admission = Admission.forTesting({ root: join(root, 'store'), backend: 'fake', ...dependencies });
  const service = new ObservedActionService({ admission, runsDir: join(root, 'evidence'), bridgeVersion: 'fixture', backend: 'fake', enabled: true,
    createDriver: () => createObservedDriver({ cwd: root, admission, lockRoot: join(root, 'leases'), capture: 'full', reuseActionCapture: false,
      runner, deviceWindow: async () => assert.fail('No presentation'), fakeBackend: { runner, window: undefined } }), ...overrides });
  return { root, admission, service };
}


// Independent review probes; every device effect below uses explicit fake transports.
test('local cancel fences continuation even when initial authoritative read fails', async t => {
  let release!: (value: ReturnType<typeof reply>) => void;
  let began!: () => void;
  const started = new Promise<void>(resolve => { began=resolve; });
  const pending = new Promise<ReturnType<typeof reply>>(resolve => { release=resolve; });
  const calls:string[]=[];
  const {root,admission,service}=fixture(t,async args=>{
    calls.push(args[1]!);
    if(calls.length===1){began(); return pending;}
    return reply(true,args[1]==='touch');
  });
  await service.start(request(await ready(admission))); await started;
  const db=join(root,'store','admission.sqlite');
  renameSync(db,db+'.review-away');
  try {await assert.rejects(service.cancel('one'),{code:'STORE_UNAVAILABLE'});}
  finally {renameSync(db+'.review-away',db);}
  release(reply(false));
  const terminal=await service.inspect('one',{waitMs:3000});
  console.log(JSON.stringify({case:'cancel-read-failure',calls,outcome:terminal.outcome,reason:terminal.reason,cancellationRequested:terminal.cancellationRequested}));
  await service.close();
  assert.deepEqual(calls,['snapshot-ui'],'Explicit local cancellation must prevent follow-up input despite unavailable initial read');
});
test('settled close within finalization budget does not consume action observation budget',async t=>{
  let driver!:ReturnType<typeof createObservedDriver>;let closedAt=0;let observedAt=0;
  const {root,admission,service}=fixture(t,async()=>reply(true),{createDriver:()=>({
    attachObserved:(...args)=>driver.attachObserved(...args),
    observe:async(...args)=>{const value=await driver.observe(...args);observedAt=Date.now();return value;},
    tapOnce:(...args)=>driver.tapOnce(...args),revokeIssuance:()=>driver.revokeIssuance(),
    close:async signal=>{await driver.close(signal);await new Promise(resolve=>setTimeout(resolve,650));closedAt=Date.now();},
  })});
  const runner:CliRunner=async()=>reply(true);
  driver=createObservedDriver({cwd:root,admission,lockRoot:join(root,'leases'),runner,
    deviceWindow:async()=>assert.fail('No window'),fakeBackend:{runner,window:undefined}});
  const raw=request(await ready(admission));raw.timeoutMs=500;
  const began=Date.now();await service.start(raw);const terminal=await service.inspect('one',{waitMs:3000});
  console.log(JSON.stringify({case:'separate-finalization-budget',observedMs:observedAt-began,closedMs:closedAt-began,outcome:terminal.outcome,reason:terminal.reason}));
  await service.close();assert.equal(terminal.outcome,'already_satisfied');
});
