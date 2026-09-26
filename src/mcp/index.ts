import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod/v4';
import { scriptedScenarioSchema } from '../scripted/schema.js';
import { BridgeService, startLimitsSchema } from '../service.js';
import { renderScriptedReport } from '../scripted/report.js';
import { BRIDGE_VERSION } from '../version.js';

const idInput = z.object({ runId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/) });
const result = (text: string) => ({ content: [{ type: 'text' as const, text }] });
const failed = () => ({ ...result('Bridge operation failed. Check the run id and local configuration.'), isError: true });

export function createMcpServer(service: BridgeService): McpServer {
  const server = new McpServer({ name: 'jev-ios-bridge', version: BRIDGE_VERSION });
  server.registerTool('start_scenario', {
    description: 'Start an explicit iOS action script with assertion checkpoints. Returns a run id, a local watch URL, and logsCommand, a terminal command that follows the app\'s own output live (a log pane window usually opens by itself). Poll get_report for completion; use cancel_run to stop. TypeSafe receives observed screen text and current assertion claims. Typed values go to device actions and may later appear in screen text; screenshots stay local.',
    inputSchema: z.object({ scenario: scriptedScenarioSchema, limits: startLimitsSchema.optional() }),
  }, async ({ scenario, limits }) => {
    try { return result(JSON.stringify(await service.start(scenario, limits))); } catch { return failed(); }
  });
  server.registerTool('get_report', {
    description: 'Wait up to waitMs (maximum 45000) for a run. Running results contain progress only; completion returns the evidence report. Cancelling this wait does not cancel the run; use cancel_run to stop it.',
    inputSchema: idInput.extend({ waitMs: z.number().int().min(0).max(45000).optional() }),
    annotations: { readOnlyHint: true },
  }, async ({ runId, waitMs }, ctx) => {
    try {
      const { state, report } = await service.status(runId, waitMs, ctx.mcpReq.signal);
      if (state === 'running') return result(`Status: running\nRun: ${runId}\nRecorded steps: ${report.steps}. Call get_report with waitMs: 45000 to wait for completion.`);
      return result(`Status: ${state}\n${renderScriptedReport(report)}\nFull local evidence: ${service.baseDir}/${runId}/run.jsonl`);
    } catch { return failed(); }
  });
  server.registerTool('cancel_run', {
    description: 'Cancel a run and wait for its inconclusive verdict and device cleanup.', inputSchema: idInput,
  }, async ({ runId }) => {
    try { await service.cancel(runId); return result(`Run ${runId} stopped.`); } catch { return failed(); }
  });
  return server;
}
