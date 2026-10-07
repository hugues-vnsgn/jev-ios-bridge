import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ObservedActionJournal } from '../src/experimental/observed-journal.js';

test('durable intent survives frontend loss and permanently blocks a successor', async () => {
  const root = await mkdtemp(join(tmpdir(), 'observed-journal-'));
  try {
    const first = new ObservedActionJournal(root);
    const attempt = await first.begin({ deviceId: 'device', actionId: 'one', intent: { tap: 'button' } });
    const reopened = new ObservedActionJournal(root);
    assert.equal((await reopened.read('device', 'one'))?.status, 'uncertain');
    assert.equal(await reopened.deviceStatus('device'), 'quarantined');
    await assert.rejects(reopened.begin({ deviceId: 'device', actionId: 'two', intent: {} }));
    await assert.rejects(attempt.complete({ outcome: 'observed' }));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('completion is immutable, replay is refused, and a different action may proceed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'observed-journal-'));
  try {
    const journal = new ObservedActionJournal(root);
    const attempt = await journal.begin({ deviceId: 'device', actionId: 'one', intent: {} });
    await attempt.complete({ outcome: 'observed', text: 'done' });
    await assert.rejects(attempt.complete({ outcome: 'different' }));
    await assert.rejects(journal.begin({ deviceId: 'device', actionId: 'one', intent: { changed: true } }));
    assert.deepEqual((await journal.read('device', 'one'))?.result, { outcome: 'observed', text: 'done' });
    assert.equal(await journal.deviceStatus('device'), 'available');
    await (await journal.begin({ deviceId: 'device', actionId: 'two', intent: {} })).complete({});
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('concurrent submissions never both receive admission', async () => {
  const root = await mkdtemp(join(tmpdir(), 'observed-journal-'));
  try {
    const results = await Promise.allSettled(['one', 'two'].map(actionId => new ObservedActionJournal(root).begin({ deviceId: 'device', actionId, intent: {} })));
    assert.ok(results.filter(result => result.status === 'fulfilled').length <= 1);
    assert.equal(await new ObservedActionJournal(root).deviceStatus('device'), 'quarantined');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('uncertain outcomes retain quarantine across restart and do not affect a different device', async () => {
  const root = await mkdtemp(join(tmpdir(), 'observed-journal-'));
  try {
    const journal = new ObservedActionJournal(root);
    await (await journal.begin({ deviceId: 'device', actionId: 'one', intent: {} })).uncertain('lost reply');
    const reopened = new ObservedActionJournal(root);
    assert.equal((await reopened.read('device', 'one'))?.reason, 'lost reply');
    await assert.rejects(reopened.begin({ deviceId: 'device', actionId: 'two', intent: {} }));
    await (await reopened.begin({ deviceId: 'other', actionId: 'one', intent: {} })).complete({});
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('unwritable journal shape and unencodable intent cannot authorize an action', async () => {
  const root = await mkdtemp(join(tmpdir(), 'observed-journal-'));
  try {
    const { writeFile } = await import('node:fs/promises');
    const blocked = join(root, 'file');
    await writeFile(blocked, 'not a directory');
    let actions = 0;
    await assert.rejects(new ObservedActionJournal(blocked).begin({ deviceId: 'd', actionId: 'a', intent: {} }).then(() => { actions++; }));
    await assert.rejects(new ObservedActionJournal(root).begin({ deviceId: 'd', actionId: 'a', intent: 1n }).then(() => { actions++; }));
    assert.equal(actions, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('an abruptly exited real frontend cannot cause action replay', async () => {
  const root = await mkdtemp(join(tmpdir(), 'observed-journal-'));
  try {
    const { spawnSync } = await import('node:child_process');
    const module = new URL('../src/experimental/observed-journal.ts', import.meta.url).href;
    const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e',
      `import { ObservedActionJournal } from ${JSON.stringify(module)}; await new ObservedActionJournal(process.argv[1]).begin({deviceId:'d',actionId:'a',intent:{tap:'button'}}); process.exit(23);`, root], { encoding: 'utf8' });
    assert.equal(child.status, 23, child.stderr);
    const journal = new ObservedActionJournal(root);
    assert.equal((await journal.read('d', 'a'))?.status, 'uncertain');
    await assert.rejects(journal.begin({ deviceId: 'd', actionId: 'a', intent: {} }));
    await assert.rejects(journal.begin({ deviceId: 'd', actionId: 'b', intent: {} }));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('journal creates private device directories and private durable records', async () => {
  const root = await mkdtemp(join(tmpdir(), 'observed-journal-'));
  try {
    const { readdir, stat } = await import('node:fs/promises');
    const journal = new ObservedActionJournal(root);
    await (await journal.begin({ deviceId: '../../device', actionId: '../one', intent: {} })).complete({});
    const directories = await readdir(root);
    assert.equal(directories.length, 1);
    const directory = join(root, directories[0]!);
    assert.equal((await stat(directory)).mode & 0o777, 0o700);
    for (const file of await readdir(directory)) assert.equal((await stat(join(directory, file))).mode & 0o777, 0o600);
    assert.equal((await journal.read('../../device', '../one'))?.status, 'completed');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('failed durable completion leaves quarantine rather than admitting a successor', async () => {
  const root = await mkdtemp(join(tmpdir(), 'observed-journal-'));
  try {
    const journal = new ObservedActionJournal(root);
    const attempt = await journal.begin({ deviceId: 'device', actionId: 'one', intent: {} });
    await assert.rejects(attempt.complete({ invalid: 1n }));
    assert.equal(await journal.deviceStatus('device'), 'quarantined');
    await assert.rejects(new ObservedActionJournal(root).begin({ deviceId: 'device', actionId: 'two', intent: {} }));
  } finally { await rm(root, { recursive: true, force: true }); }
});
