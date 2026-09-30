import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { androidScript } from './fixtures/android-script.js';
import { installed } from './fixtures/android-tools.js';

/**
 * The CLI's SIGINT and SIGTERM handlers close the service, which calls the Android driver's own `close`
 * (release spec phase 4 item 8). The real CLI runs an Android script against a fake `adb`, a Node script
 * found through `ANDROID_HOME`, that answers like an emulator and logs every command. No agent answers on
 * the forwarded port, so the run waits in the agent's start; the signal arrives there.
 */

const FAKE_ADB = `#!${process.execPath}
const { appendFileSync } = require('node:fs');
const args = process.argv.slice(2);
appendFileSync(process.env.FAKE_ADB_LOG, JSON.stringify(args) + '\\n');
const line = args[2] === 'shell' ? args[3].replace(/'/g, '') : '';
const answers = [
  [() => args.join(' ') === 'devices -l', 'List of devices attached\\nemulator-5554          device transport_id:1\\n\\n'],
  [() => line === 'getprop ro.boot.qemu.avd_name', 'fake_avd\\n'],
  [() => line === 'ps -A -o PID,NAME,ARGS', '  PID NAME                        ARGS\\n'],
  [() => line === 'getprop ro.build.version.sdk', '34\\n'],
  [() => line === 'getprop sys.boot_completed', '1\\n'],
  [() => line.startsWith('pm path '), 'package:/data/app/base.apk\\n'],
  [() => line === 'dumpsys window policy', 'KeyguardServiceDelegate\\n    showing=false\\n    interactiveState=INTERACTIVE_STATE_AWAKE\\n'],
  [() => line.startsWith('cmd package resolve-activity'), 'priority=0\\ncom.example.android/.MainActivity\\n'],
  [() => line.startsWith('am start -W'), 'Status: ok\\n'],
];
process.stdout.write(answers.find(([matches]) => matches())?.[1] ?? '');
`;

for (const [signal, exitCode] of [['SIGINT', 130], ['SIGTERM', 143]] as const) {
  test(`${signal} closes the service, which runs the Android driver's close: the app stopped, the forward removed, the lease released`, {
    timeout: 30_000,
    // The run reads the device agent out of the real Mac mobilecli program, which CI on Linux doesn't install.
    skip: installed ? false : 'the Mac mobilecli program is not installed',
  }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'jev-android-cli-signal-'));
    try {
      const sdk = join(root, 'sdk');
      const temp = join(root, 'tmp');
      await mkdir(join(sdk, 'platform-tools'), { recursive: true });
      await mkdir(temp);
      await writeFile(join(sdk, 'platform-tools', 'adb'), FAKE_ADB);
      await chmod(join(sdk, 'platform-tools', 'adb'), 0o755);
      const log = join(root, 'adb.jsonl');
      await writeFile(log, '');
      const script = join(root, 'script.json');
      await writeFile(script, JSON.stringify(androidScript({ device: { serial: 'emulator-5554' } })));
      const env: NodeJS.ProcessEnv = { ...process.env, TYPESAFE_API_KEY: 'contract-test-key', ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk,
        PATH: root, HOME: root, TMPDIR: temp, JEV_RUNS_DIR: join(root, 'runs'), FAKE_ADB_LOG: log };
      delete env.JEV_ANDROID_DEVICE;
      const child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), join(process.cwd(), 'src/cli.ts'), 'run', script, '--no-log-pane'],
        { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
      const exited = new Promise<number | null>(resolveExit => child.once('exit', code => { resolveExit(code); }));
      const calls = async () => (await readFile(log, 'utf8')).trim().split('\n').filter(Boolean).map(entry => (JSON.parse(entry) as string[]).join(' '));
      let forward: string | undefined;
      for (let tries = 0; !forward && tries < 300; tries++) {
        await new Promise(resolveTick => setTimeout(resolveTick, 50));
        forward = (await calls()).find(call => /^-s emulator-5554 forward tcp:\d+ /.test(call));
      }
      assert.ok(forward, 'the run reached the agent\'s start');
      child.kill(signal);
      assert.equal(await exited, exitCode);
      const port = forward.split(' ')[3]!;
      const afterForward = (await calls()).slice((await calls()).indexOf(forward) + 1);
      assert.deepEqual(afterForward, [
        "-s emulator-5554 shell 'ps' '-A' '-o' 'PID,NAME,ARGS'",
        "-s emulator-5554 shell 'am' 'force-stop' 'com.example.android'",
        `-s emulator-5554 forward --remove ${port}`,
      ]);
      assert.deepEqual(await readdir(join(temp, 'jev-ios-bridge-device-locks')), [], 'the lease is released');
      const [runId] = (await readdir(join(root, 'runs'))).filter(name => !name.startsWith('.'));
      const report = JSON.parse(await readFile(join(root, 'runs', runId!, 'report.json'), 'utf8')) as { verdict: string; reason: string };
      assert.deepEqual([report.verdict, report.reason], ['inconclusive', 'CANCELLED']);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}
