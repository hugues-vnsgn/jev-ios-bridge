import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test, type TestContext } from 'node:test';

const helper = resolve('.agents/skills/verify-jev-ios-bridge/scripts/verify.mjs');
const UDID = '6A3C1E52-0B7D-4F4E-9C1A-2D8E5F7B9A10';
const hour = 3_600_000;

function scratch(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'p4-verify-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function record(root: string, fields: Record<string, unknown> = {}) {
  const path = join(root, 'assignment.json');
  writeFileSync(path, JSON.stringify({ version: 1, kind: 'device-assignment', assignedBy: 'owner', device: UDID, category: 'ios-simulator',
    custody: { from: new Date(Date.now() - hour).toISOString(), until: new Date(Date.now() + hour).toISOString() }, ...fields }), { mode: 0o600 });
  return path;
}
const verify = (args: string[]) => spawnSync(process.execPath, [helper, ...args], { encoding: 'utf8', timeout: 60_000 });

test('the assignment mode copies a valid owner record for the named simulator into the evidence folder', t => {
  const root = scratch(t);
  const evidence = join(root, 'evidence');
  const result = verify(['assignment', '--record', record(root), '--device', UDID.toLowerCase(), '--evidence', evidence]);
  assert.equal(result.status, 0, result.stderr);
  const saved = JSON.parse(readFileSync(join(evidence, 'assignment.json'), 'utf8')) as { record: { device: string; category: string }; sha256: string };
  assert.deepEqual([saved.record.device, saved.record.category], [UDID, 'ios-simulator']);
  assert.match(saved.sha256, /^[a-f0-9]{64}$/);
});

test('the assignment mode refuses a missing record, another device and an ended custody window, and saves nothing', t => {
  const root = scratch(t);
  const evidence = join(root, 'evidence');
  const cases = [
    ['--record', join(root, 'absent.json'), '--device', UDID],
    ['--record', record(root), '--device', '2985e9c'],
    ['--record', record(root, { custody: { from: new Date(Date.now() - 2 * hour).toISOString(), until: new Date(Date.now() - hour).toISOString() } }), '--device', UDID],
  ];
  for (const args of cases) {
    const result = verify(['assignment', ...args, '--evidence', evidence]);
    assert.notEqual(result.status, 0, `refused: ${args.join(' ')}`);
    assert.match(result.stderr, /assignment/i);
  }
  assert.equal(existsSync(join(evidence, 'assignment.json')), false);
});

test('doctor refuses phone 2985e9c without an owner assignment record for it, before reading any build or device', t => {
  const root = scratch(t);
  const result = verify(['doctor', '--serial', '2985e9c', '--evidence', join(root, 'evidence')]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /owner assignment record/);
});
