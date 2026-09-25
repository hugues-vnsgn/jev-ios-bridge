#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { BridgeService } from './service.js';
import { createMcpServer } from './mcp/index.js';
import { createMobileBuildMcpDriver } from './device/index.js';
import { createAssertionJudge } from './scripted/jev.js';
import { renderScriptedReport } from './scripted/report.js';

async function main(): Promise<void> {
  const parsed = parseArgs({ allowPositionals: true, options: {
    help: { type: 'boolean' }, version: { type: 'boolean' },
    'max-steps': { type: 'string' }, 'timeout-ms': { type: 'string' },
  } });
  const [command, argument] = parsed.positionals;
  if (parsed.values.help || (!command && !parsed.values.version)) {
    console.log('jev-ios-bridge mcp | run <script.json> [--max-steps N] [--timeout-ms N] | report <run-id>\nSet TYPESAFE_API_KEY and JEV_DEVICE_UDID. Optional JEV_RUNS_DIR selects the local evidence directory.');
    return;
  }
  if (parsed.values.version) { console.log('0.1.0'); return; }
  if (parsed.positionals.length > (command === 'mcp' ? 1 : 2)) throw new Error('Unexpected arguments');
  const limits = {
    ...(parsed.values['max-steps'] === undefined ? {} : { maxSteps: Number(parsed.values['max-steps']) }),
    ...(parsed.values['timeout-ms'] === undefined ? {} : { wallTimeMs: Number(parsed.values['timeout-ms']) }),
  };
  if (command !== 'run' && Object.keys(limits).length) throw new Error('Run limits apply only to run');
  const service = new BridgeService({
    baseDir: process.env.JEV_RUNS_DIR ?? join(process.cwd(), '.jev-runs'),
    createDriver: () => createMobileBuildMcpDriver({ cwd: process.cwd(),
      ...(process.env.JEV_DEVICE_UDID ? { defaultUdid: process.env.JEV_DEVICE_UDID } : {}),
      capture: 'full', screenshots: true }),
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
  try {
    if (command === 'report' && argument) {
      const status = await service.status(argument);
      console.log(`Status: ${status.state}\n${renderScriptedReport(status.report)}\nFull local evidence: ${service.baseDir}/${argument}/run.jsonl`);
    } else if (command === 'run' && argument) {
      const { runId, watchUrl } = await service.start(JSON.parse(await readFile(resolve(argument), 'utf8')), limits);
      console.error(`Watch: ${watchUrl}`);
      while (!closing) {
        await new Promise(done => setTimeout(done, 500));
        const { state, report } = await service.status(runId);
        if (state !== 'running') {
          console.log(`${renderScriptedReport(report)}\nFull local evidence: ${service.baseDir}/${runId}/run.jsonl`);
          process.exitCode = report.verdict === 'passed' ? 0 : report.verdict === 'failed' ? 1 : 2;
          break;
        }
      }
    } else { throw new Error('Unknown command'); }
  } finally { await close(); }
}
main().catch(() => { console.error('Bridge could not start. Check arguments, scenario, and environment.'); process.exitCode = 2; });
