import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { z } from 'zod/v4';
import { JSONRPCMessageSchema } from '@modelcontextprotocol/sdk/types.js';
import { EXTENSION_VERSION, FROZEN_PROTOCOL_VERSIONS, checkedToolReply, extensionRequestSchema, publicToolRequestSchema } from '../../../src/appium/wire-schemas.js';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const recordingHeaderSchema = z.strictObject({ format: z.literal('jev-appium-wire'), version: z.literal(1),
  platform: z.enum(['ios', 'android']), stackLockSha256: hash, wdaTreeSha256: hash, extensionVersion: z.number().int(),
  fixtureAppSha256: hash, provenance: z.enum(['hand-authored', 'recorded']), protocolVersions: z.array(z.string()).min(1) });
export const wireLineSchema = z.strictObject({ direction: z.enum(['client', 'server']), message: JSONRPCMessageSchema });
export type RecordingHeader = z.infer<typeof recordingHeaderSchema>;
export type WireLine = z.infer<typeof wireLineSchema>;

export function currentWireIdentity() {
  const lock = readFileSync(new URL('../../../stack/package-lock.json', import.meta.url));
  const freeze = z.object({ lockSha256: hash }).parse(JSON.parse(readFileSync(new URL('../../../stack/freeze.json', import.meta.url), 'utf8')));
  const wda = z.object({ treeSha256: hash }).parse(JSON.parse(readFileSync(new URL('../../../stack/wda/provenance.json', import.meta.url), 'utf8')));
  if (createHash('sha256').update(lock).digest('hex') !== freeze.lockSha256) throw new Error('STALE_APPIUM_RECORDING');
  return { stackLockSha256: freeze.lockSha256, wdaTreeSha256: wda.treeSha256, extensionVersion: EXTENSION_VERSION, protocolVersions: FROZEN_PROTOCOL_VERSIONS };
}
export function readRecording(path: string): { header: RecordingHeader; lines: WireLine[] } {
  const bytes = readFileSync(path);
  if (bytes.length > 32 * 1024 * 1024) throw new Error('INVALID_APPIUM_RECORDING');
  const [first, ...rest] = bytes.toString('utf8').trim().split('\n');
  if (!first) throw new Error('INVALID_APPIUM_RECORDING');
  const header = recordingHeaderSchema.parse(JSON.parse(first)); const current = currentWireIdentity();
  if (header.stackLockSha256 !== current.stackLockSha256 || header.wdaTreeSha256 !== current.wdaTreeSha256
    || header.extensionVersion !== current.extensionVersion || JSON.stringify(header.protocolVersions) !== JSON.stringify(current.protocolVersions))
    throw new Error('STALE_APPIUM_RECORDING');
  const lines = rest.map(line => wireLineSchema.parse(JSON.parse(line)));
  for (const { direction, message } of lines) {
    if (direction !== 'client' || !('method' in message) || message.method !== 'tools/call') continue;
    const params = z.object({ name: z.string(), arguments: z.unknown() }).parse(message.params);
    if (params.name.startsWith('jev_')) extensionRequestSchema.parse(params);
    else publicToolRequestSchema.parse(params);
  }
  return { header, lines };
}
export function validateRecordedResult(request: unknown, input: unknown): void {
  const params = z.object({ name: z.string(), arguments: z.unknown() }).parse(request);
  checkedToolReply(params.name, params.arguments, input);
}
