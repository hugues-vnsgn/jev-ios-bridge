import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CUTOVER_STEPS, LIVE_MATRIX, PUBLIC_MODES } from './matrix.js';
import type { DeviceScope, LiveMatrix } from './row.js';

export type CorpusInputs = { iosScreens: string[]; androidScreens: string[] };

const MATRIX_PATH = '.scratch/appium-mcp-migration/phase4/live-matrix.json';
const INDEX_PATH = '.scratch/appium-mcp-migration/phase4/evidence-index.md';
const IOS_CORPUS = { commit: '88ad659f1', path: 'spikes/scripted/corpus/corpus.json' };
const ANDROID_CORPUS = { commit: '755d0ff', path: 'spikes/android/jev-check/claims.json' };
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const escapeCell = (value: string): string => value.replaceAll('|', '\\|').replace(/\s*\r?\n\s*/g, ' ');
const cell = (value: string): string => ` ${escapeCell(value)} `;
const line = (cells: string[]): string => `|${cells.map(cell).join('|')}|`;
const table = (columns: string[], rows: string[][]): string[] => [line(columns), line(columns.map(() => '---')), ...rows.map(line)];

const needsText = (needs: LiveMatrix['rows'][number]['needs']): string => [
  needs.storeActivation ? 'store activation' : 'no store activation',
  needs.phone ? 'assigned phone' : 'no phone',
  needs.jevKey ? 'Jev key' : 'no Jev key',
].join('; ');
const devicesText = (devices: readonly DeviceScope[]): string => devices.join(', ');
const evidenceText = (evidence: readonly string[]): string => evidence.join('; ');
const COLUMNS = ['ID', 'Requirement', 'Devices', 'Evidence', 'Source', 'Needs', 'Status'];

export function renderMatrix(matrix: LiveMatrix): string {
  return `${JSON.stringify(matrix, null, 2)}\n`;
}

/** The requirement-to-evidence index every preserved mode, corpus screen, live row and cutover step reports against. */
export function renderIndex(matrix: LiveMatrix, corpus: CorpusInputs): string {
  const requirement = (title: string, expected: string) => `${title}. ${expected}`;
  const sections: string[] = [
    '# Phase 4 live acceptance evidence index',
    '',
    `Every requirement of the Phase 4 acceptance specification (${matrix.spec}) and of the frozen corpus, with the`,
    'evidence that proves it. No row is proven yet: the live matrix runs only when the owner assigns a device and',
    'activates the real admission store, so every status reads untested until a recorded attempt closes the row.',
    '',
    `Corpus: ${IOS_CORPUS.commit}:${IOS_CORPUS.path} for iOS and ${ANDROID_CORPUS.commit}:${ANDROID_CORPUS.path} for Android.`,
    '',
    '## Live matrix',
    '',
    ...table(COLUMNS, matrix.rows.map(entry => [entry.id, requirement(entry.title, entry.expected),
      devicesText(entry.devices), evidenceText(entry.evidence), entry.source, needsText(entry.needs), 'untested'])),
    '',
    '## Corpus screens',
    '',
    ...table(['ID', 'Screen', 'Platform', 'Requirement', 'Source', 'Frozen in', 'Status'],
      corpus.iosScreens.map(screen => [`ios-${screen}`, screen, 'iOS',
        'The frozen screen is judged once against its recorded truth labels, with no re-asking.',
        IOS_CORPUS.path, IOS_CORPUS.commit, 'untested'])
        .concat(corpus.androidScreens.map(screen => [`android-${screen}`, screen, 'Android',
          'The frozen screen is judged once against its recorded truth labels, with no re-asking.',
          ANDROID_CORPUS.path, ANDROID_CORPUS.commit, 'untested']))),
    '',
    '## Preserved public modes',
    '',
    ...table(COLUMNS, PUBLIC_MODES.map(entry => [entry.id, entry.requirement, devicesText(entry.devices),
      evidenceText(entry.evidence), entry.source, needsText(entry.needs), 'untested'])),
    '',
    '## Cutover and packaging',
    '',
    ...table(COLUMNS, CUTOVER_STEPS.map(entry => [entry.id, entry.requirement, devicesText(entry.devices),
      evidenceText(entry.evidence), entry.source, needsText(entry.needs), 'untested'])),
    '',
  ];
  return sections.join('\n');
}

export function outputs(corpus: CorpusInputs): { path: string; text: string }[] {
  return [{ path: MATRIX_PATH, text: renderMatrix(LIVE_MATRIX) },
    { path: INDEX_PATH, text: renderIndex(LIVE_MATRIX, corpus) }];
}

/** The paths whose committed file is missing or no longer the rendered one. */
export function drifted(root: string, files: { path: string; text: string }[]): string[] {
  return files.filter(file => {
    const path = resolve(root, file.path);
    if (!existsSync(path)) return true;
    return readFileSync(path, 'utf8') !== file.text;
  }).map(file => file.path);
}

export function readCorpus(gitShow: (spec: string) => string): CorpusInputs {
  const ios = JSON.parse(gitShow(`${IOS_CORPUS.commit}:${IOS_CORPUS.path}`)) as { cases: { id: string }[] };
  const android = JSON.parse(gitShow(`${ANDROID_CORPUS.commit}:${ANDROID_CORPUS.path}`)) as Record<string, unknown>;
  return { iosScreens: ios.cases.map(entry => entry.id), androidScreens: Object.keys(android) };
}

function gitShow(spec: string): string {
  return execFileSync('git', ['show', spec], { encoding: 'utf8', maxBuffer: 1 << 28 });
}

function main(argv: string[]): number {
  const files = outputs(readCorpus(gitShow));
  if (argv.includes('--check')) {
    const stale = drifted(ROOT, files);
    if (stale.length) {
      process.stderr.write(`These Phase 4 files are missing or stale: ${stale.join(', ')}\n`);
      return 1;
    }
    process.stdout.write('The Phase 4 live matrix and evidence index are current.\n');
    return 0;
  }
  for (const file of files) {
    const path = resolve(ROOT, file.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file.text);
    process.stdout.write(`Wrote ${file.path}\n`);
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = main(process.argv.slice(2));
}
