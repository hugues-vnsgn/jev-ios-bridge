import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { isIosApp } from '../contracts/index.js';
import { androidAvd, androidSerial } from '../scripted/schema.js';
import { ROLES } from '../scripted/vocabulary.js';
import { DeviceLease, DeviceLeaseBusyError } from './lease.js';
import { Admission, AdmissionError } from './admission.js';
import { processAlive as processAliveForLease } from '../process.js';
import { readLogTail } from './logs.js';
/**
 * The command that shows one simulator: Simulator.app, opened on that device. Not device automation: it only opens
 * an app window. It must run only on a booted simulator, because Simulator boots the device it opens on.
 */
export function simulatorWindowCommand(udid) {
    return ['open', ['-a', 'Simulator', '--args', '-CurrentDeviceUDID', udid]];
}
/** Opens the window with `open`, in the device-layer environment (no Jev key), giving up after 10 seconds. */
const openSimulatorWindow = (udid, signal) => new Promise((done, reject) => {
    const [file, args] = simulatorWindowCommand(udid);
    execFile(file, args, { env: deviceEnvironment(), signal, timeout: 10_000 }, error => {
        if (error)
            reject(new DeviceCliError('WINDOW_FAILED', 'Simulator window could not be opened', !signal.aborted && typeof error.code === 'number'));
        else
            done();
    });
});
/** The window opener a run uses: on by default, off with `--no-device-window` (`turnedOff`) or `JEV_DEVICE_WINDOW=off`. */
export function deviceWindowOpener(turnedOff, environment = process.env) {
    return turnedOff || environment.JEV_DEVICE_WINDOW === 'off' ? undefined : openSimulatorWindow;
}
const UI_ACTION_RESULT = 'mobilebuildmcp.output.ui-action-result';
/** Envelope versions the pinned MobileBuildMCP 2.7.1 returns: "2", or "3" for a verbose UI action. */
function supportedVersion(schema, version) {
    return version === '2' || (schema === UI_ACTION_RESULT && version === '3');
}
export class DeviceCliError extends Error {
    code;
    terminalAcknowledged;
    constructor(code, message, terminalAcknowledged = false) {
        super(message);
        this.code = code;
        this.terminalAcknowledged = terminalAcknowledged;
        this.name = 'DeviceCliError';
    }
}
/**
 * A bridge-owned reason code raised directly by a device driver that knows the bridge's vocabulary
 * (for example the Android driver), skipping the vendor-code translation `DeviceCliError` needs.
 * `failureOf` (`src/scripted/run.ts`) passes its code through unconditionally. An Android error may name
 * the device layer that failed (`adb`, `agent`) as its `vendorCode`; an iOS error names none.
 */
export class DeviceReasonError extends Error {
    code;
    constructor(code, message, options = {}) {
        super(message);
        this.code = code;
        this.name = 'DeviceReasonError';
        if (options.vendorCode !== undefined)
            this.vendorCode = options.vendorCode;
    }
}
export class StaleSnapshotError extends Error {
    constructor(message = 'The screen changed; observe and ask Jev again') {
        super(message);
        this.name = 'StaleSnapshotError';
    }
}
const roleSet = new Set(ROLES);
/** Translate MobileBuildMCP's role into the bridge's vocabulary. Unknown roles become `other`. */
export function bridgeRole(vendorRole) {
    return roleSet.has(vendorRole) ? vendorRole : 'other';
}
function record(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function string(value) {
    return typeof value === 'string' ? value : undefined;
}
function number(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
function terminalPayloadMatches(envelope, expectedSchema, success) {
    if (envelope.schema !== expectedSchema || !supportedVersion(envelope.schema, envelope.schemaVersion))
        return false;
    const data = record(envelope.data);
    if (expectedSchema === 'mobilebuildmcp.output.simulator-list') {
        return Array.isArray(data.simulators) && data.simulators.every(value => {
            const simulator = record(value);
            return typeof simulator.simulatorId === 'string' && SIMULATOR_UUID.test(simulator.simulatorId) &&
                typeof simulator.state === 'string' && simulator.state.trim().length > 0;
        });
    }
    if (Object.keys(record(data.artifacts)).length === 0)
        return false;
    if (expectedSchema === UI_ACTION_RESULT && Object.keys(record(data.action)).length === 0)
        return false;
    if (expectedSchema === 'mobilebuildmcp.output.capture-result' && success && Object.keys(record(data.capture)).length === 0)
        return false;
    return true;
}
function parseEnvelope(result, expectedSchema, validatePayload) {
    let envelope;
    try {
        envelope = record(JSON.parse(result.stdout));
    }
    catch {
        throw new DeviceCliError('INVALID_JSON', `MobileBuildMCP returned invalid JSON (exit ${result.exitCode})`);
    }
    if (envelope.didError === true || result.exitCode !== 0) {
        const uiError = record(record(envelope.data).uiError);
        const legacyError = record(envelope.error);
        const terminalAcknowledged = expectedSchema !== undefined && terminalPayloadMatches(envelope, expectedSchema, false) &&
            (validatePayload === undefined || validatePayload(record(envelope.data)));
        throw new DeviceCliError(string(uiError.code) ?? string(legacyError.code) ?? 'DEVICE_ERROR', string(uiError.message) ?? string(envelope.error) ?? string(legacyError.message) ?? `MobileBuildMCP failed (exit ${result.exitCode})`, terminalAcknowledged);
    }
    if (!supportedVersion(envelope.schema, envelope.schemaVersion) || !envelope.data || typeof envelope.data !== 'object' || Array.isArray(envelope.data)) {
        throw new DeviceCliError('INVALID_ENVELOPE', 'MobileBuildMCP returned an unsupported envelope');
    }
    if (expectedSchema && (!terminalPayloadMatches(envelope, expectedSchema, true) ||
        validatePayload !== undefined && !validatePayload(record(envelope.data)))) {
        throw new DeviceCliError('TERMINAL_ACK_MISSING', 'MobileBuildMCP did not return the expected terminal result');
    }
    return record(envelope.data);
}
function parseCompactRow(row) {
    if (typeof row !== 'string')
        return undefined;
    const [ref, action, role, label, value, identifier] = row.split('|');
    if (!ref || !role)
        return undefined;
    const actions = (action ?? '').split(',').flatMap((name) => {
        if (name === 'swipe')
            return ['swipeWithin'];
        if (name === 'type')
            return ['typeText'];
        if (name === 'text' || !name)
            return [];
        return [name];
    });
    return {
        ref,
        role: bridgeRole(role),
        ...(label ? { label } : {}),
        ...(value ? { value } : {}),
        ...(identifier ? { identifier } : {}),
        actions,
    };
}
function parseFullElement(value) {
    const item = record(value);
    const ref = string(item.ref);
    const role = string(item.role);
    if (!ref || !role)
        return undefined;
    const frame = record(item.frame);
    const state = record(item.state);
    const hasFrame = ['x', 'y', 'width', 'height'].every((key) => number(frame[key]) !== undefined);
    return {
        ref,
        role: bridgeRole(role),
        ...(string(item.label) !== undefined ? { label: string(item.label) } : {}),
        ...(string(item.value) !== undefined ? { value: string(item.value) } : {}),
        ...(string(item.identifier) !== undefined ? { identifier: string(item.identifier) } : {}),
        ...(hasFrame ? { frame: { x: number(frame.x), y: number(frame.y), width: number(frame.width), height: number(frame.height) } } : {}),
        ...(typeof state.enabled === 'boolean' && typeof state.visible === 'boolean'
            ? { state: { enabled: state.enabled, visible: state.visible,
                    ...(typeof state.focused === 'boolean' ? { focused: state.focused } : {}),
                    ...(typeof state.selected === 'boolean' ? { selected: state.selected } : {}) } }
            : {}),
        actions: Array.isArray(item.actions) ? item.actions.filter((action) => typeof action === 'string') : [],
    };
}
export function parseSnapshot(data, deviceId, screenshotPath) {
    const capture = record(data.capture);
    if (capture.type !== 'runtime-snapshot' || !['rs/1', '1'].includes(string(capture.protocol) ?? string(capture.rs) ?? '')) {
        throw new DeviceCliError('INVALID_CAPTURE', 'MobileBuildMCP returned no runtime snapshot');
    }
    const full = Array.isArray(capture.elements);
    const normalized = full
        ? capture.elements.map(parseFullElement).filter((element) => element !== undefined)
        : [...(Array.isArray(capture.targets) ? capture.targets : []),
            ...(Array.isArray(capture.scroll) ? capture.scroll : []),
            ...(Array.isArray(capture.text) ? capture.text : [])]
            .map(parseCompactRow).filter((element) => element !== undefined)
            .reduce((items, element) => {
            const existing = items.find(item => item.ref === element.ref);
            if (!existing)
                items.push(element);
            else
                existing.actions = [...new Set([...existing.actions, ...element.actions])];
            return items;
        }, []);
    if (normalized.length === 0 && number(capture.count) !== 0) {
        throw new DeviceCliError('EMPTY_CAPTURE', 'MobileBuildMCP returned no usable elements');
    }
    const capturedAt = number(capture.capturedAtMs) ?? Date.now();
    return {
        deviceId,
        capturedAt,
        expiresAt: number(capture.expiresAtMs) ?? capturedAt + 60_000,
        sequence: number(capture.seq) ?? 0,
        elements: normalized,
        truncated: !full && [
            Array.isArray(capture.targets) && capture.targets.length >= 64,
            Array.isArray(capture.scroll) && capture.scroll.length >= 32,
            Array.isArray(capture.text) && capture.text.length >= 64,
        ].some(Boolean),
        ...(string(capture.screenHash) ? { screenHash: string(capture.screenHash) } : {}),
        ...(screenshotPath ? { screenshotPath } : {}),
    };
}
/** The environment for device-layer processes: the bridge's own, minus the Jev key, with vendor telemetry off. */
export function deviceEnvironment(source = process.env) {
    const { TYPESAFE_API_KEY: _jevKey, ...environment } = source;
    return { ...environment, MOBILEBUILDMCP_SENTRY_DISABLED: 'true' };
}
/** The pinned MobileBuildMCP CLI installed with the bridge, run directly by Node (no npx round trip). */
export function pinnedMobileBuildMcpCli() {
    return createRequire(import.meta.url).resolve('mobilebuildmcp');
}
function defaultRunner(options) {
    const executable = options.executable ?? process.execPath;
    const prefix = options.prefixArgs ?? (options.executable ? [] : [pinnedMobileBuildMcpCli()]);
    return (args, signal) => new Promise((resolveResult, reject) => {
        execFile(executable, [...prefix, ...args], {
            cwd: resolve(options.cwd),
            env: deviceEnvironment(),
            signal,
            maxBuffer: 8 * 1024 * 1024,
        }, (error, stdout, stderr) => {
            if (error && error.code === 'ABORT_ERR') {
                reject(error);
                return;
            }
            resolveResult({ stdout, stderr, exitCode: error && 'code' in error && typeof error.code === 'number' ? error.code : error ? 1 : 0 });
        });
    });
}
async function configuredUdid(cwd) {
    try {
        const yaml = await readFile(join(cwd, '.mobilebuildmcp', 'config.yaml'), 'utf8');
        return yaml.match(/^\s*simulatorId:\s*([0-9a-fA-F-]{36})\s*$/m)?.[1];
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return undefined;
        throw error;
    }
}
const SIMULATOR_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * The dedicated simulator a run will use: the script's UDID, then the configured default
 * (JEV_DEVICE_UDID), then `.mobilebuildmcp/config.yaml`. Aliases such as `booted` are refused.
 */
export async function selectDeviceId(cwd, scriptUdid, defaultUdid) {
    const selected = scriptUdid ?? defaultUdid ?? await configuredUdid(cwd);
    if (!selected)
        throw new DeviceCliError('NO_DEVICE', 'Set a dedicated simulator UDID in the scenario or MobileBuildMCP config');
    if (!SIMULATOR_UUID.test(selected)) {
        throw new DeviceCliError('INVALID_DEVICE', 'Set a dedicated simulator UUID; device aliases are not supported');
    }
    return selected.toUpperCase();
}
/**
 * The Android device name a run will use: the script's `device.serial` or `device.avd` (already validated
 * by the script schema), then the configured default (JEV_ANDROID_DEVICE; an empty value counts as unset).
 * `noDevice` words the NO_DEVICE message for the caller's own way of naming a device (`capture`'s options).
 * There is no config file and no "any device" fallback. A value read from the environment is checked
 * against the serial and AVD name patterns; a value named by the script is trusted as already checked.
 * Whether the chosen value is a serial or an AVD name is worked out later, once adb can be asked. This is
 * a bridge-owned validation, not a MobileBuildMCP call, so a refusal raises `DeviceReasonError` directly.
 */
export function selectAndroidDeviceName(device, envValue, noDevice = 'Set device.serial or device.avd in the scenario, or JEV_ANDROID_DEVICE') {
    const fromScript = device?.serial ?? device?.avd;
    const selected = fromScript ?? (envValue ? envValue : undefined);
    if (!selected)
        throw new DeviceReasonError('NO_DEVICE', noDevice);
    if (!fromScript && !androidSerial.test(selected) && !androidAvd.test(selected)) {
        throw new DeviceReasonError('INVALID_DEVICE', `JEV_ANDROID_DEVICE must be an adb serial (matching ${androidSerial}) or an AVD name (matching ${androidAvd})`);
    }
    return selected;
}
/** The finger's direction for a scroll: to bring what is further down into view, the finger moves up. */
/**
 * The driven scroll's stroke inside a scroll view, as a fraction of its height: MobileBuildMCP centres it, so 0.4 runs
 * between 30% and 70%, Android's stroke. MobileBuildMCP's default runs from 15% to 85%, which starts a finger-down
 * stroke on a fixed header at the top of a full-screen scroll view, and the content never moves.
 */
export const SCROLL_STROKE_DISTANCE = 0.4;
export function scrollFinger(direction) {
    return direction === 'down' ? 'up' : 'down';
}
/** The largest visible element, by frame area, whose actions include scrolling (`swipeWithin`); the first listed on a tie. */
export function largestScrollable(elements) {
    let largest;
    for (const element of elements) {
        const frame = element.frame;
        if (!frame || !element.actions.includes('swipeWithin') || element.state?.visible === false)
            continue;
        if (frame.width * frame.height <= 0)
            continue;
        if (!largest || frame.width * frame.height > largest.frame.width * largest.frame.height)
            largest = { ...element, frame };
    }
    return largest;
}
/**
 * A scroll with no scrollable element: a vertical swipe down the middle of the screen, the finger going from 70%
 * to 30% of its height to scroll down, the reverse to scroll up, in whole numbers.
 */
export function screenMiddleSwipe(screen, direction) {
    const x = Math.round(screen.width / 2);
    const [from, to] = direction === 'down' ? [0.7, 0.3] : [0.3, 0.7];
    return { x1: x, y1: Math.round(screen.height * from), x2: x, y2: Math.round(screen.height * to) };
}
/**
 * A point on a screenshot of `shot` size, in its pixels, as a whole-number point on a screen of `screen` size;
 * undefined when it isn't a number or lies outside the screenshot.
 */
export function screenPointOf(x, y, shot, screen) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= shot.width || y >= shot.height)
        return undefined;
    return {
        x: Math.min(screen.width - 1, Math.round(x * screen.width / shot.width)),
        y: Math.min(screen.height - 1, Math.round(y * screen.height / shot.height)),
    };
}
function sameScreen(before, after) {
    if (before.screenHash && after.screenHash)
        return before.screenHash === after.screenHash;
    const identity = (snapshot) => snapshot.elements.map(({ ref: _ref, ...element }) => element);
    return JSON.stringify(identity(before)) === JSON.stringify(identity(after));
}
function awaitResultOrAbort(pending, signal) {
    if (signal.aborted)
        return Promise.reject(signal.reason);
    return new Promise((resolveResult, reject) => {
        const onAbort = () => { signal.removeEventListener('abort', onAbort); reject(signal.reason); };
        signal.addEventListener('abort', onAbort, { once: true });
        pending.then(result => { signal.removeEventListener('abort', onAbort); resolveResult(result); }, error => { signal.removeEventListener('abort', onAbort); reject(error); });
    });
}
function rematch(target, fresh) {
    const matches = target.identifier
        ? fresh.elements.filter((element) => element.identifier === target.identifier)
        : fresh.elements.filter((element) => element.role === target.role && element.label === target.label);
    if (matches.length !== 1)
        throw new StaleSnapshotError(matches.length ? 'Refreshed screen has ambiguous target' : 'Target disappeared from refreshed screen');
    return matches[0];
}
/** The screen's size in points: the application element's frame, else the extent of every frame; undefined without frames. */
function screenSizeOf(snapshot) {
    const application = snapshot.elements.find(element => element.role === 'application' && element.frame);
    if (application?.frame && application.frame.width > 0 && application.frame.height > 0) {
        return { width: application.frame.x + application.frame.width, height: application.frame.y + application.frame.height };
    }
    let width = 0;
    let height = 0;
    for (const { frame } of snapshot.elements) {
        if (frame) {
            width = Math.max(width, frame.x + frame.width);
            height = Math.max(height, frame.y + frame.height);
        }
    }
    return width > 0 && height > 0 ? { width, height } : undefined;
}
/** How far down the screen the navigation bar reaches, as a share of its height: a back button's centre is above it. */
const TOP_BAR_SHARE = 0.2;
/** The identifier UIKit and SwiftUI give a navigation bar's back button. */
const BACK_BUTTON_IDENTIFIER = 'BackButton';
/** A back-like label: "Back", "Go back", "Back to …", or one starting with a back chevron. */
const BACK_LABEL = /^(?:(?:go )?back\b|[‹<←])/i;
/**
 * The navigation bar's back button: a visible, tappable button whose centre is in the top bar, identified as
 * `BackButton`, else with a back-like label; the leftmost when several match. Driven mode's policy reads the same
 * button, so a `back` it accepts is checked against the control this driver taps.
 */
export function backButtonOf(snapshot) {
    const screen = screenSizeOf(snapshot);
    if (!screen)
        return undefined;
    const inTopBar = snapshot.elements.filter(element => element.role === 'button' && element.actions.includes('tap') &&
        element.state?.visible !== false && element.frame !== undefined &&
        element.frame.y + element.frame.height / 2 <= screen.height * TOP_BAR_SHARE);
    const leftmost = (buttons) => buttons.sort((a, b) => a.frame.x - b.frame.x)[0];
    return leftmost(inTopBar.filter(element => element.identifier === BACK_BUTTON_IDENTIFIER)) ??
        leftmost(inTopBar.filter(element => element.label !== undefined && BACK_LABEL.test(element.label.trim())));
}
/** Whether a simulator state MobileBuildMCP listed is known and not `Booted` (`Shutdown`, `Booting`, ...). */
function notBooted(state) {
    return state !== undefined && state !== 'Booted';
}
/** Legacy preparation requires a booted device; allocation preparation explicitly boots under admission. */
function notBootedError(deviceId, state) {
    return new DeviceReasonError('DEVICE_NOT_BOOTED', `Simulator ${deviceId} is not booted (state: ${state}). ` +
        `Boot it with \`xcrun simctl boot ${deviceId}\` or from Simulator, then run again.`);
}
/**
 * Start mode "attach" on iOS. MobileBuildMCP 2.7.1 can't tell which app is in front, and attach must refuse unless
 * the app under test is, so the iOS driver refuses it before any device work.
 */
const IOS_ATTACH_REFUSAL = 'Start mode "attach" is Android-only for now: on iOS the bridge can\'t tell whether the app is ' +
    'the one in front. Use "start": "restart" on iOS.';
export class MobileBuildMcpDriver {
    options;
    /** This pinned integration's proven tap-alias collapsing. The run reads it from the driver. */
    tapAliasRule = 'mobilebuildmcp-2.7.1';
    runner;
    window;
    claim;
    session;
    ownsClaim = false;
    issuanceClosed = false;
    uncertain = false;
    detached = false;
    tapOnceIssued = false;
    preparationClaim;
    preparationApp;
    aborters = new Set();
    signalCleanup = new Set();
    deviceId;
    /** The app's identity: its bundle ID on iOS. */
    appId;
    lease;
    launched = false;
    logPaths = {};
    logNotes = {};
    referenceRefreshes = 0;
    referenceExpiries = 0;
    nearTtlRefreshes = 0;
    closing;
    uiCommandTimeoutMs;
    /** How the last `act` carried out a `back` or `scroll`. */
    lastActPath;
    /** What the last `prepare` worked around without failing, for the run log. */
    warnings = [];
    constructor(options) {
        this.options = options;
        this.runner = options.fakeBackend?.runner ?? options.runner ?? defaultRunner(options);
        this.window = options.fakeBackend ? options.fakeBackend.window : options.deviceWindow;
        if (options.fakeBackend && (!Object.hasOwn(options.fakeBackend, 'window') || typeof options.fakeBackend.runner !== 'function' ||
            (options.fakeBackend.window !== undefined && options.fakeBackend.window === openSimulatorWindow))) {
            throw new AdmissionError('STATE_UNAVAILABLE', 'Fake backend requires an injected runner and window opener');
        }
        if (options.fakeBackend && !options.admission) {
            throw new AdmissionError('STATE_UNAVAILABLE', 'Fake backend requires an explicit isolated admission store');
        }
        if (options.admission?.mode === 'test' && !options.fakeBackend) {
            throw new AdmissionError('STATE_UNAVAILABLE', 'Test admission requires explicit fake runner and window opener');
        }
        this.lease = new DeviceLease({ ...(options.lockRoot ? { root: options.lockRoot } : {}), reclaimDeadHolder: false });
        const timeout = options.uiCommandTimeoutMs ?? 35_000;
        if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 300_000)
            throw new RangeError('uiCommandTimeoutMs must be between 1 and 300000');
        this.uiCommandTimeoutMs = timeout;
    }
    /**
     * Whether the launched app is still running, from the console helper MobileBuildMCP started for it
     * (its PID is in the log file name, and it exits with the app). Undefined when that can't be told.
     */
    appRunning() {
        const pid = Number(this.logPaths.runtime?.match(/_helperpid(\d+)_/)?.[1]);
        if (!this.launched || !Number.isSafeInteger(pid) || pid <= 0)
            return undefined;
        try {
            process.kill(pid, 0);
            return true;
        }
        catch (error) {
            return error.code === 'EPERM';
        }
    }
    /** APP_EXITED once the console helper has exited, with the note the log pane has always shown for it. */
    appProblem() {
        return this.appRunning() === false
            ? { code: 'APP_EXITED', note: 'The app stopped unexpectedly: its console output ended while the run was still going.' } : undefined;
    }
    logSources() {
        return { ...(this.logPaths.runtime ? { runtime: this.logPaths.runtime } : {}),
            ...(this.logPaths.os ? { os: this.logPaths.os } : {}) };
    }
    prepareWarnings() {
        return [...this.warnings];
    }
    actPath() {
        return this.lastActPath;
    }
    metrics() {
        return {
            referenceRefreshes: this.referenceRefreshes,
            referenceExpiries: this.referenceExpiries,
            nearTtlRefreshes: this.nearTtlRefreshes,
        };
    }
    async call(args, signal, expectedSchema, validatePayload) {
        if (signal.aborted)
            throw signal.reason ?? new Error('Aborted');
        const data = parseEnvelope(await this.runner([...args, '--output', 'json'], signal), expectedSchema, validatePayload);
        if (args[0] === 'ui-automation' && args[1] === 'snapshot-ui')
            parseSnapshot(data, this.deviceId);
        return data;
    }
    /** Local closure is synchronous, even when the durable cancellation write fails. */
    revoke(uncertain) {
        this.issuanceClosed = true;
        this.uncertain ||= uncertain;
        try {
            this.claim?.cancel();
        }
        catch { /* The local gate remains closed. */ }
        for (const controller of this.aborters)
            controller.abort(new Error('Device issuance closed'));
    }
    checkIssuance(signal) {
        if (signal.aborted) {
            this.revoke(this.session !== undefined);
            throw signal.reason;
        }
        if (this.issuanceClosed || !this.session)
            throw new AdmissionError('DISPATCH_CLOSED', 'Device issuance is closed');
    }
    watchSignal(signal) {
        const cancel = () => this.revoke(true);
        signal.addEventListener('abort', cancel, { once: true });
        this.signalCleanup.add(() => signal.removeEventListener('abort', cancel));
        if (signal.aborted)
            cancel();
    }
    clearSignalListeners() {
        for (const cleanup of this.signalCleanup)
            cleanup();
        this.signalCleanup.clear();
    }
    async dispatch(kind, signal, effect, timeoutMs = this.uiCommandTimeoutMs) {
        if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 900_000)
            throw new RangeError('Command timeout must be between 1 and 900000');
        this.checkIssuance(signal);
        if (this.detached && kind !== 'stop')
            throw new AdmissionError('DISPATCH_CLOSED', 'Driver is closing');
        const controller = new AbortController();
        this.aborters.add(controller);
        const cancel = () => { controller.abort(signal.reason); this.revoke(true); };
        signal.addEventListener('abort', cancel, { once: true });
        const deadline = setTimeout(() => { controller.abort(new Error('UI command deadline reached')); this.revoke(true); }, timeoutMs);
        try {
            // dispatch invokes this callback synchronously after its authorization COMMIT.
            const authorized = this.session.dispatch(kind, () => {
                const issued = this.lease.command('mobilebuildmcp');
                // track the backend promise itself; an abortable waiting wrapper is not settlement.
                return this.lease.track(async () => {
                    try {
                        const value = await effect(controller.signal);
                        issued.exited();
                        return { kind: 'value', value };
                    }
                    catch (error) {
                        if (error instanceof DeviceCliError && error.terminalAcknowledged) {
                            issued.exited();
                            return { kind: 'acknowledged-error', error };
                        }
                        issued.unknown();
                        throw error;
                    }
                });
            });
            const result = await awaitResultOrAbort(this.lease.track(() => authorized), controller.signal);
            this.checkIssuance(signal);
            if (result.kind === 'acknowledged-error')
                throw result.error;
            return result.value;
        }
        catch (error) {
            if (!(error instanceof DeviceCliError && error.terminalAcknowledged) || controller.signal.aborted)
                this.revoke(true);
            throw error;
        }
        finally {
            clearTimeout(deadline);
            this.aborters.delete(controller);
            signal.removeEventListener('abort', cancel);
        }
    }
    issueCommand(args, signal, expectedSchema, kind = 'legacy-command', timeoutMs = this.uiCommandTimeoutMs) {
        return this.dispatch(kind, signal, issuedSignal => this.call(args, issuedSignal, expectedSchema), timeoutMs);
    }
    async attach(claim, appId, signal) {
        if (this.claim || this.lease.held || this.detached)
            throw new Error('Driver is already attached');
        if (signal.aborted)
            throw signal.reason;
        const backend = this.options.fakeBackend ? 'fake' : 'real';
        this.options.admission?.assertBackend(backend);
        this.claim = claim;
        this.session = claim.bindDriver(backend);
        this.deviceId = claim.identity.device;
        this.appId = appId;
        this.watchSignal(signal);
        try {
            await this.lease.take(this.deviceId);
            this.checkIssuance(signal);
        }
        catch (error) {
            if (error instanceof DeviceLeaseBusyError) {
                if (error.holder?.processId === undefined || !processAliveForLease(error.holder.processId))
                    this.revoke(true);
                else
                    this.issuanceClosed = true;
                throw new DeviceCliError('DEVICE_BUSY', error.message);
            }
            this.revoke(true);
            throw error;
        }
    }
    /** Attach already admitted preparation; allocation ownership never reacquires or launches here. */
    async attachPreparation(claim, context, signal) {
        if (claim.identity.attempt.kind !== 'preparation')
            throw new AdmissionError('INVALID_REQUEST', 'Expected preparation ownership');
        await this.attach(claim, context.app.bundleId, signal);
        this.preparationClaim = claim;
        this.preparationApp = context.app;
    }
    /** Attach a consumed parked action, including in a fresh process. No preparation or presentation. */
    async attachObserved(claim, context, signal) {
        if (claim.identity.attempt.kind !== 'observed')
            throw new AdmissionError('INVALID_REQUEST', 'Expected observed ownership');
        await this.attach(claim, context.app.bundleId, signal);
    }
    preparedDevice() {
        if (!this.preparationClaim || !this.deviceId || this.detached)
            throw new AdmissionError('DISPATCH_CLOSED', 'Preparation is not attached');
        return this.deviceId;
    }
    async boot(signal, timeoutMs = this.uiCommandTimeoutMs) {
        const device = this.preparedDevice();
        await this.issueCommand(['simulator', 'boot', '--simulator-id', device], signal, 'mobilebuildmcp.output.simulator-action-result', 'boot', timeoutMs);
    }
    bootState(signal, timeoutMs = this.uiCommandTimeoutMs) {
        return this.simulatorState(this.preparedDevice(), signal, 'boot-state', timeoutMs);
    }
    /** Only the admitted identity's explicit vendor availability can qualify supplied inventory. */
    inventoryStatus(signal, timeoutMs = this.uiCommandTimeoutMs) {
        const device = this.preparedDevice();
        const select = (data) => data.simulators.map(record)
            .filter(simulator => string(simulator.simulatorId)?.toUpperCase() === device);
        const validate = (data) => {
            const selected = select(data);
            return selected.length === 0 || selected.length === 1 && typeof selected[0].isAvailable === 'boolean';
        };
        return this.dispatch('inventory-status', signal, async (issuedSignal) => {
            const data = await this.call(['simulator', 'list'], issuedSignal, 'mobilebuildmcp.output.simulator-list', validate);
            const simulator = select(data)[0];
            return simulator ? { state: simulator.state, isAvailable: simulator.isAvailable } : undefined;
        }, timeoutMs);
    }
    async install(artifactPath, signal, timeoutMs = this.uiCommandTimeoutMs) {
        const device = this.preparedDevice();
        if (!isAbsolute(artifactPath))
            throw new AdmissionError('INVALID_REQUEST', 'Expected absolute staged app path');
        await this.issueCommand(['simulator', 'install', '--simulator-id', device, '--app-path', artifactPath], signal, 'mobilebuildmcp.output.install-result', 'install', timeoutMs);
    }
    async launch(signal, timeoutMs = this.uiCommandTimeoutMs) {
        const device = this.preparedDevice();
        const app = this.preparationApp;
        await this.issueCommand(['simulator', 'launch-app', '--simulator-id', device, '--bundle-id', app.bundleId,
            ...(app.launchArgs?.length ? ['--json', JSON.stringify({ launchArgs: app.launchArgs })] : [])], signal, 'mobilebuildmcp.output.launch-result', 'launch', timeoutMs);
    }
    /** Bounded initial listing and visible capture after acknowledged launch. */
    async readiness(signal, timeoutMs = this.uiCommandTimeoutMs) {
        const device = this.preparedDevice();
        const state = await this.simulatorState(device, signal, 'readiness', timeoutMs);
        if (state !== 'Booted')
            throw new DeviceCliError('READINESS_FAILED', 'Prepared simulator is not confirmed booted', true);
        const data = await this.issueCommand(this.captureArgs(device), signal, 'mobilebuildmcp.output.capture-result', 'readiness', timeoutMs);
        const shot = this.options.screenshots ? await this.issueCommand(['ui-automation', 'screenshot', '--simulator-id', device,
            '--return-format', 'path'], signal, 'mobilebuildmcp.output.capture-result', 'readiness', timeoutMs) : undefined;
        const screenshotPath = shot && (string(record(shot.artifacts).screenshotPath) ?? string(record(shot.capture).path) ?? string(shot.path));
        return this.evidence(data, device, screenshotPath, signal);
    }
    /** Local settlement and lease cleanup precede the authoritative parked commit. */
    async park(readinessEvidence, evidenceRefs, signal) {
        this.preparedDevice();
        this.detached = true;
        try {
            await this.lease.settle(signal);
            this.checkIssuance(signal);
            if (!this.lease.releasable)
                throw new Error('Preparation operations are unknown');
            await this.lease.release();
            const result = this.preparationClaim.park(readinessEvidence, evidenceRefs);
            this.issuanceClosed = true;
            return result;
        }
        catch (error) {
            this.revoke(true);
            throw error;
        }
        finally {
            this.clearSignalListeners();
        }
    }
    /** Finalization closes future effects synchronously; pending effects remain uncertain. */
    revokeIssuance() {
        this.issuanceClosed = true;
        this.detached = true;
        if (this.aborters.size)
            this.revoke(true);
    }
    prepare(scenario, signal) {
        return this.lease.track(() => this.prepareIssued(scenario, signal));
    }
    async prepareIssued(scenario, signal) {
        if (this.lease.held)
            throw new Error('Driver is already prepared');
        if (!this.claim && !this.uncertain) {
            this.detached = false;
            this.issuanceClosed = false;
        }
        this.warnings = [];
        if (signal.aborted)
            throw signal.reason;
        if (!isIosApp(scenario.app)) {
            throw new Error('The MobileBuildMCP driver only runs iOS scripts; this scenario has no app.bundleId');
        }
        if (scenario.start === 'attach')
            throw new DeviceReasonError('UNSUPPORTED_ACTION', IOS_ATTACH_REFUSAL);
        const bundleId = scenario.app.bundleId;
        const deviceId = await selectDeviceId(this.options.cwd, scenario.device?.udid, this.options.defaultUdid);
        const admission = this.options.admission ?? Admission.open();
        admission.assertBackend(this.options.fakeBackend ? 'fake' : 'real');
        const intent = { deviceId, app: scenario.app, start: scenario.start ?? 'restart' };
        const acquired = admission.acquire({ device: deviceId, attempt: { kind: 'legacy', id: this.options.runId ?? randomUUID() },
            digest: createHash('sha256').update(JSON.stringify(intent)).digest('hex'), intent, signal });
        if (acquired.kind !== 'acquired')
            throw new DeviceCliError('DEVICE_BUSY', `Device admission refused: ${acquired.kind === 'refused' ? acquired.reason : 'ATTEMPT_ALREADY_EXISTS'}`);
        this.ownsClaim = true;
        try {
            await this.attach(acquired.claim, bundleId, signal);
        }
        catch (error) {
            await this.finishAdmission(false);
            throw error;
        }
        this.tapOnceIssued = false;
        this.referenceRefreshes = 0;
        this.referenceExpiries = 0;
        this.nearTtlRefreshes = 0;
        this.deviceId = deviceId;
        this.appId = bundleId;
        // Read before the window opens (Simulator boots the device it opens on); without a window, only once a launch fails.
        let stateRead = false;
        try {
            if (this.window) {
                const state = await this.simulatorState(deviceId, signal);
                stateRead = true;
                if (notBooted(state))
                    throw notBootedError(deviceId, state);
                if (state === undefined)
                    this.warnings.push('Simulator window not opened: the simulator\'s state could not be read.');
                else {
                    try {
                        await this.dispatch('window', signal, issuedSignal => this.window(deviceId, issuedSignal), Math.min(this.uiCommandTimeoutMs, 10_000));
                    }
                    catch {
                        if (signal.aborted || this.issuanceClosed)
                            throw signal.reason ?? new AdmissionError('DISPATCH_CLOSED', 'Window outcome is unknown');
                        this.warnings.push('Simulator window not opened: Simulator could not be opened on the run\'s device.');
                    }
                }
            }
            const launchArgs = scenario.app.launchArgs ?? [];
            // Array parameters go through --json, so arguments that start with "-" aren't read as CLI flags.
            const launched = await this.issueCommand(['simulator', 'launch-app', '--simulator-id', deviceId, '--bundle-id', bundleId,
                ...(launchArgs.length ? ['--json', JSON.stringify({ launchArgs })] : [])], signal, 'mobilebuildmcp.output.launch-result');
            const artifacts = record(launched.artifacts);
            this.logPaths = {};
            this.logNotes = {};
            for (const [name, field] of [['runtime', 'runtimeLogPath'], ['os', 'osLogPath']]) {
                const path = string(artifacts[field]);
                if (path && isAbsolute(path))
                    this.logPaths[name] = path;
                else if (path)
                    this.logNotes[name] = '[unavailable: invalid vendor log path]';
                else
                    this.logNotes[name] = '[unavailable: vendor supplied no log path]';
            }
            this.launched = true;
        }
        catch (error) {
            let failure = error;
            if (!stateRead && error instanceof DeviceCliError && error.terminalAcknowledged && !signal.aborted && !this.issuanceClosed) {
                let state;
                try {
                    state = await this.simulatorState(deviceId, signal);
                }
                catch { /* Preserve launch semantics; issuance remains closed. */ }
                if (notBooted(state))
                    failure = notBootedError(deviceId, state);
            }
            if (!this.uncertain && this.lease.releasable)
                await this.lease.release();
            await this.finishAdmission(false);
            throw failure;
        }
    }
    /**
     * The simulator's state as MobileBuildMCP lists it (`Booted`, `Shutdown`, `Booting`, ...); undefined when it can't be
     * read or the device isn't listed. Once selected, listing needs admission and a command ledger entry.
     */
    async simulatorState(deviceId, signal, kind = 'selected-device-list', timeoutMs = this.uiCommandTimeoutMs) {
        const data = await this.issueCommand(['simulator', 'list'], signal, 'mobilebuildmcp.output.simulator-list', kind, timeoutMs);
        const simulators = Array.isArray(data.simulators) ? data.simulators.map(record) : [];
        return string(simulators.find(simulator => string(simulator.simulatorId)?.toUpperCase() === deviceId)?.state);
    }
    observe(signal) {
        if (this.detached)
            return Promise.reject(new AdmissionError('DISPATCH_CLOSED', 'Driver is closed'));
        return this.lease.track(() => this.observeIssued(signal));
    }
    captureArgs(deviceId) {
        return ['ui-automation', 'snapshot-ui', '--simulator-id', deviceId, ...(this.options.capture === 'full' ? ['--verbose'] : [])];
    }
    async screenshot(deviceId, signal) {
        const shot = await this.issueCommand(['ui-automation', 'screenshot', '--simulator-id', deviceId, '--return-format', 'path'], signal, 'mobilebuildmcp.output.capture-result');
        return string(record(shot.artifacts).screenshotPath) ?? string(record(shot.capture).path) ?? string(shot.path);
    }
    /** Complete a capture with its screenshot, app log tails, and the optional screenshot agreement check. */
    async evidence(data, deviceId, screenshotPath, signal, extra = {}) {
        const snapshot = parseSnapshot(data, deviceId, screenshotPath);
        let verification = {};
        if (this.options.verifyScreenshotAgreement && screenshotPath && extra.screenshotAgreement === undefined) {
            const began = performance.now();
            const after = parseSnapshot(await this.issueCommand(this.captureArgs(deviceId), signal, 'mobilebuildmcp.output.capture-result'), deviceId);
            verification = { screenshotAgreement: sameScreen(snapshot, after), verifyMs: performance.now() - began };
        }
        const logTails = { ...this.logNotes };
        for (const [name, path] of Object.entries(this.logPaths))
            logTails[name] = await readLogTail(path);
        return { ...snapshot, ...extra, ...verification, ...(Object.keys(logTails).length ? { logTails } : {}) };
    }
    async observeIssued(signal) {
        const deviceId = this.deviceId;
        if (!deviceId || !this.lease.held)
            throw new Error('Driver is not prepared');
        // The capture and the screenshot run concurrently. Wait for both to settle, so a failure in one
        // never leaves the other in flight after this operation reports done.
        const captureWithScreenshot = async () => {
            const [capture, shot] = await Promise.allSettled([
                this.issueCommand(this.captureArgs(deviceId), signal, 'mobilebuildmcp.output.capture-result'),
                this.options.screenshots ? this.screenshot(deviceId, signal) : Promise.resolve(undefined),
            ]);
            if (capture.status === 'rejected')
                throw capture.reason;
            if (shot.status === 'rejected')
                throw shot.reason;
            return { data: capture.value, screenshotPath: shot.value };
        };
        if (!this.options.verifyScreenshotAgreement || !this.options.screenshots) {
            const { data, screenshotPath } = await captureWithScreenshot();
            return this.evidence(data, deviceId, screenshotPath, signal);
        }
        // Measurement mode. MobileBuildMCP resolves element references against its latest capture, so the
        // extra agreement capture must never leave the run holding references from an older one. When the
        // screen moved, capture again until the screenshot and capture agree (at most 3 tries). If they never
        // agree, the run gets the newest capture. All of this time counts as measurement time, not observation.
        let spentOnRetries = 0;
        for (let attempt = 1;; attempt++) {
            const attemptBegan = performance.now();
            const { data, screenshotPath } = await captureWithScreenshot();
            const snapshot = parseSnapshot(data, deviceId, screenshotPath);
            const checkBegan = performance.now();
            const after = await this.issueCommand(this.captureArgs(deviceId), signal, 'mobilebuildmcp.output.capture-result');
            const agrees = sameScreen(snapshot, parseSnapshot(after, deviceId));
            if (agrees || attempt === 3) {
                const verifyMs = spentOnRetries + (performance.now() - checkBegan);
                return this.evidence(agrees ? data : after, deviceId, screenshotPath, signal, { screenshotAgreement: agrees, verifyMs, ...(attempt > 1 ? { verifyAttempts: attempt } : {}) });
            }
            spentOnRetries += performance.now() - attemptBegan;
        }
    }
    act(action, snapshot, scenario, signal) {
        if (this.detached)
            return Promise.reject(new AdmissionError('DISPATCH_CLOSED', 'Driver is closed'));
        return this.lease.track(() => this.actIssued(action, snapshot, scenario, signal));
    }
    get reusesActionCapture() {
        return this.options.reuseActionCapture === true && this.options.capture === 'full';
    }
    /**
     * The settled screen MobileBuildMCP captured after the action, completed with its screenshot, or
     * undefined when it returned none (the screen didn't settle within its 2.5 s window) or it can't be parsed.
     */
    async settledCapture(result, signal) {
        if (!this.reusesActionCapture || !this.deviceId || Object.keys(record(result.capture)).length === 0)
            return undefined;
        try {
            parseSnapshot(result, this.deviceId);
        }
        catch {
            return undefined;
        }
        const screenshotPath = this.options.screenshots ? await this.screenshot(this.deviceId, signal) : undefined;
        return this.evidence(result, this.deviceId, screenshotPath, signal, { reusedFromAction: true });
    }
    async actIssued(action, snapshot, scenario, signal) {
        if (!this.deviceId || snapshot.deviceId !== this.deviceId)
            throw new Error('Snapshot belongs to a different device');
        this.lastActPath = undefined;
        if (action.kind === 'back')
            return this.back(snapshot, scenario, signal);
        if (action.kind === 'scroll')
            return this.scroll(action.direction, snapshot, scenario, signal);
        // MobileBuildMCP 2.7.1 taps only element references, and the bridge runs no device automation of its own (ADR-0002).
        if (action.kind === 'tapAt')
            throw new DeviceCliError('UNSUPPORTED_ACTION', 'MobileBuildMCP 2.7.1 has no tap at a point');
        return this.actOnElement(action, snapshot, scenario, signal);
    }
    /**
     * Back: tap the navigation bar's back button when the screen has one, else swipe in from the left edge with
     * MobileBuildMCP's gesture preset, told the screen's size in points (its default is another iPhone's).
     */
    async back(snapshot, scenario, signal) {
        const button = backButtonOf(snapshot);
        if (button) {
            this.lastActPath = { path: 'back-button', targetRef: button.ref };
            return this.actOnElement({ kind: 'tap', targetRef: button.ref }, snapshot, scenario, signal);
        }
        this.lastActPath = { path: 'edge-swipe' };
        return this.gesture('swipe-from-left-edge', snapshot, signal);
    }
    /**
     * One of MobileBuildMCP's gesture presets, told the screen's size in points (the size AXe, which runs the preset,
     * takes; its default is another iPhone's), then the settled capture when reused.
     */
    async gesture(preset, snapshot, signal) {
        const screen = screenSizeOf(snapshot);
        const size = screen ? ['--screen-width', String(Math.round(screen.width)), '--screen-height', String(Math.round(screen.height))] : [];
        if (signal.aborted)
            throw signal.reason;
        return this.settledCapture(await this.issueCommand(['ui-automation', 'gesture', '--simulator-id', this.deviceId,
            '--preset', preset, ...size, ...(this.reusesActionCapture ? ['--verbose'] : [])], signal, UI_ACTION_RESULT), signal);
    }
    /**
     * Scroll: swipe inside the largest scroll view by its reference, with MobileBuildMCP's own swipe timing and a
     * stroke of SCROLL_STROKE_DISTANCE centred in the view; else AXe's preset in the screen's centre, since MobileBuildMCP
     * swipes only within an element and the bridge runs no device automation of its own (ADR-0002). The preset's stroke
     * is AXe's, not Android's 70% to 30%, and its name gives the finger's direction: `scroll-up` reveals what is below.
     */
    async scroll(direction, snapshot, scenario, signal) {
        const area = largestScrollable(snapshot.elements);
        if (area) {
            this.lastActPath = { path: 'scroll-within', targetRef: area.ref };
            return this.actOnElement({ kind: 'swipe', targetRef: area.ref, direction: scrollFinger(direction) }, snapshot, scenario, signal, SCROLL_STROKE_DISTANCE);
        }
        this.lastActPath = { path: 'screen-middle' };
        return this.gesture(direction === 'down' ? 'scroll-up' : 'scroll-down', snapshot, signal);
    }
    /** Single observed tap via one vendor touch down/up request. The default semantic tap can
     * acknowledge without activating SwiftUI navigation on iOS 27; a 50ms hold worked in the
     * live comparison. This is an execution acknowledgement, never a native release certificate. */
    tapOnce(ref, snapshot, _scenario, signal) {
        if (this.detached)
            return Promise.reject(new AdmissionError('DISPATCH_CLOSED', 'Driver is closed'));
        return this.lease.track(async () => {
            if (!this.deviceId || snapshot.deviceId !== this.deviceId)
                throw new Error('Snapshot belongs to a different device');
            if (!Number.isFinite(snapshot.expiresAt) || Date.now() >= snapshot.expiresAt)
                throw new StaleSnapshotError();
            const target = snapshot.elements.find(element => element.ref === ref);
            if (!target)
                throw new StaleSnapshotError('Target reference is absent from observation');
            if (!target.actions.includes('tap') || !target.actions.includes('touch')) {
                throw new DeviceCliError('UNSUPPORTED_ACTION', 'Experimental tap requires tap and touch capabilities');
            }
            this.checkIssuance(signal);
            if (this.tapOnceIssued)
                throw new AdmissionError('DISPATCH_CLOSED', 'Tap already authorized');
            this.tapOnceIssued = true;
            const data = await this.issueCommand(['ui-automation', 'touch', '--json', JSON.stringify({
                    simulatorId: this.deviceId, elementRef: ref, down: true, up: true, delay: 0.05,
                })], signal, UI_ACTION_RESULT, 'tap');
            return this.settledCapture(data, signal);
        });
    }
    /** `swipeDistance` is MobileBuildMCP's stroke length as a fraction of the element; absent, its default stroke. */
    async actOnElement(action, snapshot, scenario, signal, swipeDistance) {
        const old = snapshot.elements.find((element) => element.ref === action.targetRef);
        if (!old)
            throw new StaleSnapshotError('Target reference is absent from observation');
        const requiredAction = action.kind === 'type' ? 'typeText' : action.kind === 'swipe' ? 'swipeWithin' : 'tap';
        if (!old.actions.includes(requiredAction))
            throw new DeviceCliError('UNSUPPORTED_ACTION', `Target does not support ${action.kind}`);
        if (action.kind === 'type' && !Object.hasOwn(scenario.values, action.valueKey))
            throw new DeviceCliError('MISSING_VALUE', `Scenario value ${action.valueKey} is absent`);
        if (action.kind === 'type' && scenario.values[action.valueKey].startsWith('-')) {
            throw new DeviceCliError('UNSUPPORTED_LEADING_DASH_TEXT', 'MobileBuildMCP 2.7.1 cannot type a value beginning with a hyphen');
        }
        let selected = old;
        if (Date.now() >= snapshot.expiresAt - 5_000) {
            const fresh = await this.observe(signal);
            this.referenceRefreshes++;
            this.nearTtlRefreshes++;
            if (!sameScreen(snapshot, fresh))
                throw new StaleSnapshotError();
            selected = rematch(old, fresh);
        }
        const verbose = this.reusesActionCapture ? ['--verbose'] : [];
        const perform = (ref) => {
            const base = ['ui-automation'];
            if (action.kind === 'tap')
                return [...base, 'tap', '--simulator-id', this.deviceId, '--element-ref', ref, ...verbose];
            if (action.kind === 'type')
                return [...base, 'type-text', '--json', JSON.stringify({
                        simulatorId: this.deviceId, elementRef: ref, text: scenario.values[action.valueKey], replaceExisting: true,
                    }), ...verbose];
            return [...base, 'swipe', '--simulator-id', this.deviceId, '--within-element-ref', ref, '--direction', action.direction,
                ...(swipeDistance === undefined ? [] : ['--distance', String(swipeDistance)]), ...verbose];
        };
        if (signal.aborted)
            throw signal.reason;
        try {
            return await this.settledCapture(await this.issueCommand(perform(selected.ref), signal, UI_ACTION_RESULT), signal);
        }
        catch (error) {
            if (signal.aborted || !(error instanceof DeviceCliError) || !['SNAPSHOT_EXPIRED', 'ELEMENT_REF_NOT_FOUND'].includes(error.code))
                throw error;
            if (error.code === 'SNAPSHOT_EXPIRED')
                this.referenceExpiries++;
            const fresh = await this.observe(signal);
            this.referenceRefreshes++;
            if (!sameScreen(snapshot, fresh))
                throw new StaleSnapshotError();
            selected = rematch(old, fresh);
            if (signal.aborted)
                throw signal.reason;
            return this.settledCapture(await this.issueCommand(perform(selected.ref), signal, UI_ACTION_RESULT), signal);
        }
    }
    close(signal) {
        if (this.closing)
            return this.closing;
        // Public continuations cannot issue while cleanup is running. Cleanup uses its own gate below.
        this.detached = true;
        this.closing = this.finishClose(signal).finally(() => { this.clearSignalListeners(); this.closing = undefined; });
        return this.closing;
    }
    async finishAdmission(completed) {
        this.clearSignalListeners();
        if (!this.ownsClaim || !this.claim)
            return;
        const candidate = this.uncertain
            ? { outcome: 'inconclusive', disposition: 'quarantined', payload: { reason: 'DEVICE_OPERATION_UNCONFIRMED' }, evidenceRefs: [] }
            : { outcome: completed ? 'completed' : 'refused', disposition: 'available', payload: { completed }, evidenceRefs: [] };
        const finalized = this.claim.finalize(candidate);
        this.issuanceClosed = true;
        this.ownsClaim = false;
        if (finalized.authority !== 'committed')
            throw new DeviceCliError('UI_ACTION_UNCONFIRMED', 'Device admission finalization is unconfirmed');
    }
    async finishClose(signal) {
        if (this.uncertain) {
            await this.finishAdmission(false);
            throw new DeviceCliError('UI_ACTION_UNCONFIRMED', 'Device operation outcome is unknown; device lock retained');
        }
        try {
            await this.lease.settle(signal);
            if (!this.lease.held) {
                await this.finishAdmission(false);
                return;
            }
            if (!this.lease.releasable)
                throw new Error('Device operation outcome is unknown');
            if (this.ownsClaim && this.launched && this.options.stopAppOnClose !== false && this.deviceId && this.appId) {
                try {
                    await this.issueCommand(['simulator', 'stop', '--simulator-id', this.deviceId, '--bundle-id', this.appId], signal, 'mobilebuildmcp.output.stop-result', 'stop');
                }
                catch (error) {
                    if (!(error instanceof DeviceCliError && error.terminalAcknowledged))
                        throw error;
                }
            }
            this.issuanceClosed = true;
            await this.lease.release();
            const legacy = this.ownsClaim;
            await this.finishAdmission(true);
            if (legacy) {
                this.claim = undefined;
                this.session = undefined;
            }
            this.launched = false;
            this.logPaths = {};
            this.logNotes = {};
        }
        catch (error) {
            this.revoke(true);
            await this.finishAdmission(false);
            if (error instanceof DeviceCliError || error instanceof SyntaxError)
                throw error;
            throw new DeviceCliError('UI_ACTION_UNCONFIRMED', 'Cleanup ended before the issued device operation acknowledged; device lock retained');
        }
    }
}
export function createMobileBuildMcpDriver(options) {
    return new MobileBuildMcpDriver(options);
}
