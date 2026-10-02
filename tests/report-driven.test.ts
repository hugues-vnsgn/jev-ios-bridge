/**
 * Reports for driven runs (Issue 10): report.json's `driven` block and the text report's driven section, built from
 * recorded events. A run whose script has no `do` step gets neither (the v1 goldens in tests/golden/report-json*.json
 * pin that). Synthetic events only: no device, no TypeSafe call.
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { DeviceDriver, Element, RunEvent, Snapshot } from '../src/contracts/index.js';
import { buildScriptedReport, renderScriptedReport } from '../src/scripted/report.js';
import { buildReportJson, type ReportJson } from '../src/scripted/report-json.js';
import { BridgeService } from '../src/service.js';
import { fakeDrivenJudge } from './fixtures/driven-judge.js';
import { checkGolden } from './fixtures/golden.js';

const T0 = Date.parse('2026-10-01T08:00:00.000Z');

/** A run log from `[type, data, secondsAfterStart]` entries, numbered from 1. */
function events(entries: Array<[RunEvent['type'], Record<string, unknown>, number?]>): RunEvent[] {
  return entries.map(([type, data, seconds], index) => ({ version: 1, runId: 'driven-run', sequence: index + 1,
    at: new Date(T0 + (seconds ?? index) * 1_000).toISOString(), type, data }));
}

const started = (extra: Record<string, unknown> = {}): [RunEvent['type'], Record<string, unknown>, number] => ['started', {
  mode: 'scripted', bundleId: null, platform: 'android', package: 'com.example.app', activity: null, intentExtras: {},
  bridgeVersion: '1.3.0', jevModel: 'jev-1.13.0', projectionRule: 'android-full-text-v1',
  plannedSteps: [{ id: 'signIn', kind: 'do' }, { id: 'save', kind: 'do' }, { id: 'verify', kind: 'checkpoint' }],
  ...extra }, 0];

const where = (step: number, stepId: string) => ({ step, stepId });

/** Sign in with Jev and Claude, then a local-only screen Claude declares done, then a passing checkpoint. */
const passedRun = events([
  started({ start: 'attach' }),
  ['prepared', { prepareDurationMs: 10 }, 1],
  ['step', { ...where(1, 'signIn'), kind: 'do', snapshotSequence: 1, observationSummary: 'button Sign in',
    observeDurationMs: 5, screenshotPath: 'screen-3.jpg' }, 2],
  ['decision', { ...where(1, 'signIn'), decision: 1, options: 9, choice: 'none_fits', confidence: 0.6, done: 0.02,
    inputTokens: 400, latencyMs: 300 }, 3],
  ['search', { ...where(1, 'signIn'), direction: 'down', attempt: 1, changed: false, actPath: 'screen-middle',
    actDurationMs: 50 }, 4],
  ['handback', { ...where(1, 'signIn'), reason: 'NONE_FITS', pauseId: 'p-1' }, 5],
  ['handback_answer', { ...where(1, 'signIn'), pauseId: 'p-1', kind: 'tap' }, 17],
  ['action', { ...where(1, 'signIn'), action: 'tap', resolvedRef: 'b1', target: { role: 'button', label: 'Sign in' }, decidedBy: 'claude', actDurationMs: 40 }, 18],
  ['step', { ...where(1, 'signIn'), kind: 'do', snapshotSequence: 2, observationSummary: 'text-field Email',
    observeDurationMs: 0 }, 18],
  ['decision', { ...where(1, 'signIn'), decision: 2, options: 7, choice: 'type:f1:email', confidence: 0.95, done: 0.05,
    inputTokens: 420, latencyMs: 280 }, 19],
  ['action', { ...where(1, 'signIn'), action: 'type', resolvedRef: 'f1', target: { role: 'text-field', label: 'Email' },
    valueKey: 'email', decidedBy: 'jev', key: 'type:f1:email', confidence: 0.95, actDurationMs: 60 }, 20],
  ['step', { ...where(1, 'signIn'), kind: 'do', snapshotSequence: 3, observationSummary: 'text Home',
    observeDurationMs: 0 }, 20],
  ['decision', { ...where(1, 'signIn'), decision: 3, options: 5, choice: 'step_done', confidence: 0.97, done: 0.96,
    stepDone: true, inputTokens: 410, latencyMs: 250 }, 21],
  ['preflight', { status: 'failed', exitCode: 1, failure: 'exit', durationMs: 30 }, 22],
  ['step', { ...where(2, 'save'), kind: 'do', snapshotSequence: 4, observationSummary: 'text Card number',
    observeDurationMs: 4 }, 22],
  ['handback', { ...where(2, 'save'), reason: 'LOCAL_ONLY_SCREEN', pauseId: 'p-2' }, 23],
  ['handback_answer', { ...where(2, 'save'), pauseId: 'p-2', kind: 'done', stepDone: true, decidedBy: 'claude' }, 26],
  ['step', { ...where(3, 'verify'), kind: 'checkpoint', snapshotSequence: 5, observationSummary: 'text Saved',
    observeDurationMs: 6, screenshotPath: 'screen-19.jpg' }, 27],
  ['judgment', { ...where(3, 'verify'), model: 'jev-1.13.0', probabilities: { saved: 0.97 }, inputTokens: 100,
    latencyMs: 200, decideDurationMs: 210 }, 28],
  ['checkpoint', { ...where(3, 'verify'), status: 'passed', stepDurationMs: 300,
    assertions: [{ id: 'saved', claim: 'The card is saved.', probability: 0.97 }] }, 28],
  ['verdict', { verdict: 'passed', reason: 'ALL_CHECKPOINTS_PASSED', steps: 3, inputTokens: 1330, durationMs: 29_000,
    checkpointsPassed: 1, checkpointCount: 1 }, 29],
]);

/** A pause nobody answered: the run ends HANDBACK_TIMEOUT, with no preflight and no start mode named. */
const timedOutRun = events([
  started({ platform: undefined, package: undefined, intentExtras: undefined, bundleId: 'com.example.app',
    projectionRule: 'visible-full-text-v2', plannedSteps: [{ id: 'delete', kind: 'do' }, { id: 'verify', kind: 'checkpoint' }] }),
  ['prepared', { prepareDurationMs: 10 }, 1],
  ['step', { ...where(1, 'delete'), kind: 'do', snapshotSequence: 1, observationSummary: 'button Delete',
    observeDurationMs: 5 }, 2],
  ['handback', { ...where(1, 'delete'), reason: 'DESTRUCTIVE_STEP', pauseId: 'p-9' }, 3],
  ['error', { stepId: 'delete', phase: 'handback', code: 'HANDBACK_TIMEOUT', stepDurationMs: 300_000 }, 303],
  ['verdict', { verdict: 'inconclusive', reason: 'HANDBACK_TIMEOUT', steps: 1, inputTokens: 0, durationMs: 303_000,
    checkpointsPassed: 0, checkpointCount: 1 }, 303],
]);

/** The same run while it is still paused: no verdict yet. */
const pausedRun = timedOutRun.slice(0, 4);

test('report.json gets a driven block for a run with do steps (golden)', async () => {
  const report = buildReportJson(passedRun);
  assert.deepEqual(report.driven, {
    start: 'attach',
    preflight: { status: 'failed', exitCode: 1, failure: 'exit', durationMs: 30 },
    decisions: 3,
    decisionInputTokens: 1230,
    actions: [
      { stepId: 'signIn', action: 'scroll', direction: 'down', decidedBy: 'bridge', changed: false },
      { stepId: 'signIn', action: 'tap', ref: 'b1', target: { role: 'button', label: 'Sign in' }, decidedBy: 'claude' },
      { stepId: 'signIn', action: 'type', ref: 'f1', target: { role: 'text-field', label: 'Email' }, valueKey: 'email',
        decidedBy: 'jev', key: 'type:f1:email', confidence: 0.95 },
    ],
    doSteps: [
      { stepId: 'signIn', completedBy: 'jev', done: 0.96 },
      { stepId: 'save', completedBy: 'claude' },
    ],
    handbacks: [
      { stepId: 'signIn', reason: 'NONE_FITS', answer: 'tap', waitMs: 12_000, event: 6 },
      { stepId: 'save', reason: 'LOCAL_ONLY_SCREEN', answer: 'done', waitMs: 3_000, event: 16 },
    ],
  });
  await checkGolden('tests/golden/report-json-driven.json', { passed: report, handbackTimeout: buildReportJson(timedOutRun) });
});

test('an unanswered hand-back has no answer and no wait time; an unnamed start mode reads restart', () => {
  const driven = buildReportJson(timedOutRun).driven!;
  assert.equal(driven.start, 'restart');
  assert.equal(driven.preflight, null);
  assert.equal(driven.decisions, 0);
  assert.deepEqual(driven.handbacks, [{ stepId: 'delete', reason: 'DESTRUCTIVE_STEP', answer: null, waitMs: null, event: 4 }]);
});

test('script-run action steps in a driven run read decidedBy "script"', () => {
  const run = events([
    started({ plannedSteps: [{ id: 'open', kind: 'action' }, { id: 'signIn', kind: 'do' }, { id: 'verify', kind: 'checkpoint' }] }),
    ['action', { ...where(1, 'open'), action: 'tap', selector: { identifier: 'open' }, resolvedRef: 'o1', actDurationMs: 3 }],
    ['action', { ...where(2, 'signIn'), action: 'back', actPath: 'back-key', decidedBy: 'jev', key: 'back', confidence: 0.9, actDurationMs: 3 }],
    ['action', { ...where(2, 'signIn'), action: 'back', actPath: 'back-key', decidedBy: 'jev', key: 'back', confidence: 0.9, retry: true, actDurationMs: 3 }],
  ]);
  assert.deepEqual(buildReportJson(run).driven!.actions, [
    { stepId: 'open', action: 'tap', ref: 'o1', decidedBy: 'script' },
    { stepId: 'signIn', action: 'back', decidedBy: 'jev', key: 'back', confidence: 0.9 },
    { stepId: 'signIn', action: 'back', decidedBy: 'jev', key: 'back', confidence: 0.9, retry: true },
  ]);
  // A script's own action has no recorded target: the text names its ref, as before.
  assert.match(renderScriptedReport(buildScriptedReport(run)), /^open: tap o1, decided by the script\.$/m);
});

test('the text report names a target by its identifier too, and by role alone when it has no label', () => {
  const run = events([
    started({ plannedSteps: [{ id: 'signIn', kind: 'do' }, { id: 'verify', kind: 'checkpoint' }] }),
    ['action', { ...where(1, 'signIn'), action: 'tap', resolvedRef: 'b7', decidedBy: 'claude', actDurationMs: 3,
      target: { role: 'button', label: 'Go', identifier: 'go.button' } }],
    ['action', { ...where(1, 'signIn'), action: 'tap', resolvedRef: 'b8', decidedBy: 'claude', actDurationMs: 3,
      target: { role: 'image' } }],
  ]);
  const text = renderScriptedReport(buildScriptedReport(run));
  assert.match(text, /^signIn: tap button "Go" identifier "go\.button" \(ref b7\), decided by Claude\.$/m);
  assert.match(text, /^signIn: tap image \(ref b8\), decided by Claude\.$/m);
});

test('a run without do steps gets no driven block, even with a start mode', () => {
  const run = events([started({ start: 'attach', plannedSteps: [{ id: 'verify', kind: 'checkpoint' }] })]);
  assert.equal('driven' in buildReportJson(run), false);
  assert.doesNotMatch(renderScriptedReport(buildScriptedReport(run)), /Driven|Hand-backs|decided by/);
});

test('the text report names who decided each action and each hand-back (golden)', async () => {
  const passed = renderScriptedReport(buildScriptedReport(passedRun));
  assert.match(passed, /^Driven steps: start attach; preflight failed \(exit code 1\); 3 Jev decisions, 1230 input tokens\.$/m);
  // Each element by role and label (ADR-0002); its ref names it in one capture only.
  assert.match(passed, /^signIn: tap button "Sign in" \(ref b1\), decided by Claude\.$/m);
  assert.match(passed, /^signIn: type text-field "Email" \(ref f1, value email\), decided by Jev \(type:f1:email, confidence 0\.950\)\.$/m);
  assert.match(passed, /^signIn: NONE_FITS; Claude answered tap after 12000 ms\.$/m);
  assert.match(passed, /^save: LOCAL_ONLY_SCREEN; Claude answered done after 3000 ms\.$/m);
  const timedOut = renderScriptedReport(buildScriptedReport(timedOutRun));
  assert.match(timedOut, /^Driven steps: start restart; preflight not run; 0 Jev decisions, 0 input tokens\.$/m);
  assert.match(timedOut, /^delete: DESTRUCTIVE_STEP; no answer\.$/m);
  await checkGolden('tests/golden/report-text-driven.json', { passed, handbackTimeout: timedOut });
});

test('a paused run\'s text report says it is waiting for Claude', () => {
  const paused = renderScriptedReport(buildScriptedReport(pausedRun));
  assert.match(paused, /^Waiting for Claude \(needs_claude\): step delete, DESTRUCTIVE_STEP\. Answer with resolve_step\.$/m);
  assert.match(paused, /^delete: DESTRUCTIVE_STEP; waiting for Claude's answer\.$/m);
});

test('the preflight result reads ok, missing, or failed with its cause', () => {
  const line = (preflight: Record<string, unknown>) => renderScriptedReport(buildScriptedReport(events([
    started(), ['preflight', preflight]]))).split('\n').find(row => row.startsWith('Driven steps:'));
  assert.match(line({ status: 'ok', exitCode: 0, durationMs: 5 })!, /preflight ok;/);
  assert.match(line({ status: 'missing', exitCode: null, durationMs: 0 })!, /preflight missing \(no \.jev\/preflight\.json\);/);
  assert.match(line({ status: 'failed', exitCode: null, failure: 'timeout', durationMs: 10_000 })!, /preflight failed \(timeout\);/);
});

test('a driven run through the service writes report.json with the driven block', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-report-driven-'));
  const projectDir = join(root, 'project');
  await mkdir(join(projectDir, '.jev'), { recursive: true });
  await writeFile(join(projectDir, '.jev', 'config.json'), JSON.stringify({ drivenMode: true }));
  let current = 'login';
  let sequence = 0;
  const element = (ref: string, role: string, label: string, actions: Element['actions']): Element => ({
    ref, role, label, actions, frame: { x: 10, y: 10, width: 100, height: 40 }, state: { enabled: true, visible: true } });
  const screens: Record<string, Element[]> = { login: [element('b1', 'button', 'Sign in', ['tap'])],
    home: [element('t3', 'text', 'Home', [])] };
  const shot = (): Snapshot => ({ deviceId: 'fake', capturedAt: Date.now(), expiresAt: Date.now() + 60_000,
    sequence: ++sequence, elements: screens[current]!, truncated: false, screenHash: current });
  const driver: DeviceDriver = { async prepare() {}, async observe() { return shot(); },
    async act(action) { if (action.kind === 'tap') current = 'home'; return shot(); }, async close() {} };
  const service = new BridgeService({ baseDir: join(root, 'runs'), createDriver: () => driver,
    env: { JEV_PROJECT_DIR: projectDir, JEV_EXPERIMENTAL_DRIVEN: '1' },
    createJudge: () => ({ async judge(assertions) {
      return { probabilities: Object.fromEntries(assertions.map(a => [a.id, 0.97])), inputTokens: 1, latencyMs: 1,
        model: 'jev-1.13.0' };
    } }),
    createDrivenJudge: () => fakeDrivenJudge([{ choice: 'tap:b1', confidence: 0.95 }, { choice: 'step_done', confidence: 0.95, done: 0.95 }]) });
  try {
    const { runId } = await service.start({ version: 2, app: { bundleId: 'com.example.app' }, values: {}, steps: [
      { id: 'signIn', kind: 'do', intent: 'Sign in', doneWhen: 'Home shows', effect: 'none' },
      { id: 'verify', kind: 'checkpoint', guard: { present: [{ role: 'text', label: 'Home' }] },
        assertions: [{ id: 'shown', claim: 'Home is shown.' }] }] });
    assert.equal((await service.status(runId, 5_000)).state, 'finished');
    const written = JSON.parse(await readFile(join(service.baseDir, runId, 'report.json'), 'utf8')) as ReportJson;
    assert.equal(written.verdict, 'passed');
    assert.deepEqual(written.driven, { start: 'restart', preflight: null, decisions: 2, decisionInputTokens: 2,
      actions: [{ stepId: 'signIn', action: 'tap', ref: 'b1', target: { role: 'button', label: 'Sign in' }, decidedBy: 'jev',
        key: 'tap:b1', confidence: 0.95 }],
      doSteps: [{ stepId: 'signIn', completedBy: 'jev', done: 0.95 }], handbacks: [] });
  } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
});
