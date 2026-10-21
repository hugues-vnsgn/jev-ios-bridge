import { spawn } from 'node:child_process';
import type { Readable } from 'node:stream';
import { isAbsolute, dirname, join } from 'node:path';
import { realpath, stat } from 'node:fs/promises';
import { userInfo } from 'node:os';
import type { DeviceIdentityUnavailableReason } from '../../scripted/vocabulary.js';

export type IdentityUnavailableReason = DeviceIdentityUnavailableReason;
export type IdentityConflictReason = 'GUEST_NAME_DISAGREEMENT' | 'USB_SERIAL_DISAGREEMENT' |
  'PATH_INODE_DISAGREEMENT' | 'TRANSPORT_CHANGED' | 'HOST_SOURCE_DISAGREEMENT';
export type IdentityFailure =
  | { code: 'DEVICE_IDENTITY_UNAVAILABLE'; reason: IdentityUnavailableReason }
  | { code: 'DEVICE_IDENTITY_CONFLICT'; reason: IdentityConflictReason }
  | { code: 'DEVICE_NOT_FOUND' | 'DEVICE_AMBIGUOUS' | 'CATEGORY_NOT_ENABLED' | 'PROFILE_CONFLICT' };

export class IdentityResolutionError extends Error {
  readonly code: IdentityFailure['code'];
  readonly reason: IdentityUnavailableReason | IdentityConflictReason | undefined;
  constructor(readonly failure: IdentityFailure) {
    super('reason' in failure ? `${failure.code}: ${failure.reason}` : failure.code);
    this.name = 'IdentityResolutionError';
    this.code = failure.code;
    this.reason = 'reason' in failure ? failure.reason : undefined;
  }
}

export function identityUnavailable(reason: IdentityUnavailableReason): never {
  throw new IdentityResolutionError({ code: 'DEVICE_IDENTITY_UNAVAILABLE', reason });
}

export interface ProbeChild {
  readonly stdout: Readable;
  readonly stderr: Readable;
  kill(signal: NodeJS.Signals): boolean;
  once(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  once(event: 'error', listener: (error: Error) => void): this;
}
export type ProbeSpawn = (file: string, args: readonly string[], options: {
  env: NodeJS.ProcessEnv; shell: false; stdio: ['ignore', 'pipe', 'pipe'];
}) => ProbeChild;
export type ConsoleProcess = Readonly<{ pid: number; startedAt: string; uid: number; local: boolean }>;
export type DirectoryIdentity = Readonly<{ path: string; device: string; inode: string }>;
export type EmulatorVersion = Readonly<{ value: string; source: 'running-sdk-binary' | 'process-discovery' }>;
export interface AndroidHostProbe {
  listener(port: number, signal: AbortSignal): Promise<ConsoleProcess>;
  directory(path: string, signal: AbortSignal): Promise<DirectoryIdentity>;
  version(process: ConsoleProcess, signal: AbortSignal): Promise<EmulatorVersion>;
}
export type AndroidTransport = Readonly<{ serial: string; state: 'device' | 'offline' | 'unauthorized' }>;
export type EmulatorObservation = Readonly<{
  category: 'android-emulator'; value: string; transport: AndroidTransport;
  provenance: { avdName: string; avdId: string; directory: { device: string; inode: string };
    version: EmulatorVersion; process: { pid: number; startedAt: string } };
  probeReplies: { name: string; id: string; path: string;
    guestName: { kind: 'read'; reply: string } | { kind: 'not-readable'; state: 'offline' | 'unauthorized' }; finalId: string };
}>;
export type PhoneObservation = Readonly<{
  category: 'android-phone'; value: string; transport: AndroidTransport;
  probeReplies: { hardwareSerial: string };
}>;
export type AndroidIdentityInventory = readonly (EmulatorObservation | PhoneObservation)[];
export type SimulatorIdentityInventory = Readonly<{ reply: string; deviceSet: string }>;
export type SimulatorAppObservation = Readonly<{ kind: 'installed'; reply: string } | { kind: 'missing'; reply: string }>;
export interface IdentityProbe {
  android(signal: AbortSignal, serial?: string): Promise<AndroidIdentityInventory>;
  simulatorSet(signal: AbortSignal): Promise<SimulatorIdentityInventory>;
  simulatorApp(input: { deviceSet: string; udid: string; bundleId: string; signal: AbortSignal }): Promise<SimulatorAppObservation>;
}
export type IdentityProbeOptions = {
  adb: string; environment: NodeJS.ProcessEnv; deadlineMs?: number; versionDeadlineMs?: number; spawn?: ProbeSpawn; host?: AndroidHostProbe;
  simulator?: (signal: AbortSignal) => Promise<SimulatorIdentityInventory>;
  simulatorApp?: IdentityProbe['simulatorApp'];
  defaultSimulatorSet?: () => Promise<string>;
};

type ProbeCommand = { kind: 'transports' } |
  { kind: 'console'; serial: string; field: 'name' | 'id' | 'path' } |
  { kind: 'property'; serial: string; property: 'ro.boot.qemu.avd_name' | 'ro.serialno' } |
  { kind: 'listener'; port: number } | { kind: 'process'; pid: number } | { kind: 'executable'; pid: number } |
  { kind: 'version'; executable: string } | { kind: 'simulators'; deviceSet: string } |
  { kind: 'simulator-app'; deviceSet: string; udid: string; bundleId: string };

/** A console that holds back `avd id`/`avd path` or rejects the token: its access token is not this account's. */
function unauthenticated(reply: string): boolean {
  return reply.startsWith('KO: authentication') || /^KO: +bad sub-command\r?$/m.test(reply);
}

function consoleValue(reply: string): string {
  const match = /^([^\x00-\x1f\x7f]+)\r\nOK\r\n$/.exec(reply);
  const value = match?.[1];
  if (!value || value === 'NO_AVD_INFO' || value.startsWith('KO:')) identityUnavailable('MALFORMED_PROVENANCE');
  return value;
}

export function identityProbe(options: IdentityProbeOptions): IdentityProbe {
  const spawnChild: ProbeSpawn = options.spawn ?? ((file, args, config) => spawn(file, args, config));
  const { TYPESAFE_API_KEY: _secret, ...environment } = options.environment;
  const complete = (command: ProbeCommand, signal: AbortSignal): Promise<{ exitCode: number; stdout: Buffer }> => {
    let file: string;
    let args: string[];
    switch (command.kind) {
      case 'transports': file = options.adb; args = ['devices', '-l']; break;
      case 'console': file = options.adb; args = ['-s', command.serial, 'emu', 'avd', command.field]; break;
      case 'property': file = options.adb; args = ['-s', command.serial, 'shell', 'getprop', command.property]; break;
      case 'listener': file = '/usr/sbin/lsof'; args = ['-nP', '-a', `-iTCP:${command.port}`, '-sTCP:LISTEN', '-Fpun']; break;
      case 'process': file = '/bin/ps'; args = ['-o', 'lstart=', '-p', String(command.pid)]; break;
      case 'executable': file = '/usr/sbin/lsof'; args = ['-nP', '-a', '-p', String(command.pid), '-d', 'txt', '-Fn']; break;
      case 'version': file = command.executable; args = ['-version']; break;
      case 'simulators': file = '/usr/bin/xcrun'; args = ['simctl', '--set', command.deviceSet, 'list', 'devices', '--json']; break;
      case 'simulator-app': file = '/usr/bin/xcrun'; args = ['simctl', '--set', command.deviceSet, 'get_app_container', command.udid, command.bundleId, 'app']; break;
    }
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(signal.reason); return; }
      let child: ProbeChild;
      const childEnvironment = { ...environment };
      if (command.kind === 'simulators' || command.kind === 'simulator-app') {
        delete childEnvironment.SIMCTL_DEVICE_SET_PATH;
        delete childEnvironment.SIMULATOR_DEVICE_SET_PATH;
      }
      // `ps -o lstart=` prints localized day and month names, which Date.parse can't read.
      if (command.kind === 'listener' || command.kind === 'process' || command.kind === 'executable') childEnvironment.LC_ALL = 'C';
      try { child = spawnChild(file, args, { env: childEnvironment, shell: false, stdio: ['ignore', 'pipe', 'pipe'] }); }
      catch { reject(new IdentityResolutionError({ code: 'DEVICE_IDENTITY_UNAVAILABLE', reason: 'PROVENANCE_INACCESSIBLE' })); return; }
      const chunks: Buffer[] = [];
      let bytes = 0, settled = false;
      let killTimer: NodeJS.Timeout | undefined;
      const finish = (error?: unknown, exitCode = 0) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        signal.removeEventListener('abort', abort);
        if (error !== undefined) { reject(error); return; }
        resolve({ exitCode, stdout: Buffer.concat(chunks) });
      };
      const terminate = (error: unknown) => {
        killTimer = setTimeout(() => { child.kill('SIGKILL'); }, 20);
        finish(error);
        child.kill('SIGTERM');
      };
      const abort = () => terminate(signal.reason);
      const deadline = setTimeout(() => terminate(new IdentityResolutionError({ code: 'DEVICE_IDENTITY_UNAVAILABLE', reason: 'PROBE_TIMEOUT' })),
        // A cold first exec of the signed launcher after a reboot measured 3.4 s idle and over 5 s beside two emulators.
        command.kind === 'version' ? options.versionDeadlineMs ?? 15_000 : options.deadlineMs ?? 2_000);
      signal.addEventListener('abort', abort, { once: true });
      child.stdout.on('data', (part: Buffer) => {
        bytes += part.length;
        if (bytes > 65_536) terminate(new IdentityResolutionError({ code: 'DEVICE_IDENTITY_UNAVAILABLE', reason: 'MALFORMED_PROVENANCE' }));
        else if (!settled) chunks.push(part);
      });
      child.stderr.resume();
      child.once('error', () => { clearTimeout(killTimer); finish(new IdentityResolutionError({ code: 'DEVICE_IDENTITY_UNAVAILABLE', reason: 'PROVENANCE_INACCESSIBLE' })); });
      child.once('close', code => {
        clearTimeout(killTimer);
        if (typeof code === 'number') finish(undefined, code);
        else finish(new IdentityResolutionError({ code: 'DEVICE_IDENTITY_UNAVAILABLE', reason: 'PROVENANCE_INACCESSIBLE' }));
      });
    });
  };
  const decodeReply = (stdout: Buffer): string => {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(stdout); }
    catch { return identityUnavailable('MALFORMED_PROVENANCE'); }
  };
  const run = async (command: Exclude<ProbeCommand, { kind: 'simulator-app' }>, signal: AbortSignal): Promise<string> => {
    const result = await complete(command, signal);
    if (result.exitCode !== 0) identityUnavailable('PROVENANCE_INACCESSIBLE');
    return decodeReply(result.stdout);
  };
  const account = userInfo();
  const host: AndroidHostProbe = options.host ?? {
    async listener(port, signal) {
      if (!Number.isInteger(port) || port <= 0 || port > 65535) identityUnavailable('MALFORMED_PROVENANCE');
      const listing = await complete({ kind: 'listener', port }, signal);
      // lsof exits 1 with nothing listed when no process listens there: the console isn't on this host.
      if (listing.exitCode === 1 && listing.stdout.length === 0) identityUnavailable('REMOTE_CONSOLE');
      if (listing.exitCode !== 0) identityUnavailable('PROVENANCE_INACCESSIBLE');
      const fields = decodeReply(listing.stdout).split('\n');
      const pids = fields.filter(field => field.startsWith('p'));
      const uid = fields.find(field => field.startsWith('u'))?.slice(1);
      const addresses = fields.filter(field => field.startsWith('n')).map(field => field.slice(1));
      if (pids.length !== 1 || uid !== String(account.uid)) identityUnavailable('PROVENANCE_INACCESSIBLE');
      if (!addresses.some(address => address === `127.0.0.1:${port}` || address === `[::1]:${port}`)) identityUnavailable('REMOTE_CONSOLE');
      const pid = Number(pids[0]?.slice(1));
      if (!Number.isSafeInteger(pid) || pid <= 0) identityUnavailable('PROVENANCE_INACCESSIBLE');
      const start = Date.parse((await run({ kind: 'process', pid }, signal)).trim());
      if (!Number.isFinite(start)) identityUnavailable('PROVENANCE_INACCESSIBLE');
      return { pid, uid: account.uid, startedAt: new Date(start).toISOString(), local: true };
    },
    async directory(path) {
      const canonical = await realpath(path);
      const metadata = await stat(canonical, { bigint: true });
      if (!metadata.isDirectory() || metadata.uid !== BigInt(account.uid)) identityUnavailable('PROVENANCE_INACCESSIBLE');
      return { path: canonical, device: metadata.dev.toString(), inode: metadata.ino.toString() };
    },
    async version(process, signal) {
      const reply = await run({ kind: 'executable', pid: process.pid }, signal);
      const candidates = reply.split('\n').filter(line => line.startsWith('n')).map(line => line.slice(1)).filter(path =>
        /\/qemu\/darwin-(?:aarch64|x86_64)\/qemu-system-(?:aarch64|x86_64)(?:-headless)?$/.test(path) || /\/emulator$/.test(path));
      if (candidates.length !== 1) identityUnavailable('PROVENANCE_INACCESSIBLE');
      const executable = await realpath(candidates[0]!);
      const launcher = executable.endsWith('/emulator') ? executable : join(dirname(dirname(dirname(executable))), 'emulator');
      const canonicalLauncher = await realpath(launcher);
      if (canonicalLauncher !== launcher) identityUnavailable('PROVENANCE_INACCESSIBLE');
      const started = Date.parse(process.startedAt);
      const files = await Promise.all([...new Set([executable, launcher])].map(async path => ({ path, metadata: await stat(path, { bigint: true }) })));
      for (const { metadata } of files) {
        if (!metadata.isFile() || metadata.uid !== BigInt(account.uid) || !(metadata.mode & 0o111n) ||
            metadata.mtimeMs > BigInt(started) || metadata.ctimeMs > BigInt(started)) identityUnavailable('PROVENANCE_INACCESSIBLE');
      }
      const version = /(?:^|\n)Android emulator version (\d+\.\d+(?:\.\d+)*)[ \r\n(]/.exec(await run({ kind: 'version', executable: launcher }, signal))?.[1];
      if (!version) identityUnavailable('PROVENANCE_INACCESSIBLE');
      for (const { path, metadata } of files) {
        const current = await stat(path, { bigint: true });
        if (await realpath(path) !== path || current.dev !== metadata.dev || current.ino !== metadata.ino ||
            current.uid !== metadata.uid || current.mode !== metadata.mode || current.size !== metadata.size ||
            current.mtimeNs !== metadata.mtimeNs || current.ctimeNs !== metadata.ctimeNs) identityUnavailable('PROVENANCE_INACCESSIBLE');
      }
      return { value: version, source: 'running-sdk-binary' };
    },
  };
  return {
    async android(signal, selectedSerial) {
      try {
      const socket = environment.ADB_SERVER_SOCKET;
      const server = environment.ANDROID_ADB_SERVER_ADDRESS;
      if ((server && !['localhost', '127.0.0.1', '::1'].includes(server)) ||
          (socket && !/^tcp:(?:(?:localhost|127\.0\.0\.1|\[::1\]):)?\d+$/.test(socket))) identityUnavailable('REMOTE_CONSOLE');
      const reply = await run({ kind: 'transports' }, signal);
      const observations: (EmulatorObservation | PhoneObservation)[] = [];
      const lines = reply.split('\n');
      if (lines[0]?.trim() !== 'List of devices attached') identityUnavailable('MALFORMED_PROVENANCE');
      const explicit = selectedSerial && lines.slice(1).some(line => line.trim().split(/\s+/)[0] === selectedSerial);
      for (const line of lines.slice(1)) {
        if (!line.trim()) continue;
        const [serial, listed] = line.trim().split(/\s+/);
        if (!serial) identityUnavailable('MALFORMED_PROVENANCE');
        if (explicit && serial !== selectedSerial) continue;
        // A transport in any other state (authorizing, recovery, no permissions) can't be the run's device unless named.
        const known = listed === 'device' || listed === 'offline' || listed === 'unauthorized';
        if (!known && !explicit) continue;
        const transport: AndroidTransport = { serial, state: known ? listed : 'offline' };
        if (!serial.startsWith('emulator-')) {
          // An unready phone can't be read; named, its transport state is the driver's refusal.
          if (transport.state !== 'device') {
            if (explicit) observations.push({ category: 'android-phone', value: serial, transport, probeReplies: { hardwareSerial: '' } });
            continue;
          }
          const hardwareSerial = await run({ kind: 'property', serial, property: 'ro.serialno' }, signal);
          const value = hardwareSerial.trim();
          if (!/^[A-Za-z0-9_.-]+$/.test(value)) identityUnavailable('MALFORMED_PROVENANCE');
          const network = serial.includes(':') || serial.endsWith('._adb-tls-connect._tcp');
          if (!network && serial !== value) throw new IdentityResolutionError({ code: 'DEVICE_IDENTITY_CONFLICT', reason: 'USB_SERIAL_DISAGREEMENT' });
          observations.push({ category: 'android-phone', value, transport, probeReplies: { hardwareSerial } });
          continue;
        }
        let process: ConsoleProcess;
        try {
          process = await host.listener(Number(serial.slice(9)), signal);
          if (!process.local) identityUnavailable('REMOTE_CONSOLE');
        } catch (error) {
          // No console on this host's loopback: it can't be running the named AVD here, so only a named serial refuses.
          if (!explicit && error instanceof IdentityResolutionError && error.reason === 'REMOTE_CONSOLE') continue;
          throw error;
        }
        if (!Number.isSafeInteger(process.pid) || process.pid <= 0 || !Number.isFinite(Date.parse(process.startedAt))) identityUnavailable('PROVENANCE_INACCESSIBLE');
        // Before `avd id` and `avd path`, which emulators older than 30 can't answer.
        const version = await host.version(process, signal);
        const versionMatch = /^(\d+)\.\d+(?:\.\d+)*$/.exec(version.value);
        if (!versionMatch) identityUnavailable('PROVENANCE_INACCESSIBLE');
        if (Number(versionMatch[1]) < 30) identityUnavailable('EMULATOR_VERSION_UNSUPPORTED');
        const name = await run({ kind: 'console', serial, field: 'name' }, signal);
        const id = await run({ kind: 'console', serial, field: 'id' }, signal);
        const path = await run({ kind: 'console', serial, field: 'path' }, signal);
        if ([name, id, path].some(unauthenticated)) identityUnavailable('PROVENANCE_INACCESSIBLE');
        const avdName = consoleValue(name), avdId = consoleValue(id);
        const consolePath = consoleValue(path);
        if (!isAbsolute(consolePath) || !/^[A-Za-z0-9_.-]+$/.test(avdName)) identityUnavailable('MALFORMED_PROVENANCE');
        const directory = await host.directory(consolePath, signal);
        if (!isAbsolute(directory.path) || !/^\d+$/.test(directory.device) || !/^\d+$/.test(directory.inode)) identityUnavailable('PROVENANCE_INACCESSIBLE');
        const { state } = transport;
        const guestName: EmulatorObservation['probeReplies']['guestName'] = state === 'device'
          ? { kind: 'read' as const, reply: await run({ kind: 'property', serial, property: 'ro.boot.qemu.avd_name' }, signal) }
          : { kind: 'not-readable' as const, state };
        if (guestName.kind === 'read' && guestName.reply.trim() && guestName.reply.trim() !== avdName) {
          throw new IdentityResolutionError({ code: 'DEVICE_IDENTITY_CONFLICT', reason: 'GUEST_NAME_DISAGREEMENT' });
        }
        const finalId = await run({ kind: 'console', serial, field: 'id' }, signal);
        const finalProcess = await host.listener(Number(serial.slice(9)), signal);
        if (consoleValue(finalId) !== avdId || finalProcess.pid !== process.pid || finalProcess.startedAt !== process.startedAt) {
          throw new IdentityResolutionError({ code: 'DEVICE_IDENTITY_CONFLICT', reason: 'TRANSPORT_CHANGED' });
        }
        observations.push({ category: 'android-emulator', value: directory.path, transport,
          provenance: { avdName, avdId, directory: { device: directory.device, inode: directory.inode },
            version, process: { pid: process.pid, startedAt: process.startedAt } },
          probeReplies: { name, id, path, guestName, finalId } });
      }
      return observations;
      } catch (error) {
        if (error instanceof IdentityResolutionError || signal.aborted) throw error;
        identityUnavailable('PROVENANCE_INACCESSIBLE');
      }
    },
    simulatorApp: options.simulatorApp ?? (async ({ signal, ...request }) => {
      const result = await complete({ kind: 'simulator-app', ...request }, signal);
      const reply = decodeReply(result.stdout);
      if (result.exitCode !== 0) return { kind: 'missing', reply };
      if (!isAbsolute(reply.trim()) || /[\x00-\x1f\x7f]/.test(reply.trim())) identityUnavailable('MALFORMED_PROVENANCE');
      return { kind: 'installed', reply };
    }),
    simulatorSet: options.simulator ?? (async signal => {
      try {
        const deviceSet = await (options.defaultSimulatorSet?.() ?? realpath(join(account.homedir, 'Library/Developer/CoreSimulator/Devices')));
        if (!isAbsolute(deviceSet)) identityUnavailable('PROVENANCE_INACCESSIBLE');
        return { deviceSet, reply: await run({ kind: 'simulators', deviceSet }, signal) };
      } catch (error) {
        if (error instanceof IdentityResolutionError || signal.aborted) throw error;
        identityUnavailable('PROVENANCE_INACCESSIBLE');
      }
    }),
  };
}
