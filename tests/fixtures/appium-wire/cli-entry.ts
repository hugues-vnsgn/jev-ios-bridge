/**
 * The installed CLI composition (`runCli`) with only this Mac's Appium parts and Jev replaced: a world host and fake
 * judges. `argv[2]` is the root folder; JEV_TEST_CLI_ARGS (JSON) are the CLI arguments, `mcp` by default, so an MCP
 * session can start it as a fixture server. JEV_TEST_WORLDS holds the worlds and JEV_TEST_PLATFORM the device kind.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fakeSimulatorProbe } from '../android-device.js';
import { fakeDrivenJudge, type FakeStep } from '../driven-judge.js';
import { UDID } from './driver-fixture.js';
import { androidTarget } from './matrix.js';
import { worldHost } from './world-host.js';
import type { World } from './world-schema.js';

const root = process.argv[2]!;
const args = JSON.parse(process.env.JEV_TEST_CLI_ARGS ?? '["mcp"]') as string[];
const worlds = JSON.parse(process.env.JEV_TEST_WORLDS!) as World[];
const probability = Number(process.env.JEV_TEST_PROBABILITY ?? '0.97');
const projectDir = join(root, 'project');
mkdirSync(join(projectDir, '.jev'), { recursive: true });
writeFileSync(join(projectDir, '.jev', 'config.json'), JSON.stringify({ drivenMode: true }));
process.env.JEV_RUNS_DIR = join(root, 'runs');
// The CLI reads its project folder when it loads.
process.env.JEV_PROJECT_DIR = projectDir;
const { runCli } = await import('../../../src/cli.js');
const android = process.env.JEV_TEST_PLATFORM === 'android' ? androidTarget() : undefined;
const world = worldHost({ after: () => {} }, { root: join(root, 'host'), worlds,
  ...(android ? { identityProbe: android.options.identityProbe, adb: android.options.adb, nativeReply: android.nativeReply } : { identityProbe: fakeSimulatorProbe(UDID) }) });
await runCli(args, { host: world.host, projectDir,
  createJudge: () => ({ async judge(assertions) {
    return { probabilities: Object.fromEntries(assertions.map(assertion => [assertion.id, probability])), inputTokens: 1, latencyMs: 1, model: 'jev-1.13.0' };
  } }),
  createDrivenJudge: () => fakeDrivenJudge(JSON.parse(process.env.JEV_TEST_DRIVEN ?? '[]') as FakeStep[]) });
