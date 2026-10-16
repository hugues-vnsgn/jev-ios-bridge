import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, realpathSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ObservedActionJournal } from '../src/experimental/observed-journal.js';

test('the historical raw-root writer refuses without creating an alternate admission journal', async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'observed-journal-')));
  t.after(() => rmSync(root, { recursive: true, force: true })); const path = join(root, 'journal');
  const journal = new ObservedActionJournal(path);
  await assert.rejects(journal.begin({ deviceId: 'ABCDEF00-0000-4000-8000-000000000001', actionId: 'one', intent: {} }),
    { code: 'MIGRATION_REQUIRED' });
  assert.equal(existsSync(path), false);
});
