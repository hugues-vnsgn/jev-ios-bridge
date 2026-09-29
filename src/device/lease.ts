import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The device lease (see `CONTEXT.md`): a bridge process's exclusive, recorded hold on one device for
 * one run, keyed by the device identity. Every device driver uses it, so bridges of any 1.x version
 * exclude each other. The invariant: when the lease is released, nothing the run started can still act
 * on the device. Until that can be shown, the lease is kept.
 */

/** Where device leases live. Documented so a person can inspect one; the bridge clears stale ones itself. */
export const DEFAULT_LEASE_ROOT = join(tmpdir(), 'jev-ios-bridge-device-locks');

/** Who held a lease: the run, its bridge process, and what that run started that outlives a crash. */
export interface LeaseHolder {
  runId?: string;
  /** Undefined when the file names no process. */
  processId?: number;
  /** Driver-defined descriptions of what the holder started (Android: log streams, agent, forward). */
  ownedProcesses: string[];
}

/** The lease file. A 1.1 bridge reads only `pid` and `token`, so both stay; the other fields are additions. */
interface LeaseFile {
  pid: number;
  token: string;
  deviceId: string;
  createdAt: string;
  runId?: string;
  ownedProcesses?: string[];
}

export class DeviceLeaseBusyError extends Error {
  constructor(readonly deviceId: string, readonly holder: LeaseHolder | undefined, readonly path: string) {
    const description = holder?.processId !== undefined ? `bridge process ${String(holder.processId)}` : 'another bridge process';
    super(`Device ${deviceId} is locked by ${description} (lock file ${path}). ` +
      'Wait for that run to finish, or stop that process; the next run then clears the lock.');
    this.name = 'DeviceLeaseBusyError';
  }
}

/** Release was refused: something the run started may still act on the device, so the lease is kept. */
export class DeviceLeaseKeptError extends Error {
  constructor(readonly deviceId: string) {
    super(`Device ${deviceId} lease kept: something the run started may still act on the device`);
    this.name = 'DeviceLeaseKeptError';
  }
}

export type DeviceCommandState = 'in flight' | 'exited' | 'unknown' | 'fenced';

/** One command the run issued to the device, in the lease's in-flight ledger. */
export interface DeviceCommand {
  readonly kind: string;
  readonly state: DeviceCommandState;
  /** The command's outcome is known (success or an acknowledged failure): it can no longer act. */
  exited(): void;
  /** The outcome was lost: the command may still act on the device until it is fenced. */
  unknown(): void;
}

/** A process id that can't be read is an unknown owner, and an unknown owner is never assumed dead. */
export function processAlive(pid: unknown): boolean {
  if (!Number.isSafeInteger(pid) || (pid as number) <= 0) return true;
  try { process.kill(pid as number, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}

async function readLeaseFile(path: string): Promise<Partial<LeaseFile> | undefined> {
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

export class DeviceLease {
  private readonly root: string;
  private readonly processId: number;
  private readonly operations = new Set<Promise<unknown>>();
  private commands = new Set<{ kind: string; state: DeviceCommandState }>();
  private owned: string[] = [];
  private file: { path: string; deviceId: string; content: LeaseFile } | undefined;
  private late: Promise<void> | undefined;

  constructor(options: { root?: string; processId?: number } = {}) {
    this.root = options.root ?? DEFAULT_LEASE_ROOT;
    this.processId = options.processId ?? process.pid;
  }

  get held(): boolean { return this.file !== undefined; }

  /**
   * Take the lease on a device identity. A live holder makes the device busy. A dead holder loses the
   * lease, and its record is returned so the driver can sweep exactly what that holder started.
   */
  async take(deviceId: string, holder: { runId?: string } = {}): Promise<LeaseHolder | undefined> {
    if (this.file) throw new Error('Device lease is already held');
    await mkdir(this.root, { recursive: true });
    const path = join(this.root, `${deviceId.toUpperCase()}.lock`);
    let handle;
    let deadHolder: LeaseHolder | undefined;
    for (let attempt = 0; !handle; attempt++) {
      try { handle = await open(path, 'wx', 0o600); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const existing = await readLeaseFile(path);
        // A holder whose bridge process has exited can't be protecting an in-flight command.
        if (attempt === 0 && existing && !processAlive(existing.pid)) {
          deadHolder = holderOf(existing);
          await unlink(path).catch((unlinkError: NodeJS.ErrnoException) => { if (unlinkError.code !== 'ENOENT') throw unlinkError; });
          continue;
        }
        throw new DeviceLeaseBusyError(deviceId, existing && holderOf(existing), path);
      }
    }
    const content: LeaseFile = { pid: this.processId, token: randomUUID(), deviceId, createdAt: new Date().toISOString(),
      ...(holder.runId !== undefined ? { runId: holder.runId } : {}) };
    try { await handle.writeFile(JSON.stringify(content)); }
    catch (error) { await handle.close(); await unlink(path); throw error; }
    await handle.close();
    this.file = { path, deviceId, content };
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

  get operationsInFlight(): boolean { return this.operations.size > 0; }

  /** Settles once every operation tracked so far has settled. */
  async operationsSettled(): Promise<void> { await Promise.allSettled([...this.operations]); }

  /** Record a command about to be issued to the device. */
  command(kind: string): DeviceCommand {
    const entry: { kind: string; state: DeviceCommandState } = { kind, state: 'in flight' };
    this.commands.add(entry);
    return {
      kind,
      get state() { return entry.state; },
      exited: () => {
        if (entry.state !== 'in flight' && entry.state !== 'unknown') return;
        entry.state = 'exited';
        this.commands.delete(entry);
      },
      unknown: () => { if (entry.state === 'in flight') entry.state = 'unknown'; },
    };
  }

  /** The fence hook: the driver proved every command of this kind dead, so the unknown ones can't act any more. */
  fence(kind: string): void {
    for (const entry of this.commands) if (entry.kind === kind && entry.state === 'unknown') entry.state = 'fenced';
  }

  /** Record something the run started that would outlive a crash, so the next holder can sweep it. */
  async own(description: string): Promise<void> {
    if (this.owned.includes(description)) return;
    this.owned.push(description);
    await this.rewrite();
  }

  /** Record that something the run owned is confirmed stopped. */
  async disown(description: string): Promise<void> {
    if (!this.owned.includes(description)) return;
    this.owned = this.owned.filter(item => item !== description);
    await this.rewrite();
  }

  /** True when nothing the run started can still act on the device: every command exited or was fenced, nothing is owned. */
  get releasable(): boolean {
    return this.owned.length === 0 && [...this.commands].every(entry => entry.state === 'exited' || entry.state === 'fenced');
  }

  /** Release the lease if it is releasable; otherwise keep it and throw `DeviceLeaseKeptError`. */
  async release(): Promise<void> {
    const file = this.file;
    if (!file) return;
    if (!this.releasable) throw new DeviceLeaseKeptError(file.deviceId);
    try {
      const current = await readLeaseFile(file.path);
      if (current?.token === file.content.token) await unlink(file.path);
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
    this.late = this.operationsSettled()
      .then(finish)
      .catch(() => {})
      .finally(() => { this.late = undefined; });
  }

  private async rewrite(): Promise<void> {
    const file = this.file;
    if (!file) throw new Error('Device lease is not held');
    file.content = { ...file.content, ...(this.owned.length ? { ownedProcesses: [...this.owned] } : {}) };
    if (!this.owned.length) delete file.content.ownedProcesses;
    await writeFile(file.path, JSON.stringify(file.content));
  }
}

/** The last 4 KiB of an app log file, or a bracketed reason it can't be read. Shared by the device drivers. */
export async function readLogTail(path: string): Promise<string> {
  try {
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await file.stat();
      if (!stat.isFile()) return '[unavailable: not a regular file]';
      const length = Math.min(stat.size, 4_096);
      if (length === 0) return '';
      const bytes = Buffer.alloc(length);
      const { bytesRead } = await file.read(bytes, 0, length, stat.size - length);
      return bytes.subarray(0, bytesRead).toString('utf8');
    } finally { await file.close(); }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return `[unavailable: ${code && /^[A-Z0-9_]+$/.test(code) ? code : 'READ_FAILED'}]`;
  }
}
