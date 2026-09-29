import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { MobileBuildMcpDriver, type CliRunner } from '../src/device/index.js';

const udid = '0E42FDE2-5E09-42D3-9876-9EF0037FCBE7';
const scenario = { app: { bundleId: 'com.example.app' }, device: { udid } };

function reply(args: string[]): string {
  const schema = args.includes('launch-app') ? 'mobilebuildmcp.output.launch-result' : 'mobilebuildmcp.output.stop-result';
  return JSON.stringify({ schema, schemaVersion: '2', didError: false, error: null,
    data: { summary: { status: 'SUCCEEDED' }, artifacts: { simulatorId: udid }, diagnostics: {} } });
}
const runner: CliRunner = async (args) => ({ stdout: reply(args), stderr: '', exitCode: 0 });

test('the iOS driver writes the lease file a 1.1 bridge reads: exactly pid, token, deviceId, createdAt', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-lease-shape-'));
  const driver = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner });
  try {
    await driver.prepare(scenario, new AbortController().signal);
    const written = JSON.parse(await readFile(join(root, `${udid}.lock`), 'utf8')) as Record<string, unknown>;
    assert.deepEqual(Object.keys(written), ['pid', 'token', 'deviceId', 'createdAt']);
    assert.equal(written.pid, process.pid);
    assert.equal(written.deviceId, udid);
  } finally {
    await driver.close(new AbortController().signal);
    await rm(root, { recursive: true, force: true });
  }
});

test('a lease file that can no longer be read at release makes close fail and stays in place', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-device-lease-corrupt-'));
  const driver = new MobileBuildMcpDriver({ cwd: root, lockRoot: root, runner });
  try {
    await driver.prepare(scenario, new AbortController().signal);
    const path = join(root, `${udid}.lock`);
    await writeFile(path, '{not json');
    await assert.rejects(driver.close(new AbortController().signal), SyntaxError);
    assert.deepEqual(await readdir(root), [`${udid}.lock`]);
    assert.equal(await readFile(path, 'utf8'), '{not json');
  } finally { await rm(root, { recursive: true, force: true }); }
});
