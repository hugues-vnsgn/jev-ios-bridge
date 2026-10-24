import childProcess from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { Socket } from 'node:net';
import { join } from 'node:path';
import { fakeSimulatorProbe } from '../android-device.js';
import { fakeDrivenJudge, type FakeStep } from '../driven-judge.js';
import { UDID } from './driver-fixture.js';
import { androidTarget } from './matrix.js';
import { worldHost } from './world-host.js';
import type { World } from './world-schema.js';

const root = process.argv[2]!;
const effects = process.env.JEV_TEST_EFFECT_LOG;
if (effects) {
  const record = (entry: object) => appendFileSync(effects, JSON.stringify(entry) + '\n');
  for (const name of ['spawn', 'spawnSync', 'execFile', 'execFileSync', 'exec', 'execSync', 'fork'] as const) {
    const original = childProcess[name] as (...args: unknown[]) => unknown;
    Object.assign(childProcess, { [name]: (...args: unknown[]) => { record({ kind: name, file: args[0], args: Array.isArray(args[1]) ? args[1] : [] }); return original(...args); } });
  }
  syncBuiltinESMExports();
  const connect = Socket.prototype.connect;
  Socket.prototype.connect = function (this: Socket, ...args: unknown[]) { record({ kind: 'connect', target: args[0] }); return Reflect.apply(connect, this, args) as Socket; };
  globalThis.fetch = async input => { record({ kind: 'fetch', target: String(input) }); throw new Error('No network'); };
}
const args = JSON.parse(process.env.JEV_TEST_CLI_ARGS ?? '["mcp"]') as string[];
const worlds = JSON.parse(process.env.JEV_TEST_WORLDS!) as World[];
const probability = Number(process.env.JEV_TEST_PROBABILITY ?? '0.97');
const projectDir = join(root, 'project');
mkdirSync(join(projectDir, '.jev'), { recursive: true });
writeFileSync(join(projectDir, '.jev', 'config.json'), JSON.stringify({ drivenMode: true }));
process.env.JEV_RUNS_DIR = join(root, 'runs');
process.env.JEV_PROJECT_DIR = projectDir;
const { runCli } = await import('../../../src/cli.js');
const android = process.env.JEV_TEST_PLATFORM === 'android' ? androidTarget() : undefined;
const world = worldHost({ after: () => {} }, { root: join(root, 'host'), worlds,
  ...(android ? { identityProbe: android.options.identityProbe, adb: android.options.adb, nativeReply: android.nativeReply } : { identityProbe: fakeSimulatorProbe(UDID) }) });
world.fence.forwards.push(...JSON.parse(process.env.JEV_TEST_FOREIGN_FORWARDS ?? '[]') as typeof world.fence.forwards);
await runCli(args, { host: world.host, projectDir,
  createJudge: () => ({ async judge(assertions) {
    return { probabilities: Object.fromEntries(assertions.map(assertion => [assertion.id, probability])), inputTokens: 1, latencyMs: 1, model: 'jev-1.13.0' };
  } }),
  createDrivenJudge: () => fakeDrivenJudge(JSON.parse(process.env.JEV_TEST_DRIVEN ?? '[]') as FakeStep[]) });
writeFileSync(join(root, 'host', 'outcome.json'), JSON.stringify({ tools: world.opened.map(driver => driver.tools()), forwards: world.fence.forwards,
  writes: world.fence.effects.filter(effect => ['wda-stop', 'host-signal', 'host-signal-group', 'android-stop', 'forward-remove', 'settings-write'].includes(effect.kind)) }));
