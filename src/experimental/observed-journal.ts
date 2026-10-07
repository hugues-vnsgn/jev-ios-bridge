import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, unlink, link } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface ObservedIntent { deviceId: string; actionId: string; intent: unknown }
export interface ObservedRecord extends ObservedIntent {
  status: 'in-flight' | 'completed' | 'uncertain';
  result?: unknown;
  reason?: string;
}
export interface ObservedAttempt {
  readonly actionId: string;
  complete(result: unknown): Promise<void>;
  uncertain(reason: string): Promise<void>;
}

const absent = (error: unknown): boolean => (error as NodeJS.ErrnoException).code === 'ENOENT';
const exists = (error: unknown): boolean => (error as NodeJS.ErrnoException).code === 'EEXIST';
function key(value: string): string {
  if (!value || value.length > 1024) throw new Error('A bounded nonempty journal identity is required');
  return createHash('sha256').update(value).digest('hex');
}
async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}
async function readOptional(path: string): Promise<string | undefined> {
  try { return await readFile(path, 'utf8'); } catch (error) { if (absent(error)) return undefined; throw error; }
}

/** Persistent experimental admission journal. Quarantine is never automatically removed.
 * A caller must keep the attempt from begin() before preparing or acting on a device.
 * Reopening an unfinished attempt or conflicting admission conservatively retires the device.
 * Completion describes the caller's observation, never native input settlement.
 */
export class ObservedActionJournal {
  constructor(readonly root: string) {}

  private directory(deviceId: string): string { return join(this.root, key(deviceId)); }
  private attemptPath(deviceId: string, actionId: string): string {
    return join(this.directory(deviceId), `${key(actionId)}.intent.json`);
  }
  private resultPath(deviceId: string, actionId: string): string {
    return join(this.directory(deviceId), `${key(actionId)}.result.json`);
  }
  private async ensure(deviceId: string): Promise<string> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await syncDirectory(dirname(this.root));
    const directory = this.directory(deviceId);
    await mkdir(directory, { mode: 0o700 }).catch(error => { if (!exists(error)) throw error; });
    await syncDirectory(this.root);
    return directory;
  }
  private async publish(path: string, value: unknown): Promise<void> {
    const data = JSON.stringify(value); // Fail before creating any partially encoded record.
    const temporary = `${path}.${randomUUID()}.tmp`;
    const handle = await open(temporary, 'wx', 0o600);
    try { await handle.writeFile(data); await handle.sync(); } finally { await handle.close(); }
    try {
      await link(temporary, path); // Exclusive publication; a completed record is never overwritten.
      await syncDirectory(dirname(path));
    } finally { await unlink(temporary); }
  }
  private async quarantine(deviceId: string, reason: string): Promise<void> {
    const directory = await this.ensure(deviceId);
    try { await this.publish(join(directory, 'quarantine.json'), { deviceId, reason }); }
    catch (error) { if (!exists(error)) throw error; }
  }
  async deviceStatus(deviceId: string): Promise<'available' | 'quarantined'> {
    const directory = this.directory(deviceId);
    if (await readOptional(join(directory, 'quarantine.json')) !== undefined) return 'quarantined';
    if (await readOptional(join(directory, 'claim.json')) !== undefined) {
      await this.quarantine(deviceId, 'Unfinished or unreconciled attempt observed');
      return 'quarantined';
    }
    return 'available';
  }
  async read(deviceId: string, actionId: string): Promise<ObservedRecord | undefined> {
    const result = await readOptional(this.resultPath(deviceId, actionId));
    if (result !== undefined) return JSON.parse(result) as ObservedRecord;
    const intent = await readOptional(this.attemptPath(deviceId, actionId));
    if (intent === undefined) return undefined;
    await this.quarantine(deviceId, 'Unfinished attempt reopened');
    return { ...JSON.parse(intent) as ObservedIntent, status: 'uncertain', reason: 'Unfinished attempt reopened' };
  }
  async begin(input: ObservedIntent): Promise<ObservedAttempt> {
    // Snapshot now; later caller mutation cannot change the recorded intent.
    const intent = JSON.parse(JSON.stringify(input)) as ObservedIntent;
    key(intent.actionId);
    const directory = await this.ensure(intent.deviceId);
    if (await readOptional(this.attemptPath(intent.deviceId, intent.actionId)) !== undefined) {
      throw new Error('Action identity was already admitted; replay refused');
    }
    if (await readOptional(join(directory, 'quarantine.json')) !== undefined) throw new Error('Device is quarantined');
    const claimPath = join(directory, 'claim.json');
    const token = randomUUID();
    const claim = await open(claimPath, 'wx', 0o600).catch(async error => {
      if (exists(error)) { await this.quarantine(intent.deviceId, 'Conflicting or unfinished admission'); }
      throw error;
    });
    try {
      await claim.writeFile(JSON.stringify({ ...intent, token }));
      await claim.sync();
    } finally { await claim.close(); }
    await syncDirectory(directory);
    await this.publish(this.attemptPath(intent.deviceId, intent.actionId), { ...intent, status: 'in-flight' });
    // Another observer may have quarantined this device while the intent was being written.
    if (await readOptional(join(directory, 'quarantine.json')) !== undefined) throw new Error('Device is quarantined');
    let closed = false;
    const finish = async (status: 'completed' | 'uncertain', value: unknown): Promise<void> => {
      if (closed) throw new Error('Attempt is already finished');
      closed = true;
      try {
        if (status === 'uncertain') await this.quarantine(intent.deviceId, String(value));
        else if (await readOptional(join(directory, 'quarantine.json')) !== undefined) throw new Error('Device is quarantined');
        const current = JSON.parse(await readFile(claimPath, 'utf8')) as { token?: unknown };
        if (current.token !== token) throw new Error('Journal claim changed');
        await this.publish(this.resultPath(intent.deviceId, intent.actionId), {
          ...intent, status, ...(status === 'completed' ? { result: value } : { reason: String(value) }),
        });
        // A quarantine racing completion remains permanent even after this local claim is removed.
        await unlink(claimPath);
        await syncDirectory(directory);
      } catch (error) {
        // Even a failure after unlink must not reopen admission after an ambiguous durable finish.
        await this.quarantine(intent.deviceId, 'Attempt finalization failed').catch(() => {});
        throw error;
      }
    };
    return { actionId: intent.actionId, complete: result => finish('completed', result), uncertain: reason => finish('uncertain', reason) };
  }
}
