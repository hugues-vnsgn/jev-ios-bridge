import { constants } from 'node:fs';
import { mkdir, lstat, open } from 'node:fs/promises';
import { dirname, join, isAbsolute } from 'node:path';
import type { Snapshot } from '../contracts/index.js';
import type { ObservedActionRequest } from './schema.js';
import type { ObservedActionSnapshot } from './report.js';
import type { ObservedTapResult } from '../experimental/observed-tap.js';

export interface ObservedEvidenceStore {
  prepare(directory: string, request: ObservedActionRequest): Promise<void>;
  observation(directory: string, snapshot: Snapshot, index: number): Promise<string[]>;
  provisional(directory: string, result: ObservedTapResult): Promise<void>;
  terminal(directory: string, snapshot: ObservedActionSnapshot): Promise<string>;
}
async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, 'r'); try { await handle.sync(); } finally { await handle.close(); }
}
async function writeExclusive(path: string, bytes: string | Buffer): Promise<void> {
  const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  await syncDirectory(dirname(path));
}
async function privateDirectory(path: string): Promise<void> {
  if (!isAbsolute(path)) throw new Error('Evidence requires an absolute directory');
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())) {
    throw new Error('Unsafe observed evidence directory');
  }
}
/** Evidence files are immutable local projections; admission remains the only outcome authority. */
export class FileObservedEvidence implements ObservedEvidenceStore {
  async prepare(directory: string, request: ObservedActionRequest): Promise<void> {
    if (!isAbsolute(directory)) throw new Error('Evidence requires an absolute directory');
    await mkdir(dirname(directory), { recursive: true, mode: 0o700 });
    await privateDirectory(dirname(directory));
    await mkdir(directory, { mode: 0o700 }); await privateDirectory(directory); await syncDirectory(dirname(directory));
    await writeExclusive(join(directory, 'request.json'), JSON.stringify(request, null, 2) + '\n');
  }
  async observation(directory: string, snapshot: Snapshot, index: number): Promise<string[]> {
    if (!Number.isSafeInteger(index) || index < 1) throw new Error('Invalid observation index');
    await privateDirectory(directory);
    const refs: string[] = []; let screenshotPath: string | undefined;
    if (snapshot.screenshotPath) {
      if (!isAbsolute(snapshot.screenshotPath)) throw new Error('Screenshot evidence requires an absolute source');
      const source = await open(snapshot.screenshotPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        const stat = await source.stat();
        if (!stat.isFile() || stat.size > 32 * 1024 * 1024) throw new Error('Invalid screenshot evidence');
        screenshotPath = join(directory, `observation-${index}.jpg`);
        await writeExclusive(screenshotPath, await source.readFile()); refs.push(screenshotPath);
      } finally { await source.close(); }
    }
    const path = join(directory, `observation-${index}.json`);
    await writeExclusive(path, JSON.stringify({ ...snapshot, ...(screenshotPath ? { screenshotPath } : {}) }, null, 2) + '\n');
    return [path, ...refs];
  }
  async provisional(directory: string, result: ObservedTapResult): Promise<void> {
    await privateDirectory(directory);
    await writeExclusive(join(directory, 'provisional-result.json'), JSON.stringify({ authoritative: false, result }, null, 2) + '\n');
  }
  async terminal(directory: string, snapshot: ObservedActionSnapshot): Promise<string> {
    if (snapshot.authority !== 'committed' || snapshot.state !== 'terminal') throw new Error('Only committed actions can be exported');
    await privateDirectory(directory);
    const path = join(directory, 'terminal.json');
    await writeExclusive(path, JSON.stringify(snapshot, null, 2) + '\n'); return path;
  }
}
