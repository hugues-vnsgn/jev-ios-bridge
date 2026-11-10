import * as fs from 'node:fs/promises';
import { mkdirSync, writeFileSync, type Stats } from 'node:fs';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { join, resolve } from 'node:path';
import type { spawn } from 'node:child_process';
import type { SourceProcess } from '../../src/observed/create-source.js';
import type { InstalledHost } from '../../src/observed/allocation-config.js';
import { allocationFixture, runtimeBundle, runtimeId } from './observed-allocation-backend.js';

export const cryptexDirectory = '/private/var/run/com.apple.security.cryptexd/mnt';
/** One runtime mounted under the Cryptex namespace at `name`, the folder CoreSimulator chose for it. */
export function cryptexLayout(name: string) {
  const mount = cryptexDirectory + '/' + name;
  const runtimes = mount + '/Library/Developer/CoreSimulator/Profiles/Runtimes';
  const bundle = runtimes + '/iOS 27.0.simruntime';
  const runtimeRoot = bundle + '/Contents/Resources/RuntimeRoot';
  const mountXml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
    + '<plist version="1.0"><dict><key>MountPoint</key><string>' + mount + '</string>'
    + '<key>Writable</key><false/><key>WritableMedia</key><false/><key>WritableVolume</key><false/>'
    + '<key>Sealed</key><string>Yes</string></dict></plist>\n';
  return { mount, runtimes, bundle, info: bundle + '/Contents/Info.plist', profile: bundle + '/Contents/Resources/profile.plist',
    runtimeRoot, system: runtimeRoot + '/System/Library/CoreServices/SystemVersion.plist', mountXml };
}
const approved = cryptexLayout('com.apple.iPhoneOS.SimulatorRuntime-v24.1.434.0.iVUyCZ');
export const cryptexMount = approved.mount;
export const cryptexRuntimes = approved.runtimes;
export const cryptexBundle = approved.bundle;
export const cryptexInfo = approved.info;
export const cryptexProfile = approved.profile;
export const cryptexRuntimeRoot = approved.runtimeRoot;
export const cryptexSystem = approved.system;
export const readonlyMountXml = approved.mountXml;

type Receipt = Awaited<ReturnType<SourceProcess>>;
type Child = EventEmitter & { stdout: PassThrough; stderr: PassThrough; signals: string[]; kill(signal?: string): boolean };

/** All installed paths resolve into this fixture's temporary trees; no native command is launched. */
export async function cryptexFixture(options: { mountName?: string } = {}) {
  const layout = options.mountName === undefined ? approved : cryptexLayout(options.mountName);
  const base = await allocationFixture();
  const tree = join(base.root, 'cryptex-host'); mkdirSync(tree, { mode: 0o700 });
  const namespacePath = (path: string) => path === '/' || path === cryptexDirectory
    || cryptexDirectory.startsWith(path + '/') || path.startsWith(cryptexDirectory + '/');
  const map = (path: string): string => {
    if (resolve(path) !== path || path.includes('\0')) throw new Error('Noncanonical fixture path');
    if (namespacePath(path)) return join(tree, path);
    if (/^\/(?:Applications|Library|System|usr)(?:\/|$)/.test(path) || path === base.root || path.startsWith(base.root + '/')) return base.map(path);
    throw new Error('Fixture path outside temporary trees');
  };
  const write = (path: string, value: unknown) => {
    if (!namespacePath(path) || path === '/') throw new Error('Not a private fixture path');
    const target = map(path); mkdirSync(join(target, '..'), { recursive: true, mode: 0o700 });
    writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value), { mode: 0o600 });
  };
  write(layout.info, { CFBundleIdentifier: runtimeId, CFBundleShortVersionString: '392' });
  write(layout.profile, { platformIdentifier: 'com.apple.platform.iphonesimulator', minHostVersion: '14.0.0',
    supportedArchs: ['arm64', 'x86_64'], supportedProductFamilyIDs: [2, 1], defaultVersionString: '27.0' });
  write(layout.system, { ProductVersion: '27.0', ProductBuildVersion: '24A434' });
  base.write('/usr/sbin/diskutil', 'fake executable', 0o755);
  const groupDirectories = new Set([layout.mount + '/Library/Developer/CoreSimulator',
    layout.mount + '/Library/Developer/CoreSimulator/Profiles', layout.runtimes, layout.bundle,
    layout.bundle + '/Contents', layout.bundle + '/Contents/Resources', layout.runtimeRoot]);
  const overrides = new Map<string, Partial<Stats>>();
  const view = (path: string, raw: Stats): Stats => {
    const fields: Partial<Stats> = {};
    if (namespacePath(path)) {
      fields.uid = 0; fields.gid = 0; fields.dev = path === layout.mount || path.startsWith(layout.mount + '/') ? 16777243 : 16777231;
      let permissions = raw.isDirectory() ? 0o755 : 0o644;
      if (path === '/private/var/run') { fields.gid = 1; permissions = 0o775; }
      if (path === '/private/var/run/com.apple.security.cryptexd') { fields.gid = 1; permissions = 0o705; }
      if (path === cryptexDirectory) fields.gid = 1;
      if (groupDirectories.has(path)) { fields.gid = 80; permissions = path === layout.runtimeRoot ? 0o1775 : 0o775; }
      if (path === layout.info || path === layout.profile) { fields.gid = 80; permissions = 0o664; }
      if (path === layout.system) permissions = 0o444;
      fields.mode = (raw.mode & 0o170000) | permissions;
    } else if (path === '/Applications') {
      fields.uid = 0; fields.gid = 80; fields.mode = (raw.mode & 0o170000) | 0o775;
    }
    Object.assign(fields, overrides.get(path));
    return new Proxy(raw, { get(target, key, receiver) {
      if (Object.hasOwn(fields, key)) return Reflect.get(fields, key);
      const value = Reflect.get(target, key, receiver);
      return typeof value === 'function' ? value.bind(receiver) : value;
    } });
  };
  const effects: { executable: string; args: readonly string[] }[] = [];
  const reads: { operation: string; path: string }[] = [];
  const listings = new Map<string, string[]>();
  let before: ((operation: string, path: string) => void | Promise<void>) | undefined;
  let mountResult: Receipt = { exitCode: 0, stdout: layout.mountXml, stderr: '' };
  let convertedResult: Receipt | undefined;
  const fakeFs = { ...base.host.fs,
    lstat: (async (path: string) => { const target = map(path); reads.push({ operation: 'lstat', path });
      await before?.('lstat', path);
      return view(path, await fs.lstat(target)); }) as typeof fs.lstat,
    open: (async (path: string, flags: number, mode?: number) => {
      const target = map(path); reads.push({ operation: 'open', path }); await before?.('open', path); const handle = await fs.open(target, flags, mode);
      return new Proxy(handle, { get(targetHandle, key) {
        if (key === 'stat') return async () => { await before?.('opened-stat', path); return view(path, await targetHandle.stat()); };
        const value = Reflect.get(targetHandle, key); return typeof value === 'function' ? value.bind(targetHandle) : value;
      } });
    }) as typeof fs.open,
    readdir: (async (path: string) => { const target = map(path); reads.push({ operation: 'readdir', path });
      await before?.('readdir', path);
      return listings.get(path) ?? (path === runtimeBundle.slice(0, runtimeBundle.lastIndexOf('/')) ? [] : fs.readdir(target));
    }) as typeof fs.readdir,
  };
  const host: InstalledHost = { ...base.host, fs: fakeFs };
  const metadataPaths = new Set([layout.info, layout.profile, layout.system]);
  const source: SourceProcess = async (executable, args, options) => {
    effects.push({ executable, args: [...args] });
    await before?.(executable === '/usr/sbin/diskutil' ? 'mount' : 'convert', args[5] ?? args[2] ?? '');
    if (executable === '/usr/sbin/diskutil' || (executable === '/usr/bin/plutil' && args[5]?.startsWith(layout.mount + '/'))) {
      if (options.shell !== false || options.signal.aborted || !Number.isSafeInteger(options.timeoutMs)
        || options.timeoutMs < 1 || options.timeoutMs > 10000 || !Number.isSafeInteger(options.maxOutputBytes)
        || options.maxOutputBytes < 1 || options.maxOutputBytes > 65536) throw new Error('Unsafe Cryptex fixture options');
      if (executable === '/usr/sbin/diskutil') {
        if (args.length !== 3 || args[0] !== 'info' || args[1] !== '-plist' || args[2] !== layout.mount) throw new Error('Unexpected fixture mount command');
        return mountResult;
      }
      if (args.length !== 6 || args.slice(0, 5).join('\0') !== '-convert\0json\0-o\0-\0--' || !metadataPaths.has(args[5]!)) throw new Error('Unexpected fixture Cryptex conversion');
      return convertedResult ?? { exitCode: 0, stdout: await fs.readFile(map(args[5]!), 'utf8'), stderr: '' };
    }
    return base.source(executable, args, options);
  };
  const launches: { executable: string; args: readonly string[]; options: Record<string, unknown>; child: Child }[] = [];
  const launch = ((executable: string, args: readonly string[], options: Record<string, unknown>) => {
    const child: Child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(),
      signals: [] as string[], kill(signal = 'SIGTERM') { this.signals.push(signal); return true; } });
    launches.push({ executable, args: [...args], options, child });
    queueMicrotask(async () => {
      let result: Receipt;
      try { result = await source(executable, args, { shell: false, signal: new AbortController().signal,
        timeoutMs: 10000, maxOutputBytes: args[5] === '/Applications/Xcode.app/Contents/Info.plist' ? 131072 : 65536 }); }
      catch (error) { child.emit('error', error); child.emit('close', null, null); return; }
      child.stdout.write(result.stdout); child.stderr.write(result.stderr); child.emit('close', result.exitCode, null);
    });
    return child;
  }) as unknown as typeof spawn;
  return { ...base, host, source, map, write, overrides, reads, effects, launches, launch, listings,
    setBefore(fn: typeof before) { before = fn; },
    setMountResult(result: Receipt) { mountResult = result; },
    setConvertedResult(result: Receipt) { convertedResult = result; } };
}
