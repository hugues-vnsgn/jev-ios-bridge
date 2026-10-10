import * as nativeFs from 'node:fs/promises';
import { constants, type Stats, type BigIntStats } from 'node:fs';
import { userInfo, arch, platform } from 'node:os';
import { join, isAbsolute, basename, resolve } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import type { SourceProcess } from './create-source.js';
import { createHash } from 'node:crypto';
import { z } from 'zod/v4';
import { allocationBudgetsSchema, type AllocationBudgets, type AllocationSource } from '../device/admission-allocation.js';
import { canonicalJson } from './allocation-schema.js';
import { simulatorUuid, validSimulatorIdentifiers } from './create-source.js';
import { parseReadonlyMountMetadata } from './installed-plist.js';

export class AllocationPrerequisiteError extends Error {
  constructor(readonly reason: 'CONFIG_INVALID' | 'HOST_PREREQUISITE_MISSING' | 'STORAGE_UNAVAILABLE') { super(reason); }
}
export type AllocationAccount = { homedir: string; uid: number };
export const allocationDefaults: AllocationBudgets = Object.freeze({ maxRetainedAllocations: 8, maxConcurrentPreparations: 1,
  reservationBytesPerAllocation: 8 * 1024 ** 3, maxReservedBytes: 64 * 1024 ** 3,
  minFreeBytes: 20 * 1024 ** 3, maxArtifactBytes: 2 * 1024 ** 3, createTimeoutMs: 60000, bootTimeoutMs: 120000,
  installTimeoutMs: 120000, launchTimeoutMs: 30000, readinessTimeoutMs: 30000, readyTtlMs: 300000, timeoutMs: 360000 });
const text = z.string().min(1).max(500).refine(s => !!s.trim() && !s.includes('\0'));
const inventorySchema = z.strictObject({ inventoryId: text, udid: z.string().regex(simulatorUuid).transform(s => s.toUpperCase()),
  deviceTypeId: text, runtimeId: text, creation: z.strictObject({ createdAt: text.refine(s => Number.isFinite(Date.parse(s))),
    origin: text, evidenceRef: z.string().min(1).max(4096).refine(s => s.startsWith('/') && !s.includes('\0')) }),
  attestation: z.strictObject({ freshUnused: z.literal(true), exclusive: z.literal(true) })
}).refine(s => validSimulatorIdentifiers(s.deviceTypeId, s.runtimeId));
const configSchema = z.strictObject({ version: z.literal(1), ...allocationBudgetsSchema.shape,
  inventory: z.array(inventorySchema).max(1000) }).omit({ timeoutMs: true }).partial().required({ version: true });
export type AllocationConfig = { version: 1; digest: string; budgets: AllocationBudgets; inventory: Extract<AllocationSource, {kind: 'supplied'}>[] };
const stamp = (s: Stats) => `${s.dev}:${s.ino}:${s.size}:${s.mtimeMs}:${s.ctimeMs}:${s.mode}:${s.uid}:${s.nlink}`;
/** File handles and before/after path checks keep unsafe aliases or concurrent replacement from supplying metadata. */
export async function stableFile(path: string, fs: typeof nativeFs, maxBytes = 65536): Promise<Buffer> {
  const before = await fs.lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > maxBytes) throw new Error('Unsafe metadata file');
  const handle = await fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (stamp(before) !== stamp(await handle.stat())) throw new Error('Metadata replaced');
    const chunks: Buffer[] = []; let count = 0;
    while (true) {
      const chunk = Buffer.alloc(65536); const read = await handle.read(chunk, 0, chunk.length, null); if (!read.bytesRead) break;
      count += read.bytesRead; if (count > maxBytes) throw new Error('Metadata too large'); chunks.push(chunk.subarray(0, read.bytesRead));
    }
    if (stamp(before) !== stamp(await handle.stat()) || stamp(before) !== stamp(await fs.lstat(path))) throw new Error('Metadata changed');
    return Buffer.concat(chunks);
  } finally { await handle.close(); }
}
export async function readAllocationConfig(deps: { account?: AllocationAccount; fs?: typeof nativeFs } = {}): Promise<AllocationConfig> {
  const fs = deps.fs ?? nativeFs; const account = deps.account ?? userInfo();
  try {
    let raw: unknown = { version: 1 };
    const directory = join(account.homedir, 'Library/Application Support/jev-ios-bridge');
    const path = join(directory, 'allocation.json');
    let missing = false;
    for (const part of [account.homedir, join(account.homedir, 'Library'), join(account.homedir, 'Library/Application Support'), directory]) {
      try {
        const s = await fs.lstat(part);
        if (!s.isDirectory() || s.isSymbolicLink() || s.uid !== account.uid || (s.mode & 0o022) || (part === directory && (s.mode & 0o777) !== 0o700)) throw new Error();
      } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT' && part !== account.homedir) { missing = true; break; } throw error; }
    }
    if (!missing) {
      try {
        const s = await fs.lstat(path);
        if (s.uid !== account.uid || (s.mode & 0o777) !== 0o600) throw new Error();
        const bytes = await stableFile(path, fs);
        if (stamp(s) !== stamp(await fs.lstat(path))) throw new Error('Configuration changed');
        raw = JSON.parse(bytes.toString('utf8'));
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    const parsed = configSchema.parse(raw); const { version: _version, inventory = [], ...settings } = parsed;
    const budgets = allocationBudgetsSchema.parse({ ...allocationDefaults, ...settings });
    const effective = { version: 1 as const, ...budgets, inventory };
    return { version: 1, digest: createHash('sha256').update(canonicalJson(effective)).digest('hex'), budgets,
      inventory: inventory.map(entry => ({ kind: 'supplied' as const, ...entry })) };
  } catch { throw new AllocationPrerequisiteError('CONFIG_INVALID'); }
}

export type InstalledHost = { fs: typeof nativeFs; account: AllocationAccount; platform: string; architecture: 'arm64' | 'x86_64' };
export function installedHost(): InstalledHost {
  return { fs: nativeFs, account: userInfo(), platform: ['arm64', 'x64'].includes(arch()) ? platform() : 'unsupported', architecture: arch() === 'arm64' ? 'arm64' : 'x86_64' };
}
export const developerDirectory = '/Applications/Xcode.app/Contents/Developer';
const installedPlistOutputLimit = (path: string) => path === '/Applications/Xcode.app/Contents/Info.plist' ? 131072 : 65536;
const cryptexDirectory = '/private/var/run/com.apple.security.cryptexd/mnt';
const cryptexMountName = /^com\.apple\.iPhoneOS\.SimulatorRuntime-v[0-9]{1,3}(?:\.[0-9]{1,5}){2,3}\.[A-Za-z0-9]{1,64}$/;
const legacyDirectory = '/Library/Developer/CoreSimulator/Volumes';
const legacyMountName = /^iOS_[0-9]{1,3}[A-Z]{1,3}[0-9]{1,6}[a-z]?$/;
const runtimeSuffix = '/Library/Developer/CoreSimulator/Profiles/Runtimes';
const childLimit = 8192;
const canonicalInstalledPath = (path: string) => isAbsolute(path) && resolve(path) === path && !path.includes('\0')
  && path.length <= 4096 && path.split('/').every(part => part.length <= 255);
type MountClass = 'cryptex' | 'legacy';
const mountNamespace = (kind: MountClass) => kind === 'cryptex' ? cryptexDirectory : legacyDirectory;
const mountName = (kind: MountClass) => kind === 'cryptex' ? cryptexMountName : legacyMountName;
function mountedNamespace(path: string): MountClass | undefined {
  if (path === cryptexDirectory || path.startsWith(cryptexDirectory + '/')) return 'cryptex';
  if (path === legacyDirectory || (path.startsWith(legacyDirectory + '/')
    && legacyMountName.test(path.slice(legacyDirectory.length + 1).split('/')[0]!))) return 'legacy';
}
function mountedRoot(path: string): string | undefined {
  const kind = mountedNamespace(path); if (!kind || !canonicalInstalledPath(path)) return;
  const namespace = mountNamespace(kind); if (!path.startsWith(namespace + '/')) return;
  const name = path.slice(namespace.length + 1).split('/')[0]!;
  return mountName(kind).test(name) ? namespace + '/' + name : undefined;
}
function mountedMetadataRoot(path: string): string | undefined {
  const mount = mountedRoot(path); if (!mount) return;
  const relative = path.slice((mount + runtimeSuffix).length);
  return path.startsWith(mount + runtimeSuffix + '/') && /^\/[^/\0]{1,255}\.simruntime\/Contents\/(?:Info\.plist|Resources\/profile\.plist|Resources\/RuntimeRoot\/System\/Library\/CoreServices\/SystemVersion\.plist)$/.test(relative) ? mount : undefined;
}
type ExactTime = { unit: 'ns'; value: bigint } | { unit: 'ms'; value: number };
type MountedIdentity = { path: string; dev: bigint; ino: bigint; uid: bigint; gid: bigint; mode: bigint;
  size: bigint; nlink: bigint; type: 'file' | 'directory'; ctime: ExactTime; mtime: ExactTime };
function exactInteger(value: unknown, nonnegative = true): bigint {
  // BigInt cannot restore the original value of an already-rounded Number.
  if ((typeof value !== 'bigint' && (typeof value !== 'number' || !Number.isSafeInteger(value)))
    || (nonnegative && value < 0)) throw new Error('Uncertain installed identity');
  return typeof value === 'bigint' ? value : BigInt(value as number);
}
function exactTime(ms: number | bigint, ns: unknown): ExactTime {
  if (ns !== undefined) return { unit: 'ns', value: exactInteger(ns, false) };
  if (typeof ms !== 'number' || !Number.isFinite(ms) || (Number.isInteger(ms) && !Number.isSafeInteger(ms))) throw new Error('Uncertain installed timestamp');
  return { unit: 'ms', value: ms };
}
function mountedIdentity(path: string, s: Stats | BigIntStats): MountedIdentity {
  const mode = exactInteger(s.mode); const type = s.isFile() ? 'file' : s.isDirectory() ? 'directory' : undefined;
  if (s.isSymbolicLink() || !type || (mode & ~0o177777n) !== 0n
    || (mode & 0o170000n) !== (type === 'file' ? 0o100000n : 0o40000n)) throw new Error('Untrusted installed type');
  const ns = s as BigIntStats;
  if ((ns.ctimeNs === undefined) !== (ns.mtimeNs === undefined)) throw new Error('Uncertain installed timestamp representation');
  return { path, dev: exactInteger(s.dev), ino: exactInteger(s.ino), uid: exactInteger(s.uid), gid: exactInteger(s.gid), mode,
    size: exactInteger(s.size), nlink: exactInteger(s.nlink), type, ctime: exactTime(s.ctimeMs, ns.ctimeNs), mtime: exactTime(s.mtimeMs, ns.mtimeNs) };
}
const sameMountedIdentity = (a: MountedIdentity, b: MountedIdentity) =>
  (['path', 'dev', 'ino', 'uid', 'gid', 'mode', 'size', 'nlink', 'type'] as const).every(key => a[key] === b[key])
  && a.ctime.unit === b.ctime.unit && a.ctime.value === b.ctime.value && a.mtime.unit === b.mtime.unit && a.mtime.value === b.mtime.value;
type MountedSnapshot = { identities: MountedIdentity[]; leaf?: MountedIdentity; missing?: string };
type InstalledExpectation = { readonly mount: MountedSnapshot; readonly path?: MountedSnapshot };
type InstalledProcess = (executable: string, args: readonly string[], options: Parameters<SourceProcess>[2],
  expected?: InstalledExpectation) => ReturnType<SourceProcess>;
// Context travels with each invocation. The public factory never accepts trust
// overrides, and a captured identity never substitutes for a fresh mount proof.
const productionInvokers = new WeakMap<SourceProcess, InstalledProcess>();
/** Mode-based namespace trust, scoped to one read; this is not a kernel pin or an ACL attestation. */
async function mountedSnapshot(path: string, host: InstalledHost, signal: AbortSignal, leafFile = false, allowMissing = false,
  expected?: MountedSnapshot): Promise<MountedSnapshot> {
  const kind = mountedNamespace(path);
  if (!canonicalInstalledPath(path) || !kind) throw new Error('Untrusted mounted path');
  const mount = mountedRoot(path); const paths = ['/']; let current = '/';
  for (const part of path.split('/').filter(Boolean)) { current = join(current, part); paths.push(current); }
  const identities: MountedIdentity[] = []; let mountDevice: bigint | undefined;
  for (const component of paths) {
    signal.throwIfAborted(); let raw: BigIntStats;
    try { raw = await host.fs.lstat(component, { bigint: true }); }
    catch (error) { if (allowMissing && !expected && (error as NodeJS.ErrnoException).code === 'ENOENT') return { identities, missing: component }; throw error; }
    signal.throwIfAborted(); const s = mountedIdentity(component, raw); const file = leafFile && component === path;
    const captured = expected?.identities[identities.length];
    if (captured && !sameMountedIdentity(captured, s)) throw new Error('Mounted candidate changed');
    if (s.type !== (file ? 'file' : 'directory')) throw new Error('Untrusted mounted type');
    if (mount && (component === mount || component.startsWith(mount + '/'))) {
      if (component === mount) mountDevice = s.dev;
      const runtimeRoot = component.endsWith('.simruntime/Contents/Resources/RuntimeRoot')
        && component.startsWith(mount + runtimeSuffix + '/');
      const modes = file ? [0o444n, 0o644n, 0o664n] : runtimeRoot ? [0o755n, 0o775n, 0o1775n] : [0o755n, 0o775n];
      if (s.uid !== 0n || ![0n, 80n].includes(s.gid) || !modes.includes(s.mode & 0o7777n) || s.dev !== mountDevice
        || (file && (s.nlink !== 1n || s.size > 65536n))) throw new Error('Untrusted mounted metadata');
    } else {
      const run = kind === 'cryptex' && component === '/private/var/run' && s.uid === 0n && s.gid === 1n && (s.mode & 0o7777n) === 0o775n;
      const managed = component === '/private/var/run/com.apple.security.cryptexd' || component === cryptexDirectory;
      const rootOwned = (kind === 'legacy' && mount !== undefined) || (kind === 'cryptex' && managed);
      if ((rootOwned ? s.uid !== 0n : ![0n, exactInteger(host.account.uid)].includes(s.uid))
        || ((s.mode & 0o022n) !== 0n && !run)) throw new Error('Untrusted mounted namespace');
    }
    identities.push(s);
  }
  const snapshot = { identities, leaf: identities.at(-1)! };
  if (expected && !mountedPrefixMatches(expected, snapshot)) throw new Error('Mounted candidate changed');
  return snapshot;
}
const mountedPrefixMatches = (prefix: MountedSnapshot, path: MountedSnapshot) => !prefix.missing && !path.missing
  && prefix.identities.length <= path.identities.length && prefix.identities.every((identity, index) => sameMountedIdentity(identity, path.identities[index]!));
const sameMountedSnapshot = (a: MountedSnapshot, b: MountedSnapshot) => a.missing === b.missing && a.identities.length === b.identities.length
  && a.identities.every((identity, index) => sameMountedIdentity(identity, b.identities[index]!));
async function readonlyMountedRoot(mount: string, host: InstalledHost, process: InstalledProcess, signal: AbortSignal,
  expected?: MountedSnapshot): Promise<MountedSnapshot> {
  if (mountedRoot(mount) !== mount) throw new Error('Invalid mounted root');
  const before = await mountedSnapshot(mount, host, signal, false, false, expected);
  signal.throwIfAborted();
  const result = await process('/usr/sbin/diskutil', ['info', '-plist', mount],
    { signal, timeoutMs: 10000, maxOutputBytes: 65536, shell: false }, { mount: expected ?? before });
  signal.throwIfAborted();
  if (result.exitCode !== 0 || Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr) > 65536
    || !sameMountedSnapshot(before, await mountedSnapshot(mount, host, signal, false, false, expected))) throw new Error('Unconfirmed mounted root');
  parseReadonlyMountMetadata(result.stdout, mount); return before;
}
async function mountedBytes(path: string, host: InstalledHost, signal: AbortSignal, snapshot: MountedSnapshot): Promise<Buffer> {
  signal.throwIfAborted(); const handle = await host.fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  const expected = snapshot.leaf!;
  try {
    signal.throwIfAborted(); const opened = await handle.stat({ bigint: true }); signal.throwIfAborted();
    if (!sameMountedIdentity(mountedIdentity(path, opened), expected)) throw new Error('Mounted metadata replaced');
    const chunks: Buffer[] = []; let count = 0;
    while (true) {
      signal.throwIfAborted(); const chunk = Buffer.alloc(65536); const read = await handle.read(chunk, 0, chunk.length, null);
      signal.throwIfAborted();
      if (!read.bytesRead) break; count += read.bytesRead; if (count > 65536) throw new Error('Mounted metadata too large');
      chunks.push(chunk.subarray(0, read.bytesRead));
    }
    signal.throwIfAborted(); const final = await handle.stat({ bigint: true }); signal.throwIfAborted();
    if (!sameMountedIdentity(mountedIdentity(path, final), expected)
      || !sameMountedSnapshot(snapshot, await mountedSnapshot(path, host, signal, true, false, snapshot))) throw new Error('Mounted metadata changed');
    return Buffer.concat(chunks);
  } finally { await handle.close(); }
}
async function convertMounted(path: string, host: InstalledHost, process: InstalledProcess, signal: AbortSignal,
  convert: (expected: InstalledExpectation) => ReturnType<SourceProcess>, expected?: InstalledExpectation): ReturnType<SourceProcess> {
  const mount = mountedMetadataRoot(path); if (!mount) throw new Error('Untrusted mounted metadata target');
  const beforeMount = await readonlyMountedRoot(mount, host, process, signal, expected?.mount);
  const before = await mountedSnapshot(path, host, signal, true, false, expected?.path ?? expected?.mount);
  if (!mountedPrefixMatches(beforeMount, before)) throw new Error('Mounted root changed');
  const bytes = await mountedBytes(path, host, signal, before); signal.throwIfAborted();
  const context: InstalledExpectation = { mount: expected?.mount ?? beforeMount, path: before };
  const result = await convert(context); signal.throwIfAborted();
  const afterMount = await readonlyMountedRoot(mount, host, process, signal, context.mount);
  const after = await mountedSnapshot(path, host, signal, true, false, before);
  if (result.exitCode !== 0 || Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr) > 65536
    || !mountedPrefixMatches(afterMount, after) || !sameMountedSnapshot(beforeMount, afterMount) || !sameMountedSnapshot(before, after)) throw new Error('Unconfirmed mounted metadata');
  const confirmedBytes = await mountedBytes(path, host, signal, after); signal.throwIfAborted();
  if (!bytes.equals(confirmedBytes)) throw new Error('Unconfirmed mounted metadata');
  return result;
}
const productionProcesses = new WeakSet<SourceProcess>();
export const isProductionSourceProcess = (process: SourceProcess): boolean => productionProcesses.has(process);
/** Production composition: only fixed executables and validated argument arrays; no inherited loader/credential overrides. */
/** Compose allocation tracking without exposing installed metadata expectations. */
export function trackAllocationSourceProcess(process: SourceProcess,
  track: (operation: string, invoke: () => ReturnType<SourceProcess>) => ReturnType<SourceProcess>): SourceProcess {
  return (executable, args, options) => track(executable, () => {
    options.signal.throwIfAborted();
    return process(executable, args, options);
  });
}

export function allocationSourceProcess(host: InstalledHost, allowedArtifactRoots: readonly string[] = [],
  launch: typeof spawn = spawn): SourceProcess {
  let children = 0;
  const invoke: InstalledProcess = async (executable, args, options, expected) => {
    const create = executable === '/usr/bin/xcrun' && args.length === 5 && args[0] === 'simctl' && args[1] === 'create'
      && args[2]!.startsWith('jev-observed-') && simulatorUuid.test(args[2]!.slice('jev-observed-'.length))
      && args[2] === args[2]!.toUpperCase().replace('JEV-OBSERVED-', 'jev-observed-') && validSimulatorIdentifiers(args[3]!, args[4]!);
    const path = args[5];
    const mounted = path === undefined ? undefined : mountedMetadataRoot(path);
    // Classify fixed mounted namespaces before considering any artifact prefix.
    const metadata = path !== undefined && canonicalInstalledPath(path) && (mountedNamespace(path) ? !!mounted :
      (path === '/Applications/Xcode.app/Contents/Info.plist' || path === '/Applications/Xcode.app/Contents/version.plist'
        || path === '/System/Library/CoreServices/SystemVersion.plist'
        || /^\/Library\/Developer\/CoreSimulator\/Profiles\/DeviceTypes\/[^/]+\.simdevicetype\/Contents\/(?:Info\.plist|Resources\/profile\.plist)$/.test(path)
        || /^\/Library\/Developer\/CoreSimulator\/(?:Profiles\/Runtimes|Volumes\/[^/]+\/Library\/Developer\/CoreSimulator\/Profiles\/Runtimes)\/[^/]+\.simruntime\/Contents\/(?:Info\.plist|Resources\/profile\.plist|Resources\/RuntimeRoot\/System\/Library\/CoreServices\/SystemVersion\.plist)$/.test(path)
        || allowedArtifactRoots.some(root => path.startsWith(resolve(root) + '/') && basename(path) === 'Info.plist')));
    const plist = executable === '/usr/bin/plutil' && args.length === 6 && args.slice(0, 5).join('\0') === '-convert\0json\0-o\0-\0--' && metadata;
    const mount = executable === '/usr/sbin/diskutil' && args.length === 3 && args[0] === 'info' && args[1] === '-plist'
      && args[2] !== undefined && mountedRoot(args[2]) === args[2] ? args[2] : undefined;
    if ((!create && !plist && !mount) || options.shell !== false || options.signal.aborted || !Number.isSafeInteger(options.timeoutMs)
      || options.timeoutMs < 1 || options.timeoutMs > (mount || mounted ? 10000 : 900000) || !Number.isSafeInteger(options.maxOutputBytes) || options.maxOutputBytes < 1
      || options.maxOutputBytes > (plist ? installedPlistOutputLimit(path!) : 65536)) throw new Error('Host process is not authorized');
    const mountBefore = mount ? await mountedSnapshot(mount, host, options.signal, false, false, expected?.mount) : undefined;
    if (plist && !mounted) {
      const stat = await host.fs.lstat(path!);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || ![0, host.account.uid].includes(stat.uid) || (stat.mode & 0o022)) throw new Error('Host process is not authorized');
      if (!allowedArtifactRoots.some(root => path!.startsWith(resolve(root) + '/'))) await trustedPath(path!, host);
      await stableFile(path!, host.fs); options.signal.throwIfAborted();
    }
    await trustedPath(developerDirectory, host, true);
    if (!((await trustedPath(executable, host)).mode & 0o111)) throw new Error('Host process is not authorized');
    options.signal.throwIfAborted();
    const run = (): ReturnType<SourceProcess> => new Promise((done, fail) => {
      let child: ChildProcess;
      if (options.signal.aborted || children >= childLimit) { fail(new Error('Host child budget exhausted or cancelled')); return; }
      children++;
      try { child = launch(executable, [...args], { shell: false, env: { HOME: host.account.homedir,
        PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'C', LC_ALL: 'C', DEVELOPER_DIR: developerDirectory }, stdio: ['ignore', 'pipe', 'pipe'] }); }
      catch (error) { fail(error); return; }
      const out: Buffer[] = []; const err: Buffer[] = []; let bytes = 0; let overflow = false; let stopped = false; let childError: unknown;
      let escalation: ReturnType<typeof setTimeout> | undefined;
      const stop = () => {
        if (stopped) return; stopped = true;
        try { child.kill('SIGTERM'); } catch (error) { childError = error; }
        // Only this new metadata command has hard termination. Signal delivery is not settlement.
        if (mount) escalation = setTimeout(() => { try { child.kill('SIGKILL'); } catch (error) { childError = error; } }, 250);
      };
      const timer = setTimeout(stop, options.timeoutMs);
      options.signal.addEventListener('abort', stop, { once: true });
      const capture = (chunks: Buffer[]) => (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > options.maxOutputBytes) { overflow = true; stop(); return; }
        chunks.push(chunk);
      };
      child.stdout?.on('data', capture(out)); child.stderr?.on('data', capture(err));
      const cleanup = () => { clearTimeout(timer); if (escalation) clearTimeout(escalation); options.signal.removeEventListener('abort', stop); };
      child.on('error', error => { childError = error; });
      child.once('close', (code, signal) => { cleanup(); if (childError) { fail(childError); return; } done({ exitCode: stopped || overflow || signal ? null : code,
        stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') }); });
      if (options.signal.aborted) stop();
    });
    const result = plist && mounted ? await convertMounted(path!, host, invoke, options.signal, run, expected) : await run();
    if (mount && (!mountBefore || !sameMountedSnapshot(mountBefore,
      await mountedSnapshot(mount, host, options.signal, false, false, expected?.mount)))) throw new Error('Mounted root changed');
    return result;
  };
  const process: SourceProcess = (executable, args, options) => invoke(executable, args, options);
  productionInvokers.set(process, invoke); productionProcesses.add(process); return process;
}
async function trustedPath(path: string, host: InstalledHost, directory = false): Promise<Stats> {
  const parts = path.split('/').filter(Boolean); let current = '/';
  const installedXcode = resolve(path) === path && (path === '/Applications/Xcode.app' || path.startsWith('/Applications/Xcode.app/'));
  for (let i = 0; i < parts.length; i++) {
    current = join(current, parts[i]!); const s = await host.fs.lstat(current);
    // Trust local administrators only for this canonical parent of the fixed Xcode tree.
    const applications = installedXcode && current === '/Applications' && i < parts.length - 1 && s.isDirectory()
      && s.uid === 0 && s.gid === 80 && (s.mode & 0o7777) === 0o775;
    if (s.isSymbolicLink() || ![0, host.account.uid].includes(s.uid) || ((s.mode & 0o022) && !applications)
      || (i < parts.length - 1 && !s.isDirectory())) throw new Error('Untrusted installed path');
  }
  const s = await host.fs.lstat(path);
  if (s.isSymbolicLink() || ![0, host.account.uid].includes(s.uid) || (s.mode & 0o022)) throw new Error('Untrusted installed path');
  if (directory ? !s.isDirectory() : !s.isFile()) throw new Error('Missing installed path');
  return s;
}
async function installedPlist(path: string, host: InstalledHost, process: InstalledProcess, signal: AbortSignal,
  expected?: MountedSnapshot): Promise<Record<string, unknown>> {
  if (mountedNamespace(path)) {
    const result = await convertMounted(path, host, process, signal, context => process('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', path],
      { signal, timeoutMs: 10000, maxOutputBytes: 65536, shell: false }, context), expected ? { mount: expected } : undefined);
    const value: unknown = JSON.parse(result.stdout);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid installed metadata');
    return value as Record<string, unknown>;
  }
  signal.throwIfAborted(); const beforeStat = await trustedPath(path, host);
  const before = await stableFile(path, host.fs);
  const maxOutputBytes = installedPlistOutputLimit(path);
  const result = await process('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', path],
    { signal, timeoutMs: 10000, maxOutputBytes, shell: false });
  signal.throwIfAborted();
  if (result.exitCode !== 0 || Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr) > maxOutputBytes
    || stamp(beforeStat) !== stamp(await trustedPath(path, host)) || !before.equals(await stableFile(path, host.fs))) throw new Error('Unconfirmed installed metadata');
  const value: unknown = JSON.parse(result.stdout);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid installed metadata');
  return value as Record<string, unknown>;
}
const osVersion = (v: unknown): number[] => { if (typeof v !== 'string' || !/^\d{1,3}\.\d{1,3}(?:\.\d{1,3})?$/.test(v)) throw new Error('Missing OS metadata'); return v.split('.').map(Number); };
const compareVersions = (a: number[], b: number[]) => { for (let i = 0; i < 3; i++) { const d = (a[i] ?? 0) - (b[i] ?? 0); if (d) return d; } return 0; };
const named = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 500 && !value.includes('\0');
const architectures = (value: unknown, architecture: string) => Array.isArray(value) && value.length > 0
  && value.every(x => x === 'arm64' || x === 'x86_64') && value.includes(architecture);
const families = (value: unknown): number[] => { if (!Array.isArray(value) || !value.length || !value.every(x => Number.isSafeInteger(x) && x > 0)) throw new Error('Missing families'); return value as number[]; };
async function bundles(root: string, suffix: string, host: InstalledHost, signal: AbortSignal): Promise<string[]> {
  try {
    signal.throwIfAborted(); await trustedPath(root, host, true); signal.throwIfAborted(); const entries = await host.fs.readdir(root);
    signal.throwIfAborted();
    if (entries.length > 1000) throw new Error('Enumeration limit exceeded');
    return entries.filter(n => /^[^/\0]{1,255}$/.test(n) && n.endsWith(suffix)).sort().map(n => join(root, n));
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
}
type MountedEnumeration = { kind: MountClass; snapshot: MountedSnapshot; entries: string[]; candidates: Map<string, MountedSnapshot> };
async function mountedEntries(path: string, kind: MountClass, host: InstalledHost, signal: AbortSignal): Promise<string[]> {
  signal.throwIfAborted(); const entries = await host.fs.readdir(path); signal.throwIfAborted();
  const valid = kind === 'legacy' ? /^[A-Za-z0-9_-]{1,255}$/ : /^[^/\0]{1,255}$/;
  if (entries.length > 1000 || entries.some(name => !valid.test(name)) || new Set(entries).size !== entries.length) throw new Error('Mounted enumeration limit or name refused');
  return [...entries].sort();
}
async function enumerateMountedNamespace(kind: MountClass, host: InstalledHost, signal: AbortSignal): Promise<MountedEnumeration> {
  const namespace = mountNamespace(kind); const snapshot = await mountedSnapshot(namespace, host, signal, false, true);
  const candidates = new Map<string, MountedSnapshot>();
  if (snapshot.missing) return { kind, snapshot, entries: [], candidates };
  const entries = await mountedEntries(namespace, kind, host, signal);
  const mounts = entries.filter(name => mountName(kind).test(name)).map(name => join(namespace, name));
  if (mounts.length > 64) throw new Error('Mounted candidate limit exceeded');
  for (const mount of mounts) {
    const candidate = await mountedSnapshot(mount, host, signal);
    if (!mountedPrefixMatches(snapshot, candidate)) throw new Error('Mounted candidate ancestry changed');
    candidates.set(mount, candidate);
  }
  if (!sameMountedSnapshot(snapshot, await mountedSnapshot(namespace, host, signal))) throw new Error('Mounted namespace changed during enumeration');
  return { kind, snapshot, entries, candidates };
}
async function confirmMountedEnumeration(state: MountedEnumeration, host: InstalledHost, signal: AbortSignal): Promise<void> {
  const namespace = mountNamespace(state.kind); const before = await mountedSnapshot(namespace, host, signal, false, true);
  if (!sameMountedSnapshot(state.snapshot, before)) throw new Error('Mounted namespace presence or identity changed');
  if (before.missing) return;
  const entries = await mountedEntries(namespace, state.kind, host, signal);
  if (entries.length !== state.entries.length || entries.some((entry, i) => entry !== state.entries[i])) throw new Error('Mounted namespace entries changed');
  for (const [mount, candidate] of state.candidates) {
    if (!sameMountedSnapshot(candidate, await mountedSnapshot(mount, host, signal))) throw new Error('Mounted candidate changed after lookup');
  }
  if (!sameMountedSnapshot(before, await mountedSnapshot(namespace, host, signal))) throw new Error('Mounted namespace changed after final listing');
}
async function mountedBundles(state: MountedEnumeration, host: InstalledHost, process: InstalledProcess, signal: AbortSignal): Promise<string[]> {
  const result: string[] = [];
  for (const [mount, candidate] of state.candidates) {
    signal.throwIfAborted(); const proof = await readonlyMountedRoot(mount, host, process, signal, candidate);
    if (!sameMountedSnapshot(candidate, proof)) throw new Error('Mounted candidate changed before runtime listing');
    const root = mount + runtimeSuffix; const snapshot = await mountedSnapshot(root, host, signal, false, false, candidate);
    if (!mountedPrefixMatches(proof, snapshot)) throw new Error('Mounted root changed');
    signal.throwIfAborted(); const names = await host.fs.readdir(root); signal.throwIfAborted();
    if (names.length > 1000 || names.some(name => !/^[^/\0]{1,255}$/.test(name))
      || new Set(names).size !== names.length || !sameMountedSnapshot(snapshot, await mountedSnapshot(root, host, signal, false, false, candidate))
      || !sameMountedSnapshot(proof, await readonlyMountedRoot(mount, host, process, signal, candidate))) throw new Error('Unconfirmed mounted runtime listing');
    result.push(...names.filter(name => name.endsWith('.simruntime')).sort().map(name => join(root, name)));
    if (result.length > 1000) throw new Error('Runtime enumeration limit exceeded');
  }
  return result;
}
export type InstalledCompatibility = { architecture: 'arm64' | 'x86_64'; runtimeVersion: string; hostVersion: string; xcodeVersion: string; xcodeBuild: string; runtimeBuild: string };
/** Bounded immediate bundle enumeration; never chooses a newer runtime or uses vendor listing as installed proof. */
export async function verifyInstalledCompatibility(source: { deviceTypeId: string; runtimeId: string }, host: InstalledHost,
  process: SourceProcess, signal: AbortSignal): Promise<InstalledCompatibility> {
  try {
    let dispatches = 0;
    const originalProcess: InstalledProcess = productionInvokers.get(process)
      ?? ((executable, args, options) => process(executable, args, options));
    const boundedProcess: InstalledProcess = (executable, args, options, expected) => {
      signal.throwIfAborted(); options.signal.throwIfAborted();
      if (++dispatches > childLimit) throw new Error('Host child budget exhausted');
      return originalProcess(executable, args, options, expected);
    };
    signal.throwIfAborted();
    if (host.platform !== 'darwin' || !['arm64', 'x86_64'].includes(host.architecture)
      || !validSimulatorIdentifiers(source.deviceTypeId, source.runtimeId)) throw new Error();
    const info = await installedPlist('/Applications/Xcode.app/Contents/Info.plist', host, boundedProcess, signal);
    const xcode = await installedPlist('/Applications/Xcode.app/Contents/version.plist', host, boundedProcess, signal);
    const system = await installedPlist('/System/Library/CoreServices/SystemVersion.plist', host, boundedProcess, signal);
    const hostVersion = osVersion(system.ProductVersion);
    if (info.CFBundleIdentifier !== 'com.apple.dt.Xcode' || info.CFBundleExecutable !== 'Xcode'
      || compareVersions(osVersion(info.LSMinimumSystemVersion), hostVersion) > 0
      || !named(xcode.ProductBuildVersion)) throw new Error();
    osVersion(xcode.CFBundleShortVersionString);
    for (const path of ['/Applications/Xcode.app/Contents/MacOS/Xcode', developerDirectory + '/usr/bin/simctl', '/usr/bin/xcrun', '/usr/bin/plutil']) {
      if (!((await trustedPath(path, host)).mode & 0o111)) throw new Error();
    }
    await trustedPath(developerDirectory + '/Platforms/iPhoneSimulator.platform', host, true);
    const matching: string[] = [];
    for (const bundle of await bundles('/Library/Developer/CoreSimulator/Profiles/DeviceTypes', '.simdevicetype', host, signal)) {
      if ((await installedPlist(join(bundle, 'Contents/Info.plist'), host, boundedProcess, signal)).CFBundleIdentifier === source.deviceTypeId) matching.push(bundle);
    }
    if (matching.length !== 1) throw new Error();
    const device = await installedPlist(join(matching[0]!, 'Contents/Resources/profile.plist'), host, boundedProcess, signal);
    if (!architectures(device.supportedArchs, host.architecture)) throw new Error();
    const deviceFamilies = families(device.supportedProductFamilyIDs);
    const legacy = await enumerateMountedNamespace('legacy', host, signal);
    const cryptex = await enumerateMountedNamespace('cryptex', host, signal);
    const candidates = new Map([...legacy.candidates, ...cryptex.candidates]);
    const capturedCandidate = (bundle: string) => {
      const mount = mountedRoot(bundle); if (!mount) return;
      const candidate = candidates.get(mount); if (!candidate) throw new Error('Missing enumerated mounted candidate');
      return candidate;
    };
    const runtimeRoots = ['/Library/Developer/CoreSimulator/Profiles/Runtimes',
      ...legacy.entries.filter(name => !legacyMountName.test(name)).map(name => join(legacyDirectory, name) + runtimeSuffix)];
    const runtimes: string[] = [];
    const runtimeBundles: string[] = [];
    for (const root of runtimeRoots) {
      runtimeBundles.push(...await bundles(root, '.simruntime', host, signal));
      if (runtimeBundles.length > 1000) throw new Error('Runtime enumeration limit exceeded');
    }
    runtimeBundles.push(...await mountedBundles(legacy, host, boundedProcess, signal));
    if (runtimeBundles.length > 1000) throw new Error('Runtime enumeration limit exceeded');
    runtimeBundles.push(...await mountedBundles(cryptex, host, boundedProcess, signal));
    if (runtimeBundles.length > 1000) throw new Error('Runtime enumeration limit exceeded');
    for (const bundle of runtimeBundles) {
      if ((await installedPlist(join(bundle, 'Contents/Info.plist'), host, boundedProcess, signal, capturedCandidate(bundle))).CFBundleIdentifier === source.runtimeId) runtimes.push(bundle);
    }
    if (runtimes.length !== 1) throw new Error();
    const candidate = capturedCandidate(runtimes[0]!);
    const runtime = await installedPlist(join(runtimes[0]!, 'Contents/Resources/profile.plist'), host, boundedProcess, signal, candidate);
    const actual = await installedPlist(join(runtimes[0]!, 'Contents/Resources/RuntimeRoot/System/Library/CoreServices/SystemVersion.plist'), host, boundedProcess, signal, candidate);
    const runtimeVersion = osVersion(actual.ProductVersion); const declared = osVersion(runtime.defaultVersionString);
    const identifier = source.runtimeId.slice('com.apple.CoreSimulator.SimRuntime.iOS-'.length).split('-').map(Number);
    if (runtime.platformIdentifier !== 'com.apple.platform.iphonesimulator' || !architectures(runtime.supportedArchs, host.architecture)
      || !deviceFamilies.every(f => families(runtime.supportedProductFamilyIDs).includes(f))
      || compareVersions(osVersion(runtime.minHostVersion), hostVersion) > 0
      || compareVersions(osVersion(device.minRuntimeVersion), runtimeVersion) > 0
      || (device.maxRuntimeVersion !== undefined && compareVersions(osVersion(device.maxRuntimeVersion), runtimeVersion) < 0)
      || declared[0] !== runtimeVersion[0] || declared[1] !== runtimeVersion[1]
      || identifier.some((v, i) => v !== declared[i]) || !named(actual.ProductBuildVersion)) throw new Error();
    await confirmMountedEnumeration(legacy, host, signal); await confirmMountedEnumeration(cryptex, host, signal);
    signal.throwIfAborted();
    return { architecture: host.architecture, runtimeVersion: actual.ProductVersion as string, hostVersion: system.ProductVersion as string,
      xcodeVersion: xcode.CFBundleShortVersionString as string, xcodeBuild: xcode.ProductBuildVersion, runtimeBuild: actual.ProductBuildVersion };
  } catch { throw new AllocationPrerequisiteError('HOST_PREREQUISITE_MISSING'); }
}
export async function allocationStorage(host: InstalledHost, stagingVolume: string): Promise<{ simulatorFreeBytes: number; stagingFreeBytes: number }> {
  try {
    const simulator = await host.fs.statfs(join(host.account.homedir, 'Library/Developer/CoreSimulator'));
    const staging = await host.fs.statfs(stagingVolume);
    const free = (s: Awaited<ReturnType<typeof nativeFs.statfs>>) => { const n = Number(s.bavail) * Number(s.bsize); if (!Number.isSafeInteger(n) || n < 0) throw new Error(); return n; };
    return { simulatorFreeBytes: free(simulator), stagingFreeBytes: free(staging) };
  } catch { throw new AllocationPrerequisiteError('STORAGE_UNAVAILABLE'); }
}
