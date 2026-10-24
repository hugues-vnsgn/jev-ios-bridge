import { z } from 'zod/v4';

export const EXTENSION_VERSION = 1;
export const CLIENT_SDK = Object.freeze({ version: '1.32.1',
  integrity: 'sha512-2DdE+SJDtzLEEWzY1ZjY7Q+VcPhcV1KisD3zI4u0XZyktsjHum1mwbMI+JaulUBi2OZk+KJAi2uPXzxichPkdw==' });
export const FROZEN_PROTOCOL_VERSIONS: readonly string[] = Object.freeze(['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05', '2024-10-07']);
export const sessionIdSchema = z.string().min(1).max(256).regex(/^[a-zA-Z0-9_-]+$/).brand<'AppiumSessionId'>();
export type AppiumSessionId = z.infer<typeof sessionIdSchema>;
export const platformSchema = z.enum(['ios', 'android']);
export type AppiumPlatform = z.infer<typeof platformSchema>;
export const capabilitiesSchema = z.record(z.string(), z.union([z.string(), z.number().finite(), z.boolean()]));
export type SessionCapabilities = z.infer<typeof capabilitiesSchema>;
export const sessionManagementSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('create'), platform: platformSchema, capabilities: z.string().max(32768) }),
  z.strictObject({ action: z.literal('delete'), sessionId: sessionIdSchema }),
]);
const actionStepSchema = z.strictObject({ type: z.enum(['pointerMove', 'pointerDown', 'pointerUp', 'pointerCancel', 'keyDown', 'keyUp', 'pause']),
  duration: z.number().int().min(0).optional(), x: z.number().int().optional(), y: z.number().int().optional(),
  button: z.number().int().min(0).optional(), value: z.string().max(65536).optional(), origin: z.string().optional() });
export const actionsRequestSchema = z.strictObject({ sessionId: sessionIdSchema, actions: z.array(z.strictObject({
  type: z.enum(['pointer', 'key', 'none']), id: z.string().min(1), parameters: z.strictObject({ pointerType: z.enum(['touch', 'mouse', 'pen']).optional() }).optional(),
  actions: z.array(actionStepSchema).min(1).max(1024) })).min(1).max(16) });
export const sourceRequestSchema = z.strictObject({ sessionId: sessionIdSchema, saveToFile: z.literal(false) });
export const publicToolRequestSchema = z.discriminatedUnion('name', [
  z.strictObject({ name: z.literal('appium_session_management'), arguments: sessionManagementSchema }),
  z.strictObject({ name: z.literal('appium_perform_actions'), arguments: actionsRequestSchema }),
  z.strictObject({ name: z.literal('appium_get_page_source'), arguments: sourceRequestSchema }),
]);
export const toolResultSchema = z.object({ content: z.array(z.json()), isError: z.boolean().optional(),
  structuredContent: z.record(z.string(), z.json()).optional() });
export const extensionErrorCodeSchema = z.enum(['SESSION_MISMATCH', 'VERSION_MISMATCH', 'NOT_ALLOWED', 'NOT_UNIQUE', 'DRIVER_ERROR', 'TIMEOUT']);
export const extensionErrorSchema = z.strictObject({ error: z.strictObject({ code: extensionErrorCodeSchema, message: extensionErrorCodeSchema }) });
export const ownedSessionSchema = z.strictObject({ sessionId: sessionIdSchema, ownership: z.literal('owned'), platform: platformSchema, device: z.string().min(1) });
export const creationResultSchema = z.strictObject({ extensionVersion: z.literal(EXTENSION_VERSION), sessions: z.tuple([ownedSessionSchema]) });
export const deletionResultSchema = z.strictObject({ extensionVersion: z.literal(EXTENSION_VERSION), sessionId: sessionIdSchema, deleted: z.literal(true) });
export const settingsRequestSchema = z.strictObject({ extensionVersion: z.literal(EXTENSION_VERSION), sessionId: sessionIdSchema, settings: capabilitiesSchema });
export const settingsResultSchema = settingsRequestSchema;
export const SOURCE_SETTINGS = Object.freeze({
  ios: Object.freeze({ pageSourceExcludedAttributes: '', snapshotMaxDepth: 50, waitForIdleTimeout: 1, animationCoolOffTimeout: 2 }),
  android: Object.freeze({ ignoreUnimportantViews: false, enableMultiWindows: false, enableTopmostWindowFromActivePackage: true, snapshotMaxDepth: 70 }),
});
export const PUBLIC_TOOL_NAMES = ['appium_session_management', 'appium_perform_actions', 'appium_get_page_source'] as const;
export const EXTENSION_TOOL_NAMES = ['jev_session_inventory', 'jev_settings', 'jev_screen', 'jev_replace_text',
  'jev_android_back', 'jev_start_activity', 'jev_terminate_app'] as const;
export const TOOL_NAMES = [...PUBLIC_TOOL_NAMES, ...EXTENSION_TOOL_NAMES] as const;
const binding = { extensionVersion: z.literal(EXTENSION_VERSION), sessionId: sessionIdSchema };
const noNul = (value: string) => !value.includes('\0');
const text = z.string().min(1).max(65536).refine(noNul);
const replacement = z.string().max(65536).refine(noNul);
const appId = z.string().min(1).max(256).regex(/^[a-zA-Z0-9_][a-zA-Z0-9_.]*$/);
export const locatorSchema = z.strictObject({ using: z.enum(['accessibility id', 'id', 'xpath', '-ios predicate string', '-ios class chain']), value: text });
export const extensionArguments = {
  jev_session_inventory: z.strictObject(binding),
  jev_settings: settingsRequestSchema,
  jev_screen: z.strictObject(binding),
  jev_replace_text: z.strictObject({ ...binding, locator: locatorSchema, text: replacement }),
  jev_android_back: z.strictObject(binding),
  jev_start_activity: z.strictObject({ ...binding, package: appId, activity: z.string().min(1).max(256).regex(/^[a-zA-Z0-9_.]+$/),
    intentExtras: z.record(z.string().min(1).max(200), text).refine(extras => Object.keys(extras).length <= 20) }),
  jev_terminate_app: z.strictObject({ ...binding, appId }),
};
export const extensionRequestSchema = z.discriminatedUnion('name', [
  z.strictObject({ name: z.literal('jev_session_inventory'), arguments: extensionArguments.jev_session_inventory }),
  z.strictObject({ name: z.literal('jev_settings'), arguments: extensionArguments.jev_settings }),
  z.strictObject({ name: z.literal('jev_screen'), arguments: extensionArguments.jev_screen }),
  z.strictObject({ name: z.literal('jev_replace_text'), arguments: extensionArguments.jev_replace_text }),
  z.strictObject({ name: z.literal('jev_android_back'), arguments: extensionArguments.jev_android_back }),
  z.strictObject({ name: z.literal('jev_start_activity'), arguments: extensionArguments.jev_start_activity }),
  z.strictObject({ name: z.literal('jev_terminate_app'), arguments: extensionArguments.jev_terminate_app }),
]);
export type ExtensionRequest = z.infer<typeof extensionRequestSchema>;
export const rectSchema = z.strictObject({ x: z.number().finite(), y: z.number().finite(), width: z.number().positive().finite(), height: z.number().positive().finite() });
export const pngSchema = z.string().max(14 * 1024 * 1024).regex(/^[A-Za-z0-9+/]+={0,2}$/).refine(value => {
  const bytes = Buffer.from(value, 'base64');
  return bytes.length >= 33 && bytes.toString('base64') === value && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    && bytes.toString('ascii', 12, 16) === 'IHDR' && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0;
});
export const screenResultSchema = z.strictObject({ ...binding, pngBase64: pngSchema, rect: rectSchema,
  orientation: z.enum(['PORTRAIT', 'LANDSCAPE']) });
export const acknowledgementSchema = z.strictObject({ ...binding, acknowledged: z.literal(true) });
export const inventoryResultSchema = z.strictObject({ ...binding, platform: platformSchema, device: z.string().min(1),
  ports: z.array(z.strictObject({ name: z.enum(['wda', 'mjpeg', 'uiautomator2']), port: z.number().int().min(1).max(65535) })),
  hostProcesses: z.array(z.strictObject({ kind: z.enum(['xcodebuild', 'server']), pid: z.number().int().positive() })),
  deviceProcesses: z.strictObject({ status: z.literal('unknown') }) });
export const actionsResultSchema = acknowledgementSchema;
export const sourceResultSchema = z.strictObject({ ...binding, xml: z.string().min(1).max(8 * 1024 * 1024) });
export const extensionResults = { jev_session_inventory: inventoryResultSchema, jev_settings: settingsResultSchema, jev_screen: screenResultSchema,
  jev_replace_text: acknowledgementSchema, jev_android_back: acknowledgementSchema, jev_start_activity: acknowledgementSchema, jev_terminate_app: acknowledgementSchema };
export type ExtensionCall = { [K in keyof typeof extensionArguments]: { name: K; arguments: Omit<z.infer<(typeof extensionArguments)[K]>, keyof typeof binding> } }[keyof typeof extensionArguments];
export type ExtensionResult<K extends keyof typeof extensionResults> = z.output<(typeof extensionResults)[K]>;
export function toolDefinitions() {
  return [
    { name: 'appium_session_management', inputSchema: { ...z.toJSONSchema(sessionManagementSchema), type: 'object' as const } },
    { name: 'appium_perform_actions', inputSchema: z.toJSONSchema(actionsRequestSchema) },
    { name: 'appium_get_page_source', inputSchema: z.toJSONSchema(sourceRequestSchema) },
    ...EXTENSION_TOOL_NAMES.map(name => ({ name, inputSchema: z.toJSONSchema(extensionArguments[name].extend({ extensionVersion: z.number() })) })),
  ];
}
export type ToolReply = z.infer<typeof toolResultSchema>;
export function extensionFailure(code: z.infer<typeof extensionErrorCodeSchema>): ToolReply {
  return { isError: true, content: [{ type: 'text', text: code }], structuredContent: { error: { code, message: code } } };
}
export function checkedToolReply(name: string, args: unknown, input: unknown): ToolReply {
  const reply = toolResultSchema.safeParse(input);
  if (!reply.success) throw new AppiumError('ACKNOWLEDGEMENT_LOST');
  if (reply.data.isError) {
    const error = extensionErrorSchema.safeParse(reply.data.structuredContent);
    if (!error.success || error.data.error.code !== error.data.error.message) throw new AppiumError('ACKNOWLEDGEMENT_LOST');
    return extensionFailure(error.data.error.code);
  }
  const management = sessionManagementSchema.safeParse(args);
  const resultSchemas = { ...extensionResults, appium_perform_actions: actionsResultSchema, appium_get_page_source: sourceResultSchema };
  const schema = name === 'appium_session_management' && management.success
    ? management.data.action === 'create' ? creationResultSchema : deletionResultSchema
    : Object.entries(resultSchemas).find(([tool]) => tool === name)?.[1];
  const result = schema?.safeParse(reply.data.structuredContent);
  if (!result?.success) throw new AppiumError('ACKNOWLEDGEMENT_LOST');
  if ('sessionId' in result.data) {
    const request = z.object({ sessionId: sessionIdSchema }).safeParse(args);
    if (!request.success || request.data.sessionId !== result.data.sessionId) throw new AppiumError('ACKNOWLEDGEMENT_LOST');
  }
  return reply.data;
}
export type AppiumErrorCode = z.infer<typeof extensionErrorCodeSchema> | 'SDK_IDENTITY_MISMATCH' | 'PROTOCOL_VERSION_MISMATCH'
  | 'ACKNOWLEDGEMENT_LOST' | 'CONNECTION_LOST' | 'SETTINGS_READBACK_MISMATCH';
export class AppiumError extends Error {
  constructor(readonly code: AppiumErrorCode) { super(code); this.name = 'AppiumError'; }
}
