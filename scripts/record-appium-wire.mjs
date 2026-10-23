import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, lstatSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { createInterface } from 'node:readline';
import { tsImport } from 'tsx/esm/api';
import { z } from 'zod/v4';

const { readRecording, currentWireIdentity, recordingHeaderSchema, wireLineSchema } = await tsImport('../tests/fixtures/appium-wire/recording.ts', import.meta.url);
const args = process.argv.slice(2);
function option(name) { const at = args.indexOf(name); return at < 0 ? undefined : args[at + 1]; }
const output = option('--output');
if (!output) throw new Error('--output is required');
const masks = args.flatMap((value, i) => value === '--mask' && args[i + 1] ? [args[i + 1]] : []);
for (const [key, value] of Object.entries(process.env)) if (/secret|password|token|api.?key/i.test(key) && value) masks.push(value);
const secretKey = /^(?:text|value|password|token|authorization|apiKey|secret)$/i;
function collect(value) {
  if (Array.isArray(value)) { value.forEach(collect); return; }
  if (value === null || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (secretKey.test(key) && typeof item === 'string' && item) masks.push(item);
    else collect(item);
  }
}
function masked(value) {
  if (typeof value === 'string') {
    let clean = value;
    for (const mask of [...new Set(masks)].sort((a, b) => b.length - a.length)) clean = clean.split(mask).join('<masked>');
    return clean;
  }
  if (Array.isArray(value)) return value.map(masked);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, masked(item)]));
}
function save(header, lines) {
  for (const line of lines) if (line.direction === 'client' && line.message.method === 'tools/call') collect(line.message.params?.arguments);
  const content = [recordingHeaderSchema.parse(header), ...lines.map(line => wireLineSchema.parse(line))].map(value => JSON.stringify(masked(value))).join('\n') + '\n';
  writeFileSync(output, content, { flag: 'wx', mode: 0o600 });
  readRecording(output);
  process.stdout.write(`Recorded ${lines.length} wire messages.\n`);
}
const input = option('--input');
if (input) {
  const recording = readRecording(input); save(recording.header, recording.lines);
} else {
  const caseFile = option('--case');
  if (!caseFile) throw new Error('--case or --input is required');
  const config = z.strictObject({ platform: z.enum(['ios', 'android']), fixtureAppSha256: z.string().regex(/^[a-f0-9]{64}$/),
    homeRoot: z.string().refine(isAbsolute), entrypoint: z.string().refine(isAbsolute), args: z.array(z.string()).default([]),
    requests: z.array(wireLineSchema.shape.message), timeoutMs: z.number().int().min(1).max(900000).default(120000) }).parse(JSON.parse(readFileSync(caseFile, 'utf8')));
  mkdirSync(config.homeRoot, { recursive: true, mode: 0o700 });
  const stat = lstatSync(config.homeRoot);
  if (!stat.isDirectory() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()) throw new Error('PRIVATE_HOME_REQUIRED');
  const home = mkdtempSync(join(config.homeRoot, 'wire-'));
  const child = spawn(process.execPath, [config.entrypoint, ...config.args], { env: { HOME: home, APPIUM_HOME: home, TMPDIR: home,
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'C.UTF-8', APPIUM_MCP_ON_CLIENT_DISCONNECT: 'delete_all', ALLOW_REMOTE_APP_URLS: 'false' }, stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = []; const waiting = new Map();
  const failure = new Promise((_, reject) => {
    child.on('error', () => reject(new Error('CHILD_FAILED')));
    child.on('exit', () => reject(new Error('CHILD_EXITED')));
  });
  child.stderr.resume();
  const reader = createInterface({ input: child.stdout });
  reader.on('line', line => {
    try {
      const wire = wireLineSchema.parse({ direction: 'server', message: JSON.parse(line) });
      lines.push(wire);
      if ('id' in wire.message) { waiting.get(wire.message.id)?.(); waiting.delete(wire.message.id); }
    } catch { child.kill('SIGTERM'); }
  });
  let timer;
  try {
    await Promise.race([failure, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('RECORDING_TIMEOUT')), config.timeoutMs); }), (async () => {
      for (const message of config.requests) {
        const ready = 'id' in message ? new Promise(done => waiting.set(message.id, done)) : Promise.resolve();
        lines.push(wireLineSchema.parse({ direction: 'client', message }));
        child.stdin.write(JSON.stringify(message) + '\n'); await ready;
      }
    })()]);
    save({ format: 'jev-appium-wire', version: 1, ...currentWireIdentity(), platform: config.platform,
      fixtureAppSha256: config.fixtureAppSha256, provenance: 'recorded' }, lines);
  } finally {
    clearTimeout(timer); child.stdin.end();
    const kill = setTimeout(() => child.kill('SIGKILL'), 5000); kill.unref();
    child.once('exit', () => clearTimeout(kill)); reader.close();
  }
}
