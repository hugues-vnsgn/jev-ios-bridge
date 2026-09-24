import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod/v4';
import { scenarioSchema } from '../scenario/index.js';
import { BridgeService } from '../service.js';
import { renderReport } from '../report/index.js';

const idInput = z.object({ runId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/) });
const result = (text: string) => ({ content: [{ type: 'text' as const, text }] });
const failed = () => ({ ...result('Bridge operation failed. Check the run id and local configuration.'), isError: true });

export function createMcpServer(service: BridgeService): McpServer {
  const server = new McpServer({ name: 'jev-ios-bridge', version: '0.1.0' });
  server.registerTool('start_scenario', {
    description: 'Start an iOS verification scenario. Returns a run id and local watch URL. Poll get_report for completion; use cancel_run to stop. Screen text and supplied values are sent to TypeSafe.',
    inputSchema: z.object({ scenario: scenarioSchema }),
  }, async ({ scenario }) => {
    try { return result(JSON.stringify(await service.start(scenario))); } catch { return failed(); }
  });
  server.registerTool('get_report', {
    description: 'Read the current status and recorded evidence for a run. No device interaction.',
    inputSchema: idInput,
    annotations: { readOnlyHint: true },
  }, async ({ runId }) => {
    try {
      const { state, report } = await service.status(runId);
      return result(`Status: ${state}\n${renderReport(report)}`);
    } catch { return failed(); }
  });
  server.registerTool('cancel_run', {
    description: 'Cancel a run and wait for its inconclusive verdict and device cleanup.', inputSchema: idInput,
  }, async ({ runId }) => {
    try { await service.cancel(runId); return result(`Run ${runId} stopped.`); } catch { return failed(); }
  });
  return server;
}
