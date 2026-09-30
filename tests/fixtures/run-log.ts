import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RunLog } from '../../src/contracts/index.js';
import { createRunLog } from '../../src/log/index.js';

/**
 * A real run log backed by a fresh temporary directory, cleaned up once `fn` settles (pass or throw).
 * `name` is both the run ID `createRunLog` writes under and, for legibility, part of the temp directory's
 * own name. `root` is the evidence root `createRunLog` wrote under, for a test that reads `run.jsonl` or
 * `report.json` back afterwards (at `root`/`name`).
 */
export async function withRunLog<T>(name: string,
  fn: (log: RunLog, root: string) => Promise<T>,
  options?: { values?: string[] }): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), `jev-${name}-`));
  try {
    const log = await createRunLog(root, name, options);
    return await fn(log, root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
