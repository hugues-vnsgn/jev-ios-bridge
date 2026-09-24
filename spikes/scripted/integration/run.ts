#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DeviceDriver } from '../../../src/contracts/index.js';
import { createMobileBuildMcpDriver } from '../../../src/device/index.js';
import { createRunLog } from '../../../src/log/index.js';
import type { ScriptedJudge, ScriptedScenario } from '../contracts.js';
import { implementationDigest } from '../harness.js';
import { createAssertionJudge, SCRIPTED_JEV_MODEL } from '../jev.js';
import { buildScriptedReport, renderScriptedReport } from '../report.js';
import { runScriptedScenario } from '../run.js';
import { parseScriptedScenario } from '../schema.js';

const dedicatedUdid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export interface IntegrationArgs {
  scenarioPath: string;
  deviceUdid: string;
  out: string;
  maxSteps: number;
  timeoutMs: number;
}

/** Require a concrete benchmark simulator and explicit whole-run budgets. */
export function parseIntegrationArgs(argv: string[]): IntegrationArgs {
  const [scenarioPath, ...rest] = argv;
  if (!scenarioPath || scenarioPath.startsWith('--') || rest.length % 2 !== 0) throw new Error('INVALID_ARGUMENTS');
  const flags: Record<string, string> = {};
  for (let index = 0; index < rest.length; index += 2) {
    const name = rest[index]!, value = rest[index + 1]!;
    if (!name.startsWith('--') || !value || value.startsWith('--') || Object.hasOwn(flags, name.slice(2))) {
      throw new Error('INVALID_ARGUMENTS');
    }
    flags[name.slice(2)] = value;
  }
  if (Object.keys(flags).some(name => !['device-udid', 'out', 'max-steps', 'timeout-ms'].includes(name))) {
    throw new Error('INVALID_ARGUMENTS');
  }
  const deviceUdid = flags['device-udid'];
  const out = flags.out;
  if (!deviceUdid || !dedicatedUdid.test(deviceUdid) || !out) throw new Error('DEDICATED_DEVICE_AND_OUTPUT_REQUIRED');
  const maxSteps = flags['max-steps'] === undefined ? 100 : Number(flags['max-steps']);
  const timeoutMs = flags['timeout-ms'] === undefined ? 900_000 : Number(flags['timeout-ms']);
  if (!Number.isSafeInteger(maxSteps) || maxSteps < 1 || maxSteps > 100 ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3_600_000) {
    throw new Error('INVALID_LIMITS');
  }
  return { scenarioPath: resolve(scenarioPath), deviceUdid: deviceUdid.toUpperCase(),
    out: resolve(out), maxSteps, timeoutMs };
}

function sha256(bytes: Buffer | string): string { return createHash('sha256').update(bytes).digest('hex'); }

const phaseKeys = ['prepareMs', 'observeMs', 'decideMs', 'actMs', 'waitMs', 'cleanupMs'] as const;

function recordedPhaseTimings(value: unknown): Record<(typeof phaseKeys)[number], number> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const fields = value as Record<string, unknown>;
  if (phaseKeys.some(key => typeof fields[key] !== 'number' || !Number.isFinite(fields[key]) || fields[key] < 0)) return null;
  return Object.fromEntries(phaseKeys.map(key => [key, fields[key]])) as Record<(typeof phaseKeys)[number], number>;
}

async function runtimeDigest(): Promise<string> {
  const sources = [
    new URL('../../../package.json', import.meta.url),
    new URL('../../../package-lock.json', import.meta.url),
    new URL('../../../src/contracts/index.ts', import.meta.url),
    new URL('../../../src/device/index.ts', import.meta.url),
    new URL('../../../src/log/index.ts', import.meta.url),
    new URL('../contracts.ts', import.meta.url),
    new URL('../schema.ts', import.meta.url),
    new URL('../select.ts', import.meta.url),
    new URL('../observe.ts', import.meta.url),
    new URL('../jev.ts', import.meta.url),
    new URL('../run.ts', import.meta.url),
    new URL('../report.ts', import.meta.url),
    new URL('./run.ts', import.meta.url),
  ];
  const hash = createHash('sha256');
  for (const source of sources) hash.update(await readFile(source));
  return hash.digest('hex');
}

function gitHead(): string | undefined {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: process.cwd(), encoding: 'utf8' }).trim(); }
  catch { return undefined; }
}

export interface IntegrationPorts {
  createDriver?: (udid: string) => DeviceDriver;
  createJudge?: () => ScriptedJudge;
  signal?: AbortSignal;
}

export interface IntegrationOutcome {
  runId: string;
  verdict: 'passed' | 'failed' | 'inconclusive';
  runDirectory: string;
  reportPath: string;
  metricsPath: string;
  provenancePath: string;
}

/** One submitted script; no host decisions or Jev Choice calls within the run. */
export async function runIntegration(args: IntegrationArgs, ports: IntegrationPorts = {}): Promise<IntegrationOutcome> {
  const scenarioBytes = await readFile(args.scenarioPath);
  const parsed = parseScriptedScenario(JSON.parse(scenarioBytes.toString('utf8')));
  if (parsed.device?.udid && parsed.device.udid.toUpperCase() !== args.deviceUdid) throw new Error('DEVICE_MISMATCH');
  const scenario: ScriptedScenario = { ...parsed, device: { udid: args.deviceUdid } };
  // Constructing the default judge checks for a key before allocating a run or touching a device.
  const judge = ports.createJudge?.() ?? createAssertionJudge();
  const tapAliasRule = ports.createDriver ? undefined : 'mobilebuildmcp-2.7.1' as const;
  const driver = ports.createDriver?.(args.deviceUdid) ?? createMobileBuildMcpDriver({
    cwd: process.cwd(), defaultUdid: args.deviceUdid,
    capture: 'full', screenshots: true, stopAppOnClose: true,
  });
  const runId = randomUUID();
  const log = await createRunLog(args.out, runId, { values: Object.values(scenario.values) });
  const runDirectory = join(args.out, runId);
  const provenancePath = join(runDirectory, 'provenance.json');
  const reportPath = join(runDirectory, 'report.md');
  const metricsPath = join(runDirectory, 'metrics.json');
  const head = gitHead();
  const provenance = {
    version: 1, startedAt: new Date().toISOString(), runId,
    scenarioPath: args.scenarioPath, scenarioSha256: sha256(scenarioBytes),
    bundleId: scenario.app.bundleId, deviceUdid: args.deviceUdid,
    model: SCRIPTED_JEV_MODEL, mobileBuildMcpVersion: '2.7.1',
    tapAliasRule: tapAliasRule ?? 'strict',
    assertionImplementationSha256: implementationDigest(), scriptedRuntimeSha256: await runtimeDigest(),
    ...(head ? { gitHead: head } : {}),
    nodeVersion: process.version, maxSteps: args.maxSteps, timeoutMs: args.timeoutMs,
    timingScope: 'Prepared-app scripted UI execution; app build, install, data setup and script authoring excluded',
  };
  await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  const report = await runScriptedScenario({ runId, scenario, driver, judge, log,
    ...(ports.signal ? { signal: ports.signal } : {}),
    ...(tapAliasRule ? { tapAliasRule } : {}),
    limits: { maxSteps: args.maxSteps, wallTimeMs: args.timeoutMs } });
  const recorded = buildScriptedReport(await log.read());
  const verdictEvent = recorded.events.findLast(event => event.type === 'verdict');
  const deviceMetrics = verdictEvent?.data.deviceMetrics;
  const phaseTimingsMs = recordedPhaseTimings(verdictEvent?.data.phaseTimingsMs);
  const metrics = {
    version: 1, runId, verdict: report.verdict, reason: report.reason,
    durationMs: report.durationMs, steps: report.steps, inputTokens: report.inputTokens,
    phaseTimingsMs,
    checkpointCount: scenario.steps.filter(step => step.kind === 'checkpoint').length,
    checkpointResults: recorded.checkpoints.map(({ stepId, status }) => ({ stepId, status })),
    actionEvents: recorded.events.filter(event => event.type === 'action').length,
    judgmentEvents: recorded.events.filter(event => event.type === 'judgment').length,
    captureEvents: recorded.events.filter(event => event.type === 'step').length,
    errorEvents: recorded.events.filter(event => event.type === 'error').length,
    jevLatencyMs: recorded.events.filter(event => event.type === 'judgment')
      .reduce((total, event) => total + (typeof event.data.latencyMs === 'number' ? event.data.latencyMs : 0), 0),
    ...(deviceMetrics && typeof deviceMetrics === 'object' ? { deviceMetrics } : {}),
  };
  await writeFile(reportPath, `${renderScriptedReport(recorded)}\n`, { flag: 'wx', mode: 0o600 });
  await writeFile(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return { runId, verdict: report.verdict, runDirectory, reportPath, metricsPath, provenancePath };
}

async function main(): Promise<void> {
  const args = parseIntegrationArgs(process.argv.slice(2));
  const abort = new AbortController();
  const cancel = () => abort.abort();
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  try {
    const outcome = await runIntegration(args, { signal: abort.signal });
    process.stdout.write(`Run ${outcome.runId}: ${outcome.verdict}\nReport: ${outcome.reportPath}\nMetrics: ${outcome.metricsPath}\nProvenance: ${outcome.provenancePath}\n`);
    process.exitCode = outcome.verdict === 'passed' ? 0 : outcome.verdict === 'failed' ? 1 : 2;
  } finally {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { process.stderr.write('Scripted integration could not start. Check scenario, key, device, and output setup.\n'); process.exitCode = 2; });
}
