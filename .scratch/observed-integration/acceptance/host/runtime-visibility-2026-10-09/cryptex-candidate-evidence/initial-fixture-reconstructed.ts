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
export const cryptexMount = cryptexDirectory + '/com.apple.iPhoneOS.SimulatorRuntime-v24.1.434.0.iVUyCZ';
export const cryptexRuntimes = cryptexMount + '/Library/Developer/CoreSimulator/Profiles/Runtimes';
export const cryptexBundle = cryptexRuntimes + '/iOS 27.0.simruntime';
export const cryptexInfo = cryptexBundle + '/Contents/Info.plist';
export const cryptexProfile = cryptexBundle + '/Contents/Resources/profile.plist';
export const cryptexRuntimeRoot = cryptexBundle + '/Contents/Resources/RuntimeRoot';
export const cryptexSystem = cryptexRuntimeRoot + '/System/Library/CoreServices/SystemVersion.plist';
export const readonlyMountXml = '<?xml version="1.0" encoding="UTF-8"?>\n'
  + '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
  + '<plist version="1.0"><dict><key>MountPoint</key><string>' + cryptexMount + '</string>'
  + '<key>Writable</key><false/><key>WritableMedia</key><false/><key>WritableVolume</key><false/>'
  + '<key>Sealed</key><string>Yes</string></dict></plist>\n';

type Receipt = Awaited<ReturnType<SourceProcess>>;
type Child = EventEmitter & { stdout: PassThrough; stderr: PassThrough; signals: string[]; kill(signal?: string): boolean };

/** All installed paths resolve into this fixture's temporary trees; no native command is launched. */
export async function cryptexFixture() {
  const base = await allocationFixture();
  const tree = join(base.root, 'cryptex-host'); mkdirSync(tree, { mode: 0o700 });
  const namespacePath = (path: string) => path === '/' || path === '/private' || path.startsWith('/private/');
  const map = (path: string): string => {
    if (resolve(path) !== path || path.includes('\0')) throw new Error('Noncanonical fixture path');
    if (namespacePath(path)) return join(tree, path);
    if (/^\/(?:Applications|Library|System|usr)(?:\/|$)/.test(path) || path.startsWith(base.root + '/')) return base.map(path);
    throw new Error('Fixture path outside temporary trees');
  };
  const write = (path: string, value: unknown) => {
    if (!namespacePath(path) || path === '/') throw new Error('Not a private fixture path');
    const target = map(path); mkdirSync(join(target, '..'), { recursive: true, mode: 0o700 });
    writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value), { mode: 0o600 });
  };
  write(cryptexInfo, { CFBundleIdentifier: runtimeId, CFBundleShortVersionString: '392' });
  write(cryptexProfile, { platformIdentifier: 'com.apple.platform.iphonesimulator', minHostVersion: '14.0.0',
    supportedArchs: ['arm64', 'x86_64'], supportedProductFamilyIDs: [2, 1], defaultVersionString: '27.0' });
  write(cryptexSystem, { ProductVersion: '27.0', ProductBuildVersion: '24A434' });
  base.write('/usr/sbin/diskutil', 'fake executable', 0o755);
  const groupDirectories = new Set([cryptexMount + '/Library/Developer/CoreSimulator',
    cryptexMount + '/Library/Developer/CoreSimulator/Profiles', cryptexRuntimes, cryptexBundle,
    cryptexBundle + '/Contents', cryptexBundle + '/Contents/Resources', cryptexRuntimeRoot]);
  const overrides = new Map<string, Partial<Stats>>();
  const view = (path: string, raw: Stats): Stats => {
    const fields: Partial<Stats> = {};
    if (namespacePath(path)) {
      fields.uid = 0; fields.gid = 0; fields.dev = path === cryptexMount || path.startsWith(cryptexMount + '/') ? 16777243 : 16777231;
      let permissions = raw.isDirectory() ? 0o755 : 0o644;
      if (path === '/private/var/run') { fields.gid = 1; permissions = 0o775; }
      if (path === '/private/var/run/com.apple.security.cryptexd') { fields.gid = 1; permissions = 0o705; }
      if (path === cryptexDirectory) fields.gid = 1;
      if (groupDirectories.has(path)) { fields.gid = 80; permissions = path === cryptexRuntimeRoot ? 0o1775 : 0o775; }
      if (path === cryptexInfo || path === cryptexProfile) { fields.gid = 80; permissions = 0o664; }
      if (path === cryptexSystem) permissions = 0o444;
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
  const fakeFs = { ...base.host.fs,
    lstat: (async (path: string) => { const target = map(path); reads.push({ operation: 'lstat', path });
      return view(path, await fs.lstat(target)); }) as typeof fs.lstat,
    open: (async (path: string, flags: number, mode?: number) => {
      const target = map(path); reads.push({ operation: 'open', path }); const handle = await fs.open(target, flags, mode);
      return new Proxy(handle, { get(targetHandle, key) {
        if (key === 'stat') return async () => view(path, await targetHandle.stat());
        const value = Reflect.get(targetHandle, key); return typeof value === 'function' ? value.bind(targetHandle) : value;
      } });
    }) as typeof fs.open,
    readdir: (async (path: string) => { const target = map(path); reads.push({ operation: 'readdir', path });
      return path === runtimeBundle.slice(0, runtimeBundle.lastIndexOf('/')) ? [] : fs.readdir(target);
    }) as typeof fs.readdir,
  };
  const host: InstalledHost = { ...base.host, fs: fakeFs };
  const metadataPaths = new Set([cryptexInfo, cryptexProfile, cryptexSystem]);
  const source: SourceProcess = async (executable, args, options) => {
    effects.push({ executable, args: [...args] });
    if (executable === '/usr/sbin/diskutil' || (executable === '/usr/bin/plutil' && args[5]?.startsWith(cryptexMount + '/'))) {
      if (options.shell !== false || options.signal.aborted || !Number.isSafeInteger(options.timeoutMs)
        || options.timeoutMs < 1 || options.timeoutMs > 10000 || !Number.isSafeInteger(options.maxOutputBytes)
        || options.maxOutputBytes < 1 || options.maxOutputBytes > 65536) throw new Error('Unsafe Cryptex fixture options');
      if (executable === '/usr/sbin/diskutil') {
        if (args.length !== 3 || args[0] !== 'info' || args[1] !== '-plist' || args[2] !== cryptexMount) throw new Error('Unexpected fixture mount command');
        return { exitCode: 0, stdout: readonlyMountXml, stderr: '' };
      }
      if (args.length !== 6 || args.slice(0, 5).join('\0') !== '-convert\0json\0-o\0-\0--' || !metadataPaths.has(args[5]!)) throw new Error('Unexpected fixture Cryptex conversion');
      return { exitCode: 0, stdout: await fs.readFile(map(args[5]!), 'utf8'), stderr: '' };
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
  return { ...base, host, source, map, write, overrides, reads, effects, launches, launch };
}
