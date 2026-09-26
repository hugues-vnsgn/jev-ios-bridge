#!/usr/bin/env node
/**
 * Phase 3 observation-shape experiment, run exactly as PREREGISTRATION.md (committed first) says.
 * Usage: node --env-file=/abs/.env --import tsx spikes/observation-shape/experiment.ts [--dry-run]
 */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Assertion, Element, Snapshot } from '../../src/contracts/index.js';
import { createAssertionJudge, SCRIPTED_JEV_MODEL } from '../../src/scripted/jev.js';
import { MAX_STATE_BYTES, renderAssertionState } from '../../src/scripted/observe.js';

type Variant = 'V0' | 'A' | 'B' | 'AB';
interface Claim extends Assertion { expected: boolean }
interface Request { group: 'corpus' | 'reminders' | 'control'; caseId: string; variant: Variant; repeat?: number; state: string; claims: Claim[] }

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const root = (path: string) => here(`../../${path}`);

// ---------- renderer variants (V0 must equal production byte for byte) ----------

function isScrollBar(element: Element): boolean {
  return element.role === 'slider' && /^(?:vertical|horizontal) scroll bar,?\s*\d+ pages?$/i.test(element.label?.trim() ?? '');
}

function isVisibleEvidence(element: Element, keepScrollBars: boolean): boolean {
  if (element.state?.visible === false || (element.frame && (element.frame.width <= 0 || element.frame.height <= 0))) return false;
  if (/status.?bar/i.test(`${element.role} ${element.identifier ?? ''}`) || (!keepScrollBars && isScrollBar(element))) return false;
  return Boolean(element.label?.trim() || element.value?.trim() || element.identifier?.trim() ||
    element.actions.length > 0 || /^(text|statictext|title|heading|alert)$/i.test(element.role));
}

function render(snapshot: Snapshot, variant: Variant): string {
  const explicitEmpty = variant === 'A' || variant === 'AB';
  const keepScrollBars = variant === 'B' || variant === 'AB';
  const elements = snapshot.elements.filter(element => isVisibleEvidence(element, keepScrollBars));
  const lines = ['Current iOS screen (full accessibility capture):', ...elements.map(element => JSON.stringify({
    role: element.role,
    ...(element.label !== undefined ? { label: element.label } : {}),
    ...(element.value !== undefined ? { value: element.value }
      : explicitEmpty && element.role === 'text-field' ? { value: '' } : {}),
    ...(element.identifier !== undefined ? { identifier: element.identifier } : {}),
    ...(element.frame ? { frame: element.frame } : {}),
    ...(element.state ? { state: element.state } : {}),
  }))];
  const state = lines.join('\n');
  if (Buffer.byteLength(state, 'utf8') > MAX_STATE_BYTES) throw new Error(`STATE_BUDGET ${variant}`);
  return state;
}

// ---------- cases ----------

interface CorpusCase { id: string; snapshot: Snapshot; claims: Claim[] }

async function buildRequests(): Promise<Request[]> {
  const corpus = JSON.parse(await readFile(root('spikes/scripted/corpus/corpus.json'), 'utf8')) as { cases: CorpusCase[] };
  assert.equal(corpus.cases.length, 24);
  const requests: Request[] = [];
  for (const item of corpus.cases) {
    assert.equal(render(item.snapshot, 'V0'), renderAssertionState(item.snapshot), `V0 must equal production for ${item.id}`);
    for (const variant of ['V0', 'A', 'B', 'AB'] as const) {
      requests.push({ group: 'corpus', caseId: item.id, variant, state: render(item.snapshot, variant),
        claims: item.claims.map(({ id, claim, expected }) => ({ id, claim, expected })) });
    }
  }

  // Reminders verifyFinalList, event 35, rebuilt unredacted from the script values and the event-35 screenshot.
  const journal = (await readFile(root('spikes/benchmarks/results/reminders-bridge-attempt1/journal.jsonl'), 'utf8'))
    .trim().split('\n').map(line => JSON.parse(line) as { sequence: number; data: Record<string, unknown> });
  const logged = String(journal.find(event => event.sequence === 35)!.data.assertionObservation);
  const rowNames = ['File report benchmark', 'Buy milk benchmark', 'Call team benchmark'];
  let row = 0, field = 0;
  const unredacted = logged.split('\n').map(line => {
    if (!line.includes('[REDACTED]')) return line;
    const element = JSON.parse(line) as Record<string, unknown>;
    if (element.identifier === '[REDACTED]') element.identifier = 'MCP Benchmark List';
    if (element.label === '[REDACTED]') element.label = 'MCP Benchmark List';
    if (typeof element.label === 'string' && /^\[REDACTED\], (Incomplete|Completed)$/.test(element.label)) {
      element.label = element.label.replace('[REDACTED]', rowNames[row++]!);
    }
    if (element.role === 'text-field' && element.value === '[REDACTED]') element.value = rowNames[field++]!;
    const rendered = JSON.stringify(element);
    assert.ok(!rendered.includes('[REDACTED]'), `unhandled redaction: ${rendered}`);
    return rendered;
  });
  assert.equal(row, 3); assert.equal(field, 3);
  assert.match(unredacted[unredacted.findIndex(line => line.includes('Incomplete'))]!, /File report benchmark, Incomplete/);
  const reminderClaims: Claim[] = [
    { id: 'counts', claim: 'The saved list has exactly two completed reminders and one incomplete reminder, with no additional reminders.', expected: true },
    { id: 'header', claim: 'The list header reads 2 Completed.', expected: true },
    { id: 'oneIncomplete', claim: 'Exactly one reminder row is marked Incomplete.', expected: true },
    { id: 'noOthers', claim: 'The list contains no reminders other than the three named ones.', expected: true },
    { id: 'threeRows', claim: 'The list shows exactly three reminder rows.', expected: true },
  ];
  const v0 = unredacted.join('\n');
  for (let repeat = 1; repeat <= 3; repeat++) requests.push({ group: 'reminders', caseId: 'reminders-e35', variant: 'V0', repeat, state: v0, claims: reminderClaims });
  const sliders = ['Vertical scroll bar, 1 page 0%', 'Horizontal scroll bar, 1 page 0%', 'Vertical scroll bar, 1 page 0%', 'Horizontal scroll bar, 1 page 0%']
    .map(label => JSON.stringify({ role: 'slider', label }));
  const newReminder = unredacted.findIndex(line => line.includes('"label":"New Reminder"'));
  assert.ok(newReminder > 0);
  const withSliders = [...unredacted.slice(0, newReminder), ...sliders, ...unredacted.slice(newReminder)].join('\n');
  requests.push({ group: 'reminders', caseId: 'reminders-e35', variant: 'B', state: withSliders, claims: reminderClaims });

  // Negative controls: a populated field with its value withheld, claimed empty (truly false).
  const withheld = (id: string, match: (element: Element) => boolean) => {
    const item = corpus.cases.find(candidate => candidate.id.startsWith(id))!;
    const elements = item.snapshot.elements.map(element => {
      if (!match(element)) return element;
      const { value: _value, ...rest } = element;
      return rest;
    });
    assert.equal(elements.filter(element => element.role === 'text-field' && element.value === undefined && match({ ...element, value: 'x' })).length, 1);
    return { ...item.snapshot, elements };
  };
  const nc1 = withheld('s20', element => element.role === 'text-field' && element.label === 'Notes');
  const nc2 = withheld('s01', element => element.role === 'text-field' && element.identifier === 'weather.locationsSheet');
  for (const variant of ['V0', 'A'] as const) {
    requests.push({ group: 'control', caseId: 'NC1-s20-notes-withheld', variant, state: render(nc1, variant),
      claims: [{ id: 'empty', claim: 'The Charge lantern Notes field is empty.', expected: false }] });
    requests.push({ group: 'control', caseId: 'NC2-s01-search-withheld', variant, state: render(nc2, variant),
      claims: [{ id: 'empty', claim: 'The location search field is empty.', expected: false }] });
  }
  return requests;
}

// ---------- run ----------

interface Result extends Omit<Request, 'state'> { stateBytes: number; probabilities: Record<string, number>; inputTokens: number; latencyMs: number; model: string }

const wrong = (claim: Claim, p: number) => claim.expected ? p <= 0.1 : p >= 0.9;
const uncertain = (p: number) => p > 0.1 && p < 0.9;

async function main(): Promise<void> {
  const requests = await buildRequests();
  assert.equal(requests.length, 104);
  if (process.argv.includes('--dry-run')) {
    console.log(`Dry run: ${requests.length} requests, ${requests.reduce((sum, r) => sum + Buffer.byteLength(r.state), 0)} state bytes.`);
    return;
  }
  const judge = createAssertionJudge();
  const results: Result[] = [];
  for (const [index, request] of requests.entries()) {
    const judgment = await judge.judge(request.claims.map(({ id, claim }) => ({ id, claim })), request.state, AbortSignal.timeout(60_000));
    assert.equal(judgment.model, SCRIPTED_JEV_MODEL);
    const { state, ...rest } = request;
    results.push({ ...rest, stateBytes: Buffer.byteLength(state), probabilities: judgment.probabilities,
      inputTokens: judgment.inputTokens, latencyMs: Math.round(judgment.latencyMs), model: judgment.model });
    process.stderr.write(`\r${index + 1}/${requests.length}`);
  }
  process.stderr.write('\n');

  const corpusStats = (variant: Variant) => {
    const rows = results.filter(r => r.group === 'corpus' && r.variant === variant);
    let wrongCount = 0, uncertainCount = 0;
    const uncertainClaims: string[] = [];
    for (const row of rows) for (const claim of row.claims) {
      const p = row.probabilities[claim.id]!;
      if (wrong(claim, p)) wrongCount++;
      if (uncertain(p)) { uncertainCount++; uncertainClaims.push(`${row.caseId}:${claim.id}=${p}`); }
    }
    return { wrongCount, uncertainCount, uncertainClaims };
  };
  const stats = Object.fromEntries((['V0', 'A', 'B', 'AB'] as const).map(v => [v, corpusStats(v)])) as Record<Variant, ReturnType<typeof corpusStats>>;
  const reminders = results.filter(r => r.group === 'reminders');
  const rb = reminders.find(r => r.variant === 'B')!;
  const remindersResolvedByB = ['noOthers', 'counts'].every(id => rb.probabilities[id]! >= 0.9);
  const controls = results.filter(r => r.group === 'control');
  const controlHarm = controls.filter(r => r.variant === 'A').some(r => r.probabilities.empty! >= 0.9);
  const decisions = (['A', 'B', 'AB'] as const).map(candidate => {
    const s = stats[candidate];
    const gate = s.wrongCount === 0 && s.uncertainCount <= 3;
    const improves = s.uncertainCount < stats.V0.uncertainCount || (candidate !== 'A' && remindersResolvedByB);
    const controlsOk = candidate === 'B' || !controlHarm;
    return { candidate, gate, improves, controlsOk, passes: gate && improves && controlsOk, uncertain: s.uncertainCount };
  });
  const passing = decisions.filter(d => d.passes).sort((l, r) => l.uncertain - r.uncertain || l.candidate.length - r.candidate.length);
  const adopted = passing[0]?.candidate ?? 'V0';
  const inputTokens = results.reduce((sum, r) => sum + r.inputTokens, 0);
  await writeFile(here('results.json'), JSON.stringify({ ranAt: new Date().toISOString(), model: SCRIPTED_JEV_MODEL,
    requests: results.length, inputTokens, stats, remindersResolvedByB, controlHarm, decisions, adopted, results }, null, 2) + '\n');

  const table = (variant: Variant) => `| ${variant} | ${stats[variant].wrongCount} | ${stats[variant].uncertainCount} | ${stats[variant].uncertainClaims.join(', ') || '—'} |`;
  const md = [
    '# Observation-shape experiment: results', '',
    `Run ${new Date().toISOString().slice(0, 10)} per [PREREGISTRATION.md](PREREGISTRATION.md); ${results.length} requests to \`${SCRIPTED_JEV_MODEL}\`, ${inputTokens} input tokens.`, '',
    `**Decision: ${adopted === 'V0' ? 'keep today\'s shape (V0, `visible-full-text-v1`)' : `adopt ${adopted} as \`visible-full-text-v2\``}.**`, '',
    '## Corpus (48 claims per variant)', '',
    '| Variant | Confidently wrong | Uncertain | Uncertain claims |', '| --- | ---: | ---: | --- |',
    table('V0'), table('A'), table('B'), table('AB'), '',
    '## Reminders `verifyFinalList` (event 35, unredacted)', '',
    '| Variant | Repeat | counts | header | oneIncomplete | noOthers | threeRows |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...reminders.map(r => `| ${r.variant} | ${r.repeat ?? '—'} | ${['counts', 'header', 'oneIncomplete', 'noOthers', 'threeRows'].map(id => r.probabilities[id]!.toFixed(3)).join(' | ')} |`), '',
    '## Negative controls (populated field withheld, claimed empty; truly false)', '',
    '| Control | Variant | P(empty) |', '| --- | --- | ---: |',
    ...controls.map(r => `| ${r.caseId} | ${r.variant} | ${r.probabilities.empty!.toFixed(3)} |`), '',
    '## Decision rule applied', '',
    '| Candidate | Corpus gate (0 wrong, ≤3 uncertain) | Improves on V0 | Controls safe | Passes |', '| --- | --- | --- | --- | --- |',
    ...decisions.map(d => `| ${d.candidate} | ${d.gate ? 'yes' : 'no'} | ${d.improves ? 'yes' : 'no'} | ${d.controlsOk ? 'yes' : 'no'} | ${d.passes ? '**yes**' : 'no'} |`), '',
  ].join('\n');
  await writeFile(here('results.md'), md);
  console.log(md);
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'experiment failed'); process.exitCode = 1; });
