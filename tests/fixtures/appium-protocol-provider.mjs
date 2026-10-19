// Controllable private MCP process. It never loads or calls a native backend.
import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { crc32 } from 'node:zlib';
const [fault, platform, wirePath] = process.argv.slice(2);
const fixture = JSON.parse(readFileSync(new URL('../../.scratch/appium-mcp-migration/candidate-stack/fixtures/protocol.json', import.meta.url), 'utf8'));
function wireDigest(request) {
  const sorted = value => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, sorted(value)])) : value;
  return createHash('sha256').update(JSON.stringify(sorted(request))).digest('hex');
}
const wire = [];
writeFileSync(wirePath, '[]');
for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line);
  if (request.id === undefined) continue;
  let result;
  if (request.method === 'initialize') result = { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { ...fixture.server, ...(fault === 'server-version' ? { version: '1.97.1' } : {}) } };
  else if (request.method === 'tools/list') {
    const tools = structuredClone(fixture.tools);
    if (fault === 'schema-change') tools[0].inputSchema.properties.action.enum.push('unsafe');
    if (fault === 'schema-missing') tools.shift();
    if (fault === 'schema-duplicate') tools.push(tools[0]);
    result = { tools };
  }
  else if (request.method === 'tools/call') {
    wire.push(request.params); writeFileSync(wirePath, JSON.stringify(wire));
    const name = request.params.name;
    if (name === 'jev_phase1_stack') {
      result = { isError: false, content: [{ type: 'text', text: 'Pinned stack' }], structuredContent: structuredClone(fixture.stack) };
      if (fault === 'stack-version') result.structuredContent.packages[0].version = '0.0.0';
      if (fault === 'stack-integrity') result.structuredContent.packages[0].archive.integrity = 'sha512-wrong';
      if (fault === 'stack-loaded') result.structuredContent.loaded.files[0].sha256 = '0'.repeat(64);
      if (fault === 'stack-wda') result.structuredContent.wda.treeSha256 = '0'.repeat(64);
      if (fault === 'stack-missing') delete result.structuredContent;
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n'); continue;
    }
    const matching = fixture.platforms[platform].calls.filter(x => x.request.name === name && (name !== 'appium_session_management' || x.request.arguments.action === request.params.arguments.action));
    const index = name === 'appium_get_page_source' && wire.filter(x => x.name === name).length > 1 ? 1 : 0;
    result = structuredClone(matching[index].reply);
    const sessions = result.structuredContent?.sessions;
    if (fault === 'create-missing') sessions[0].sessionId = undefined;
    if (fault === 'create-text-only') delete result.structuredContent;
    if (fault === 'create-foreign') sessions[0].capabilities['appium:udid'] = 'foreign-device';
    if (fault === 'create-duplicate') sessions.push(sessions[0]);
    if (fault === 'create-id') sessions[0].sessionId = 'success';
    if (fault === 'create-id-type' && name === 'appium_session_management') sessions[0].sessionId = [sessions[0].sessionId];
    if (fault === 'create-attached') sessions[0].ownership = 'attached';
    if (fault === 'create-inconsistent') result.content[0].text = result.content[0].text.replace(sessions[0].sessionId, 'ffffffff-ffff-ffff-ffff-ffffffffffff');
    if (fault === 'create-extension') result.structuredContent.extensionVersion = 2;
    if (fault === 'create-error') result.isError = true;
    if (name === 'appium_get_page_source') {
      if (fault === 'xml-envelope') result.content[0].text = '<hierarchy />';
      if (fault === 'xml-malformed') result.content[0].text = 'Page source retrieved successfully: \n```xml <hierarchy><node></hierarchy>```';
      if (fault === 'xml-root') result.content[0].text = 'Page source retrieved successfully: \n```xml <unknown/>```';
      if (fault === 'xml-doctype') result.content[0].text = 'Page source retrieved successfully: \n```xml <!DOCTYPE hierarchy [<!ENTITY x SYSTEM "file:///etc/passwd">]><hierarchy>&x;</hierarchy>```';
      if (fault === 'xml-missing-value') result.content[0].text = result.content[0].text.replaceAll('selection.summary', 'missing.summary');
      if (fault === 'xml-starting-state') result.content[0].text = result.content[0].text.replaceAll('Selected: None', 'Selected: Apple');
      if (fault === 'xml-viewer') result.content.push({ type: 'resource', resource: { uri: 'ui://appium-mcp/page-source-inspector/fixture', mimeType: 'text/html', text: '<html>Unconsumed viewer</html>' } });
      if (fault === 'xml-duplicate') result.content.push(result.content[0]);
    }
    if (name === 'appium_find_elements') {
      const found = JSON.parse(result.content[0].text);
      if (fault === 'elements-missing') delete found.elements;
      if (fault === 'elements-id') found.elements[0].elementId = '';
      if (fault === 'elements-duplicate') found.elements.push(found.elements[0]);
      if (fault === 'elements-zero') found.elements = [];
      if (fault === 'elements-many') found.elements.push({ elementId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' });
      result.content[0].text = fault === 'elements-json' ? '{' : JSON.stringify(found);
    }
    if (name === 'appium_gesture' || (name === 'appium_session_management' && request.params.arguments.action === 'delete')) {
      if (fault === 'action-lost') process.exit(0);
      result.structuredContent = { extensionVersion: 1, completion: { tool: name, sessionId: request.params.arguments.sessionId, requestSha256: wireDigest(request.params), disposition: 'terminal', nativeSuccess: true } };
      if (fault === 'action-effective-default' && name === 'appium_gesture') result.structuredContent.completion.requestSha256 = wireDigest({ ...request.params, arguments: { maxScrollAttempts: 10, ...request.params.arguments } });
      if (fault === 'action-text-only') delete result.structuredContent;
      if (fault === 'action-id') result.structuredContent.completion.sessionId = 'foreign';
      if (fault === 'action-digest') result.structuredContent.completion.requestSha256 = '0'.repeat(64);
      if (fault === 'action-error') { result.isError = true; result.content[0].text = 'supplied password: private-test-value'; }
    }
    if (name === 'appium_screenshot' && request.params.arguments.returnRawBase64 === true) {
      const png = readFileSync(new URL('../../.scratch/appium-mcp-migration/' + fixture.platforms[platform].png, import.meta.url));
      let bytes = Buffer.from(png);
      if (fault === 'png-crc') bytes[100] ^= 1;
      if (fault === 'png-dimensions') { bytes.writeUInt32BE(0, 16); bytes.writeUInt32BE(crc32(bytes.subarray(12, 29)), 29); }
      if (fault === 'png-palette') {
        const chunk = Buffer.alloc(13); chunk.writeUInt32BE(1); chunk.write('PLTE', 4); chunk[8] = 1;
        chunk.writeUInt32BE(crc32(chunk.subarray(4, 9)), 9);
        bytes = Buffer.concat([bytes.subarray(0, -12), chunk, bytes.subarray(-12)]);
      }
      if (['png-chunk-name', 'png-high-bit', 'png-reserved-bit'].includes(fault)) {
        const chunk = Buffer.alloc(12); chunk.write(fault === 'png-reserved-bit' ? 'aaba' : 'a0Aa', 4);
        if (fault === 'png-high-bit') { chunk.write('aAAa', 4); chunk[4] = 0xe1; }
        chunk.writeUInt32BE(crc32(chunk.subarray(4, 8)), 8);
        bytes = Buffer.concat([bytes.subarray(0, -12), chunk, bytes.subarray(-12)]);
      }
      if (fault === 'png-compressed-tail') {
        const chunk = Buffer.alloc(15); chunk.writeUInt32BE(3); chunk.write('IDATbad', 4);
        chunk.writeUInt32BE(crc32(chunk.subarray(4, 11)), 11);
        bytes = Buffer.concat([bytes.subarray(0, -12), chunk, bytes.subarray(-12)]);
      }
      result = { isError: false, content: [{ type: 'image', mimeType: fault === 'png-mime' ? 'image/jpeg' : 'image/png', data: fault === 'png-base64' ? '@@@' : (fault === 'png-truncated' ? bytes.subarray(0, 33) : bytes).toString('base64') }] };
      if (fault === 'png-viewer') result = matching[0].reply;
    }
  }
  else { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Unknown method' } }) + '\n'); continue; }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n');
}
