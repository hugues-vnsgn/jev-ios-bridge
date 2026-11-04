import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { main } from '../scripts/phase4/live/run.js';
import { UDID } from './fixtures/appium-wire/driver-fixture.js';
import { filesContaining } from './fixtures/appium-wire/matrix.js';
import { FAKE_VERSIONS, MATRIX, NOW, custody, fakeDeps, idleBackend, scratch, writeActivation, writeAssignment } from './fixtures/phase4-live/records.js';
import { IOS_SCENARIO, worldCycles } from './fixtures/phase4-live/world-cycles.js';

const KEY = 'fake-jev-key-9f3e';
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
const lines = (path: string) => readFileSync(path, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>);
const attempt = (evidence: string, row: string, n = 1) => join(evidence, row, `attempt-${String(n)}`);
const verdictOf = (evidence: string, row: string, n = 1) => readJson(join(attempt(evidence, row, n), 'verdict.json')) as Record<string, unknown>;
const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const matrixRow = (id: string) => (readJson(MATRIX) as { rows: { id: string; steps: string[] }[] }).rows.find(row => row.id === id)!;
const guards = (assignment: string, evidence: string, device = UDID) => ['--assignment', assignment, '--device', device, '--evidence', evidence, '--matrix', MATRIX];
const run = (assignment: string, evidence: string, rows: string, ...extra: string[]) => ['run', ...guards(assignment, evidence), '--rows', rows, ...extra];
const snapshot = (folder: string): Record<string, string> => Object.fromEntries(readdirSync(folder, { recursive: true, encoding: 'utf8' }).sort()
  .map(name => [name, statSync(join(folder, name)).isDirectory() ? 'dir' : readFileSync(join(folder, name), 'utf8')]));

test('run refuses to start without a valid owner assignment for the named device, or on an unknown row, and writes nothing', async t => {
  const root = scratch(t);
  const evidence = join(root, 'evidence');
  const valid = writeAssignment(root, {}, 0o600, 'valid.json');
  const cases: [string, string[], RegExp][] = [
    ['no assignment file', run(join(root, 'absent.json'), evidence, 'logs-plain'), /absent\.json/],
    ['custody ended', run(writeAssignment(root, { custody: custody(-3, -1) }, 0o600, 'ended.json'), evidence, 'logs-plain'), /custody/],
    ['custody not begun', run(writeAssignment(root, { custody: custody(1, 3) }, 0o600, 'later.json'), evidence, 'logs-plain'), /custody/],
    ['another simulator', ['run', ...guards(valid, evidence, '11111111-2222-4333-8444-555555555555'), '--rows', 'logs-plain'], /device/],
    ['a record others can write', run(writeAssignment(root, {}, 0o620, 'writable.json'), evidence, 'logs-plain'), /writable/],
    ['a record that is not an assignment', run(writeAssignment(root, { assignedBy: 'agent' }, 0o600, 'agent.json'), evidence, 'logs-plain'), /invalid/],
    ['an unknown row', run(valid, evidence, 'logs-plain,no-such-row'), /no-such-row/],
  ];
  for (const [name, argv, message] of cases) {
    const { deps, out, err } = fakeDeps(root);
    assert.equal(await main(argv, deps), 3, `${name} is refused before any row runs`);
    assert.deepEqual(out, [], `${name}: nothing on stdout`);
    assert.match(err.join('\n'), message, `${name}: stderr says why`);
    assert.equal(existsSync(evidence), false, `${name}: no evidence folder is created`);
  }
  const { deps } = fakeDeps(root);
  assert.equal(await main(run(valid, evidence, 'logs-plain', '--cycles', '0'), deps), 2, 'fewer than one cycle is a usage error');
  assert.equal(existsSync(evidence), false);
});

test('assignment prints the parsed record with its absolute path and sha256, and refuses another device with nothing on stdout', async t => {
  const root = scratch(t);
  const path = writeAssignment(root, { device: UDID.toLowerCase() });
  const { deps, out, err } = fakeDeps(root);
  assert.equal(await main(['assignment', '--assignment', 'assignment.json', '--device', UDID], deps), 0, err.join('\n'));
  assert.equal(out.length, 1, 'exactly one JSON object');
  assert.deepEqual(JSON.parse(out[0]!), { record: { version: 1, kind: 'device-assignment', assignedBy: 'owner', device: UDID, category: 'ios-simulator', custody: custody(-1, 1) },
    path, sha256: sha256(path) }, 'the UDID is canonical uppercase and the relative path resolves against the working folder');
  const other = fakeDeps(root);
  assert.equal(await main(['assignment', '--assignment', path, '--device', '2985e9c'], other.deps), 3);
  assert.deepEqual(other.out, []);
  assert.match(other.err.join('\n'), /2985e9c/);
  assert.deepEqual(readdirSync(root), ['assignment.json'], 'assignment writes nothing');
});

test('a store row is refused without a valid activation record while a plain row in the same run is left for the operator', async t => {
  const root = scratch(t);
  const evidence = join(root, 'evidence');
  const assignment = writeAssignment(root);
  const { deps } = fakeDeps(root);
  assert.equal(await main(run(assignment, evidence, 'ownership-store,logs-plain'), deps), 1, 'a refused row fails the run');
  assert.deepEqual([verdictOf(evidence, 'ownership-store').verdict, verdictOf(evidence, 'ownership-store').reason], ['refused', 'activation-missing']);
  assert.deepEqual(verdictOf(evidence, 'logs-plain'), { verdict: 'untested', reason: 'awaiting operator', at: NOW.toISOString(), steps: matrixRow('logs-plain').steps });
  const ended = writeActivation(root, { window: custody(-2, -1) });
  assert.equal(await main(run(assignment, evidence, 'ownership-store', '--activation', ended), deps), 1);
  assert.deepEqual([verdictOf(evidence, 'ownership-store', 2).verdict, verdictOf(evidence, 'ownership-store', 2).reason], ['refused', 'activation-outside-window']);
  assert.equal(await main(run(assignment, evidence, 'ownership-store', '--activation', writeActivation(root)), deps), 0);
  assert.equal(verdictOf(evidence, 'ownership-store', 3).verdict, 'untested');
  assert.deepEqual((readJson(join(attempt(evidence, 'ownership-store', 3), 'assignment.json')) as { activation: { record: { kind: string } } }).activation.record.kind, 'store-activation');
});

test('a phone row is refused on an emulator assignment, a Jev row without the key, and a cycles row without a matching scenario', async t => {
  const root = scratch(t);
  const evidence = join(root, 'evidence');
  const emulator = writeAssignment(root, { device: 'emulator-5554', category: 'android-emulator' }, 0o600, 'emulator.json');
  const { deps } = fakeDeps(root);
  assert.equal(await main(['run', ...guards(emulator, evidence, 'emulator-5554'), '--rows', 'phone-only'], deps), 1);
  assert.deepEqual([verdictOf(evidence, 'phone-only').verdict, verdictOf(evidence, 'phone-only').reason], ['refused', 'category-mismatch']);
  const ios = writeAssignment(root);
  assert.equal(await main(run(ios, evidence, 'driven-jev'), deps), 1);
  assert.deepEqual([verdictOf(evidence, 'driven-jev').verdict, verdictOf(evidence, 'driven-jev').reason], ['refused', 'jev-key-missing']);
  const activation = writeActivation(root);
  assert.equal(await main(run(ios, evidence, 'cleanup-cycles', '--activation', activation), deps), 1);
  assert.deepEqual([verdictOf(evidence, 'cleanup-cycles').verdict, verdictOf(evidence, 'cleanup-cycles').reason], ['refused', 'scenario-missing']);
  const elsewhere = join(root, 'elsewhere.json');
  writeFileSync(elsewhere, readFileSync(IOS_SCENARIO, 'utf8').replace(UDID, '11111111-2222-4333-8444-555555555555'));
  assert.equal(await main(run(ios, evidence, 'cleanup-cycles', '--activation', activation, '--scenario', elsewhere), deps), 1);
  assert.deepEqual([verdictOf(evidence, 'cleanup-cycles', 2).verdict, verdictOf(evidence, 'cleanup-cycles', 2).reason], ['refused', 'scenario-refused']);
});

test('each attempt writes the named evidence files privately, and a second run opens attempt-2 without touching attempt-1', async t => {
  const root = scratch(t);
  const evidence = join(root, 'evidence');
  const assignment = writeAssignment(root);
  const { deps } = fakeDeps(root);
  assert.equal(await main(run(assignment, evidence, 'logs-plain'), deps), 0);
  const first = attempt(evidence, 'logs-plain');
  assert.deepEqual(readdirSync(first).sort(), ['artifacts.json', 'assignment.json', 'commands.jsonl', 'outputs', 'row.json', 'verdict.json', 'versions.json']);
  for (const folder of [evidence, join(evidence, 'logs-plain'), first, join(first, 'outputs')]) assert.equal(statSync(folder).mode & 0o777, 0o700, `${folder} is private`);
  for (const file of readdirSync(first).filter(name => name !== 'outputs')) assert.equal(statSync(join(first, file)).mode & 0o777, 0o600, `${file} is private`);
  assert.deepEqual(readJson(join(first, 'row.json')), matrixRow('logs-plain'));
  assert.deepEqual(readJson(join(first, 'assignment.json')), { assignment: { record: { version: 1, kind: 'device-assignment', assignedBy: 'owner', device: UDID,
    category: 'ios-simulator', custody: custody(-1, 1) }, path: assignment, sha256: sha256(assignment) } });
  assert.deepEqual(readJson(join(first, 'versions.json')), FAKE_VERSIONS);
  assert.deepEqual([readFileSync(join(first, 'commands.jsonl'), 'utf8'), readJson(join(first, 'artifacts.json')), readdirSync(join(first, 'outputs'))], ['', [], []]);
  const before = snapshot(first);
  assert.equal(await main(run(assignment, evidence, 'logs-plain'), deps), 0);
  assert.equal(verdictOf(evidence, 'logs-plain', 2).verdict, 'untested');
  assert.deepEqual(snapshot(first), before, 'attempt-1 is untouched');
});

test('record runs a command without a shell, keeps its output and exit code, and passes and masks the Jev key only as the row needs', async t => {
  const root = scratch(t);
  const evidence = join(root, 'evidence');
  const assignment = writeAssignment(root);
  const { deps, err } = fakeDeps(root, { env: { TYPESAFE_API_KEY: KEY } });
  const script = "process.stdout.write('out:' + process.env.TYPESAFE_API_KEY + ':' + process.argv[1]); process.stderr.write('err:' + process.env.TYPESAFE_API_KEY); process.exit(4)";
  const record = (row: string) => ['record', ...guards(assignment, evidence), '--row', row, '--', process.execPath, '-e', script, `${KEY}; echo shell`];
  assert.equal(await main(record('logs-plain'), deps), 3, 'a row with no open attempt records nothing');
  assert.match(err.join('\n'), /attempt/);
  assert.equal(existsSync(evidence), false);
  assert.equal(await main(run(assignment, evidence, 'driven-jev,logs-plain'), deps), 0);
  assert.equal(await main(record('driven-jev'), deps), 0, 'a recorded command exits 0 whatever its own exit code');
  assert.equal(await main(record('driven-jev'), deps), 0);
  assert.equal(await main(record('logs-plain'), deps), 0);
  const jev = attempt(evidence, 'driven-jev');
  assert.equal(readFileSync(join(jev, 'outputs', '1.stdout'), 'utf8'), 'out:[REDACTED]:[REDACTED]; echo shell', 'the key reaches a Jev row and is masked, and no shell reads the argument');
  assert.equal(readFileSync(join(jev, 'outputs', '1.stderr'), 'utf8'), 'err:[REDACTED]');
  assert.deepEqual(lines(join(jev, 'commands.jsonl')), [1, 2].map(seq => ({ seq, argv: [process.execPath, '-e', script, '[REDACTED]; echo shell'], cwd: root,
    startedAt: NOW.toISOString(), endedAt: NOW.toISOString(), exitCode: 4, signal: null, stdout: `outputs/${String(seq)}.stdout`, stderr: `outputs/${String(seq)}.stderr` })));
  assert.equal(readFileSync(join(attempt(evidence, 'logs-plain'), 'outputs', '1.stdout'), 'utf8'), 'out:undefined:[REDACTED]; echo shell', 'a row without needs.jevKey never gets the key');
  assert.equal(statSync(join(jev, 'outputs', '1.stdout')).mode & 0o777, 0o600);
  assert.deepEqual(await filesContaining(evidence, KEY), [], 'the key is in no evidence file');
});

test('verdict records each artifact by absolute path, size and sha256, refuses a missing artifact, and closes the attempt', async t => {
  const root = scratch(t);
  const evidence = join(root, 'evidence');
  const assignment = writeAssignment(root);
  const { deps } = fakeDeps(root);
  assert.equal(await main(run(assignment, evidence, 'logs-plain'), deps), 0);
  const pane = join(root, 'pane.txt');
  writeFileSync(pane, 'printed line');
  const verdict = (...extra: string[]) => ['verdict', ...guards(assignment, evidence), '--row', 'logs-plain', '--verdict', 'passed', '--reason', 'The print appeared', ...extra];
  assert.equal(await main(verdict('--artifact', pane, '--artifact', join(root, 'absent.png')), deps), 3, 'a missing artifact is refused');
  assert.equal(verdictOf(evidence, 'logs-plain').verdict, 'untested', 'nothing was written');
  assert.deepEqual(readJson(join(attempt(evidence, 'logs-plain'), 'artifacts.json')), []);
  assert.equal(await main(verdict('--artifact', 'pane.txt'), deps), 0);
  assert.deepEqual(verdictOf(evidence, 'logs-plain'), { verdict: 'passed', reason: 'The print appeared', at: NOW.toISOString() });
  assert.deepEqual(readJson(join(attempt(evidence, 'logs-plain'), 'artifacts.json')), [{ path: pane, size: 12, sha256: sha256(pane) }]);
  assert.equal(await main(verdict(), deps), 3, 'a closed attempt takes no second verdict');
});

test('a cycles row runs 20 world cycles through the cycle backend, records each in cycles.jsonl and passes', { timeout: 240_000 }, async t => {
  const root = scratch(t);
  const evidence = join(root, 'evidence');
  const { f, backend } = worldCycles(t, { platform: 'ios' });
  const { deps, err } = fakeDeps(root, { cycleBackend: async input => backend(input.scenario, input.logRoot) });
  assert.equal(await main(run(writeAssignment(root), evidence, 'cleanup-cycles', '--activation', writeActivation(root), '--scenario', IOS_SCENARIO), deps), 0, err.join('\n'));
  const cycles = lines(join(attempt(evidence, 'cleanup-cycles'), 'cycles.jsonl'));
  assert.deepEqual(cycles.map(cycle => [cycle.cycle, cycle.device, cycle.leftovers]), Array.from({ length: 20 }, (_, index) => [index + 1, 'available', []]));
  assert.equal(new Set(cycles.map(cycle => (cycle.attempt as { id: string }).id)).size, 20);
  assert.equal(verdictOf(evidence, 'cleanup-cycles').verdict, 'passed');
  assert.deepEqual(f.fence.wda, []);
});

test('a cycles row fails with too few cycles under 20, and with the failing cycle when one is not released', async t => {
  const root = scratch(t);
  const evidence = join(root, 'evidence');
  const assignment = writeAssignment(root);
  const activation = writeActivation(root);
  const { deps } = fakeDeps(root, { cycleBackend: async () => idleBackend() });
  assert.equal(await main(run(assignment, evidence, 'cleanup-cycles', '--activation', activation, '--scenario', IOS_SCENARIO, '--cycles', '3'), deps), 1);
  assert.equal(lines(join(attempt(evidence, 'cleanup-cycles'), 'cycles.jsonl')).length, 3);
  assert.deepEqual([verdictOf(evidence, 'cleanup-cycles').verdict, verdictOf(evidence, 'cleanup-cycles').reason], ['failed', 'too few cycles']);
  const held = fakeDeps(root, { cycleBackend: async () => idleBackend({ quarantineAt: 2 }) });
  assert.equal(await main(run(assignment, evidence, 'cleanup-cycles', '--activation', activation, '--scenario', IOS_SCENARIO), held.deps), 1);
  assert.equal(lines(join(attempt(evidence, 'cleanup-cycles', 2), 'cycles.jsonl')).length, 2, 'no cycle runs after the first failure');
  const failed = verdictOf(evidence, 'cleanup-cycles', 2);
  assert.equal(failed.verdict, 'failed');
  assert.match(String(failed.reason), /cycle 2\b.*quarantined/);
});
