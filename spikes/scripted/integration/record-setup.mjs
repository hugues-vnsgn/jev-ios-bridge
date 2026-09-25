import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '../../..');
const udid = '0E42FDE2-5E09-42D3-9876-9EF0037FCBE7';
const id = process.argv[2];
if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error('usage: record-setup.mjs <scenario-id>');
const target = join(dir, 'setup-evidence');
mkdirSync(target, { recursive: true, mode: 0o700 });

function mobileBuild(...args) {
  const output = execFileSync('npx', ['-y', 'mobilebuildmcp@2.7.1', ...args,
    '--simulator-id', udid, '--output', 'json'], {
    cwd: root, env: { ...process.env, MOBILEBUILDMCP_SENTRY_DISABLED: 'true' },
    encoding: 'utf8', maxBuffer: 20 * 1024 * 1024,
  });
  const parsed = JSON.parse(output);
  if (parsed.didError || parsed.data?.summary?.status === 'FAILED') throw new Error('MOBILEBUILD_CAPTURE_FAILED');
  return { output, parsed };
}
const full = mobileBuild('ui-automation', 'snapshot-ui', '--verbose');
const screenshot = mobileBuild('simulator', 'screenshot', '--return-format', 'path');
const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const prefix = join(target, `${id}-${stamp}`);
const fullPath = `${prefix}.full.json`;
const screenshotPath = `${prefix}.jpg`;
writeFileSync(fullPath, full.output, { flag: 'wx', mode: 0o600 });
copyFileSync(screenshot.parsed.data.artifacts.screenshotPath, screenshotPath);
chmodSync(screenshotPath, 0o600);
const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const meta = { scenarioId: id, capturedAt: new Date().toISOString(),
  deviceId: full.parsed.data.capture.simulatorId,
  screenHash: full.parsed.data.capture.screenHash,
  fullPath, screenshotPath,
  sha256: { full: sha256(fullPath), screenshot: sha256(screenshotPath) } };
writeFileSync(`${prefix}.meta.json`, JSON.stringify(meta, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
process.stdout.write(JSON.stringify({ scenarioId: id, screenHash: meta.screenHash,
  fullPath, screenshotPath }) + '\n');
