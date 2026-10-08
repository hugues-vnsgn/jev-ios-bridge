import * as nativeFs from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { sourceClock } from './create-source.js';
export class ArtifactError extends Error {
    reason;
    constructor(reason, message) {
        super(message);
        this.reason = reason;
    }
}
const invalid = (message) => { throw new ArtifactError('ARTIFACT_INVALID', message); };
const incompatible = (message) => { throw new ArtifactError('ARTIFACT_INCOMPATIBLE', message); };
const contains = (root, path) => { const r = relative(root, path); return r === '' || (!isAbsolute(r) && r !== '..' && !r.startsWith(`..${sep}`)); };
const version = (value) => typeof value === 'string' && /^\d{1,3}\.\d{1,3}(?:\.\d{1,3})?$/.test(value)
    ? value.split('.').map(Number) : invalid('Missing or invalid OS version');
const newer = (a, b) => { for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0))
        return (a[i] ?? 0) > (b[i] ?? 0);
} return false; };
const stamp = (s) => `${s.dev}:${s.ino}:${s.size}:${s.mtimeMs}:${s.ctimeMs}:${s.mode}:${s.uid}:${s.gid}:${s.nlink}`;
function checkImmutable(s) {
    if (s.uid !== process.getuid?.() || (!s.isSymbolicLink() && ((s.mode & 0o222) !== 0 || (s.mode & 0o077) !== 0)) || (s.isFile() && s.nlink !== 1))
        invalid('Staged artifact is no longer immutable and private');
}
async function fileDigest(path, fs, maxBytes, expected, signal, immutable = false) {
    const handle = await fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
        const before = await handle.stat();
        if (stamp(before) !== stamp(expected))
            invalid('Artifact changed before reading');
        if (immutable)
            checkImmutable(before);
        if (!before.isFile() || before.size > maxBytes)
            invalid('Artifact size limit exceeded');
        const hash = createHash('sha256');
        const chunk = Buffer.alloc(65536);
        let bytes = 0;
        while (true) {
            signal?.throwIfAborted();
            const read = await handle.read(chunk, 0, chunk.length, null);
            if (!read.bytesRead)
                break;
            bytes += read.bytesRead;
            if (bytes > maxBytes)
                invalid('Artifact size limit exceeded');
            hash.update(chunk.subarray(0, read.bytesRead));
        }
        const after = await handle.stat();
        if (immutable)
            checkImmutable(after);
        if (stamp(before) !== stamp(after) || stamp(before) !== stamp(await fs.lstat(path)))
            invalid('Artifact changed while reading');
        return { digest: hash.digest('hex'), bytes, stamp: stamp(before) };
    }
    finally {
        await handle.close();
    }
}
async function tree(root, fs, maxBytes, signal, immutable = false) {
    const rootStat = await fs.lstat(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
        invalid('Artifact must be a real directory');
    root = await fs.realpath(root);
    const entries = [];
    let bytes = 0;
    async function walk(path) {
        signal?.throwIfAborted();
        const s = await fs.lstat(path);
        const name = relative(root, path);
        if (immutable)
            checkImmutable(s);
        if (entries.length >= 100000)
            invalid('Artifact entry limit exceeded');
        if (s.isSymbolicLink()) {
            const link = await fs.readlink(path);
            if (isAbsolute(link) || !contains(root, resolve(dirname(path), link)) || !contains(root, await fs.realpath(path)))
                invalid('Artifact symlink escapes its bundle');
            bytes += Buffer.byteLength(link);
            if (bytes > maxBytes)
                invalid('Artifact size limit exceeded');
            entries.push({ path: name, kind: 'link', digest: link, bytes: Buffer.byteLength(link), executable: false, stamp: stamp(s) });
        }
        else if (s.isDirectory()) {
            entries.push({ path: name, kind: 'directory', digest: '', bytes: 0, executable: false, stamp: stamp(s) });
            for (const child of (await fs.readdir(path)).sort())
                await walk(join(path, child));
            if (stamp(s) !== stamp(await fs.lstat(path)))
                invalid('Artifact changed while inspecting');
        }
        else if (s.isFile()) {
            const d = await fileDigest(path, fs, maxBytes - bytes, s, signal, immutable);
            bytes += d.bytes;
            entries.push({ path: name, kind: 'file', ...d, executable: (s.mode & 0o111) !== 0 });
        }
        else
            invalid('Artifact contains an unsupported file type');
    }
    await walk(root);
    const hash = createHash('sha256');
    for (const e of entries)
        hash.update(JSON.stringify([e.path, e.kind, e.digest, e.bytes, e.executable]) + '\n');
    return { entries, digest: hash.digest('hex'), bytes };
}
function sameSource(a, b) { return a.digest === b.digest && a.entries.length === b.entries.length && a.entries.every((e, i) => e.stamp === b.entries[i]?.stamp); }
/** Read modern Mach-O LC_BUILD_VERSION rather than trusting an Info.plist platform label. */
function executableVersion(data, architecture) {
    let slices = [data];
    if (data.length >= 8 && [0xcafebabe, 0xcafebabf].includes(data.readUInt32BE(0))) {
        const fat64 = data.readUInt32BE(0) === 0xcafebabf;
        const count = data.readUInt32BE(4);
        const width = fat64 ? 32 : 20;
        if (count < 1 || count > 32 || 8 + count * width > data.length)
            invalid('Malformed universal executable');
        slices = [];
        for (let i = 0; i < count; i++) {
            const p = 8 + i * width;
            const offset = fat64 ? Number(data.readBigUInt64BE(p + 8)) : data.readUInt32BE(p + 8);
            const size = fat64 ? Number(data.readBigUInt64BE(p + 16)) : data.readUInt32BE(p + 12);
            if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 8 + count * width || size < 32 || offset + size > data.length)
                invalid('Malformed universal executable');
            slices.push(data.subarray(offset, offset + size));
        }
    }
    const cpu = architecture === 'arm64' ? 0x100000c : 0x1000007;
    const matching = slices.filter(b => b.length >= 32 && b.readUInt32LE(0) === 0xfeedfacf && b.readUInt32LE(4) === cpu);
    if (matching.length !== 1)
        incompatible('Executable has no unique compatible architecture');
    const binary = matching[0];
    if (binary.readUInt32LE(12) !== 2)
        incompatible('Bundle executable is not an application executable');
    const count = binary.readUInt32LE(16);
    const commandBytes = binary.readUInt32LE(20);
    if (count > 4096 || commandBytes > binary.length - 32)
        invalid('Malformed executable load commands');
    let offset = 32;
    let minimum;
    for (let i = 0; i < count; i++) {
        if (offset + 8 > 32 + commandBytes)
            invalid('Truncated executable load command');
        const command = binary.readUInt32LE(offset);
        const size = binary.readUInt32LE(offset + 4);
        if (size < 8 || offset + size > 32 + commandBytes)
            invalid('Malformed executable load command');
        if (command === 0x32) {
            if (size < 24 || minimum)
                invalid('Malformed platform metadata');
            if (binary.readUInt32LE(offset + 8) !== 7)
                incompatible('Executable targets a non-simulator platform');
            const os = binary.readUInt32LE(offset + 12);
            minimum = [os >>> 16, (os >>> 8) & 255, os & 255];
        }
        offset += size;
    }
    if (!minimum || offset !== 32 + commandBytes)
        incompatible('Executable lacks valid simulator OS metadata');
    return minimum;
}
async function metadata(path, request, deps, fs) {
    deps.signal?.throwIfAborted();
    const controller = new AbortController();
    const signal = controller.signal;
    const cancel = () => controller.abort();
    const clock = deps.clock ?? sourceClock;
    const timer = clock.setTimeout(cancel, 10000);
    deps.signal?.addEventListener('abort', cancel, { once: true });
    let rejectAbort;
    const abortion = new Promise((_resolve, reject) => { rejectAbort = () => reject(new Error('Metadata inspection cancelled')); });
    signal.addEventListener('abort', rejectAbort, { once: true });
    let result;
    try {
        result = await Promise.race([deps.process('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', join(path, 'Info.plist')], { signal, timeoutMs: 10000, maxOutputBytes: 65536, shell: false }), abortion]);
    }
    catch (error) {
        try {
            deps.diagnostics?.(error);
        }
        catch { /* Private diagnostic failure does not authorize preparation. */ }
        throw error;
    }
    finally {
        clock.clearTimeout(timer);
        deps.signal?.removeEventListener('abort', cancel);
        signal.removeEventListener('abort', rejectAbort);
    }
    deps.diagnostics?.(result);
    signal.throwIfAborted();
    if (result.exitCode !== 0 || Buffer.byteLength(result.stdout) > 65536 || Buffer.byteLength(result.stderr) > 65536)
        invalid('Info.plist could not be read');
    let p;
    try {
        p = JSON.parse(result.stdout);
    }
    catch {
        return invalid('Info.plist is malformed');
    }
    if (!p || Array.isArray(p) || p.CFBundleIdentifier !== request.bundleId || p.CFBundlePackageType !== 'APPL'
        || typeof p.CFBundleExecutable !== 'string' || !/^[A-Za-z0-9_. -]{1,255}$/.test(p.CFBundleExecutable) || ['.', '..'].includes(p.CFBundleExecutable))
        invalid('Bundle metadata is missing or mismatched');
    if (!Array.isArray(p.CFBundleSupportedPlatforms) || p.CFBundleSupportedPlatforms.length !== 1 || p.CFBundleSupportedPlatforms[0] !== 'iPhoneSimulator'
        || (p.DTPlatformName !== undefined && p.DTPlatformName !== 'iphonesimulator'))
        incompatible('Bundle targets a non-simulator platform');
    const plistMinimum = version(p.MinimumOSVersion);
    const runtime = version(request.target.runtimeVersion);
    const executable = p.CFBundleExecutable;
    const executablePath = join(path, executable);
    const stat = await fs.lstat(executablePath);
    if (!stat.isFile() || !(stat.mode & 0o111) || stat.size > request.maxBytes)
        invalid('Bundle executable is invalid');
    const handle = await fs.open(executablePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    let binary;
    try {
        const chunks = [];
        let bytes = 0;
        while (true) {
            signal.throwIfAborted();
            deps.signal?.throwIfAborted();
            const chunk = Buffer.alloc(65536);
            const read = await handle.read(chunk, 0, chunk.length, null);
            if (!read.bytesRead)
                break;
            bytes += read.bytesRead;
            if (bytes > stat.size || bytes > request.maxBytes)
                invalid('Executable changed while inspecting');
            chunks.push(chunk.subarray(0, read.bytesRead));
        }
        binary = Buffer.concat(chunks);
        if (bytes !== stat.size || stamp(stat) !== stamp(await handle.stat()))
            invalid('Executable changed while inspecting');
    }
    finally {
        await handle.close();
    }
    const executableMinimum = executableVersion(binary, request.target.architecture);
    if (newer(plistMinimum, runtime) || newer(executableMinimum, runtime))
        incompatible('App minimum OS exceeds the configured runtime');
    const minimum = newer(executableMinimum, plistMinimum) ? executableMinimum : plistMinimum;
    return Object.freeze({ bundleId: request.bundleId, executable, architecture: request.target.architecture,
        minimumOSVersion: minimum.join('.'), build: Object.freeze({ ...request.build }) });
}
function validate(request) {
    if (!isAbsolute(request.artifactPath) || request.artifactPath.length > 4096 || !request.artifactPath.endsWith('.app')
        || !isAbsolute(request.stagingRoot) || !Number.isSafeInteger(request.maxBytes) || request.maxBytes < 1
        || !/^[A-Za-z0-9][A-Za-z0-9.-]{0,499}$/.test(request.bundleId)
        || !request.build || ![request.build.id, request.build.origin].every(s => typeof s === 'string' && !!s.trim() && s.length <= 500 && !s.includes('\0'))
        || !['arm64', 'x86_64'].includes(request.target.architecture))
        invalid('Artifact request is invalid');
    version(request.target.runtimeVersion);
}
/** Offline inspection; never stages or mutates the original bundle. */
export async function inspectArtifact(request, deps) {
    try {
        validate(request);
        const fs = deps.fs ?? nativeFs;
        const before = await tree(request.artifactPath, fs, request.maxBytes, deps.signal);
        const inspected = await metadata(request.artifactPath, request, deps, fs);
        if (!sameSource(before, await tree(request.artifactPath, fs, request.maxBytes, deps.signal)))
            invalid('Artifact changed during inspection');
        return { metadata: inspected, bytes: before.bytes, contentDigest: before.digest };
    }
    catch (error) {
        if (error instanceof ArtifactError)
            throw error;
        throw new ArtifactError('ARTIFACT_INVALID', 'Artifact inspection failed');
    }
}
/** Call only after reservation. Source mutation refuses preparation; no device operation occurs here. */
export async function stageArtifact(request, deps) {
    let container;
    const stagedDirectories = [];
    const fs = deps.fs ?? nativeFs;
    try {
        validate(request);
        const root = await fs.lstat(request.stagingRoot);
        const stagingRoot = await fs.realpath(request.stagingRoot);
        if (!root.isDirectory() || root.isSymbolicLink() || (root.mode & 0o777) !== 0o700 || root.uid !== process.getuid?.()
            || contains(await fs.realpath(request.artifactPath), stagingRoot))
            invalid('Staging root must be a private real directory');
        const before = await tree(request.artifactPath, fs, request.maxBytes, deps.signal);
        container = await fs.mkdtemp(join(stagingRoot, 'artifact-'));
        await fs.chmod(container, 0o700);
        const stagedPath = join(container, basename(request.artifactPath));
        for (const entry of before.entries) {
            deps.signal?.throwIfAborted();
            const destination = join(stagedPath, entry.path);
            const source = join(request.artifactPath, entry.path);
            if (entry.kind === 'directory') {
                await fs.mkdir(destination, { mode: 0o700 });
                stagedDirectories.push(destination);
            }
            else if (entry.kind === 'link')
                await fs.symlink(entry.digest, destination);
            else {
                const input = await fs.open(source, constants.O_RDONLY | constants.O_NOFOLLOW);
                let output;
                try {
                    output = await fs.open(destination, 'wx', entry.executable ? 0o500 : 0o400);
                    if (stamp(await input.stat()) !== entry.stamp)
                        invalid('Artifact changed before copying');
                    const buffer = Buffer.alloc(65536);
                    const hash = createHash('sha256');
                    let bytes = 0;
                    while (true) {
                        deps.signal?.throwIfAborted();
                        const read = await input.read(buffer, 0, buffer.length, null);
                        if (!read.bytesRead)
                            break;
                        bytes += read.bytesRead;
                        if (bytes > entry.bytes)
                            invalid('Artifact changed while copying');
                        hash.update(buffer.subarray(0, read.bytesRead));
                        let written = 0;
                        while (written < read.bytesRead) {
                            const result = await output.write(buffer, written, read.bytesRead - written, null);
                            if (!result.bytesWritten)
                                invalid('Artifact copy failed');
                            written += result.bytesWritten;
                        }
                    }
                    if (bytes !== entry.bytes || hash.digest('hex') !== entry.digest || stamp(await input.stat()) !== entry.stamp)
                        invalid('Artifact changed while copying');
                    await output.sync();
                }
                finally {
                    try {
                        await input.close();
                    }
                    finally {
                        await output?.close();
                    }
                }
                await fs.chmod(destination, entry.executable ? 0o500 : 0o400);
            }
        }
        if (!sameSource(before, await tree(request.artifactPath, fs, request.maxBytes, deps.signal)))
            invalid('Artifact changed during staging');
        const inspected = await metadata(stagedPath, request, deps, fs);
        if (!sameSource(before, await tree(request.artifactPath, fs, request.maxBytes, deps.signal)))
            invalid('Artifact changed before staging completion');
        for (const entry of [...before.entries].reverse())
            if (entry.kind === 'directory')
                await fs.chmod(join(stagedPath, entry.path), 0o500);
        const staged = await tree(stagedPath, fs, request.maxBytes, deps.signal, true);
        if (staged.digest !== before.digest)
            invalid('Staged artifact differs from source');
        return Object.freeze({ stagedPath, contentDigest: staged.digest, bytes: staged.bytes, maxBytes: request.maxBytes, metadata: inspected });
    }
    catch (error) {
        // Failed staging is local cleanup only. Never touch the submitted artifact or any device.
        if (container) {
            try {
                for (const directory of stagedDirectories) {
                    const s = await fs.lstat(directory);
                    if (s.isDirectory() && !s.isSymbolicLink())
                        await fs.chmod(directory, 0o700);
                }
                await fs.rm(container, { recursive: true, force: true });
            }
            catch { /* Retain inaccessible diagnostics for the owner. */ }
        }
        if (error instanceof ArtifactError)
            throw error;
        throw new ArtifactError('ARTIFACT_INVALID', 'Artifact staging failed');
    }
}
/** Re-hash immediately before install; read-only modes are not an ownership or trust certificate. */
export async function verifyStagedArtifact(receipt, deps = {}) {
    try {
        if (!isAbsolute(receipt.stagedPath) || !/^[a-f0-9]{64}$/.test(receipt.contentDigest) || !Number.isSafeInteger(receipt.maxBytes) || receipt.maxBytes < 1)
            invalid('Invalid staged artifact receipt');
        const fs = deps.fs ?? nativeFs;
        const parent = await fs.lstat(dirname(receipt.stagedPath));
        if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o777) !== 0o700 || parent.uid !== process.getuid?.())
            invalid('Staged artifact private container changed');
        const staged = await tree(receipt.stagedPath, fs, receipt.maxBytes, deps.signal, true);
        if (staged.digest !== receipt.contentDigest || staged.bytes !== receipt.bytes)
            invalid('Staged artifact content changed');
    }
    catch (error) {
        if (error instanceof ArtifactError)
            throw error;
        throw new ArtifactError('ARTIFACT_INVALID', 'Staged artifact verification failed');
    }
}
