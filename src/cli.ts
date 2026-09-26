#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod/v4';
import { BridgeService } from './service.js';
import { createMcpServer } from './mcp/index.js';
import { createMobileBuildMcpDriver, DeviceCliError, selectDeviceId } from './device/index.js';
import { createAssertionJudge } from './scripted/jev.js';
import { renderScriptedReport } from './scripted/report.js';
import { parseScriptedScenario } from './scripted/schema.js';
import type { Verdict } from './contracts/index.js';
import { BRIDGE_VERSION } from './version.js';

/** Frozen CLI exit codes (ADR-0005). Signals exit 130 (SIGINT) and 143 (SIGTERM). */
const EXIT = { passed: 0, failed: 1, inconclusive: 2, couldNotStart: 3 } as const;

const USAGE = `jev-ios-bridge ${BRIDGE_VERSION}
Usage:
  jev-ios-bridge run <script.json> [--json] [--max-steps N] [--timeout-ms N]
  jev-ios-bridge report <run-id> [--json]
  jev-ios-bridge mcp
  jev-ios-bridge --version | --help
Set TYPESAFE_API_KEY and a dedicated simulator (JEV_DEVICE_UDID, the script's device.udid, or
.mobilebuildmcp/config.yaml). JEV_RUNS_DIR selects the evidence directory (default ./.jev-runs).
Exit codes: 0 passed, 1 failed, 2 inconclusive, 3 could not start.`;

/** A problem found before any run started. The message is safe to print. */
class StartError extends Error {}

const exitFor = (verdict: Verdict) => EXIT[verdict];

function limitValue(name: string, raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new StartError(`--${name} must be a whole number`);
  return value;
}

async function readScript(path: string): Promise<unknown> {
  let text: string;
  try { text = await readFile(resolve(path), 'utf8'); }
  catch { throw new StartError(`Cannot read script file ${path}`); }
  try { return JSON.parse(text); }
  catch { throw new StartError(`Script file ${path} is not valid JSON`); }
}

async function main(): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({ allowPositionals: true, options: {
      help: { type: 'boolean' }, version: { type: 'boolean' }, json: { type: 'boolean' },
      'max-steps': { type: 'string' }, 'timeout-ms': { type: 'string' },
    } });
  } catch (error) { throw new StartError(`${(error as Error).message}\n${USAGE}`); }
  const [command, argument] = parsed.positionals;
  if (parsed.values.version) { console.log(BRIDGE_VERSION); return; }
  if (parsed.values.help || !command) { console.log(USAGE); return; }
  const expected = command === 'mcp' ? 1 : 2;
  if (!['run', 'report', 'mcp'].includes(command)) throw new StartError(`Unknown command: ${command}\n${USAGE}`);
  if (parsed.positionals.length !== expected) throw new StartError(`Wrong number of arguments for ${command}\n${USAGE}`);
  const limits = {
    ...(parsed.values['max-steps'] === undefined ? {} : { maxSteps: limitValue('max-steps', parsed.values['max-steps']) }),
    ...(parsed.values['timeout-ms'] === undefined ? {} : { wallTimeMs: limitValue('timeout-ms', parsed.values['timeout-ms']) }),
  };
  if (command !== 'run' && Object.keys(limits).length) throw new StartError('Run limits apply only to run');
  if (command === 'mcp' && parsed.values.json) throw new StartError('--json applies only to run and report');

  let script;
  if (command === 'run') {
    script = parseScriptedScenario(await readScript(argument!));
    if (!process.env.TYPESAFE_API_KEY?.trim()) throw new StartError('TYPESAFE_API_KEY is not set; load your .env with node --env-file=/path/to/.env');
    await selectDeviceId(process.cwd(), script.device?.udid, process.env.JEV_DEVICE_UDID);
  }

  const service = new BridgeService({
    baseDir: process.env.JEV_RUNS_DIR ?? join(process.cwd(), '.jev-runs'),
    createDriver: () => createMobileBuildMcpDriver({ cwd: process.cwd(),
      ...(process.env.JEV_DEVICE_UDID ? { defaultUdid: process.env.JEV_DEVICE_UDID } : {}),
      capture: 'full', screenshots: true,
      // Measurement aid for release checks; costs one extra capture per observation.
      ...(process.env.JEV_VERIFY_SCREENSHOT_AGREEMENT === '1' ? { verifyScreenshotAgreement: true } : {}) }),
    createJudge: () => createAssertionJudge(),
    tapAliasRule: 'mobilebuildmcp-2.7.1',
  });
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await service.close();
  };
  process.once('SIGINT', () => { void close().then(() => process.exit(130)); });
  process.once('SIGTERM', () => { void close().then(() => process.exit(143)); });
  if (command === 'mcp') {
    serveStdio(() => createMcpServer(service), { onerror: () => { console.error('MCP transport error'); } });
    process.stdin.once('end', () => { void close(); });
    return;
  }
  const print = async (runId: string) => {
    const { state, report } = await service.status(runId);
    if (parsed.values.json) console.log(JSON.stringify(await service.reportJson(runId), null, 2));
    else console.log(`${command === 'report' ? `Status: ${state}\n` : ''}${renderScriptedReport(report)}\nFull local evidence: ${service.baseDir}/${runId}/run.jsonl`);
    process.exitCode = exitFor(report.verdict);
  };
  try {
    if (command === 'report') {
      try { await service.status(argument!); }
      catch { throw new StartError(`No readable run ${argument} in ${service.baseDir}`); }
      await print(argument!);
      return;
    }
    const { runId, watchUrl } = await service.start(script, limits);
    console.error(`Watch: ${watchUrl}`);
    while (!closing) {
      await new Promise(done => setTimeout(done, 500));
      const { state } = await service.status(runId);
      if (state !== 'running') { await print(runId); break; }
    }
  } finally { await close(); }
}

main().catch((error: unknown) => {
  if (error instanceof z.ZodError) console.error(`Script is invalid:\n${z.prettifyError(error)}`);
  else if (error instanceof StartError || (error instanceof DeviceCliError && ['NO_DEVICE', 'INVALID_DEVICE'].includes(error.code))) {
    console.error(error.message);
  } else console.error('Bridge could not start. Check arguments, script, and environment.');
  process.exitCode = EXIT.couldNotStart;
});
