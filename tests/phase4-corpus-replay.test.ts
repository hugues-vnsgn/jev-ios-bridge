import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuthenticationError, type Questions, type SystemOneRequest } from '@typesafe-ai/sdk';
import { rawSha256 } from '../scripts/phase4/corpus/digest.js';
import { parseInventory } from '../scripts/phase4/corpus/inventory.js';
import { attachCapture, jsonText, parseManifest, type PreregistrationManifest } from '../scripts/phase4/corpus/manifest.js';
import { readResultRecord, replayCorpus, type JudgeClient, type ReplayOutcome } from '../scripts/phase4/corpus/replay.js';
import { main } from '../scripts/phase4/corpus/cli.js';
import { createLiveJudgeClient } from '../scripts/phase4/corpus/cli.js';

const repoRoot = join(import.meta.dirname, '..');
const kitDir = join(repoRoot, '.scratch', 'appium-mcp-migration', 'phase4', 'corpus');
const wire = join(repoRoot, 'tests', 'fixtures', 'appium-wire', 'observe');
const standInPng = join(repoRoot, 'tests', 'fixtures', 'phase4-corpus', 'stand-in.png');
const inventory = parseInventory(JSON.parse(readFileSync(join(kitDir, 'inventory.json'), 'utf8')));
const skeleton = (): PreregistrationManifest => parseManifest(JSON.parse(readFileSync(join(kitDir, 'manifest.json'), 'utf8')));
const IOS_XML = ['ios-fields.xml', 'ios-historical-choose-apple.xml', 'ios-historical-choose-none.xml', 'ios-live-choose-none.xml'];
const ANDROID_XML = ['android-choose-none.xml', 'android-number-picker.xml'];

const tempDirs: string[] = [];
test.after(() => { for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true }); });

/** A manifest folder whose every screen holds a fixture XML labelled as a stand-in: plumbing, never acceptance. */
function standInFolder(xmlFor: (screenId: string, fixture: string) => string = (_screen, fixture) => fixture) {
  const dir = mkdtempSync(join(tmpdir(), 'phase4-replay-'));
  tempDirs.push(dir);
  for (const file of ['inventory.json', 'android-request-ids.sealed.json']) copyFileSync(join(kitDir, file), join(dir, file));
  mkdirSync(join(dir, 'captures'));
  copyFileSync(standInPng, join(dir, 'captures', 'stand-in.png'));
  const seen = { ios: 0, android: 0 };
  let manifest = skeleton();
  for (const screen of manifest.screens) {
    const pool = screen.platform === 'ios' ? IOS_XML : ANDROID_XML;
    const fixture = pool[seen[screen.platform]++ % pool.length] ?? '';
    const xmlPath = join(dir, 'captures', `${screen.screenId}.xml`);
    writeFileSync(xmlPath, xmlFor(screen.screenId, readFileSync(join(wire, fixture), 'utf8')));
    manifest = attachCapture(manifest, { screenId: screen.screenId, xmlPath, screenshotPath: join(dir, 'captures', 'stand-in.png'),
      kind: 'stand-in', appBuild: 'stand-in fixture', device: 'none', capturedAt: '1970-01-01T00:00:00Z', sessionId: 'stand-in' }, dir);
  }
  writeFileSync(join(dir, 'manifest.json'), jsonText(manifest));
  return { dir, manifest };
}

interface ClaimContext { platform: 'ios' | 'android'; screenId: string; requestId: string; truth: boolean }

/** Answers each request in manifest order; the fake knows the truth only because the test hands it the manifest. */
function fakeJudge(manifest: PreregistrationManifest, answer: (claim: ClaimContext) => number,
  fail?: (call: number) => unknown) {
  const requests: SystemOneRequest<Questions>[] = [];
  const queue = manifest.screens.filter(screen => screen.capture.status === 'captured');
  const client: JudgeClient = {
    async systemOne(request) {
      requests.push(request);
      const failure = fail?.(requests.length);
      if (failure) throw failure;
      const screen = queue[requests.length - 1];
      assert.ok(screen, 'more calls than captured screens');
      assert.deepEqual(Object.keys(request.questions), screen.claims.map(claim => `assertion:${claim.requestId}`));
      const answers = Object.fromEntries(screen.claims.map(claim => [`assertion:${claim.requestId}`,
        { type: 'noul', noul: answer({ platform: screen.platform, screenId: screen.screenId, requestId: claim.requestId, truth: claim.truth }) }]));
      return { model: 'jev-1.13.0', answers, usage: { input_tokens: 100, output_tokens: 1 } };
    },
  };
  return { client, requests };
}

const correct = (claim: ClaimContext): number => claim.truth ? 0.97 : 0.02;
const neverCalled: JudgeClient = { async systemOne() { assert.fail('the judge must not be called'); } };
const signal = () => new AbortController().signal;

function completed(outcome: ReplayOutcome) {
  assert.notEqual(outcome.status, 'refused');
  if (outcome.status === 'refused') throw new Error('refused');
  return outcome;
}

test('stand-in captures, plumbing only: an all-correct fake judge scores every claim correct', async () => {
  const { dir, manifest } = standInFolder();
  const fake = fakeJudge(manifest, correct);
  const outcome = completed(await replayCorpus({ mode: 'fake', manifest, manifestDir: dir, client: fake.client, signal: signal() }));
  assert.equal(outcome.status, 'completed');
  assert.equal(outcome.calls, 34);
  const { report } = outcome;
  assert.deepEqual(report.platforms.ios.screens, { expected: 24, judged: 24, failed: 0, missing: 0 });
  assert.deepEqual(report.platforms.ios.claims, { expected: 48, correct: 48, uncertain: 0, confidentlyWrong: 0, unjudged: 0 });
  assert.deepEqual(report.platforms.android.claims, { expected: 31, correct: 31, uncertain: 0, confidentlyWrong: 0, unjudged: 0 });
  assert.equal(report.platforms.ios.exit, 'pass');
  assert.equal(report.platforms.android.exit, 'pass');
  assert.equal(report.standInCaptures, true);
  assert.equal(report.acceptance, 'not-applicable: stand-in captures');
  assert.ok(report.screens.every(screen => screen.verdict === screen.expectedVerdict));
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'results', 'report.json'), 'utf8')), report);
});

test('stand-in captures, plumbing only: a false claim answered 0.95 is confidently wrong and fails the exit', async () => {
  const { dir, manifest } = standInFolder();
  const target = manifest.screens.find(screen => screen.screenId === 'settings-2-display')?.claims.find(claim => !claim.truth);
  const fake = fakeJudge(manifest, claim => claim.requestId === target?.requestId && claim.screenId === 'settings-2-display'
    ? 0.95 : correct(claim));
  const { report } = completed(await replayCorpus({ mode: 'fake', manifest, manifestDir: dir, client: fake.client, signal: signal() }));
  assert.equal(report.platforms.android.claims.confidentlyWrong, 1);
  assert.equal(report.platforms.android.exit, 'fail');
  assert.equal(report.platforms.ios.exit, 'pass');
});

test('stand-in captures, plumbing only: four uncertain iOS answers exceed three; Android uncertainty is only reported', async () => {
  const { dir, manifest } = standInFolder();
  const uncertain = new Set(manifest.screens.filter(screen => screen.platform === 'ios').slice(0, 4).map(screen => screen.screenId));
  const androidUncertain = new Set(manifest.screens.filter(screen => screen.platform === 'android').slice(0, 5).map(screen => screen.screenId));
  const pickedIos = new Set<string>();
  const pickedAndroid = new Set<string>();
  const fake = fakeJudge(manifest, claim => {
    if (uncertain.has(claim.screenId) && !pickedIos.has(claim.screenId)) { pickedIos.add(claim.screenId); return 0.5; }
    if (androidUncertain.has(claim.screenId) && !pickedAndroid.has(claim.screenId)) { pickedAndroid.add(claim.screenId); return 0.5; }
    return correct(claim);
  });
  const { report } = completed(await replayCorpus({ mode: 'fake', manifest, manifestDir: dir, client: fake.client, signal: signal() }));
  assert.equal(report.platforms.ios.claims.uncertain, 4);
  assert.equal(report.platforms.ios.exit, 'fail');
  assert.match(report.platforms.ios.reasons.join('\n'), /uncertain/);
  assert.equal(report.platforms.android.claims.uncertain, 5);
  assert.equal(report.platforms.android.exit, 'pass');
});

test('stored request bytes hash to their sha256 and parse back to a jev-1.13.0 request with neutral Android ids', async () => {
  const { dir, manifest } = standInFolder();
  await replayCorpus({ mode: 'fake', manifest, manifestDir: dir, client: fakeJudge(manifest, correct).client, signal: signal() });
  for (const screen of manifest.screens) {
    const record = readResultRecord(join(dir, screen.judgment.resultRecord));
    assert.equal(record?.status, 'judged');
    if (record?.status !== 'judged') continue;
    assert.equal(rawSha256(Buffer.from(record.request.requestUtf8, 'utf8')), record.request.requestSha256);
    const request: { model: string; state: string; questions: Record<string, unknown> } = JSON.parse(record.request.requestUtf8);
    assert.equal(request.model, 'jev-1.13.0');
    assert.equal(rawSha256(request.state), record.request.renderedStateSha256);
    const ids = Object.keys(request.questions);
    if (screen.platform === 'android') {
      assert.ok(ids.every(id => /^assertion:c[0-9a-f]{10}$/.test(id)), ids.join());
      assert.ok(request.state.startsWith('Current Android screen'));
    } else {
      assert.deepEqual(ids, screen.claims.map(claim => `assertion:${claim.requestId}`));
    }
    assert.doesNotMatch(record.request.requestUtf8, /"truth"|rationale|originalId/);
  }
});

test('a second replay over the same results sends nothing and reports every screen as already recorded', async () => {
  const { dir, manifest } = standInFolder();
  await replayCorpus({ mode: 'fake', manifest, manifestDir: dir, client: fakeJudge(manifest, correct).client, signal: signal() });
  const again = completed(await replayCorpus({ mode: 'fake', manifest, manifestDir: dir, client: neverCalled, signal: signal() }));
  assert.equal(again.calls, 0);
  assert.equal(again.alreadyRecorded.length, 34);
  assert.equal(again.report.platforms.ios.claims.correct, 48);
});

test('a requested record without a result stops the run for the owner and is never asked again', async () => {
  const { dir, manifest } = standInFolder();
  await replayCorpus({ mode: 'fake', manifest, manifestDir: dir, client: fakeJudge(manifest, correct).client, signal: signal() });
  const lost = manifest.screens[10];
  assert.ok(lost);
  const record = readResultRecord(join(dir, lost.judgment.resultRecord));
  assert.equal(record?.status, 'judged');
  if (record?.status !== 'judged') return;
  writeFileSync(join(dir, lost.judgment.resultRecord),
    jsonText({ status: 'requested', platform: record.platform, screenId: record.screenId, request: record.request }));
  for (const screen of manifest.screens.slice(11)) rmSync(join(dir, screen.judgment.resultRecord));
  const outcome = completed(await replayCorpus({ mode: 'fake', manifest, manifestDir: dir, client: neverCalled, signal: signal() }));
  assert.equal(outcome.status, 'stopped');
  assert.deepEqual(outcome.status === 'stopped' ? outcome.stop : null, { screenId: lost.screenId, code: 'ANSWER_LOST' });
  assert.equal(outcome.calls, 0);
  assert.equal(readResultRecord(join(dir, lost.judgment.resultRecord))?.status, 'requested');
  assert.ok(manifest.screens.slice(11).every(screen => !existsSync(join(dir, screen.judgment.resultRecord))));
});

test('an AUTH error stops the whole run at that screen, with no later call and no retry', async () => {
  const { dir, manifest } = standInFolder();
  const fake = fakeJudge(manifest, correct, call => call === 3 ? new AuthenticationError(401, {}, new Headers()) : undefined);
  const outcome = completed(await replayCorpus({ mode: 'fake', manifest, manifestDir: dir, client: fake.client, signal: signal() }));
  const third = manifest.screens[2];
  assert.equal(outcome.status, 'stopped');
  assert.deepEqual(outcome.status === 'stopped' ? outcome.stop : null, { screenId: third?.screenId, code: 'AUTH' });
  assert.equal(fake.requests.length, 3);
  const record = third && readResultRecord(join(dir, third.judgment.resultRecord));
  assert.deepEqual(record && record.status === 'failed' ? [record.phase, record.code] : null, ['judge', 'AUTH']);
  assert.ok(manifest.screens.slice(3).every(screen => !existsSync(join(dir, screen.judgment.resultRecord))));
  assert.deepEqual(outcome.report.platforms.ios.screens, { expected: 24, judged: 2, failed: 1, missing: 21 });
  assert.equal(outcome.report.platforms.ios.exit, 'fail');
  assert.deepEqual(outcome.report.stop, { screenId: third?.screenId, code: 'AUTH' });
});

test('a capture the production normalizer refuses fails its screen locally, sends nothing for it, and the run goes on', async () => {
  const { dir, manifest } = standInFolder((screenId, fixture) => screenId === 'twin-2-apple-added' ? '<hierarchy/>' : fixture);
  const fake = fakeJudge({ ...manifest, screens: manifest.screens.filter(screen => screen.screenId !== 'twin-2-apple-added') }, correct);
  const outcome = completed(await replayCorpus({ mode: 'fake', manifest, manifestDir: dir, client: fake.client, signal: signal() }));
  assert.equal(outcome.status, 'completed');
  assert.equal(outcome.calls, 33);
  const record = readResultRecord(join(dir, 'results', 'android', 'twin-2-apple-added.json'));
  assert.deepEqual(record?.status === 'failed' ? [record.phase, record.code, record.request] : null,
    ['pipeline', 'OBSERVATION_INCOMPLETE', null]);
  assert.deepEqual(outcome.report.platforms.android.screens, { expected: 10, judged: 9, failed: 1, missing: 0 });
  assert.equal(outcome.report.platforms.android.claims.unjudged, 3);
  assert.equal(outcome.report.platforms.android.exit, 'fail');
});

test('live mode refuses stand-in captures before the client is used or created', async () => {
  const { dir, manifest } = standInFolder();
  const direct = await replayCorpus({ mode: 'live', manifest, manifestDir: dir, client: neverCalled, signal: signal(), inventory, repoRoot });
  assert.equal(direct.status, 'refused');
  assert.ok(direct.status === 'refused' && direct.refusals.every(refusal => refusal.code === 'STAND_IN_CAPTURE'));
  assert.equal(direct.status === 'refused' ? direct.refusals.length : 0, 34);
  assert.ok(!existsSync(join(dir, 'results')));

  const lines: string[] = [];
  const code = await main(['--dir', dir, 'replay', '--live-jev'], { cwd: repoRoot, env: {}, out: line => lines.push(line),
    createClient: () => { throw new Error('the client factory must not be called'); } });
  assert.equal(code, 1);
  assert.match(lines.join('\n'), /STAND_IN_CAPTURE/);
});

test('live mode refuses pending captures before the client factory, and replay without --live-jev never judges', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'phase4-replay-'));
  tempDirs.push(dir);
  for (const file of ['inventory.json', 'manifest.json', 'android-request-ids.sealed.json']) copyFileSync(join(kitDir, file), join(dir, file));
  const factory = () => { throw new Error('the client factory must not be called'); };
  const lines: string[] = [];
  assert.equal(await main(['--dir', dir, 'replay', '--live-jev'], { cwd: repoRoot, env: {}, out: line => lines.push(line), createClient: factory }), 1);
  assert.match(lines.join('\n'), /CAPTURE_PENDING/);
  assert.equal(await main(['--dir', dir, 'replay'], { cwd: repoRoot, env: {}, out: line => lines.push(line), createClient: factory }), 2);
  assert.ok(!existsSync(join(dir, 'results')));
});

test('live mode with captures marked live still refuses without TYPESAFE_API_KEY, before the client factory', async () => {
  const { dir } = standInFolder();
  const manifest = parseManifest(JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')));
  const relabelled = { ...manifest, screens: manifest.screens.map(screen => screen.capture.status === 'captured'
    ? { ...screen, capture: { ...screen.capture, kind: 'live' as const } } : screen) };
  writeFileSync(join(dir, 'manifest.json'), jsonText(relabelled));
  const lines: string[] = [];
  const code = await main(['--dir', dir, 'replay', '--live-jev'], { cwd: repoRoot, env: {}, out: line => lines.push(line),
    createClient: () => { throw new Error('the client factory must not be called'); } });
  assert.equal(code, 1);
  assert.match(lines.join('\n'), /TYPESAFE_API_KEY is not set/);
  assert.ok(!existsSync(join(dir, 'results')));
});

test('the live judge client refuses without a key, and pins the scripted model', () => {
  assert.throws(() => createLiveJudgeClient({}), /TYPESAFE_API_KEY is not set/);
  assert.throws(() => createLiveJudgeClient({ TYPESAFE_API_KEY: '   ' }), /TYPESAFE_API_KEY is not set/);
  const client = createLiveJudgeClient({ TYPESAFE_API_KEY: 'fake-jev-key-9f3e' });
  assert.equal(typeof client.systemOne, 'function');
});
