import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AdmissionClaim } from './admission.js';

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

  async take(deviceIdentity: string, claim: AdmissionClaim): Promise<void> {
    if (this.file) throw new Error('Compatibility marker already held');
    const root = this.options.root ?? DEFAULT_LEASE_ROOT;
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const path = join(root, `${deviceIdentity.toUpperCase()}.lock`);
    let fd: number;
    try { fd = openSync(path, 'wx', 0o600); }
    catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
      let existing: unknown;
      try { existing = JSON.parse(readFileSync(path, 'utf8')); } catch {}
      if (!existing || typeof existing !== 'object' || !('token' in existing) || typeof existing.token !== 'string' || !claim.markerKnown(existing.token)) {
        throw new DeviceLeaseBusyError(deviceIdentity, existing && typeof existing === 'object' && 'pid' in existing && typeof existing.pid === 'number'
          ? { processId: existing.pid, ownedProcesses: [] } : undefined, path, false);
      }
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
