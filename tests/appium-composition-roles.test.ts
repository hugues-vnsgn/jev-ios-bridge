import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ComposedAppiumDriver, type AppiumHost } from '../src/appium/composition.js';
import { Admission, AdmissionError } from '../src/device/admission.js';

test('a composed driver names its device or holds an admission claim, and a claim-only driver refuses a named prepare', async t => {
  const host: AppiumHost = async () => assert.fail('a refused prepare builds no parts');
  // @ts-expect-error A driver with neither a named device nor an admission has no device to drive.
  const unnamed = () => new ComposedAppiumDriver({ host });
  assert.equal(typeof unnamed, 'function');
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'jev-roles-store-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const claimOnly = new ComposedAppiumDriver({ host, admission: Admission.forTesting({ root, backend: 'fake', durability: 'fast' }) });
  await assert.rejects(claimOnly.prepare({ app: { bundleId: 'example.app' } }, AbortSignal.timeout(1000)),
    (error: unknown) => error instanceof AdmissionError && error.code === 'INVALID_REQUEST' && error.message === 'This driver has no named device');
});
