import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** The kit's own output folder, relative to the repository root. */
export const KIT_DIR = '.scratch/appium-mcp-migration/phase4/corpus';
export const KIT_FILES = {
  inventory: 'inventory.json',
  manifest: 'manifest.json',
  sealedRequestIds: 'android-request-ids.sealed.json',
} as const;

export const FROZEN_COMMITS = {
  iosFreeze: '88ad659f1e57baa44f4f65e89cae2d33bd96f2c2',
  iosApproval: '2ac157a07d9227e69b60dcd85b6d58bf8645db88',
  androidOriginal: '755d0ff8ff40ea70f36fe888a1571e60cc64f08c',
  androidCorrection: '2366759d0832065674c8e353d3eb1ad0bf326cea',
  androidCapturesFirst: '50e0d771c125978db08d7e6a06da587dae389568',
} as const;

export const ASSET_ROLES = [
  'ios-corpus', 'ios-definitions', 'ios-frozen-manifest', 'ios-approval',
  'ios-full-capture', 'ios-screenshot', 'ios-snapshot', 'ios-meta',
  'ios-prior-results', 'ios-prior-partial', 'ios-prior-summary',
  'android-claims', 'android-capture', 'android-screenshot', 'android-observation', 'android-supplementary-uiautomator',
  'android-results', 'android-runner', 'android-mapping',
  'android-recheck-results', 'android-corrected-observation',
] as const;
export type AssetRole = (typeof ASSET_ROLES)[number];

export interface Source { commit: string; path: string; role: AssetRole }

const IOS = 'spikes/scripted/corpus';
const IOS_RESULTS = 'spikes/scripted/results/evaluation';
const ANDROID = 'spikes/android';
const { iosFreeze, iosApproval, androidOriginal, androidCorrection } = FROZEN_COMMITS;

/** Every fixed frozen file. Per-screen files come from the path builders below. */
export const SOURCES = {
  iosCorpus: { commit: iosFreeze, path: `${IOS}/corpus.json`, role: 'ios-corpus' },
  iosDefinitions: { commit: iosFreeze, path: `${IOS}/definitions.json`, role: 'ios-definitions' },
  iosFrozenManifest: { commit: iosFreeze, path: `${IOS}/review/manifest.frozen.json`, role: 'ios-frozen-manifest' },
  iosApproval: { commit: iosApproval, path: `${IOS}/review/approval.json`, role: 'ios-approval' },
  iosPriorResults: { commit: iosApproval, path: `${IOS_RESULTS}/results.json`, role: 'ios-prior-results' },
  iosPriorPartial: { commit: iosApproval, path: `${IOS_RESULTS}/evaluate.partial.jsonl`, role: 'ios-prior-partial' },
  iosPriorSummary: { commit: iosApproval, path: `${IOS_RESULTS}/results.md`, role: 'ios-prior-summary' },
  androidClaims: { commit: androidOriginal, path: `${ANDROID}/jev-check/claims.json`, role: 'android-claims' },
  androidSupplementary: { commit: androidOriginal, path: `${ANDROID}/captures/twin-1-uiautomator.xml`,
    role: 'android-supplementary-uiautomator' },
  androidOriginalResults: { commit: androidOriginal, path: `${ANDROID}/jev-check/results.json`, role: 'android-results' },
  androidOriginalRunner: { commit: androidOriginal, path: `${ANDROID}/jev-check/run.ts`, role: 'android-runner' },
  androidOriginalMapping: { commit: androidOriginal, path: `${ANDROID}/element-mapping.cjs`, role: 'android-mapping' },
  androidRecheckResults: { commit: androidCorrection, path: `${ANDROID}/jev-check/results-placeholder-recheck.json`,
    role: 'android-recheck-results' },
  androidCorrectedRunner: { commit: androidCorrection, path: `${ANDROID}/jev-check/run.ts`, role: 'android-runner' },
  androidCorrectedMapping: { commit: androidCorrection, path: `${ANDROID}/element-mapping.cjs`, role: 'android-mapping' },
  androidCorrectedObservation: { commit: androidCorrection, path: `${ANDROID}/jev-check/observations/cmp-3-number-input.txt`,
    role: 'android-corrected-observation' },
} as const satisfies Record<string, Source>;

export const IOS_PREFLIGHT = { commit: iosFreeze, dir: `${IOS}/preflight` } as const;
export const ANDROID_CAPTURES = { dir: `${ANDROID}/captures`, firstCommit: FROZEN_COMMITS.androidCapturesFirst,
  laterCommits: [androidOriginal, androidCorrection] } as const;
export const ANDROID_CORRECTED_SCREEN = 'cmp-3-number-input';

/** corpus.json names each case's full capture and screenshot relative to the corpus folder. */
export const iosCaseSources = (caseId: string, assets: { fullPath: string; screenshotPath: string }): Source[] => [
  { commit: iosFreeze, path: `${IOS}/${assets.fullPath}`, role: 'ios-full-capture' },
  { commit: iosFreeze, path: `${IOS}/${assets.screenshotPath}`, role: 'ios-screenshot' },
  { commit: iosFreeze, path: `${IOS}/raw/${caseId}.snapshot.json`, role: 'ios-snapshot' },
  { commit: iosFreeze, path: `${IOS}/raw/${caseId}.meta.json`, role: 'ios-meta' },
];

export const androidScreenSources = (screenId: string): Source[] => [
  { commit: androidOriginal, path: `${ANDROID}/captures/${screenId}.json`, role: 'android-capture' },
  { commit: androidOriginal, path: `${ANDROID}/captures/${screenId}.png`, role: 'android-screenshot' },
];

export const androidObservationSource = (screenId: string): Source =>
  ({ commit: androidOriginal, path: `${ANDROID}/jev-check/observations/${screenId}.txt`, role: 'android-observation' });

/** Raw SHA-256 values that research/corpus-provenance.md records at 2366759 for the Android labels and both runs. */
export const ANDROID_RECORDED_RAW_SHA256 = [
  { commit: androidCorrection, path: SOURCES.androidClaims.path,
    sha256: '4458fc35a7ee732b7c03e765649fae90b260eddfe26b5f2d5cc4db36d7fe4179' },
  { commit: androidCorrection, path: SOURCES.androidOriginalResults.path,
    sha256: '8bcfebff5fe2a209f1cba6df7fdaf0d666587eb744ec8883e87ea28b9f2ef35c' },
  { commit: androidCorrection, path: SOURCES.androidRecheckResults.path,
    sha256: '541ceb7cf63067eb2cd6d0429a20e3a5f0852735e6141ec8a5763b5bb2962067' },
] as const;
export const RECORDED_DIGESTS_SOURCE = 'research/corpus-provenance.md';

/** The phase 4 exit denominators (phase-4-acceptance.md, Corpus exit). */
export const FROZEN_DENOMINATORS = {
  ios: { screens: 24, claims: 48 },
  android: { screens: 10, claims: 31 },
} as const;

export const IOS_APP_ID_SOURCE = 'corpus.json app.bundleId at 88ad659f1';

const TWIN = { id: 'dev.jevbridge.diagnostic', confirmed: true,
  idSource: 'research/corpus-provenance.md (Android diagnostic twin); examples/diagnostic-app-android applicationId' };
const SETTINGS = { id: 'com.android.settings', confirmed: true,
  idSource: 'frozen capture resource-ids com.android.settings:id/*' };
const CMP = { id: 'org.example.project', confirmed: false,
  idSource: '.scratch/android-support/release-spec.md: package org.example.project, "confirm it before writing scripts"' };

/** Android captures carry no package id, so each screen's app comes from this table. */
export const ANDROID_APPS: Readonly<Record<string, { id: string; idSource: string; confirmed: boolean }>> = {
  'twin-1-choose': TWIN,
  'twin-2-apple-added': TWIN,
  'twin-3-confirmation': TWIN,
  'settings-1-main': SETTINGS,
  'settings-2-display': SETTINGS,
  'settings-3-search': { id: 'com.android.settings', confirmed: false,
    idSource: 'grouped with Settings in research/corpus-provenance.md; its frozen capture carries only ' +
      'com.google.android.settings.intelligence:id/* resource-ids (the Settings search screen)' },
  'cmp-1-launch': CMP,
  'cmp-2-home': CMP,
  'cmp-3-number-input': CMP,
  'cmp-4-fullscreen-modal': CMP,
};

export const ANDROID_SETUP_NOTE = 'spikes/android at 2366759 has no setup transcript; the states to reproduce are ' +
  'described in research/corpus-provenance.md (Original Android states and recovery limits).';
