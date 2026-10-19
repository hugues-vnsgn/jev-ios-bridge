// Frozen Phase 1 result contract, limited to the observe/tap/check tracer.
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
export const idPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export function refuse(reason) { throw new Error(reason); }
export function successful(reply) {
  if (!reply || !Array.isArray(reply.content) || (reply.isError !== undefined && typeof reply.isError !== 'boolean')) refuse('INVALID_RESULT_ENVELOPE');
  if (reply.isError) refuse('VENDOR_ERROR');
}
export function singleText(reply, reason) {
  successful(reply);
  if (reply.content.length !== 1 || reply.content[0].type !== 'text' || typeof reply.content[0].text !== 'string') refuse(reason);
  return reply.content[0].text;
}
export function creation(reply, platform, caps) {
  successful(reply);
  const result = reply.structuredContent;
  const session = result?.sessions?.[0];
  if (result?.extensionVersion !== 1 || !Array.isArray(result.sessions) || result.sessions.length !== 1 || !session || typeof session.sessionId !== 'string' || !idPattern.test(session.sessionId) || session.ownership !== 'owned' || session.isActive !== true || session.currentContext !== 'NATIVE_APP' || session.platform !== caps.platformName || session.automationName !== caps['appium:automationName']) refuse('INVALID_CREATION_RESULT');
  // Startup settings are consumed by Appium and omitted from session metadata.
  for (const [key, value] of Object.entries(caps).filter(([key]) => !key.startsWith('appium:settings['))) if (!isDeepStrictEqual(session.capabilities?.[key], value)) refuse('INVALID_CREATION_RESULT');
  const text = reply.content.filter(x => x.type === 'text');
  const expected = `${platform.toUpperCase()} session created successfully with ID: ${session.sessionId}\nPlatform: ${session.platform}\nAutomation: ${session.automationName}\nDevice: ${session.deviceName}\nActive sessions: 1`;
  if (text.length !== 1 || text[0].text !== expected) refuse('INVALID_CREATION_RESULT');
  return session.sessionId;
}

export function xmlText(reply) {
  successful(reply);
  if (reply.content.some(block => block.type !== 'text' && !(block.type === 'resource' && block.resource?.uri?.startsWith('ui://appium-mcp/page-source-inspector/') && block.resource.mimeType === 'text/html' && typeof block.resource.text === 'string'))) refuse('INVALID_XML_RESULT');
  const text = singleText({ ...reply, content: reply.content.filter(block => block.type === 'text') }, 'INVALID_XML_RESULT');
  const matched = /^Page source retrieved successfully: \n```xml ([\s\S]+)```$/.exec(text);
  if (!matched) refuse('INVALID_XML_RESULT');
  return matched[1];
}

export function elements(reply) {
  const text = singleText(reply, 'INVALID_ELEMENTS_RESULT');
  let parsed;
  try { parsed = JSON.parse(text); } catch { refuse('INVALID_ELEMENTS_RESULT'); }
  if (!parsed || !Array.isArray(parsed.elements) || Object.keys(parsed).some(key => key !== 'elements')) refuse('INVALID_ELEMENTS_RESULT');
  const ids = parsed.elements.map(element => {
    if (!element || typeof element.elementId !== 'string' || !idPattern.test(element.elementId) || Object.keys(element).some(key => !['elementId', 'attributes'].includes(key))) refuse('INVALID_ELEMENTS_RESULT');
    return element.elementId;
  });
  if (new Set(ids).size !== ids.length) refuse('INVALID_ELEMENTS_RESULT');
  return ids;
}

export function requestSha256(request) {
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return createHash('sha256').update(JSON.stringify(canonical(request))).digest('hex');
}
export function completion(reply, request) {
  successful(reply);
  const expected = { extensionVersion: 1, completion: { tool: request.name, sessionId: request.arguments.sessionId, requestSha256: requestSha256(request), disposition: 'terminal', nativeSuccess: true } };
  if (!isDeepStrictEqual(reply.structuredContent, expected)) refuse('INVALID_COMPLETION_RESULT');
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function screenshot(reply) {
  successful(reply);
  if (reply.content.length !== 1 || reply.content[0].type !== 'image' || reply.content[0].mimeType !== 'image/png') refuse('INVALID_SCREENSHOT_RESULT');
  const data = reply.content[0].data;
  if (typeof data !== 'string' || data.length > 16 * 1024 * 1024 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) refuse('INVALID_SCREENSHOT_RESULT');
  const bytes = Buffer.from(data, 'base64');
  try {
    if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error();
    let offset = 8, width, height, channels, ended = false, dataEnded = false;
    const compressed = [];
    while (offset < bytes.length) {
      const size = bytes.readUInt32BE(offset);
      if (offset + 12 + size > bytes.length || ended) throw new Error();
      const chunkType = bytes.subarray(offset + 4, offset + 8);
      if (chunkType.some(byte => !((byte >= 65 && byte <= 90) || (byte >= 97 && byte <= 122))) || chunkType[2] < 65 || chunkType[2] > 90) throw new Error();
      const name = chunkType.toString('ascii');
      const body = bytes.subarray(offset + 8, offset + 8 + size);
      if (crc32(bytes.subarray(offset + 4, offset + 8 + size)) !== bytes.readUInt32BE(offset + 8 + size)) throw new Error();
      if (offset === 8 && name !== 'IHDR') throw new Error();
      if (name === 'IHDR') {
        if (offset !== 8 || size !== 13) throw new Error();
        width = body.readUInt32BE(0); height = body.readUInt32BE(4);
        if (!width || !height || width > 8192 || height > 8192 || body[8] !== 8 || ![2, 6].includes(body[9]) || body[10] !== 0 || body[11] !== 0 || body[12] !== 0) throw new Error();
        channels = body[9] === 6 ? 4 : 3;
      } else if (name === 'IDAT') {
        if (dataEnded) throw new Error();
        compressed.push(body);
      } else {
        if (compressed.length) dataEnded = true;
        if (name === 'IEND') { if (size !== 0 || !compressed.length) throw new Error(); ended = true; }
        else if (name[0] === name[0].toUpperCase()) throw new Error();
      }
      offset += size + 12;
    }
    if (!ended) throw new Error();
    const rowBytes = width * channels + 1;
    const compressedBytes = Buffer.concat(compressed);
    const inflated = inflateSync(compressedBytes, { info: true, maxOutputLength: 256 * 1024 * 1024 });
    if (inflated.engine.bytesWritten !== compressedBytes.length) throw new Error();
    const decoded = inflated.buffer;
    if (decoded.length !== rowBytes * height) throw new Error();
    for (let row = 0; row < height; row++) if (decoded[row * rowBytes] > 4) throw new Error();
    return { mimeType: 'image/png', width, height, sha256: createHash('sha256').update(bytes).digest('hex') };
  } catch { refuse('INVALID_SCREENSHOT_RESULT'); }
}
