import assert from 'node:assert/strict';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { z } from 'zod/v4';
import { fixtureDevice } from './observed-allocation-backend.js';
import { Admission } from '../../src/device/admission.js';
import type { AllocationOperationCode } from '../../src/observed/allocation-schema.js';
import type { ObservedOperationCode } from '../../src/observed/schema.js';
import { reservationSchema } from '../../src/device/admission-allocation.js';
import type { AllocationRecord } from '../../src/device/admission-allocation.js';
import { parsePrepareAllocation, preparationDigest } from '../../src/observed/allocation-schema.js';
import { parseObservedAction, observedActionDigest, observedReasons } from '../../src/observed/schema.js';

const uuid = z.string().regex(/^[a-f0-9-]{36}$/i);
const allocationReasons = ['INVALID_REQUEST','ACTION_ID_CONFLICT','ALLOCATION_NOT_FOUND','ALLOCATION_NOT_READY','ALLOCATION_BUSY','CONFIG_INVALID','HOST_PREREQUISITE_MISSING','ARTIFACT_INVALID','ARTIFACT_INCOMPATIBLE','INVENTORY_EXHAUSTED','INVENTORY_INELIGIBLE','BUDGET_EXHAUSTED','STORAGE_UNAVAILABLE','HOST_CREATION_UNRESOLVED','CREATE_UNCONFIRMED','ADMISSION_REFUSED','BOOT_FAILED','INSTALL_FAILED','LAUNCH_FAILED','READINESS_FAILED','PREPARATION_UNCONFIRMED','CANCELLED','READY_EXPIRED','RETAINED_UNUSED','STATE_UNAVAILABLE'] as const;
const codes = z.enum([...allocationReasons,'UNSUPPORTED_VERSION','STORE_UNAVAILABLE','MIGRATION_REQUIRED','SHUTTING_DOWN','WAIT_CANCELLED','INTERNAL_ERROR','OBSERVED_DISABLED','DEVICE_BUSY','DEVICE_QUARANTINED','CONFIGURATION_ERROR','ACTION_NOT_FOUND','ACTION_NOT_STARTED']);
type AssertNever<T extends never> = T;
type CodeCoverage = AssertNever<Exclude<AllocationOperationCode | ObservedOperationCode, z.infer<typeof codes>> | Exclude<z.infer<typeof codes>, AllocationOperationCode | ObservedOperationCode>>;
const errorSchema = z.strictObject({ version: z.literal(1), kind: z.literal('observed-operation-error'), code: codes, message: z.string(), acceptance: z.enum(['no','yes','unknown']), acceptanceKind: z.enum(['action','preparation']), actionId: z.string().optional(), allocationId: uuid.optional(), blockingAllocationId: uuid.optional(), evidenceDirectory: z.string().optional(), state: z.enum(['preparing','ready','executing','retained','quarantined']).optional() });
const allocationPhaseSchema = z.enum(['reserved','creating','admitting','booting','installing','launching','readiness','parked','action','terminal']);
const preparingPhaseSchema = allocationPhaseSchema.exclude(['parked','action','terminal']);
const device = z.strictObject({ platform: z.literal('ios-simulator'), udid: uuid });
const allocationSchema = z.strictObject({ version: z.literal(1), allocationId: uuid, actionId: z.string(), state: z.enum(['preparing','ready','executing','retained','quarantined']), phase: allocationPhaseSchema, device: device.nullable(), reason: z.enum(allocationReasons).nullable(), outcome: z.enum(['prepared','action_completed','refused','uncertain','retired_unused']).nullable(), authority: z.enum(['committed','unconfirmed']), readinessEvidence: z.array(z.string()), evidenceRefs: z.array(z.string()), reservation: z.strictObject({ bytes: z.number().int().nonnegative(), capacityHeld: z.boolean() }), hostCreationBlocked: z.boolean(), cancellationRequested: z.boolean(), readOnly: z.literal(true).optional(), historicalOutcome: z.enum(['outcome_observed','already_satisfied','refused','inconclusive']).optional() });
const actionSchema = z.strictObject({ version: z.literal(1), kind: z.literal('observed-action'), actionId: z.string(), allocationId: uuid, device, bridgeVersion: z.string(), state: z.enum(['running','finalizing','terminal','unresolved']), authority: z.enum(['none','committed','unconfirmed']), disposition: z.enum(['started','retrieved']), cancellationRequested: z.boolean(), actionAttempted: z.boolean().nullable(), actionAcknowledged: z.boolean().nullable(), observations: z.number().int().nonnegative(), outcome: z.enum(['outcome_observed','already_satisfied','refused','inconclusive']).nullable(), reason: z.enum(observedReasons).nullable(), admission: z.enum(['active','available','quarantined','unknown']), allocationState: z.enum(['preparing','ready','executing','retained','quarantined']), evidence: z.strictObject({ directory: z.string(), request: z.string(), observations: z.array(z.string()), terminal: z.string().nullable(), exportStatus: z.enum(['pending','complete','failed']) }) });
export const publicReplySchema = z.union([errorSchema, actionSchema, allocationSchema]);
const activeActionPrefix = actionSchema.extend({ state: z.enum(['running','finalizing']), authority: z.literal('none'), outcome: z.null(), reason: z.null(), allocationState: z.literal('executing'), admission: z.literal('active') });
const unresolvedActionPrefix = actionSchema.extend({ state: z.literal('unresolved'), authority: z.literal('unconfirmed'), outcome: z.null(), reason: z.enum(['OWNER_UNAVAILABLE','FINALIZATION_UNCONFIRMED']), allocationState: z.literal('executing'), admission: z.literal('active') });
const terminalActionPrefix = z.discriminatedUnion('outcome', [
  actionSchema.extend({ state: z.literal('terminal'), authority: z.literal('committed'), outcome: z.literal('outcome_observed'), reason: z.null(), actionAttempted: z.literal(true), actionAcknowledged: z.literal(true), observations: z.number().int().positive(), allocationState: z.literal('retained'), admission: z.literal('available') }),
  actionSchema.extend({ state: z.literal('terminal'), authority: z.literal('committed'), outcome: z.literal('already_satisfied'), reason: z.null(), actionAttempted: z.literal(false), actionAcknowledged: z.literal(false), observations: z.number().int().positive(), allocationState: z.literal('retained'), admission: z.literal('available') }),
  actionSchema.extend({ state: z.literal('terminal'), authority: z.literal('committed'), outcome: z.literal('refused'), reason: z.enum(observedReasons), actionAttempted: z.literal(false), actionAcknowledged: z.literal(false), allocationState: z.literal('retained'), admission: z.literal('available') }),
  actionSchema.extend({ state: z.literal('terminal'), authority: z.literal('committed'), outcome: z.literal('inconclusive'), reason: z.enum(observedReasons), allocationState: z.literal('quarantined'), admission: z.literal('quarantined') }),
]);
const actionPrefixSchema = z.union([activeActionPrefix, unresolvedActionPrefix, terminalActionPrefix]).superRefine((reply, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (reply.actionAttempted !== reply.actionAcknowledged) issue('Selected action receipt flags form a coherent pair');
  if (reply.actionAttempted === false && reply.observations > 1) issue('Before input only the initial observation is reachable');
  if (reply.actionAttempted !== false && reply.observations < 1) issue('Input authorization follows a persisted observation');
  if (!isAbsolute(reply.evidence.directory) || !isAbsolute(reply.evidence.request)) issue('Action evidence paths are absolute');
  let cursor = 0;
  for (let index = 1; index <= reply.observations; index++) {
    if (reply.evidence.observations[cursor++] !== join(reply.evidence.directory, `observation-${index}.json`)) issue('Observation count matches complete evidence groups');
    if (reply.evidence.observations[cursor] === join(reply.evidence.directory, `observation-${index}.jpg`)) cursor++;
  }
  if (cursor !== reply.evidence.observations.length) issue('Observation count matches complete evidence groups');
  if (reply.state !== 'terminal' && (reply.evidence.exportStatus !== 'pending' || reply.evidence.terminal !== null)) issue('Nonterminal export is pending without terminal pointer');
  if ((reply.evidence.exportStatus === 'complete') !== (reply.evidence.terminal !== null)) issue('Complete export has its terminal pointer');
  if (reply.evidence.terminal !== null && reply.evidence.terminal !== join(reply.evidence.directory, 'terminal.json')) issue('Terminal export pointer matches evidence directory');
});

const freshAllocationPrefixSchema = z.discriminatedUnion('state', [
  allocationSchema.extend({ state: z.literal('preparing'), phase: preparingPhaseSchema, reason: z.null(), outcome: z.null(), readinessEvidence: z.array(z.string()).length(0) }),
  allocationSchema.extend({ state: z.literal('ready'), phase: z.literal('parked'), reason: z.null(), device, readinessEvidence: z.array(z.string()).nonempty(), cancellationRequested: z.literal(false) }),
  allocationSchema.extend({ state: z.literal('executing'), phase: z.literal('action'), reason: z.null(), outcome: z.null(), device, readinessEvidence: z.array(z.string()).nonempty() }),
  allocationSchema.extend({ state: z.literal('retained'), phase: z.literal('terminal') }),
  allocationSchema.extend({ state: z.literal('quarantined'), phase: z.literal('terminal') }),
]).superRefine((reply, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  const projectedOutcome = (outcomes: (typeof reply.outcome)[]) => {
    if (reply.authority === 'unconfirmed' ? reply.outcome !== null : !outcomes.includes(reply.outcome)) issue('Allocation outcome matches its state and authority projection');
  };
  if (reply.readOnly !== undefined || reply.historicalOutcome !== undefined) issue('Fresh allocation prefix has no historical projection');
  if (reply.readinessEvidence.some(path => !isAbsolute(path))) issue('Readiness evidence is absolute');
  if (reply.state === 'preparing' || reply.state === 'ready' || reply.state === 'executing') {
    if (!reply.reservation.capacityHeld) issue('Live allocation retains capacity');
  }
  if ((reply.state === 'ready' || reply.state === 'executing') && reply.hostCreationBlocked) issue('Ready or executing prefix has acknowledged creation');
  if (reply.state === 'preparing') {
    if (reply.phase === 'creating' && (reply.device !== null || !reply.hostCreationBlocked)) issue('Creating prefix has unknown device and committed creation guard');
    if (reply.phase === 'reserved' && reply.hostCreationBlocked) issue('Reserved prefix precedes the creation guard');
    if (reply.phase !== 'reserved' && reply.phase !== 'creating' && (reply.device === null || reply.hostCreationBlocked)) issue('Admitted preparation has its device and cleared creation guard');
  } else if (reply.state === 'ready') projectedOutcome(['prepared']);
  else if (reply.state === 'retained' || reply.state === 'quarantined') {
    const retired = reply.reason === 'READY_EXPIRED' || reply.reason === 'RETAINED_UNUSED';
    if (reply.state === 'retained') projectedOutcome(retired ? ['retired_unused'] : reply.reason === null ? ['action_completed','refused'] : ['refused']);
    else { projectedOutcome(['uncertain']); if (retired) issue('Quarantine is not unused retirement'); }
    const reachedReady = retired || reply.reason === null;
    if (reachedReady && (reply.device === null || reply.readinessEvidence.length === 0 || !reply.reservation.capacityHeld)) issue('Retirement or action terminal retains its ready device, evidence and capacity');
    if (!reachedReady && reply.readinessEvidence.length !== 0) issue('Preparation failure has no committed readiness');
  }
});

export type PublicReply = z.infer<typeof publicReplySchema>;
export const isErrorReply = (reply: PublicReply) => 'kind' in reply && reply.kind === 'observed-operation-error';
export function publicExit(reply: PublicReply): 0 | 2 | 3 {
  if ('kind' in reply && reply.kind === 'observed-operation-error') return 3;
  if (reply.authority !== 'committed') return 2;
  if (reply.outcome === 'refused') return 3;
  return ['prepared','action_completed','retired_unused','outcome_observed','already_satisfied'].includes(reply.outcome ?? '') ? 0 : 2;
}
export function parseCli({ stdout, stderr, code, signal, signalExit = false }: { stdout: string; stderr: string; code: number | null; signal: NodeJS.Signals | null; signalExit?: boolean }) {
  assert.equal(signal, null, stderr); assert.match(stdout, /^[^\r\n]+\n$/, 'Exactly one complete JSON line'); const lines = stdout.trim().split('\n'); assert.equal(lines.length, 1, stdout + stderr);
  const reply = publicReplySchema.parse(JSON.parse(lines[0]!));
  if (signalExit && (code === 130 || code === 143)) return reply;
  assert.equal(code, publicExit(reply), stdout + stderr); return reply;
}
const toolSchema = z.strictObject({ content: z.tuple([z.strictObject({ type: z.literal('text'), text: z.string() }), z.strictObject({ type: z.literal('text'), text: z.string() })]), isError: z.boolean().optional() });
export function parseTool(raw: unknown) {
  const result = toolSchema.parse(raw); const reply = publicReplySchema.parse(JSON.parse(result.content[1].text));
  assert.equal(result.isError, isErrorReply(reply) ? true : undefined, 'MCP isError must match the public reply');
  return { reply, isError: result.isError };
}
const processOwner = z.strictObject({ pid: z.number().int().nonnegative(), incarnation: z.string() });
const ownerSchema = z.strictObject({ allocationId: uuid, token: z.string().min(1), generation: z.number().int().positive(), process: processOwner });
const immutableSchema = reservationSchema.omit({ storage: true }).strip();
const base = { actor: z.number().int().positive(), sequence: z.number().int().positive() };
const eventSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...base, kind: z.literal('commit'), operation: z.string(), actionId: z.string(), owner: ownerSchema, hostCreationBlocked: z.boolean(), phase: z.string(), immutable: immutableSchema, inputPending: z.boolean() }),
  z.strictObject({ ...base, kind: z.literal('enter'), operation: z.string(), operationId: z.number().int().positive(), actionId: z.string().nullable(), owner: ownerSchema.nullable(), authorization: z.number().int().positive().nullable() }),
  z.strictObject({ ...base, kind: z.literal('settle'), operationId: z.number().int().positive(), status: z.enum(['fulfilled','rejected']) }),
  z.strictObject({ ...base, kind: z.enum(['close-begin','close-end','observer-gap']), detail: z.string() }),
]);
export type FixtureEvent = z.infer<typeof eventSchema>;
export function fixtureObserver({ root, admission, actions }: { root: string; admission: () => Admission; actions: Set<string> }) {
  let sequence = 0; let operationId = 0; const grants: Extract<FixtureEvent, { kind: 'commit' }>[] = [];
  type Input = FixtureEvent extends infer E ? E extends FixtureEvent ? Omit<E, 'actor' | 'sequence'> : never : never;
  const emit = (event: Input) => { try { appendFileSync(join(root, 'authority-trace.jsonl'), JSON.stringify({ ...event, actor: process.pid, sequence: ++sequence }) + '\n', { mode: 0o600 }); } catch { process.stderr.write('Fixture observer could not persist its receipt\n'); } };
  const gap = (error: unknown) => emit({ kind: 'observer-gap', detail: String(error) });
  const current = (parked = false) => [...actions].map(id => admission().readAllocationForAction(id)).find(record => record?.owner.process.pid === process.pid || parked && record?.owner.process.pid === 0);
  return {
    close(kind: 'close-begin' | 'close-end') { emit({ kind, detail: 'public close' }); },
    commit(operation: string) { try { const record = current(operation === 'parkAllocation'); if (!record) return; const event = { kind: 'commit' as const, actor: process.pid, sequence: sequence + 1, operation, actionId: record.actionId, owner: structuredClone(record.owner), hostCreationBlocked: record.hostCreationBlocked, phase: record.phase, immutable: immutableSchema.parse(record), inputPending: record.actionEvidence?.actionAttempted === null }; emit(event); grants.push(event); } catch (error) { gap(error); } },
    async effect<T>({ operation, effect }: { operation: string; effect: () => Promise<T> }): Promise<T> {
      const id = ++operationId;
      let record: AllocationRecord | undefined;
      let grant: Extract<FixtureEvent, { kind: 'commit' }> | undefined;
      try { record = current(); grant = [...grants].reverse().find(g => g.operation === (operation === 'create' ? 'startCreation' : 'authorize') && g.actionId === record?.actionId && JSON.stringify(g.owner) === JSON.stringify(record?.owner)); } catch (error) { gap(error); }
      emit({ kind: 'enter', operationId: id, operation, actionId: record?.actionId ?? null, owner: record ? structuredClone(record.owner) : null, authorization: grant?.sequence ?? null });
      try { const result = await effect(); emit({ kind: 'settle', operationId: id, status: 'fulfilled' }); return result; }
      catch (error) { emit({ kind: 'settle', operationId: id, status: 'rejected' }); throw error; }
    },
  };
}
export function fixtureEvents(root: string) {
  const path = join(root, 'authority-trace.jsonl'); const raw = existsSync(path) ? readFileSync(path, 'utf8') : '';
  assert.ok(!raw || raw.endsWith('\n'), 'Complete trace records');
  return raw ? raw.trim().split('\n').map(line => eventSchema.parse(JSON.parse(line))) : [];
}
export function traceOracle({ events, actors }: { events: FixtureEvent[]; actors: number[] }) {
  for (const actor of actors) {
    const rows = events.filter(e => e.actor === actor); assert.ok(rows.length > 0, 'Each actor has trace receipts');
    assert.deepEqual(rows.map(r => r.sequence), rows.map((_, i) => i + 1));
    assert.ok(!rows.some(e => e.kind === 'observer-gap'), 'No observer gap');
    const closing = rows.find(e => e.kind === 'close-begin'); assert.ok(closing, 'Public close began'); assert.equal(rows.at(-1)?.kind, 'close-end', 'Public close completed');
    for (const entry of rows) if (entry.kind === 'enter') {
      assert.ok(entry.sequence < closing.sequence, 'No callback after close begins');
      const settled = rows.filter(e => e.kind === 'settle' && e.operationId === entry.operationId); assert.equal(settled.length, 1, 'Every callback settled once'); assert.ok(settled[0]!.sequence > entry.sequence);
      if (entry.operation !== 'plist') {
        assert.ok(entry.owner, 'Device callback has owned authority'); assert.equal(entry.owner.process.pid, actor, 'Callback belongs to its actor'); assert.ok(entry.authorization, 'Device callback has committed authorization');
        const grant = rows.find(e => e.kind === 'commit' && e.sequence === entry.authorization); assert.ok(grant?.kind === 'commit'); assert.ok(grant.sequence < entry.sequence); assert.deepEqual(grant.owner, entry.owner); assert.equal(grant.actionId, entry.actionId);
        assert.equal(grant.operation, entry.operation === 'create' ? 'startCreation' : 'authorize'); if (entry.operation === 'create') assert.equal(grant.hostCreationBlocked, true); if (entry.operation === 'touch') assert.equal(grant.inputPending, true, 'Touch authorization committed before input');
      }
    }
  }
  for (const op of ['create','boot','install','launch-app','touch']) assert.ok(events.filter(e => e.kind === 'enter' && e.operation === op).length <= 1, 'At most one ' + op);
}
const selectedErrorFields = z.discriminatedUnion('code', [
  errorSchema.extend({ code: z.literal('STORE_UNAVAILABLE') }),
  errorSchema.extend({ code: z.literal('STATE_UNAVAILABLE'), actionId: z.string() }),
  errorSchema.extend({ code: z.literal('ALLOCATION_NOT_READY'), actionId: z.string(), allocationId: uuid }),
  errorSchema.extend({ code: z.literal('ALLOCATION_BUSY'), actionId: z.string(), allocationId: uuid, evidenceDirectory: z.string().refine(isAbsolute), state: z.enum(['preparing','executing']) }),
]);
const operationAliases = {
  'observed-allocate': 'prepare', prepare_observed_allocation: 'prepare',
  'observed-action': 'start', start_observed_action: 'start',
  'observed-retire': 'retire', retire_observed_allocation: 'retire',
  'observed-report': 'readAction', get_observed_action: 'readAction',
  'observed-allocation': 'readAllocation', get_observed_allocation: 'readAllocation',
} as const;
const operationSchema = z.enum(['observed-allocate','prepare_observed_allocation','observed-action','start_observed_action','observed-retire','retire_observed_allocation','observed-report','get_observed_action','observed-allocation','get_observed_allocation']);
const operationPolicy = {
  prepare: { acceptanceKind: 'preparation', errors: { STORE_UNAVAILABLE: 'unknown', STATE_UNAVAILABLE: 'no' } },
  start: { acceptanceKind: 'action', errors: { STORE_UNAVAILABLE: 'unknown', ALLOCATION_NOT_READY: 'no' } },
  retire: { acceptanceKind: 'preparation', errors: { STORE_UNAVAILABLE: 'unknown', ALLOCATION_BUSY: 'yes' } },
  readAction: { acceptanceKind: 'action', errors: { STORE_UNAVAILABLE: 'unknown' } },
  readAllocation: { acceptanceKind: 'preparation', errors: { STORE_UNAVAILABLE: 'unknown' } },
} satisfies Record<(typeof operationAliases)[z.infer<typeof operationSchema>], { acceptanceKind: 'action' | 'preparation'; errors: Partial<Record<z.infer<typeof codes>, 'no' | 'yes' | 'unknown'>> }>;
export function publicPolicy({ observations }: { observations: { operation: string; request: { actionId: string; allocationId?: string }; reply: PublicReply }[] }) {
  for (const { operation, request, reply } of observations) {
    const policy = operationPolicy[operationAliases[operationSchema.parse(operation)]];
    if ('kind' in reply && reply.kind === 'observed-action') { const parsed = actionPrefixSchema.safeParse(reply); assert.ok(parsed.success, 'Coherent source-backed action prefix: ' + JSON.stringify(parsed.error?.issues)); }
    else if (!('kind' in reply)) { const parsed = freshAllocationPrefixSchema.safeParse(reply); assert.ok(parsed.success, 'Coherent source-backed allocation prefix: ' + JSON.stringify(parsed.error?.issues)); }
    if (reply.actionId !== undefined) assert.equal(reply.actionId, request.actionId, 'Reply action identity');
    if (request.allocationId && reply.allocationId !== undefined) assert.equal(reply.allocationId.toUpperCase(), request.allocationId.toUpperCase(), 'Reply allocation identity');
    if ('kind' in reply && reply.kind === 'observed-operation-error') {
      const eligible = Object.entries(policy.errors).find(([code]) => code === reply.code);
      assert.ok(eligible, 'Eligible public operation/code relation: ' + operation + '/' + reply.code);
      assert.equal(reply.acceptanceKind, policy.acceptanceKind, 'Public operation acceptance kind');
      assert.equal(reply.acceptance, eligible[1], 'Public operation/code acceptance');
      const fields = selectedErrorFields.safeParse(reply); assert.ok(fields.success, 'Source-required public error fields: ' + JSON.stringify(fields.error?.issues));
    } else if (reply.authority !== 'committed') { assert.equal(reply.outcome, null); if ('kind' in reply) assert.ok(['OWNER_UNAVAILABLE','FINALIZATION_UNCONFIRMED',null].includes(reply.reason)); }
    else if (reply.outcome === 'uncertain' && !('kind' in reply) && reply.reason === null) { assert.equal(reply.state, 'quarantined'); }
    else if (reply.outcome === 'inconclusive' || reply.outcome === 'uncertain') assert.ok(['STATE_UNAVAILABLE','PREPARATION_UNCONFIRMED','CREATE_UNCONFIRMED','FINISH_UNCONFIRMED','RESULT_EVIDENCE_UNCONFIRMED','OBSERVATION_UNCONFIRMED','UI_ACTION_UNCONFIRMED','CANCELLED'].includes(reply.reason ?? ''), 'Enumerated uncertainty reason');
    else if (!('kind' in reply) && (reply.state === 'preparing' || reply.state === 'executing')) { assert.equal(reply.outcome, null); assert.equal(reply.reason, null); }
    else assert.ok(['prepared','action_completed','retired_unused','outcome_observed'].includes(reply.outcome ?? ''), 'Expected healthy public outcome');
  }
}

export function publicAuthority({ admission, requests, baseline, action, retire = false, events, requireOutcome, observations }: { admission: Admission; requests: unknown[]; baseline?: AllocationRecord; action?: unknown; retire?: boolean; events: FixtureEvent[]; requireOutcome?: AllocationRecord['outcome']; observations: PublicObservation[] }) {
  assert.ok(observations.length > 0, 'Every public oracle has request/reply observations');
  if (baseline) { assert.equal(baseline.state, 'ready', 'Business requests follow the established ready baseline'); assert.equal(baseline.actionDigest, null, 'Ready baseline precedes action binding'); }
  for (const observation of observations) replyAuthority({ admission, observation, readyBaseline: baseline });
  const inputs = [...new Map(requests.map(raw => { const request = parsePrepareAllocation(raw); return [request.actionId, request] as const; })).values()]; const records: AllocationRecord[] = [];
  for (const request of inputs) {
    const view = admission.readAction(request.actionId); const record = admission.readAllocationForAction(request.actionId);
    if (!view) { assert.equal(record, undefined); assert.equal(baseline, undefined); continue; }
    assert.equal(view.kind, 'allocation'); assert.ok(view.kind === 'allocation'); assert.deepEqual(view.allocation, record); assert.ok(record); records.push(record); if (requireOutcome !== undefined) assert.equal(record.outcome, requireOutcome, 'Strict useful public authority');
    assert.equal(record.preparationDigest, preparationDigest(request)); assert.deepEqual(record.preparation, request); assert.equal(record.appBundleId, request.app.bundleId);
    assert.equal(record.source.kind, request.source.kind); if (record.source.kind === 'create' && request.source.kind === 'create') { assert.equal(record.source.deviceTypeId, request.source.deviceTypeId); assert.equal(record.source.runtimeId, request.source.runtimeId); }
    const creation = events.find(e => e.kind === 'commit' && e.actionId === request.actionId && e.operation === 'reserveAllocation'); assert.ok(creation?.kind === 'commit', 'Reservation baseline observed before effects'); assert.deepEqual(immutableSchema.parse(record), creation.immutable, 'Immutable reservation survives competition');
    assert.equal(record.configVersion, 1); assert.match(record.configDigest, /^[a-f0-9]{64}$/); assert.match(record.inspectedContentDigest, /^[a-f0-9]{64}$/); assert.ok(record.artifactBytes > 0);
    assert.equal(record.capacityHeld, true); assert.equal(record.reservationBytes, 1000); assert.equal(record.owner.allocationId, record.allocationId); if (record.device !== null) assert.equal(record.device, fixtureDevice);
    const latestOwner = events.filter(e => e.kind === 'commit' && e.actionId === request.actionId).at(-1); assert.ok(latestOwner?.kind === 'commit', 'Current owner has a committed receipt'); assert.deepEqual(record.owner, latestOwner.owner);
    if (baseline) for (const key of ['allocationId','preparationDigest','preparation','appBundleId','source','configVersion','configDigest','inspectedContentDigest','artifactBytes','budgets','createdAt','device','staged','creationReceipt','readyAt','expiresAt'] as const) assert.deepEqual(record[key], baseline[key], key);
    const enters = events.filter((e): e is Extract<FixtureEvent, { kind: 'enter' }> => e.kind === 'enter' && e.actionId === request.actionId);
    if (record.actionDigest === null) {
      assert.equal(view.attempt, null); assert.equal(record.actionRequest, null); assert.equal(record.actionEvidence, null); assert.equal(enters.filter(e => e.operation === 'touch').length, 0);
      if (record.state === 'ready') { assert.equal(record.phase, 'parked'); assert.equal(record.outcome, 'prepared'); assert.equal(record.reason, null); assert.equal(record.owner.generation, 2); const parked = events.find(e => e.kind === 'commit' && e.actionId === request.actionId && e.operation === 'parkAllocation'); assert.ok(parked?.kind === 'commit'); assert.deepEqual(record.owner, parked.owner); assert.deepEqual(record.owner.process, { pid: 0, incarnation: 'parked' }); assert.equal(view.admission?.state, 'active'); assert.equal(view.admission?.owner, null); }
      else if (record.state === 'retained') { assert.equal(retire, true, 'Retirement was requested'); assert.equal(record.phase, 'terminal'); assert.equal(record.outcome, 'retired_unused'); assert.equal(record.reason, 'RETAINED_UNUSED'); assert.equal(record.cancellationRequested, false); assert.equal(view.admission?.state, 'available'); assert.equal(view.admission?.owner, null); }
      else { if (record.state === 'preparing') {
        preparingPhaseSchema.parse(record.phase); assert.equal(record.readyAt, null); assert.equal(record.expiresAt, null); assert.deepEqual(record.readinessEvidence, [], 'Preparing authority has no committed readiness');
      } assert.ok(['preparing','quarantined'].includes(record.state)); assert.ok(record.state === 'preparing' ? record.outcome === null : record.outcome === 'uncertain'); if (record.reason) assert.ok(['STATE_UNAVAILABLE','PREPARATION_UNCONFIRMED','CREATE_UNCONFIRMED','CANCELLED'].includes(record.reason)); if (enters.some(e => e.operation === 'create')) assert.ok(record.creationReceipt !== null || record.hostCreationBlocked, 'Unsettled creation retains guard'); if (record.cancellationRequested) closureCancellation({ events, actor: record.owner.process.pid }); }
    } else {
      assert.ok(action); const parsed = parseObservedAction(action); assert.equal(parsed.actionId, request.actionId); assert.equal(parsed.allocationId, record.allocationId); assert.equal(record.actionDigest, observedActionDigest(parsed)); assert.deepEqual(record.actionRequest, parsed); assert.ok(view.attempt); assert.deepEqual(view.attempt.identity, { kind: 'observed', id: request.actionId }); assert.equal(view.attempt.digest, record.actionDigest); assert.deepEqual(view.attempt.intent, parsed);
      assert.equal(view.attempt.owner.token, record.owner.token); assert.equal(view.attempt.owner.generation, 3); assert.equal(record.owner.generation, 3); assert.deepEqual(view.attempt.owner.process, record.owner.process); assert.equal(view.attempt.device, record.device); assert.ok(view.admission); assert.equal(view.admission.generation, 3);
      for (const entry of enters.filter(e => e.operation !== 'plist')) if (entry.owner?.generation === 3) assert.deepEqual(entry.owner, record.owner);
      assert.ok(record.actionEvidence); const evidence = record.actionEvidence; if (evidence.actionAcknowledged === true) assert.equal(evidence.actionAttempted, true);
      const touches = enters.filter(e => e.operation === 'touch').length; assert.ok(touches <= 1); if (touches) assert.notEqual(evidence.actionAttempted, false);
      if (view.attempt.state === 'terminal') {
        assert.ok(view.attempt.terminal); assert.equal(evidence.state, 'terminal'); assert.equal(record.phase, 'terminal'); assert.equal(view.admission.owner, null);
        if (view.attempt.terminal.outcome === 'observed') { assert.equal(record.state, 'retained'); assert.equal(record.reason, null); assert.equal(record.outcome, 'action_completed'); assert.equal(view.admission.state, 'available'); assert.deepEqual(view.attempt.terminal.payload, { outcome: 'outcome_observed', reason: null }); assert.equal(touches, 1); assert.equal(evidence.actionAttempted, true); assert.equal(evidence.actionAcknowledged, true); assert.equal(evidence.observationCount, 2); }
        else { assert.equal(view.attempt.terminal.outcome, 'inconclusive'); assert.equal(record.state, 'quarantined'); assert.equal(view.admission.state, 'quarantined'); const payload = z.strictObject({ outcome: z.literal('inconclusive'), reason: z.enum(['PREPARATION_UNCONFIRMED','FINISH_UNCONFIRMED','RESULT_EVIDENCE_UNCONFIRMED','OBSERVATION_UNCONFIRMED','UI_ACTION_UNCONFIRMED','CANCELLED']) }).parse(view.attempt.terminal.payload); if (payload.reason === 'CANCELLED') closureCancellation({ events, actor: record.owner.process.pid }); }
      } else { assert.equal(record.state, 'executing'); assert.equal(record.phase, 'action'); assert.equal(record.outcome, null); assert.equal(view.attempt.terminal, null); assert.equal(view.admission.state, 'active'); assert.deepEqual(view.admission.owner, view.attempt.owner); }
    }
  }
  assert.ok(records.length <= 1); assert.deepEqual(admission.readAllocationCapacity(), { heldAllocations: records.length, reservedBytes: records.length * 1000 });
  assert.equal(new Set(records.map(r => r.allocationId)).size, records.length);
  if (!records.length) assert.equal(events.filter(e => e.kind === 'enter' && e.operation !== 'plist').length, 0);
  return records[0];
}
export function snapshot(reply: PublicReply) { assert.ok(!('kind' in reply) || reply.kind === 'observed-action', 'Expected public snapshot'); if ('kind' in reply && reply.kind === 'observed-operation-error') throw new Error('Expected snapshot'); return reply; }
export function allocation(reply: PublicReply) { assert.ok(!('kind' in reply), 'Expected allocation snapshot'); if ('kind' in reply) throw new Error('Expected allocation'); return reply; }
export function actionSnapshot(reply: PublicReply) { assert.ok('kind' in reply && reply.kind === 'observed-action', 'Expected action snapshot'); if (!('kind' in reply) || reply.kind !== 'observed-action') throw new Error('Expected action'); return reply; }
export function errorCode(reply: PublicReply) { return 'kind' in reply && reply.kind === 'observed-operation-error' ? reply.code : undefined; }
export const rpcResponseSchema = z.strictObject({ jsonrpc: z.literal('2.0'), id: z.number().int().positive(), result: z.unknown().optional(), error: z.strictObject({ code: z.number(), message: z.string(), data: z.unknown().optional() }).optional() }).refine(value => (value.result === undefined) !== (value.error === undefined), 'Exactly one RPC result or error');
export function operationError(reply: PublicReply) { assert.ok('kind' in reply && reply.kind === 'observed-operation-error', 'Expected operation error'); if (!('kind' in reply) || reply.kind !== 'observed-operation-error') throw new Error('Expected error'); return reply; }
export function replyKind(reply: PublicReply) { return 'kind' in reply ? reply.kind : undefined; }

function closureCancellation({ events, actor }: { events: FixtureEvent[]; actor: number }) { const close = events.find(e => e.actor === actor && e.kind === 'close-begin'); const cancel = events.find(e => e.actor === actor && e.kind === 'commit' && ['cancel','cancelAllocation'].includes(e.operation)); assert.ok(close && cancel && close.sequence < cancel.sequence, 'Cancellation is caused by explicit owner closure'); }

export type PublicObservation = { operation: string; argument: unknown; reply: PublicReply };
const requestIdentity = z.object({ actionId: z.string().optional(), allocationId: uuid.optional() }).refine(value => value.actionId !== undefined || value.allocationId !== undefined, 'Request identity is present');
function replyAuthority({ admission, observation: { operation, argument, reply }, readyBaseline }: { admission: Admission; observation: PublicObservation; readyBaseline: AllocationRecord | undefined }) {
  const identity = requestIdentity.parse(argument);
  const record = identity.actionId !== undefined ? admission.readAllocationForAction(identity.actionId) : identity.allocationId !== undefined ? admission.readAllocation(identity.allocationId) : undefined;
  const actionId = identity.actionId ?? record?.actionId;
  assert.ok(actionId, 'Request resolves an authoritative action identity');
  const selectedOperation = operationAliases[operationSchema.parse(operation)];
  const preparation = operationPolicy[selectedOperation].acceptanceKind === 'preparation';
  const request = { actionId, ...(identity.allocationId === undefined ? {} : { allocationId: identity.allocationId }) };
  if (reply.actionId !== undefined) assert.equal(reply.actionId, actionId, 'Reply action matches actual request');
  if (identity.allocationId !== undefined && reply.allocationId !== undefined) assert.equal(reply.allocationId.toUpperCase(), identity.allocationId.toUpperCase(), 'Reply allocation matches actual request');
  if ('kind' in reply && reply.kind === 'observed-operation-error') {
    if (reply.code === 'ACTION_ID_CONFLICT') {
      assert.ok(record); assert.equal(reply.actionId, actionId, 'Bound conflict supplies action identity'); assert.equal(reply.allocationId, preparation ? record.allocationId : identity.allocationId?.toUpperCase(), 'Bound conflict supplies allocation identity'); if (preparation) assert.equal(reply.evidenceDirectory, record.evidenceDirectory, 'Bound preparation conflict supplies original evidence'); assert.equal(reply.acceptance, preparation || record.actionDigest !== null ? 'yes' : 'no'); assert.equal(reply.acceptanceKind, preparation ? 'preparation' : 'action');
      assert.notEqual(preparation ? preparationDigest(parsePrepareAllocation(argument)) : observedActionDigest(parseObservedAction(argument)), preparation ? record.preparationDigest : record.actionDigest, 'Conflict has a different requested digest');
    } else {
      publicPolicy({ observations: [{ operation, request, reply }] });
      if (reply.code === 'ALLOCATION_NOT_READY' && readyBaseline) {
        assert.ok(record, 'Ready-prefix refusal requires durable allocation');
        assert.equal(record.allocationId, readyBaseline.allocationId, 'Refusal shares the established ready allocation');
        assert.equal(record.actionDigest, null, 'Ready-prefix refusal cannot precede an action binding');
        assert.equal(record.state, 'retained', 'Ready-prefix refusal requires unused retirement');
        assert.equal(record.phase, 'terminal'); assert.equal(record.outcome, 'retired_unused');
        assert.ok(record.reason === 'READY_EXPIRED' || record.reason === 'RETAINED_UNUSED', 'Ready-prefix refusal has an irreversible retirement reason');
      }
      if (reply.code === 'ALLOCATION_BUSY') {
        if (reply.state === 'preparing') assert.equal(readyBaseline, undefined, 'Preparing refusal predates the established ready prefix');
        assert.ok(record, 'Busy reply requires durable allocation');
        assert.equal(reply.allocationId, record.allocationId, 'Busy reply supplies durable allocation identity');
        assert.equal(reply.evidenceDirectory, record.evidenceDirectory, 'Busy reply supplies immutable evidence directory');
        if (reply.state === 'executing') assert.ok(record.actionDigest && record.actionEvidence, 'Busy executing prefix requires durable action');
      }
    }
    return;
  }
  publicPolicy({ observations: [{ operation, request, reply }] });
  assert.ok(record, 'Reply claim requires durable allocation');
  assert.equal(reply.actionId, actionId, 'Reply-to-authority action identity'); assert.equal(reply.allocationId.toUpperCase(), record.allocationId, 'Reply-to-authority allocation identity');
  if (identity.allocationId !== undefined) assert.equal(identity.allocationId.toUpperCase(), record.allocationId, 'Requested allocation identity');
  if (['observed-allocate','prepare_observed_allocation'].includes(operation)) assert.equal(preparationDigest(parsePrepareAllocation(argument)), record.preparationDigest, 'Reply preparation matches request');
  if (['observed-action','start_observed_action'].includes(operation)) assert.equal(observedActionDigest(parseObservedAction(argument)), record.actionDigest, 'Reply action matches request');
  if (reply.device !== null) assert.equal(reply.device.udid, record.device, 'Reply device is durable');
  if (reply.cancellationRequested) assert.equal(record.cancellationRequested, true, 'Cancellation prefix persists');
  if ('kind' in reply) {
    assert.equal(preparation, false, 'Action reply belongs to an action operation');
    if (!['observed-action','start_observed_action'].includes(operation)) assert.equal(reply.disposition, 'retrieved', 'Read reply disposition is retrieved');
    const view = admission.readAction(actionId); assert.ok(view?.kind === 'allocation' && view.attempt && record.actionEvidence, 'Action reply requires durable attempt/evidence');
    const evidence = record.actionEvidence;
    assert.equal(reply.bridgeVersion, evidence.bridgeVersion); assert.equal(reply.evidence.directory, evidence.directory); assert.equal(reply.evidence.request, evidence.request);
    assert.ok(reply.observations <= evidence.observationCount, 'Observation prefix is durable');
    assert.deepEqual(reply.evidence.observations, evidence.observations.slice(0, reply.evidence.observations.length), 'Evidence prefix is durable');
    if (reply.actionAttempted === true) assert.equal(evidence.actionAttempted, true);
    if (reply.actionAcknowledged === true) assert.equal(evidence.actionAcknowledged, true);
    if (reply.authority === 'committed') {
      assert.equal(reply.state, 'terminal', 'Committed action reply is terminal');
      assert.equal(view.attempt.state, 'terminal', 'Reply-to-authority committed terminal'); assert.ok(view.attempt.terminal, 'Reply-to-authority terminal receipt');
      assert.deepEqual(view.attempt.terminal.payload, { outcome: reply.outcome, reason: reply.reason }, 'Reply-to-authority immutable outcome');
      assert.equal(reply.allocationState, record.state); assert.equal(reply.admission, view.admission?.state);
      assert.equal(reply.actionAttempted, evidence.actionAttempted); assert.equal(reply.actionAcknowledged, evidence.actionAcknowledged); assert.equal(reply.observations, evidence.observationCount);
      assert.deepEqual(reply.evidence.observations, evidence.observations, 'Reply-to-authority terminal observations'); if (reply.evidence.terminal !== null) assert.equal(reply.evidence.terminal, evidence.terminal, 'Reply-to-authority terminal export'); if (reply.evidence.exportStatus !== 'pending') assert.equal(reply.evidence.exportStatus, evidence.exportStatus, 'Reply-to-authority settled export');
    } else {
      assert.equal(reply.outcome, null);
      const progression: Record<Exclude<typeof reply.state, 'terminal'>, (typeof evidence.state)[]> = { running: ['running','finalizing','terminal'], finalizing: ['finalizing','terminal'], unresolved: ['running','finalizing','terminal'] };
      assert.ok(reply.state !== 'terminal', 'Uncommitted action prefix is nonterminal');
      assert.ok(progression[reply.state].includes(evidence.state), 'Reply-to-authority action progression');
    }
  } else {
    assert.equal(preparation, true, 'Allocation reply belongs to a preparation/retirement/read operation');
    assert.deepEqual(reply.reservation, { bytes: record.reservationBytes, capacityHeld: record.capacityHeld }, 'Reply retained capacity');
    assert.deepEqual(reply.readinessEvidence, record.readinessEvidence.slice(0, reply.readinessEvidence.length), 'Readiness prefix is durable');
    assert.equal(reply.evidenceRefs[0], record.evidenceDirectory, 'Allocation evidence begins with immutable directory');
    if (reply.readinessEvidence.length) { assert.deepEqual(reply.readinessEvidence, record.readinessEvidence, 'Committed readiness is a complete evidence group'); for (const ref of reply.readinessEvidence) assert.ok(reply.evidenceRefs.includes(ref), 'Allocation evidence retains readiness'); }
    const refs = [...new Set([record.evidenceDirectory, ...record.evidenceRefs])]; assert.deepEqual(reply.evidenceRefs, refs.slice(0, reply.evidenceRefs.length), 'Allocation evidence prefix is durable');
    if (operation.includes('retire') && reply.authority === 'committed') { assert.equal(reply.state, record.state, 'Reply-to-authority retirement state'); assert.equal(reply.outcome, record.outcome, 'Reply-to-authority retirement outcome'); assert.equal(reply.reason, record.reason); assert.equal(reply.phase, 'terminal', 'Retirement success has a durable terminal'); }
    else if (reply.state === 'ready') { assert.ok(record.readyAt !== null && record.expiresAt !== null, 'Ready reply requires durable ready prefix'); assert.deepEqual(reply.readinessEvidence, record.readinessEvidence); }
    else if (reply.state === 'executing') { assert.ok(record.readyAt !== null && record.expiresAt !== null, 'Executing reply requires durable ready prefix'); assert.ok(record.actionDigest && record.actionEvidence, 'Executing reply requires durable action prefix'); assert.deepEqual(reply.readinessEvidence, record.readinessEvidence); }
    else if (reply.state === 'retained' || reply.state === 'quarantined') { assert.equal(reply.state, record.state, 'Reply-to-authority terminal allocation state'); assert.equal(reply.phase, record.phase); if (reply.authority === 'committed') assert.equal(reply.outcome, record.outcome, 'Reply-to-authority terminal allocation outcome'); assert.equal(reply.reason, record.reason); }
    else {
      assert.equal(reply.state, 'preparing'); assert.equal(readyBaseline, undefined, 'Preparing reply predates the established ready prefix');
      if (reply.phase === 'reserved') assert.equal(reply.device?.udid ?? null, record.source.kind === 'create' ? null : record.device, 'Reserved device matches source');
      if (reply.phase === 'creating') assert.equal(record.source.kind, 'create', 'Creating prefix belongs to a create source');
      const prefix = preparingPhaseSchema.parse(reply.phase); const current = allocationPhaseSchema.parse(record.phase);
      assert.ok(allocationPhaseSchema.options.indexOf(prefix) <= allocationPhaseSchema.options.indexOf(current), 'Allocation phase prefix is durable');
    }
  }
}
