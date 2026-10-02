import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod/v4';
import { scriptedScenarioSchema, ScriptValueError } from '../scripted/schema.js';
import { BridgeService, drivenStartLimitsSchema, startLimitsSchema } from '../service.js';
import { handbackAnswerSchema, HandbackAnswerError, renderPause } from '../driven/handback.js';
import { DrivenProjectError } from '../driven/project.js';
import { renderScriptedReport } from '../scripted/report.js';
import { BRIDGE_VERSION } from '../version.js';

const idInput = z.object({ runId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/) });
const result = (text: string) => ({ content: [{ type: 'text' as const, text }] });
const failed = (message = 'Bridge operation failed. Check the run id and local configuration.') =>
  ({ ...result(message), isError: true });

const RESOLVE_STEP_DESCRIPTION = 'Answer a paused run (get_report state needs_claude): the bridge handed a "do" step ' +
  'back to you and holds the device until you answer or the pause expires (5 minutes by default; then the run ends ' +
  'INCONCLUSIVE with HANDBACK_TIMEOUT; time paused doesn\'t count toward the run\'s wall-time limit). Send the runId, the pauseId from get_report, and exactly one answer: ' +
  '{"kind":"tap","ref"} taps an element (a ref from the package\'s elements); ' +
  '{"kind":"type","ref","valueKey"} replaces a field\'s text with one of the step\'s value keys; ' +
  '{"kind":"tapAt","x","y"} taps a point given in pixels of the screenshot file the package names (its size is ' +
  'shown; the bridge scales it to the screen; Android only, iOS refuses it as UNSUPPORTED_ACTION); ' +
  '{"kind":"scroll","direction":"up"|"down"}; {"kind":"back"}; ' +
  '{"kind":"done"} declares the step done (recorded as decided by Claude); ' +
  '{"kind":"revise","steps":[...]} replaces the remaining steps, written as script steps and ending at a ' +
  'checkpoint (include this step to retry it); {"kind":"stop"} ends the run INCONCLUSIVE with STOPPED_BY_CLAUDE. ' +
  'After an action, Jev takes over again; call get_report with waitMs: 45000. An answer that doesn\'t fit the paused ' +
  'screen is refused with the reason, and the pause stays open for a corrected one.';

/** `driven`: the experimental driven-mode switch is on, so `resolve_step` and the hand-back limit are published. */
export function createMcpServer(service: BridgeService, options: { driven?: boolean } = {}): McpServer {
  const server = new McpServer({ name: 'jev-ios-bridge', version: BRIDGE_VERSION });
  server.registerTool('start_scenario', {
    description: 'Start an explicit iOS or Android action script with assertion checkpoints. Returns a run id, a local watch URL, and logsCommand, a terminal command that follows the app\'s own output live (a log pane window usually opens by itself). Poll get_report for completion; use cancel_run to stop. TypeSafe receives observed screen text and current assertion claims. Typed values go to device actions and may later appear in screen text; screenshots stay local. A value may be {"fromEnv": "NAME"}, read from this server\'s environment, so a credential stays out of the script.',
    inputSchema: z.object({ scenario: scriptedScenarioSchema,
      limits: (options.driven ? drivenStartLimitsSchema : startLimitsSchema).optional() }),
  }, async ({ scenario, limits }) => {
    try { return result(JSON.stringify(await service.start(scenario, limits))); }
    // A value error names the key and the variable, never the value, and a project error names files and settings,
    // so both are safe to return.
    catch (error) {
      return failed(error instanceof ScriptValueError || error instanceof DrivenProjectError ? error.message : undefined);
    }
  });
  server.registerTool('get_report', {
    description: 'Wait up to waitMs (maximum 45000) for a run. Running results contain progress only; completion returns the evidence report. Cancelling this wait does not cancel the run; use cancel_run to stop it. Status needs_claude (driven mode only) returns at once: a "do" step was handed back to you and the run is paused, holding the device; the result carries the package (reason, step and intent, screen text, screenshot path, element refs, Jev\'s top picks, pause id and expiry). Answer it with resolve_step before it expires.',
    inputSchema: idInput.extend({ waitMs: z.number().int().min(0).max(45000).optional() }),
    annotations: { readOnlyHint: true },
  }, async ({ runId, waitMs }, ctx) => {
    try {
      const { state, report, pause } = await service.status(runId, waitMs, ctx.mcpReq.signal);
      if (pause) return result(`${renderPause(runId, pause)}\nRecorded steps: ${report.steps}.`);
      if (state === 'running') return result(`Status: running\nRun: ${runId}\nRecorded steps: ${report.steps}. Call get_report with waitMs: 45000 to wait for completion.`);
      return result(`Status: ${state}\n${renderScriptedReport(report)}\nFull local evidence: ${service.baseDir}/${runId}/run.jsonl`);
    } catch { return failed(); }
  });
  server.registerTool('cancel_run', {
    description: 'Cancel a run and wait for its inconclusive verdict and device cleanup.', inputSchema: idInput,
  }, async ({ runId }) => {
    try { await service.cancel(runId); return result(`Run ${runId} stopped.`); } catch { return failed(); }
  });
  if (options.driven) {
    server.registerTool('resolve_step', {
      description: RESOLVE_STEP_DESCRIPTION,
      inputSchema: idInput.extend({ pauseId: z.string().min(1).max(100), answer: handbackAnswerSchema }),
    }, async ({ runId, pauseId, answer }) => {
      try {
        const accepted = await service.resolve(runId, pauseId, answer);
        return result(`Answer ${accepted.kind} accepted for pause ${pauseId}. The bridge is acting on it; call get_report with waitMs: 45000.`);
      } catch (error) {
        // The gate's messages name refs, value keys and limits from the script and the paused screen, never a value.
        return failed(error instanceof HandbackAnswerError ? `${error.message}\nThe pause is still open if it hasn't expired.` : undefined);
      }
    });
  }
  return server;
}
