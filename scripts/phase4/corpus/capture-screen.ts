import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { chmod, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { hostVersions } from '../../../src/appium/composition.js';
import type { RawScreenPair } from '../../../src/appium/driver.js';
import { normalizeSource } from '../../../src/appium/observe/normalize.js';
import { hostRun } from '../../../src/appium/native/presentation.js';
import type { StackProvenance } from '../../../src/contracts/index.js';
import { shellCommand } from '../../../src/device/android/recovery.js';
import { resolveLiveTarget, type LiveCyclePartsOptions, type LiveTarget } from '../live/backend.js';
import { readActivation, readAssignment } from '../live/records.js';
import { rawSha256 } from './digest.js';
import type { Inventory } from './inventory.js';
import type { Platform } from './manifest.js';

/** Why a capture was not taken or not kept. Every one of these is decided before a file is written. */
export type CaptureRefusalCode = 'platform-mismatch' | 'unknown-screen' | 'activation-outside-window' | 'would-overwrite' | 'xml-rejected';

export class CaptureRefusal extends Error {
  constructor(readonly code: CaptureRefusalCode, message: string) {
    super(message);
    this.name = 'CaptureRefusal';
  }
}

export interface TakeCaptureInput {
  /** The owner's device assignment record. */
  assignment: string;
  /** The owner's store activation record: a capture opens the real per-user admission store. */
  activation: string;
  /** The device the assignment names: a simulator UDID, an adb serial or an AVD name. */
  device: string;
  platform: Platform;
  screen: string;
  /** The folder the capture's three files go in. */
  out: string;
  /** What was installed and where it came from, as the manifest will record it. */
  appBuild: string;
  inventory: Inventory;
}

/** What `identity.json` holds: the fields the kit's attach takes, and the evidence around them. */
export interface CaptureIdentity {
  version: 1;
  screenId: string;
  platform: Platform;
  category: string;
  /** The assignment's device, which is what attach records. */
  device: string;
  /** The simulator UDID or adb serial the session ran on. */
  resolvedDevice: string;
  os: string;
  appBuild: string;
  appId: { observed: string | null; expected: string };
  sessionId: string;
  capturedAt: string;
  stack: StackProvenance;
  assignmentSha256: string;
  activationSha256: string;
  files: { xml: CaptureFile; png: CaptureFile };
}
interface CaptureFile { name: string; sha256: string; bytes: number }

/** The OS of the device a session ran on, read with no effect on the device. */
export type OsReader = (live: LiveTarget, signal: AbortSignal) => Promise<string>;

export interface TakeCaptureDeps {
  cwd: string;
  now: () => Date;
  signal: AbortSignal;
  /** The product, probe, host, admission and adb of the live run; the built and production ones unless a test injects its own. */
  live?: Omit<LiveCyclePartsOptions, 'category' | 'device' | 'signal'>;
  readOs?: OsReader;
}

const CLOSE_MS = 60_000;

/** Read-only: the simulator's runtime and Xcode from the host, or the phone's Android release and API level from `getprop`. */
const hostOs: OsReader = async (live, signal) => {
  const { resolved } = live;
  if (resolved.category === 'ios-simulator') {
    const versions = await hostVersions(hostRun)({ device: resolved.value, deviceSet: resolved.deviceSet }, signal);
    return `iOS ${versions.iosVersion ?? 'unknown'}; Xcode ${versions.xcodeVersion ?? 'unknown'}`;
  }
  const run = live.product.adbRunner({ adb: live.adb, environment: live.product.adbEnvironment(process.env) });
  const read = async (property: string) => {
    const reply = await run(shellCommand(resolved.transport.serial, ['getprop', property]), signal);
    return reply.exitCode === 0 ? reply.stdout.trim() || 'unknown' : 'unknown';
  };
  return `Android ${await read('ro.build.version.release')} (API ${await read('ro.build.version.sdk')})`;
};

/** The app in front, as the page source names it: an iOS application's bundle id, or the first Android package. */
export function observedAppId(platform: Platform, xml: string): string | null {
  const pattern = platform === 'ios' ? /<XCUIElementTypeApplication\b[^>]*?\sbundleId="([^"]+)"/ : /<(?!hierarchy\b)[^\s>]+\b[^>]*?\spackage="([^"]+)"/;
  return pattern.exec(xml)?.[1] ?? null;
}

const files = (out: string, screen: string) => ({ xml: join(out, `${screen}.xml`), png: join(out, `${screen}.png`), identity: join(out, `${screen}.identity.json`) });

/**
 * One fresh capture of the screen now in front on the assigned device: a private session through the production
 * stack and admission, one page source and screenshot pair, then the session closed. It launches, resets and
 * terminates nothing, and it keeps the capture only when the production normalizer accepts the page source.
 */
export async function takeCapture(input: TakeCaptureInput, deps: TakeCaptureDeps): Promise<CaptureIdentity> {
  const assignment = await readAssignment(input.assignment, { cwd: deps.cwd, now: deps.now(), device: input.device });
  const activation = await readActivation(input.activation, { cwd: deps.cwd });
  const at = deps.now().getTime();
  if (at < Date.parse(activation.record.window.from) || at >= Date.parse(activation.record.window.until)) {
    throw new CaptureRefusal('activation-outside-window', `The activation record's window is ${activation.record.window.from} to ${activation.record.window.until}; now is outside it.`);
  }
  const category = assignment.record.category;
  if ((category === 'ios-simulator') !== (input.platform === 'ios')) {
    throw new CaptureRefusal('platform-mismatch', `The assignment names ${category}, which is not an ${input.platform} device.`);
  }
  const screen = input.inventory.screens.find(item => item.platform === input.platform && item.screenId === input.screen);
  if (!screen) throw new CaptureRefusal('unknown-screen', `The corpus has no ${input.platform} screen ${input.screen}.`);

  const out = resolve(deps.cwd, input.out);
  const path = files(out, input.screen);
  for (const file of Object.values(path)) {
    if (existsSync(file)) throw new CaptureRefusal('would-overwrite', `${file} exists; a capture is never overwritten. Take it again into another folder.`);
  }

  const live = await resolveLiveTarget({ ...deps.live, category, device: assignment.record.device, signal: deps.signal });
  const os = await (deps.readOs ?? hostOs)(live, deps.signal);
  const driver = new live.product.ComposedAppiumDriver({ host: live.host, admission: live.admission, runId: `corpus-${randomUUID()}`, target: async () => live.target });
  let pair: RawScreenPair | undefined;
  let failure: unknown;
  try { pair = await driver.capturePair(deps.signal); } catch (error) { failure = error; }
  const capturedAt = deps.now();
  const stack = failure === undefined ? driver.provenance() : undefined;
  try { await driver.close(AbortSignal.timeout(CLOSE_MS)); } catch (error) { failure ??= error; }
  if (failure !== undefined) throw failure;
  if (!pair || !stack) throw new Error('The session returned no capture.');

  try { normalizeSource(input.platform, pair.xml); }
  catch { throw new CaptureRefusal('xml-rejected', 'The production normalizer rejects this page source, so nothing was kept. Check the right app is in front.'); }

  const xml = Buffer.from(pair.xml, 'utf8');
  const entry = (name: string, bytes: Buffer): CaptureFile => ({ name, sha256: rawSha256(bytes), bytes: bytes.length });
  const identity: CaptureIdentity = {
    version: 1, screenId: input.screen, platform: input.platform, category, device: assignment.record.device, resolvedDevice: live.resolved.value, os,
    appBuild: input.appBuild, appId: { observed: observedAppId(input.platform, pair.xml), expected: screen.app.id }, sessionId: pair.sessionId,
    capturedAt: capturedAt.toISOString(), stack, assignmentSha256: assignment.sha256, activationSha256: activation.sha256,
    files: { xml: entry(`${input.screen}.xml`, xml), png: entry(`${input.screen}.png`, pair.png) },
  };
  mkdirSync(out, { recursive: true, mode: 0o700 });
  const written: string[] = [];
  const keep = async (file: string, bytes: Buffer | string) => {
    await writeFile(file, bytes, { flag: 'wx', mode: 0o600 });
    written.push(file);
    await chmod(file, 0o600);
  };
  try {
    await keep(path.xml, xml);
    await keep(path.png, pair.png);
    await keep(path.identity, `${JSON.stringify(identity, null, 2)}\n`);
  } catch (error) {
    await Promise.all(written.map(file => unlink(file).catch(() => undefined)));
    throw error;
  }
  return identity;
}
