import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rawSha256 } from '../scripts/phase4/corpus/digest.js';
import { frozenHistoryAvailable } from '../scripts/phase4/corpus/git.js';
import { allAssets, extractAssets, parseInventory, recoverInventory, serializeInventory,
  type Inventory } from '../scripts/phase4/corpus/inventory.js';
import { main } from '../scripts/phase4/corpus/cli.js';

const repoRoot = join(import.meta.dirname, '..');
const committedPath = join(repoRoot, '.scratch', 'appium-mcp-migration', 'phase4', 'corpus', 'inventory.json');
const skip = frozenHistoryAvailable() ? false : 'frozen commits absent: shallow clone';

let recovered: Inventory | undefined;
const recover = (): Inventory => recovered ??= recoverInventory();

function claimTotals(inventory: Inventory, platform: 'ios' | 'android') {
  const screens = inventory.screens.filter(screen => screen.platform === platform);
  const truths = screens.flatMap(screen => screen.claims.map(claim => claim.truth));
  return { screens: screens.length, claims: truths.length,
    true: truths.filter(truth => truth).length, false: truths.filter(truth => !truth).length };
}

test('recovery yields 34 screens and 79 claims: iOS 24/48 and Android 10/31, in frozen order', { skip }, () => {
  const inventory = recover();
  assert.equal(inventory.screens.length, 34);
  assert.equal(inventory.screens.reduce((sum, screen) => sum + screen.claims.length, 0), 79);
  assert.deepEqual(claimTotals(inventory, 'ios'), { screens: 24, claims: 48, true: 24, false: 24 });
  assert.deepEqual(claimTotals(inventory, 'android'), { screens: 10, claims: 31, true: 18, false: 13 });
  assert.deepEqual(inventory.totals, { ios: claimTotals(inventory, 'ios'), android: claimTotals(inventory, 'android') });
  assert.equal(inventory.screens[0]?.screenId, 's01-weather-ber-query');
  assert.equal(inventory.screens[24]?.screenId, 'twin-1-choose');
  assert.deepEqual(inventory.screens[2]?.claims.map(claim => claim.originalId), ['b', 'a']);
  const cmp3 = inventory.screens.find(screen => screen.screenId === 'cmp-3-number-input');
  assert.deepEqual(cmp3?.claims.map(claim => claim.originalId), ['t', 'f', 'b', 'b2']);
  assert.equal(cmp3?.app.confirmed, false);
});

test('the recorded iOS corpus and manifest canonical digests reproduce, and both files are unchanged at the approval', { skip }, () => {
  const { ios } = recover();
  assert.equal(ios.corpus.canonical.recorded, '4d7e3853e79c7ffd3315ce9d908ebe9d4685ce28cff59674470ca0f861b43303');
  assert.equal(ios.corpus.canonical.recomputed, ios.corpus.canonical.recorded);
  assert.equal(ios.frozenManifest.canonical.recorded, 'f2371bbcde3c6c9086d1bc924da04f32265e3a2fd979440a2b63cb0f7f53badf');
  assert.equal(ios.frozenManifest.canonical.recomputed, ios.frozenManifest.canonical.recorded);
  assert.equal(ios.corpus.byteIdenticalAt2ac157a07, true);
  assert.equal(ios.frozenManifest.byteIdenticalAt2ac157a07, true);
  assert.equal(ios.frozenManifest.pins.model, 'jev-1.13.0');
  assert.equal(ios.frozenManifest.pins.projectionRule, 'visible-full-text-v1');
  assert.equal(ios.approval.approved, true);
});

test('all 48 iOS full-capture and screenshot hashes recorded in the corpus match the frozen bytes', { skip }, () => {
  const { ios, screens } = recover();
  assert.equal(ios.assetChecks.length, 48);
  for (const check of ios.assetChecks) assert.equal(check.recomputed, check.recorded, `${check.screenId} ${check.asset}`);
  for (const screen of screens.filter(screen => screen.platform === 'ios')) {
    assert.deepEqual(screen.assets.map(asset => asset.role), ['ios-full-capture', 'ios-screenshot', 'ios-snapshot', 'ios-meta']);
  }
});

test('the iOS prior run is its own old-provider record and the two preflight cases are excluded, not scored', { skip }, () => {
  const { ios, screens } = recover();
  assert.equal(ios.priorRun.provider, 'old provider');
  assert.equal(ios.priorRun.results.length, 24);
  assert.deepEqual(ios.priorRun.results[2], { screenId: 's03-weather-berlin-main', probabilities: { b: 0.98, a: 0.01 }, model: 'jev-1.13.0' });
  assert.deepEqual(ios.excluded.map(entry => entry.caseId),
    ['s07-contacts-tessa-duplicate-list', 's09-contacts-tessa-old-email-visible']);
  for (const entry of ios.excluded) assert.equal(entry.assets.length, 4);
  assert.equal(screens.filter(screen => screen.screenId === 's07-contacts-tessa-duplicate-list').length, 1);
});

test('Android keeps the original run, with its one confidently wrong answer, apart from the four-claim correction', { skip }, () => {
  const { android } = recover();
  const original = android.originalRun;
  assert.equal(original.commit, '755d0ff8ff40ea70f36fe888a1571e60cc64f08c');
  assert.equal(original.claims.length, 31);
  assert.equal(original.usage.length, 10);
  const wrong = original.claims.filter(row => row.outcome === 'CONFIDENTLY WRONG');
  assert.deepEqual(wrong.map(row => [row.screenId, row.originalId, row.probability]), [['cmp-3-number-input', 'b2', 0.96]]);
  const correction = android.placeholderCorrection;
  assert.equal(correction.commit, '2366759d0832065674c8e353d3eb1ad0bf326cea');
  assert.equal(correction.claims.length, 4);
  assert.equal(correction.usage.length, 1);
  assert.ok(correction.claims.every(row => row.screenId === 'cmp-3-number-input'));
  assert.equal(correction.claims.find(row => row.originalId === 'b2')?.probability, 0.65);
  assert.match(correction.scope, /not a whole-corpus pass/);
  assert.ok(original.assets.some(asset => asset.role === 'android-observation' && asset.commit === original.commit));
  assert.ok(correction.assets.some(asset => asset.role === 'android-corrected-observation' && asset.commit === correction.commit));
  for (const check of android.recordedDigests) assert.equal(check.recomputed, check.recorded, check.path);
  assert.equal(android.recordedDigests.length, 3);
  assert.deepEqual(android.captures.identicalAt,
    ['755d0ff8ff40ea70f36fe888a1571e60cc64f08c', '2366759d0832065674c8e353d3eb1ad0bf326cea']);
});

test('two recoveries serialize byte for byte the same, and equal the committed inventory.json', { skip }, () => {
  const first = serializeInventory(recover());
  const second = serializeInventory(recoverInventory());
  assert.equal(second, first);
  assert.equal(readFileSync(committedPath, 'utf8'), first);
});

test('the CLI recover --check passes against the committed inventory', { skip }, async () => {
  const lines: string[] = [];
  const code = await main(['recover', '--check'], { cwd: repoRoot, env: {}, out: line => lines.push(line),
    createClient: () => assert.fail('recover never creates a client') });
  assert.equal(code, 0, lines.join('\n'));
});

test('extraction writes every inventoried asset from git objects, each matching its recorded hash', { skip }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'phase4-extract-'));
  try {
    const inventory = recover();
    const written = extractAssets(inventory, dir);
    const assets = allAssets(inventory);
    assert.equal(written.length, assets.length);
    for (const asset of assets) {
      assert.equal(rawSha256(readFileSync(join(dir, asset.commit, asset.path))), asset.sha256, asset.path);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the committed inventory.json parses and carries the frozen totals without host details', () => {
  const text = readFileSync(committedPath, 'utf8');
  const inventory = parseInventory(JSON.parse(text));
  assert.deepEqual(inventory.totals, {
    ios: { screens: 24, claims: 48, true: 24, false: 24 },
    android: { screens: 10, claims: 31, true: 18, false: 13 },
  });
  assert.ok(text.endsWith('}\n'));
  assert.doesNotMatch(text, /\/Users\/|\/home\/|[A-Za-z]:\\\\/);
});
