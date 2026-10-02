// Capture one iOS screen for the jev-drives offline spike (ticket 03).
// Usage: npx tsx spikes/jev-drives/capture-ios.ts <simulator-udid> <output-dir>
// Writes snapshot.full.json (pinned MobileBuildMCP `snapshot-ui --verbose`, as the bridge's `capture: 'full'`
// issues it), jev-screen.txt (renderAssertionState over the iOS driver's own parseSnapshot), and screenshot.png.
// Makes no Jev or TypeSafe call; the device environment drops the Jev key, as the bridge's does.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { deviceEnvironment, parseSnapshot, pinnedMobileBuildMcpCli } from '../../src/device/index.js';
import { renderAssertionState, ScriptedObservationError } from '../../src/scripted/observe.js';

const [udid, outArg] = process.argv.slice(2);
if (!udid || !/^[0-9A-F-]{36}$/i.test(udid) || !outArg) throw new Error('Usage: capture-ios.ts <simulator-udid> <output-dir>');
const out = resolve(outArg);
mkdirSync(out, { recursive: true });

function mobileBuild(args: string[]): { raw: string; data: Record<string, unknown> } {
  const raw = execFileSync(process.execPath, [pinnedMobileBuildMcpCli(), ...args, '--output', 'json'], {
    env: deviceEnvironment(), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  const envelope = JSON.parse(raw);
  if (envelope.didError) throw new Error(`MobileBuildMCP failed: ${JSON.stringify(envelope.error ?? envelope.data?.uiError)}`);
  return { raw, data: envelope.data };
}

// The same arguments as MobileBuildMcpDriver.captureArgs with capture: 'full'.
const full = mobileBuild(['ui-automation', 'snapshot-ui', '--simulator-id', udid, '--verbose']);
writeFileSync(join(out, 'snapshot.full.json'), full.raw);
const snapshot = parseSnapshot(full.data, udid);
let jevText: string;
try {
  jevText = renderAssertionState(snapshot, 'ios');
} catch (error) {
  if (!(error instanceof ScriptedObservationError)) throw error;
  jevText = `RENDER REFUSED: ${error.code}`;
}
writeFileSync(join(out, 'jev-screen.txt'), jevText);

const shot = mobileBuild(['ui-automation', 'screenshot', '--simulator-id', udid, '--return-format', 'path']);
const artifacts = (shot.data.artifacts ?? {}) as Record<string, string>;
const shotPath = artifacts.screenshotPath;
if (!shotPath) throw new Error('No screenshot path returned');
copyFileSync(shotPath, join(out, `screenshot${shotPath.slice(shotPath.lastIndexOf('.'))}`));

const capture = full.data.capture as Record<string, unknown>;
process.stdout.write(JSON.stringify({
  out, screenHash: capture.screenHash, elements: snapshot.elements.length,
  jevBytes: Buffer.byteLength(jevText), refused: jevText.startsWith('RENDER REFUSED') ? jevText : undefined,
}) + '\n');
