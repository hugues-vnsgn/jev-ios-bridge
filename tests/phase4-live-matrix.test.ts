import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { drifted, outputs, readCorpus, renderIndex, renderMatrix, type CorpusInputs } from '../scripts/phase4/live/generate.js';
import { CUTOVER_STEPS, LIVE_MATRIX, PUBLIC_MODES } from '../scripts/phase4/live/matrix.js';
import { DEVICE_SCOPES, liveMatrixSchema, type LiveMatrix } from '../scripts/phase4/live/row.js';

const ACCEPTANCE = '.scratch/appium-mcp-migration/phases/phase-4-acceptance.md';
const MATRIX_JSON = '.scratch/appium-mcp-migration/phase4/live-matrix.json';
const INDEX_MD = '.scratch/appium-mcp-migration/phase4/evidence-index.md';
const CORPUS_COMMITS = ['88ad659f1', '755d0ff'];
const rows = LIVE_MATRIX.rows;
const acceptance = readFileSync(ACCEPTANCE, 'utf8').split('\n');

const hasCommit = (sha: string) => spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`]).status === 0;
function gitShow(spec: string): string {
  const shown = spawnSync('git', ['show', spec], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (shown.status !== 0) throw new Error(`git show ${spec} failed: ${shown.stderr}`);
  return shown.stdout;
}

function categoryLines(): number[] {
  const header = acceptance.findIndex(line => line.startsWith('| Category |'));
  const lines: number[] = [];
  for (let index = header + 2; acceptance[index]?.startsWith('| '); index++) lines.push(index + 1);
  return lines;
}

type Source = { object?: string; path: string; start: number; end: number; raw: string };
function parseSource(raw: string): Source {
  const match = /^(?:([0-9a-f]{7,40}):)?([^:\s]+):(\d+)(?:-(\d+))?$/.exec(raw);
  assert.ok(match, `${raw} is a path:line source`);
  const start = Number(match[3]);
  return { ...(match[1] ? { object: match[1] } : {}), path: match[2]!, start, end: Number(match[4] ?? start), raw };
}
const allSources = () => [LIVE_MATRIX.spec, ...[...rows, ...PUBLIC_MODES, ...CUTOVER_STEPS].map(entry => entry.source)].map(parseSource);
const lineOf = (label: string) => `${ACCEPTANCE}:${acceptance.findIndex(line => line.startsWith(`| ${label} |`)) + 1}`;
function assertReaches(text: string, source: Source) {
  assert.ok(source.start <= source.end, `${source.raw} names an ordered range`);
  assert.ok(text.split('\n').length >= source.end, `${source.raw} cites a line its file has`);
}

/** Rendered markdown tables by section heading, each row split into cells on unescaped pipes. */
function tables(markdown: string): Map<string, string[][]> {
  const sections = new Map<string, string[][]>();
  let heading = '';
  for (const line of markdown.split('\n')) {
    if (line.startsWith('## ')) { heading = line.slice(3); sections.set(heading, []); continue; }
    if (!line.startsWith('|') || line.startsWith('| ID |') || line.startsWith('| ---')) continue;
    sections.get(heading)?.push(line.slice(1, -1).split(/(?<!\\)\|/).map(cell => cell.trim()));
  }
  return sections;
}
const ids = (section: string[][] | undefined) => (section ?? []).map(cells => cells[0]);

const screens: CorpusInputs = { iosScreens: ['s01-one', 's02-two'], androidScreens: ['twin-1'] };

test('the live matrix parses with the live row schema and every row starts untested', () => {
  const parsed = liveMatrixSchema.parse(LIVE_MATRIX);
  assert.deepEqual(parsed.rows.filter(row => row.status !== 'untested').map(row => row.id), []);
});

test('each of the nine acceptance categories has exactly one row per device scope', () => {
  const lines = categoryLines();
  assert.equal(lines.length, 9, 'the acceptance table names nine categories');
  const category = rows.filter(row => row.group === 'category');
  assert.equal(category.length, lines.length * DEVICE_SCOPES.length, 'no category row outside the nine');
  for (const line of lines) {
    const covering = category.filter(row => row.source === `${ACCEPTANCE}:${line}`);
    assert.ok(covering.every(row => row.devices.length === 1), `${acceptance[line - 1]} rows each run on one device`);
    assert.deepEqual(covering.flatMap(row => row.devices).sort(), [...DEVICE_SCOPES].sort(), `${acceptance[line - 1]} covers every scope once`);
  }
  const steps = (row: typeof rows[number]) => row.steps.join(' ');
  assert.deepEqual(category.filter(row => row.devices[0] === 'ios-simulator' && !/examples\/diagnostic-app(?!-android)/.test(steps(row))).map(row => row.id), []);
  assert.deepEqual(category.filter(row => row.devices[0] !== 'ios-simulator' && !steps(row).includes('examples/diagnostic-app-android')).map(row => row.id), []);
});

test('every app, script or document a row names exists in the repository', () => {
  const named = rows.flatMap(row => [...row.steps, row.expected].join(' ').match(/(?:examples|spikes|\.scratch|docs)\/[A-Za-z0-9._/-]+/g) ?? [])
    .map(path => path.replace(/[.]+$/, ''));
  assert.ok(named.length > 0);
  assert.deepEqual([...new Set(named)].filter(path => !existsSync(path)), []);
});

test('observed single-tap and preparation stay on the iOS simulator', () => {
  const observed = rows.filter(row => row.group === 'observed');
  assert.equal(observed.length, 1);
  assert.deepEqual(observed[0]!.devices, ['ios-simulator']);
  assert.equal(observed[0]!.source, `${ACCEPTANCE}:64-65`);
});

test('iOS rows carry no Android-only requirement and Android rows no iOS-only one', () => {
  const androidOnly = /coordinate scaling|screen sizes|rotated|\bANR\b|APP_NOT_RESPONDING|logcat|UiAutomator2|intentExtras|APP_NOT_IN_FOREGROUND|capture --jev/;
  const iosOnly = /launchArgs|\bWDA\b|Simulator\.app|simctl/;
  const text = (row: typeof rows[number]) => [row.title, ...row.steps, row.expected].join(' ');
  assert.deepEqual(rows.filter(row => row.devices.every(device => device === 'ios-simulator') && androidOnly.test(text(row))).map(row => row.id), []);
  assert.deepEqual(rows.filter(row => !row.devices.includes('ios-simulator') && iosOnly.test(text(row))).map(row => row.id), []);
});

test('repeated cleanup rows run the cycles harness and every other row is operator-driven', () => {
  const cleanup = lineOf('Repeated cleanup');
  const cycles = rows.filter(row => row.source === cleanup);
  assert.equal(cycles.length, DEVICE_SCOPES.length);
  assert.ok(cycles.every(row => row.executor === 'cycles'), 'every repeated cleanup row is a cycles row');
  assert.deepEqual(rows.filter(row => row.source !== cleanup && row.executor !== 'operator').map(row => row.id), []);
});

test('the five unfinished v1.4.0 simulator cases are mapped as their own iOS-simulator rows', () => {
  for (const id of ['L01', 'L02', 'L03', 'L04', 'L05']) {
    const row = rows.find(candidate => candidate.id === id);
    assert.ok(row, `${id} has a row`);
    assert.equal(row.group, 'baseline');
    assert.deepEqual(row.devices, ['ios-simulator']);
  }
});

test('the phone is required exactly by the rows that run on the phone alone', () => {
  const phoneOnly = (row: typeof rows[number]) => row.devices.length === 1 && row.devices[0] === 'android-phone';
  assert.ok(rows.some(phoneOnly), 'some rows run on the phone alone');
  assert.deepEqual(rows.filter(row => row.needs.phone !== phoneOnly(row)).map(row => row.id), []);
});

test('only the iOS capture refusal skips the admission store, since it refuses before any device work', () => {
  assert.deepEqual(rows.filter(row => !row.needs.storeActivation).map(row => [row.source, row.devices]), [[lineOf('Capture'), ['ios-simulator']]]);
});

test('a row that starts a scripted run needs the Jev key, and observed, baseline and capture rows never ask for it', () => {
  const scripted = (row: typeof rows[number]) => /CLI `run`|`start_scenario`/.test(row.steps.join(' '));
  assert.ok(rows.some(scripted));
  assert.deepEqual(rows.filter(row => scripted(row) && !row.needs.jevKey).map(row => row.id), []);
  const keyFree = rows.filter(row => row.group === 'observed' || row.group === 'baseline' || row.source === lineOf('Capture'));
  assert.equal(keyFree.length, 1 + 5 + DEVICE_SCOPES.length);
  assert.deepEqual(keyFree.filter(row => row.needs.jevKey || scripted(row)).map(row => row.id), []);
});

test('carry-over rows cite the Phase 3 handover and point only at rows that exist', () => {
  const carried = rows.filter(row => row.group === 'carry-over');
  assert.ok(carried.length > 0);
  assert.deepEqual(carried.filter(row => !row.source.startsWith('~/.codex/reports/jev-ios-bridge/phase3-build/')).map(row => row.id), []);
  const known = new Set(rows.map(row => row.id));
  const pointed = carried.flatMap(row => row.steps.join(' ').match(/\bB\d+-[a-z0-9-]+[a-z0-9]/g) ?? []);
  assert.ok(pointed.length > 0, 'duplicated claims point at their covering rows');
  assert.deepEqual(pointed.filter(id => !known.has(id)), []);
});

test('repository sources exist and reach their cited lines', () => {
  for (const source of allSources().filter(source => !source.object && !source.path.startsWith('~/'))) {
    assert.ok(existsSync(source.path), `${source.raw} names a file in the repository`);
    assertReaches(readFileSync(source.path, 'utf8'), source);
  }
});

test('history sources reach their cited lines when their commits are present', t => {
  const historical = allSources().filter(source => source.object);
  const missing = [...new Set(historical.map(source => source.object!))].filter(object => !hasCommit(object));
  if (missing.length) { t.skip(`commits ${missing.join(', ')} are absent (shallow checkout)`); return; }
  for (const source of historical) assertReaches(gitShow(`${source.object}:${source.path}`), source);
  for (const row of rows.filter(candidate => candidate.group === 'baseline')) {
    const source = parseSource(row.source);
    assert.ok(gitShow(`${source.object}:${source.path}`).split('\n')[source.start - 1]?.startsWith(`| ${row.id} |`), `${row.id} cites its own table row`);
  }
});

test('handed-over Phase 3 sources reach their cited lines when the reports are present', t => {
  const handed = allSources().filter(source => source.path.startsWith('~/'));
  assert.ok(handed.length > 0, 'carry-over rows cite the Phase 3 handover');
  const resolve = (source: Source) => join(homedir(), source.path.slice(2));
  const missing = [...new Set(handed.map(resolve))].filter(path => !existsSync(path));
  if (missing.length) { t.skip(`Phase 3 reports are absent on this host: ${missing.length} file(s)`); return; }
  for (const source of handed) {
    const text = readFileSync(resolve(source), 'utf8');
    assertReaches(text, source);
    assert.match(text.split('\n').slice(source.start - 1, source.end).join(' '), /Phase 4/, `${source.raw} hands a claim to Phase 4`);
  }
});

test('the committed live-matrix.json is the rendered matrix', () => {
  assert.equal(readFileSync(MATRIX_JSON, 'utf8'), renderMatrix(LIVE_MATRIX));
});

test('the evidence index is byte-stable and lists every requirement once, untested', () => {
  const index = renderIndex(LIVE_MATRIX, screens);
  assert.equal(renderIndex(LIVE_MATRIX, screens), index, 'two renders are identical');
  const sections = tables(index);
  assert.deepEqual(ids(sections.get('Live matrix')), rows.map(row => row.id));
  assert.equal(ids(sections.get('Corpus screens')).length, 3);
  for (const screen of [...screens.iosScreens, ...screens.androidScreens]) {
    assert.equal(ids(sections.get('Corpus screens')).filter(id => id?.endsWith(screen)).length, 1, `${screen} has one row`);
  }
  assert.deepEqual(ids(sections.get('Preserved public modes')), PUBLIC_MODES.map(mode => mode.id));
  assert.deepEqual(ids(sections.get('Cutover and packaging')), CUTOVER_STEPS.map(step => step.id));
  const all = [...sections.values()].flat();
  assert.ok(all.every(cells => cells.length === 7), 'every row has the seven columns');
  assert.deepEqual(all.filter(cells => cells[6] !== 'untested').map(cells => cells[0]), []);
});

test('a pipe inside a cell is escaped and stays inside its cell', () => {
  const [first, ...rest] = LIVE_MATRIX.rows;
  const piped: LiveMatrix = { ...LIVE_MATRIX, rows: [{ ...first!, expected: 'left | right' }, ...rest] };
  const row = tables(renderIndex(piped, screens)).get('Live matrix')![0]!;
  assert.equal(row.length, 7);
  assert.ok(row[1]!.includes('left \\| right'));
});

test('every MCP tool and CLI command is a preserved public mode', () => {
  const golden = (path: string) => (JSON.parse(readFileSync(path, 'utf8')) as { tools: { name: string }[] }).tools.map(tool => tool.name);
  const cli = [...readFileSync('src/cli.ts', 'utf8').matchAll(/^ {2}jev-ios-bridge ([a-z][a-z-]*)/gm)].map(match => match[1]!);
  const names = [...golden('tests/golden/mcp.json'), ...golden('tests/golden/observed-mcp-v1.json'), 'resolve_step', ...cli, 'capture --jev'];
  assert.ok(cli.length >= 12 && names.length >= 23);
  const modes = tables(renderIndex(LIVE_MATRIX, screens)).get('Preserved public modes')!.map(cells => cells.join(' '));
  assert.deepEqual(names.filter(name => !modes.some(cells => cells.includes(`\`${name}\``))), []);
});

test('the check reports exactly the outputs that are missing or stale', () => {
  const root = mkdtempSync(join(tmpdir(), 'phase4-matrix-'));
  try {
    const files = outputs(screens);
    assert.deepEqual(files.map(file => file.path).sort(), [INDEX_MD, MATRIX_JSON].sort());
    assert.deepEqual(drifted(root, files).sort(), [INDEX_MD, MATRIX_JSON].sort(), 'missing files are drifted');
    for (const file of files) { mkdirSync(dirname(join(root, file.path)), { recursive: true }); writeFileSync(join(root, file.path), file.text); }
    assert.deepEqual(drifted(root, files), []);
    writeFileSync(join(root, INDEX_MD), `${files.find(file => file.path === INDEX_MD)!.text}stale\n`);
    assert.deepEqual(drifted(root, files), [INDEX_MD]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('with the corpus commits present, the index covers 24 iOS and 10 Android screens and the generator check passes', t => {
  const missing = CORPUS_COMMITS.filter(sha => !hasCommit(sha));
  if (missing.length) { t.skip(`corpus commits ${missing.join(', ')} are absent (shallow checkout)`); return; }
  const corpus = readCorpus(gitShow);
  assert.equal(new Set(corpus.iosScreens).size, 24);
  assert.equal(new Set(corpus.androidScreens).size, 10);
  assert.ok(corpus.iosScreens.includes('s24-diagnostic-bread-first-total2') && corpus.androidScreens.includes('cmp-4-fullscreen-modal'));
  const committed = readFileSync(INDEX_MD, 'utf8');
  assert.equal(committed, renderIndex(LIVE_MATRIX, corpus), 'the committed index is current');
  assert.equal(ids(tables(committed).get('Corpus screens')).length, 34);
  const check = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/phase4/live/generate.ts', '--check'], { encoding: 'utf8', timeout: 60_000 });
  assert.equal(check.status, 0, check.stderr);
});
