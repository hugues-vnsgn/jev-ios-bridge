import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import type { Assertion, Snapshot } from '../../src/contracts/index.js';
import { parseSnapshot } from '../../src/device/index.js';
import type { AssertionApproval, AssertionCase, AssertionManifest, ScriptedCorpus, ScriptedJudge } from './contracts.js';
import { buildAssertionRequest, ASSERTION_QUESTION, REQUEST_MAX_BYTES, SCRIPTED_JEV_MODEL,
  ScriptedJevError, STATE_QUESTION_MAX_BYTES } from './jev.js';
import { MAX_STATE_BYTES, PROJECTION_RULE, renderAssertionState, ScriptedObservationError } from './observe.js';
import { parseScriptedCorpus } from './schema.js';

export class ScriptedExperimentError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'ScriptedExperimentError'; }
}
const fail = (code: string): never => { throw new ScriptedExperimentError(code); };
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Property-order-independent hash for corpus, manifest and approval bindings. */
export function digest(value: unknown): string {
  const canonical = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(canonical);
    if (isRecord(input)) return Object.fromEntries(Object.keys(input).sort().map(key => [key, canonical(input[key])]));
    return input;
  };
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

/** Freeze every implementation file that can affect the assertion-only experiment. */
export function implementationDigest(): string {
  const sources = [
    new URL('../../package.json', import.meta.url),
    new URL('../../package-lock.json', import.meta.url),
    new URL('../../src/contracts/index.ts', import.meta.url),
    new URL('../../src/device/index.ts', import.meta.url),
    new URL('./contracts.ts', import.meta.url),
    new URL('./schema.ts', import.meta.url),
    new URL('./observe.ts', import.meta.url),
    new URL('./jev.ts', import.meta.url),
    new URL('./harness.ts', import.meta.url),
    new URL('./cli.ts', import.meta.url),
    new URL('./corpus/assemble.ts', import.meta.url),
  ];
  const hash = createHash('sha256');
  for (const source of sources) hash.update(readFileSync(source));
  return hash.digest('hex');
}

export function validateCorpus(input: unknown): ScriptedCorpus {
  const corpus = parseScriptedCorpus(input);
  const screenshotHashes = new Set<string>();
  const screenHashes = new Set<string>();
  for (const item of corpus.cases) {
    if (screenshotHashes.has(item.assets.sha256.screenshot)) fail('DUPLICATE_SCREENSHOT');
    screenshotHashes.add(item.assets.sha256.screenshot);
    const screenHash = item.snapshot.screenHash ?? fail('DUPLICATE_SCREEN_STATE');
    if (!screenHash || screenHashes.has(screenHash)) fail('DUPLICATE_SCREEN_STATE');
    screenHashes.add(screenHash);
    if (item.snapshot.screenshotPath !== item.assets.screenshotPath) fail('SCREENSHOT_PATH_MISMATCH');
  }
  return corpus;
}

/** Before approval, check all 24 fixed request payloads without contacting Jev. */
export function preflightCorpus(input: unknown): ScriptedCorpus {
  const corpus = validateCorpus(input);
  for (const item of corpus.cases) {
    const state = renderAssertionState(item.snapshot);
    // Only neutral IDs and claim text enter a request; expected labels and rationales stay local.
    buildAssertionRequest(item.claims.map(({ id, claim }): Assertion => ({ id, claim })), state);
  }
  return corpus;
}

/** Verify every binary capture and that its normalized Snapshot reflects the raw vendor JSON. */
export async function verifyCorpusAssets(corpus: ScriptedCorpus, corpusPath: string): Promise<void> {
  const root = await realpath(dirname(resolve(corpusPath)));
  for (const item of corpus.cases) {
    const paths = [
      ['full', item.assets.fullPath],
      ['screenshot', item.assets.screenshotPath],
    ] as const;
    let fullBytes: Buffer | undefined;
    for (const [kind, path] of paths) {
      if (!path || isAbsolute(path)) fail('CAPTURE_PATH_INVALID');
      const expected = item.assets.sha256[kind];
      if (!/^[a-f0-9]{64}$/.test(expected)) fail('CAPTURE_HASH_REQUIRED');
      let actualPath: string;
      try { actualPath = await realpath(resolve(root, path)); }
      catch { fail('CAPTURE_ASSET_MISSING'); }
      const within = relative(root, actualPath!);
      if (within === '..' || within.startsWith('../') || isAbsolute(within)) fail('CAPTURE_PATH_INVALID');
      let bytes: Buffer;
      try { bytes = await readFile(actualPath!); }
      catch { fail('CAPTURE_ASSET_MISSING'); }
      if (createHash('sha256').update(bytes!).digest('hex') !== expected) fail('CAPTURE_HASH_MISMATCH');
      if (kind === 'full') fullBytes = bytes!;
    }
    let raw: unknown;
    try { raw = JSON.parse(fullBytes!.toString('utf8')); }
    catch { fail('CAPTURE_JSON_INVALID'); }
    const envelope = isRecord(raw) ? raw : fail('CAPTURE_ENVELOPE_INVALID');
    const data = isRecord(envelope.data) ? envelope.data : fail('CAPTURE_ENVELOPE_INVALID');
    if (envelope.schema !== 'mobilebuildmcp.output.capture-result' || envelope.didError !== false ||
        !isRecord(data.artifacts) || data.artifacts.simulatorId !== item.snapshot.deviceId ||
        !isRecord(data.capture) || data.capture.simulatorId !== item.snapshot.deviceId) fail('CAPTURE_ENVELOPE_INVALID');
    let normalized: Snapshot;
    try { normalized = parseSnapshot(data, item.snapshot.deviceId); }
    catch { fail('CAPTURE_NORMALIZATION_INVALID'); }
    const expectedSnapshot = { ...item.snapshot };
    delete expectedSnapshot.screenshotPath;
    delete expectedSnapshot.logTails;
    if (digest(normalized!) !== digest(expectedSnapshot)) fail('CAPTURE_NORMALIZATION_MISMATCH');
  }
}

export function makeDraftManifest(input: unknown): AssertionManifest {
  const corpus = validateCorpus(input);
  return {
    version: 1, status: 'draft', corpusSha256: digest(corpus), implementationSha256: implementationDigest(),
    model: SCRIPTED_JEV_MODEL, projectionRule: PROJECTION_RULE, questionTemplate: ASSERTION_QUESTION,
    maxStateBytes: MAX_STATE_BYTES, stateQuestionMaxBytes: STATE_QUESTION_MAX_BYTES,
    requestMaxBytes: REQUEST_MAX_BYTES, noulYes: 0.9, noulNo: 0.1,
    gateRule: 'ticket-21-paired-24-v1',
  };
}

export function validateFrozenManifest(input: unknown, manifest: AssertionManifest): ScriptedCorpus {
  const corpus = validateCorpus(input);
  const expected = { ...makeDraftManifest(corpus), status: 'frozen' };
  if (digest(manifest) !== digest(expected) || manifest.status !== 'frozen') fail('MANIFEST_NOT_FROZEN');
  return corpus;
}

export function validateFrozenExperiment(input: unknown, manifest: AssertionManifest,
  approval: AssertionApproval): ScriptedCorpus {
  const corpus = validateFrozenManifest(input, manifest);
  if (approval.version !== 1 || approval.approved !== true || !approval.reviewedBy?.trim() ||
      !approval.reviewedAt?.trim() || !Number.isFinite(Date.parse(approval.reviewedAt)) ||
      approval.corpusSha256 !== digest(corpus) || approval.manifestSha256 !== digest(manifest)) {
    fail('OWNER_APPROVAL_REQUIRED');
  }
  return corpus;
}

export interface AssertionCaseResult {
  caseId: string;
  workflowGroup: string;
  appBundleId: string;
  requested: boolean;
  probabilities?: Record<string, number>;
  trueProbability?: number;
  falseProbability?: number;
  trueConfidentCorrect: boolean;
  falseConfidentCorrect: boolean;
  falsePass: boolean;
  wrongDecisiveFailure: boolean;
  pairedDecisive: boolean;
  uncertainClaims: number;
  inputTokens?: number;
  latencyMs?: number;
  model?: string;
  error?: string;
  failureKind?: 'observation' | 'request' | 'response' | 'unknown';
}

function failedCase(item: AssertionCase, requested: boolean, error: unknown): AssertionCaseResult {
  const code = error instanceof ScriptedObservationError || error instanceof ScriptedJevError ? error.code : 'UNEXPECTED_FAILURE';
  const failureKind = error instanceof ScriptedObservationError ||
    (error instanceof ScriptedJevError && ['INVALID_INPUT', 'REQUEST_BUDGET'].includes(error.code))
    ? 'observation' : error instanceof ScriptedJevError && error.code === 'MALFORMED_RESPONSE'
      ? 'response' : error instanceof ScriptedJevError ? 'request' : 'unknown';
  return { caseId: item.id, workflowGroup: item.workflowGroup, appBundleId: item.app.bundleId,
    requested, trueConfidentCorrect: false, falseConfidentCorrect: false, falsePass: false,
    wrongDecisiveFailure: false, pairedDecisive: false, uncertainClaims: 0, error: code, failureKind };
}

export async function evaluateCase(item: AssertionCase, judge: ScriptedJudge,
  signal: AbortSignal): Promise<AssertionCaseResult> {
  const basics = { caseId: item.id, workflowGroup: item.workflowGroup, appBundleId: item.app.bundleId };
  let requested = false;
  try {
    const assertions = item.claims.map(({ id, claim }): Assertion => ({ id, claim }));
    const state = renderAssertionState(item.snapshot);
    buildAssertionRequest(assertions, state);
    if (signal.aborted) throw new ScriptedJevError('ABORTED');
    requested = true;
    const judgment = await judge.judge(assertions, state, signal);
    if (judgment.model !== SCRIPTED_JEV_MODEL || !Number.isSafeInteger(judgment.inputTokens) ||
        judgment.inputTokens < 0 || !Number.isFinite(judgment.latencyMs) || judgment.latencyMs < 0 ||
        Object.keys(judgment.probabilities).length !== 2 ||
        assertions.some(assertion => !Object.hasOwn(judgment.probabilities, assertion.id) ||
          typeof judgment.probabilities[assertion.id] !== 'number' ||
          !Number.isFinite(judgment.probabilities[assertion.id]) ||
          judgment.probabilities[assertion.id]! < 0 || judgment.probabilities[assertion.id]! > 1)) {
      throw new ScriptedJevError('MALFORMED_RESPONSE');
    }
    const trueClaim = item.claims.find(claim => claim.expected)!;
    const falseClaim = item.claims.find(claim => !claim.expected)!;
    const trueProbability = judgment.probabilities[trueClaim.id]!;
    const falseProbability = judgment.probabilities[falseClaim.id]!;
    const trueConfidentCorrect = trueProbability >= 0.9;
    const falseConfidentCorrect = falseProbability <= 0.1;
    return { ...basics, requested, probabilities: judgment.probabilities, trueProbability, falseProbability,
      trueConfidentCorrect, falseConfidentCorrect, falsePass: falseProbability >= 0.9,
      wrongDecisiveFailure: trueProbability <= 0.1, pairedDecisive: trueConfidentCorrect && falseConfidentCorrect,
      uncertainClaims: Number(trueProbability > 0.1 && trueProbability < 0.9) +
        Number(falseProbability > 0.1 && falseProbability < 0.9),
      inputTokens: judgment.inputTokens, latencyMs: judgment.latencyMs, model: judgment.model };
  } catch (error) { return failedCase(item, requested, error); }
}

export interface AssertionMetrics {
  screens: 24;
  requestedScreens: number;
  trueConfidentCorrect: number;
  falseConfidentCorrect: number;
  pairedDecisive: number;
  falsePasses: number;
  wrongDecisiveFailures: number;
  uncertainClaims: number;
  observationFailures: number;
  requestFailures: number;
  responseFailures: number;
  unknownFailures: number;
  inputTokens: number;
  latencyMs: number;
  passesExploratoryBar: boolean;
  workflows: Record<string, {
    screens: number; trueConfidentCorrect: number; falseConfidentCorrect: number;
    pairedDecisive: number; falsePasses: number; wrongDecisiveFailures: number; failures: number;
  }>;
}

export function summarize(results: AssertionCaseResult[]): AssertionMetrics {
  if (results.length !== 24 || new Set(results.map(result => result.caseId)).size !== 24) fail('RESULT_COUNT');
  const count = (predicate: (result: AssertionCaseResult) => boolean): number => results.filter(predicate).length;
  const workflows: AssertionMetrics['workflows'] = {};
  for (const item of results) {
    const row = workflows[item.workflowGroup] ??= { screens: 0, trueConfidentCorrect: 0, falseConfidentCorrect: 0,
      pairedDecisive: 0, falsePasses: 0, wrongDecisiveFailures: 0, failures: 0 };
    row.screens++;
    row.trueConfidentCorrect += Number(item.trueConfidentCorrect);
    row.falseConfidentCorrect += Number(item.falseConfidentCorrect);
    row.pairedDecisive += Number(item.pairedDecisive);
    row.falsePasses += Number(item.falsePass);
    row.wrongDecisiveFailures += Number(item.wrongDecisiveFailure);
    row.failures += Number(item.failureKind !== undefined);
  }
  const trueConfidentCorrect = count(item => item.trueConfidentCorrect);
  const falseConfidentCorrect = count(item => item.falseConfidentCorrect);
  const falsePasses = count(item => item.falsePass);
  const wrongDecisiveFailures = count(item => item.wrongDecisiveFailure);
  return { screens: 24, requestedScreens: count(item => item.requested), trueConfidentCorrect,
    falseConfidentCorrect, pairedDecisive: count(item => item.pairedDecisive), falsePasses,
    wrongDecisiveFailures, uncertainClaims: results.reduce((total, item) => total + item.uncertainClaims, 0),
    observationFailures: count(item => item.failureKind === 'observation'),
    requestFailures: count(item => item.failureKind === 'request'),
    responseFailures: count(item => item.failureKind === 'response'),
    unknownFailures: count(item => item.failureKind === 'unknown'),
    inputTokens: results.reduce((total, item) => total + (item.inputTokens ?? 0), 0),
    latencyMs: results.reduce((total, item) => total + (item.latencyMs ?? 0), 0),
    passesExploratoryBar: trueConfidentCorrect >= 20 && falseConfidentCorrect >= 20 &&
      falsePasses === 0 && wrongDecisiveFailures === 0, workflows };
}

export async function evaluateCorpus(input: unknown, manifest: AssertionManifest, approval: AssertionApproval,
  judge: ScriptedJudge, signal: AbortSignal,
  onCase?: (result: AssertionCaseResult) => Promise<void>): Promise<{ results: AssertionCaseResult[]; metrics: AssertionMetrics }> {
  const corpus = validateFrozenExperiment(input, manifest, approval);
  const results: AssertionCaseResult[] = [];
  for (const item of corpus.cases) {
    if (signal.aborted) fail('ABORTED');
    const result = await evaluateCase(item, judge, signal);
    results.push(result);
    await onCase?.(result);
  }
  return { results, metrics: summarize(results) };
}

export function renderLabelReview(corpus: ScriptedCorpus, manifest: AssertionManifest): string {
  return [
    '# Scripted assertion corpus: owner label review', '',
    `Corpus SHA-256: ${digest(corpus)}`, `Manifest SHA-256: ${digest(manifest)}`,
    `Implementation SHA-256: ${manifest.implementationSha256}`, '',
    'Review all 24 paired screens, both claim labels, rationale, setup, raw capture and screenshot. The approval template remains false until the owner decides.', '',
    ...corpus.cases.flatMap(item => [
      `## ${item.id} — ${item.workflowGroup}`, '',
      `App: ${item.app.bundleId}. Snapshot sequence: ${item.snapshot.sequence}.`,
      `Raw full capture: ${item.assets.fullPath}. Screenshot: ${item.assets.screenshotPath}.`,
      `Setup: ${item.setupSteps.join(' → ')}`, '',
      ...item.claims.map(claim => `- **${claim.id} (${claim.expected ? 'true' : 'false'})** ${claim.claim} — ${claim.rationale}`), '',
    ]),
  ].join('\n');
}
