import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const simulatorId = '0E42FDE2-5E09-42D3-9876-9EF0037FCBE7';
const caseId = process.argv[2];
const destination = process.argv[3] ?? 'raw';
if (!caseId || !/^[a-z0-9][a-z0-9-]*$/.test(caseId)) {
  throw new Error('Usage: node spikes/feasibility/corpus-v3/capture.mjs <case-id> [raw|preflight]');
}
if (!['raw', 'preflight'].includes(destination)) throw new Error('Invalid destination');

const corpusDir = dirname(fileURLToPath(import.meta.url));
const rawDir = join(corpusDir, destination);
mkdirSync(rawDir, { recursive: true });

function mobileBuild(...args) {
  const output = execFileSync('npx', ['-y', 'mobilebuildmcp@2.7.1', ...args, '--output', 'json'], {
    cwd: join(corpusDir, '../../..'),
    env: { ...process.env, MOBILEBUILDMCP_SENTRY_DISABLED: 'true' },
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const parsed = JSON.parse(output);
  if (parsed.didError) throw new Error(`MobileBuildMCP failed: ${parsed.error ?? 'unknown error'}`);
  return { output, parsed };
}

let compact;
let full;
for (let attempt = 1; attempt <= 3; attempt++) {
  compact = mobileBuild('ui-automation', 'snapshot-ui', '--simulator-id', simulatorId);
  full = mobileBuild('ui-automation', 'snapshot-ui', '--simulator-id', simulatorId, '--verbose');
  if (compact.parsed.data.capture.screenHash === full.parsed.data.capture.screenHash) break;
  if (attempt === 3) throw new Error('Compact and full captures have different screen hashes');
}

const screenshot = mobileBuild('simulator', 'screenshot', '--simulator-id', simulatorId, '--return-format', 'path');
const paths = {
  compactPath: `${destination}/${caseId}.compact.json`,
  fullPath: `${destination}/${caseId}.full.json`,
  screenshotPath: `${destination}/${caseId}.jpg`,
};
writeFileSync(join(corpusDir, paths.compactPath), compact.output);
writeFileSync(join(corpusDir, paths.fullPath), full.output);
copyFileSync(screenshot.parsed.data.artifacts.screenshotPath, join(corpusDir, paths.screenshotPath));
writeFileSync(join(rawDir, `${caseId}.meta.json`), JSON.stringify({
  caseId,
  capturedAt: new Date().toISOString(),
  screenHash: compact.parsed.data.capture.screenHash,
  compactCount: compact.parsed.data.capture.count,
  fullCount: full.parsed.data.capture.elements.length,
  assets: paths,
}, null, 2) + '\n');
process.stdout.write(JSON.stringify({
  caseId,
  screenHash: compact.parsed.data.capture.screenHash,
  count: compact.parsed.data.capture.count,
  targets: compact.parsed.data.capture.targets.length,
  fullCount: full.parsed.data.capture.elements.length,
}) + '\n');
