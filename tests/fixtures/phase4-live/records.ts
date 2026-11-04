import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { TestContext } from 'node:test';
import type { CycleBackend } from '../../../scripts/phase4/live/cycles.js';
import type { RunnerDeps } from '../../../scripts/phase4/live/run.js';
import type { OwnerIdentity } from '../../../src/device/admission.js';
import { UDID } from '../appium-wire/driver-fixture.js';
import { IOS_DEVICE } from '../appium-wire/matrix.js';

export const MATRIX = resolve('tests/fixtures/phase4-live/matrix.json');
export const NOW = new Date('2026-10-30T12:00:00.000Z');
const hour = 3_600_000;
export const custody = (from: number, until: number) => ({ from: new Date(NOW.getTime() + from * hour).toISOString(), until: new Date(NOW.getTime() + until * hour).toISOString() });

export function scratch(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'p4-runner-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function owned(path: string, record: object, mode: number) {
  writeFileSync(path, JSON.stringify(record, null, 2));
  chmodSync(path, mode);
  return path;
}
export const writeAssignment = (root: string, fields: Record<string, unknown> = {}, mode = 0o600, name = 'assignment.json') =>
  owned(join(root, name), { version: 1, kind: 'device-assignment', assignedBy: 'owner', device: UDID, category: 'ios-simulator', custody: custody(-1, 1), ...fields }, mode);
export const writeActivation = (root: string, fields: Record<string, unknown> = {}, mode = 0o600) =>
  owned(join(root, 'activation.json'), { version: 1, kind: 'store-activation', assignedBy: 'owner', writersStopped: true, window: custody(-1, 1), ...fields }, mode);

export const FAKE_VERSIONS = { node: 'v24-test', platform: 'test-os', osRelease: '1.0', git: { revision: 'f9ce07854', dirty: false }, package: '1.4.0', tools: {} };

/** Runner dependencies with nothing live: a fixed clock, captured output, fake versions and a cycle backend that refuses unless given. */
export function fakeDeps(root: string, overrides: Partial<RunnerDeps> = {}) {
  const out: string[] = [], err: string[] = [];
  const deps: RunnerDeps = { env: { PATH: process.env.PATH }, cwd: root, now: () => NOW, out: line => out.push(line), err: line => err.push(line),
    versions: async () => FAKE_VERSIONS, cycleBackend: async () => { throw new Error('no cycle backend in this test'); }, signal: new AbortController().signal, ...overrides };
  return { deps, out, err };
}

/** A cycle backend with no device: every attempt ends released and nothing is recorded, so the fence is never read.
 *  `quarantineAt` leaves the simulator quarantined from that cycle on. */
export function idleBackend(options: { quarantineAt?: number } = {}): CycleBackend {
  let held = false;
  const owner = (id: string): OwnerIdentity => ({ category: 'ios-simulator', device: UDID, attempt: { kind: 'legacy', id }, token: 'idle', generation: 1, process: { pid: 1, incarnation: 'idle' } });
  return { device: IOS_DEVICE, fence: async () => { throw new Error('an idle cycle has nothing to fence'); },
    admission: {
      inspect: () => ({ category: 'ios-simulator', device: UDID, state: held ? 'quarantined' : 'available', generation: 1, owner: null, reason: null }),
      readAttempt: identity => ({ identity, category: 'ios-simulator', device: UDID, digest: 'idle', intent: null, owner: owner(identity.id), state: 'terminal', cancellationRequested: false,
        terminal: { outcome: 'completed', disposition: 'available', payload: {}, evidenceRefs: [] } }),
      readGeneration: expected => ({ owner: expected, dispatchClosedAt: null, inventoryUnknownReason: null, components: [], commands: [], componentObservations: [], observations: [], recoveries: [] }),
    },
    cycle: async index => {
      if (index === options.quarantineAt) held = true;
      return { attempt: { kind: 'legacy', id: `idle-${String(index)}` }, scenario: { runId: `idle-${String(index)}`, verdict: 'inconclusive', reason: 'EXECUTION_ERROR', reachedCheckpoint: true } };
    } };
}
