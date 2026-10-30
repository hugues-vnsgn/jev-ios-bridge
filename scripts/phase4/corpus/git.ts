import { execFileSync } from 'node:child_process';
import { FROZEN_COMMITS, REPO_ROOT } from './sources.js';

export interface ObjectRef { commit: string; path: string }
export interface Blob extends ObjectRef { blob: string; bytes: Buffer }

export class MissingGitObjectError extends Error {
  constructor(readonly missing: string[]) {
    super(`missing git objects: ${missing.join(', ')}`);
    this.name = 'MissingGitObjectError';
  }
}

const git = (args: string[], input?: string): Buffer =>
  execFileSync('git', args, { cwd: REPO_ROOT, input, maxBuffer: 256 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });

const spec = (ref: ObjectRef): string => `${ref.commit}:${ref.path}`;

/** Object ids for blobs or trees, through one `git cat-file --batch-check`. */
export function objectIds(refs: readonly ObjectRef[]): string[] {
  const lines = git(['cat-file', '--batch-check=%(objectname) %(objecttype)'], refs.map(spec).join('\n') + '\n')
    .toString('utf8').trimEnd().split('\n');
  const missing = refs.filter((_, index) => !/^[0-9a-f]{40} (blob|tree)$/.test(lines[index] ?? '')).map(spec);
  if (missing.length) throw new MissingGitObjectError(missing);
  return lines.map(line => line.slice(0, 40));
}

/** Bytes and object ids for blobs, in input order, through one `git cat-file --batch`. */
export function readBlobs(refs: readonly ObjectRef[]): Blob[] {
  if (refs.length === 0) return [];
  const output = git(['cat-file', '--batch'], refs.map(spec).join('\n') + '\n');
  const blobs: Blob[] = [];
  const missing: string[] = [];
  let offset = 0;
  for (const ref of refs) {
    const end = output.indexOf(0x0a, offset);
    const header = output.subarray(offset, end).toString('utf8');
    const match = /^([0-9a-f]{40}) (\w+) (\d+)$/.exec(header);
    const size = match ? Number(match[3]) : -1;
    if (match?.[2] === 'blob') blobs.push({ ...ref, blob: match[1]!, bytes: Buffer.from(output.subarray(end + 1, end + 1 + size)) });
    else missing.push(spec(ref));
    offset = end + 1 + (match ? size + 1 : 0);
  }
  if (missing.length) throw new MissingGitObjectError(missing);
  return blobs;
}

/** Full paths of the files directly under `dir` at `commit`. */
export function listTree(commit: string, dir: string): string[] {
  return git(['ls-tree', '--name-only', '-z', commit, '--', `${dir}/`]).toString('utf8').split('\0').filter(Boolean);
}

/** False in a shallow clone (CI checks out depth 1), where the frozen commits are absent. */
export function frozenHistoryAvailable(): boolean {
  const commits = Object.values(FROZEN_COMMITS);
  const lines = git(['cat-file', '--batch-check'], commits.map(commit => `${commit}^{commit}`).join('\n') + '\n')
    .toString('utf8').trimEnd().split('\n');
  return commits.every((_, index) => / commit \d+$/.test(lines[index] ?? ''));
}
