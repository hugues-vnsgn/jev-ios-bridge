import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { MobileBuildMcpDriver, type CliRunner } from '../src/device/index.js';
import { DeviceLease, DeviceLeaseKeptError } from '../src/device/lease.js';

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

async function withLease(name: string, body: (lease: DeviceLease, root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), `jev-device-lease-${name}-`));
  try {
    const lease = new DeviceLease({ root });
    await lease.take('jev-actions-api31');
    await body(lease, root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('an agent request with an unknown outcome keeps the lease until fence(\'agent\')', async () => {
  await withLease('agent-fence', async (lease, root) => {
    lease.command('agent').unknown();
    assert.equal(lease.releasable, false);
    await assert.rejects(lease.release(), DeviceLeaseKeptError);
    assert.deepEqual(await readdir(root), ['JEV-ACTIONS-API31.lock']);
    lease.fence('agent');
    assert.equal(lease.releasable, true);
    await lease.release();
    assert.deepEqual(await readdir(root), []);
  });
});

test('fence(\'agent\') leaves an adb command with an unknown outcome holding the lease', async () => {
  await withLease('adb-unfenced', async (lease) => {
    lease.command('adb').unknown();
    lease.command('agent').unknown();
    lease.fence('agent');
    assert.equal(lease.releasable, false);
    await assert.rejects(lease.release(), DeviceLeaseKeptError);
    lease.fence('adb');
    await lease.release();
    assert.equal(lease.held, false);
  });
});

test('adb and agent commands in flight keep the lease until they exit, and a fence doesn\'t end one still in flight', async () => {
  await withLease('in-flight', async (lease) => {
    const adb = lease.command('adb');
    const agent = lease.command('agent');
    lease.fence('adb');
    lease.fence('agent');
    assert.equal(lease.releasable, false);
    adb.exited();
    assert.equal(lease.releasable, false);
    agent.exited();
    await lease.release();
    assert.equal(lease.held, false);
  });
});
