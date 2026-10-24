import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { androidScript } from './fixtures/android-script.js';

for (const [signal, exitCode] of [['SIGINT', 130], ['SIGTERM', 143]] as const) {
  test(`${signal} closes the Android service, fences recorded components and releases the marker`, { timeout: 30_000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'jev-android-cli-signal-'));
    let child: ReturnType<typeof spawn> | undefined;
    try {
      const script = join(root, 'script.json');
      await writeFile(script, JSON.stringify(androidScript({ device: { serial: 'emulator-5554' } })));
      const entry = join(root, 'cli-fixture.mjs');
      await writeFile(entry, `
import { appendFileSync } from 'node:fs';
import { runCli } from ${JSON.stringify(new URL('../src/cli.ts', import.meta.url).href)};
import { BridgeService } from ${JSON.stringify(new URL('../src/service.ts', import.meta.url).href)};
import { createLegacyDriverFactory } from ${JSON.stringify(new URL('../src/device/legacy-factory.ts', import.meta.url).href)};
import { createAssertionJudge } from ${JSON.stringify(new URL('../src/scripted/jev.ts', import.meta.url).href)};
import { PINNED_AGENT_SHA256 } from ${JSON.stringify(new URL('../src/device/android/agent-supply.ts', import.meta.url).href)};
import { AGENT_CACHE, FakeAdb, FakeStreams, fakeAgents, fakeClock, fakeAndroidAdmission } from ${JSON.stringify(new URL('./fixtures/android-device.ts', import.meta.url).href)};
const root = ${JSON.stringify(root)};
const adb = new FakeAdb({ serial: 'emulator-5554', avd: 'signal-test' });
const agents = fakeAgents(adb);
const streams = new FakeStreams(adb);
const runner = async (...args) => {
  appendFileSync(root + '/adb.jsonl', JSON.stringify(args[0]) + '\\n');
  return adb.run(...args);
};
await runCli(process.argv.slice(2), { legacy: new BridgeService({ baseDir: root + '/runs',
  createDriver: createLegacyDriverFactory({ android: {
    admission: fakeAndroidAdmission(root), fakeBackend: true, identityProbe: adb.identityProbe,
    runner, leaseRoot: root + '/markers', clock: fakeClock(), freePort: async () => 49526,
    logcat: streams, logFolder: root,
    tools: async () => ({ adb: '/fake/adb', agent: { path: AGENT_CACHE, sha256: PINNED_AGENT_SHA256 } }),
    agentClient: port => ({ ...agents.agentClient(port), async dumpUi(_wait, signal) {
      process.send({ stage: 'screen-read' });
      return new Promise((_, reject) => {
        if (signal.aborted) reject(signal.reason);
        else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    } }),
  } }), createJudge: () => createAssertionJudge(),
}) });
`);
      const env: NodeJS.ProcessEnv = { ...process.env, TYPESAFE_API_KEY: 'contract-test-key', HOME: root };
      delete env.JEV_ANDROID_DEVICE;
      child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), entry, 'run', script, '--no-log-pane'],
        { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
      let stderr = '';
      child.stderr!.on('data', bytes => { stderr += String(bytes); });
      const exited = new Promise<number | null>((resolveExit, reject) => {
        child!.once('exit', resolveExit);
        child!.once('error', reject);
      });
      await new Promise<void>((resolveReady, reject) => {
        const deadline = setTimeout(() => reject(new Error(`CLI never reached screen-read: ${stderr}`)), 20_000);
        child!.once('message', message => {
          clearTimeout(deadline);
          try { assert.deepEqual(message, { stage: 'screen-read' }); resolveReady(); }
          catch (error) { reject(error); }
        });
        void exited.then(code => { clearTimeout(deadline); reject(new Error(`CLI exited before signal: ${String(code)} ${stderr}`)); });
      });
      child.kill(signal);
      assert.equal(await exited, exitCode, stderr);
      const calls = (await readFile(join(root, 'adb.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line) as string[]);
      assert.ok(calls.some(args => args[3] === "'kill' '7001'"), 'the recorded agent is fenced');
      assert.ok(calls.some(args => args[3] === "'am' 'force-stop' 'com.example.android'"), 'the app is stopped');
      assert.ok(calls.some(args => args[2] === 'forward' && args[3] === '--remove'), 'the forward is removed');
      assert.deepEqual(await readdir(join(root, 'markers')), [], 'the acknowledged read and fenced components permit release');
      const [runId] = (await readdir(join(root, 'runs'))).filter(name => !name.startsWith('.'));
      const report = JSON.parse(await readFile(join(root, 'runs', runId!, 'report.json'), 'utf8')) as { verdict: string; reason: string };
      assert.deepEqual([report.verdict, report.reason], ['inconclusive', 'CANCELLED']);
    } finally {
      if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await rm(root, { recursive: true, force: true });
    }
  });
}
