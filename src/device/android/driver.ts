import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { Action, ActionScenarioContext, ActOutcome, AndroidAppIdentity, DevicePreparation, DeviceDriver, Direction, Element,
  PrepareScenarioContext, Snapshot } from '../../contracts/index.js';
import { isIosApp } from '../../contracts/index.js';
import { DeviceReasonError, selectAndroidDeviceName, StaleSnapshotError } from '../index.js';
import { DeviceLease, DeviceLeaseBusyError, type LeaseHolder } from '../lease.js';
import { adbRunner, inLedger, type AdbResult, type AdbRunner } from './adb.js';
import { deviceAgentClient, type AgentKey, type DeviceAgentClient } from './agent-client.js';
import { mapAndroidTree, type AndroidTree } from './mapping.js';
import { settle, type Clock, type UiTree } from './settle.js';
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
/** How long one capture lets the app go idle before reading the tree (release spec phase 4 item 4). */
const DUMP_IDLE_MS = 2_000;
/** The iOS screenshot size (open point 9). */
const SCREENSHOT_MAX_SIZE = 800;
/** Replace text's pause between `ctrl+a` and backspace (open point 23). */
const CLEAR_PAUSE_MS = 200;
/** How long a late `close` may take once the abandoned work has settled: the run's own cleanup limit. */
const LATE_CLOSE_MS = 45_000;
/** How long a swipe's finger takes (release spec phase 4 item 6). */
const SWIPE_MS = 1_000;
/** `ctrl+a` and backspace as mobilecli 1.0.14 sends them (open point 23): always two separate calls. */
const SELECT_ALL: AgentKey[] = [{ keycode: 'KEYCODE_A', modifiers: ['KEYCODE_CTRL_LEFT'] }];
const BACKSPACE: AgentKey[] = [{ keycode: 'KEYCODE_DEL' }];
/** What `device.io.text` types: ASCII only. Anything else goes through the clipboard. */
const ASCII = /^[\x00-\x7f]*$/;

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
  /** Where `observe` saves `screen-N.jpg`. Without one, the driver makes its own temporary folder and removes it on `close`. */
  screenshotFolder?: string | undefined;
  leaseRoot?: string;
}

/** The element action each kind of action needs, as on iOS. */
const REQUIRED_ACTION = { tap: 'tap', type: 'typeText', swipe: 'swipeWithin' } as const;

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

/** An element's centre, in whole numbers. */
function centreOf(frame: NonNullable<Element['frame']>): { x: number; y: number } {
  return { x: Math.round(frame.x + frame.width / 2), y: Math.round(frame.y + frame.height / 2) };
}

/**
 * A swipe within the element along its centre line, from 90% to 10% of its length in the swipe's direction,
 * in whole numbers. The direction is the finger's: "up" moves the finger up, as on iOS.
 */
function swipeWithin(frame: NonNullable<Element['frame']>, direction: Direction): { x1: number; y1: number; x2: number; y2: number } {
  const { x, y } = centreOf(frame);
  const along = (start: number, length: number, from: number, to: number): [number, number] =>
    [Math.round(start + length * from), Math.round(start + length * to)];
  if (direction === 'up' || direction === 'down') {
    const [y1, y2] = direction === 'up' ? along(frame.y, frame.height, 0.9, 0.1) : along(frame.y, frame.height, 0.1, 0.9);
    return { x1: x, y1, x2: x, y2 };
  }
  const [x1, x2] = direction === 'left' ? along(frame.x, frame.width, 0.9, 0.1) : along(frame.x, frame.width, 0.1, 0.9);
  return { x1, y1: y, x2, y2: y };
}

/**
 * The typed field in the settled capture after typing: the one text field with its identifier, else the one
 * focused text field, else the one text field at its frame. Undefined when none is sure: the step then
 * records no shown value rather than another field's.
 */
function typedFieldIn(snapshot: Snapshot, field: Element): Element | undefined {
  const only = (matches: Element[]) => matches.length === 1 ? matches[0] : undefined;
  const fields = snapshot.elements.filter(element => element.role === 'text-field');
  const byIdentifier = field.identifier ? only(fields.filter(element => element.identifier === field.identifier)) : undefined;
  const sameFrame = (frame: Element['frame']) => frame !== undefined && field.frame !== undefined && frame.x === field.frame.x &&
    frame.y === field.frame.y && frame.width === field.frame.width && frame.height === field.frame.height;
  return byIdentifier ?? only(fields.filter(element => element.state?.focused)) ?? only(fields.filter(element => sameFrame(element.frame)));
}

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
 * its launch options, and starts and checks the bridge's own agent. `close` undoes only what this run did,
 * and keeps the lease until it can show nothing the run started can still act on the device.
 */
export class AndroidDriver implements DeviceDriver {
  private readonly lease: DeviceLease;
  private readonly clock: Clock;
  private runner: AdbRunner | undefined;
  private prepared: DevicePreparation | undefined;
  private serial: string | undefined;
  /** The package this run restarted, so `close` stops the app only then. */
  private restartedPackage: string | undefined;
  /** Whether this run issued the agent's start command, so `close` looks for an agent it may have started. */
  private agentStartIssued = false;
  /** Set once `close` begins: from then on no step issues new device work, except `close`'s own. */
  private closeBegun = false;
  /** The `close` in progress, which a second `close` joins. */
  private closing: Promise<void> | undefined;
  /** The only signal that may still issue device work once `close` began: the running `close`'s own. */
  private cleanupSignal: AbortSignal | undefined;
  private forwardPort: number | undefined;
  private agentPids: number[] = [];
  private agent: DeviceAgentClient | undefined;
  /** The only snapshot an action may target: the latest settled one, cleared once an action is issued. */
  private latest: Snapshot | undefined;
  private sequence = 0;
  private screenshotFolder: Promise<string> | undefined;

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

  observe(signal: AbortSignal): Promise<Snapshot> {
    return this.lease.track(() => this.settledSnapshot(signal));
  }

  act(action: Action, snapshot: Snapshot, scenario: ActionScenarioContext, signal: AbortSignal): Promise<Snapshot | ActOutcome> {
    return this.lease.track(() => this.actIssued(action, snapshot, scenario, signal));
  }

  close(signal: AbortSignal): Promise<void> {
    // The stop flag is set first, so an abandoned operation issues nothing more.
    this.closeBegun = true;
    if (this.closing) return this.closing;
    this.closing = this.finishClose(signal).catch((error: unknown) => {
      // Keep the lease; once the abandoned work settles, finish cleanup and release it late.
      if (error instanceof DeviceReasonError && error.code === 'UI_ACTION_UNCONFIRMED') {
        this.lease.releaseLate(() => this.close(AbortSignal.timeout(LATE_CLOSE_MS)));
      }
      throw error;
    }).finally(() => { this.closing = undefined; });
    return this.closing;
  }

  /**
   * `close`'s steps, in the release spec's order (phase 4 item 8), each tolerating "not running": wait for
   * every operation this run started, so each `adb` command it issued has exited; fence the bridge's own
   * agent; stop the app if this run restarted it; remove this run's forward; release the lease. What each
   * step confirms stopped is disowned as it goes. Any failure keeps the lease. The agent file stays: it's inert.
   */
  private async finishClose(signal: AbortSignal): Promise<void> {
    try { await this.lease.settle(signal); }
    catch { throw new DeviceReasonError('UI_ACTION_UNCONFIRMED', 'Cleanup ended before an issued adb command exited; device lease kept'); }
    // Not held: the run never took the lease, or a refusal before the restart already released it.
    if (!this.lease.held) return;
    if (!this.lease.settled('adb')) throw new DeviceReasonError('UI_ACTION_UNCONFIRMED', 'An adb command\'s outcome is unknown; device lease kept');
    const serial = this.serial!;
    this.cleanupSignal = signal;
    try {
      // An unconfirmed fence keeps the lease the same way an unknown adb command does.
      try { await this.fenceAgent(serial, signal); }
      catch { throw new DeviceReasonError('UI_ACTION_UNCONFIRMED', 'The bridge\'s device agent could not be confirmed stopped; device lease kept'); }
      if (this.restartedPackage !== undefined) {
        await this.succeeded('stop the app', this.shell(serial, ['am', 'force-stop', this.restartedPackage], signal));
        this.restartedPackage = undefined;
      }
      // Phase 5: stop this run's logcat streams here, and wait for them to exit.
      const port = this.forwardPort;
      if (port !== undefined) {
        await this.removeForward(serial, `tcp:${String(port)}`, signal);
        await this.lease.disown(ownedForward(serial, port));
        this.forwardPort = undefined;
      }
      await this.lease.release();
    } finally {
      this.cleanupSignal = undefined;
    }
    this.agent = undefined;
    this.latest = undefined;
    // Its screenshots were copied into the run's evidence as each step was recorded.
    if (this.options.screenshotFolder === undefined && this.screenshotFolder) {
      await rm(await this.screenshotFolder, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /**
   * The fence (open point 22): kill this run's agent by its pid, after checking it's still the bridge's own,
   * then confirm it's gone. Never `pkill` by class name. Once the start command was issued, every agent of
   * the bridge's on the device is this run's, even one whose pid was never recorded: `prepare` swept all the
   * others while holding the lease. A confirmed fence ends every agent request, including an unknown one.
   */
  private async fenceAgent(serial: string, signal: AbortSignal): Promise<void> {
    if (this.agentStartIssued) {
      const agents = await this.agentsOn(serial, signal);
      for (const pid of this.agentPids) {
        if (agents.some(agent => agent.pid === pid && !agent.own)) {
          throw new AndroidDeviceError('adb', `The bridge's agent ${String(pid)} can no longer be shown to be its own`);
        }
      }
      for (const agent of agents.filter(found => found.own)) await this.killAgent(serial, agent.pid, signal);
    }
    this.lease.fence('agent');
    for (const pid of this.agentPids) await this.lease.disown(ownedAgent(serial, pid));
    this.agentPids = [];
  }

  /**
   * The settle rule over `device.dump.ui`, mapped to the bridge's elements with a fresh sequence, then one
   * screenshot of it saved as `screen-N.jpg` (open point 9). It becomes the snapshot actions may target.
   */
  private async settledSnapshot(signal: AbortSignal): Promise<Snapshot> {
    const serial = this.serial;
    if (!this.agent || !serial) throw new Error('Driver is not prepared');
    // The agent's tree has the captures' shape (the tracer confirmed it), so the mapping reads it as is.
    const captured = await settle(async captureSignal =>
      ({ hierarchy: await this.agentCall(agent => agent.dumpUi(DUMP_IDLE_MS, captureSignal), captureSignal) as UiTree['hierarchy'] }), this.clock, signal);
    const sequence = ++this.sequence;
    const capturedAt = Date.now();
    const jpeg = await this.agentCall(agent => agent.screenshot(SCREENSHOT_MAX_SIZE, signal), signal);
    const screenshotPath = join(await this.screenshotFolderPath(), `screen-${String(sequence)}.jpg`);
    await writeFile(screenshotPath, jpeg, { mode: 0o600 });
    this.latest = {
      deviceId: serial,
      capturedAt,
      // An Android reference never expires by time: only a newer snapshot, or an action, makes it stale.
      expiresAt: Number.MAX_SAFE_INTEGER,
      sequence,
      elements: mapAndroidTree(captured.tree as AndroidTree),
      truncated: false,
      screenHash: captured.screenHash,
      screenshotPath,
      ...(captured.settled ? {} : { settled: false }),
    };
    return this.latest;
  }

  private screenshotFolderPath(): Promise<string> {
    this.screenshotFolder ??= this.options.screenshotFolder !== undefined
      ? Promise.resolve(this.options.screenshotFolder) : mkdtemp(join(tmpdir(), 'jev-android-screens-'));
    return this.screenshotFolder;
  }

  /**
   * One action on an element of the latest settled snapshot (the session invariant), then the settle rule.
   * Replace text also reports the field's shown value; a mismatch with the typed value never fails the step.
   */
  private async actIssued(action: Action, snapshot: Snapshot, scenario: ActionScenarioContext, signal: AbortSignal): Promise<Snapshot | ActOutcome> {
    if (!this.agent || !this.serial) throw new Error('Driver is not prepared');
    if (snapshot.deviceId !== this.serial) throw new Error('Snapshot belongs to a different device');
    if (!this.latest || snapshot.sequence !== this.latest.sequence) throw new StaleSnapshotError('Target reference is from an older snapshot');
    const target = this.latest.elements.find(element => element.ref === action.targetRef);
    if (!target?.frame) throw new StaleSnapshotError('Target reference is absent from observation');
    if (!target.actions.includes(REQUIRED_ACTION[action.kind])) throw new DeviceReasonError('UNSUPPORTED_ACTION', `Target does not support ${action.kind}`);
    if (action.kind === 'type' && !Object.hasOwn(scenario.values, action.valueKey)) throw new DeviceReasonError('MISSING_VALUE', `Scenario value ${action.valueKey} is absent`);
    // From here the screen may change: no later action may target this snapshot, whatever happens next.
    this.latest = undefined;
    const frame = target.frame;
    if (action.kind === 'tap') await this.agentCall(agent => agent.tap(centreOf(frame), signal), signal);
    else if (action.kind === 'swipe') await this.agentCall(agent => agent.swipe({ ...swipeWithin(frame, action.direction), duration: SWIPE_MS }, signal), signal);
    else await this.replaceText(frame, scenario.values[action.valueKey]!, signal);
    const screen = await this.settledSnapshot(signal);
    if (action.kind !== 'type') return screen;
    const shown = typedFieldIn(screen, target);
    return shown ? { screen, shownValue: shown.value ?? '' } : screen;
  }

  /**
   * Replace text (item 6): focus the field by tapping its centre (open point 10), clear it with `ctrl+a`,
   * a 0.2 s pause and a separate backspace (open point 23), then type. ASCII goes through `device.io.text`,
   * anything else through the clipboard and paste. Each call checks the stop flag first.
   */
  private async replaceText(frame: NonNullable<Element['frame']>, text: string, signal: AbortSignal): Promise<void> {
    await this.agentCall(agent => agent.tap(centreOf(frame), signal), signal);
    await this.agentCall(agent => agent.keys(SELECT_ALL, signal), signal);
    await this.clock.sleep(CLEAR_PAUSE_MS);
    await this.agentCall(agent => agent.keys(BACKSPACE, signal), signal);
    // An empty value is the cleared field: nothing to type.
    if (text === '') return;
    if (ASCII.test(text)) {
      await this.agentCall(agent => agent.text(text, signal), signal);
      return;
    }
    await this.agentCall(agent => agent.clipboardSet(text, signal), signal);
    await this.agentCall(agent => agent.button('KEYCODE_PASTE', signal), signal);
    await this.agentCall(agent => agent.clipboardClear(signal), signal);
  }

  /** One device agent request, in the lease's ledger. No new request once `close` began or the run was cancelled. */
  private async agentCall<T>(request: (agent: DeviceAgentClient) => Promise<T>, signal: AbortSignal): Promise<T> {
    this.mayIssue(signal);
    const agent = this.agent!;
    return inLedger(this.lease, 'agent', () => request(agent));
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
      if (this.restartedPackage === undefined && this.lease.releasable) await this.lease.release();
      throw error;
    }
  }

  /** Before any new device work: none once `close` began, except `close`'s own, or once the run was cancelled. */
  private mayIssue(signal: AbortSignal): void {
    if (this.closeBegun && signal !== this.cleanupSignal) throw new Error('The driver is closing; no new device work');
    if (signal.aborted) throw signal.reason;
  }

  /** One finite `adb` command, in the lease's ledger. No new command once `close` began or the run was cancelled. */
  private async adb(args: string[], signal: AbortSignal): Promise<AdbResult> {
    this.mayIssue(signal);
    const runner = this.runner!;
    return inLedger(this.lease, 'adb', () => runner(args, signal));
  }

  private shell(serial: string, words: string[], signal: AbortSignal): Promise<AdbResult> {
    return this.adb(['-s', serial, 'shell', words.map(quoted).join(' ')], signal);
  }

  /** A command that must succeed; any other exit is `DEVICE_ERROR` with `vendorCode` `adb`. */
  private async succeeded(what: string, pending: Promise<AdbResult>): Promise<string> {
    const result = await pending;
    if (result.exitCode !== 0) throw new AndroidDeviceError('adb', `adb could not ${what} (exit ${String(result.exitCode)})`);
    return result.stdout;
  }

  private async getprop(serial: string, name: string, signal: AbortSignal): Promise<string> {
    return (await this.succeeded(`read ${name}`, this.shell(serial, ['getprop', name], signal))).trim();
  }

  /**
   * The device name to a serial and a device identity (item 2). A name `adb devices` lists is a serial;
   * anything else is an AVD name, matched against the running emulators' `ro.boot.qemu.avd_name`. An
   * emulator's identity is its AVD name, a phone's its serial. Only reads: the lease isn't held yet.
   */
  private async resolveDevice(name: string, signal: AbortSignal): Promise<{ serial: string; identity: string }> {
    const listed = listedDevices(await this.succeeded('list devices', this.adb(['devices', '-l'], signal)));
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
    const listing = await this.succeeded('list processes', this.shell(serial, ['ps', '-A', '-o', 'PID,NAME,ARGS'], signal));
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
    const listing = await this.succeeded('list forwards', this.adb(['forward', '--list'], signal));
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
   * killed by pid. With no agent left, this serial's agent forwards go too; a listed forward now pointing
   * elsewhere isn't the dead holder's any more. True when a dead holder's listed agent or forward was swept.
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
      if (remote !== AGENT_SOCKET) continue;
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
      await this.succeeded('wake the screen', this.shell(serial, ['input', 'keyevent', 'KEYCODE_WAKEUP'], signal));
      screen = await this.screenState(serial, signal);
    }
    if (screen.keyguard) {
      throw new DeviceReasonError('DEVICE_LOCKED', `Device ${serial}'s screen is locked. Set Screen lock to None on a test device`);
    }
  }

  /** Whether the screen is awake and the keyguard showing, from `dumpsys window policy`'s `KeyguardServiceDelegate`. */
  private async screenState(serial: string, signal: AbortSignal): Promise<{ awake: boolean; keyguard: boolean }> {
    const policy = await this.succeeded('read the screen state', this.shell(serial, ['dumpsys', 'window', 'policy'], signal));
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
    this.restartedPackage = app.package;
    await this.succeeded('stop the app', this.shell(serial, ['am', 'force-stop', app.package], signal));
    const component = app.activity ? `${app.package}/${app.activity}` : await this.launcherActivity(serial, app.package, signal);
    const extras = Object.entries(app.intentExtras ?? {}).flatMap(([key, value]) => ['--es', key, value]);
    const launched = await this.shell(serial, ['am', 'start', '-W', '-n', component, ...extras], signal);
    if (launched.exitCode !== 0 || !/^Status: ok\s*$/m.test(launched.stdout)) {
      throw new AndroidDeviceError('adb', `am start could not launch ${component}`);
    }
  }

  private async launcherActivity(serial: string, appPackage: string, signal: AbortSignal): Promise<string> {
    const resolved = await this.succeeded('look up the launcher activity', this.shell(serial,
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
    await this.succeeded('push the device agent', this.adb(['-s', serial, 'push', tools.agent.path, AGENT_DEVICE_PATH], signal));
    this.agentStartIssued = true;
    await this.succeeded('start the device agent', this.adb(['-s', serial, 'shell', AGENT_START_COMMAND], signal));
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
      this.mayIssue(signal);
      // Each request ends with the 5 s, not its own 10 s limit; one ended unanswered stays unknown until the fence.
      const deadline = new AbortController();
      const timer = setTimeout(() => { deadline.abort(new Error('The device agent start deadline passed')); },
        Math.max(1, AGENT_READY_MS - (this.clock.now() - startedAt)));
      try {
        if ((await inLedger(this.lease, 'agent', () => agent.version(AbortSignal.any([signal, deadline.signal])))).dexSha256 === sha256) return true;
      } catch (error) {
        // Not answering yet is expected while it starts; a cancel is not.
        if (signal.aborted) throw error;
      } finally {
        clearTimeout(timer);
      }
      if (this.clock.now() - startedAt >= AGENT_READY_MS) return false;
      await this.clock.sleep(AGENT_POLL_MS);
    }
  }
}
