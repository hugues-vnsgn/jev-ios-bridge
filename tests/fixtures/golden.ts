import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Shared golden-file check for test files other than tests/contract.test.ts, which keeps its own copy of
 * this helper for the 1.x contract goldens. This one is for goldens outside that promise, for example the
 * Android renderer's frozen output: a single string, not a general JSON object, frozen per ADR-0004 (the
 * observation text is fixed) and exercising the Android view ADR-0006 sets out.
 *
 * `path` is the golden file's full path, JSON-encoding `actual`. `UPDATE_GOLDEN=1 npm test` (re)writes it;
 * review the diff before committing.
 */
export async function checkGolden(path: string, actual: unknown): Promise<void> {
  const text = JSON.stringify(actual, null, 2) + '\n';
  if (process.env.UPDATE_GOLDEN === '1') {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text);
    return;
  }
  let expected: string;
  try { expected = await readFile(path, 'utf8'); }
  catch { assert.fail(`Missing golden file ${path}; run UPDATE_GOLDEN=1 npm test and review it`); }
  assert.deepEqual(JSON.parse(text), JSON.parse(expected), `Frozen surface changed: ${path}`);
}
