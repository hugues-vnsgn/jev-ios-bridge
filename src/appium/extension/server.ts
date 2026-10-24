import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod/v4';
import { AppiumError, TOOL_NAMES, capabilitiesSchema, platformSchema } from '../wire-schemas.js';
import { createBridgePlugin } from './plugin.js';

export const extensionProfileSchema = z.object({ platform: platformSchema, device: z.string().min(1), capabilities: capabilitiesSchema });
type Plugin = ReturnType<typeof createBridgePlugin>;
type ControlledServer = { start(options: { transportType: 'stdio' }): Promise<void>; stop(): Promise<void> };
const callable = <T extends (...args: never[]) => unknown>() => z.custom<T>(value => typeof value === 'function');
const coreModuleSchema = z.object({ configureStdioTransportLogging: callable<() => void>(),
  createAppiumMcpServer: callable<(options: { plugins: Plugin[]; policy: { allowTools: RegExp[]; allowResources: RegExp[] } }) => Promise<ControlledServer>>() });
const zodModuleSchema = z.object({ z: z.object({ fromJSONSchema: callable<(schema: object) => unknown>() }) });

export async function createControlledServer(stackRoot: string, profile: unknown): Promise<ControlledServer> {
  if (!isAbsolute(stackRoot)) throw new AppiumError('NOT_ALLOWED');
  const selected = extensionProfileSchema.parse(profile);
  const pkg = z.object({ name: z.literal('appium-mcp'), version: z.literal('1.97.0'),
    exports: z.object({ './core': z.object({ import: z.literal('./dist/core.js') }) }) })
    .parse(JSON.parse(readFileSync(join(stackRoot, 'node_modules/appium-mcp/package.json'), 'utf8')));
  const publicEntry = join(stackRoot, 'node_modules/appium-mcp', pkg.exports['./core'].import);
  const require = createRequire(pathToFileURL(join(stackRoot, 'package.json')));
  const zodEntry = require.resolve('zod');
  if (!zodEntry.startsWith(join(stackRoot, 'node_modules') + '/')) throw new AppiumError('NOT_ALLOWED');
  const core = coreModuleSchema.parse(await import(pathToFileURL(publicEntry).href));
  const nativeZod = zodModuleSchema.parse(await import(pathToFileURL(zodEntry).href));
  core.configureStdioTransportLogging();
  return core.createAppiumMcpServer({ plugins: [createBridgePlugin(selected, schema => nativeZod.z.fromJSONSchema(schema))],
    policy: { allowTools: [new RegExp(`^(?:${TOOL_NAMES.join('|')})$`)], allowResources: [/a^/] } });
}
