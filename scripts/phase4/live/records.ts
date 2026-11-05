import { createHash } from 'node:crypto';
import { chmod, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod/v4';
import { DEVICE_SCOPES, type DeviceScope, type LiveRow } from './row.js';

/** Why the kit refuses to go on. The code names the reason; the message says it in words. */
export type RefusalCode =
  | 'assignment-missing' | 'assignment-invalid' | 'assignment-permissions' | 'custody-ended' | 'custody-not-begun'
  | 'device-mismatch' | 'unknown-row' | 'no-attempt' | 'missing-artifact' | 'artifact-required' | 'activation-invalid' | 'matrix-invalid'
  | 'scenario-refused';

/** A refusal: the run must not proceed as asked. */
export class Refusal extends Error {
  constructor(readonly code: RefusalCode, message: string) {
    super(message);
    this.name = 'Refusal';
  }
}

const isoMoment = z.string().refine(value => Number.isFinite(Date.parse(value)), 'Expected an ISO timestamp');
const custodySchema = z.strictObject({ from: isoMoment, until: isoMoment });

const assignmentSchema = z.strictObject({
  version: z.literal(1),
  kind: z.literal('device-assignment'),
  assignedBy: z.literal('owner'),
  device: z.string().min(1),
  category: z.enum(DEVICE_SCOPES),
  custody: custodySchema,
});
export type AssignmentRecord = z.infer<typeof assignmentSchema>;

const activationSchema = z.strictObject({
  version: z.literal(1),
  kind: z.literal('store-activation'),
  assignedBy: z.literal('owner'),
  writersStopped: z.literal(true),
  window: custodySchema,
});
export type ActivationRecord = z.infer<typeof activationSchema>;

/** A record read from disk, with where it came from and what it said. */
export interface OwnerFile<T> {
  record: T;
  path: string;
  sha256: string;
}

const UDID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** A simulator UDID is one device whatever its case; an Android serial or AVD name is written as it is. */
export function canonicalDevice(device: string, category: DeviceScope): string {
  return category === 'ios-simulator' && UDID.test(device) ? device.toUpperCase() : device;
}

function issues(error: z.ZodError): string {
  return error.issues.map(issue => `${issue.path.join('.') || 'record'}: ${issue.message}`).join('; ');
}

function parseJson(raw: Buffer, path: string, code: RefusalCode): unknown {
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    throw new Refusal(code, `The record ${path} is invalid: it is not JSON.`);
  }
}

/**
 * The owner's assignment record: the only thing that lets the kit touch a device. It must exist, be the
 * owner's own, name the device asked for, and hold the custody window that covers now.
 */
export async function readAssignment(file: string, options: { cwd: string; now: Date; device?: string | undefined }): Promise<OwnerFile<AssignmentRecord>> {
  const path = resolve(options.cwd, file);
  let raw: Buffer;
  try {
    raw = await readFile(path);
  } catch {
    throw new Refusal('assignment-missing', `The assignment record ${path} does not exist.`);
  }
  const mode = (await stat(path)).mode & 0o777;
  if (mode & 0o022) {
    throw new Refusal('assignment-permissions', `The assignment record ${path} is group- or world-writable; only its owner may write it.`);
  }
  const parsed = assignmentSchema.safeParse(parseJson(raw, path, 'assignment-invalid'));
  if (!parsed.success) {
    throw new Refusal('assignment-invalid', `The assignment record ${path} is invalid: ${issues(parsed.error)}.`);
  }
  const record: AssignmentRecord = { ...parsed.data, device: canonicalDevice(parsed.data.device, parsed.data.category) };
  if (options.device !== undefined && record.device !== canonicalDevice(options.device, record.category)) {
    throw new Refusal('device-mismatch', `The assignment record names device ${record.device}, not ${options.device}.`);
  }
  const now = options.now.getTime();
  if (now < Date.parse(record.custody.from)) {
    throw new Refusal('custody-not-begun', `The assignment record's custody window starts at ${record.custody.from}; ${options.now.toISOString()} is before it.`);
  }
  if (now >= Date.parse(record.custody.until)) {
    throw new Refusal('custody-ended', `The assignment record's custody window ended at ${record.custody.until}; ${options.now.toISOString()} is after it.`);
  }
  return { record, path, sha256: createHash('sha256').update(raw).digest('hex') };
}

/** The owner's activation record: the store writers are stopped, and now is inside the window. */
export async function readActivation(file: string, options: { cwd: string }): Promise<OwnerFile<ActivationRecord>> {
  const path = resolve(options.cwd, file);
  let raw: Buffer;
  try {
    raw = await readFile(path);
  } catch {
    throw new Refusal('activation-invalid', `The activation record ${path} does not exist.`);
  }
  const mode = (await stat(path)).mode & 0o777;
  if (mode & 0o022) {
    throw new Refusal('activation-invalid', `The activation record ${path} is group- or world-writable; only its owner may write it.`);
  }
  const parsed = activationSchema.safeParse(parseJson(raw, path, 'activation-invalid'));
  if (!parsed.success) {
    throw new Refusal('activation-invalid', `The activation record ${path} is invalid: ${issues(parsed.error)}.`);
  }
  return { record: parsed.data, path, sha256: createHash('sha256').update(raw).digest('hex') };
}

/** The private evidence tree of one attempt. */
export interface EvidenceAttempt {
  row: string;
  attempt: number;
  path: string;
  outputs: string;
}

async function privateDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  await chmod(path, 0o700);
}

async function privateFile(path: string, content: string): Promise<void> {
  await writeFile(path, content, { mode: 0o600 });
  await chmod(path, 0o600);
}

async function privateJson(path: string, value: unknown): Promise<void> {
  await privateFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

/** The next attempt number of a row: the highest one already there, plus one. */
async function nextAttempt(rowFolder: string): Promise<number> {
  let highest = 0;
  for (const name of await readdir(rowFolder)) {
    const match = /^attempt-(\d+)$/.exec(name);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return highest + 1;
}

/**
 * Opens the next attempt of a row: its own private folder, the row, the assignment, the versions, and an
 * empty command log. An earlier attempt is never touched, so a second run leaves the first byte-identical.
 */
export async function writeEvidenceAttempt(input: {
  evidence: string;
  row: LiveRow;
  assignment: OwnerFile<AssignmentRecord>;
  activation?: OwnerFile<ActivationRecord> | undefined;
  versions: unknown;
  now: Date;
}): Promise<EvidenceAttempt> {
  const evidence = resolve(input.evidence);
  await privateDir(evidence);
  const rowFolder = join(evidence, input.row.id);
  await privateDir(rowFolder);
  const attempt = await nextAttempt(rowFolder);
  const path = join(rowFolder, `attempt-${String(attempt)}`);
  await privateDir(path);
  const outputs = join(path, 'outputs');
  await privateDir(outputs);
  await privateJson(join(path, 'row.json'), input.row);
  await privateJson(join(path, 'assignment.json'), {
    assignment: input.assignment,
    ...(input.activation ? { activation: input.activation } : {}),
  });
  await privateJson(join(path, 'versions.json'), input.versions);
  await privateJson(join(path, 'artifacts.json'), []);
  await privateFile(join(path, 'commands.jsonl'), '');
  await privateJson(join(path, 'verdict.json'), {
    verdict: 'untested', reason: 'awaiting operator', at: input.now.toISOString(), steps: input.row.steps,
  });
  return { row: input.row.id, attempt, path, outputs };
}
