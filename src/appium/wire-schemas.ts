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
export const publicToolRequestSchema = z.discriminatedUnion('name', [
  z.strictObject({ name: z.literal('appium_session_management'), arguments: sessionManagementSchema }),
  z.strictObject({ name: z.literal('appium_perform_actions'), arguments: z.strictObject({ sessionId: sessionIdSchema, actions: z.string().max(65536) }) }),
  z.strictObject({ name: z.literal('appium_get_page_source'), arguments: z.strictObject({ sessionId: sessionIdSchema, saveToFile: z.literal(false) }) }),
]);
export const toolResultSchema = z.object({ content: z.array(z.json()), isError: z.boolean().optional(),
  structuredContent: z.record(z.string(), z.json()).optional() });
export const extensionErrorCodeSchema = z.enum(['SESSION_MISMATCH', 'VERSION_MISMATCH', 'NOT_ALLOWED', 'NOT_UNIQUE', 'DRIVER_ERROR', 'TIMEOUT']);
export const extensionErrorSchema = z.object({ error: z.object({ code: extensionErrorCodeSchema, message: z.string() }) });
export const ownedSessionSchema = z.strictObject({ sessionId: sessionIdSchema, ownership: z.literal('owned'), platform: platformSchema, device: z.string().min(1) });
export const creationResultSchema = z.strictObject({ extensionVersion: z.literal(EXTENSION_VERSION), sessions: z.tuple([ownedSessionSchema]) });
export const deletionResultSchema = z.strictObject({ extensionVersion: z.literal(EXTENSION_VERSION), sessionId: sessionIdSchema, deleted: z.literal(true) });
export const settingsRequestSchema = z.strictObject({ extensionVersion: z.literal(EXTENSION_VERSION), sessionId: sessionIdSchema, settings: capabilitiesSchema });
export const settingsResultSchema = settingsRequestSchema;
export const SOURCE_SETTINGS = Object.freeze({
  ios: Object.freeze({ pageSourceExcludedAttributes: '', snapshotMaxDepth: 50, waitForIdleTimeout: 1, animationCoolOffTimeout: 2 }),
  android: Object.freeze({ ignoreUnimportantViews: false, enableMultiWindows: false, enableTopmostWindowFromActivePackage: true, snapshotMaxDepth: 70 }),
});
export type AppiumErrorCode = z.infer<typeof extensionErrorCodeSchema> | 'SDK_IDENTITY_MISMATCH' | 'PROTOCOL_VERSION_MISMATCH'
  | 'ACKNOWLEDGEMENT_LOST' | 'CONNECTION_LOST' | 'SETTINGS_READBACK_MISMATCH';
export class AppiumError extends Error {
  constructor(readonly code: AppiumErrorCode) { super(code); this.name = 'AppiumError'; }
}
