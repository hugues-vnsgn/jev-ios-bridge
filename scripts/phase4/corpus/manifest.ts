import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { SOURCE_SETTINGS } from '../../../src/appium/wire-schemas.js';
import { STATUS_BAR_ID_PREFIX } from '../../../src/device/android/tree.js';
import { ASSERTION_QUESTION, REQUEST_MAX_BYTES, SCRIPTED_JEV_MODEL, STATE_QUESTION_MAX_BYTES,
  type ScriptedJevError } from '../../../src/scripted/jev.js';
import { MAX_STATE_BYTES, PROJECTION_RULES } from '../../../src/scripted/observe.js';
import { CLAIM_ESTABLISHED_AT, CLAIM_REJECTED_AT } from '../../../src/scripted/run.js';
import { canonicalJsonSha256, rawSha256 } from './digest.js';
import type { Inventory, InventoryScreen } from './inventory.js';
import { FROZEN_DENOMINATORS, KIT_FILES, REPO_ROOT } from './sources.js';

export const PLATFORMS = ['ios', 'android'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PIPELINE_FILES = {
  normalizer: ['src/appium/observe/normalize.ts', 'src/appium/observe/xml.ts', 'src/device/android/mapping.ts'],
  renderer: ['src/scripted/observe.ts'],
  judge: ['src/scripted/jev.ts'],
} as const;
const PIPELINE_GROUPS = ['normalizer', 'renderer', 'judge'] as const;
const PIPELINE_VALUE_KEYS = ['projectionRules', 'model', 'questionTemplate', 'budgets', 'bounds', 'precedence', 'sdk',
  'digestConvention'] as const;

/** Errors from the judge call stop the whole run; local errors before any request only fail their screen. */
export const JUDGE_STOP_CODES = ['AUTH', 'RATE_LIMIT', 'SERVICE', 'NETWORK', 'TIMEOUT', 'MALFORMED_RESPONSE', 'UNKNOWN',
  'ABORTED'] as const satisfies readonly ScriptedJevError['code'][];
export const PIPELINE_FAILURE_CODES = ['OBSERVATION_INCOMPLETE', 'TRUNCATED', 'EMPTY_SCREEN', 'STATE_BUDGET', 'INVALID_INPUT',
  'REQUEST_BUDGET'] as const;
export type JudgeStopCode = (typeof JUDGE_STOP_CODES)[number];
export type PipelineFailureCode = (typeof PIPELINE_FAILURE_CODES)[number];

export const EXIT_RULE = {
  ios: { ...FROZEN_DENOMINATORS.ios, maxConfidentlyWrong: 0, maxUncertain: 3 },
  android: { ...FROZEN_DENOMINATORS.android, maxConfidentlyWrong: 0, maxUncertain: null },
} as const;

export const STOP_RULES = {
  judgmentsPerScreen: 1,
  onExistingResultRecord: 'never-resend',
  onRequestedWithoutResult: 'stop-needs-owner',
  onJudgeError: 'stop-run',
  judgeErrorCodes: [...JUDGE_STOP_CODES],
  onPipelineError: 'record-failed-and-continue',
  pipelineErrorCodes: [...PIPELINE_FAILURE_CODES],
  substitution: 'never retry, re-ask, or switch key, model or provider',
};

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const ObjectId = z.string().regex(/^[0-9a-f]{40}$/);
const FileDigest = z.strictObject({ path: z.string().min(1), sha256: Sha256 });
const PlatformExit = z.strictObject({ screens: z.number().int(), claims: z.number().int(), maxConfidentlyWrong: z.number().int(),
  maxUncertain: z.number().int().nullable() });

const Pipeline = z.strictObject({
  normalizer: z.strictObject({ files: z.array(FileDigest), values: z.strictObject({
    snapshotMaxDepth: z.strictObject({ ios: z.number(), android: z.number() }), androidStatusBarIdPrefix: z.string() }) }),
  renderer: z.strictObject({ files: z.array(FileDigest) }),
  judge: z.strictObject({ files: z.array(FileDigest) }),
  projectionRules: z.strictObject({ ios: z.string(), android: z.string() }),
  model: z.string(),
  questionTemplate: z.string(),
  budgets: z.strictObject({ maxStateBytes: z.number(), stateQuestionMaxBytes: z.number(), requestMaxBytes: z.number() }),
  bounds: z.strictObject({ establishedAt: z.number(), rejectedAt: z.number() }),
  precedence: z.string(),
  sdk: z.strictObject({ name: z.string(), version: z.string() }),
  digestConvention: z.strictObject({ pipelineFiles: z.string(), captures: z.string(), inventory: z.string(),
    sealedRequestIds: z.string() }),
});

const ManifestClaim = z.strictObject({ requestId: z.string(), text: z.string(), truth: z.boolean(),
  kind: z.enum(['plain', 'borderline']).nullable() });
const PendingCapture = z.strictObject({ status: z.literal('pending'), kind: z.null(), appiumXml: z.null(), screenshot: z.null(),
  appBuild: z.null(), device: z.null(), capturedAt: z.null(), sessionId: z.null() });
const CapturedCapture = z.strictObject({ status: z.literal('captured'), kind: z.enum(['live', 'stand-in']), appiumXml: FileDigest,
  screenshot: FileDigest, appBuild: z.string(), device: z.string(), capturedAt: z.string(), sessionId: z.string() });

const ManifestScreen = z.strictObject({
  platform: z.enum(PLATFORMS),
  screenId: z.string(),
  source: z.strictObject({
    labels: z.strictObject({ commit: ObjectId, path: z.string(), digestConvention: z.enum(['raw-sha256', 'canonical-json-sha256']),
      sha256: Sha256 }),
    evidence: z.array(z.strictObject({ role: z.string(), commit: ObjectId, path: z.string(), sha256: Sha256 })),
  }),
  claims: z.array(ManifestClaim),
  setup: z.strictObject({
    app: z.strictObject({ id: z.string(), idSource: z.string(), confirmed: z.boolean() }),
    setupSteps: z.array(z.string()),
    appBuild: z.string().nullable(),
    device: z.string().nullable(),
    stateSetupEvidence: z.string().nullable(),
    correspondence: z.strictObject({ status: z.literal('pending') }),
  }),
  capture: z.discriminatedUnion('status', [PendingCapture, CapturedCapture]),
  judgment: z.strictObject({ allocation: z.number().int(), resultRecord: z.string() }),
});

const PreregistrationManifest = z.strictObject({
  version: z.literal(1),
  inventorySha256: Sha256,
  sealedRequestIdsSha256: Sha256,
  pipeline: Pipeline,
  exitRule: z.strictObject({ ios: PlatformExit, android: PlatformExit }),
  stopRules: z.strictObject({
    judgmentsPerScreen: z.number(), onExistingResultRecord: z.string(), onRequestedWithoutResult: z.string(),
    onJudgeError: z.string(), judgeErrorCodes: z.array(z.string()), onPipelineError: z.string(),
    pipelineErrorCodes: z.array(z.string()), substitution: z.string(),
  }),
  screens: z.array(ManifestScreen),
});
const SealedRequestIds = z.array(z.strictObject({ screenId: z.string(), requestId: z.string(), originalId: z.string() }));

export type PreregistrationManifest = z.infer<typeof PreregistrationManifest>;
export type ManifestScreen = z.infer<typeof ManifestScreen>;
export type ManifestClaim = z.infer<typeof ManifestClaim>;
export type SealedRequestIds = z.infer<typeof SealedRequestIds>;
type Pipeline = z.infer<typeof Pipeline>;

export const parseManifest = (value: unknown): PreregistrationManifest => PreregistrationManifest.parse(value);
export const jsonText = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/** Neutral: built from the screen and claim text only, so it carries neither the original t/f/b id nor the truth. */
export const androidRequestId = (screenId: string, text: string): string =>
  `c${rawSha256(`android\0${screenId}\0${text}`).slice(0, 10)}`;

const PENDING_CAPTURE = { status: 'pending', kind: null, appiumXml: null, screenshot: null, appBuild: null, device: null,
  capturedAt: null, sessionId: null } as const;

function claimsOf(screen: InventoryScreen): ManifestClaim[] {
  switch (screen.platform) {
    case 'ios':
      return screen.claims.map(claim => ({ requestId: claim.originalId, text: claim.text, truth: claim.truth, kind: null }));
    case 'android':
      return screen.claims.map(claim => ({ requestId: androidRequestId(screen.screenId, claim.text), text: claim.text,
        truth: claim.truth, kind: claim.kind }));
    default: {
      const exhaustive: never = screen;
      return exhaustive;
    }
  }
}

function labelsOf(inventory: Inventory, screen: InventoryScreen): ManifestScreen['source']['labels'] {
  switch (screen.platform) {
    case 'ios': {
      const { asset, canonical } = inventory.ios.corpus;
      return { commit: asset.commit, path: asset.path, digestConvention: 'canonical-json-sha256', sha256: canonical.recomputed };
    }
    case 'android': {
      const asset = inventory.android.claims;
      return { commit: asset.commit, path: asset.path, digestConvention: 'raw-sha256', sha256: asset.sha256 };
    }
    default: {
      const exhaustive: never = screen;
      return exhaustive;
    }
  }
}

function skeletonScreen(inventory: Inventory, screen: InventoryScreen): ManifestScreen {
  const claims = claimsOf(screen);
  if (new Set(claims.map(claim => claim.requestId)).size !== claims.length) {
    throw new Error(`request ids collide on ${screen.screenId}`);
  }
  return {
    platform: screen.platform,
    screenId: screen.screenId,
    source: { labels: labelsOf(inventory, screen),
      evidence: screen.assets.map(({ role, commit, path, sha256 }) => ({ role, commit, path, sha256 })) },
    claims,
    setup: { app: screen.app, setupSteps: screen.setupSteps, appBuild: null, device: null, stateSetupEvidence: null,
      correspondence: { status: 'pending' } },
    capture: PENDING_CAPTURE,
    judgment: { allocation: 1, resultRecord: `results/${screen.platform}/${screen.screenId}.json` },
  };
}

function sealedOf(inventory: Inventory): SealedRequestIds {
  return inventory.screens.flatMap(screen => screen.platform === 'android'
    ? screen.claims.map(claim => ({ screenId: screen.screenId, requestId: androidRequestId(screen.screenId, claim.text),
      originalId: claim.originalId }))
    : []);
}

const fileSha256 = (repoRoot: string, path: string): string | null => {
  const absolute = join(repoRoot, path);
  return existsSync(absolute) ? rawSha256(readFileSync(absolute)) : null;
};

const PackageLock = z.object({ packages: z.record(z.string(), z.object({ version: z.string().optional() })) });
function sdkVersion(repoRoot: string): string | null {
  const path = join(repoRoot, 'package-lock.json');
  if (!existsSync(path)) return null;
  const lock = PackageLock.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  return lock.success ? lock.data.packages['node_modules/@typesafe-ai/sdk']?.version ?? null : null;
}

/** The production pipeline as the repository at `repoRoot` holds it now; `null` marks an unreadable input. */
function currentPipeline(repoRoot: string): { pipeline: Pipeline; unreadable: string[] } {
  const unreadable: string[] = [];
  const files = (paths: readonly string[]) => paths.map(path => {
    const sha256 = fileSha256(repoRoot, path);
    if (sha256 === null) unreadable.push(path);
    return { path, sha256: sha256 ?? 'missing' };
  });
  const sdk = sdkVersion(repoRoot);
  if (sdk === null) unreadable.push('package-lock.json @typesafe-ai/sdk');
  const pipeline: Pipeline = {
    normalizer: { files: files(PIPELINE_FILES.normalizer), values: {
      snapshotMaxDepth: { ios: SOURCE_SETTINGS.ios.snapshotMaxDepth, android: SOURCE_SETTINGS.android.snapshotMaxDepth },
      androidStatusBarIdPrefix: STATUS_BAR_ID_PREFIX } },
    renderer: { files: files(PIPELINE_FILES.renderer) },
    judge: { files: files(PIPELINE_FILES.judge) },
    projectionRules: { ios: PROJECTION_RULES.ios, android: PROJECTION_RULES.android },
    model: SCRIPTED_JEV_MODEL,
    questionTemplate: ASSERTION_QUESTION,
    budgets: { maxStateBytes: MAX_STATE_BYTES, stateQuestionMaxBytes: STATE_QUESTION_MAX_BYTES, requestMaxBytes: REQUEST_MAX_BYTES },
    bounds: { establishedAt: CLAIM_ESTABLISHED_AT, rejectedAt: CLAIM_REJECTED_AT },
    precedence: 'false-wins',
    sdk: { name: '@typesafe-ai/sdk', version: sdk ?? 'missing' },
    digestConvention: { pipelineFiles: 'raw-sha256', captures: 'raw-sha256', inventory: 'canonical-json-sha256',
      sealedRequestIds: 'canonical-json-sha256' },
  };
  return { pipeline, unreadable };
}

/** The skeleton preregistration (every capture pending) and the sealed Android id map it digests. */
export function generateManifest(inventory: Inventory, repoRoot: string = REPO_ROOT):
    { manifest: PreregistrationManifest; sealedRequestIds: SealedRequestIds } {
  const { pipeline, unreadable } = currentPipeline(repoRoot);
  if (unreadable.length) throw new Error(`pipeline inputs unreadable: ${unreadable.join(', ')}`);
  const sealedRequestIds = sealedOf(inventory);
  const manifest: PreregistrationManifest = {
    version: 1,
    inventorySha256: canonicalJsonSha256(inventory),
    sealedRequestIdsSha256: canonicalJsonSha256(sealedRequestIds),
    pipeline,
    exitRule: EXIT_RULE,
    stopRules: STOP_RULES,
    screens: inventory.screens.map(screen => skeletonScreen(inventory, screen)),
  };
  return { manifest, sealedRequestIds };
}

export const REFUSAL_CODES = ['MISSING_FIELD', 'SCHEMA', 'DENOMINATOR_CHANGED', 'EXIT_RULE_CHANGED', 'STOP_RULES_CHANGED',
  'SCREEN_SET_CHANGED', 'CLAIM_CHANGED', 'TRUTH_MISMATCH', 'SOURCE_MISMATCH', 'SETUP_MISMATCH', 'ALLOCATION_CHANGED',
  'INVENTORY_DIGEST_MISMATCH', 'SEALED_MAP_MISMATCH', 'PIPELINE_DIGEST_MISMATCH', 'PIPELINE_VALUE_MISMATCH',
  'CAPTURE_HASH_MISMATCH'] as const;
export interface Refusal { code: (typeof REFUSAL_CODES)[number]; at: string; detail: string }

function isMissing(root: unknown, path: readonly PropertyKey[]): boolean {
  let node = root;
  for (const segment of path.slice(0, -1)) {
    if (typeof node !== 'object' || node === null) return false;
    node = Reflect.get(node, segment);
  }
  const last = path.at(-1);
  return last !== undefined && typeof node === 'object' && node !== null && !Object.hasOwn(node, last);
}

/** Every reason the manifest may not be used, or an empty list when it verifies. */
export function verifyManifest(raw: unknown, context: { inventory: Inventory; repoRoot: string; manifestDir: string }): Refusal[] {
  const parsed = PreregistrationManifest.safeParse(raw);
  if (!parsed.success) {
    return parsed.error.issues.map(issue => ({ code: isMissing(raw, issue.path) ? 'MISSING_FIELD' : 'SCHEMA',
      at: issue.path.map(String).join('.'), detail: issue.message }));
  }
  const manifest = parsed.data;
  const { inventory } = context;
  const refusals: Refusal[] = [];
  const refuse = (code: Refusal['code'], at: string, detail: string) => { refusals.push({ code, at, detail }); };

  for (const platform of PLATFORMS) {
    const expected = EXIT_RULE[platform];
    const rule = manifest.exitRule[platform];
    if (rule.screens !== expected.screens || rule.claims !== expected.claims) {
      refuse('DENOMINATOR_CHANGED', `exitRule.${platform}`, `${rule.screens}/${rule.claims}, frozen ${expected.screens}/${expected.claims}`);
    } else if (!isDeepStrictEqual(rule, expected)) {
      refuse('EXIT_RULE_CHANGED', `exitRule.${platform}`, 'differs from the phase 4 corpus exit');
    }
    const frozen = inventory.totals[platform];
    if (frozen.screens !== expected.screens || frozen.claims !== expected.claims) {
      refuse('DENOMINATOR_CHANGED', `inventory.totals.${platform}`, `${frozen.screens}/${frozen.claims}`);
    }
    const screens = manifest.screens.filter(screen => screen.platform === platform);
    const claims = screens.reduce((sum, screen) => sum + screen.claims.length, 0);
    if (screens.length !== expected.screens || claims !== expected.claims) {
      refuse('DENOMINATOR_CHANGED', `screens.${platform}`, `${screens.length}/${claims}, frozen ${expected.screens}/${expected.claims}`);
    }
  }
  if (!isDeepStrictEqual(manifest.stopRules, STOP_RULES)) refuse('STOP_RULES_CHANGED', 'stopRules', 'differs from the replay rules');
  if (manifest.inventorySha256 !== canonicalJsonSha256(inventory)) {
    refuse('INVENTORY_DIGEST_MISMATCH', 'inventorySha256', 'differs from the inventory digest');
  }

  const skeletons = inventory.screens.map(screen => skeletonScreen(inventory, screen));
  const label = (screen: { platform: string; screenId: string }) => `${screen.platform}:${screen.screenId}`;
  if (!isDeepStrictEqual(manifest.screens.map(label), skeletons.map(label))) {
    const present = new Set(manifest.screens.map(label));
    const missing = skeletons.map(label).filter(id => !present.has(id));
    refuse('SCREEN_SET_CHANGED', 'screens', missing.length ? `missing ${missing.join(', ')}` : 'screens added or reordered');
  }
  for (const screen of manifest.screens) {
    const expected = skeletons.find(item => label(item) === label(screen));
    if (!expected) continue;
    const at = `screens.${screen.screenId}`;
    if (screen.claims.length !== expected.claims.length) {
      refuse('CLAIM_CHANGED', `${at}.claims`, `${screen.claims.length} claims, frozen ${expected.claims.length}`);
    }
    screen.claims.forEach((claim, index) => {
      const frozen = expected.claims[index];
      if (!frozen) return;
      if (claim.text !== frozen.text || claim.requestId !== frozen.requestId || claim.kind !== frozen.kind) {
        refuse('CLAIM_CHANGED', `${at}.claims.${index}`, 'text, request id or kind differs from the frozen claim');
      }
      if (claim.truth !== frozen.truth) refuse('TRUTH_MISMATCH', `${at}.claims.${index}`, 'truth differs from the frozen label');
    });
    if (!isDeepStrictEqual(screen.source, expected.source)) refuse('SOURCE_MISMATCH', `${at}.source`, 'differs from the inventory');
    if (!isDeepStrictEqual(screen.setup.app, expected.setup.app) || !isDeepStrictEqual(screen.setup.setupSteps, expected.setup.setupSteps)) {
      refuse('SETUP_MISMATCH', `${at}.setup`, 'app or setup steps differ from the inventory');
    }
    if (!isDeepStrictEqual(screen.judgment, expected.judgment)) refuse('ALLOCATION_CHANGED', `${at}.judgment`, 'one judgment, fixed record path');
    if (screen.capture.status === 'captured') {
      for (const [field, file] of [['appiumXml', screen.capture.appiumXml], ['screenshot', screen.capture.screenshot]] as const) {
        const actual = fileSha256(context.manifestDir, file.path);
        if (actual !== file.sha256) {
          refuse('CAPTURE_HASH_MISMATCH', `${at}.capture.${field}`, actual === null ? 'file missing' : 'file differs from its sha256');
        }
      }
    }
  }

  const sealedPath = join(context.manifestDir, KIT_FILES.sealedRequestIds);
  const sealedRaw: unknown = existsSync(sealedPath) ? JSON.parse(readFileSync(sealedPath, 'utf8')) : null;
  const sealed = SealedRequestIds.safeParse(sealedRaw);
  if (!sealed.success || canonicalJsonSha256(sealedRaw) !== manifest.sealedRequestIdsSha256 ||
      !isDeepStrictEqual(sealed.data, sealedOf(inventory))) {
    refuse('SEALED_MAP_MISMATCH', KIT_FILES.sealedRequestIds, 'missing, changed, or not mapping the request ids to the frozen ids');
  }

  const { pipeline: current } = currentPipeline(context.repoRoot);
  for (const group of PIPELINE_GROUPS) {
    const recorded = manifest.pipeline[group].files;
    if (!isDeepStrictEqual(recorded.map(file => file.path), current[group].files.map(file => file.path))) {
      refuse('PIPELINE_VALUE_MISMATCH', `pipeline.${group}.files`, 'not the production file list');
    }
    for (const file of recorded) {
      const actual = fileSha256(context.repoRoot, file.path);
      if (actual !== file.sha256) {
        refuse('PIPELINE_DIGEST_MISMATCH', `pipeline.${group}.${file.path}`, actual === null ? 'file missing' : 'file changed');
      }
    }
  }
  if (!isDeepStrictEqual(manifest.pipeline.normalizer.values, current.normalizer.values)) {
    refuse('PIPELINE_VALUE_MISMATCH', 'pipeline.normalizer.values', 'differs from the imported constants');
  }
  for (const key of PIPELINE_VALUE_KEYS) {
    if (!isDeepStrictEqual(manifest.pipeline[key], current[key])) {
      refuse('PIPELINE_VALUE_MISMATCH', `pipeline.${key}`, 'differs from the production value');
    }
  }
  return refusals;
}

export interface CaptureInput {
  screenId: string;
  xmlPath: string;
  screenshotPath: string;
  kind: 'live' | 'stand-in';
  appBuild: string;
  device: string;
  capturedAt: string;
  sessionId: string;
}

/** A new manifest with one pending screen captured; paths are stored relative to the manifest folder. */
export function attachCapture(manifest: PreregistrationManifest, input: CaptureInput, manifestDir: string): PreregistrationManifest {
  const target = manifest.screens.find(screen => screen.screenId === input.screenId);
  if (!target) throw new Error(`no screen ${input.screenId} in the manifest`);
  if (target.capture.status !== 'pending') throw new Error(`${input.screenId} is already captured; its capture is kept`);
  const fileOf = (path: string) => {
    const absolute = resolve(manifestDir, path);
    return { path: relative(manifestDir, absolute), sha256: rawSha256(readFileSync(absolute)) };
  };
  const capture = { status: 'captured' as const, kind: input.kind, appiumXml: fileOf(input.xmlPath), screenshot: fileOf(input.screenshotPath),
    appBuild: input.appBuild, device: input.device, capturedAt: input.capturedAt, sessionId: input.sessionId };
  return { ...manifest, screens: manifest.screens.map(screen => screen === target ? { ...screen, capture } : screen) };
}
