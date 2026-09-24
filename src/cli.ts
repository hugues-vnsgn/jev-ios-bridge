#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { BridgeService } from './service.js';
import { createMcpServer } from './mcp/index.js';
import { createMobileBuildMcpDriver } from './device/index.js';
import { createJevJudge } from './jev/index.js';
import { renderReport } from './report/index.js';

async function main(): Promise<void> {
  const [command, argument] = process.argv.slice(2);
  if (command === '--help' || !command) {
    console.log('jev-ios-bridge mcp | run <scenario.json> | report <run-id>\nSet TYPESAFE_API_KEY and JEV_DEVICE_UDID. Optional JEV_RUNS_DIR selects the local evidence directory.');
    return;
  }
  if (command === '--version') { console.log('0.1.0'); return; }
  const service = new BridgeService({
    baseDir: process.env.JEV_RUNS_DIR ?? join(process.cwd(), '.jev-runs'),
    createDriver: () => createMobileBuildMcpDriver({ cwd: process.cwd(),
      ...(process.env.JEV_DEVICE_UDID ? { defaultUdid: process.env.JEV_DEVICE_UDID } : {}),
      capture: 'full', screenshots: true }),
    createJudge: () => createJevJudge(),
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
      console.log(`Status: ${status.state}\n${renderReport(status.report)}`);
    } else if (command === 'run' && argument) {
      const { runId, watchUrl } = await service.start(JSON.parse(await readFile(resolve(argument), 'utf8')));
      console.error(`Watch: ${watchUrl}`);
      while (!closing) {
        await new Promise(done => setTimeout(done, 500));
        const { state, report } = await service.status(runId);
        if (state !== 'running') {
          console.log(renderReport(report));
          process.exitCode = report.verdict === 'passed' ? 0 : report.verdict === 'failed' ? 1 : 2;
          break;
        }
      }
    } else { throw new Error('Unknown command'); }
  } finally { await close(); }
}
main().catch(() => { console.error('Bridge could not start. Check arguments, scenario, and environment.'); process.exitCode = 2; });
