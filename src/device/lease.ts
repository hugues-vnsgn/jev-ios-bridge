import { closeSync, mkdirSync, openSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { AdmissionClaim, MarkerSource } from './admission.js';

export const DEFAULT_LEASE_ROOT = join(tmpdir(), 'jev-ios-bridge-device-locks');

export class DeviceLeaseBusyError extends Error {
  constructor(readonly deviceIdentity: string, readonly holder: { processId?: number; ownedProcesses: string[] } | undefined, readonly path: string, _legacy = false) {
    super(`Device ${deviceIdentity} is locked by ${holder?.processId === undefined ? 'another bridge process' : `bridge process ${holder.processId}`} (lock file ${path}). Admission must release a recorded owner; an unknown marker requires legacy lease import.`);
    this.name = 'DeviceLeaseBusyError';
  }
}

export class CompatibilityMarker {
  private file: { path: string; claim: AdmissionClaim } | undefined;
  constructor(private readonly options: { root?: string } = {}) {}
  get held(): boolean { return this.file !== undefined; }

  assertKnown(deviceIdentity: string, recorded: (token: string, source: MarkerSource) => boolean): void {
    const path = this.path(deviceIdentity);
    let bytes: Buffer;
    try { bytes = readFileSync(path); }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return;
      throw error;
    }
    let existing: unknown;
    try { existing = JSON.parse(bytes.toString('utf8')); } catch {}
    if (!existing || typeof existing !== 'object' || !('token' in existing) || typeof existing.token !== 'string' ||
        !recorded(existing.token, { path: join(realpathSync(dirname(path)), basename(path)), sha256: createHash('sha256').update(bytes).digest('hex') })) {
      throw new DeviceLeaseBusyError(deviceIdentity, existing && typeof existing === 'object' && 'pid' in existing && typeof existing.pid === 'number'
        ? { processId: existing.pid, ownedProcesses: [] } : undefined, path, false);
    }
  }

  private path(deviceIdentity: string): string {
    return join(this.options.root ?? DEFAULT_LEASE_ROOT, `${deviceIdentity.toUpperCase()}.lock`);
  }

  async take(deviceIdentity: string, claim: AdmissionClaim): Promise<void> {
    if (this.file) throw new Error('Compatibility marker already held');
    const root = this.options.root ?? DEFAULT_LEASE_ROOT;
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const path = this.path(deviceIdentity);
    let fd: number;
    try { fd = openSync(path, 'wx', 0o600); }
    catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
      this.assertKnown(deviceIdentity, token => claim.markerKnown(token));
      unlinkSync(path);
      fd = openSync(path, 'wx', 0o600);
    }
    try { writeFileSync(fd, JSON.stringify({ pid: claim.identity.process.pid, token: claim.identity.token, deviceId: deviceIdentity, createdAt: new Date().toISOString() })); }
    finally { closeSync(fd); }
    this.file = { path, claim };
    claim.onRelease(() => this.releaseNow());
  }

  async release(): Promise<void> { this.releaseNow(); }
  private releaseNow(): void {
    const file = this.file;
    if (!file) return;
    if (!file.claim.markerReleased()) throw new Error('Admission has not released this owner');
    try {
      const current: unknown = JSON.parse(readFileSync(file.path, 'utf8'));
      if (current && typeof current === 'object' && 'token' in current && current.token === file.claim.identity.token) unlinkSync(file.path);
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
    }
    this.file = undefined;
  }
}
