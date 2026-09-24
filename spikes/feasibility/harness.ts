import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import type { HistoryEntry, JevJudge, Judgment, Scenario, Snapshot } from '../../src/contracts/index.js';
import { actionOptions, buildObservation, type ObservationVariant } from '../../src/observation/index.js';
import { DEFAULT_WORDING, JEV_MODEL, JevContractError, JevRequestError, type QuestionWording } from '../../src/jev/index.js';
import { ObservationError } from '../../src/observation/index.js';

export interface FeasibilityCase {
  id: string;
  scenarioGroup: string;
  partition: 'tuning' | 'heldout';
  scenario: Scenario;
  compactSnapshot: Snapshot;
  fullSnapshot: Snapshot;
  history: HistoryEntry[];
  assets?: { compactPath: string; fullPath: string; screenshotPath: string;
    sha256?: { compact: string; full: string; screenshot: string } };
  positionalVariant?: { goal: string; acceptableActionIds: string[] };
  /** Proposed by the capturing agent, then bound to owner approval by corpus hash. */
  labels: { acceptableActionIds: string[]; goalReached: boolean; assertions: Record<string, boolean> };
}
export interface FeasibilityCorpus { version: 1; cases: FeasibilityCase[] }
export type ConfigurationId = 'A' | 'B' | 'C' | 'D';
export interface ExperimentConfiguration { id: ConfigurationId; variant: ObservationVariant; history: boolean }
export interface ExperimentManifest {
  version: 1;
  status: 'draft' | 'frozen';
  corpusSha256: string;
  implementationSha256: string;
  model: typeof JEV_MODEL;
  configurations: ExperimentConfiguration[];
  thresholds: number[];
  noulYes: number;
  noulNo: number;
  maxHistory: number;
  maxCandidates: number;
  maxStateBytes: number;
  wording: QuestionWording;
  candidateRule: 'visible-enabled-v1';
  optionRule: 'complete-actions-v1';
  historyRule: 'recent-steps-v1';
  gateRule: 'ticket-07-v1';
  selectionRule: 'coverage-correctness-tokens-order-threshold-v1';
}
export interface OwnerApproval {
  version: 1;
  approved: true;
  reviewedBy: string;
  reviewedAt: string;
  corpusSha256: string;
  manifestSha256: string;
}
export interface CaseResult {
  caseId: string;
  configuration: ConfigurationId;
  variant?: 'primary' | 'positional';
  choice?: string;
  confidence?: number;
  probabilities?: Record<string, number>;
  goalReached?: number;
  assertions?: Record<string, number>;
  inputTokens?: number;
  latencyMs?: number;
  model?: string;
  top1Correct: boolean;
  completionLabelCorrect?: boolean;
  assertionLabelMatches?: number;
  knownFailingAssertions: number;
  falsePassAssertions: number;
  error?: string;
  failureKind?: 'request' | 'observation' | 'response' | 'unknown';
}
export interface GateResult {
  accepted: boolean;
  reason: string;
  correct: boolean;
  verdict?: 'passed' | 'failed';
}
export interface ThresholdSummary {
  configuration: ConfigurationId;
  threshold: number;
  accepted: number;
  incorrectAccepted: number;
  top1Correct: number;
  inputTokens: number;
  qualifying: boolean;
}
export interface FrozenSelection {
  version: 1;
  corpusSha256: string;
  manifestSha256: string;
  configuration: ConfigurationId;
  threshold: number;
  tuningSummary: ThresholdSummary[];
  tuningResultsSha256: string;
}
export interface TuningRun {
  selection: FrozenSelection | null;
  results: Array<CaseResult & { gates: Record<string, GateResult> }>;
  positionalResults: CaseResult[];
  comparison: ThresholdSummary[];
}
export interface HeldoutRun {
  selection: FrozenSelection;
  results: Array<CaseResult & { gate: GateResult }>;
  metrics: {
    total: 20; top1Correct: number; accepted: number; correctAccepted: number;
    incorrectAccepted: number; requestFailures: number; observationFailures: number; responseFailures: number; knownFailingAssertions: number;
    falsePassAssertions: number; completionLabelCorrect: number; assertionLabelMatches: number; assertionLabelsTotal: number;
    coverage: number; acceptedAccuracy: number;
    inputTokens: number; latencyMs: number; passesExploratoryBar: boolean;
  };
}

export class ExperimentError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'ExperimentError'; }
}
const fail = (code: string): never => { throw new ExperimentError(code); };
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Stable semantic hash; property order and JSON formatting do not change approval. */
export function digest(value: unknown): string {
  const canonical = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(canonical);
    if (isRecord(input)) return Object.fromEntries(Object.keys(input).sort().map(key => [key, canonical(input[key])]));
    return input;
  };
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

/** Check the owner-reviewed raw evidence against hashes stored in the approved corpus. */
export async function verifyCorpusAssets(corpus: FeasibilityCorpus, corpusPath: string): Promise<void> {
  const root = await realpath(dirname(resolve(corpusPath)));
  for (const item of corpus.cases) {
    const assets = item.assets;
    if (!assets?.sha256) throw new ExperimentError('CAPTURE_ASSETS_REQUIRED');
    const entries = [
      ['compact', assets.compactPath], ['full', assets.fullPath], ['screenshot', assets.screenshotPath],
    ] as const;
    for (const [kind, path] of entries) {
      if (!path || isAbsolute(path)) fail('CAPTURE_PATH_INVALID');
      const expected = assets.sha256[kind];
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
    }
  }
}

/** Freeze the exact offline decision code and shared input type used for this experiment. */
export function implementationDigest(): string {
  const sources = [
    new URL('../../src/contracts/index.ts', import.meta.url),
    new URL('../../src/observation/index.ts', import.meta.url),
    new URL('../../src/jev/index.ts', import.meta.url),
    new URL('./harness.ts', import.meta.url),
    new URL('./cli.ts', import.meta.url),
  ];
  const hash = createHash('sha256');
  for (const source of sources) hash.update(readFileSync(source));
  return hash.digest('hex');
}

export const CONFIGURATIONS: ExperimentConfiguration[] = [
  { id: 'A', variant: 'compact', history: false },
  { id: 'B', variant: 'compact', history: true },
  { id: 'C', variant: 'full', history: false },
  { id: 'D', variant: 'full', history: true },
];
const THRESHOLDS = [0.6, 0.7, 0.8, 0.9];

export function validateCorpus(corpus: FeasibilityCorpus): void {
  if (corpus.version !== 1 || !Array.isArray(corpus.cases) || corpus.cases.length !== 30) fail('CORPUS_COUNT');
  const ids = new Set<string>();
  const groupPartitions = new Map<string, string>();
  let tuning = 0;
  let heldout = 0;
  let knownFailingHeldout = 0;
  let positionalPairs = 0;
  for (const item of corpus.cases) {
    if (!item.id || !item.scenarioGroup || ids.has(item.id)) fail('CORPUS_ID');
    ids.add(item.id);
    if (item.partition === 'tuning') tuning++;
    else if (item.partition === 'heldout') heldout++;
    else fail('CORPUS_PARTITION');
    const previous = groupPartitions.get(item.scenarioGroup);
    if (previous && previous !== item.partition) fail('SCENARIO_LEAKAGE');
    groupPartitions.set(item.scenarioGroup, item.partition);
    if (!item.scenario?.goal || !item.scenario.app?.bundleId || !isRecord(item.scenario.values) || !Array.isArray(item.scenario.assertions)) fail('SCENARIO_INVALID');
    if (!Array.isArray(item.history) || !item.fullSnapshot?.elements || !item.compactSnapshot?.elements) fail('CAPTURE_INVALID');
    if (!item.labels || !Array.isArray(item.labels.acceptableActionIds) || !item.labels.acceptableActionIds.length || typeof item.labels.goalReached !== 'boolean') fail('LABEL_INVALID');
    const assertions = new Set(item.scenario.assertions.map(assertion => assertion.id));
    if (assertions.size !== item.scenario.assertions.length || !isRecord(item.labels.assertions) ||
        Object.keys(item.labels.assertions).length !== assertions.size) fail('ASSERTION_LABELS');
    for (const id of assertions) {
      if (typeof item.labels.assertions[id] !== 'boolean') fail('ASSERTION_LABELS');
      if (item.partition === 'heldout' && item.labels.assertions[id] === false) knownFailingHeldout++;
    }
    const fullOptions = actionOptions(item.fullSnapshot, item.scenario, 255);
    const fullIds = new Set(fullOptions.map(option => option.id));
    for (const id of item.labels.acceptableActionIds) if (!fullIds.has(id)) fail('LABEL_ACTION_UNKNOWN');
    if (new Set(item.labels.acceptableActionIds).size !== item.labels.acceptableActionIds.length) fail('LABEL_DUPLICATE');
    if (item.positionalVariant) {
      if (item.partition !== 'tuning' || !item.positionalVariant.goal?.trim() || item.positionalVariant.goal === item.scenario.goal ||
          !/(?:first|second|third|fourth|row|\b\d+(?:st|nd|rd|th)\b)/i.test(item.positionalVariant.goal) ||
          !Array.isArray(item.positionalVariant.acceptableActionIds) || !item.positionalVariant.acceptableActionIds.length) fail('POSITIONAL_PAIR_INVALID');
      for (const id of item.positionalVariant.acceptableActionIds) if (!fullIds.has(id)) fail('POSITIONAL_PAIR_INVALID');
      positionalPairs++;
    }
  }
  if (tuning !== 10 || heldout !== 20 || knownFailingHeldout === 0 || positionalPairs === 0) fail('CORPUS_SPLIT');
}

export function makeDraftManifest(corpus: FeasibilityCorpus): ExperimentManifest {
  validateCorpus(corpus);
  return {
    version: 1, status: 'draft', corpusSha256: digest(corpus), implementationSha256: implementationDigest(), model: JEV_MODEL,
    configurations: CONFIGURATIONS.map(config => ({ ...config })), thresholds: [...THRESHOLDS],
    noulYes: 0.9, noulNo: 0.1, maxHistory: 3, maxCandidates: 64, maxStateBytes: 24_000,
    wording: { ...DEFAULT_WORDING }, candidateRule: 'visible-enabled-v1',
    optionRule: 'complete-actions-v1', historyRule: 'recent-steps-v1',
    gateRule: 'ticket-07-v1', selectionRule: 'coverage-correctness-tokens-order-threshold-v1',
  };
}

export function validateFrozenExperiment(corpus: FeasibilityCorpus, manifest: ExperimentManifest, approval: OwnerApproval): void {
  validateCorpus(corpus);
  if (manifest.version !== 1 || manifest.status !== 'frozen' || manifest.model !== JEV_MODEL || manifest.corpusSha256 !== digest(corpus)) fail('MANIFEST_NOT_FROZEN');
  if (manifest.implementationSha256 !== implementationDigest()) fail('IMPLEMENTATION_CHANGED');
  if (JSON.stringify(manifest.configurations) !== JSON.stringify(CONFIGURATIONS) || JSON.stringify(manifest.thresholds) !== JSON.stringify(THRESHOLDS) ||
      manifest.noulYes !== 0.9 || manifest.noulNo !== 0.1 || manifest.candidateRule !== 'visible-enabled-v1' ||
      manifest.optionRule !== 'complete-actions-v1' || manifest.historyRule !== 'recent-steps-v1' ||
      manifest.gateRule !== 'ticket-07-v1' || manifest.selectionRule !== 'coverage-correctness-tokens-order-threshold-v1') fail('MANIFEST_PROTOCOL');
  if (!Number.isSafeInteger(manifest.maxHistory) || manifest.maxHistory < 1 || manifest.maxHistory > 20 ||
      !Number.isSafeInteger(manifest.maxCandidates) || manifest.maxCandidates < 1 || manifest.maxCandidates > 255 ||
      !Number.isSafeInteger(manifest.maxStateBytes) || manifest.maxStateBytes < 1 || manifest.maxStateBytes > 28_000 ||
      !manifest.wording.nextAction || !manifest.wording.goalReached || !manifest.wording.assertion) fail('MANIFEST_SETTINGS');
  if (approval.version !== 1 || approval.approved !== true || !approval.reviewedBy?.trim() || !approval.reviewedAt?.trim() ||
      approval.corpusSha256 !== digest(corpus) || approval.manifestSha256 !== digest(manifest)) fail('OWNER_APPROVAL_REQUIRED');
}

function observationFor(item: FeasibilityCase, config: ExperimentConfiguration, manifest: ExperimentManifest) {
  return buildObservation(item.scenario, config.variant === 'compact' ? item.compactSnapshot : item.fullSnapshot,
    config.history ? item.history : [], {
      variant: config.variant, maxHistory: manifest.maxHistory,
      maxCandidates: manifest.maxCandidates, maxStateBytes: manifest.maxStateBytes,
    });
}

export async function evaluateCase(item: FeasibilityCase, config: ExperimentConfiguration, manifest: ExperimentManifest, judge: JevJudge, signal: AbortSignal, variant: 'primary' | 'positional' = 'primary'): Promise<CaseResult> {
  const knownFailingAssertions = Object.values(item.labels.assertions).filter(value => !value).length;
  const base: CaseResult = { caseId: item.id, configuration: config.id, variant, top1Correct: false, knownFailingAssertions, falsePassAssertions: 0 };
  try {
    const observation = observationFor(item, config, manifest);
    const judgment = await judge.judge(item.scenario, observation, signal);
    const falsePassAssertions = Object.entries(item.labels.assertions).filter(([id, expected]) => !expected && (judgment.assertions[id] ?? -1) >= manifest.noulYes).length;
    const completionLabelCorrect = item.labels.goalReached ? judgment.goalReached >= manifest.noulYes : judgment.goalReached <= manifest.noulNo;
    const assertionLabelMatches = Object.entries(item.labels.assertions).filter(([id, expected]) =>
      expected ? (judgment.assertions[id] ?? -1) >= manifest.noulYes : (judgment.assertions[id] ?? 2) <= manifest.noulNo).length;
    return {
      ...base, choice: judgment.choice, confidence: judgment.confidence, probabilities: judgment.probabilities,
      goalReached: judgment.goalReached, assertions: judgment.assertions, inputTokens: judgment.inputTokens,
      latencyMs: judgment.latencyMs, model: judgment.model,
      top1Correct: item.labels.acceptableActionIds.includes(judgment.choice), completionLabelCorrect,
      assertionLabelMatches, falsePassAssertions,
    };
  } catch (error) {
    if (signal.aborted) return { ...base, error: 'ABORTED', failureKind: 'request' };
    const code = isRecord(error) && typeof error.code === 'string' ? error.code : 'UNKNOWN';
    const failureKind = error instanceof ObservationError ? 'observation' : error instanceof JevContractError ? 'response' :
      error instanceof JevRequestError ? 'request' : 'unknown';
    return { ...base, error: code, failureKind };
  }
}

export function gateCase(item: FeasibilityCase, result: CaseResult, threshold: number, manifest: ExperimentManifest): GateResult {
  const correct = result.top1Correct;
  if (result.error) return { accepted: false, reason: `error:${result.error}`, correct };
  if (!result.choice || result.choice === 'none') return { accepted: false, reason: 'none', correct };
  if (result.confidence === undefined || !Number.isFinite(result.confidence) || result.confidence < threshold) return { accepted: false, reason: 'choice-confidence', correct };
  const snapshot = result.configuration === 'A' || result.configuration === 'B' ? item.compactSnapshot : item.fullSnapshot;
  const action = actionOptions(snapshot, item.scenario, manifest.maxCandidates).find(option => option.id === result.choice)?.action;
  if (!action || result.goalReached === undefined || !Number.isFinite(result.goalReached)) return { accepted: false, reason: 'malformed-action', correct };
  if (action.kind === 'stop-goal') {
    if (result.goalReached < manifest.noulYes) return { accepted: false, reason: 'completion-not-yes', correct };
    const values = Object.values(result.assertions ?? {});
    if (values.length !== item.scenario.assertions.length || values.some(value => value > manifest.noulNo && value < manifest.noulYes)) {
      return { accepted: false, reason: 'assertion-uncertain', correct };
    }
    return { accepted: true, reason: 'accepted', correct, verdict: values.some(value => value <= manifest.noulNo) ? 'failed' : 'passed' };
  }
  if (result.goalReached > manifest.noulNo) return { accepted: false, reason: 'completion-not-no', correct };
  return { accepted: true, reason: 'accepted', correct };
}

function summarize(corpus: FeasibilityCorpus, results: CaseResult[], config: ConfigurationId, threshold: number, manifest: ExperimentManifest): ThresholdSummary {
  const relevant = results.filter(result => result.configuration === config);
  const byId = new Map(corpus.cases.map(item => [item.id, item]));
  const gates = relevant.map(result => gateCase(byId.get(result.caseId)!, result, threshold, manifest));
  const accepted = gates.filter(gate => gate.accepted).length;
  const incorrectAccepted = gates.filter(gate => gate.accepted && !gate.correct).length;
  return {
    configuration: config, threshold, accepted, incorrectAccepted,
    top1Correct: relevant.filter(result => result.top1Correct).length,
    inputTokens: relevant.reduce((total, result) => total + (result.inputTokens ?? 0), 0),
    qualifying: accepted > 0 && incorrectAccepted === 0,
  };
}

function chooseWinner(comparison: ThresholdSummary[], manifest: ExperimentManifest): ThresholdSummary | undefined {
  const bestPerConfig = manifest.configurations.map(config => comparison.filter(row => row.configuration === config.id && row.qualifying)
    .sort((a, b) => b.accepted - a.accepted || a.threshold - b.threshold)[0]).filter((row): row is ThresholdSummary => row !== undefined);
  return bestPerConfig.sort((a, b) => b.accepted - a.accepted || b.top1Correct - a.top1Correct || a.inputTokens - b.inputTokens ||
    a.configuration.localeCompare(b.configuration) || a.threshold - b.threshold)[0];
}

export async function runTuning(corpus: FeasibilityCorpus, manifest: ExperimentManifest, approval: OwnerApproval, judge: JevJudge, signal: AbortSignal, onCase?: (result: CaseResult) => Promise<void>): Promise<TuningRun> {
  validateFrozenExperiment(corpus, manifest, approval);
  const tuning = corpus.cases.filter(item => item.partition === 'tuning');
  const results: CaseResult[] = [];
  const positionalResults: CaseResult[] = [];
  for (const config of manifest.configurations) {
    for (const item of tuning) {
      if (signal.aborted) fail('ABORTED');
      const result = await evaluateCase(item, config, manifest, judge, signal);
      results.push(result);
      await onCase?.(result);
    }
    for (const item of tuning) {
      if (!item.positionalVariant) continue;
      if (signal.aborted) fail('ABORTED');
      const variantItem: FeasibilityCase = { ...item,
        scenario: { ...item.scenario, goal: item.positionalVariant.goal },
        labels: { ...item.labels, acceptableActionIds: item.positionalVariant.acceptableActionIds } };
      const result = await evaluateCase(variantItem, config, manifest, judge, signal, 'positional');
      positionalResults.push(result);
      await onCase?.(result);
    }
  }
  const comparison = manifest.configurations.flatMap(config => manifest.thresholds.map(threshold => summarize(corpus, results, config.id, threshold, manifest)));
  const winner = chooseWinner(comparison, manifest);
  const byId = new Map(corpus.cases.map(item => [item.id, item]));
  const perCase = results.map(result => ({ ...result, gates: Object.fromEntries(manifest.thresholds.map(threshold =>
    [threshold.toFixed(1), gateCase(byId.get(result.caseId)!, result, threshold, manifest)])) }));
  return {
    results: perCase, positionalResults, comparison,
    selection: winner ? { version: 1, corpusSha256: digest(corpus), manifestSha256: digest(manifest), configuration: winner.configuration,
      threshold: winner.threshold, tuningSummary: comparison, tuningResultsSha256: digest({ primary: perCase, positional: positionalResults }) } : null,
  };
}

export function validateFrozenSelection(corpus: FeasibilityCorpus, manifest: ExperimentManifest, approval: OwnerApproval, selection: FrozenSelection, tuningRun: TuningRun): ExperimentConfiguration {
  validateFrozenExperiment(corpus, manifest, approval);
  if (selection.version !== 1 || selection.corpusSha256 !== digest(corpus) || selection.manifestSha256 !== digest(manifest)) fail('SELECTION_MISMATCH');
  if (!tuningRun.selection || digest({ primary: tuningRun.results, positional: tuningRun.positionalResults }) !== selection.tuningResultsSha256 || digest(tuningRun.comparison) !== digest(selection.tuningSummary) ||
      digest(tuningRun.selection) !== digest(selection)) fail('TUNING_LOCK_MISMATCH');
  const expectedComparison = manifest.configurations.flatMap(candidate => manifest.thresholds.map(threshold =>
    summarize(corpus, tuningRun.results, candidate.id, threshold, manifest)));
  if (digest(expectedComparison) !== digest(selection.tuningSummary)) fail('TUNING_LOCK_MISMATCH');
  const winner = chooseWinner(expectedComparison, manifest);
  if (!winner || winner.configuration !== selection.configuration || winner.threshold !== selection.threshold) fail('SELECTION_MISMATCH');
  const config = manifest.configurations.find(candidate => candidate.id === selection.configuration);
  if (!config || !manifest.thresholds.includes(selection.threshold) || !Array.isArray(selection.tuningSummary) || selection.tuningSummary.length !== 16) {
    throw new ExperimentError('SELECTION_INVALID');
  }
  return config;
}

export async function runHeldout(corpus: FeasibilityCorpus, manifest: ExperimentManifest, approval: OwnerApproval, selection: FrozenSelection, tuningRun: TuningRun, judge: JevJudge, signal: AbortSignal, onCase?: (result: CaseResult & { gate: GateResult }) => Promise<void>): Promise<HeldoutRun> {
  const config = validateFrozenSelection(corpus, manifest, approval, selection, tuningRun);
  const heldout = corpus.cases.filter(item => item.partition === 'heldout');
  const results: HeldoutRun['results'] = [];
  for (const item of heldout) {
    if (signal.aborted) fail('ABORTED');
    const result = await evaluateCase(item, config, manifest, judge, signal);
    const gated = { ...result, gate: gateCase(item, result, selection.threshold, manifest) };
    results.push(gated);
    await onCase?.(gated);
  }
  const top1Correct = results.filter(result => result.top1Correct).length;
  const accepted = results.filter(result => result.gate.accepted).length;
  const correctAccepted = results.filter(result => result.gate.accepted && result.gate.correct).length;
  const incorrectAccepted = accepted - correctAccepted;
  const knownFailingAssertions = results.reduce((total, result) => total + result.knownFailingAssertions, 0);
  const falsePassAssertions = results.reduce((total, result) => total + result.falsePassAssertions, 0);
  return { selection, results, metrics: {
    total: 20, top1Correct, accepted, correctAccepted, incorrectAccepted,
    requestFailures: results.filter(result => result.failureKind === 'request').length,
    observationFailures: results.filter(result => result.failureKind === 'observation').length,
    responseFailures: results.filter(result => result.failureKind === 'response').length,
    knownFailingAssertions, falsePassAssertions, coverage: accepted / 20,
    completionLabelCorrect: results.filter(result => result.completionLabelCorrect === true).length,
    assertionLabelMatches: results.reduce((total, result) => total + (result.assertionLabelMatches ?? 0), 0),
    assertionLabelsTotal: heldout.reduce((total, item) => total + item.scenario.assertions.length, 0),
    acceptedAccuracy: accepted === 0 ? 0 : correctAccepted / accepted,
    inputTokens: results.reduce((total, result) => total + (result.inputTokens ?? 0), 0),
    latencyMs: results.reduce((total, result) => total + (result.latencyMs ?? 0), 0),
    passesExploratoryBar: top1Correct >= 18 && accepted >= 16 && incorrectAccepted === 0 && falsePassAssertions === 0,
  } };
}

const escapeTableCell = (value: string): string => value.replaceAll('|', '\\|').replaceAll('\n', ' ');
export function renderLabelReview(corpus: FeasibilityCorpus, manifest: ExperimentManifest): string {
  validateCorpus(corpus);
  const lines = [
    '# Feasibility corpus label review', '',
    `Corpus SHA-256: \`${digest(corpus)}\``, `Manifest SHA-256: \`${digest(manifest)}\``, '',
    'Review every acceptable action, completion label, assertion label, case group and partition. The approval file must bind both hashes after the manifest is frozen.', '',
  ];
  for (const item of corpus.cases) {
    const full = actionOptions(item.fullSnapshot, item.scenario, 255);
    const compactIds = new Set(actionOptions(item.compactSnapshot, item.scenario, 255).map(option => option.id));
    lines.push(`## ${escapeTableCell(item.id)} (${item.partition}; group ${escapeTableCell(item.scenarioGroup)})`, '',
      `Goal: ${escapeTableCell(item.scenario.goal)}`, '',
      ...(item.positionalVariant ? [`Positional alternate goal (same capture, tuning only): ${escapeTableCell(item.positionalVariant.goal)}`,
        `Alternate acceptable action IDs: ${item.positionalVariant.acceptableActionIds.map(id => `\`${id}\``).join(', ')}`, ''] : []),
      `Acceptable action IDs: ${item.labels.acceptableActionIds.map(id => `\`${id}\``).join(', ')}`, '',
      `Goal reached: **${item.labels.goalReached}**`, '',
      `Assertions: ${Object.entries(item.labels.assertions).map(([id, value]) => `\`${id}\`=${value}`).join(', ') || '(none)'}`, '',
      `Evidence: ${item.assets ? `${escapeTableCell(item.assets.compactPath)}, ${escapeTableCell(item.assets.fullPath)}, ${escapeTableCell(item.assets.screenshotPath)}` : '(paths not recorded)'}`, '',
      '| Action ID | Full-snapshot description | In compact capture |', '| --- | --- | --- |',
      ...full.map(option => `| \`${option.id}\` | ${escapeTableCell(option.description)} | ${compactIds.has(option.id) ? 'yes' : 'no'} |`), '');
  }
  return lines.join('\n');
}
