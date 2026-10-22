import { Admission, AdmissionError, type ComponentInput } from '../admission.js';
import type { ProfileBinding } from '../../profiles.js';
import { OperationTracker } from '../operation-tracker.js';
import { AndroidOwnership } from './ownership.js';
import { androidStartTime, processGone, recoverAndroid } from './recovery.js';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { Action, ActionScenarioContext, ActOutcome, ActPath, AndroidAppIdentity, AppProblem, ElementAction, LogSources, DevicePreparation, DeviceDriver,
  Direction, Element, PrepareScenarioContext, Snapshot } from '../../contracts/index.js';
import { isIosApp } from '../../contracts/index.js';
import { DeviceReasonError, largestScrollable, screenMiddleSwipe, screenPointOf, scrollFinger, selectAndroidDeviceName, StaleSnapshotError,
  type Size } from '../index.js';
import { CompatibilityMarker, DeviceLeaseBusyError } from '../lease.js';
import { readLogTail } from '../logs.js';
import { IdentityResolutionError, resolveIdentity, revalidateIdentity, type IdentityProbe, type ResolvedIdentity } from '../identity.js';
import { identityProbe, type AndroidTransport, type ProbeInvocation } from './probe.js';
import { resumedPackage } from '../attach.js';
import { jpegSize } from '../image.js';

export { jpegSize };
import { adbRunner, type AdbResult, type AdbRunner } from './adb.js';
import { deviceAgentClient, type AgentKey, type DeviceAgentClient } from './agent-client.js';
import { EVENT_FILTER, type AppExitWatch, type createExitWatch } from './exit-watch.js';
import { deleteOldLogs, LOG_FOLDER, logcatStarter, privateLogFolder, type LogcatOutput, type LogcatStarter, type LogcatStream } from './logcat.js';
import { mapAndroidTree } from './mapping.js';
import { settle, type Clock, type SettledCapture } from './settle.js';
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
/** After a failed step, how long the run waits for the app's events, and how often it looks. A crash's events
 *  arrive within about 0.4 s (findings/06-log-pane.md); a freeze is reported only after about 5 s, so a step
 *  usually fails before it, and the run keeps the step's own reason. */
export const APP_PROBLEM_WAIT_MS = 1_000;
export const APP_PROBLEM_POLL_MS = 50;
/** How long a late `close` may take once the abandoned work has settled: the run's own cleanup limit. */
const LATE_CLOSE_MS = 45_000;
/** How long a swipe's finger takes (release spec phase 4 item 6). */
const SWIPE_MS = 1_000;
/** `ctrl+a` and backspace as mobilecli 1.0.14 sends them (open point 23): always two separate calls. */
const SELECT_ALL: AgentKey[] = [{ keycode: 'KEYCODE_A', modifiers: ['KEYCODE_CTRL_LEFT'] }];
const BACKSPACE: AgentKey[] = [{ keycode: 'KEYCODE_DEL' }];
/** The system Back key, through the same `device.io.keys` call as `ctrl+a` and backspace. */
const BACK: AgentKey[] = [{ keycode: 'KEYCODE_BACK' }];
/** What `device.io.text` types: ASCII only. Anything else goes through the clipboard. */
const ASCII = /^[\x00-\x7f]*$/;

/**
 * A device layer failure the bridge has no reason code for: `DEVICE_ERROR`, naming the layer that failed
 * as its `vendorCode`. Its message never quotes the device's output, which can carry screen text.
 */
export class AndroidDeviceError extends DeviceReasonError {
  declare readonly vendorCode: 'adb' | 'agent';

  constructor(vendorCode: 'adb' | 'agent', message: string) {
    super('DEVICE_ERROR', message, { vendorCode });
    this.name = 'AndroidDeviceError';
  }
}

/** A transport the run can use now: an unauthorized one is `DEVICE_UNAUTHORIZED`, any other unready one `DEVICE_NOT_CONNECTED`. */
function requireReady({ serial, state }: AndroidTransport): void {
  if (state === 'unauthorized') throw new DeviceReasonError('DEVICE_UNAUTHORIZED', `Device ${serial} hasn't accepted this Mac's USB-debugging key`);
  if (state !== 'device') throw new DeviceReasonError('DEVICE_NOT_CONNECTED', `Device ${serial} is ${state}`);
}

export interface AndroidDriverOptions {
  admission?: Admission;
  fakeBackend?: boolean;
  profile?: ProfileBinding | undefined;
  /** The script's `device`. The driver factory builds one driver per script, so the driver is given it here. */
  device?: { serial?: string; avd?: string } | undefined;
  /** JEV_ANDROID_DEVICE. */
  defaultDevice?: string | undefined;
  /** The selected profile's device category: the name must resolve to a device of it. */
  category?: 'android-emulator' | 'android-phone' | undefined;
  /** The tools check. Defaults to `androidTools()`. */
  tools?: () => Promise<AndroidTools>;
  /** Defaults to the production runner for the `adb` the tools check found. */
  runner?: AdbRunner & { identityProbe?: IdentityProbe };
  identityProbe?: IdentityProbe;
  /** The device agent's client for a forwarded port. Defaults to `deviceAgentClient()`. */
  agentClient?: ((port: number) => DeviceAgentClient) & { identityProbe?: IdentityProbe };
  clock?: Clock;
  /** A free local port, found by binding `127.0.0.1:0`. Injectable for tests. */
  freePort?: () => Promise<number>;
  /** Where `observe` saves `screen-N.jpg`. Without one, the driver makes its own temporary folder and removes it on `close`. */
  screenshotFolder?: string | undefined;
  leaseRoot?: string;
  /** Starts the `logcat` streams. Defaults to the production starter for the `adb` the tools check found. */
  logcat?: LogcatStarter;
  /** The private folder for the app's log files. Defaults to `LOG_FOLDER`. False starts no stream, as a refused folder does. */
  logFolder?: string | false;
  /** Names the app's log file, `<run ID>.log`. Without one, the driver makes up its own. */
  runId?: string | undefined;
  /** Folds the events stream into the app's state. Without one, `appRunning()` and `appProblem()` can't tell. The
   *  driver factory passes `createExitWatch`. */
  createExitWatch?: typeof createExitWatch | undefined;
}

/** The element action each kind of action needs, as on iOS. */
const REQUIRED_ACTION = { tap: 'tap', type: 'typeText', swipe: 'swipeWithin' } as const;

/** The real clock. Elapsed times from `performance.now()` are fractional, and `AbortSignal.timeout` takes only a
 *  whole number of ms, so a timeout is rounded up to at least 1 ms. */
export const productionClock: Clock = {
  now: () => performance.now(), sleep: ms => delay(ms), timeout: ms => AbortSignal.timeout(Math.max(1, Math.ceil(ms))),
};

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

type AgentProcess = { pid: number; own: boolean };
type StreamEntry = { stream: LogcatStream; componentId: string; stopping: boolean };

/** A foreign agent holds the device: `DEVICE_BUSY`, and the bridge leaves it running. */
const foreignAgentFound = (identity: string) => new DeviceReasonError('DEVICE_BUSY',
  `Device ${identity} is in use by another tool's UI-automation agent. Stop that tool, then run again.`);

/** The screen's size, from the extent of the dump's top-level nodes (each window's root); undefined when none has a size. */
function screenOf(tree: { hierarchy: { rect?: { x: number; y: number; width: number; height: number } }[] }): Size | undefined {
  let width = 0;
  let height = 0;
  for (const { rect } of tree.hierarchy) {
    if (!rect || rect.width <= 0 || rect.height <= 0) continue;
    width = Math.max(width, rect.x + rect.width);
    height = Math.max(height, rect.y + rect.height);
  }
  return width > 0 && height > 0 ? { width, height } : undefined;
}

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

/** A settled capture as the bridge's snapshot, its elements mapped, with `extras` (a screenshot, log tails) before `settled`. */
function snapshotOf(serial: string, captured: SettledCapture, sequence: number, capturedAt: number,
  extras: Pick<Snapshot, 'screenshotPath' | 'logTails'> = {}): Snapshot {
  return {
    deviceId: serial,
    capturedAt,
    // An Android reference never expires by time: only a newer snapshot, or an action, makes it stale.
    expiresAt: Number.MAX_SAFE_INTEGER,
    sequence,
    elements: mapAndroidTree(captured.tree),
    truncated: false,
    screenHash: captured.screenHash,
    ...extras,
    ...(captured.settled ? {} : { settled: false }),
  };
}

/**
 * The Android device driver (release spec phase 4): drives mobilecli's device agent directly, over `adb`
 * and JSON-RPC, and never runs mobilecli (ADR-0006). `prepare` takes the device lease on the device
 * identity before touching the device, refuses when another tool's agent is running, restarts the app with
 * its launch options (attaching, checks it is in front instead), and starts and checks the bridge's own agent. `capture` does the same without the
 * restart, for the `capture` command. `close` undoes only what this run did, and keeps the lease until it
 * can show nothing the run started can still act on the device.
 */
export class AndroidDriver implements DeviceDriver {
  private readonly lease: CompatibilityMarker;
  private readonly operations = new OperationTracker();
  private ownership: AndroidOwnership | undefined;
  private admissionSignal: AbortSignal | undefined;
  private agentComponent: string | undefined;
  private readonly forwardComponents = new Map<number,string>();
  private readonly clock: Clock;
  private runner: AdbRunner | undefined;
  private prepared: DevicePreparation | undefined;
  private serial: string | undefined;
  private resolvedIdentity: ResolvedIdentity | undefined;
  private probe: IdentityProbe | undefined;

  identity(): ResolvedIdentity | undefined { return this.resolvedIdentity; }
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
  /** The latest snapshot's screen size and screenshot size, for `scroll` and `tapAt`; undefined when unknown. */
  private latestScreen: Size | undefined;
  private latestShot: Size | undefined;
  /** How the last `act` carried out a `back` or `scroll`. */
  private lastActPath: ActPath | undefined;
  private sequence = 0;
  private screenshotFolder: Promise<string> | undefined;
  private readonly runId: string;
  private logcat: LogcatStarter | undefined;
  /** This run's logcat streams, each disowned once `close` confirms it stopped. */
  private streams: StreamEntry[] = [];
  /** The app's log file, once its stream started. */
  private logFile: string | undefined;
  private watch: AppExitWatch | undefined;

  constructor(private readonly options: AndroidDriverOptions = {}) {
    this.lease = new CompatibilityMarker(options.leaseRoot ? { root: options.leaseRoot } : {});
    this.clock = options.clock ?? productionClock;
    this.runId = options.runId ?? randomUUID();
  }

  preparation(): DevicePreparation {
    if (!this.prepared) throw new Error('Driver is not prepared');
    return this.prepared;
  }

  prepare(scenario: PrepareScenarioContext, signal: AbortSignal): Promise<void> {
    return this.operations.track(() => this.prepareIssued(scenario, signal));
  }

  observe(signal: AbortSignal): Promise<Snapshot> {
    return this.operations.track(() => this.settledSnapshot(signal));
  }

  /**
   * The `capture` command's path (release spec phase 6 item 1): `prepare`'s parts without the restart and
   * without the logcat streams, then one settled snapshot, with no screenshot. The app is left as it was;
   * `close` is still the only cleanup.
   */
  capture(signal: AbortSignal): Promise<Snapshot> {
    return this.operations.track(() => this.captureIssued(signal));
  }

  act(action: Action, snapshot: Snapshot, scenario: ActionScenarioContext, signal: AbortSignal): Promise<Snapshot | ActOutcome> {
    return this.operations.track(() => this.actIssued(action, snapshot, scenario, signal));
  }

  actPath(): ActPath | undefined {
    return this.lastActPath;
  }

  /** Whether the launched app still runs, from the events stream; undefined when the driver can't tell. */
  appRunning(): boolean | undefined {
    return this.watch?.running();
  }

  /** Why the launched app stopped, from the events stream: exited or not responding; undefined when it runs,
   *  the bridge stopped it, or the driver can't tell. */
  appProblem(): AppProblem | undefined {
    return this.watch?.problem();
  }

  /** `appProblem`, waiting up to `APP_PROBLEM_WAIT_MS` for the events stream to report one; at once when the
   *  driver can't tell. */
  async appProblemAfterFailure(signal: AbortSignal): Promise<AppProblem | undefined> {
    const until = this.clock.now() + APP_PROBLEM_WAIT_MS;
    for (;;) {
      const found = this.watch?.problem();
      if (found || this.watch?.running() === undefined || signal.aborted || this.clock.now() >= until) return found;
      await this.clock.sleep(APP_PROBLEM_POLL_MS);
    }
  }

  /** The app's log file, once its stream started: the pane, each step's log tails and `logs` read it. */
  logSources(): LogSources {
    return this.logFile !== undefined ? { logcat: this.logFile } : {};
  }

  close(signal: AbortSignal): Promise<void> {
    // The stop flag is set first, so an abandoned operation issues nothing more.
    this.closeBegun = true;
    if (this.closing) return this.closing;
    this.closing = this.finishClose(signal).catch((error: unknown) => {
      // Keep the lease; once the abandoned work settles, finish cleanup and release it late.
      if (error instanceof DeviceReasonError && error.code === 'UI_ACTION_UNCONFIRMED') {
        this.operations.releaseLate(() => this.close(AbortSignal.timeout(LATE_CLOSE_MS)));
      }
      this.ownership?.retain();
      throw error;
    }).finally(() => { this.closing = undefined; });
    return this.closing;
  }

  /**
   * `close`'s steps, in the release spec's order (phase 4 item 8), each tolerating "not running": wait for
   * every operation this run started, so each `adb` command it issued has exited; fence the bridge's own
   * agent; stop the app if this run restarted it; stop this run's logcat streams; remove this run's forward;
   * release the lease. What each step confirms stopped is disowned as it goes. Any failure keeps the lease.
   * The agent file stays: it's inert.
   */
  private async finishClose(signal: AbortSignal): Promise<void> {
    try { await this.operations.settle(signal); }
    catch { throw new DeviceReasonError('UI_ACTION_UNCONFIRMED', 'Cleanup ended before an issued adb command exited; device lease kept'); }
    // Not held: the run never took the lease, or a refusal before the restart already released it.
    if (!this.lease.held) return;
    this.ownership!.beginCleanup(this.admissionSignal?.aborted === true);
    const serial = this.serial!;
    this.cleanupSignal = signal;
    try {
      try {
        // An unconfirmed fence keeps the lease the same way an unknown adb command does.
        try { await this.fenceAgent(serial, signal); }
        catch { throw new DeviceReasonError('UI_ACTION_UNCONFIRMED', 'The bridge\'s device agent could not be confirmed stopped; device lease kept'); }
        if (this.restartedPackage !== undefined) {
          this.watch?.expectStop();
          await this.succeeded('stop the app', this.shell(serial, ['am', 'force-stop', this.restartedPackage], signal));
          this.restartedPackage = undefined;
        }
      } catch (error) {
        // The lease is kept, but the streams are Mac processes that can't act on the device: stop them anyway.
        await this.stopStreams().catch(() => undefined);
        throw error;
      }
      // Whether or not the app was launched: the streams start before the launch.
      await this.stopStreams();
      const port = this.forwardPort;
      if (port !== undefined) {
        await this.removeForward(serial, `tcp:${String(port)}`, signal);
        const listed = await this.ownership!.adb(['forward', '--list'], this.runner!, signal);
        this.ownership!.prove(this.forwardComponents.get(port)!, { kind: 'android-component-stopped', commandId: listed.commandId });
        this.forwardPort = undefined;
      }
      try { this.ownership!.finish(); }
      catch (error) {
        if (!(error instanceof AdmissionError)) throw error;
        throw new DeviceReasonError('UI_ACTION_UNCONFIRMED', `Device release is unconfirmed: ${error.code}`);
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

  private async fenceAgent(serial: string, signal: AbortSignal): Promise<void> {
    if (!this.agentComponent) return;
    const start = this.ownership!.start(this.agentComponent);
    if (!start || start.kind !== 'agent-start') throw new Error('Agent identity was not recorded');
    const args = ['-s', serial, 'shell', ['cat', `/proc/${start.pid}/stat`].map(quoted).join(' ')];
    let observed = await this.ownership!.adb(args, this.runner!, signal);
    if (!processGone(observed.result)) {
      if (observed.result.exitCode !== 0 || androidStartTime(observed.result.stdout) !== start.startTime) throw new Error('Agent process incarnation changed');
      const environ = await this.environOf(serial, start.pid, signal);
      if (!Array.isArray(environ) || !environ.includes(OWN_AGENT_CLASSPATH)) throw new Error('Agent environment changed');
      await this.killAgent(serial, start.pid, signal);
      observed = await this.ownership!.adb(args, this.runner!, signal);
    }
    if (!processGone(observed.result)) throw new Error('Agent exit is not proven');
    this.ownership!.prove(this.agentComponent, { kind: 'android-component-stopped', commandId: observed.commandId });
    this.agentPids = [];
  }

  /**
   * Stop this run's logcat streams (SIGTERM, then SIGKILL after 1 s) and wait for them to exit, tolerating
   * one that already ended, then disown each. Never a tracked ledger command: stopping a local process is
   * never an unknown device outcome. Every stream is tried; any stop that can't be confirmed keeps the lease.
   */
  private async stopStreams(): Promise<void> {
    const unconfirmed: number[] = [];
    let recordError: unknown;
    for (const entry of [...this.streams]) {
      if (!await this.stopStream(entry)) { unconfirmed.push(entry.stream.pid); continue; }
      try { if (!entry.stream.process) throw new Error('Stream incarnation was not recorded');
        this.ownership!.prove(entry.componentId, { kind: 'android-stream-exited', process: entry.stream.process }); }
      catch (error) { recordError ??= error; }
    }
    if (recordError !== undefined) throw recordError;
    if (unconfirmed.length > 0) {
      throw new AndroidDeviceError('adb', `The logcat stream${unconfirmed.length > 1 ? 's' : ''} ${unconfirmed.join(', ')} could not be confirmed stopped; device lease kept`);
    }
  }

  /** Stop one stream and wait for it to exit; true once confirmed, when it's no longer this run's to stop. */
  private async stopStream(entry: StreamEntry): Promise<boolean> {
    entry.stopping = true;
    try { await entry.stream.stop(); }
    catch { return false; }
    this.streams = this.streams.filter(other => other !== entry);
    return true;
  }

  /**
   * The settle rule over `device.dump.ui`, mapped to the bridge's elements with a fresh sequence, then one
   * screenshot of it saved as `screen-N.jpg` (open point 9). It becomes the snapshot actions may target.
   */
  private async settledSnapshot(signal: AbortSignal): Promise<Snapshot> {
    const serial = this.serial;
    if (!this.agent || !serial) throw new Error('Driver is not prepared');
    const captured = await this.settledCapture(signal);
    const sequence = ++this.sequence;
    const capturedAt = Date.now();
    const jpeg = await this.agentRead(agent => agent.screenshot(SCREENSHOT_MAX_SIZE, signal), signal);
    const screenshotPath = join(await this.screenshotFolderPath(), `screen-${String(sequence)}.jpg`);
    await writeFile(screenshotPath, jpeg, { mode: 0o600 });
    this.latestScreen = screenOf(captured.tree);
    this.latestShot = jpegSize(jpeg);
    this.latest = snapshotOf(serial, captured, sequence, capturedAt, {
      screenshotPath,
      ...(this.logFile !== undefined ? { logTails: { logcat: await readLogTail(this.logFile) } } : {}),
    });
    return this.latest;
  }

  /** The settle rule over `device.dump.ui`. The agent's tree has the captures' shape (the tracer confirmed it), so the mapping reads it as is. */
  private settledCapture(signal: AbortSignal): Promise<SettledCapture> {
    return settle(async captureSignal =>
      ({ hierarchy: await this.agentRead(agent => agent.dumpUi(DUMP_IDLE_MS, captureSignal), captureSignal) }), this.clock, signal);
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
    this.lastActPath = undefined;
    if (action.kind === 'back' || action.kind === 'scroll' || action.kind === 'tapAt') return this.actOnScreen(action, this.latest, signal);
    return this.actOnElement(action, this.latest, scenario, signal);
  }

  private async actOnElement(action: ElementAction, latest: Snapshot, scenario: ActionScenarioContext, signal: AbortSignal): Promise<Snapshot | ActOutcome> {
    const target = latest.elements.find(element => element.ref === action.targetRef);
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
   * A driven-mode action on the latest settled snapshot as a whole, then the settle rule: `back` is the system Back
   * key; `scroll` swipes inside the largest scrollable element, else down the screen's middle; `tapAt` taps a point
   * on the snapshot's screenshot, scaled to the screen. A `tapAt` outside the screenshot, or one whose screenshot
   * or screen size is unknown, is `UNSUPPORTED_ACTION` before anything reaches the device.
   */
  private async actOnScreen(action: Exclude<Action, ElementAction>, latest: Snapshot, signal: AbortSignal): Promise<Snapshot> {
    const screen = this.latestScreen;
    let perform: () => Promise<void>;
    if (action.kind === 'back') {
      this.lastActPath = { path: 'back-key' };
      perform = () => this.agentCall(agent => agent.keys(BACK, signal), signal);
    } else if (action.kind === 'scroll') {
      const area = largestScrollable(latest.elements);
      if (!area && !screen) throw new DeviceReasonError('UNSUPPORTED_ACTION', 'Scroll found no scrollable element and no screen size');
      const swipe = area ? swipeWithin(area.frame, scrollFinger(action.direction)) : screenMiddleSwipe(screen!, action.direction);
      this.lastActPath = area ? { path: 'scroll-within', targetRef: area.ref } : { path: 'screen-middle' };
      perform = () => this.agentCall(agent => agent.swipe({ ...swipe, duration: SWIPE_MS }, signal), signal);
    } else {
      const shot = this.latestShot;
      if (!shot || !screen) throw new DeviceReasonError('UNSUPPORTED_ACTION', 'tapAt needs the observation\'s screenshot and screen size');
      const point = screenPointOf(action.x, action.y, shot, screen);
      if (!point) throw new DeviceReasonError('UNSUPPORTED_ACTION', `tapAt is outside the ${String(shot.width)} × ${String(shot.height)} screenshot`);
      perform = () => this.agentCall(agent => agent.tap(point, signal), signal);
    }
    // From here the screen may change: no later action may target this snapshot, whatever happens next.
    this.latest = undefined;
    await perform();
    return this.settledSnapshot(signal);
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

  /** One device agent request that acts, in the lease's ledger, after the transport is revalidated. No new request once `close` began or the run was cancelled. */
  private async agentCall<T>(request: (agent: DeviceAgentClient) => Promise<T>, signal: AbortSignal): Promise<T> {
    this.mayIssue(signal);
    await this.revalidate(signal);
    return this.agentRead(request, signal);
  }

  /**
   * One device agent request that only reads the screen, in the lease's ledger. It needs no revalidation: it reaches
   * this run's own agent, which a replacement device on the same serial would not run, and changes nothing.
   */
  private async agentRead<T>(request: (agent: DeviceAgentClient) => Promise<T>, signal: AbortSignal): Promise<T> {
    this.mayIssue(signal);
    const agent = this.agent!;
    return this.ownership!.dispatch(this.agentComponent!, 'agent', () => request(agent));
  }

  private async prepareIssued(scenario: PrepareScenarioContext, signal: AbortSignal): Promise<void> {
    if (this.lease.held) throw new Error('Driver is already prepared');
    if (isIosApp(scenario.app)) throw new Error('The Android driver only runs Android scripts; this scenario has no app.package');
    const app = scenario.app;
    const { tools, serial, identity } = await this.takeDevice(signal);
    try {
      let component: string | undefined;
      const sweptLeftovers = await this.sweepLeftovers(serial, identity, signal, async () => {
        if (scenario.start !== 'attach') {
          await this.checkDevice(serial, app.package, signal, async () => {
            component = app.activity ? `${app.package}/${app.activity}` : await this.launcherActivity(serial, app.package, signal);
          });
          return;
        }
        await this.checkDevice(serial, app.package, signal);
        // After the wake: an app behind a sleeping screen is paused, so it would not read as in front.
        await this.checkForeground(serial, app.package, signal);
      });
      if (scenario.start === 'attach') {
        // Attach (Issue 11): no restart. The app must already be in front; the streams then start from now.
        if (await this.startStreams(serial, app.package, signal)) await this.readPid(serial, app.package, signal);
      } else {
        // The streams start between the restart's force-stop and its launch, so nothing the previous instance logged is read.
        await this.stopForRestart(serial, app, signal);
        const watched = await this.startStreams(serial, app.package, signal);
        await this.launch(serial, component!, app, signal);
        if (watched) await this.readPid(serial, app.package, signal);
      }
      await this.startAgent(serial, identity, tools, signal);
      this.prepared = { deviceIdentity: identity, serial, agentSha256: tools.agent.sha256, ...(sweptLeftovers ? { sweptLeftovers } : {}) };
    } catch (error) {
      await this.releaseIfNothingToUndo();
      throw error;
    }
  }

  private async captureIssued(signal: AbortSignal): Promise<Snapshot> {
    if (this.lease.held) throw new Error('Driver is already prepared');
    const { tools, serial, identity } = await this.takeDevice(signal);
    try {
      await this.sweepLeftovers(serial, identity, signal, () => this.checkDevice(serial, undefined, signal));
      await this.startAgent(serial, identity, tools, signal);
    } catch (error) {
      await this.releaseIfNothingToUndo();
      throw error;
    }
    const captured = await this.settledCapture(signal);
    return snapshotOf(serial, captured, ++this.sequence, Date.now());
  }

  /**
   * After a refusal while starting: release the lease now, as the iOS driver does, only while the device holds
   * nothing `close` must undo, since `close` returns at once when the lease isn't held. That is before the
   * restart for `prepare`, whose restart always comes before its agent start, and before the agent start for
   * `capture`, which never restarts. From then on `close` releases the lease, once it has fenced and stopped.
   */
  private async releaseIfNothingToUndo(): Promise<void> {
    if (this.restartedPackage === undefined && !this.agentStartIssued) {
      this.ownership!.beginCleanup(this.admissionSignal?.aborted === true);
      this.ownership!.finish('refused');
      await this.lease.release();
    }
  }

  /**
   * The tools check, then the device name to its serial and identity, then the device lease on the identity.
   * Returns the dead holder's record when the lease was taken over from a crashed run.
   */
  private async takeDevice(signal: AbortSignal): Promise<{ tools: AndroidTools; serial: string; identity: string }> {
    const tools = await (this.options.tools ?? androidTools)();
    this.runner = this.options.runner ?? adbRunner({ adb: tools.adb, environment: adbEnvironment() });
    this.logcat = this.options.logcat ?? logcatStarter({ adb: tools.adb, environment: adbEnvironment() });
    const name = selectAndroidDeviceName(this.options.device, this.options.defaultDevice);
    this.probe = this.options.identityProbe ?? this.options.runner?.identityProbe ?? this.options.agentClient?.identityProbe;
    if (!this.probe && (this.options.runner || this.options.agentClient)) {
      throw new DeviceReasonError('DEVICE_IDENTITY_UNAVAILABLE', 'Device identity requires a read-only probe', { vendorCode: 'PROVENANCE_INACCESSIBLE' });
    }
    this.probe ??= identityProbe({ adb: tools.adb, environment: adbEnvironment() });
    const resolved = await this.identityRead(() => resolveIdentity({ request: { category: this.options.category ?? 'android', name }, probe: this.probe!, signal }));
    if (resolved.category === 'ios-simulator') throw new Error('Android identity required');
    const { serial } = resolved.transport;
    requireReady(resolved.transport);
    const identity = resolved.category === 'android-emulator' ? resolved.provenance.avdName : serial;
    this.resolvedIdentity = resolved;
    this.serial = serial;
    this.admissionSignal = signal;
    if ((this.options.runner || this.options.agentClient) && !this.options.admission) throw new DeviceReasonError('STATE_UNAVAILABLE', 'Injected Android backends require an explicit admission store');
    if (this.options.fakeBackend && (!this.options.runner || !this.options.agentClient || !this.options.logcat || !this.options.admission)) throw new DeviceReasonError('STATE_UNAVAILABLE', 'Fake Android admission requires injected adb, agent and streams');
    const admission = this.options.admission ?? Admission.open();
    admission.assertBackend(this.options.fakeBackend ? 'fake' : 'real');
    try { this.lease.assertKnown(identity, token => admission.markerRecorded({ category: resolved.category, value: resolved.value }, token)); }
    catch (error) {
      if (error instanceof DeviceLeaseBusyError) throw new DeviceReasonError('DEVICE_BUSY', error.message);
      throw error;
    }
    const unrecordedProbe = this.probe;
    const acquired = await admission.acquireWithRecovery({ category: resolved.category, device: resolved.value,
      attempt: { kind: 'legacy', id: this.runId }, digest: this.runId,
      intent: { identity: resolved, profile: this.options.profile ?? null }, transport: resolved.transport, signal,
      ...(resolved.category === 'android-emulator' ? { provenance: resolved.provenance } : {}) },
      async recovery => {
        const recorder = Object.assign((file: string, args: string[], effect: ProbeInvocation['execute']) =>
          recovery.dispatch(JSON.stringify({ kind: 'identity-probe', file, args }), effect), {
          group: (reads: ProbeInvocation[]) => recovery.dispatchReads(reads.map(({ file, args, execute }) => ({
            operation: JSON.stringify({ kind: 'identity-probe', file, args }), read: execute,
          }))),
        });
        this.probe = unrecordedProbe.withRecorder?.(recorder) ?? unrecordedProbe;
        return recoverAndroid({ admission, claim: recovery, serial, runner: this.runner!, logcat: this.logcat!,
          revalidate: () => this.revalidate(signal), signal });
      });
    if (acquired.kind !== 'acquired') throw new DeviceReasonError(acquired.kind === 'refused' && acquired.reason === 'DEVICE_QUARANTINED' ? 'DEVICE_QUARANTINED' : 'DEVICE_BUSY', 'Android admission refused');
    this.ownership = new AndroidOwnership(admission, acquired.claim, serial, this.options.fakeBackend ? 'fake' : 'real');
    this.probe = unrecordedProbe.withRecorder?.(this.ownership.probe) ?? unrecordedProbe;
    try { await this.lease.take(identity, acquired.claim); }
    catch (error) {
      this.ownership.finish('refused');
      if (error instanceof DeviceLeaseBusyError) throw new DeviceReasonError('DEVICE_BUSY', error.message);
      throw error;
    }
    return { tools, serial, identity };
  }

  private async sweepLeftovers(serial: string, identity: string, signal: AbortSignal, preflight: () => Promise<void>): Promise<boolean> {
    await this.checkAgents(serial, identity, signal, preflight);
    return false;
  }

  /** Before any new device work: none once `close` began, except `close`'s own, or once the run was cancelled. */
  private mayIssue(signal: AbortSignal): void {
    if (this.closeBegun && signal !== this.cleanupSignal) throw new Error('The driver is closing; no new device work');
    if (signal.aborted) throw signal.reason;
  }

  private async adb(args: string[], signal: AbortSignal, beforeDispatch?: () => void, components?: ComponentInput[]): Promise<AdbResult> {
    this.mayIssue(signal);
    if (args[0] === '-s' && (args[2] === 'push' || args[2] === 'forward' ||
      args[2] === 'shell' && /^(?:'input'|'am'|'kill'|CLASSPATH=)/.test(args[3] ?? ''))) await this.revalidate(signal);
    this.mayIssue(signal);
    const runner = this.runner!;
    return (await this.ownership!.adb(args, runner, signal, beforeDispatch, components)).result;
  }

  private shell(serial: string, words: string[], signal: AbortSignal, beforeDispatch?: () => void): Promise<AdbResult> {
    return this.adb(['-s', serial, 'shell', words.map(quoted).join(' ')], signal, beforeDispatch);
  }

  /** A command that must succeed; any other exit is `DEVICE_ERROR` with `vendorCode` `adb`. */
  private async succeeded(what: string, pending: Promise<AdbResult>): Promise<string> {
    const result = await pending;
    if (result.exitCode !== 0) throw new AndroidDeviceError('adb', `adb could not ${what} (exit ${String(result.exitCode)})`);
    return result.stdout;
  }

  private async identityRead<T>(read: () => Promise<T>): Promise<T> {
    try { return await read(); }
    catch (error) {
      if (error instanceof IdentityResolutionError && error.code !== 'PROFILE_CONFLICT') throw new DeviceReasonError(error.code, error.message,
        error.reason ? { vendorCode: error.reason } : {});
      throw error;
    }
  }

  private async revalidate(signal: AbortSignal): Promise<void> {
    if (!this.resolvedIdentity || !this.probe) return;
    const current = await this.identityRead(() => revalidateIdentity({ identity: this.resolvedIdentity!, probe: this.probe!, signal }));
    if (current.category !== 'ios-simulator') requireReady(current.transport);
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
   * killed by pid. With no agent left, this serial's agent forwards go too; a forward pointing elsewhere
   * isn't an agent's, whatever a dead holder listed. True when a takeover from a dead holder swept anything, listed
   * or not: a holder that crashed between starting its agent and recording its pid left an unlisted one.
   */
  private async checkAgents(serial: string, identity: string, signal: AbortSignal, preflight: () => Promise<void>): Promise<void> {
    if ((await this.agentsOn(serial, signal)).length) throw foreignAgentFound(identity);
    const forwards = await this.forwardsOn(serial, signal);
    if ([...forwards.values()].includes(AGENT_SOCKET)) throw foreignAgentFound(identity);
    await preflight();
  }

  /**
   * The device checks (item 2), in order: API level, boot, the app installed, then the screen. A screen that
   * is only off is woken; a keyguard still showing is `DEVICE_LOCKED` (open point 16). No setting is changed.
   * `capture` names no app, so it skips the installed check.
   */
  private async checkDevice(serial: string, appPackage: string | undefined, signal: AbortSignal, validateApp?: () => Promise<void>): Promise<void> {
    this.mayIssue(signal);
    const properties = ['ro.build.version.sdk', 'sys.boot_completed'];
    const replies = await this.ownership!.adbReads(properties.map(name => ['-s', serial, 'shell', ['getprop', name].map(quoted).join(' ')]), this.runner!, signal);
    const api = Number(await this.succeeded('read API level', Promise.resolve(replies[0]!)));
    if (!Number.isInteger(api) || api < MIN_API_LEVEL) {
      throw new DeviceReasonError('DEVICE_UNSUPPORTED', `Device ${serial} runs API ${String(api)}; the bridge needs Android 12 (API 31) or later`);
    }
    if ((await this.succeeded('read boot state', Promise.resolve(replies[1]!))).trim() !== '1') {
      throw new DeviceReasonError('DEVICE_NOT_BOOTED', `Device ${serial} hasn't finished booting`);
    }
    if (appPackage !== undefined) {
      const installed = await this.shell(serial, ['pm', 'path', appPackage], signal);
      if (!/^package:/m.test(installed.stdout)) throw new DeviceReasonError('APP_NOT_INSTALLED', `${appPackage} isn't installed on ${serial}`);
    }
    await validateApp?.();
    let screen = await this.screenState(serial, signal);
    if (screen.keyguard) throw new DeviceReasonError('DEVICE_LOCKED', `Device ${serial}'s screen is locked. Set Screen lock to None on a test device`);
    if (!screen.awake) {
      await this.succeeded('wake the screen', this.shell(serial, ['input', 'keyevent', 'KEYCODE_WAKEUP'], signal));
      screen = await this.screenState(serial, signal);
    }
    if (screen.keyguard) {
      throw new DeviceReasonError('DEVICE_LOCKED', `Device ${serial}'s screen is locked. Set Screen lock to None on a test device`);
    }
  }

  /**
   * Attach's foreground check: the resumed activity, from `dumpsys activity activities`, must be the app's. Any
   * other app in front, or none, refuses the run before anything `close` must undo.
   */
  private async checkForeground(serial: string, appPackage: string, signal: AbortSignal): Promise<void> {
    const front = resumedPackage(await this.succeeded('read the resumed activity', this.shell(serial, ['dumpsys', 'activity', 'activities'], signal)));
    if (front === appPackage) return;
    throw new DeviceReasonError('APP_NOT_IN_FOREGROUND', `${appPackage} isn't in front on ${serial} (${front === undefined ? 'no app is' : `${front} is`}); ` +
      'open it on the screen to start from, or use "start": "restart"');
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
   * The two logcat streams (phase 5 item 1), after the restart's force-stop and before its launch, from the
   * device's own time, so no earlier line and no stale crash is read: the app's log, by its uid, to
   * `<run ID>.log` in the private folder, and the process events, line by line into the app-exit watcher.
   * Log files older than 3 days go first.
   * A refused folder, a missing uid or device time, or a stream that won't start never refuses the run: that
   * stream is skipped. True when the events stream started.
   */
  private async startStreams(serial: string, appPackage: string, signal: AbortSignal): Promise<boolean> {
    if (this.options.logFolder === false) return false;
    const folder = await privateLogFolder(this.options.logFolder ?? LOG_FOLDER);
    if (folder === undefined) return false;
    await deleteOldLogs(folder);
    const uid = await this.appUid(serial, appPackage, signal);
    const time = await this.deviceTime(serial, signal);
    if (time === undefined) return false;
    if (uid !== undefined) {
      const file = join(folder, `${this.runId}.log`);
      if (await this.startStream(serial, ['logcat', '-v', 'threadtime,year,uid', `--uid=${uid}`, '-T', time.text], file, signal)) this.logFile = file;
    }
    const watch = this.options.createExitWatch?.({ package: appPackage, startTime: time.seconds, utcOffsetMinutes: time.utcOffsetMinutes });
    const started = await this.startStream(serial, ['logcat', '-b', 'events', '-v', 'threadtime,year', '-T', time.text, ...EVENT_FILTER],
      line => { watch?.feed(line); }, signal, () => { watch?.streamEnded(); });
    if (started) this.watch = watch;
    return started;
  }

  /** One logcat stream on the serial, in the holder record as soon as it has a pid. False when it won't start. */
  private async startStream(serial: string, args: string[], output: LogcatOutput, signal: AbortSignal, endedByItself?: () => void): Promise<boolean> {
    this.mayIssue(signal);
    const componentId = randomUUID();
    let stream: LogcatStream;
    try { stream = await this.ownership!.dispatch(componentId, 'logcat-start', () => this.logcat!.start(['-s', serial, ...args], output, signal), false,
      [{ id: componentId, kind: 'android-stream', serial, args: ['-s', serial, ...args] }]); }
    catch (error) {
      if (signal.aborted) throw error;
      return false;
    }
    const entry: StreamEntry = { stream, componentId, stopping: false };
    this.streams.push(entry);
    try { if (!stream.process) throw new Error('Stream incarnation unavailable'); this.ownership!.observe(componentId, { kind: 'host-start', process: stream.process }); }
    catch (error) {
      // Not in the holder record, so a crash takeover couldn't sweep it: stop it now. One that won't stop stays for close.
      await this.stopStream(entry);
      throw error;
    }
    void stream.exited.then(() => { if (!entry.stopping) endedByItself?.(); });
    return true;
  }

  /**
   * The app's uid, by an exact match on its whole package name in the full `pm list packages -U` output:
   * a package passed as a filter matches substrings. Undefined when it isn't listed with one uid.
   */
  private async appUid(serial: string, appPackage: string, signal: AbortSignal): Promise<string | undefined> {
    const listed = await this.shell(serial, ['pm', 'list', 'packages', '-U'], signal);
    if (listed.exitCode !== 0) return undefined;
    for (const line of listed.stdout.split('\n')) {
      const match = /^package:(\S+) uid:(\d+)$/.exec(line.trim());
      if (match?.[1] === appPackage) return match[2];
    }
    return undefined;
  }

  /**
   * The device's time, as `-T` takes it, and its UTC offset in minutes, in one call: the events lines carry
   * local time with no zone, so the app-exit watcher needs the offset to compare them with the start time.
   */
  private async deviceTime(serial: string, signal: AbortSignal): Promise<{ text: string; seconds: number; utcOffsetMinutes: number } | undefined> {
    const read = await this.shell(serial, ['date', '+%s.%3N %z'], signal);
    const match = /^(\d+\.\d{3}) ([+-])(\d{2})(\d{2})$/.exec(read.stdout.trim());
    if (read.exitCode !== 0 || !match) return undefined;
    const minutes = Number(match[3]) * 60 + Number(match[4]);
    return { text: match[1]!, seconds: Number(match[1]), utcOffsetMinutes: match[2] === '-' ? -minutes : minutes };
  }

  /** `pidof` once, after `am start -W` and never earlier: it blinks during a cold start. Anything but one pid is none known. */
  private async readPid(serial: string, appPackage: string, signal: AbortSignal): Promise<void> {
    const found = await this.shell(serial, ['pidof', appPackage], signal);
    const pids = found.exitCode === 0 ? found.stdout.trim().split(/\s+/).filter(Boolean) : [];
    this.watch?.launched(pids.length === 1 && /^\d+$/.test(pids[0]!) ? Number(pids[0]) : undefined);
  }

  private async stopForRestart(serial: string, app: AndroidAppIdentity, signal: AbortSignal): Promise<void> {
    await this.succeeded('stop the app', this.shell(serial, ['am', 'force-stop', app.package], signal, () => { this.restartedPackage = app.package; }));
  }

  /**
   * The restart's launch (item 3): `am start -W` of the component, each extra as `--es <key> <value>`.
   * `am start` reports a failure in its output, and on API 31 still exits 0, so only `Status: ok` counts as launched.
   */
  private async launch(serial: string, component: string, app: AndroidAppIdentity, signal: AbortSignal): Promise<void> {
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
    this.agentComponent = randomUUID();
    await this.succeeded('start the device agent', this.adb(['-s', serial, 'shell', AGENT_START_COMMAND], signal,
      () => { this.agentStartIssued = true; },
      [{ id: this.agentComponent, kind: 'android-agent', serial, classpath: AGENT_DEVICE_PATH, className: AGENT_CLASS }]));
    const initial = (await this.agentsOn(serial, signal)).filter(found => found.own);
    if (initial.length !== 1) throw new Error('Agent creation identity is incomplete');
    const started = initial[0]!;
    const stat = await this.shell(serial, ['cat', `/proc/${started.pid}/stat`], signal);
    const startTime = stat.exitCode === 0 ? androidStartTime(stat.stdout) : undefined;
    if (!startTime) throw new Error('Agent incarnation unavailable');
    this.ownership!.observe(this.agentComponent, { kind: 'agent-start', pid: started.pid, startTime });
    const port = await this.forward(serial, signal);
    const agent = (this.options.agentClient ?? (forwarded => deviceAgentClient({ port: forwarded })))(port);
    const answered = await this.awaitAgent(agent, tools.agent.sha256, signal);
    const agents = await this.agentsOn(serial, signal);
    // Record every agent of the bridge's before refusing, so close can fence it whatever happens next.
    for (const own of agents.filter(found => found.own)) {
      this.agentPids.push(own.pid);

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
      const componentId = randomUUID();
      const result = await this.adb(['-s', serial, 'forward', `tcp:${String(port)}`, AGENT_SOCKET], signal,
        () => { this.forwardPort = port; this.forwardComponents.set(port, componentId); },
        [{ id: componentId, kind: 'android-forward', serial, local: `tcp:${port}`, remote: AGENT_SOCKET }]);
      if (result.exitCode === 0) return port;
      this.forwardPort = undefined;
      const listed = await this.ownership!.adb(['forward', '--list'], this.runner!, signal);
      this.ownership!.prove(componentId, { kind: 'android-component-stopped', commandId: listed.commandId });
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
      const deadline = this.clock.timeout(Math.max(1, AGENT_READY_MS - (this.clock.now() - startedAt)));
      try {
        if ((await this.ownership!.dispatch(this.agentComponent!, 'agent', () => agent.version(AbortSignal.any([signal, deadline])))).dexSha256 === sha256) return true;
      } catch (error) {
        // Not answering yet is expected while it starts; a cancel is not.
        if (signal.aborted) throw error;
      }
      if (this.clock.now() - startedAt >= AGENT_READY_MS) return false;
      await this.clock.sleep(AGENT_POLL_MS);
    }
  }
}
