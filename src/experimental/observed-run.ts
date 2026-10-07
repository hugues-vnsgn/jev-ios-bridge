import { mkdir, readFile, copyFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod/v4';
import type { Snapshot } from '../contracts/index.js';
import { MobileBuildMcpDriver } from '../device/index.js';
import { selectorSchema, screenGuardSchema } from '../scripted/schema.js';
import { ObservedActionJournal } from './observed-journal.js';
import { runObservedTap, type ObservedTapOptions } from './observed-tap.js';

const selector = selectorSchema.transform(value => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)));
const guard = screenGuardSchema.transform(value => ({ present: value.present.map(item => selector.parse(item)),
  ...(value.absent ? { absent: value.absent.map(item => selector.parse(item)) } : {}) }));

export const observedExperimentSchema = z.strictObject({
  experimental: z.literal('observed-tap-v1'),
  actionId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/),
  deviceId: z.string().uuid().transform(value => value.toUpperCase()),
  app: z.strictObject({ bundleId: z.string().regex(/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/) }),
  selector,
  before: guard,
  after: guard,
  timeoutMs: z.number().int().min(100).max(60_000),
});
export type ObservedExperiment = z.infer<typeof observedExperimentSchema>;
export const OBSERVED_JOURNAL_ROOT = join(homedir(), 'Library', 'Application Support', 'jev-ios-bridge', 'observed-actions');

type Driver = ObservedTapOptions['driver'] & Pick<MobileBuildMcpDriver, 'prepare' | 'close'>;

/** Standalone experiment; legacy scripts and Jev verdict semantics are unchanged. */
export async function runObservedExperiment(raw: unknown, evidenceDir: string, options: {
  cwd: string;
  signal?: AbortSignal;
  journalRoot?: string;
  driver?: Driver;
}) {
  const config = observedExperimentSchema.parse(raw);
  // Exclusive directory: a repeat invocation cannot overwrite the prior evidence.
  await mkdir(evidenceDir, { mode: 0o700 });
  await writeFile(join(evidenceDir, 'request.json'), JSON.stringify(config, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  const journal = new ObservedActionJournal(options.journalRoot ?? OBSERVED_JOURNAL_ROOT);
  const driver = options.driver ?? new MobileBuildMcpDriver({ cwd: options.cwd, defaultUdid: config.deviceId,
    capture: 'full', screenshots: true, stopAppOnClose: false, uiCommandTimeoutMs: config.timeoutMs });
  const scenario = { app: config.app, device: { udid: config.deviceId }, values: {} };
  const result = await runObservedTap({
    driver, journal, actionId: config.actionId, deviceId: config.deviceId,
    selector: config.selector, before: config.before, after: config.after, scenario,
    timeoutMs: config.timeoutMs, ...(options.signal ? { signal: options.signal } : {}),
    prepare: signal => driver.prepare(scenario, signal),
    finish: signal => driver.close(signal),
    onResult: async result => {
      await writeFile(join(evidenceDir, 'result.json'), JSON.stringify({ authoritative: false, finalization: 'consult-journal',
        terminalRecord: { root: journal.root, deviceId: config.deviceId, actionId: config.actionId }, result }, null, 2) + '\n',
        { mode: 0o600, flag: 'wx' });
    },
    onObservation: async (snapshot: Snapshot, index: number) => {
      let screenshotPath: string | undefined;
      if (snapshot.screenshotPath) {
        screenshotPath = join(evidenceDir, `observation-${index}.jpg`);
        await copyFile(snapshot.screenshotPath, screenshotPath);
      }
      await writeFile(join(evidenceDir, `observation-${index}.json`),
        JSON.stringify({ ...snapshot, ...(screenshotPath ? { screenshotPath } : {}) }, null, 2) + '\n',
        { mode: 0o600, flag: 'wx' });
    },
  });
  return result;
}

export async function readObservedExperiment(path: string): Promise<unknown> {
  const bytes = await readFile(path);
  if (bytes.length > 64 * 1024) throw new Error('Observed experiment exceeds 64 KiB');
  return JSON.parse(bytes.toString('utf8')) as unknown;
}
