import * as fs from 'node:fs/promises';
import { mkdirSync, writeFileSync, type Stats, type BigIntStats } from 'node:fs';
import { join, resolve } from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { spawn } from 'node:child_process';
import type { SourceProcess } from '../../src/observed/create-source.js';
import { allocationFixture, runtimeId, runtimeBundle } from './observed-allocation-backend.js';
import { cryptexDirectory, cryptexMount, cryptexRuntimes, cryptexBundle, cryptexRuntimeRoot } from './observed-cryptex-runtime.js';

export const legacyDirectory = '/Library/Developer/CoreSimulator/Volumes';
export const legacyMount = legacyDirectory + '/iOS_22G86';
export const legacyRuntimes = legacyMount + '/Library/Developer/CoreSimulator/Profiles/Runtimes';
export const legacyBundle = legacyRuntimes + '/iOS 27.0.simruntime';
export const legacyInfo = legacyBundle + '/Contents/Info.plist';
export const legacyProfile = legacyBundle + '/Contents/Resources/profile.plist';
export const legacyRuntimeRoot = legacyBundle + '/Contents/Resources/RuntimeRoot';
export const legacySystem = legacyRuntimeRoot + '/System/Library/CoreServices/SystemVersion.plist';
export const readonlyXml = (mount: string) => '<?xml version="1.0" encoding="UTF-8"?>\n'
  + '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
  + '<plist version="1.0"><dict><key>MountPoint</key><string>' + mount + '</string>'
  + '<key>Writable</key><false/><key>WritableMedia</key><false/><key>WritableVolume</key><false/></dict></plist>\n';

/** Pure mapping: every permitted installed path is temporary; unknown paths refuse. */
export function mapLegacyFixturePath(root: string, path: string): string {
  if (resolve(path) !== path || path.includes('\0')) throw new Error('Noncanonical fixture path');
  if (path === root || path.startsWith(root + '/')) return path;
  if (path === '/' || /^\/(?:Applications|Library|System|usr|private)(?:\/|$)/.test(path)) return join(root, 'host', path);
  throw new Error('Path outside the temporary fixture');
}
type Receipt = Awaited<ReturnType<SourceProcess>>;
type Hook = (operation: string, path: string) => void | Promise<void>;
type Child = EventEmitter & { stdout: PassThrough; stderr: PassThrough; signals: string[]; kill(signal?: string): boolean };

export async function legacyFixture(options: { strictModes?: boolean; absent?: boolean; defaultVisible?: boolean; name?: string } = {}) {
  const base = await allocationFixture();
  const map = (path: string) => mapLegacyFixturePath(base.root, path);
  const overrides = new Map<string, Record<string, unknown>>();
  const listings = new Map<string, string[]>();
  const missing = new Set<string>();
  const mounts = new Set<string>();
  const mountResults = new Map<string, Receipt>();
  const convertedResults = new Map<string, Receipt>();
  let before: Hook | undefined;
  let defaultVisible = options.defaultVisible ?? false;
  const write = (path: string, value: unknown) => {
    const target = map(path); mkdirSync(join(target, '..'), { recursive: true, mode: 0o700 });
    writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value), { mode: 0o600 });
  };
  const addMount = (name: string, identifier = runtimeId) => {
    const mount = join(legacyDirectory, name); mounts.add(mount);
    const bundle = mount + '/Library/Developer/CoreSimulator/Profiles/Runtimes/iOS 27.0.simruntime';
    write(bundle + '/Contents/Info.plist', { CFBundleIdentifier: identifier });
    write(bundle + '/Contents/Resources/profile.plist', { platformIdentifier: 'com.apple.platform.iphonesimulator', minHostVersion: '14.0.0',
      supportedArchs: ['arm64', 'x86_64'], supportedProductFamilyIDs: [2, 1], defaultVersionString: '27.0' });
    write(bundle + '/Contents/Resources/RuntimeRoot/System/Library/CoreServices/SystemVersion.plist', { ProductVersion: '27.0', ProductBuildVersion: 'legacy-fixture' });
    return mount;
  };
  if (!options.absent) addMount(options.name ?? 'iOS_22G86');
  write('/usr/sbin/diskutil', 'fake executable');
  const view = (path: string, raw: Stats | BigIntStats): Stats | BigIntStats => {
    const big = typeof raw.dev === 'bigint';
    const integer = (value: number) => big ? BigInt(value) : value;
    const fields: Record<string, unknown> = {};
    if (path === '/' || /^\/(?:Applications|Library|System|usr|private)(?:\/|$)/.test(path)) {
      fields.uid = integer(0); fields.gid = integer(0);
      const mounted = [...mounts].find(mount => path === mount || path.startsWith(mount + '/'))
        ?? (path === cryptexMount || path.startsWith(cryptexMount + '/') ? cryptexMount : undefined);
      fields.dev = integer(mounted ? 16777243 : 16777231);
      let permissions = raw.isDirectory() ? 0o755 : typeof raw.mode === 'bigint' ? Number(raw.mode & 0o7777n) : raw.mode & 0o7777;
      if (mounted && options.strictModes) permissions = raw.isDirectory() ? 0o755 : 0o644;
      if (mounted && !options.strictModes) {
        permissions = raw.isDirectory() ? 0o775 : 0o664; fields.gid = integer(80);
        if (path.endsWith('.simruntime/Contents/Resources/RuntimeRoot')) permissions = 0o1775;
        if (path.endsWith('/SystemVersion.plist')) permissions = 0o444;
      }
      if (path === '/private/var/run') { fields.gid = integer(1); permissions = 0o775; }
      if (path === '/private/var/run/com.apple.security.cryptexd') { fields.gid = integer(1); permissions = 0o705; }
      if (path === cryptexDirectory) fields.gid = integer(1);
      if (path === '/usr/sbin/diskutil') permissions = 0o755;
      const type = typeof raw.mode === 'bigint' ? Number(raw.mode & 0o170000n) : raw.mode & 0o170000;
      fields.mode = integer(type | permissions);
    }
    Object.assign(fields, overrides.get(path));
    return new Proxy(raw, { get(target, key) {
      if (Object.hasOwn(fields, key)) return Reflect.get(fields, key);
      const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
    } });
  };
  const reads: { operation: string; path: string }[] = [];
  const identities: { operation: string; path: string; ino: string }[] = [];
  const observed = (operation: string, path: string, raw: Stats | BigIntStats) => {
    const value = view(path, raw); identities.push({ operation, path, ino: String(value.ino) }); return value;
  };
  const checked = async (operation: string, path: string) => {
    const target = map(path); reads.push({ operation, path }); await before?.(operation, path);
    if (missing.has(path)) throw Object.assign(new Error('Missing temporary fixture path'), { code: 'ENOENT' });
    return target;
  };
  const fakeFs = { ...base.host.fs,
    lstat: (async (path: string, options?: { bigint?: boolean }) => observed('lstat', path, await fs.lstat(await checked('lstat', path), options))) as typeof fs.lstat,
    open: (async (path: string, flags: number, mode?: number) => {
      const handle = await fs.open(await checked('open', path), flags, mode);
      await checked('open-result', path);
      return new Proxy(handle, { get(target, key) {
        if (key === 'stat') return async (options?: { bigint?: boolean }) => { await checked('opened-stat', path); return observed('opened-stat', path, await target.stat(options)); };
        if (key === 'read') return async (buffer: Buffer, offset: number, length: number, position: number | null) => {
          await checked('opened-read', path); const result = await target.read(buffer, offset, length, position);
          await checked(result.bytesRead ? 'opened-read-result' : 'eof-read-result', path); return result;
        };
        if (key === 'close') return async () => { await checked('close', path); await target.close(); };
        const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
      } });
    }) as typeof fs.open,
    readdir: (async (path: string) => { const target = await checked('readdir', path);
      if (listings.has(path)) return listings.get(path)!;
      if (!defaultVisible && path === runtimeBundle.slice(0, runtimeBundle.lastIndexOf('/'))) return [];
      return fs.readdir(target);
    }) as typeof fs.readdir,
  };
  const host = { ...base.host, fs: fakeFs };
  const effects: { executable: string; args: readonly string[] }[] = [];
  const source: SourceProcess = async (executable, args, options) => {
    effects.push({ executable, args: [...args] }); await before?.(executable === '/usr/sbin/diskutil' ? 'mount' : 'convert', args[5] ?? args[2] ?? '');
    if (executable === '/usr/sbin/diskutil') {
      if (args.length !== 3 || args[0] !== 'info' || args[1] !== '-plist' || !mounts.has(args[2]!)
        || options.shell !== false || options.signal.aborted || options.timeoutMs < 1 || options.timeoutMs > 10000
        || options.maxOutputBytes < 1 || options.maxOutputBytes > 65536) throw new Error('Unexpected fake mount command');
      return mountResults.get(args[2]!) ?? { exitCode: 0, stdout: readonlyXml(args[2]!), stderr: '' };
    }
    if (executable === '/usr/bin/plutil' && ([...mounts].some(mount => args[5]?.startsWith(mount + '/')) || args[5]?.startsWith(cryptexMount + '/'))) {
      if (args.length !== 6 || args.slice(0, 5).join('\0') !== '-convert\0json\0-o\0-\0--'
        || !/\/Contents\/(?:Info\.plist|Resources\/profile\.plist|Resources\/RuntimeRoot\/System\/Library\/CoreServices\/SystemVersion\.plist)$/.test(args[5]!)
        || options.shell !== false || options.signal.aborted || options.timeoutMs < 1 || options.timeoutMs > 10000 || options.maxOutputBytes > 65536) throw new Error('Unexpected fake mounted conversion');
      return convertedResults.get(args[5]!) ?? { exitCode: 0, stdout: await fs.readFile(map(args[5]!), 'utf8'), stderr: '' };
    }
    return base.source(executable, args, options);
  };
  const launches: { executable: string; args: readonly string[]; options: Record<string, unknown>; child: Child }[] = [];
  const launch = ((executable: string, args: readonly string[], options: Record<string, unknown>) => {
    const child: Child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), signals: [] as string[],
      kill(signal = 'SIGTERM') { this.signals.push(signal); return true; } });
    launches.push({ executable, args: [...args], options, child });
    queueMicrotask(async () => {
      try { const result = await source(executable, args, { shell: false, signal: new AbortController().signal, timeoutMs: 10000,
        maxOutputBytes: args[5] === '/Applications/Xcode.app/Contents/Info.plist' ? 131072 : 65536 });
        child.stdout.write(result.stdout); child.stderr.write(result.stderr); child.emit('close', result.exitCode, null);
      } catch (error) { child.emit('error', error); child.emit('close', null, null); }
    });
    return child;
  }) as unknown as typeof spawn;
  return { ...base, host, source, launch, launches, map, write, addMount, mounts, overrides, listings, missing, mountResults, convertedResults, reads, identities, effects,
    setBefore(hook?: Hook) { before = hook; }, setDefaultVisible(value: boolean) { defaultVisible = value; },
    addCryptex() { mounts.add(cryptexMount); write(cryptexBundle + '/Contents/Info.plist', { CFBundleIdentifier: runtimeId });
      write(cryptexBundle + '/Contents/Resources/profile.plist', { platformIdentifier: 'com.apple.platform.iphonesimulator', minHostVersion: '14.0.0', supportedArchs: ['arm64'], supportedProductFamilyIDs: [1], defaultVersionString: '27.0' });
      write(cryptexRuntimeRoot + '/System/Library/CoreServices/SystemVersion.plist', { ProductVersion: '27.0', ProductBuildVersion: 'cryptex-fixture' }); },
  };
}
