// Versioned public-core plugin for the small research tracer only.
import { z } from 'zod';
import { creation, singleText, requestSha256, idPattern, refuse } from './protocol-contract.mjs';
export function protocolExtension(stack, profile) {
  let core;
  let creationAuthorizedCount = 0;
  return {
    name: 'jev-phase1-protocol', version: '0.1.0',
    register(registry, publicCore) {
      core = publicCore;
      registry.addTool({ name: 'jev_phase1_stack', description: 'Read the verified Phase 1 runtime selection', parameters: z.object({}).strict(), annotations: { readOnlyHint: true, openWorldHint: false }, execute: async () => ({ isError: false, content: [{ type: 'text', text: 'Pinned stack' }], structuredContent: stack }) });
      registry.addTool({ name: 'jev_phase1_inventory', description: 'Read local inventory; never a native release proof', parameters: z.object({}).strict(), annotations: { readOnlyHint: true, openWorldHint: false }, execute: async () => ({ isError: false, content: [{ type: 'text', text: 'Process-local inventory only' }], structuredContent: { extensionVersion: 1, sessions: core.listSessions(), creationAuthorizedCount, nativeFenceEstablished: false } }) });
    },
    beforeCall(ctx) {
      if (['jev_phase1_stack', 'jev_phase1_inventory'].includes(ctx.toolName)) return;
      if (ctx.toolName === 'appium_session_management' && ctx.args.action === 'create') {
        const caps = JSON.parse(ctx.args.capabilities);
        if (ctx.args.remoteServerUrl !== undefined || core.listSessions().length !== 0 || ctx.args.platform !== profile.platform) refuse('INVALID_CREATION_REQUEST');
        if (requestSha256({ capabilities: caps }) !== requestSha256({ capabilities: profile.caps })) refuse('INVALID_CREATION_REQUEST');
        creationAuthorizedCount++;
      } else if (!idPattern.test(ctx.args.sessionId ?? '')) refuse('EXPLICIT_SESSION_REQUIRED');
      if (ctx.toolName === 'appium_gesture') {
        const tap = ctx.args.action === 'tap' && idPattern.test(ctx.args.elementUUID ?? '');
        const pendingPress = profile.faultMode && ['cancel', 'process-failure'].includes(profile.faultMode) && ctx.args.action === 'long_press' && ctx.args.x === 100 && ctx.args.y === 700 && ctx.args.duration === 4000;
        if (!tap && !pendingPress) refuse('UNSUPPORTED_TRACER_ACTION');
      }
      if (ctx.toolName === 'appium_screenshot' && (ctx.args.returnRawBase64 !== true || ctx.args.maxWidth !== undefined || ctx.args.elementUUID !== undefined)) refuse('INVALID_SCREENSHOT_REQUEST');
      if (ctx.toolName === 'appium_session_management' && !['create', 'delete'].includes(ctx.args.action)) refuse('UNSUPPORTED_TRACER_ACTION');
    },
    afterCall(ctx, reply) {
      if (reply.isError) return { isError: true, content: [{ type: 'text', text: 'VENDOR_ERROR' }] };
      if (ctx.toolName === 'appium_session_management' && ctx.args.action === 'create') {
        const result = { ...reply, structuredContent: { extensionVersion: 1, sessions: core.listSessions() } };
        creation(result, profile.platform, profile.caps);
        return result;
      }
      const deletion = ctx.toolName === 'appium_session_management' && ctx.args.action === 'delete';
      if (ctx.toolName === 'appium_gesture' || deletion) {
        const text = singleText(reply, 'INVALID_COMPLETION_RESULT');
        const expected = deletion ? `Session ${ctx.args.sessionId} deleted successfully.` : ctx.args.action === 'long_press' ? `Successfully long pressed at (${ctx.args.x}, ${ctx.args.y}) for ${ctx.args.duration}ms.` : `elementId '${ctx.args.elementUUID}'\nSuccessfully tapped element ${ctx.args.elementUUID}.`;
        if (text !== expected || (deletion && core.getSessionInfo(ctx.args.sessionId))) refuse('INVALID_COMPLETION_RESULT');
        return { isError: false, content: [{ type: 'text', text: 'Terminal tool completion; no native fence' }], structuredContent: { extensionVersion: 1, completion: { tool: ctx.toolName, sessionId: ctx.args.sessionId, requestSha256: requestSha256({ name: ctx.toolName, arguments: ctx.args }), disposition: 'terminal', nativeSuccess: true } } };
      }
      return reply;
    },
  };
}
