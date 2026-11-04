import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { platform, release } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { z } from 'zod/v4';
import { adbEnvironment, findAdb } from '../../../src/device/android/tools.js';
import { parseStackIdentity, type StackIdentity } from '../../../src/appium/stack.js';
import type { DeviceScope } from './row.js';

/** One version the kit looked for: what it read, or why it could not. An unavailable version is never left empty. */
export type Probed<T> = { status: 'recorded'; value: T } | { status: 'unavailable'; reason: string };

/** What the kit needs from the world to read versions. Everything live is injected, so a test never runs a tool. */
export interface VersionSources {
  node: string;
  platform: string;
  osRelease: string;
  packageVersion(): Promise<string>;
  stackIdentity(): Promise<StackIdentity>;
  /** Runs one command with no shell and returns its stdout; it rejects with a reason in words. */
  run(argv: readonly string[]): Promise<string>;
}

export interface VersionTarget {
  category: DeviceScope;
  device: string;
}

const props = {
  androidOsRelease: 'ro.build.version.release',
  androidApiLevel: 'ro.build.version.sdk',
  androidModel: 'ro.product.model',
  androidFingerprint: 'ro.build.fingerprint',
} as const;

async function probe<T>(read: () => Promise<T>): Promise<Probed<T>> {
  try {
    return { status: 'recorded', value: await read() };
  } catch (error) {
    return { status: 'unavailable', reason: error instanceof Error ? error.message : String(error) };
  }
}

const nonBlank = (lines: string[]) => lines.map(line => line.trim()).filter(Boolean);

/** The first line of a tool's output, or a failure that says the tool printed nothing. */
function firstLine(output: string, what: string): string {
  const line = nonBlank(output.split('\n'))[0];
  if (!line) throw new Error(`${what} printed nothing`);
  return line;
}

const simulatorDevices = z.object({ devices: z.record(z.string(), z.array(z.object({
  udid: z.string(), name: z.string(), deviceTypeIdentifier: z.string().optional() }))) });
const simulatorRuntimes = z.object({ runtimes: z.array(z.object({ identifier: z.string(), version: z.string(), buildversion: z.string() })) });

function parseJson<T>(output: string, schema: z.ZodType<T>, what: string): T {
  let raw: unknown;
  try {
    raw = JSON.parse(output);
  } catch {
    throw new Error(`${what} did not print JSON`);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new Error(`${what} printed an unexpected shape`);
  return parsed.data;
}

async function xcodeVersion(sources: VersionSources): Promise<{ version: string; build: string }> {
  const output = await sources.run(['xcodebuild', '-version']);
  const version = /^Xcode (\S+)/m.exec(output)?.[1];
  const build = /^Build version (\S+)/m.exec(output)?.[1];
  if (!version || !build) throw new Error('xcodebuild -version printed an unrecognised shape');
  return { version, build };
}

async function simulatorRuntime(sources: VersionSources, udid: string) {
  const devices = parseJson(await sources.run(['xcrun', 'simctl', 'list', '-j', 'devices']), simulatorDevices, 'simctl list devices');
  for (const [runtime, list] of Object.entries(devices.devices)) {
    const device = list.find(candidate => candidate.udid.toUpperCase() === udid.toUpperCase());
    if (!device) continue;
    const runtimes = parseJson(await sources.run(['xcrun', 'simctl', 'list', '-j', 'runtimes']), simulatorRuntimes, 'simctl list runtimes');
    const found = runtimes.runtimes.find(candidate => candidate.identifier === runtime);
    if (!found) throw new Error(`simctl does not list the runtime ${runtime}`);
    return { udid: device.udid, name: device.name, deviceType: device.deviceTypeIdentifier ?? 'unknown', runtime,
      iosVersion: found.version, iosBuild: found.buildversion };
  }
  throw new Error(`simulator ${udid} is not in the default device set`);
}

/** The adb serial an assignment names: the serial itself, or the serial of the emulator running the named AVD. */
async function androidSerial(sources: VersionSources, target: VersionTarget): Promise<string> {
  const listed = nonBlank((await sources.run(['adb', 'devices'])).split('\n').slice(1))
    .map(line => line.split(/\s+/)[0]!);
  if (listed.includes(target.device)) return target.device;
  if (target.category === 'android-emulator') {
    for (const serial of listed.filter(candidate => candidate.startsWith('emulator-'))) {
      const name = await sources.run(['adb', '-s', serial, 'emu', 'avd', 'name']).then(output => nonBlank(output.split('\n'))[0], () => undefined);
      if (name === target.device) return serial;
    }
  }
  throw new Error(`adb does not list ${target.device}`);
}

async function emulatorVersion(sources: VersionSources): Promise<string> {
  const output = await sources.run(['emulator', '-version']);
  const line = nonBlank(output.split('\n')).find(candidate => /emulator version/i.test(candidate));
  if (!line) throw new Error('emulator -version printed no version line');
  return line;
}

async function gitState(sources: VersionSources): Promise<Probed<unknown> | { revision: string; dirty: boolean }> {
  try {
    const revision = firstLine(await sources.run(['git', 'rev-parse', 'HEAD']), 'git rev-parse HEAD');
    const dirty = nonBlank((await sources.run(['git', 'status', '--porcelain'])).split('\n')).length > 0;
    return { revision, dirty };
  } catch (error) {
    return { status: 'unavailable', reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * The versions an attempt records: the runtime, the source it was built from, and the tools of the assigned
 * device's category. A tool that cannot be read is recorded as unavailable with the reason.
 * The git and package entries keep their earlier shape when they are read.
 */
export async function collectVersions(sources: VersionSources, target: VersionTarget) {
  const tools: Record<string, Probed<unknown>> = {};
  tools.macos = await probe(async () => firstLine(await sources.run(['sw_vers', '-productVersion']), 'sw_vers'));
  tools.stack = await probe(async () => await sources.stackIdentity());
  if (target.category === 'ios-simulator') {
    tools.xcode = await probe(() => xcodeVersion(sources));
    tools.simulator = await probe(() => simulatorRuntime(sources, target.device));
  } else {
    tools.adb = await probe(async () => {
      const lines = nonBlank((await sources.run(['adb', 'version'])).split('\n')).slice(0, 2);
      if (!lines.length) throw new Error('adb version printed nothing');
      return lines.join(' | ');
    });
    if (target.category === 'android-emulator') tools.emulator = await probe(() => emulatorVersion(sources));
    const serial = await probe(() => androidSerial(sources, target));
    tools.androidSerial = serial;
    for (const [name, property] of Object.entries(props)) {
      tools[name] = serial.status === 'unavailable'
        ? { status: 'unavailable', reason: `the device serial is unavailable: ${serial.reason}` }
        : await probe(async () => firstLine(await sources.run(['adb', '-s', serial.value, 'shell', 'getprop', property]), `getprop ${property}`));
    }
  }
  const packageVersion = await probe(() => sources.packageVersion());
  return {
    node: sources.node,
    platform: sources.platform,
    osRelease: sources.osRelease,
    git: await gitState(sources),
    package: packageVersion.status === 'recorded' ? packageVersion.value : packageVersion,
    tools,
  };
}

const execute = promisify(execFile);
const TOOL_DEADLINE_MS = 20_000;

/** The kit's own sources: the real tools, run with no shell and a deadline each. The Jev key never reaches them. */
export function liveVersionSources(options: { cwd: string; environment?: NodeJS.ProcessEnv }): VersionSources {
  const { TYPESAFE_API_KEY: _withheld, ...environment } = options.environment ?? process.env;
  const adbPath = (): Promise<string> => findAdb({ environment: adbEnvironment(environment) });
  const program = async (name: string): Promise<string> => {
    if (name === 'adb') return await adbPath();
    if (name === 'emulator') {
      const adb = await adbPath().catch(() => undefined);
      return adb && dirname(adb).endsWith('platform-tools') ? join(dirname(dirname(adb)), 'emulator', 'emulator') : 'emulator';
    }
    return name;
  };
  return {
    node: process.version,
    platform: platform(),
    osRelease: release(),
    packageVersion: async () => {
      const raw = JSON.parse(await readFile(join(options.cwd, 'package.json'), 'utf8')) as { version?: unknown };
      if (typeof raw.version !== 'string' || !raw.version) throw new Error('package.json has no version');
      return raw.version;
    },
    stackIdentity: async () => {
      const module = fileURLToPath(new URL('../../../dist/appium/stack-identity.js', import.meta.url));
      try {
        return parseStackIdentity((await import(pathToFileURL(module).href) as { default: unknown }).default);
      } catch {
        throw new Error(`${module} is missing or invalid; run npm run build first`);
      }
    },
    run: async argv => {
      const [name, ...args] = argv;
      try {
        const { stdout } = await execute(await program(name!), args, { cwd: options.cwd, env: environment, timeout: TOOL_DEADLINE_MS, maxBuffer: 8 * 1024 * 1024 });
        return stdout;
      } catch (error) {
        const failure = error as NodeJS.ErrnoException & { stderr?: string; killed?: boolean; code?: string | number };
        if (failure.code === 'ENOENT') throw new Error(`${name!} is not installed or not on PATH`);
        if (failure.killed) throw new Error(`${name!} did not finish within ${String(TOOL_DEADLINE_MS / 1000)} s`);
        const detail = nonBlank((failure.stderr ?? '').split('\n'))[0];
        throw new Error(`${name!} exited ${String(failure.code ?? 'abnormally')}${detail ? `: ${detail}` : ''}`);
      }
    },
  };
}
