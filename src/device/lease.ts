import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { processAlive } from '../process.js';

/**
 * The device lease (see `CONTEXT.md`): a bridge process's exclusive, recorded hold on one device for
 * one run, keyed by the device identity. Every device driver uses it, so bridges of any 1.x version
 * exclude each other. The invariant: when the lease is released, nothing the run started can still act
 * on the device. Until that can be shown, the lease is kept.
 */

/** Where device leases live. Documented so a person can inspect one; the bridge clears stale ones itself. */
export const DEFAULT_LEASE_ROOT = join(tmpdir(), 'jev-ios-bridge-device-locks');

/** Who issues a device command, so a driver can fence one kind at once. Phase 4 adds Android's kinds. */
export type DeviceCommandKind = 'mobilebuildmcp';

/** Who held a lease: the run, its bridge process, and what that run started that outlives a crash. */
export interface LeaseHolder {
  runId?: string;
  /** Undefined when the file names no process. */
  processId?: number;
  /** Driver-defined descriptions of what the holder started (Android: log streams, agent, forward). */
  ownedProcesses: string[];
}

/**
 * The lease file. A 1.1 bridge reads `pid` and `token`, so the iOS file keeps exactly the 1.1 fields;
 * `runId` and `ownedProcesses` are additions written only when set. `deviceId` keeps its 1.1 name.
 */
interface LeaseFile {
  pid: number;
  token: string;
  deviceId: string;
  createdAt: string;
  runId?: string;
  ownedProcesses?: string[];
}

export class DeviceLeaseBusyError extends Error {
  constructor(readonly deviceIdentity: string, readonly holder: LeaseHolder | undefined, readonly path: string) {
    const description = holder?.processId !== undefined ? `bridge process ${String(holder.processId)}` : 'another bridge process';
    super(`Device ${deviceIdentity} is locked by ${description} (lock file ${path}). ` +
      'Wait for that run to finish, or stop that process; the next run then clears the lock.');
    this.name = 'DeviceLeaseBusyError';
  }
}

/** Release was refused: something the run started may still act on the device, so the lease is kept. */
export class DeviceLeaseKeptError extends Error {
  constructor(readonly deviceIdentity: string) {
    super(`Device ${deviceIdentity} lease kept: something the run started may still act on the device`);
    this.name = 'DeviceLeaseKeptError';
  }
}

type DeviceCommandState = 'in flight' | 'exited' | 'unknown' | 'fenced';

/** One command the run issued to the device, in the lease's in-flight ledger. */
export interface DeviceCommand {
  /** The command's outcome is known (success or an acknowledged failure): it can no longer act. */
  exited(): void;
  /** The outcome was lost: the command may still act on the device until it is fenced. */
  unknown(): void;
}

/** A lease file that can't be read or parsed names an unknown holder. Used only while taking the lease. */
async function readHolderFile(path: string): Promise<Partial<LeaseFile> | undefined> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;
    return parsed && typeof parsed === 'object' ? parsed as Partial<LeaseFile> : undefined;
  } catch { return undefined; }
}

function holderOf(file: Partial<LeaseFile>): LeaseHolder {
  return {
    ...(typeof file.runId === 'string' ? { runId: file.runId } : {}),
    ...(Number.isSafeInteger(file.pid) ? { processId: file.pid } : {}),
    ownedProcesses: Array.isArray(file.ownedProcesses) ? file.ownedProcesses.filter(item => typeof item === 'string') : [],
  };
}

/** Writes the temp file rewrite() renames over the lease file. Injectable so a test can interrupt it. */
type TempFileWriter = (path: string, data: string) => Promise<void>;

async function defaultWriteTempFile(path: string, data: string): Promise<void> {
  await writeFile(path, data, { mode: 0o600 });
}

export class DeviceLease {
  private readonly root: string;
  private readonly processId: number;
  private readonly writeTempFile: TempFileWriter;
  private readonly operations = new Set<Promise<unknown>>();
  private readonly commands = new Set<{ kind: DeviceCommandKind; state: DeviceCommandState }>();
  private owned: string[] = [];
  private file: { path: string; deviceIdentity: string; content: LeaseFile } | undefined;
  private late: Promise<void> | undefined;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(options: { root?: string; processId?: number; writeTempFile?: TempFileWriter } = {}) {
    this.root = options.root ?? DEFAULT_LEASE_ROOT;
    this.processId = options.processId ?? process.pid;
    this.writeTempFile = options.writeTempFile ?? defaultWriteTempFile;
  }

  get held(): boolean { return this.file !== undefined; }

  /**
   * Take the lease on a device identity. A live holder makes the device busy. A dead holder loses the
   * lease, and its record is returned so the driver can sweep exactly what that holder started.
   */
  async take(deviceIdentity: string, holder: { runId?: string } = {}): Promise<LeaseHolder | undefined> {
    if (this.file) throw new Error('Device lease is already held');
    await mkdir(this.root, { recursive: true });
    const path = join(this.root, `${deviceIdentity.toUpperCase()}.lock`);
    let handle;
    let deadHolder: LeaseHolder | undefined;
    for (let attempt = 0; !handle; attempt++) {
      try { handle = await open(path, 'wx', 0o600); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const existing = await readHolderFile(path);
        // A holder whose bridge process has exited can't be protecting an in-flight command.
        if (attempt === 0 && existing && !processAlive(existing.pid)) {
          deadHolder = holderOf(existing);
          await unlink(path).catch((unlinkError: NodeJS.ErrnoException) => { if (unlinkError.code !== 'ENOENT') throw unlinkError; });
          continue;
        }
        throw new DeviceLeaseBusyError(deviceIdentity, existing && holderOf(existing), path);
      }
    }
    const content: LeaseFile = { pid: this.processId, token: randomUUID(), deviceId: deviceIdentity,
      createdAt: new Date().toISOString(), ...(holder.runId !== undefined ? { runId: holder.runId } : {}) };
    try { await handle.writeFile(JSON.stringify(content)); }
    catch (error) { await handle.close(); await unlink(path); throw error; }
    await handle.close();
    this.file = { path, deviceIdentity, content };
    this.commands.clear();
    this.owned = [];
    return deadHolder;
  }

  /** Track an operation the run started, which may still issue commands until it settles. */
  track<T>(operation: () => Promise<T>): Promise<T> {
    const pending = Promise.resolve().then(operation);
    this.operations.add(pending);
    const settle = () => { this.operations.delete(pending); };
    void pending.then(settle, settle);
    return pending;
  }

  /** Wait until every tracked operation has settled, including ones started meanwhile. Rejects with the signal's reason if it aborts first. */
  async settle(signal: AbortSignal): Promise<void> {
    while (this.operations.size > 0) {
      if (signal.aborted) throw signal.reason;
      const settled = Promise.allSettled([...this.operations]);
      await new Promise<void>((resolveDone, reject) => {
        const onAbort = () => { signal.removeEventListener('abort', onAbort); reject(signal.reason); };
        signal.addEventListener('abort', onAbort, { once: true });
        void settled.then(() => { signal.removeEventListener('abort', onAbort); resolveDone(); });
      });
    }
  }

  /** Record a command about to be issued to the device. */
  command(kind: DeviceCommandKind): DeviceCommand {
    const entry: { kind: DeviceCommandKind; state: DeviceCommandState } = { kind, state: 'in flight' };
    this.commands.add(entry);
    return {
      exited: () => {
        if (entry.state !== 'in flight' && entry.state !== 'unknown') return;
        entry.state = 'exited';
        this.commands.delete(entry);
      },
      unknown: () => { if (entry.state === 'in flight') entry.state = 'unknown'; },
    };
  }

  /** The fence hook: the driver proved every command of this kind dead, so the unknown ones can't act any more. */
  fence(kind: DeviceCommandKind): void {
    for (const entry of this.commands) if (entry.kind === kind && entry.state === 'unknown') entry.state = 'fenced';
  }

  /** Record something the run started that would outlive a crash, so the next holder can sweep it. */
  async own(description: string): Promise<void> {
    if (this.owned.includes(description)) return;
    this.owned.push(description);
    await this.rewrite([...this.owned]);
  }

  /** Record that something the run owned is confirmed stopped. */
  async disown(description: string): Promise<void> {
    if (!this.owned.includes(description)) return;
    this.owned = this.owned.filter(item => item !== description);
    await this.rewrite([...this.owned]);
  }

  /** True when nothing the run started can still act on the device: every command exited or was fenced, nothing is owned. */
  get releasable(): boolean {
    return this.owned.length === 0 && this.commandsSettled;
  }

  /**
   * Release the lease if it is releasable; otherwise keep it and throw `DeviceLeaseKeptError`. A lease
   * file that can't be read or parsed keeps the lease too: the error is rethrown and the file stays.
   *
   * The read-token-and-unlink step runs as a task on the same write queue as `own()`/`disown()`, so it
   * can't race their writes: it always runs after whichever of their writes was already queued, and
   * before whichever arrives once release is queued. What the run owns is judged when release is called,
   * from `owned`: a `disown()` means the run confirmed that process stopped, even if its write to the
   * file failed. Once its turn comes, release checks again that this is still the same file and that
   * every command exited or was fenced, since the command ledger isn't queued, and keeps the lease if
   * not. An `own()`/`disown()` that arrives after release is queued then runs after it and fails with
   * "not held", instead of racing release's delete with a rename that would put the file back.
   */
  async release(): Promise<void> {
    const file = this.file;
    if (!file) return;
    if (!this.releasable) throw new DeviceLeaseKeptError(file.deviceIdentity);
    const task = this.writeQueue.then(() => this.releaseNow(file));
    this.writeQueue = task.then(() => undefined, () => undefined);
    return task;
  }

  /** The in-flight command ledger isn't queued, so release checks it again once its turn comes. */
  private get commandsSettled(): boolean {
    return [...this.commands].every(entry => entry.state === 'exited' || entry.state === 'fenced');
  }

  private async releaseNow(file: { path: string; deviceIdentity: string; content: LeaseFile }): Promise<void> {
    if (this.file !== file || !this.commandsSettled) throw new DeviceLeaseKeptError(file.deviceIdentity);
    try {
      const current = JSON.parse(await readFile(file.path, 'utf8')) as { token?: string };
      if (current.token === file.content.token) await unlink(file.path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    this.file = undefined;
  }

  /**
   * Keep the lease now and release it late: once every operation in flight settles, run `finish`, which
   * does the driver's remaining cleanup and releases. Commands whose outcome stays unknown still keep it.
   */
  releaseLate(finish: () => Promise<void>): void {
    if (this.operations.size === 0 || this.late) return;
    this.late = Promise.allSettled([...this.operations])
      .then(finish)
      .catch(() => {})
      .finally(() => { this.late = undefined; });
  }

  /**
   * Queue this rewrite behind any write, or release, still in flight, so concurrent `own()`/`disown()`
   * calls on this lease can't interleave their writes. `owned` is `this.owned` as of this call, captured
   * synchronously by the caller, not read fresh when the write actually runs: that keeps a write already
   * queued from picking up an `own()`/`disown()` that arrives later and is queued behind it (behind a
   * `release()` in particular, where that later call fails "not held" and must leave no trace in the file).
   * The last call's write still ends up as the final state, since each later call's own synchronous
   * mutation of `this.owned` happens before it captures its snapshot, which is why the queue's last
   * write always reflects everything that had happened by the time it was queued.
   */
  private rewrite(owned: string[]): Promise<void> {
    const task = this.writeQueue.then(() => this.rewriteNow(owned));
    this.writeQueue = task.then(() => undefined, () => undefined);
    return task;
  }

  /**
   * Write the new record to a private temp file in the same folder, then rename it over the lease file,
   * so the path always holds either the old complete record or the new one, never an empty or partial
   * file. The temp name never ends in `.lock`, so a 1.1 bridge, which only opens `<ID>.lock`, ignores it.
   * On any failure the temp file is cleaned up and the lease file is left exactly as it was.
   */
  private async rewriteNow(owned: string[]): Promise<void> {
    const file = this.file;
    if (!file) throw new Error('Device lease is not held');
    const { ownedProcesses: _previous, ...rest } = file.content;
    const content: LeaseFile = { ...rest, ...(owned.length ? { ownedProcesses: owned } : {}) };
    const tempPath = `${file.path}.${randomUUID()}.tmp`;
    try {
      await this.writeTempFile(tempPath, JSON.stringify(content));
      await rename(tempPath, file.path);
    } catch (error) {
      await unlink(tempPath).catch(() => {});
      throw error;
    }
    file.content = content;
  }
}
