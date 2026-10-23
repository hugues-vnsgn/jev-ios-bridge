import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod/v4';
import { AppiumError, EXTENSION_TOOL_NAMES, EXTENSION_VERSION, TOOL_NAMES, capabilitiesSchema, checkedToolReply,
  extensionArguments, extensionFailure, publicToolRequestSchema, sessionIdSchema, toolResultSchema,
  type AppiumPlatform, type AppiumSessionId, type ToolReply } from '../wire-schemas.js';
import { createExtensionHandler } from './operations.js';

export type ExtensionProfile = { platform: AppiumPlatform; device: string; capabilities: z.infer<typeof capabilitiesSchema> };
export type CoreAccess = { listSessions(): unknown; getDriver(sessionId: string): unknown; getSessionInfo(sessionId: string): unknown };
type CallContext = { toolName: string; args: unknown };
type ToolDefinition = { name: string; description: string; parameters: unknown;
  annotations: { readOnlyHint: boolean; openWorldHint: boolean }; execute: (args: unknown, context?: { signal: AbortSignal }) => Promise<ToolReply> };
type Registry = { addTool(definition: ToolDefinition): void };
const sessionsSchema = z.array(z.object({ sessionId: sessionIdSchema, ownership: z.literal('owned'), platform: z.string(), capabilities: capabilitiesSchema }));
type State = { kind: 'unused' } | { kind: 'creating' } | { kind: 'owned'; sessionId: AppiumSessionId } | { kind: 'deleted' } | { kind: 'closed' };

export function createBridgePlugin(profile: ExtensionProfile, nativeSchema: (schema: object) => unknown) {
  let core: CoreAccess;
  let state: State = { kind: 'unused' };
  let publicCall: 'idle' | 'pending' = 'idle';
  const handler = createExtensionHandler({ platform: profile.platform, device: profile.device, getSession: id => {
    if (state.kind !== 'owned' || state.sessionId !== id) return null;
    const rows = sessionsSchema.safeParse(core.listSessions());
    const row = rows.success ? rows.data.find(row => row.sessionId === id) : undefined;
    if (!row) return null;
    return { ownership: row.ownership, platform: row.platform, device: String(row.capabilities['appium:udid'] ?? row.capabilities.udid ?? ''), driver: core.getDriver(id) };
  } });
  function close(): void { state = { kind: 'closed' }; handler.close(); }
  return {
    name: 'jev-bridge', version: '1',
    register(registry: Registry, publicCore: CoreAccess): void {
      core = publicCore;
      for (const name of EXTENSION_TOOL_NAMES) registry.addTool({ name, description: `Session-bound ${name}.`,
        parameters: nativeSchema(z.toJSONSchema(extensionArguments[name].extend({ extensionVersion: z.number() }))),
        annotations: { readOnlyHint: name === 'jev_screen' || name === 'jev_session_inventory', openWorldHint: false },
        execute: (args, context) => handler.call(name, args, context?.signal) });
    },
    async beforeCall(ctx: CallContext): Promise<ToolReply | undefined> {
      if (publicCall !== 'idle' || !handler.dispatchOpen) return extensionFailure('NOT_ALLOWED');
      if (EXTENSION_TOOL_NAMES.some(name => name === ctx.toolName)) return undefined;
      if (!TOOL_NAMES.some(name => name === ctx.toolName)) return extensionFailure('NOT_ALLOWED');
      const parsed = publicToolRequestSchema.safeParse({ name: ctx.toolName, arguments: ctx.args });
      if (!parsed.success) return extensionFailure('NOT_ALLOWED');
      const request = parsed.data;
      if (request.name === 'appium_session_management' && request.arguments.action === 'create') {
        const args = request.arguments;
        if (state.kind !== 'unused' || args.platform !== profile.platform) return extensionFailure('NOT_ALLOWED');
        let caps: unknown;
        try { caps = JSON.parse(args.capabilities); } catch { return extensionFailure('NOT_ALLOWED'); }
        if (!isDeepStrictEqual(caps, profile.capabilities) || !isDeepStrictEqual(core.listSessions(), [])) return extensionFailure('NOT_ALLOWED');
        state = { kind: 'creating' }; publicCall = 'pending'; return undefined;
      }
      if (!('sessionId' in request.arguments) || state.kind !== 'owned' || request.arguments.sessionId !== state.sessionId) return extensionFailure('SESSION_MISMATCH');
      publicCall = 'pending'; return undefined;
    },
    async afterCall(ctx: CallContext, raw: unknown): Promise<ToolReply> {
      try {
        const reply = toolResultSchema.parse(raw);
        if (EXTENSION_TOOL_NAMES.some(name => name === ctx.toolName)) return checkedToolReply(ctx.toolName, ctx.args, reply);
        if (reply.isError) { close(); return extensionFailure('DRIVER_ERROR'); }
        const request = publicToolRequestSchema.parse({ name: ctx.toolName, arguments: ctx.args });
        let result: ToolReply;
        if (request.name === 'appium_session_management' && request.arguments.action === 'create') {
          const rows = sessionsSchema.parse(core.listSessions());
          if (state.kind !== 'creating' || rows.length !== 1) throw new AppiumError('ACKNOWLEDGEMENT_LOST');
          const row = rows[0];
          if (!row || row.platform.toLowerCase() !== profile.platform || (row.capabilities['appium:udid'] ?? row.capabilities.udid) !== profile.device) throw new AppiumError('ACKNOWLEDGEMENT_LOST');
          state = { kind: 'owned', sessionId: row.sessionId };
          result = { isError: false, content: [{ type: 'text', text: 'Session created.' }], structuredContent: { extensionVersion: EXTENSION_VERSION,
            sessions: [{ sessionId: row.sessionId, ownership: 'owned', platform: profile.platform, device: profile.device }] } };
        } else {
          if (state.kind !== 'owned') throw new AppiumError('ACKNOWLEDGEMENT_LOST');
          const texts = reply.content.map(block => z.object({ type: z.string(), text: z.string().optional() }).safeParse(block))
            .flatMap(block => block.success && block.data.type === 'text' && block.data.text !== undefined ? [block.data.text] : []);
          if (texts.length !== 1) throw new AppiumError('ACKNOWLEDGEMENT_LOST');
          const text = texts[0] ?? '';
          const binding = { extensionVersion: EXTENSION_VERSION, sessionId: state.sessionId };
          if (request.name === 'appium_get_page_source') {
            const prefix = 'Page source retrieved successfully: \n```xml ';
            if (!text.startsWith(prefix) || !text.endsWith('```')) throw new AppiumError('ACKNOWLEDGEMENT_LOST');
            result = { isError: false, content: [{ type: 'text', text: 'Source captured.' }], structuredContent: { ...binding, xml: text.slice(prefix.length, -3) } };
          } else if (request.name === 'appium_perform_actions') {
            if (text !== `Successfully performed ${request.arguments.actions.length} input source(s).`) throw new AppiumError('ACKNOWLEDGEMENT_LOST');
            result = { isError: false, content: [{ type: 'text', text: 'Acknowledged.' }], structuredContent: { ...binding, acknowledged: true } };
          } else {
            if (text !== `Session ${state.sessionId} deleted successfully.` || !isDeepStrictEqual(core.listSessions(), [])) throw new AppiumError('ACKNOWLEDGEMENT_LOST');
            result = { isError: false, content: [{ type: 'text', text: 'Session deleted.' }], structuredContent: { ...binding, deleted: true } };
            state = { kind: 'deleted' }; handler.close();
          }
        }
        return checkedToolReply(ctx.toolName, ctx.args, result);
      } catch { close(); throw new AppiumError('ACKNOWLEDGEMENT_LOST'); }
      finally { if (!EXTENSION_TOOL_NAMES.some(name => name === ctx.toolName)) publicCall = 'idle'; }
    },
    async destroy(): Promise<void> { close(); },
  };
}
