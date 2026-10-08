/**
 * Whether a process is still running. An id that isn't a positive integer is an unknown owner, and an
 * unknown owner is never assumed dead. A process owned by another user (EPERM) is alive.
 */
export function processAlive(pid: unknown): boolean {
  if (!Number.isSafeInteger(pid) || (pid as number) <= 0) return true;
  try { process.kill(pid as number, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}
