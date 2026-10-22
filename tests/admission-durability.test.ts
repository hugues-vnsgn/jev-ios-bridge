import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { Admission } from '../src/device/admission.js';
import { AdmissionSqlite, type StoreOptions } from '../src/device/admission-sqlite.js';

for (const durability of [undefined, 'full', 'fast'] as const) {
  test(`test admission ${durability ?? 'default'} durability applies to initialization and every reopened connection`, async t => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'jev-durability-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const settings: { synchronous: unknown; fullfsync: unknown; journal: unknown }[] = [];
    const execute = DatabaseSync.prototype.exec;
    t.mock.method(DatabaseSync.prototype, 'exec', function(this: DatabaseSync, sql: string) {
      execute.call(this, sql);
      settings.push({ synchronous: this.prepare('PRAGMA synchronous').get()!.synchronous,
        fullfsync: this.prepare('PRAGMA fullfsync').get()!.fullfsync,
        journal: this.prepare('PRAGMA journal_mode').get()!.journal_mode });
    });
    const admission = Admission.forTesting({ root, backend: 'fake', ...(durability ? { durability } : {}) });
    const attempt = { kind: 'legacy' as const, id: 'policy' };
    const acquired = admission.acquire({ device: 'abcdef00-0000-4000-8000-000000000001', attempt, digest: 'policy', intent: {} });
    assert.equal(acquired.kind, 'acquired');
    if (acquired.kind !== 'acquired') assert.fail('Expected owner');
    await acquired.claim.bindDriver('fake').dispatch('read', async () => undefined);
    assert.ok(admission.readAttempt(attempt));
    assert.ok(settings.length >= 5, 'initialization, admission, authorization, settlement and read use checked connections');
    const expected = durability === 'fast' ? { synchronous: 0, fullfsync: 0, journal: 'delete' }
      : { synchronous: 3, fullfsync: 1, journal: 'delete' };
    for (const setting of settings) assert.deepEqual(setting, expected);
    assert.throws(() => admission.assertBackend('real'), { code: 'STATE_UNAVAILABLE' });
  });
}

test('production composition cannot select fast durability, including from untyped callers', () => {
  // @ts-expect-error Fast durability is excluded from production StoreOptions.
  const options: StoreOptions = { root: '/does-not-exist', mode: 'production', durability: 'fast' };
  assert.throws(() => new AdmissionSqlite(options), { code: 'INVALID_REQUEST' });
});
