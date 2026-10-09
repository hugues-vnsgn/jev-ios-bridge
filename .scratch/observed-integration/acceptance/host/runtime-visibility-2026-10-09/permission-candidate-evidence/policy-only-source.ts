import * as nativeFs from 'node:fs/promises';
import { constants, type Stats } from 'node:fs';
import { userInfo, arch, platform } from 'node:os';
import { join, isAbsolute, basename, resolve } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import type { SourceProcess } from './create-source.js';
import { createHash } from 'node:crypto';
import { z } from 'zod/v4';
import { allocationBudgetsSchema, type AllocationBudgets, type AllocationSource } from '../device/admission-allocation.js';
import { canonicalJson } from './allocation-schema.js';
import { simulatorUuid, validSimulatorIdentifiers } from './create-source.js';

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
const productionProcesses = new WeakSet<SourceProcess>();
export const isProductionSourceProcess = (process: SourceProcess): boolean => productionProcesses.has(process);
/** Production composition: only fixed executables and validated argument arrays; no inherited loader/credential overrides. */
export function allocationSourceProcess(host: InstalledHost, allowedArtifactRoots: readonly string[] = [],
  launch: typeof spawn = spawn): SourceProcess {
  const process: SourceProcess = async (executable, args, options) => {
    const create = executable === '/usr/bin/xcrun' && args.length === 5 && args[0] === 'simctl' && args[1] === 'create'
      && args[2]!.startsWith('jev-observed-') && simulatorUuid.test(args[2]!.slice('jev-observed-'.length))
      && args[2] === args[2]!.toUpperCase().replace('JEV-OBSERVED-', 'jev-observed-') && validSimulatorIdentifiers(args[3]!, args[4]!);
    const path = args[5];
    const metadata = path !== undefined && isAbsolute(path) && resolve(path) === path && !path.includes('\0') && path.length <= 4096 &&
      (path === '/Applications/Xcode.app/Contents/Info.plist' || path === '/Applications/Xcode.app/Contents/version.plist'
        || path === '/System/Library/CoreServices/SystemVersion.plist'
        || /^\/Library\/Developer\/CoreSimulator\/Profiles\/DeviceTypes\/[^/]+\.simdevicetype\/Contents\/(?:Info\.plist|Resources\/profile\.plist)$/.test(path)
        || /^\/Library\/Developer\/CoreSimulator\/(?:Profiles\/Runtimes|Volumes\/[^/]+\/Library\/Developer\/CoreSimulator\/Profiles\/Runtimes)\/[^/]+\.simruntime\/Contents\/(?:Info\.plist|Resources\/profile\.plist|Resources\/RuntimeRoot\/System\/Library\/CoreServices\/SystemVersion\.plist)$/.test(path)
        || allowedArtifactRoots.some(root => path.startsWith(resolve(root) + '/') && basename(path) === 'Info.plist'));
    const plist = executable === '/usr/bin/plutil' && args.length === 6 && args.slice(0, 5).join('\0') === '-convert\0json\0-o\0-\0--' && metadata;
    if ((!create && !plist) || options.shell !== false || options.signal.aborted || !Number.isSafeInteger(options.timeoutMs)
      || options.timeoutMs < 1 || options.timeoutMs > 900000 || !Number.isSafeInteger(options.maxOutputBytes) || options.maxOutputBytes < 1 || options.maxOutputBytes > 65536) throw new Error('Host process is not authorized');
    if (plist) {
      const stat = await host.fs.lstat(path!);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || ![0, host.account.uid].includes(stat.uid) || (stat.mode & 0o022)) throw new Error('Host process is not authorized');
      if (!allowedArtifactRoots.some(root => path!.startsWith(resolve(root) + '/'))) await trustedPath(path!, host);
      await stableFile(path!, host.fs); options.signal.throwIfAborted();
    }
    await trustedPath(developerDirectory, host, true);
    if (!((await trustedPath(executable, host)).mode & 0o111)) throw new Error('Host process is not authorized');
    options.signal.throwIfAborted();
    return new Promise((done, fail) => {
      let child: ChildProcess;
      try { child = launch(executable, [...args], { shell: false, env: { HOME: host.account.homedir,
        PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'C', LC_ALL: 'C', DEVELOPER_DIR: developerDirectory }, stdio: ['ignore', 'pipe', 'pipe'] }); }
      catch (error) { fail(error); return; }
      const out: Buffer[] = []; const err: Buffer[] = []; let bytes = 0; let overflow = false; let stopped = false; let childError: unknown;
      const stop = () => { stopped = true; try { child.kill('SIGTERM'); } catch (error) { childError = error; } };
      const timer = setTimeout(stop, options.timeoutMs);
      options.signal.addEventListener('abort', stop, { once: true });
      const capture = (chunks: Buffer[]) => (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > options.maxOutputBytes) { overflow = true; stop(); return; }
        chunks.push(chunk);
      };
      child.stdout?.on('data', capture(out)); child.stderr?.on('data', capture(err));
      const cleanup = () => { clearTimeout(timer); options.signal.removeEventListener('abort', stop); };
      child.on('error', error => { childError = error; });
      child.once('close', (code, signal) => { cleanup(); if (childError) { fail(childError); return; } done({ exitCode: stopped || overflow || signal ? null : code,
        stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') }); });
      if (options.signal.aborted) stop();
    });
  };
  productionProcesses.add(process); return process;
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
  if (directory ? !s.isDirectory() : !s.isFile()) throw new Error('Missing installed path');
  return s;
}
async function installedPlist(path: string, host: InstalledHost, process: SourceProcess, signal: AbortSignal): Promise<Record<string, unknown>> {
  signal.throwIfAborted(); const beforeStat = await trustedPath(path, host);
  const before = await stableFile(path, host.fs);
  const result = await process('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', path],
    { signal, timeoutMs: 10000, maxOutputBytes: 65536, shell: false });
  signal.throwIfAborted();
  if (result.exitCode !== 0 || Buffer.byteLength(result.stdout) > 65536 || Buffer.byteLength(result.stderr) > 65536
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
async function bundles(root: string, suffix: string, host: InstalledHost): Promise<string[]> {
  try {
    await trustedPath(root, host, true); const entries = await host.fs.readdir(root);
    if (entries.length > 1000) throw new Error('Enumeration limit exceeded');
    return entries.filter(n => /^[^/\0]{1,255}$/.test(n) && n.endsWith(suffix)).sort().map(n => join(root, n));
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
}
export type InstalledCompatibility = { architecture: 'arm64' | 'x86_64'; runtimeVersion: string; hostVersion: string; xcodeVersion: string; xcodeBuild: string; runtimeBuild: string };
/** Bounded immediate bundle enumeration; never chooses a newer runtime or uses vendor listing as installed proof. */
export async function verifyInstalledCompatibility(source: { deviceTypeId: string; runtimeId: string }, host: InstalledHost,
  process: SourceProcess, signal: AbortSignal): Promise<InstalledCompatibility> {
  try {
    if (host.platform !== 'darwin' || !['arm64', 'x86_64'].includes(host.architecture)
      || !validSimulatorIdentifiers(source.deviceTypeId, source.runtimeId)) throw new Error();
    const info = await installedPlist('/Applications/Xcode.app/Contents/Info.plist', host, process, signal);
    const xcode = await installedPlist('/Applications/Xcode.app/Contents/version.plist', host, process, signal);
    const system = await installedPlist('/System/Library/CoreServices/SystemVersion.plist', host, process, signal);
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
    for (const bundle of await bundles('/Library/Developer/CoreSimulator/Profiles/DeviceTypes', '.simdevicetype', host)) {
      if ((await installedPlist(join(bundle, 'Contents/Info.plist'), host, process, signal)).CFBundleIdentifier === source.deviceTypeId) matching.push(bundle);
    }
    if (matching.length !== 1) throw new Error();
    const device = await installedPlist(join(matching[0]!, 'Contents/Resources/profile.plist'), host, process, signal);
    if (!architectures(device.supportedArchs, host.architecture)) throw new Error();
    const deviceFamilies = families(device.supportedProductFamilyIDs);
    const runtimeRoots = ['/Library/Developer/CoreSimulator/Profiles/Runtimes'];
    const volumes = '/Library/Developer/CoreSimulator/Volumes';
    try {
      await trustedPath(volumes, host, true); const entries = await host.fs.readdir(volumes);
      if (entries.length > 1000) throw new Error();
      for (const name of entries) {
        if (!/^[A-Za-z0-9_-]{1,255}$/.test(name)) throw new Error();
        runtimeRoots.push(join(volumes, name, 'Library/Developer/CoreSimulator/Profiles/Runtimes'));
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const runtimes: string[] = [];
    for (const root of runtimeRoots) for (const bundle of await bundles(root, '.simruntime', host)) {
      if ((await installedPlist(join(bundle, 'Contents/Info.plist'), host, process, signal)).CFBundleIdentifier === source.runtimeId) runtimes.push(bundle);
    }
    if (runtimes.length !== 1) throw new Error();
    const runtime = await installedPlist(join(runtimes[0]!, 'Contents/Resources/profile.plist'), host, process, signal);
    const actual = await installedPlist(join(runtimes[0]!, 'Contents/Resources/RuntimeRoot/System/Library/CoreServices/SystemVersion.plist'), host, process, signal);
    const runtimeVersion = osVersion(actual.ProductVersion); const declared = osVersion(runtime.defaultVersionString);
    const identifier = source.runtimeId.slice('com.apple.CoreSimulator.SimRuntime.iOS-'.length).split('-').map(Number);
    if (runtime.platformIdentifier !== 'com.apple.platform.iphonesimulator' || !architectures(runtime.supportedArchs, host.architecture)
      || !deviceFamilies.every(f => families(runtime.supportedProductFamilyIDs).includes(f))
      || compareVersions(osVersion(runtime.minHostVersion), hostVersion) > 0
      || compareVersions(osVersion(device.minRuntimeVersion), runtimeVersion) > 0
      || (device.maxRuntimeVersion !== undefined && compareVersions(osVersion(device.maxRuntimeVersion), runtimeVersion) < 0)
      || declared[0] !== runtimeVersion[0] || declared[1] !== runtimeVersion[1]
      || identifier.some((v, i) => v !== declared[i]) || !named(actual.ProductBuildVersion)) throw new Error();
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
