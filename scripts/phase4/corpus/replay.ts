import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { Questions, SystemOneRequest } from '@typesafe-ai/sdk';
import { normalizeSource } from '../../../src/appium/observe/normalize.js';
import { renderAssertionState, ScriptedObservationError } from '../../../src/scripted/observe.js';
import { buildAssertionRequest, parseAssertionResult, requestError, ScriptedJevError } from '../../../src/scripted/jev.js';
import type { Assertion, Snapshot } from '../../../src/contracts/index.js';
import { rawSha256 } from './digest.js';
import { jsonText, PIPELINE_FAILURE_CODES, PLATFORMS, verifyManifest, type ManifestScreen, type Platform,
  type PreregistrationManifest } from './manifest.js';
import type { Inventory } from './inventory.js';
import { claimOutcome, expectedVerdict, screenVerdict } from './score.js';

export interface JudgeClient {
  systemOne(request: SystemOneRequest<Questions>, options?: { signal?: AbortSignal }): Promise<unknown>;
}

const RequestBlock = z.strictObject({
  requestUtf8: z.string(),
  requestSha256: z.string(),
  renderedStateSha256: z.string(),
});
const JudgedRecord = z.strictObject({
  status: z.literal('judged'), platform: z.enum(PLATFORMS), screenId: z.string(), request: RequestBlock,
  probabilities: z.record(z.string(), z.number()), model: z.string(),
});
const RequestedRecord = z.strictObject({
  status: z.literal('requested'), platform: z.enum(PLATFORMS), screenId: z.string(), request: RequestBlock,
});
const FailedRecord = z.strictObject({
  status: z.literal('failed'), platform: z.enum(PLATFORMS), screenId: z.string(),
  phase: z.enum(['pipeline', 'judge']), code: z.string(), request: RequestBlock.nullable(),
});

export type ResultRecord = z.infer<typeof JudgedRecord> | z.infer<typeof RequestedRecord> | z.infer<typeof FailedRecord>;
const ResultRecordSchema = z.discriminatedUnion('status', [JudgedRecord, RequestedRecord, FailedRecord]);

export interface Refusal { code: string; screenId?: string; detail: string }
export interface Stop { screenId: string; code: string }

export interface ScreenReport {
  platform: Platform;
  screenId: string;
  verdict: 'passed' | 'failed' | 'inconclusive';
  expectedVerdict: 'passed' | 'failed';
}

export interface PlatformReport {
  screens: { expected: number; judged: number; failed: number; missing: number };
  claims: { expected: number; correct: number; uncertain: number; confidentlyWrong: number; unjudged: number };
  exit: 'pass' | 'fail';
  reasons: string[];
}

export interface ReplayReport {
  standInCaptures: boolean;
  acceptance: string;
  platforms: Record<Platform, PlatformReport>;
  screens: ScreenReport[];
  reasons: string[];
  stop?: Stop;
}

export type ReplayOutcome =
  | { status: 'completed'; calls: number; alreadyRecorded: string[]; report: ReplayReport }
  | { status: 'stopped'; calls: number; alreadyRecorded: string[]; stop: Stop; report: ReplayReport }
  | { status: 'refused'; refusals: Refusal[] };

export interface ReplayOptions {
  mode: 'fake' | 'live';
  manifest: PreregistrationManifest;
  manifestDir: string;
  client: JudgeClient;
  signal: AbortSignal;
  inventory?: Inventory;
  repoRoot?: string;
}

/** One record per screen, written under `<manifestDir>/results/<platform>/<screenId>.json`. */
export function readResultRecord(path: string): ResultRecord | undefined {
  if (!existsSync(path)) return undefined;
  return ResultRecordSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

/** Every capture the live judge may not judge: a stand-in proves plumbing, a pending capture is no capture. */
export function captureRefusals(manifest: PreregistrationManifest): Refusal[] {
  const refusals: Refusal[] = [];
  for (const screen of manifest.screens) {
    if (screen.capture.status === 'captured' && screen.capture.kind === 'stand-in') {
      refusals.push({ code: 'STAND_IN_CAPTURE', screenId: screen.screenId,
        detail: 'a stand-in capture proves plumbing, never acceptance' });
    } else if (screen.capture.status === 'pending') {
      refusals.push({ code: 'CAPTURE_PENDING', screenId: screen.screenId, detail: 'no capture is attached yet' });
    }
  }
  return refusals;
}

function pipelineFailureCode(error: unknown): string {
  if (error instanceof ScriptedObservationError) return error.code;
  if (error instanceof ScriptedJevError) {
    return (PIPELINE_FAILURE_CODES as readonly string[]).includes(error.code) ? error.code : 'INVALID_INPUT';
  }
  return 'OBSERVATION_INCOMPLETE';
}

function judgeErrorCode(error: unknown): string {
  if (error instanceof ScriptedJevError) return error.code;
  return requestError(error).code;
}

interface PreparedScreen {
  request: SystemOneRequest<Questions>;
  requestBlock: { requestUtf8: string; requestSha256: string; renderedStateSha256: string };
  assertions: Assertion[];
}

/** The production pipeline on one captured screen: normalize, render, then build the production request. */
function prepare(manifestDir: string, screen: ManifestScreen): PreparedScreen {
  if (screen.capture.status !== 'captured') throw new Error(`${screen.screenId} has no capture`);
  const xml = readFileSync(join(manifestDir, screen.capture.appiumXml.path), 'utf8');
  const normalized = normalizeSource(screen.platform, xml);
  const snapshot: Snapshot = {
    deviceId: screen.capture.device,
    capturedAt: Date.parse(screen.capture.capturedAt),
    expiresAt: 0,
    sequence: 0,
    elements: normalized.elements,
    truncated: normalized.truncated,
  };
  const state = renderAssertionState(snapshot, screen.platform);
  const assertions = screen.claims.map(claim => ({ id: claim.requestId, claim: claim.text }));
  const request = buildAssertionRequest(assertions, state);
  const requestUtf8 = JSON.stringify(request);
  return { request, assertions, requestBlock: { requestUtf8, requestSha256: rawSha256(Buffer.from(requestUtf8, 'utf8')),
    renderedStateSha256: rawSha256(state) } };
}

function recordPath(manifestDir: string, screen: ManifestScreen): string {
  return join(manifestDir, screen.judgment.resultRecord);
}

function writeRecord(path: string, record: ResultRecord): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, jsonText(record));
}

function claimTally(claims: readonly { requestId: string; truth: boolean }[], probabilities: Record<string, number> | undefined) {
  const tally = { correct: 0, uncertain: 0, confidentlyWrong: 0, unjudged: 0 };
  for (const claim of claims) {
    const value = probabilities?.[claim.requestId];
    if (value === undefined) { tally.unjudged += 1; continue; }
    const outcome = claimOutcome(claim.truth, value);
    if (outcome === 'correct') tally.correct += 1;
    else if (outcome === 'uncertain') tally.uncertain += 1;
    else tally.confidentlyWrong += 1;
  }
  return tally;
}

/** The report is read back from the records on disk, so it says what the run actually left behind. */
function buildReport(manifest: PreregistrationManifest, manifestDir: string, stop: Stop | undefined): ReplayReport {
  const platforms = {} as Record<Platform, PlatformReport>;
  const screens: ScreenReport[] = [];
  for (const platform of PLATFORMS) {
    const rule = manifest.exitRule[platform];
    const own = manifest.screens.filter(screen => screen.platform === platform);
    const tally = { expected: 0, correct: 0, uncertain: 0, confidentlyWrong: 0, unjudged: 0 };
    let judged = 0;
    let failed = 0;
    let missing = 0;
    for (const screen of own) {
      tally.expected += screen.claims.length;
      const record = readResultRecord(recordPath(manifestDir, screen));
      const judgedRecord = record?.status === 'judged' ? record : undefined;
      if (judgedRecord) judged += 1;
      else if (record?.status === 'failed') failed += 1;
      else missing += 1;
      const claims = claimTally(screen.claims, judgedRecord?.probabilities);
      tally.correct += claims.correct;
      tally.uncertain += claims.uncertain;
      tally.confidentlyWrong += claims.confidentlyWrong;
      tally.unjudged += claims.unjudged;
      const values = screen.claims.map(claim => judgedRecord?.probabilities[claim.requestId]).filter((value): value is number =>
        value !== undefined);
      screens.push({ platform, screenId: screen.screenId,
        verdict: judgedRecord ? screenVerdict(values) : 'inconclusive',
        expectedVerdict: expectedVerdict(screen.claims.map(claim => claim.truth)) });
    }
    const reasons: string[] = [];
    if (failed > 0) reasons.push(`${failed} screens failed`);
    if (missing > 0) reasons.push(`${missing} screens not judged`);
    if (tally.confidentlyWrong > rule.maxConfidentlyWrong) {
      reasons.push(`${tally.confidentlyWrong} confidently wrong claims`);
    }
    if (rule.maxUncertain !== null && tally.uncertain > rule.maxUncertain) {
      reasons.push(`${tally.uncertain} uncertain claims exceed the allowance of ${rule.maxUncertain}`);
    }
    platforms[platform] = {
      screens: { expected: own.length, judged, failed, missing },
      claims: tally,
      exit: reasons.length ? 'fail' : 'pass',
      reasons,
    };
  }
  const standInCaptures = manifest.screens.some(screen => screen.capture.status === 'captured' && screen.capture.kind === 'stand-in');
  const reasons = PLATFORMS.flatMap(platform => platforms[platform].reasons.map(reason => `${platform}: ${reason}`));
  return {
    standInCaptures,
    acceptance: standInCaptures ? 'not-applicable: stand-in captures' : 'measurable: live captures',
    platforms,
    screens,
    reasons,
    ...(stop ? { stop } : {}),
  };
}

export async function replayCorpus(options: ReplayOptions): Promise<ReplayOutcome> {
  const { manifest, manifestDir, client, signal } = options;
  if (options.mode === 'live') {
    const refusals = captureRefusals(manifest);
    if (refusals.length) return { status: 'refused', refusals };
    if (options.inventory && options.repoRoot) {
      const verified = verifyManifest(manifest, { inventory: options.inventory, repoRoot: options.repoRoot, manifestDir });
      if (verified.length) return { status: 'refused', refusals: verified.map(refusal => ({ code: refusal.code,
        detail: `${refusal.at}: ${refusal.detail}` })) };
    }
  }

  const alreadyRecorded: string[] = [];
  let calls = 0;
  let stop: Stop | undefined;
  for (const screen of manifest.screens) {
    const path = recordPath(manifestDir, screen);
    const existing = readResultRecord(path);
    if (existing) {
      if (existing.status === 'requested') {
        stop = { screenId: screen.screenId, code: 'ANSWER_LOST' };
        break;
      }
      alreadyRecorded.push(screen.screenId);
      continue;
    }
    if (screen.capture.status !== 'captured') continue;

    let prepared: PreparedScreen;
    try {
      prepared = prepare(manifestDir, screen);
    } catch (error) {
      writeRecord(path, { status: 'failed', platform: screen.platform, screenId: screen.screenId,
        phase: 'pipeline', code: pipelineFailureCode(error), request: null });
      continue;
    }

    writeRecord(path, { status: 'requested', platform: screen.platform, screenId: screen.screenId,
      request: prepared.requestBlock });
    const start = performance.now();
    let raw: unknown;
    try {
      raw = await client.systemOne(prepared.request, { signal });
    } catch (error) {
      const code = judgeErrorCode(error);
      writeRecord(path, { status: 'failed', platform: screen.platform, screenId: screen.screenId, phase: 'judge', code,
        request: prepared.requestBlock });
      stop = { screenId: screen.screenId, code };
      break;
    }
    let probabilities: Record<string, number>;
    let model: string;
    try {
      const judgment = parseAssertionResult(raw, prepared.assertions, performance.now() - start);
      probabilities = judgment.probabilities;
      model = judgment.model;
    } catch (error) {
      const code = judgeErrorCode(error);
      writeRecord(path, { status: 'failed', platform: screen.platform, screenId: screen.screenId, phase: 'judge', code,
        request: prepared.requestBlock });
      stop = { screenId: screen.screenId, code };
      break;
    }
    calls += 1;
    writeRecord(path, { status: 'judged', platform: screen.platform, screenId: screen.screenId,
      request: prepared.requestBlock, probabilities, model });
  }

  const report = buildReport(manifest, manifestDir, stop);
  mkdirSync(join(manifestDir, 'results'), { recursive: true });
  writeFileSync(join(manifestDir, 'results', 'report.json'), jsonText(report));
  if (stop) return { status: 'stopped', calls, alreadyRecorded, stop, report };
  return { status: 'completed', calls, alreadyRecorded, report };
}
