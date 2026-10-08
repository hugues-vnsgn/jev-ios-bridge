import { execFile } from 'node:child_process';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { ActionScenarioContext, Snapshot } from '../../../src/contracts/index.js';
import { deviceEnvironment, MobileBuildMcpDriver, pinnedMobileBuildMcpCli } from '../../../src/device/index.js';
import { OBSERVED_JOURNAL_ROOT, readObservedExperiment, runObservedExperiment } from '../../../src/experimental/observed-run.js';
import { ObservedActionJournal } from '../../../src/experimental/observed-journal.js';

const [mode, configPath, evidencePath] = process.argv.slice(2);
if (!mode || !configPath || !evidencePath || !['run', 'drop-reply', 'successor'].includes(mode)) {
  console.error('Usage: recorded-runner.ts <run|drop-reply|successor> <experiment.json> <new-evidence-directory>');
  process.exitCode = 2;
} else {
  const repoRoot = resolve(process.cwd());
  const evidenceDir = resolve(evidencePath);
  const config = await readObservedExperiment(resolve(configPath)) as {
    deviceId: string; actionId: string; app: { bundleId: string }; timeoutMs: number;
  };
  const records: Array<{ sequence: number; argv: string[]; exitCode: number; stdout: string; stderr: string; responsePath: string }> = [];
  let sequence = 0;
  const runner = (args: string[], signal: AbortSignal) => new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolveResult, reject) => {
    const current = ++sequence;
    const safeName = args.slice(0, 3).filter(value => !value.startsWith('{')).join('-').replace(/[^A-Za-z0-9_-]/g, '_');
    const responsePath = join(evidenceDir, 'backend', `${String(current).padStart(2, '0')}-${safeName}.json`);
    execFile(process.execPath, [pinnedMobileBuildMcpCli(), ...args], {
      cwd: repoRoot,
      env: deviceEnvironment(process.env),
      signal,
      maxBuffer: 8 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      void (async () => {
        await mkdir(join(evidenceDir, 'backend'), { recursive: true });
        const exitCode = error && 'code' in error && typeof error.code === 'number' ? error.code : error ? 1 : 0;
        records.push({ sequence: current, argv: [process.execPath, pinnedMobileBuildMcpCli(), ...args], exitCode,
          stdout, stderr, responsePath });
        await writeFile(responsePath, JSON.stringify({ sequence: current, argv: records.at(-1)!.argv, exitCode, stdout, stderr }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
        if (error && (error as NodeJS.ErrnoException).code === 'ABORT_ERR') reject(error);
        else resolveResult({ stdout, stderr, exitCode });
      })().catch(reject);
    });
  });
  const realDriver = new MobileBuildMcpDriver({ cwd: repoRoot, defaultUdid: config.deviceId,
    capture: 'full', screenshots: true, stopAppOnClose: false, uiCommandTimeoutMs: config.timeoutMs, runner });
  const driver = {
    prepare: (scenario: Parameters<typeof realDriver.prepare>[0], signal: AbortSignal) => realDriver.prepare(scenario, signal),
    close: (signal: AbortSignal) => realDriver.close(signal),
    observe: (signal: AbortSignal) => realDriver.observe(signal),
    tapOnce: async (ref: string, snapshot: Snapshot, scenario: ActionScenarioContext, signal: AbortSignal) => {
      const response = await realDriver.tapOnce(ref, snapshot, scenario, signal);
      if (mode === 'drop-reply') {
        const after = await realDriver.observe(signal);
        if (!after.screenshotPath) throw new Error('CONTROLLED_REPLY_DROP_MISSING_POST_SCREENSHOT');
        await copyFile(after.screenshotPath, join(evidenceDir, 'reply-drop-after.jpg'));
        await writeFile(join(evidenceDir, 'reply-drop-after.json'), JSON.stringify(after, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
        throw new Error('CONTROLLED_REPLY_DROP_AFTER_REAL_MOBILEBUILDMCP_RESPONSE');
      }
      return response;
    },
  };
  let result: unknown;
  let thrown: { name: string; message: string } | undefined;
  const startedAt = new Date().toISOString();
  try {
    result = await runObservedExperiment(config, evidenceDir, { cwd: repoRoot, driver });
  } catch (error) {
    thrown = { name: error instanceof Error ? error.name : 'UnknownError', message: error instanceof Error ? error.message : String(error) };
  }
  const journal = new ObservedActionJournal(OBSERVED_JOURNAL_ROOT);
  const terminal = await journal.read(config.deviceId, config.actionId).catch(() => undefined);
  const deviceStatus = await journal.deviceStatus(config.deviceId).catch(() => 'unreadable' as const);
  await mkdir(join(evidenceDir, 'backend'), { recursive: true });
  await writeFile(join(evidenceDir, 'backend-commands.json'), JSON.stringify({ commands: records.map(({ sequence, argv, exitCode, responsePath }) =>
    ({ sequence, argv, exitCode, responsePath })), mobilebuildmcpCommands: records.length,
    touchCommands: records.filter(record => record.argv.includes('touch') && record.argv.includes('ui-automation')).length,
    tapCommands: records.filter(record => record.argv.includes('tap') && record.argv.includes('ui-automation')).length }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  const outcome = { mode, startedAt, finishedAt: new Date().toISOString(), result, thrown,
    mobilebuildmcpCommands: records.length,
    touchCommands: records.filter(record => record.argv.includes('touch') && record.argv.includes('ui-automation')).length,
    tapCommands: records.filter(record => record.argv.includes('tap') && record.argv.includes('ui-automation')).length,
    terminalRecord: terminal, deviceStatus };
  await writeFile(join(evidenceDir, 'harness-outcome.json'), JSON.stringify(outcome, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ mode, result, thrown, mobilebuildmcpCommands: outcome.mobilebuildmcpCommands,
    touchCommands: outcome.touchCommands, tapCommands: outcome.tapCommands, terminalStatus: terminal?.status, deviceStatus }));
  const expected = mode === 'run'
    ? (result as { status?: string } | undefined)?.status === 'outcome_observed' || (result as { status?: string } | undefined)?.status === 'already_satisfied'
    : mode === 'drop-reply'
      ? (result as { status?: string } | undefined)?.status === 'inconclusive' && outcome.touchCommands === 1
      : Boolean(thrown?.message.includes('quarantined')) && records.length === 0 && deviceStatus === 'quarantined';
  process.exitCode = expected ? 0 : 2;
}
