import * as fs from 'node:fs/promises';
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Admission } from '../../src/device/admission.js';
import type { InstalledHost } from '../../src/observed/allocation-config.js';
import type { SourceProcess } from '../../src/observed/create-source.js';
import type { CliRunner } from '../../src/device/index.js';

export const typeId = 'com.apple.CoreSimulator.SimDeviceType.iPhone-17';
export const runtimeId = 'com.apple.CoreSimulator.SimRuntime.iOS-27-0';
export const fixtureDevice = 'ABCDEF00-0000-4000-8000-000000000001';
export const xcodeInfoPath = '/Applications/Xcode.app/Contents/Info.plist';
export const deviceProfilePath = '/Library/Developer/CoreSimulator/Profiles/DeviceTypes/iPhone 17.simdevicetype/Contents/Resources/profile.plist';
export const runtimeBundle = '/Library/Developer/CoreSimulator/Profiles/Runtimes/iOS 27.0.simruntime';
export const runtimeProfilePath = runtimeBundle + '/Contents/Resources/profile.plist';
export const runtimeSystemPath = runtimeBundle + '/Contents/Resources/RuntimeRoot/System/Library/CoreServices/SystemVersion.plist';
export const fixtureBudgets = { maxRetainedAllocations: 8, maxConcurrentPreparations: 1,
  reservationBytesPerAllocation: 1000, maxReservedBytes: 8000, minFreeBytes: 2000, maxArtifactBytes: 1024,
  createTimeoutMs: 10000, bootTimeoutMs: 10000, installTimeoutMs: 10000, launchTimeoutMs: 10000,
  readinessTimeoutMs: 10000, readyTtlMs: 300000 };
export async function allocationFixture(options: { now?: () => number; fault?: NonNullable<Parameters<typeof Admission.forTesting>[0]['fault']> } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'observed-allocator-')));
  await fs.chmod(root, 0o700); const home = join(root, 'home'); const runsDir = join(root, 'runs');
  mkdirSync(home, { mode: 0o700 }); mkdirSync(runsDir, { mode: 0o700 });
  mkdirSync(join(home, 'Library/Developer/CoreSimulator'), { recursive: true, mode: 0o700 });
  const store = join(root, 'store'); mkdirSync(store, { mode: 0o700 });
  const admission = Admission.forTesting({ root: store, backend: 'fake', ...options });
  const configDirectory = join(home, 'Library/Application Support/jev-ios-bridge'); mkdirSync(configDirectory, { recursive: true, mode: 0o700 });
  const configPath = join(configDirectory, 'allocation.json');
  const configure = (settings: Record<string, unknown> = {}) => writeFileSync(configPath, JSON.stringify({ version: 1, ...fixtureBudgets, inventory: [], ...settings }), { mode: 0o600 });
  configure();
  const map = (path: string) => /^\/(?:Applications|Library|System|usr)(?:\/|$)/.test(path) ? join(root, 'host', path) : path;
  const write = (path: string, value: unknown, mode = 0o644) => {
    const target = map(path); mkdirSync(join(target, '..'), { recursive: true, mode: 0o700 });
    writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value), { mode });
  };
  write(xcodeInfoPath, { CFBundleIdentifier: 'com.apple.dt.Xcode', CFBundleExecutable: 'Xcode', LSMinimumSystemVersion: '26.6' });
  write('/Applications/Xcode.app/Contents/version.plist', { CFBundleShortVersionString: '27.0', ProductBuildVersion: '27A-fixture' });
  write('/System/Library/CoreServices/SystemVersion.plist', { ProductVersion: '27.0.1', ProductBuildVersion: '27-fixture' });
  for (const p of ['/Applications/Xcode.app/Contents/MacOS/Xcode', '/Applications/Xcode.app/Contents/Developer/usr/bin/simctl', '/usr/bin/xcrun', '/usr/bin/plutil']) write(p, 'fake executable', 0o755);
  mkdirSync(map('/Applications/Xcode.app/Contents/Developer/Platforms/iPhoneSimulator.platform'), { recursive: true, mode: 0o700 });
  write('/Library/Developer/CoreSimulator/Profiles/DeviceTypes/iPhone 17.simdevicetype/Contents/Info.plist', { CFBundleIdentifier: typeId });
  write(deviceProfilePath, { supportedProductFamilyIDs: [1], minRuntimeVersion: '26.0', supportedArchs: ['arm64', 'x86_64'] });
  write(runtimeBundle + '/Contents/Info.plist', { CFBundleIdentifier: runtimeId, CFBundleShortVersionString: '384', DTPlatformVersion: '14.0' });
  write(runtimeProfilePath, { platformIdentifier: 'com.apple.platform.iphonesimulator', minHostVersion: '14.0.0',
    supportedArchs: ['arm64', 'x86_64'], supportedProductFamilyIDs: [2, 1], defaultVersionString: '27.0' });
  write(runtimeSystemPath, { ProductVersion: '27.0.1', ProductBuildVersion: '27A-fixture' });
  let simulatorFreeBytes = 100000; let stagingFreeBytes = 100000;
  const fakeFs = { ...fs,
    lstat: ((p: string, ...rest: []) => fs.lstat(map(p), ...rest)) as typeof fs.lstat,
    open: ((p: string, ...rest: [number, number?]) => fs.open(map(p), ...rest)) as typeof fs.open,
    readdir: ((p: string, ...rest: []) => fs.readdir(map(p), ...rest)) as typeof fs.readdir,
    statfs: (async (p: string) => ({ type: 0, bsize: 1, blocks: 1000000, bfree: 1000000,
      bavail: p.includes('Library/Developer/CoreSimulator') ? simulatorFreeBytes : stagingFreeBytes, files: 100000, ffree: 100000 })) as typeof fs.statfs,
  };
  const host: InstalledHost = { fs: fakeFs, account: { homedir: home, uid: process.getuid!() }, platform: 'darwin', architecture: 'arm64' };
  const app = join(root, 'Fixture.app'); await fs.cp(fileURLToPath(new URL('./observed-artifacts/Fixture.app', import.meta.url)), app, { recursive: true });
  const calls: string[] = []; let serial = 0; let currentDevice = fixtureDevice;
  let before: ((operation: string, path?: string) => Promise<void>) | undefined;
  let createResult: { exitCode: number | null; stdout: string; stderr: string } | undefined;
  let state = 'Booted'; let available = true; let screenshotPath: string | undefined;
  const commandResults = new Map<string, Awaited<ReturnType<CliRunner>>>();
  const source: SourceProcess = async (executable, args, options) => {
    if (options.shell !== false || options.signal.aborted || options.timeoutMs <= 0 || options.maxOutputBytes >
      (executable === '/usr/bin/plutil' && args.length === 6 && args.slice(0, 5).join('\0') === '-convert\0json\0-o\0-\0--'
        && args[5] === xcodeInfoPath ? 131072 : 65536)) assertNever('Unsafe fake source options');
    if (executable === '/usr/bin/plutil') {
      if (args.length !== 6 || args.slice(0, 5).join('\0') !== '-convert\0json\0-o\0-\0--' || !(args[5]!.startsWith('/Applications/Xcode.app/Contents/') || args[5] === '/System/Library/CoreServices/SystemVersion.plist' || args[5]!.startsWith('/Library/Developer/CoreSimulator/') || args[5]!.startsWith(root + '/'))) assertNever('Unexpected fake plist command');
      const p = args[5]!; calls.push('plist'); await before?.('plist', p);
      return { stdout: p.endsWith('.app/Info.plist') ? JSON.stringify({ CFBundleIdentifier: 'org.example.fixture', CFBundleExecutable: 'Fixture',
        CFBundlePackageType: 'APPL', CFBundleSupportedPlatforms: ['iPhoneSimulator'], MinimumOSVersion: '17.0' })
        : await fs.readFile(map(p), 'utf8'), stderr: '', exitCode: 0 };
    }
    if (executable !== '/usr/bin/xcrun' || args[0] !== 'simctl' || args[1] !== 'create' || args.length !== 5 || !/^jev-observed-[A-F0-9-]{36}$/.test(args[2]!) || args[3] !== typeId || args[4] !== runtimeId) assertNever('Unexpected source command');
    calls.push('create'); await before?.('create'); serial++;
    currentDevice = `ABCDEF00-0000-4000-8000-${String(serial).padStart(12, '0')}`;
    return createResult ?? { stdout: currentDevice + '\n', stderr: '', exitCode: 0 };
  };
  const runner: CliRunner = async args => {
    const op = args[1]!; calls.push(op); await before?.(op);
    const override = commandResults.get(op); if (override) return override;
    if (op === 'list') return { stdout: JSON.stringify({ schema: 'mobilebuildmcp.output.simulator-list', schemaVersion: '2', didError: false,
      data: { simulators: [{ simulatorId: currentDevice, state, isAvailable: available }] } }), stderr: '', exitCode: 0 };
    const schema = op === 'boot' ? 'simulator-action-result' : op === 'install' ? 'install-result' : op === 'launch-app' ? 'launch-result' : 'capture-result';
    if (!['boot', 'install', 'launch-app', 'snapshot-ui', 'screenshot'].includes(op)) assertNever('No cleanup/retry source command');
    return { stdout: JSON.stringify({ schema: 'mobilebuildmcp.output.' + schema, schemaVersion: '2', didError: false,
      data: { artifacts: { simulatorId: currentDevice, ...(op === 'screenshot' && screenshotPath ? { screenshotPath } : {}) }, capture: { type: 'runtime-snapshot', rs: '1', count: 0, targets: [] } } }), stderr: '', exitCode: 0 };
  };
  const window = async () => { calls.push('window'); assertNever('Preparation attachment must not present'); };
  const request = (actionId = 'allocate-one') => ({ version: 1, actionId, source: { kind: 'create', deviceTypeId: typeId, runtimeId },
    app: { artifactPath: app, bundleId: 'org.example.fixture', build: { id: 'fixture', origin: 'host' } } });
  const inventory = (udid = fixtureDevice, inventoryId = 'stock-one') => [{ inventoryId, udid, deviceTypeId: typeId, runtimeId,
    creation: { createdAt: '2026-10-08T00:00:00Z', origin: 'fixture', evidenceRef: join(root, 'creation.json') }, attestation: { freshUnused: true as const, exclusive: true as const } }];
  return { root, home, runsDir, store, admission, host, source, runner, window, app, calls, map, write, configPath, configure, request, inventory,
    setBefore(fn: typeof before) { before = fn; }, setCreateResult(result: typeof createResult) { createResult = result; },
    setStorage(simulator: number, staging = simulator) { simulatorFreeBytes = simulator; stagingFreeBytes = staging; },
    setCommandResult(op: string, result: Awaited<ReturnType<CliRunner>>) { commandResults.set(op, result); },
    setScreenshotPath(path: string) { screenshotPath = path; },
    setState(value: string) { state = value; }, setAvailable(value: boolean) { available = value; },
    async cleanup() {
      async function writable(path: string): Promise<void> { const s = await fs.lstat(path); if (!s.isDirectory() || s.isSymbolicLink()) return;
        await fs.chmod(path, 0o700); for (const name of await fs.readdir(path)) await writable(join(path, name)); }
      await writable(root); await fs.rm(root, { recursive: true, force: true });
    } };
}
function assertNever(message: string): never { throw new Error(message); }
