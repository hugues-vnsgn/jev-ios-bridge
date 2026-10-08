/**
 * Whether a process is still running. An id that isn't a positive integer is an unknown owner, and an
 * unknown owner is never assumed dead. A process owned by another user (EPERM) is alive.
 */
export function processAlive(pid) {
    if (!Number.isSafeInteger(pid) || pid <= 0)
        return true;
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return error.code === 'EPERM';
    }
}
