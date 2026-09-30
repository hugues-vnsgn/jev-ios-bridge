import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import type { Action, ActionScenarioContext, AndroidAppIdentity, DevicePreparation, DeviceDriver, PrepareScenarioContext, Snapshot } from '../../contracts/index.js';
import { isIosApp } from '../../contracts/index.js';
import { DeviceReasonError, selectAndroidDeviceName } from '../index.js';
import { DeviceLease, DeviceLeaseBusyError, type LeaseHolder } from '../lease.js';
import { adbRunner, inLedger, type AdbResult, type AdbRunner } from './adb.js';
import { deviceAgentClient, type DeviceAgentClient } from './agent-client.js';
import type { Clock } from './settle.js';
import { adbEnvironment, androidTools, type AndroidTools } from './tools.js';

/** Where the bridge pushes its device agent: its own path, never mobilecli's `/data/local/tmp/mobilecli.dex`. */
export const AGENT_DEVICE_PATH = '/data/local/tmp/jev-ios-bridge-agent.dex';
const AGENT_CLASS = 'com.mobilenext.mobilecli.DeviceServer';
const AGENT_SOCKET = 'localabstract:mobilecli-server';
/** How the bridge starts its agent (release spec phase 4 item 4): mobilecli 1.0.14's start, without its `pkill`. */
export const AGENT_START_COMMAND = `CLASSPATH=${AGENT_DEVICE_PATH} nohup app_process / ${AGENT_CLASS} >/dev/null 2>&1 &`;
/** What marks the bridge's own agent in `/proc/<pid>/environ` (open point 22). */
const OWN_AGENT_CLASSPATH = `CLASSPATH=${AGENT_DEVICE_PATH}`;
/** Another tool's UI-automation program, by what its `ps` line runs (open point 22). */
const AGENT_PATTERNS = [AGENT_CLASS, 'UiDumpServer', 'com.mobilenext.devicekit', 'uiautomator', 'io.appium.uiautomator2'];
const MIN_API_LEVEL = 31;
const FORWARD_ATTEMPTS = 3;
const AGENT_READY_MS = 5_000;
const AGENT_POLL_MS = 100;
/** How long a killed agent gets to exit before the bridge gives up on it. */
const AGENT_EXIT_MS = 2_000;

/**
 * A device layer failure the bridge has no reason code for: `DEVICE_ERROR`, naming the layer that failed
 * as its `vendorCode`. Its message never quotes the device's output, which can carry screen text.
 */
export class AndroidDeviceError extends DeviceReasonError {
  constructor(readonly vendorCode: 'adb' | 'agent', message: string) {
    super('DEVICE_ERROR', message);
    this.name = 'AndroidDeviceError';
  }
}

export interface AndroidDriverOptions {
  /** The script's `device`. The driver factory builds one driver per script, so the driver is given it here. */
  device?: { serial?: string; avd?: string } | undefined;
  /** JEV_ANDROID_DEVICE. */
  defaultDevice?: string | undefined;
  /** The tools check. Defaults to `androidTools()`. */
  tools?: () => Promise<AndroidTools>;
  /** Defaults to the production runner for the `adb` the tools check found. */
  runner?: AdbRunner;
  /** The device agent's client for a forwarded port. Defaults to `deviceAgentClient()`. */
  agentClient?: (port: number) => DeviceAgentClient;
  clock?: Clock;
  /** A free local port, found by binding `127.0.0.1:0`. Injectable for tests. */
  freePort?: () => Promise<number>;
  /** Where `observe` saves `screen-N.jpg` (Issue 15). */
  screenshotFolder?: string;
  leaseRoot?: string;
}

const realClock: Clock = { now: () => performance.now(), sleep: ms => delay(ms) };

function freeLocalPort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => { typeof address === 'object' && address ? resolvePort(address.port) : reject(new Error('No port bound')); });
    });
  });
}

/** One word for the device shell, single-quoted so spaces, quotes, `&`, `;` and `%` arrive unchanged (open point 8). */
function quoted(word: string): string {
  return `'${word.replaceAll("'", "'\\''")}'`;
}

/** The serials `adb devices -l` lists, with their state (`device`, `unauthorized`, `offline`, …). */
function listedDevices(stdout: string): Map<string, string> {
  const listed = new Map<string, string>();
  for (const line of stdout.split('\n').slice(1)) {
    const [serial, state] = line.trim().split(/\s+/);
    if (serial && state) listed.set(serial, state);
  }
  return listed;
}

type AgentProcess = { pid: number; own: boolean };

/** A foreign agent holds the device: `DEVICE_BUSY`, and the bridge leaves it running. */
const foreignAgentFound = (identity: string) => new DeviceReasonError('DEVICE_BUSY',
  `Device ${identity} is in use by another tool's UI-automation agent. Stop that tool, then run again.`);

/** What a lease holder record lists for the next run to sweep: the agent and the forward, each on its serial. */
const ownedAgent = (serial: string, pid: number) => `agent ${serial} ${String(pid)}`;
const ownedForward = (serial: string, port: number) => `forward ${serial} tcp:${String(port)}`;

/** What a dead holder listed on this serial. Other entries (another serial, or phase 5's log streams) aren't swept here. */
function listedLeftovers(holder: LeaseHolder | undefined, serial: string): { pids: Set<number>; forwards: Set<string> } {
  const pids = new Set<number>();
  const forwards = new Set<string>();
  for (const entry of holder?.ownedProcesses ?? []) {
    const [kind, onSerial, value] = entry.split(' ');
    if (onSerial !== serial || value === undefined) continue;
    if (kind === 'agent' && /^\d+$/.test(value)) pids.add(Number(value));
    if (kind === 'forward' && /^tcp:\d+$/.test(value)) forwards.add(value);
  }
  return { pids, forwards };
}

/**
 * The Android device driver (release spec phase 4): drives mobilecli's device agent directly, over `adb`
 * and JSON-RPC, and never runs mobilecli (ADR-0006). `prepare` takes the device lease on the device
 * identity before touching the device, refuses when another tool's agent is running, restarts the app with
 * its launch options, and starts and checks the bridge's own agent.
 */
export class AndroidDriver implements DeviceDriver {
  private readonly lease: DeviceLease;
  private readonly clock: Clock;
  private runner: AdbRunner | undefined;
  private prepared: DevicePreparation | undefined;
  private serial: string | undefined;
  /** Whether this run restarted the app, so `close` stops it only then. */
  private restarted = false;
  /** Set once `close` begins (Issue 16): from then on no step issues new device work. */
  private closeBegun = false;
  private forwardPort: number | undefined;
  private agentPids: number[] = [];
  private agent: DeviceAgentClient | undefined;

  constructor(private readonly options: AndroidDriverOptions = {}) {
    this.lease = new DeviceLease(options.leaseRoot ? { root: options.leaseRoot } : {});
    this.clock = options.clock ?? realClock;
  }

  preparation(): DevicePreparation {
    if (!this.prepared) throw new Error('Driver is not prepared');
    return this.prepared;
  }

  prepare(scenario: PrepareScenarioContext, signal: AbortSignal): Promise<void> {
    return this.lease.track(() => this.prepareIssued(scenario, signal));
  }

  observe(_signal: AbortSignal): Promise<Snapshot> {
    return Promise.reject(new Error('The Android driver\'s observe is not built yet'));
  }

  act(_action: Action, _snapshot: Snapshot, _scenario: ActionScenarioContext, _signal: AbortSignal): Promise<Snapshot | undefined> {
    return Promise.reject(new Error('The Android driver\'s act is not built yet'));
  }

  close(_signal: AbortSignal): Promise<void> {
    return Promise.reject(new Error('The Android driver\'s close is not built yet'));
  }

  private async prepareIssued(scenario: PrepareScenarioContext, signal: AbortSignal): Promise<void> {
    if (this.lease.held) throw new Error('Driver is already prepared');
    if (isIosApp(scenario.app)) throw new Error('The Android driver only runs Android scripts; this scenario has no app.package');
    const app = scenario.app;
    const tools = await (this.options.tools ?? androidTools)();
    this.runner = this.options.runner ?? adbRunner({ adb: tools.adb, environment: adbEnvironment() });
    const name = selectAndroidDeviceName(this.options.device, this.options.defaultDevice);
    const { serial, identity } = await this.resolveDevice(name, signal);
    let deadHolder: LeaseHolder | undefined;
    try { deadHolder = await this.lease.take(identity); }
    catch (error) {
      if (error instanceof DeviceLeaseBusyError) throw new DeviceReasonError('DEVICE_BUSY', error.message);
      throw error;
    }
    this.serial = serial;
    try {
      const sweptLeftovers = await this.checkAgents(serial, identity, deadHolder, signal);
      await this.checkDevice(serial, app.package, signal);
      await this.restart(serial, app, signal);
      await this.startAgent(serial, identity, tools, signal);
      this.prepared = { deviceIdentity: identity, serial, agentSha256: tools.agent.sha256, ...(sweptLeftovers ? { sweptLeftovers } : {}) };
    } catch (error) {
      // A refusal before the restart leaves nothing to undo on the device: release now, as the iOS driver does.
      if (!this.restarted && this.lease.releasable) await this.lease.release();
      throw error;
    }
  }

  /** One finite `adb` command, in the lease's ledger. No new command once `close` began or the run was cancelled. */
  private async adb(args: string[], signal: AbortSignal): Promise<AdbResult> {
    if (this.closeBegun) throw new Error('The driver is closing; no new device work');
    if (signal.aborted) throw signal.reason;
    const runner = this.runner!;
    return inLedger(this.lease, 'adb', () => runner(args, signal));
  }

  private shell(serial: string, words: string[], signal: AbortSignal): Promise<AdbResult> {
    return this.adb(['-s', serial, 'shell', words.map(quoted).join(' ')], signal);
  }

  /** A command that must succeed; any other exit is `DEVICE_ERROR` with `vendorCode` `adb`. */
  private async required(what: string, pending: Promise<AdbResult>): Promise<string> {
    const result = await pending;
    if (result.exitCode !== 0) throw new AndroidDeviceError('adb', `adb could not ${what} (exit ${String(result.exitCode)})`);
    return result.stdout;
  }

  private async getprop(serial: string, name: string, signal: AbortSignal): Promise<string> {
    return (await this.required(`read ${name}`, this.shell(serial, ['getprop', name], signal))).trim();
  }

  /**
   * The device name to a serial and a device identity (item 2). A name `adb devices` lists is a serial;
   * anything else is an AVD name, matched against the running emulators' `ro.boot.qemu.avd_name`. An
   * emulator's identity is its AVD name, a phone's its serial. Only reads: the lease isn't held yet.
   */
  private async resolveDevice(name: string, signal: AbortSignal): Promise<{ serial: string; identity: string }> {
    const listed = listedDevices(await this.required('list devices', this.adb(['devices', '-l'], signal)));
    const state = listed.get(name);
    if (state !== undefined) {
      if (state === 'unauthorized') throw new DeviceReasonError('DEVICE_UNAUTHORIZED', `Device ${name} hasn't accepted this Mac's USB-debugging key`);
      if (state !== 'device') throw new DeviceReasonError('DEVICE_NOT_CONNECTED', `Device ${name} is ${state}`);
      const avd = name.startsWith('emulator-') ? await this.getprop(name, 'ro.boot.qemu.avd_name', signal) : '';
      return { serial: name, identity: avd || name };
    }
    const matches: string[] = [];
    for (const [serial, serialState] of listed) {
      if (!serial.startsWith('emulator-') || serialState !== 'device') continue;
      if (await this.getprop(serial, 'ro.boot.qemu.avd_name', signal) === name) matches.push(serial);
    }
    if (matches.length === 0) throw new DeviceReasonError('DEVICE_NOT_CONNECTED', `No connected device or running emulator is named ${name}`);
    if (matches.length > 1) {
      throw new DeviceReasonError('DEVICE_AMBIGUOUS', `${String(matches.length)} running emulators have the AVD name ${name}: ${matches.join(', ')}`);
    }
    return { serial: matches[0]!, identity: name };
  }

  /**
   * The UI-automation agents running on the device (open point 22). A process running the agent's class is
   * the bridge's own only when its environment holds exactly the bridge's `CLASSPATH`; one whose environment
   * can't be read is foreign, since it can't be shown to be the bridge's. One gone meanwhile is skipped.
   */
  private async agentsOn(serial: string, signal: AbortSignal): Promise<AgentProcess[]> {
    const listing = await this.required('list processes', this.shell(serial, ['ps', '-A', '-o', 'PID,NAME,ARGS'], signal));
    const agents: AgentProcess[] = [];
    for (const line of listing.split('\n').slice(1)) {
      const match = /^\s*(\d+)\s+(\S+)\s*(.*)$/.exec(line);
      if (!match || !AGENT_PATTERNS.some(pattern => `${match[2]!} ${match[3]!}`.includes(pattern))) continue;
      const pid = Number(match[1]);
      if (!match[3]!.includes(AGENT_CLASS)) { agents.push({ pid, own: false }); continue; }
      const environ = await this.environOf(serial, pid, signal);
      if (environ === 'gone') continue;
      agents.push({ pid, own: environ?.includes(OWN_AGENT_CLASSPATH) === true });
    }
    return agents;
  }

  /** A process's environment entries; `gone` once it has exited, undefined when it can't be read. */
  private async environOf(serial: string, pid: number, signal: AbortSignal): Promise<string[] | 'gone' | undefined> {
    const result = await this.shell(serial, ['cat', `/proc/${String(pid)}/environ`], signal);
    if (result.exitCode === 0) return result.stdout.split('\0');
    return /No such file or directory/.test(result.stderr) ? 'gone' : undefined;
  }

  /** Kill one of the bridge's own agents by its pid and wait until it's gone. Never `pkill` by class name. */
  private async killAgent(serial: string, pid: number, signal: AbortSignal): Promise<void> {
    const killed = await this.shell(serial, ['kill', String(pid)], signal);
    if (killed.exitCode !== 0 && !/No such process/.test(killed.stderr)) throw new AndroidDeviceError('adb', `adb could not kill agent ${String(pid)}`);
    const startedAt = this.clock.now();
    while (await this.environOf(serial, pid, signal) !== 'gone') {
      if (this.clock.now() - startedAt >= AGENT_EXIT_MS) throw new AndroidDeviceError('adb', `The bridge's agent ${String(pid)} did not exit`);
      await this.clock.sleep(AGENT_POLL_MS);
    }
  }

  /** This serial's forwards, as `tcp:<port>` → remote. */
  private async forwardsOn(serial: string, signal: AbortSignal): Promise<Map<string, string>> {
    const listing = await this.required('list forwards', this.adb(['forward', '--list'], signal));
    const forwards = new Map<string, string>();
    for (const line of listing.split('\n')) {
      const [onSerial, local, remote] = line.trim().split(' ');
      if (onSerial === serial && local && remote) forwards.set(local, remote);
    }
    return forwards;
  }

  private async removeForward(serial: string, local: string, signal: AbortSignal): Promise<void> {
    const removed = await this.adb(['-s', serial, 'forward', '--remove', local], signal);
    if (removed.exitCode !== 0 && !/not found/.test(removed.stderr)) throw new AndroidDeviceError('adb', `adb could not remove forward ${local}`);
  }

  /**
   * The agent check and sweep (item 2, open point 22). A foreign agent refuses the run, untouched. Every
   * other agent is the bridge's own and, with this run holding the lease, can't belong to a live run: it is
   * killed by pid. With no agent left, this serial's agent forwards go too. True when a dead holder's
   * listed agent or forward was swept.
   */
  private async checkAgents(serial: string, identity: string, deadHolder: LeaseHolder | undefined, signal: AbortSignal): Promise<boolean> {
    const agents = await this.agentsOn(serial, signal);
    if (agents.some(agent => !agent.own)) {
      throw foreignAgentFound(identity);
    }
    const listed = listedLeftovers(deadHolder, serial);
    let swept = false;
    for (const agent of agents) {
      await this.killAgent(serial, agent.pid, signal);
      if (listed.pids.has(agent.pid)) swept = true;
    }
    for (const [local, remote] of await this.forwardsOn(serial, signal)) {
      if (remote !== AGENT_SOCKET && !listed.forwards.has(local)) continue;
      await this.removeForward(serial, local, signal);
      if (listed.forwards.has(local)) swept = true;
    }
    return swept;
  }

  /**
   * The device checks (item 2), in order: API level, boot, the app installed, then the screen. A screen that
   * is only off is woken; a keyguard still showing is `DEVICE_LOCKED` (open point 16). No setting is changed.
   */
  private async checkDevice(serial: string, appPackage: string, signal: AbortSignal): Promise<void> {
    const api = Number(await this.getprop(serial, 'ro.build.version.sdk', signal));
    if (!Number.isInteger(api) || api < MIN_API_LEVEL) {
      throw new DeviceReasonError('DEVICE_UNSUPPORTED', `Device ${serial} runs API ${String(api)}; the bridge needs Android 12 (API 31) or later`);
    }
    if (await this.getprop(serial, 'sys.boot_completed', signal) !== '1') {
      throw new DeviceReasonError('DEVICE_NOT_BOOTED', `Device ${serial} hasn't finished booting`);
    }
    const installed = await this.shell(serial, ['pm', 'path', appPackage], signal);
    if (!/^package:/m.test(installed.stdout)) throw new DeviceReasonError('APP_NOT_INSTALLED', `${appPackage} isn't installed on ${serial}`);
    let screen = await this.screenState(serial, signal);
    if (!screen.awake) {
      await this.required('wake the screen', this.shell(serial, ['input', 'keyevent', 'KEYCODE_WAKEUP'], signal));
      screen = await this.screenState(serial, signal);
    }
    if (screen.keyguard) {
      throw new DeviceReasonError('DEVICE_LOCKED', `Device ${serial}'s screen is locked. Set Screen lock to None on a test device`);
    }
  }

  /** Whether the screen is awake and the keyguard showing, from `dumpsys window policy`'s `KeyguardServiceDelegate`. */
  private async screenState(serial: string, signal: AbortSignal): Promise<{ awake: boolean; keyguard: boolean }> {
    const policy = await this.required('read the screen state', this.shell(serial, ['dumpsys', 'window', 'policy'], signal));
    const delegate = policy.slice(policy.indexOf('KeyguardServiceDelegate'));
    const showing = /^\s*showing=(true|false)\s*$/m.exec(delegate)?.[1];
    const interactive = /^\s*interactiveState=(\S+)\s*$/m.exec(delegate)?.[1];
    if (!policy.includes('KeyguardServiceDelegate') || showing === undefined || interactive === undefined) {
      throw new AndroidDeviceError('adb', `adb could not read ${serial}'s screen state`);
    }
    return { awake: interactive === 'INTERACTIVE_STATE_AWAKE', keyguard: showing === 'true' };
  }

  /**
   * The restart (item 3): force-stop the app, then `am start -W` of `app.activity` or the launcher activity,
   * each extra as `--es <key> <value>`. App data is never cleared. `am start` reports a failure in its
   * output, and on API 31 still exits 0, so only `Status: ok` counts as launched.
   */
  private async restart(serial: string, app: AndroidAppIdentity, signal: AbortSignal): Promise<void> {
    this.restarted = true;
    await this.required('stop the app', this.shell(serial, ['am', 'force-stop', app.package], signal));
    const component = app.activity ? `${app.package}/${app.activity}` : await this.launcherActivity(serial, app.package, signal);
    const extras = Object.entries(app.intentExtras ?? {}).flatMap(([key, value]) => ['--es', key, value]);
    const launched = await this.shell(serial, ['am', 'start', '-W', '-n', component, ...extras], signal);
    if (launched.exitCode !== 0 || !/^Status: ok\s*$/m.test(launched.stdout)) {
      throw new AndroidDeviceError('adb', `am start could not launch ${component}`);
    }
  }

  private async launcherActivity(serial: string, appPackage: string, signal: AbortSignal): Promise<string> {
    const resolved = await this.required('look up the launcher activity', this.shell(serial,
      ['cmd', 'package', 'resolve-activity', '--brief', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER', appPackage], signal));
    const component = resolved.trim().split('\n').at(-1)?.trim() ?? '';
    if (!component.startsWith(`${appPackage}/`)) {
      throw new AndroidDeviceError('adb', `${appPackage} has no launcher activity; name the activity to start in app.activity`);
    }
    return component;
  }

  /**
   * Start the bridge's agent (item 4): push the checked agent to the bridge's own path, start it, forward a
   * free port to its socket, and poll `device.version` until it returns the pinned SHA-256. Its forward and
   * pid go into the lease's holder record, so a crash takeover can sweep them.
   */
  private async startAgent(serial: string, identity: string, tools: AndroidTools, signal: AbortSignal): Promise<void> {
    await this.required('push the device agent', this.adb(['-s', serial, 'push', tools.agent.path, AGENT_DEVICE_PATH], signal));
    await this.required('start the device agent', this.adb(['-s', serial, 'shell', AGENT_START_COMMAND], signal));
    const port = await this.forward(serial, signal);
    const agent = (this.options.agentClient ?? (forwarded => deviceAgentClient({ port: forwarded })))(port);
    const answered = await this.awaitAgent(agent, tools.agent.sha256, signal);
    const agents = await this.agentsOn(serial, signal);
    // Record every agent of the bridge's before refusing, so close can fence it whatever happens next.
    for (const own of agents.filter(found => found.own)) {
      this.agentPids.push(own.pid);
      await this.lease.own(ownedAgent(serial, own.pid));
    }
    if (agents.some(found => !found.own)) {
      throw foreignAgentFound(identity);
    }
    if (!answered) throw new AndroidDeviceError('agent', `The device agent didn't answer with the pinned SHA-256 within ${String(AGENT_READY_MS / 1000)} s`);
    if (this.agentPids.length === 0) throw new AndroidDeviceError('agent', 'The device agent that answered is not the bridge\'s own');
    this.agent = agent;
  }

  /** Forward a free local port to the agent's socket, on a new port each time the port can't be bound (at most 3 tries). */
  private async forward(serial: string, signal: AbortSignal): Promise<number> {
    for (let attempt = 1; ; attempt++) {
      if (signal.aborted) throw signal.reason;
      const port = await (this.options.freePort ?? freeLocalPort)();
      this.forwardPort = port;
      await this.lease.own(ownedForward(serial, port));
      const result = await this.adb(['-s', serial, 'forward', `tcp:${String(port)}`, AGENT_SOCKET], signal);
      if (result.exitCode === 0) return port;
      this.forwardPort = undefined;
      await this.lease.disown(ownedForward(serial, port));
      if (!/cannot bind/.test(`${result.stdout}${result.stderr}`) || attempt === FORWARD_ATTEMPTS) {
        throw new AndroidDeviceError('adb', `adb could not forward a port to the device agent (exit ${String(result.exitCode)})`);
      }
    }
  }

  /** Poll `device.version` every 100 ms for up to 5 s. True once it returns the pinned SHA-256. */
  private async awaitAgent(agent: DeviceAgentClient, sha256: string, signal: AbortSignal): Promise<boolean> {
    const startedAt = this.clock.now();
    while (true) {
      if (this.closeBegun) throw new Error('The driver is closing; no new device work');
      if (signal.aborted) throw signal.reason;
      try {
        if ((await inLedger(this.lease, 'agent', () => agent.version(signal))).dexSha256 === sha256) return true;
      } catch (error) {
        // Not answering yet is expected while it starts; a cancel is not.
        if (signal.aborted) throw error;
      }
      if (this.clock.now() - startedAt >= AGENT_READY_MS) return false;
      await this.clock.sleep(AGENT_POLL_MS);
    }
  }
}
