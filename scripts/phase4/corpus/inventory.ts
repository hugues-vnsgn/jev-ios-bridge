import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { canonicalJsonSha256, rawSha256 } from './digest.js';
import { listTree, objectIds, readBlobs, type Blob, type ObjectRef } from './git.js';
import {
  ANDROID_APPS, ANDROID_CAPTURES, ANDROID_CORRECTED_SCREEN, ANDROID_RECORDED_RAW_SHA256, ANDROID_SETUP_NOTE, ASSET_ROLES,
  FROZEN_COMMITS, FROZEN_DENOMINATORS, IOS_APP_ID_SOURCE, IOS_PREFLIGHT, RECORDED_DIGESTS_SOURCE, SOURCES,
  androidObservationSource, androidScreenSources, iosCaseSources, type AssetRole, type Source,
} from './sources.js';

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const ObjectId = z.string().regex(/^[0-9a-f]{40}$/);
const RepoPath = z.string().min(1).refine(path => !path.startsWith('/') && !path.split('/').includes('..'),
  'a repository-relative path');

const IosCorpusFile = z.object({
  version: z.literal(1),
  cases: z.array(z.object({
    id: z.string(),
    workflowGroup: z.string(),
    app: z.object({ bundleId: z.string() }),
    setupSteps: z.array(z.string()),
    claims: z.array(z.object({ id: z.enum(['a', 'b']), claim: z.string(), expected: z.boolean(), rationale: z.string() })),
    assets: z.object({ fullPath: z.string(), screenshotPath: z.string(), sha256: z.object({ full: Sha256, screenshot: Sha256 }) }),
  })),
});
const FrozenManifestFile = z.strictObject({
  version: z.literal(1), status: z.literal('frozen'), corpusSha256: Sha256, implementationSha256: Sha256,
  model: z.string(), projectionRule: z.string(), questionTemplate: z.string(),
  maxStateBytes: z.number(), stateQuestionMaxBytes: z.number(), requestMaxBytes: z.number(),
  noulYes: z.number(), noulNo: z.number(), gateRule: z.string(),
});
const ApprovalFile = z.strictObject({
  version: z.literal(1), approved: z.boolean(), reviewedBy: z.string(), reviewedAt: z.string(),
  corpusSha256: Sha256, manifestSha256: Sha256,
});
const IosResultsFile = z.object({
  results: z.array(z.object({ caseId: z.string(), probabilities: z.record(z.string(), z.number()), model: z.string() })),
});
const ClaimKind = z.enum(['plain', 'borderline']);
const AndroidClaimsFile = z.record(z.string(), z.array(z.tuple([z.string(), z.boolean(), ClaimKind, z.string()])));
const AndroidOutcome = z.enum(['correct', 'uncertain', 'CONFIDENTLY WRONG']);
const AndroidResultsFile = z.array(z.union([
  z.strictObject({ screen: z.string(), id: z.string(), kind: ClaimKind, truth: z.boolean(), claim: z.string(),
    probability: z.number(), outcome: AndroidOutcome }),
  z.strictObject({ screen: z.string(), inputTokens: z.number(), latencyMs: z.number(), model: z.string(), stateBytes: z.number() }),
]));

const AssetSchema = z.object({
  role: z.enum(ASSET_ROLES),
  commit: ObjectId,
  path: RepoPath,
  blob: ObjectId,
  bytes: z.number().int().nonnegative(),
  sha256: Sha256,
  canonicalJsonSha256: Sha256.optional(),
});
const App = z.object({ id: z.string(), idSource: z.string(), confirmed: z.boolean() });
const IosScreen = z.object({
  platform: z.literal('ios'), screenId: z.string(), workflowGroup: z.string(), app: App, setupSteps: z.array(z.string()),
  claims: z.array(z.object({ originalId: z.enum(['a', 'b']), text: z.string(), truth: z.boolean(), rationale: z.string() })),
  assets: z.array(AssetSchema),
});
const AndroidScreen = z.object({
  platform: z.literal('android'), screenId: z.string(), app: App, setupSteps: z.array(z.string()),
  claims: z.array(z.object({ originalId: z.string(), text: z.string(), truth: z.boolean(), kind: ClaimKind })),
  assets: z.array(AssetSchema),
});
const Totals = z.object({ screens: z.number().int(), claims: z.number().int(), true: z.number().int(), false: z.number().int() });
const DigestCheck = z.object({ recorded: Sha256, recomputed: Sha256 });
const AndroidRunRow = z.object({ screenId: z.string(), originalId: z.string(), kind: ClaimKind, truth: z.boolean(),
  text: z.string(), probability: z.number(), outcome: AndroidOutcome });
const AndroidUsage = z.object({ screenId: z.string(), inputTokens: z.number(), latencyMs: z.number(), model: z.string(),
  stateBytes: z.number() });
const AndroidRun = z.object({ commit: ObjectId, note: z.string(), assets: z.array(AssetSchema),
  claims: z.array(AndroidRunRow), usage: z.array(AndroidUsage) });

const InventorySchema = z.object({
  version: z.literal(1),
  digestConventions: z.object({ raw: z.string(), canonicalJson: z.string() }),
  totals: z.object({ ios: Totals, android: Totals }),
  screens: z.array(z.discriminatedUnion('platform', [IosScreen, AndroidScreen])),
  ios: z.object({
    corpus: z.object({ asset: AssetSchema, canonical: DigestCheck, byteIdenticalAt2ac157a07: z.boolean() }),
    frozenManifest: z.object({ asset: AssetSchema, canonical: DigestCheck, byteIdenticalAt2ac157a07: z.boolean(),
      pins: FrozenManifestFile }),
    definitions: AssetSchema,
    approval: ApprovalFile.extend({ asset: AssetSchema }),
    assetChecks: z.array(z.object({ screenId: z.string(), asset: z.enum(['full', 'screenshot']), recorded: Sha256, recomputed: Sha256 })),
    priorRun: z.object({ commit: ObjectId, provider: z.literal('old provider'), note: z.string(), assets: z.array(AssetSchema),
      results: z.array(z.object({ screenId: z.string(), probabilities: z.record(z.string(), z.number()), model: z.string() })) }),
    excluded: z.array(z.object({ caseId: z.string(), reason: z.string(), assets: z.array(AssetSchema) })),
  }),
  android: z.object({
    claims: AssetSchema,
    setupNote: z.string(),
    captures: z.object({ dir: RepoPath, firstCommit: ObjectId, tree: ObjectId, identicalAt: z.array(ObjectId) }),
    supplementary: z.array(AssetSchema),
    recordedDigests: z.array(z.object({ commit: ObjectId, path: RepoPath, recorded: Sha256, recomputed: Sha256, recordedIn: z.string() })),
    originalRun: AndroidRun,
    placeholderCorrection: AndroidRun.omit({ note: true }).extend({ scope: z.string() }),
  }),
});

export type Inventory = z.infer<typeof InventorySchema>;
export type Asset = z.infer<typeof AssetSchema>;
export type InventoryScreen = Inventory['screens'][number];
type IosScreen = Extract<InventoryScreen, { platform: 'ios' }>;
type AndroidScreen = Extract<InventoryScreen, { platform: 'android' }>;
type Totals = z.infer<typeof Totals>;
type AndroidRunRow = z.infer<typeof AndroidRunRow>;
type AndroidLabel = Pick<AndroidRunRow, 'screenId' | 'originalId' | 'kind' | 'truth' | 'text'>;

export const parseInventory = (value: unknown): Inventory => InventorySchema.parse(value);
export const serializeInventory = (inventory: Inventory): string => `${JSON.stringify(inventory, null, 2)}\n`;

const DIGEST_CONVENTIONS = {
  raw: 'sha256 of the file bytes',
  canonicalJson: 'sha256 of JSON.stringify after sorting object keys recursively, array order kept ' +
    '(digest in spikes/scripted/harness.ts at 88ad659f1)',
};

const key = (ref: ObjectRef): string => `${ref.commit}:${ref.path}`;

function load(refs: readonly ObjectRef[]): Map<string, Blob> {
  return new Map(readBlobs(refs).map(blob => [key(blob), blob]));
}

function blobOf(blobs: Map<string, Blob>, ref: ObjectRef): Blob {
  const blob = blobs.get(key(ref));
  if (!blob) throw new Error(`frozen object not loaded: ${key(ref)}`);
  return blob;
}

const jsonOf = (blob: Blob): unknown => JSON.parse(blob.bytes.toString('utf8'));

function assetOf(blobs: Map<string, Blob>, source: Source): Asset {
  const blob = blobOf(blobs, source);
  return { role: source.role, commit: blob.commit, path: blob.path, blob: blob.blob, bytes: blob.bytes.length,
    sha256: rawSha256(blob.bytes), ...(blob.path.endsWith('.json') ? { canonicalJsonSha256: canonicalJsonSha256(jsonOf(blob)) } : {}) };
}

function totalsOf(screens: readonly InventoryScreen[]): Totals {
  const truths = screens.flatMap(screen => screen.claims.map(claim => claim.truth));
  return { screens: screens.length, claims: truths.length,
    true: truths.filter(truth => truth).length, false: truths.filter(truth => !truth).length };
}

const PREFLIGHT_ROLES: [suffix: string, role: AssetRole][] = [
  ['.full.json', 'ios-full-capture'], ['.jpg', 'ios-screenshot'], ['.snapshot.json', 'ios-snapshot'], ['.meta.json', 'ios-meta'],
];

function preflightSources(): { caseId: string; sources: Source[] }[] {
  const cases = new Map<string, Source[]>();
  for (const path of listTree(IOS_PREFLIGHT.commit, IOS_PREFLIGHT.dir)) {
    const name = path.slice(IOS_PREFLIGHT.dir.length + 1);
    const match = PREFLIGHT_ROLES.find(([suffix]) => name.endsWith(suffix));
    if (!match) throw new Error(`unexpected preflight file ${path}`);
    const caseId = name.slice(0, -match[0].length);
    cases.set(caseId, [...cases.get(caseId) ?? [], { commit: IOS_PREFLIGHT.commit, path, role: match[1] }]);
  }
  const order = PREFLIGHT_ROLES.map(([, role]) => role);
  return [...cases].map(([caseId, sources]) =>
    ({ caseId, sources: sources.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role)) }));
}

function recoverIos(fixed: Map<string, Blob>) {
  const corpusBlob = blobOf(fixed, SOURCES.iosCorpus);
  const manifestBlob = blobOf(fixed, SOURCES.iosFrozenManifest);
  const corpusJson = jsonOf(corpusBlob);
  const manifestJson = jsonOf(manifestBlob);
  const corpus = IosCorpusFile.parse(corpusJson);
  const pins = FrozenManifestFile.parse(manifestJson);
  const approval = ApprovalFile.parse(jsonOf(blobOf(fixed, SOURCES.iosApproval)));
  const prior = IosResultsFile.parse(jsonOf(blobOf(fixed, SOURCES.iosPriorResults)));
  const [corpusAtApproval, manifestAtApproval] = objectIds([
    { commit: FROZEN_COMMITS.iosApproval, path: SOURCES.iosCorpus.path },
    { commit: FROZEN_COMMITS.iosApproval, path: SOURCES.iosFrozenManifest.path },
  ]);

  const cases = corpus.cases.map(entry => ({ entry, sources: iosCaseSources(entry.id, entry.assets) }));
  const preflight = preflightSources();
  const blobs = load([...cases.flatMap(item => item.sources), ...preflight.flatMap(item => item.sources)]);

  const screens: IosScreen[] = cases.map(({ entry, sources }) => ({
    platform: 'ios',
    screenId: entry.id,
    workflowGroup: entry.workflowGroup,
    app: { id: entry.app.bundleId, idSource: IOS_APP_ID_SOURCE, confirmed: true },
    setupSteps: entry.setupSteps,
    claims: entry.claims.map(claim => ({ originalId: claim.id, text: claim.claim, truth: claim.expected, rationale: claim.rationale })),
    assets: sources.map(source => assetOf(blobs, source)),
  }));
  const shaOf = (screenId: string, role: AssetRole): string => {
    const asset = screens.find(screen => screen.screenId === screenId)?.assets.find(item => item.role === role);
    if (!asset) throw new Error(`no ${role} recovered for ${screenId}`);
    return asset.sha256;
  };
  const assetChecks = corpus.cases.flatMap(entry => [
    { screenId: entry.id, asset: 'full' as const, recorded: entry.assets.sha256.full, recomputed: shaOf(entry.id, 'ios-full-capture') },
    { screenId: entry.id, asset: 'screenshot' as const, recorded: entry.assets.sha256.screenshot,
      recomputed: shaOf(entry.id, 'ios-screenshot') },
  ]);
  const priorResults = corpus.cases.map(entry => {
    const result = prior.results.find(item => item.caseId === entry.id);
    if (!result) throw new Error(`no prior iOS result for ${entry.id}`);
    const probabilities = Object.fromEntries(entry.claims.map(claim => {
      const probability = result.probabilities[claim.id];
      if (probability === undefined) throw new Error(`no prior probability for ${entry.id} claim ${claim.id}`);
      return [claim.id, probability];
    }));
    return { screenId: entry.id, probabilities, model: result.model };
  });

  const block: Inventory['ios'] = {
    corpus: { asset: assetOf(fixed, SOURCES.iosCorpus),
      canonical: { recorded: approval.corpusSha256, recomputed: canonicalJsonSha256(corpusJson) },
      byteIdenticalAt2ac157a07: corpusAtApproval === corpusBlob.blob },
    frozenManifest: { asset: assetOf(fixed, SOURCES.iosFrozenManifest),
      canonical: { recorded: approval.manifestSha256, recomputed: canonicalJsonSha256(manifestJson) },
      byteIdenticalAt2ac157a07: manifestAtApproval === manifestBlob.blob, pins },
    definitions: assetOf(fixed, SOURCES.iosDefinitions),
    approval: { ...approval, asset: assetOf(fixed, SOURCES.iosApproval) },
    assetChecks,
    priorRun: {
      commit: FROZEN_COMMITS.iosApproval,
      provider: 'old provider',
      note: 'Answers from the archived harness over MobileBuildMCP snapshots with visible-full-text-v1; history only, ' +
        'not evidence for the Appium path.',
      assets: [SOURCES.iosPriorResults, SOURCES.iosPriorPartial, SOURCES.iosPriorSummary].map(source => assetOf(fixed, source)),
      results: priorResults,
    },
    excluded: preflight.map(({ caseId, sources }) => ({ caseId,
      reason: 'preflight capture, superseded by the scored case of the same id; never scored',
      assets: sources.map(source => assetOf(blobs, source)) })),
  };
  return { screens, block };
}

function runRows(rows: z.infer<typeof AndroidResultsFile>) {
  const claims: AndroidRunRow[] = [];
  const usage: Inventory['android']['originalRun']['usage'] = [];
  for (const row of rows) {
    if ('outcome' in row) {
      claims.push({ screenId: row.screen, originalId: row.id, kind: row.kind, truth: row.truth, text: row.claim,
        probability: row.probability, outcome: row.outcome });
    } else {
      usage.push({ screenId: row.screen, inputTokens: row.inputTokens, latencyMs: row.latencyMs, model: row.model,
        stateBytes: row.stateBytes });
    }
  }
  return { claims, usage };
}

function requireRowsMatchLabels(rows: readonly AndroidRunRow[], labels: readonly AndroidLabel[], what: string): void {
  const same = rows.length === labels.length && rows.every((row, index) => {
    const label = labels[index];
    return label !== undefined && row.screenId === label.screenId && row.originalId === label.originalId &&
      row.kind === label.kind && row.truth === label.truth && row.text === label.text;
  });
  if (!same) throw new Error(`${what} rows do not match the frozen Android labels`);
}

function recoverAndroid(fixed: Map<string, Blob>) {
  const labels = AndroidClaimsFile.parse(jsonOf(blobOf(fixed, SOURCES.androidClaims)));
  const original = runRows(AndroidResultsFile.parse(jsonOf(blobOf(fixed, SOURCES.androidOriginalResults))));
  const recheck = runRows(AndroidResultsFile.parse(jsonOf(blobOf(fixed, SOURCES.androidRecheckResults))));

  const screenIds = Object.keys(labels);
  const observations = screenIds.map(androidObservationSource);
  const blobs = load([...screenIds.flatMap(androidScreenSources), ...observations]);
  const screens: AndroidScreen[] = screenIds.map(screenId => {
    const app = ANDROID_APPS[screenId];
    if (!app) throw new Error(`no app identity recorded for Android screen ${screenId}`);
    return {
      platform: 'android',
      screenId,
      app: { id: app.id, idSource: app.idSource, confirmed: app.confirmed },
      setupSteps: [],
      claims: (labels[screenId] ?? []).map(([originalId, truth, kind, text]) => ({ originalId, text, truth, kind })),
      assets: androidScreenSources(screenId).map(source => assetOf(blobs, source)),
    };
  });

  const labelsOf = (screen: AndroidScreen): AndroidLabel[] =>
    screen.claims.map(claim => ({ screenId: screen.screenId, ...claim }));
  requireRowsMatchLabels(original.claims, screens.flatMap(labelsOf), 'original run');
  requireRowsMatchLabels(recheck.claims,
    screens.filter(screen => screen.screenId === ANDROID_CORRECTED_SCREEN).flatMap(labelsOf), 'placeholder recheck');

  const later = FROZEN_COMMITS.androidCorrection;
  const [claimsBlob, resultsBlob, laterClaimsBlob, laterResultsBlob] = objectIds([SOURCES.androidClaims,
    SOURCES.androidOriginalResults, { commit: later, path: SOURCES.androidClaims.path },
    { commit: later, path: SOURCES.androidOriginalResults.path }]);
  if (claimsBlob !== laterClaimsBlob || resultsBlob !== laterResultsBlob) {
    throw new Error('Android claims.json or results.json differ between 755d0ff and 2366759');
  }
  const recorded = load(ANDROID_RECORDED_RAW_SHA256);
  const trees = objectIds([ANDROID_CAPTURES.firstCommit, ...ANDROID_CAPTURES.laterCommits]
    .map(commit => ({ commit, path: ANDROID_CAPTURES.dir })));
  if (new Set(trees).size !== 1 || !trees[0]) throw new Error('Android captures changed after their first commit');

  const block: Inventory['android'] = {
    claims: assetOf(fixed, SOURCES.androidClaims),
    setupNote: ANDROID_SETUP_NOTE,
    captures: { dir: ANDROID_CAPTURES.dir, firstCommit: ANDROID_CAPTURES.firstCommit, tree: trees[0],
      identicalAt: [...ANDROID_CAPTURES.laterCommits] },
    supplementary: [assetOf(fixed, SOURCES.androidSupplementary)],
    recordedDigests: ANDROID_RECORDED_RAW_SHA256.map(item => ({ commit: item.commit, path: item.path, recorded: item.sha256,
      recomputed: rawSha256(blobOf(recorded, item).bytes), recordedIn: RECORDED_DIGESTS_SOURCE })),
    originalRun: {
      commit: FROZEN_COMMITS.androidOriginal,
      note: 'One call per screen through createAssertionJudge with the original t/f/b ids, rendered by the prototype ' +
        'element-mapping.cjs over archived mobilecli JSON; not the production Appium capture or normalizer. The runner ' +
        'imported src/scripted/jev.ts by relative path, with no implementation digest.',
      assets: [SOURCES.androidOriginalResults, SOURCES.androidOriginalRunner, SOURCES.androidOriginalMapping]
        .map(source => assetOf(fixed, source)).concat(observations.map(source => assetOf(blobs, source))),
      ...original,
    },
    placeholderCorrection: {
      commit: FROZEN_COMMITS.androidCorrection,
      scope: `Partial recheck of ${ANDROID_CORRECTED_SCREEN} only, after the placeholder fix; not a whole-corpus pass, ` +
        'and never merged into the original run.',
      assets: [SOURCES.androidRecheckResults, SOURCES.androidCorrectedRunner, SOURCES.androidCorrectedMapping,
        SOURCES.androidCorrectedObservation].map(source => assetOf(fixed, source)),
      ...recheck,
    },
  };
  return { screens, block };
}

/** Builds the typed inventory from the frozen git objects alone. */
export function recoverInventory(): Inventory {
  const fixed = load(Object.values(SOURCES));
  const ios = recoverIos(fixed);
  const android = recoverAndroid(fixed);
  const totals = { ios: totalsOf(ios.screens), android: totalsOf(android.screens) };
  for (const platform of ['ios', 'android'] as const) {
    const expected = FROZEN_DENOMINATORS[platform];
    if (totals[platform].screens !== expected.screens || totals[platform].claims !== expected.claims) {
      throw new Error(`${platform} recovered ${totals[platform].screens}/${totals[platform].claims}, ` +
        `not the frozen ${expected.screens}/${expected.claims}`);
    }
  }
  return { version: 1, digestConventions: DIGEST_CONVENTIONS, totals, screens: [...ios.screens, ...android.screens],
    ios: ios.block, android: android.block };
}

export function allAssets(inventory: Inventory): Asset[] {
  const { ios, android } = inventory;
  return [
    ...inventory.screens.flatMap(screen => screen.assets),
    ios.corpus.asset, ios.definitions, ios.frozenManifest.asset, ios.approval.asset, ...ios.priorRun.assets,
    ...ios.excluded.flatMap(entry => entry.assets),
    android.claims, ...android.supplementary, ...android.originalRun.assets, ...android.placeholderCorrection.assets,
  ];
}

/** Writes every inventoried asset from git objects under `dir/<commit>/<path>`, checking each file's hash. */
export function extractAssets(inventory: Inventory, dir: string): string[] {
  const assets = allAssets(inventory);
  const blobs = new Map(readBlobs(assets).map(blob => [key(blob), blob]));
  return assets.map(asset => {
    const target = join(dir, asset.commit, asset.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, blobOf(blobs, asset).bytes);
    if (rawSha256(readFileSync(target)) !== asset.sha256) throw new Error(`extracted ${key(asset)} does not match the inventory`);
    return target;
  });
}
