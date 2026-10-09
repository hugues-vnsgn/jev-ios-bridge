import { execFile, spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { chmod, lstat, mkdir, open, readdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { createInterface } from 'node:readline';
import { processAlive } from '../../process.js';
/** Where the Android driver writes each run's app log (release spec phase 5 item 1): folder 0700, files 0600. */
export const LOG_FOLDER = join(tmpdir(), 'jev-android-logs');
/** Log files older than this are deleted at the next Android `prepare`. */
const LOG_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1_000;
/** How long a stream gets after SIGTERM before SIGKILL (release spec phase 4 item 8). */
const STOP_GRACE_MS = 1_000;
/** How long a stream gets after SIGKILL before the bridge gives up on it. */
const KILL_WAIT_MS = 2_000;
const EXIT_POLL_MS = 100;
const spawnLogcat = (file, args, options) => spawn(file, args, options);
/** A timer that never keeps the bridge running by itself. */
const unrefSleep = (ms) => new Promise(resolveSleep => { setTimeout(resolveSleep, ms).unref(); });
function psCommandLine(environment) {
    return pid => new Promise(resolveLine => {
        execFile('/bin/ps', ['-p', String(pid), '-o', 'command='], { env: environment }, (error, stdout) => {
            resolveLine(error ? undefined : stdout.trim() || undefined);
        });
    });
}
function signalProcess(pid, signal) {
    try {
        process.kill(pid, signal);
        return true;
    }
    catch (error) {
        if (error.code === 'ESRCH')
            return false;
        throw error;
    }
}
/**
 * The production stream starter: spawns `adb` directly, never through a shell on the Mac, with the Jev key
 * stripped again and `ANDROID_ADB_SERVER_PORT` kept. A file stream's stdout is a descriptor on a file
 * created `O_CREAT|O_EXCL`, mode 0600, so nothing is buffered in the bridge. Its stderr is dropped.
 */
export function logcatStarter(options) {
    const { TYPESAFE_API_KEY: _jevKey, ...environment } = options.environment;
    const spawnChild = options.spawn ?? spawnLogcat;
    const commandLine = options.commandLine ?? psCommandLine(environment);
    const sendSignal = options.sendSignal ?? signalProcess;
    const alive = options.alive ?? ((pid) => processAlive(pid));
    const sleep = options.sleep ?? unrefSleep;
    /** Polls until the pid is gone, for at most `ms`. */
    const goneWithin = async (pid, ms) => {
        for (let waited = 0; alive(pid); waited += EXIT_POLL_MS) {
            if (waited >= ms)
                return false;
            await sleep(EXIT_POLL_MS);
        }
        return true;
    };
    /** SIGTERM, then SIGKILL after 1 s while `stillSame`, until `exitedWithin` confirms the exit; a pid that outlives both throws. */
    const escalate = async (pid, send, exitedWithin, stillSame = async () => true) => {
        if (!send('SIGTERM') || await exitedWithin(STOP_GRACE_MS))
            return;
        if (!await stillSame())
            return;
        if (!send('SIGKILL') || await exitedWithin(KILL_WAIT_MS))
            return;
        throw new Error(`logcat ${String(pid)} did not exit`);
    };
    return {
        async start(args, output, signal) {
            if (signal?.aborted)
                throw signal.reason;
            const file = typeof output === 'string'
                ? await open(output, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600) : undefined;
            let child;
            try {
                child = spawnChild(options.adb, [...args], { env: environment, shell: false, stdio: ['ignore', file?.fd ?? 'pipe', 'ignore'] });
            }
            catch (error) {
                await file?.close();
                throw error;
            }
            // Listen before any await: a spawn failure or a quick exit is then never missed.
            const failed = new Promise(resolveError => { child.once('error', resolveError); });
            child.on('error', () => { });
            let ended = false;
            const closed = new Promise(resolveClosed => { child.once('close', () => { resolveClosed(); }); });
            let delivered = Promise.resolve();
            if (typeof output === 'function' && child.stdout) {
                const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
                lines.on('line', output);
                delivered = new Promise(resolveDelivered => { lines.once('close', resolveDelivered); });
            }
            const exited = Promise.all([closed, delivered]).then(() => { ended = true; });
            // The child holds its own copy of the descriptor.
            await file?.close();
            const pid = child.pid;
            if (pid === undefined) {
                if (typeof output === 'string')
                    await unlink(output).catch(() => undefined);
                throw await failed;
            }
            const exitedWithin = (ms) => Promise.race([exited.then(() => true), sleep(ms).then(() => ended)]);
            return {
                pid,
                exited,
                async stop() {
                    if (ended)
                        return;
                    await escalate(pid, sent => child.kill(sent), exitedWithin);
                },
            };
        },
        async isLeftover(pid, serial) {
            const line = await commandLine(pid);
            if (line === undefined)
                return false;
            // This bridge's own adb path may hold a space; any other adb is its first word.
            const words = line.split(/\s+/);
            const rest = line.startsWith(`${options.adb} `) ? line.slice(options.adb.length + 1).split(/\s+/)
                : basename(words[0]) === 'adb' ? words.slice(1) : undefined;
            // The bridge runs every stream as `adb -s <serial> logcat …`, so `logcat` must be the subcommand.
            return rest !== undefined && rest[0] === '-s' && rest[1] === serial && rest[2] === 'logcat';
        },
        async kill(pid) {
            const line = await commandLine(pid);
            if (line === undefined)
                return;
            // Before SIGKILL, the pid must still name the same process: one that exited may have been reused.
            await escalate(pid, sent => sendSignal(pid, sent), ms => goneWithin(pid, ms), async () => await commandLine(pid) === line);
        },
    };
}
/**
 * The private log folder, created 0700. A path that exists but is a symlink, isn't a directory, or isn't
 * this user's is refused (undefined): the driver then starts no stream. An owned folder is kept at 0700.
 */
export async function privateLogFolder(folder, options = {}) {
    const uid = options.uid ?? process.getuid?.();
    try {
        await mkdir(folder, { mode: 0o700 });
    }
    catch (error) {
        if (error.code !== 'EEXIST')
            return undefined;
    }
    try {
        const found = await lstat(folder);
        if (found.isSymbolicLink() || !found.isDirectory() || found.uid !== uid)
            return undefined;
        if ((found.mode & 0o777) !== 0o700)
            await chmod(folder, 0o700);
        return folder;
    }
    catch {
        return undefined;
    }
}
/** Deletes the regular files in the folder modified more than 3 days ago. A failed delete never throws. */
export async function deleteOldLogs(folder, now = Date.now()) {
    const names = await readdir(folder).catch(() => []);
    for (const name of names) {
        const path = join(folder, name);
        try {
            const found = await lstat(path);
            if (found.isFile() && now - found.mtimeMs > LOG_MAX_AGE_MS)
                await unlink(path);
        }
        catch { /* a failed clean-up never fails the run */ }
    }
}
