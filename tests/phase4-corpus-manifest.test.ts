import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { parseInventory } from '../scripts/phase4/corpus/inventory.js';
import { attachCapture, generateManifest, jsonText, parseManifest, PIPELINE_FILES, verifyManifest,
  type PreregistrationManifest, type Refusal } from '../scripts/phase4/corpus/manifest.js';

const repoRoot = join(import.meta.dirname, '..');
const kitDir = join(repoRoot, '.scratch', 'appium-mcp-migration', 'phase4', 'corpus');
const inventory = parseInventory(JSON.parse(readFileSync(join(kitDir, 'inventory.json'), 'utf8')));
const committedManifestText = readFileSync(join(kitDir, 'manifest.json'), 'utf8');
const committedSealedText = readFileSync(join(kitDir, 'android-request-ids.sealed.json'), 'utf8');
const ORIGINAL_ANDROID_IDS = new Set(['t', 'f', 'b', 'b2']);

const tempDirs: string[] = [];
test.after(() => { for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true }); });
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'phase4-manifest-'));
  tempDirs.push(dir);
  return dir;
}

/** A fresh manifest folder holding the committed manifest and sealed map, so a test can edit either copy. */
function manifestDir(sealedText = committedSealedText): string {
  const dir = tempDir();
  writeFileSync(join(dir, 'manifest.json'), committedManifestText);
  writeFileSync(join(dir, 'android-request-ids.sealed.json'), sealedText);
  return dir;
}

const fresh = (): Record<string, unknown> => JSON.parse(committedManifestText);
const codes = (refusals: Refusal[]): string[] => [...new Set(refusals.map(refusal => refusal.code))].sort();
const verify = (raw: unknown, options: { dir?: string; root?: string } = {}) =>
  verifyManifest(raw, { inventory, repoRoot: options.root ?? repoRoot, manifestDir: options.dir ?? manifestDir() });

function edit(change: (manifest: PreregistrationManifest) => void): PreregistrationManifest {
  const manifest = parseManifest(fresh());
  change(manifest);
  return manifest;
}

const androidScreens = () => parseManifest(fresh()).screens.filter(screen => screen.platform === 'android');

test('generating from the committed inventory reproduces the committed manifest and sealed map byte for byte', () => {
  const { manifest, sealedRequestIds } = generateManifest(inventory, repoRoot);
  assert.equal(jsonText(manifest), committedManifestText);
  assert.equal(jsonText(sealedRequestIds), committedSealedText);
});

test('the committed skeleton verifies clean: every capture pending, 24/48 iOS and 10/31 Android', () => {
  const raw = fresh();
  assert.deepEqual(verify(raw), []);
  const manifest = parseManifest(raw);
  assert.ok(manifest.screens.every(screen => screen.capture.status === 'pending'));
  assert.deepEqual(manifest.exitRule, {
    ios: { screens: 24, claims: 48, maxConfidentlyWrong: 0, maxUncertain: 3 },
    android: { screens: 10, claims: 31, maxConfidentlyWrong: 0, maxUncertain: null },
  });
  assert.equal(manifest.pipeline.model, 'jev-1.13.0');
  assert.deepEqual(manifest.pipeline.bounds, { establishedAt: 0.9, rejectedAt: 0.1 });
  assert.deepEqual(manifest.pipeline.projectionRules, { ios: 'visible-full-text-v2', android: 'android-full-text-v1' });
  assert.equal(manifest.pipeline.precedence, 'false-wins');
});

test('a deleted key is refused as a missing field, not filled in', () => {
  const raw = fresh();
  delete raw.inventorySha256;
  assert.deepEqual(codes(verify(raw)), ['MISSING_FIELD']);
  const nested: { screens: { capture: Record<string, unknown> }[] } = JSON.parse(committedManifestText);
  delete nested.screens[0]?.capture.sessionId;
  assert.ok(verify(nested).some(refusal => refusal.code === 'MISSING_FIELD' && refusal.at.endsWith('capture.sessionId')));
});

test('dropping a screen or a claim changes the denominator and is refused', () => {
  const droppedScreen = edit(manifest => { manifest.screens.splice(30, 1); });
  assert.ok(codes(verify(droppedScreen)).includes('DENOMINATOR_CHANGED'));
  assert.ok(codes(verify(droppedScreen)).includes('SCREEN_SET_CHANGED'));
  const droppedClaim = edit(manifest => { manifest.screens[5]?.claims.pop(); });
  assert.ok(codes(verify(droppedClaim)).includes('DENOMINATOR_CHANGED'));
});

test('a flipped truth label is refused', () => {
  const flipped = edit(manifest => {
    const claim = manifest.screens[27]?.claims[1];
    if (claim) claim.truth = !claim.truth;
  });
  assert.deepEqual(codes(verify(flipped)), ['TRUTH_MISMATCH']);
});

test('a changed claim text is refused', () => {
  const changed = edit(manifest => {
    const claim = manifest.screens[0]?.claims[0];
    if (claim) claim.text = `${claim.text} (edited)`;
  });
  assert.deepEqual(codes(verify(changed)), ['CLAIM_CHANGED']);
});

test('an edited pipeline digest or value is refused', () => {
  const digest = edit(manifest => {
    const file = manifest.pipeline.renderer.files[0];
    if (file) file.sha256 = '0'.repeat(64);
  });
  assert.deepEqual(codes(verify(digest)), ['PIPELINE_DIGEST_MISMATCH']);
  assert.deepEqual(codes(verify(edit(manifest => { manifest.pipeline.model = 'jev-2.0.0'; }))), ['PIPELINE_VALUE_MISMATCH']);
  assert.deepEqual(codes(verify(edit(manifest => { manifest.exitRule.android.maxUncertain = 5; }))), ['EXIT_RULE_CHANGED']);
});

test('a changed pipeline source file in the repository is refused, and an unchanged copy verifies', () => {
  const root = tempDir();
  const files = [...PIPELINE_FILES.normalizer, ...PIPELINE_FILES.renderer, ...PIPELINE_FILES.judge, 'package-lock.json'];
  for (const file of files) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    copyFileSync(join(repoRoot, file), join(root, file));
  }
  assert.deepEqual(verify(fresh(), { root }), []);
  writeFileSync(join(root, 'src/scripted/observe.ts'), `${readFileSync(join(root, 'src/scripted/observe.ts'), 'utf8')}\n// changed\n`);
  const refusals = verify(fresh(), { root });
  assert.deepEqual(refusals.map(refusal => [refusal.code, refusal.at]), [['PIPELINE_DIGEST_MISMATCH', 'pipeline.renderer.src/scripted/observe.ts']]);
});

test('a tampered sealed map is refused', () => {
  const sealed: { screenId: string; requestId: string; originalId: string }[] = JSON.parse(committedSealedText);
  const [first, second] = sealed;
  assert.ok(first && second);
  [first.originalId, second.originalId] = [second.originalId, first.originalId];
  assert.deepEqual(codes(verify(fresh(), { dir: manifestDir(jsonText(sealed)) })), ['SEALED_MAP_MISMATCH']);
});

test('Android request ids are neutral: derived from screen and claim text only, never an original id', () => {
  const sealed: { screenId: string; requestId: string; originalId: string }[] = JSON.parse(committedSealedText);
  for (const screen of androidScreens()) {
    const ids = screen.claims.map(claim => claim.requestId);
    assert.equal(new Set(ids).size, ids.length, screen.screenId);
    for (const claim of screen.claims) {
      assert.match(claim.requestId, /^c[0-9a-f]{10}$/);
      assert.ok(!ORIGINAL_ANDROID_IDS.has(claim.requestId));
      const expected = `c${createHash('sha256').update(`android\0${screen.screenId}\0${claim.text}`).digest('hex').slice(0, 10)}`;
      assert.equal(claim.requestId, expected);
    }
  }
  assert.doesNotMatch(committedManifestText, /originalId/);
  assert.equal(sealed.length, 31);
});

test('the sealed map turns every Android request id back into its frozen original id, in order', () => {
  const sealed: { screenId: string; requestId: string; originalId: string }[] = JSON.parse(committedSealedText);
  for (const screen of androidScreens()) {
    const frozen = inventory.screens.find(item => item.screenId === screen.screenId);
    const back = screen.claims.map(claim =>
      sealed.find(entry => entry.screenId === screen.screenId && entry.requestId === claim.requestId)?.originalId);
    assert.deepEqual(back, frozen?.claims.map(claim => claim.originalId));
  }
  const ios = parseManifest(fresh()).screens.find(screen => screen.screenId === 's03-weather-berlin-main');
  assert.deepEqual(ios?.claims.map(claim => claim.requestId), ['b', 'a']);
});

test('an attached capture records hashes from its files, and a changed file is refused', () => {
  const dir = manifestDir();
  const xml = join(dir, 'captures', 'stand-in.xml');
  const png = join(dir, 'captures', 'stand-in.png');
  mkdirSync(dirname(xml), { recursive: true });
  writeFileSync(xml, readFileSync(join(repoRoot, 'tests/fixtures/appium-wire/observe/ios-fields.xml')));
  writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const captured = attachCapture(parseManifest(fresh()), { screenId: 's01-weather-ber-query', xmlPath: xml, screenshotPath: png,
    kind: 'stand-in', appBuild: 'fixture', device: 'none', capturedAt: '2026-10-30T00:00:00Z', sessionId: 'fixture' }, dir);
  const capture = captured.screens[0]?.capture;
  assert.equal(capture?.status, 'captured');
  assert.equal(capture?.status === 'captured' ? capture.appiumXml.path : undefined, 'captures/stand-in.xml');
  assert.deepEqual(verify(captured, { dir }), []);
  assert.throws(() => attachCapture(captured, { screenId: 's01-weather-ber-query', xmlPath: xml, screenshotPath: png,
    kind: 'stand-in', appBuild: 'fixture', device: 'none', capturedAt: '2026-10-30T00:00:00Z', sessionId: 'again' }, dir), /already captured/);
  writeFileSync(xml, '<changed/>');
  assert.deepEqual(codes(verify(captured, { dir })), ['CAPTURE_HASH_MISMATCH']);
});
