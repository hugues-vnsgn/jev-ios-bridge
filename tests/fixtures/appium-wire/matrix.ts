import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import type { AppiumDriverOptions } from '../../../src/appium/driver.js';
import type { DeviceDriver } from '../../../src/contracts/index.js';
import type { Admission, DeviceIdentity } from '../../../src/device/admission.js';
import type { AdbRunner } from '../../../src/device/android/adb.js';
import { identityProbe } from '../../../src/device/android/probe.js';
import { BridgeService } from '../../../src/service.js';
import { fakeProbeSpawn } from '../adb-spawn.js';
import { fakeSimulatorProbe } from '../android-device.js';
import { fakeDrivenJudge, type FakeStep } from '../driven-judge.js';
import { UDID } from './driver-fixture.js';

export const SERIAL = 'PHONE123';
export const IOS_DEVICE: DeviceIdentity = { category: 'ios-simulator', value: UDID };
export const ANDROID_DEVICE: DeviceIdentity = { category: 'android-phone', value: SERIAL };
export const iosTarget = { target: { platform: 'ios', device: UDID, presentation: 'visible' }, identityProbe: fakeSimulatorProbe(UDID) } satisfies Partial<AppiumDriverOptions>;

const keyguard = (showing: boolean) => `WINDOW MANAGER POLICY STATE\n    KeyguardServiceDelegate\n      showing=${String(showing)}\n      interactiveState=INTERACTIVE_STATE_AWAKE\n`;
const procStat = (pid: number) => `${String(pid)} (app_process) S ${'0 '.repeat(18)}424242 0 0`;
/** A USB phone whose transport the test can take away, with two UiAutomator2 processes for the fence to find. */
export function androidTarget(device = { state: 'device' }) {
  const probe = identityProbe({ adb: '/fake/adb', environment: {}, host: { listener: async () => { throw new Error('no emulator'); }, directory: async () => { throw new Error('no emulator'); } } as never,
    spawn: fakeProbeSpawn((_file, args) => args[0] === 'devices' ? `List of devices attached\n${SERIAL} ${device.state}\n` : `${SERIAL}\n`).spawn });
  const adb: AdbRunner = async args => {
    const line = args.at(-1) ?? '';
    if (line.includes('pidof')) return { stdout: '5001 5002\n', stderr: '', exitCode: 0 };
    const pid = /\/proc\/(\d+)\/stat/.exec(line)?.[1];
    return pid ? { stdout: procStat(Number(pid)), stderr: '', exitCode: 0 } : { stdout: '', stderr: 'unexpected', exitCode: 1 };
  };
  return { device, options: { target: { platform: 'android', device: SERIAL, category: 'android-phone', serverInstallation: { kind: 'install' } }, identityProbe: probe, adb, freePort: async () => 18200 } satisfies Partial<AppiumDriverOptions>,
    nativeReply: (command: { kind: string }) => command.kind === 'android-keyguard' ? keyguard(false) : command.kind === 'android-wake' ? '' : undefined };
}

export const passingJudge = { async judge(assertions: { id: string }[]) {
  return { probabilities: Object.fromEntries(assertions.map(assertion => [assertion.id, 0.97])), inputTokens: 1, latencyMs: 1, model: 'jev-1.13.0' };
} };

/** The real bridge service over the given drivers, one per started run, with driven mode opted in and fake Jev. */
export async function bridge(t: TestContext, drivers: DeviceDriver[], jev: FakeStep[] = []) {
  const root = await mkdtemp(join(tmpdir(), 'appium-matrix-'));
  const projectDir = join(root, 'project');
  await mkdir(join(projectDir, '.jev'), { recursive: true });
  await writeFile(join(projectDir, '.jev', 'config.json'), JSON.stringify({ drivenMode: true }));
  const queue = [...drivers];
  const service = new BridgeService({ baseDir: join(root, 'runs'), createDriver: () => queue.shift()!,
    env: { JEV_PROJECT_DIR: projectDir, JEV_EXPERIMENTAL_DRIVEN: '1' }, createJudge: () => passingJudge,
    createDrivenJudge: () => fakeDrivenJudge(jev) });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const finished = async (runId: string) => {
    for (let waited = 0; waited < 60_000; waited += 45_000) {
      const status = await service.status(runId, 45_000);
      if (status.state === 'finished') return status;
    }
    throw new Error('run did not finish');
  };
  return { root, service, finished, runDir: (runId: string) => join(service.baseDir, runId) };
}

/** The device operations the admission authorized for one run's owner, counted by name. Fence reads are left out:
 *  their number follows the components the fake fence reports, and their effects are pinned on the fence itself. */
export function authorized(admission: Admission, attemptId: string): Record<string, number> {
  const owner = admission.readAttempt({ kind: 'legacy', id: attemptId })!.owner;
  const counts: Record<string, number> = {};
  for (const command of admission.readGeneration(owner).commands) {
    if (command.operation !== 'appium-fence') counts[command.operation] = (counts[command.operation] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

/** Every file under `root` whose bytes contain `needle`, skipping the fake provider's own request trace. */
export async function filesContaining(root: string, needle: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (directory: string): Promise<void> => {
    for (const name of await readdir(directory)) {
      const path = join(directory, name);
      if (/^(trace-\d+\.jsonl|world-\d+\.json)/.test(name)) continue;
      if ((await stat(path)).isDirectory()) await walk(path);
      else if ((await readFile(path)).includes(needle)) found.push(path);
    }
  };
  await walk(root);
  return found;
}
