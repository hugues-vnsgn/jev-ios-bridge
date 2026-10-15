import { z } from 'zod';
const attempt = z.strictObject({ kind: z.enum(['legacy','observed','preparation']), id: z.string().min(1) });
const owner = z.strictObject({ device: z.string(), attempt, token: z.string().min(1), generation: z.number().int().positive(), process: z.strictObject({ pid: z.number().int().positive(), incarnation: z.string().min(1) }) });
const terminal = z.strictObject({ outcome: z.enum(['completed','observed','refused','inconclusive']), disposition: z.enum(['available','quarantined']), payload: z.unknown(), evidenceRefs: z.array(z.string()) });
const view = z.strictObject({ identity: attempt, device: z.string(), digest: z.string(), intent: z.unknown(), owner, state: z.enum(['active','parked','terminal']), cancellationRequested: z.boolean(), terminal: terminal.nullable() });
const common = { requestId: z.number().int().positive() };
export const commandSchema = z.discriminatedUnion('operation', [
 z.strictObject({ ...common, operation: z.literal('acquire'), request: z.strictObject({ device: z.string(), attempt, digest: z.string(), intent: z.unknown() }) }),
 z.strictObject({ ...common, operation: z.literal('finalize'), terminal }),
 z.strictObject({ ...common, operation: z.literal('dispatch') }),
 z.strictObject({ ...common, operation: z.literal('exit') }),
]);
export type CoreCommand = z.infer<typeof commandSchema>;
export type CommandInput = { [K in CoreCommand['operation']]: Omit<Extract<CoreCommand, { operation: K }>, 'requestId'> }[CoreCommand['operation']];
const diagnostics = { phase: z.enum(['constructor','acquire','attach','authorize','dispatch','settle','finalize','exit']), message: z.string(), errorClass: z.string(), stack: z.string().nullable(), code: z.string().nullable() };
const failure = z.discriminatedUnion('kind', [
 z.strictObject({ kind: z.literal('state-unavailable'), ...diagnostics, code: z.literal('STATE_UNAVAILABLE'), errorClass: z.literal('AdmissionError') }),
 z.strictObject({ kind: z.literal('unexpected-error'), ...diagnostics }),
]);
const acquired = z.strictObject({ kind: z.literal('acquired'), owner });
const refused = z.strictObject({ kind: z.literal('refused'), reason: z.enum(['DEVICE_BUSY','DEVICE_QUARANTINED','ACTION_ID_CONFLICT','CANCELLED','HOST_CREATION_UNRESOLVED']), blockingAllocationId: z.string().optional() });
const retrieved = z.strictObject({ kind: z.literal('retrieved'), attempt: view });
export const acquisitionSchema = z.union([acquired, refused, retrieved, failure]);
const finalization = z.discriminatedUnion('authority', [z.strictObject({ authority: z.literal('committed'), attempt: view }),z.strictObject({ authority: z.literal('unconfirmed'), reason: z.literal('FINALIZATION_UNCONFIRMED') })]);
const evidence = { effects: z.number().int().nonnegative(), authorizations: z.array(owner), entries: z.array(z.strictObject({ owner, authorizationSeenAtEntry: z.boolean() })) };
const envelope = { type: z.literal('reply'), requestId: common.requestId, actor: z.number().int().positive(), ...evidence };
export const replySchema = z.discriminatedUnion('operation', [
 z.strictObject({ ...envelope, operation: z.literal('acquire'), result: acquisitionSchema }),
 z.strictObject({ ...envelope, operation: z.literal('finalize'), result: z.union([z.strictObject({ kind: z.literal('finalized'), finalization }),failure]) }),
 z.strictObject({ ...envelope, operation: z.literal('dispatch'), result: z.union([z.strictObject({ kind: z.literal('dispatched') }),failure]) }),
]);
export const messageSchema = z.union([z.strictObject({ type: z.literal('ready'), actor: z.number().int().positive() }),replySchema]);
export const controlSchema = z.discriminatedUnion('kind', [
 z.strictObject({ kind: z.literal('hold'), operation: z.literal('acquire'), point: z.literal('beforeCommit'), entered: z.string(), release: z.string() }),
 z.strictObject({ kind: z.literal('unavailable'), operation: z.literal('acquire'), point: z.literal('afterCommit') }),
]);
export const faultSchema = z.strictObject({ type: z.literal('fault'), requestId: common.requestId, actor: z.number().int().positive(), operation: z.enum(['acquire','finalize']), point: z.enum(['beforeCommit','afterCommit']) });
export type CoreReply = z.infer<typeof replySchema>;
export type Acquisition = z.infer<typeof acquisitionSchema>;
export type Finalization = z.infer<typeof finalization>;
export type Control = z.infer<typeof controlSchema>;
export function requireAcquisition({ result, policy = 'strict' }: { result: Acquisition; policy?: 'strict' | 'contention' }) {
 if (result.kind === 'unexpected-error' || (result.kind === 'state-unavailable' && policy === 'strict')) throw new Error(JSON.stringify(result));
 return result;
}
