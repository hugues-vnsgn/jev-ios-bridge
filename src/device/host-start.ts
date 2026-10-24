import { execFileSync } from 'node:child_process';
import type { OwnerProcess } from './admission.js';

/** Reads a host process's start time; throws when `ps` fails or times out. */
export type StartLookup = (pid: number) => string;

export const psStart: StartLookup = pid => execFileSync('/bin/ps', ['-p', String(pid), '-o', 'lstart='], {
  encoding: 'utf8', timeout: 1000, env: { PATH: '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C', TZ: 'UTC' }, stdio: ['ignore', 'pipe', 'ignore'],
}).trim();

/**
 * The identity of a child the bridge just started, for the fence's executor list. A lookup that fails while the
 * child may still be running yields an `unknown-<reason>` incarnation, which the admission store reads as an
 * unproven exit, so the component stays quarantined instead of silently counting as gone.
 */
export function executorOf(pid: number, lookup: StartLookup = psStart): OwnerProcess {
  let incarnation: string;
  try { incarnation = lookup(pid) || 'unknown-no-start-time'; }
  catch (error) {
    const failure = error as { code?: unknown; status?: unknown };
    const reason = typeof failure.code === 'string' ? failure.code : typeof failure.status === 'number' ? `status-${String(failure.status)}` : 'lookup-failed';
    incarnation = `unknown-${reason.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 64)}`;
  }
  return { pid, incarnation };
}
