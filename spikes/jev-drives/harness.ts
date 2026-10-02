// Offline spike harness for jev-drives ticket 03. Rules: spikes/jev-drives/protocol.md.
//
//   npx tsx spikes/jev-drives/harness.ts check    build every request, check budgets and hashes; no network
//   npx tsx spikes/jev-drives/harness.ts freeze   record SHA-256 hashes of every frozen input in freeze.json
//   npx tsx spikes/jev-drives/harness.ts smoke    one request on made-up data (not a case) to prove the request shape
//   npx tsx spikes/jev-drives/harness.ts run      the one run: refuses if any hash differs or results already exist
//
// The key is read from TYPESAFE_API_KEY, else from the repo's .env by explicit path (AGENTS.md). It is never printed.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TypeSafeClient, choice, noul, type Questions, type SystemOneRequest } from '@typesafe-ai/sdk';
import { buildCandidates, loadCapture, type Candidate } from './candidates.js';

export const MODEL = 'jev-1.13.0';
export const THRESHOLDS = { none: 0.8, test_write: 0.9 } as const;
export const DONE_YES = 0.9;
export const DONE_NO = 0.1;
export const NEXT_ACTION_QUESTION = 'Which one action performs the current step on this screen? Choose step_done if the current step is already done on this screen. Choose none_fits if no listed action performs it, or if the screen is not what the step expects.';
export const STEP_DONE_QUESTION = 'Does the visible evidence on this current screen show that the current step is done?';
const STATE_QUESTION_MAX_BYTES = 28_000;
const REQUEST_MAX_BYTES = 56_000;

const here = dirname(fileURLToPath(import.meta.url));
export const root = join(here, '..', '..');
const casesPath = join(here, 'cases.json');
const freezePath = join(here, 'freeze.json');
const resultsDir = join(here, 'results');

export type Effect = 'none' | 'test_write' | 'destructive';
export interface SpikeCase {
  id: string; app: string; platform: 'ios' | 'android'; capture: string; goal: string; step: string; doneWhen: string;
  values: Record<string, string>; effect: Effect; history: string[]; expectedAction: string; alsoRight: string[];
  expectedDone: boolean; traps: string[]; rationale: string;
}

export function loadCases(): SpikeCase[] {
  return (JSON.parse(readFileSync(casesPath, 'utf8')) as { cases: SpikeCase[] }).cases;
}

export function screenText(c: SpikeCase): string {
  const dir = join(root, c.capture);
  return readFileSync(join(dir, c.platform === 'ios' ? 'jev-screen.txt' : 'capture-jev.txt'), 'utf8');
}

/** Only what Jev may see: never the effect, the expected answers, the traps or the rationale. */
export function buildRequest(c: Pick<SpikeCase, 'goal' | 'step' | 'doneWhen' | 'values' | 'history'>,
  screen: string, candidates: Candidate[]): SystemOneRequest<Questions> {
  const criteria: Record<string, string> = {};
  for (const option of candidates) {
    if (Object.hasOwn(criteria, option.key)) throw new Error('DUPLICATE_OPTION');
    criteria[option.key] = option.description;
  }
  if (candidates.length > 255 || !Object.hasOwn(criteria, 'none_fits') || !Object.hasOwn(criteria, 'step_done')) {
    throw new Error('INVALID_OPTIONS');
  }
  const state = {
    goal: c.goal,
    current_step: c.step,
    done_when: c.doneWhen,
    plan_values: c.values,
    recent_actions: c.history.slice(-2),
    screen,
  };
  const questions: Questions = {
    next_action: choice({ question: NEXT_ACTION_QUESTION, current_step: c.step, done_when: c.doneWhen }, criteria),
    step_done: noul({ question: STEP_DONE_QUESTION, done_when: c.doneWhen }),
  };
  const request: SystemOneRequest<Questions> = { model: MODEL, state, questions };
  const bytes = (v: unknown) => Buffer.byteLength(JSON.stringify(v), 'utf8');
  const longest = Math.max(...Object.values(questions).map(bytes));
  if (bytes(state) + longest > STATE_QUESTION_MAX_BYTES || bytes(request) > REQUEST_MAX_BYTES) throw new Error('REQUEST_BUDGET');
  return request;
}

export interface Answer { choice: string; confidence: number; probabilities: Record<string, number>; done: number;
  inputTokens: number; latencyMs: number }

const isProb = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseAnswer(raw: unknown, candidates: Candidate[], latencyMs: number): Answer {
  if (!isRec(raw) || !isRec(raw.answers) || !isRec(raw.usage)) throw new Error('MALFORMED_RESPONSE');
  const a = raw.answers.next_action; const d = raw.answers.step_done;
  if (!isRec(a) || a.type !== 'choice' || typeof a.choice !== 'string' || !isProb(a.confidence) || !isRec(a.probabilities)) throw new Error('MALFORMED_RESPONSE');
  if (!candidates.some(o => o.key === a.choice)) throw new Error('MALFORMED_RESPONSE');
  if (!isRec(d) || d.type !== 'noul' || !isProb(d.noul)) throw new Error('MALFORMED_RESPONSE');
  const probabilities: Record<string, number> = {};
  for (const [k, v] of Object.entries(a.probabilities)) if (isProb(v)) probabilities[k] = v;
  const inputTokens = Number.isSafeInteger(raw.usage.input_tokens) ? raw.usage.input_tokens as number : -1;
  return { choice: a.choice, confidence: a.confidence, probabilities, done: d.noul, inputTokens, latencyMs };
}

export type Kind = 'action' | 'already_done' | 'hand_back';
export function kindOf(c: SpikeCase): Kind {
  if (c.expectedAction === 'step_done') return 'already_done';
  if (c.expectedAction === 'none_fits' || c.effect === 'destructive') return 'hand_back';
  return 'action';
}

export interface Score { right: boolean; accepted: boolean; wrongAccepted: boolean; handled: boolean; doneVerdict: 'yes' | 'no' | 'uncertain'; doneRight: boolean }

/** Protocol "How each answer is scored". A failed request scores as not right, not accepted, not handled. */
export function score(c: SpikeCase, a: Answer | undefined): Score {
  if (!a) return { right: false, accepted: false, wrongAccepted: false, handled: false, doneVerdict: 'uncertain', doneRight: false };
  const rightSet = new Set([c.expectedAction, ...c.alsoRight]);
  const right = rightSet.has(a.choice);
  const doneVerdict = a.done >= DONE_YES ? 'yes' : a.done <= DONE_NO ? 'no' : 'uncertain';
  let accepted = false;
  if (a.choice !== 'none_fits' && c.effect !== 'destructive') {
    const floor = THRESHOLDS[c.effect];
    accepted = a.confidence >= floor && (a.choice !== 'step_done' || doneVerdict === 'yes');
  }
  const wrongAccepted = accepted && (!right || kindOf(c) === 'hand_back');
  const handled = kindOf(c) !== 'hand_back' && accepted && right;
  const doneRight = doneVerdict === (c.expectedDone ? 'yes' : 'no');
  return { right, accepted, wrongAccepted, handled, doneVerdict, doneRight };
}

// ---- freezing ----

function frozenFiles(cases: SpikeCase[]): string[] {
  const files = new Set<string>([casesPath, join(here, 'candidates.ts'), join(here, 'harness.ts'), join(here, 'protocol.md')]);
  for (const c of cases) {
    const dir = join(root, c.capture);
    for (const f of readdirSync(dir)) if (!f.endsWith('.md')) files.add(join(dir, f));
  }
  return [...files].sort();
}
const sha = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');
function hashes(cases: SpikeCase[]): Record<string, string> {
  return Object.fromEntries(frozenFiles(cases).map(f => [relative(root, f), sha(f)]));
}
function verifyFreeze(cases: SpikeCase[]): void {
  if (!existsSync(freezePath)) throw new Error('NOT_FROZEN: run `freeze` first');
  const want = (JSON.parse(readFileSync(freezePath, 'utf8')) as { hashes: Record<string, string> }).hashes;
  const have = hashes(cases);
  const changed = [...new Set([...Object.keys(want), ...Object.keys(have)])].filter(k => want[k] !== have[k]);
  if (changed.length) throw new Error(`FROZEN_INPUT_CHANGED: ${changed.join(', ')}`);
}

// ---- key and client ----

function loadKey(): void {
  if (process.env.TYPESAFE_API_KEY?.trim()) return;
  const envFile = join(root, '.env');
  if (!existsSync(envFile)) throw new Error('NO_KEY');
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*(?:export\s+)?TYPESAFE_API_KEY\s*=\s*['"]?([^'"\s]+)['"]?\s*$/.exec(line);
    if (m) { process.env.TYPESAFE_API_KEY = m[1]; return; }
  }
  throw new Error('NO_KEY');
}
function client(): TypeSafeClient {
  loadKey();
  return new TypeSafeClient({ defaultModel: MODEL, logLevel: 'warn', retry: { maxRetries: 0 }, timeout: 30_000 });
}

// ---- commands ----

function prepare(c: SpikeCase) {
  const candidates = buildCandidates(loadCapture(join(root, c.capture), c.platform), { values: c.values }).candidates;
  return { candidates, request: buildRequest(c, screenText(c), candidates) };
}

async function main(cmd: string | undefined): Promise<void> {
  const cases = loadCases();
  if (cmd === 'check') {
    for (const c of cases) {
      const { candidates, request } = prepare(c);
      for (const k of [c.expectedAction, ...c.alsoRight]) if (!candidates.some(o => o.key === k)) throw new Error(`${c.id}: label ${k} not a candidate`);
      console.log(`${c.id.padEnd(7)} ${String(candidates.length).padStart(3)} options ${String(Buffer.byteLength(JSON.stringify(request))).padStart(6)} bytes`);
    }
    if (existsSync(freezePath)) { verifyFreeze(cases); console.log('freeze: all hashes match'); }
    return;
  }
  if (cmd === 'freeze') {
    for (const c of cases) prepare(c);
    writeFileSync(freezePath, JSON.stringify({ frozenAt: new Date().toISOString(), hashes: hashes(cases) }, null, 2) + '\n');
    console.log(`froze ${Object.keys(hashes(cases)).length} files`);
    return;
  }
  if (cmd === 'smoke') {
    const candidates: Candidate[] = [
      { key: 'tap:e1', description: 'Tap the button "Settings"' }, { key: 'tap:e2', description: 'Tap the button "Profile"' },
      { key: 'scroll:down', description: 'Scroll down' }, { key: 'step_done', description: 'The step is already done' },
      { key: 'none_fits', description: 'None of these performs the step' },
    ];
    const request = buildRequest({ goal: 'Open the profile.', step: 'Open the Profile screen.', doneWhen: 'The title reads Profile.', values: {}, history: [] },
      'Current screen: {"role":"button","label":"Settings"} {"role":"button","label":"Profile"}', candidates);
    const start = performance.now();
    const a = parseAnswer(await client().systemOne(request), candidates, performance.now() - start);
    console.log(`smoke ok: choice ${a.choice} confidence ${a.confidence.toFixed(2)} done ${a.done.toFixed(2)} ${Math.round(a.latencyMs)} ms`);
    return;
  }
  if (cmd === 'run') {
    verifyFreeze(cases);
    if (existsSync(resultsDir) && readdirSync(resultsDir).length) throw new Error('RESULTS_EXIST: the spike runs once');
    mkdirSync(resultsDir, { recursive: true });
    const jev = client();
    const rows: { c: SpikeCase; a?: Answer | undefined; error?: string | undefined }[] = [];
    for (const c of cases) {
      let a: Answer | undefined; let error: string | undefined;
      try {
        const { candidates, request } = prepare(c);
        const start = performance.now();
        a = parseAnswer(await jev.systemOne(request), candidates, performance.now() - start);
      } catch (e) { error = e instanceof Error ? e.message.slice(0, 80) : 'UNKNOWN'; }
      rows.push({ c, a, error });
      writeFileSync(join(resultsDir, `${c.id}.json`), JSON.stringify({ id: c.id, answer: a, error, score: score(c, a) }, null, 2) + '\n');
      console.log(`${c.id} ${a ? `${a.choice} ${a.confidence.toFixed(2)} done ${a.done.toFixed(2)}` : `ERROR ${error}`}`);
    }
    writeFileSync(join(resultsDir, 'results.md'), report(rows));
    console.log(`wrote ${relative(root, join(resultsDir, 'results.md'))}`);
    return;
  }
  throw new Error('usage: harness.ts check | freeze | smoke | run');
}

export function report(rows: { c: SpikeCase; a?: Answer | undefined; error?: string | undefined }[]): string {
  const scored = rows.map(r => ({ ...r, s: score(r.c, r.a), k: kindOf(r.c) }));
  const pct = (n: number, d: number) => d ? `${n}/${d} (${Math.round(100 * n / d)}%)` : '0/0';
  const groups = new Map<string, typeof scored>();
  for (const r of scored) {
    for (const g of [`${r.c.app} (${r.c.platform})`, r.c.platform === 'ios' ? 'All iOS' : 'All Android', 'All']) {
      groups.set(g, [...(groups.get(g) ?? []), r]);
    }
  }
  const wrong = scored.filter(r => r.s.wrongAccepted).length;
  const perApp = [...groups].filter(([g]) => !g.startsWith('All'));
  const appsPass = perApp.every(([, rs]) => { const e = rs.filter(r => r.k !== 'hand_back'); return e.filter(r => r.s.handled).length >= Math.ceil(0.7 * e.length - 1e-9); });
  const lines = [
    '# Offline spike results (ticket 03)', '',
    `Model ${MODEL}. ${rows.length} cases, one run, thresholds ${THRESHOLDS.none} (none) / ${THRESHOLDS.test_write} (test_write), done ${DONE_YES}/${DONE_NO}.`, '',
    `**Go / no-go: ${wrong === 0 && appsPass ? 'GO' : 'NO-GO'}** — wrong accepted picks: ${wrong} (must be 0); every app at ≥ 70% Jev-handled: ${appsPass ? 'yes' : 'no'}.`, '',
    '| Group | Cases | Right picks | Accepted | Wrong accepted | Jev-handled (eligible) | Hand-backs correct | Done right |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...[...groups].map(([g, rs]) => {
      const elig = rs.filter(r => r.k !== 'hand_back'); const hb = rs.filter(r => r.k === 'hand_back');
      return `| ${g} | ${rs.length} | ${pct(rs.filter(r => r.s.right).length, rs.length)} | ${rs.filter(r => r.s.accepted).length} | ${rs.filter(r => r.s.wrongAccepted).length} | ${pct(elig.filter(r => r.s.handled).length, elig.length)} | ${pct(hb.filter(r => !r.s.accepted).length, hb.length)} | ${pct(rs.filter(r => r.s.doneRight).length, rs.length)} |`;
    }),
    '', '## Every case', '',
    '| Case | Kind | Effect | Expected | Jev chose | Confidence | Done Noul | Right | Accepted | Handled | Note |',
    '| --- | --- | --- | --- | --- | ---: | ---: | --- | --- | --- | --- |',
    ...scored.map(r => `| ${r.c.id} | ${r.k} | ${r.c.effect} | \`${r.c.expectedAction}\` | ${r.a ? `\`${r.a.choice}\`` : '—'} | ${r.a ? r.a.confidence.toFixed(2) : '—'} | ${r.a ? r.a.done.toFixed(2) : '—'} | ${r.s.right ? 'yes' : 'no'} | ${r.s.accepted ? 'yes' : 'no'}${r.s.wrongAccepted ? ' **WRONG**' : ''} | ${r.s.handled ? 'yes' : 'no'} | ${r.error ?? r.c.traps.join(', ')} |`),
    '', `Input tokens: ${scored.reduce((n, r) => n + Math.max(0, r.a?.inputTokens ?? 0), 0)}. Median latency: ${median(scored.flatMap(r => r.a ? [r.a.latencyMs] : []))} ms.`, '',
  ];
  return lines.join('\n');
}
const median = (xs: number[]) => xs.length ? Math.round([...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!) : 0;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv[2]).catch((e: unknown) => { console.error(e instanceof Error ? e.message : 'failed'); process.exit(1); });
}
