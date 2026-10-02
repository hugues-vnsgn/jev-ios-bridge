/**
 * The preflight's processes (Codex review #7, Issue 14): once the command ends, by exiting, by its timeout or by a
 * cancel, its whole process group is stopped (SIGTERM, a short grace, SIGKILL) and confirmed gone before the
 * preflight returns. A group that can't be confirmed gone fails the preflight (`failure: "cleanup"`) and keeps the
 * run from closing the driver, so the device lease is kept while anything survives. Real `sh` and `sleep` processes
 * in a temporary folder; no device, no TypeSafe call.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeviceDriver, Element, RunEvent, RunLog, Snapshot } from '../src/contracts/index.js';
import { preflightOnce, runPreflight, type ProcessGroups } from '../src/driven/project.js';
import { redact } from '../src/log/index.js';
import { buildScriptedReport, renderScriptedReport } from '../src/scripted/report.js';
import { runScriptedScenario } from '../src/scripted/run.js';
import { parseScriptedScenario } from '../src/scripted/schema.js';
import { fakeDrivenJudge } from './fixtures/driven-judge.js';

function recordingLog(): RunLog & { events: RunEvent[] } {
  const events: RunEvent[] = [];
  return { events,
    async append(type, data) { events.push({ version: 1, runId: 'preflight', sequence: events.length + 1,
      at: new Date().toISOString(), type, data: structuredClone(data) }); },
    async read() { return events; },
  };
}

async function folder(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'jev-preflight-processes-'));
  try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

/** A preflight whose shell starts a background `sleep`, writes its pid to `pid`, then runs `rest`. */
const withHelper = (rest: string, helper = 'sleep 30') =>
  ['/bin/sh', '-c', `${helper} & echo $! > pid; ${rest}`];

const running = (pid: number): boolean => {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
};

const helperPid = async (dir: string) => Number((await readFile(join(dir, 'pid'), 'utf8')).trim());

test('a preflight that exits 0 leaves no background process behind when it returns', async () => {
  await folder(async dir => {
    const log = recordingLog();
    assert.equal(await runPreflight({ command: withHelper('exit 0'), timeoutMs: 10_000 }, dir, log), true);
    const pid = await helperPid(dir);
    assert.equal(running(pid), false, 'the background sleep is gone');
    assert.deepEqual(log.events.map(event => [event.data.status, event.data.exitCode]), [['ok', 0]]);
  });
});

test('a preflight that fails still has its background processes stopped before it returns', async () => {
  await folder(async dir => {
    const log = recordingLog();
    assert.equal(await runPreflight({ command: withHelper('exit 5'), timeoutMs: 10_000 }, dir, log), false);
    assert.equal(running(await helperPid(dir)), false);
    assert.deepEqual(log.events.map(event => [event.data.failure, event.data.exitCode]), [['exit', 5]]);
  });
});

test('a background process that ignores SIGTERM is killed after the grace', async () => {
  await folder(async dir => {
    const log = recordingLog();
    const helper = `/bin/sh -c 'trap "" TERM; sleep 30'`;
    assert.equal(await runPreflight({ command: withHelper('exit 0', helper), timeoutMs: 10_000 }, dir, log), true);
    assert.equal(running(await helperPid(dir)), false);
  });
});

test('on timeout, the preflight returns only once its processes are gone', async () => {
  await folder(async dir => {
    const log = recordingLog();
    assert.equal(await runPreflight({ command: withHelper('sleep 30'), timeoutMs: 300 }, dir, log), false);
    assert.equal(running(await helperPid(dir)), false);
    assert.deepEqual(log.events.map(event => [event.data.status, event.data.failure]), [['failed', 'timeout']]);
  });
});

test('on cancel, the preflight returns only once its processes are gone, and logs nothing', async () => {
  await folder(async dir => {
    const log = recordingLog();
    const controller = new AbortController();
    const pending = runPreflight({ command: withHelper('sleep 30'), timeoutMs: 60_000 }, dir, log, controller.signal);
    setTimeout(() => controller.abort(), 300);
    assert.equal(await pending, false);
    assert.equal(running(await helperPid(dir)), false);
    assert.deepEqual(log.events, []);
  });
});

/** A process group that never goes away, whatever it is sent. */
function immortal(): ProcessGroups & { sent: string[] } {
  const sent: string[] = [];
  return { sent, send(_group, signal) { sent.push(signal); }, alive: () => true };
}

test('a group that can\'t be confirmed gone fails the preflight with failure "cleanup", after TERM then KILL', async () => {
  await folder(async dir => {
    const log = recordingLog();
    const groups = immortal();
    const once = preflightOnce({ command: [process.execPath, '-e', 'process.exit(0)'], timeoutMs: 10_000 }, dir, log,
      { groups, graceMs: 20, reapMs: 40 });
    assert.equal(await once.testWritesAllowed(new AbortController().signal), false);
    assert.deepEqual(groups.sent, ['SIGTERM', 'SIGKILL']);
    const [event] = log.events.map(e => e.data);
    assert.equal(event!.status, 'failed');
    assert.equal(event!.failure, 'cleanup');
    assert.equal(event!.exitCode, 0, 'the command\'s own exit code is kept');
    await assert.rejects(once.settle(AbortSignal.timeout(50)), 'the survivors keep the run from settling');
  });
});

test('settle waits for survivors to go, and resolves at once when the preflight never ran', async () => {
  await folder(async dir => {
    const log = recordingLog();
    let alive = true;
    const groups: ProcessGroups = { send() {}, alive: () => alive };
    const once = preflightOnce({ command: [process.execPath, '-e', 'process.exit(0)'], timeoutMs: 10_000 }, dir, log,
      { groups, graceMs: 10, reapMs: 10 });
    await once.testWritesAllowed(new AbortController().signal);
    let settled = false;
    const settling = once.settle(AbortSignal.timeout(5_000)).then(() => { settled = true; });
    await new Promise(done => setTimeout(done, 60));
    assert.equal(settled, false);
    alive = false;
    await settling;
    await preflightOnce(undefined, dir, recordingLog()).settle(AbortSignal.timeout(50));
  });
});

// ---------- in a run: the lease is kept while anything survives ----------

const home: Element[] = [{ ref: 't1', role: 'text', label: 'Home', frame: { x: 0, y: 0, width: 100, height: 20 },
  state: { enabled: true, visible: true }, actions: [] }];

function homeDriver(events: string[]): DeviceDriver {
  let sequence = 0;
  const shot = (): Snapshot => ({ deviceId: 'fake', capturedAt: Date.now(), expiresAt: Date.now() + 60_000,
    sequence: ++sequence, elements: home, truncated: false, screenHash: 'home' });
  return {
    async prepare() {},
    async observe() { return shot(); },
    async act() { return shot(); },
    actPath: () => undefined,
    async close() { events.push('close'); },
  };
}

const scenario = parseScriptedScenario({ version: 2, app: { bundleId: 'com.example.app' }, values: {}, steps: [
  { id: 'look', kind: 'do', intent: 'Look at home', doneWhen: 'Home shows', effect: 'test_write' },
  { id: 'verify', kind: 'checkpoint', guard: { present: [{ role: 'text', label: 'Home' }] },
    assertions: [{ id: 'shown', claim: 'Home is shown.' }] }] });
const passingJudge = { async judge(assertions: { id: string }[]) {
  return { probabilities: Object.fromEntries(assertions.map(a => [a.id, 0.97])), inputTokens: 1, latencyMs: 1,
    model: 'jev-1.13.0' };
} };

async function runWith(settle: (signal: AbortSignal) => Promise<void>) {
  const events: string[] = [];
  const log = recordingLog();
  const report = await runScriptedScenario({ runId: 'preflight', log, scenario, driver: homeDriver(events),
    judge: passingJudge, limits: { cleanupTimeMs: 200 }, driven: {
      judge: fakeDrivenJudge([{ choice: 'step_done', confidence: 0.95, done: 0.96 }]),
      handback: async () => { throw new Error('no hand-back expected'); },
      testWritesAllowed: async () => true,
      settle: async signal => { events.push('settle'); await settle(signal); events.push('settled'); } } });
  return { report, events, log };
}

test('the run waits for the preflight\'s processes before it closes the driver', async () => {
  const { report, events } = await runWith(() => new Promise(done => setTimeout(done, 30)));
  assert.equal(report.verdict, 'passed');
  assert.deepEqual(events, ['settle', 'settled', 'close']);
});

test('a preflight whose processes survive ends the run CLEANUP_FAILED without closing the driver', async () => {
  // Polls like the real settle (a bare abort listener would let the test's event loop run dry).
  const { report, events, log } = await runWith(signal => new Promise((_, fail) => {
    const poll = setInterval(() => { if (signal.aborted) { clearInterval(poll); fail(signal.reason); } }, 10);
  }));
  assert.equal(report.verdict, 'inconclusive');
  assert.equal(report.reason, 'CLEANUP_FAILED');
  assert.deepEqual(events, ['settle'], 'close never ran, so the lease is kept');
  assert.ok(log.events.some(event => event.type === 'error' && event.data.code === 'CLEANUP_FAILED'));
});

test('a cancel whose processes survive logs the preflight failed with failure "cleanup"', async () => {
  await folder(async dir => {
    const log = recordingLog();
    const controller = new AbortController();
    // The command ends on its own shortly after; the fake group only pretends it survives.
    const once = preflightOnce({ command: [process.execPath, '-e', 'setTimeout(() => {}, 500)'], timeoutMs: 60_000 },
      dir, log, { groups: { send() {}, alive: () => true }, graceMs: 10, reapMs: 10 });
    const pending = once.testWritesAllowed(controller.signal);
    setTimeout(() => controller.abort(), 100);
    assert.equal(await pending, false);
    assert.deepEqual(log.events.map(event => [event.data.status, event.data.failure, event.data.exitCode]),
      [['failed', 'cleanup', null]]);
  });
});

test('settle never signals a group that is already gone', async () => {
  await folder(async dir => {
    const sent: string[] = [];
    let alive = true;
    const once = preflightOnce({ command: [process.execPath, '-e', 'process.exit(0)'], timeoutMs: 10_000 }, dir,
      recordingLog(), { groups: { send(_group, signal) { sent.push(signal); }, alive: () => alive }, graceMs: 10, reapMs: 10 });
    await once.testWritesAllowed(new AbortController().signal);
    alive = false;
    sent.length = 0;
    await once.settle(AbortSignal.timeout(1_000));
    assert.deepEqual(sent, [], 'a reused group number is never killed');
  });
});

test('"cleanup" is a run-log protocol word: a typed value equal to it doesn\'t redact it', () => {
  assert.deepEqual(redact({ status: 'failed', failure: 'cleanup' }, ['cleanup']), { status: 'failed', failure: 'cleanup' });
});

test('the text report says a preflight failed because its processes couldn\'t be stopped, not by its exit code', () => {
  const at = new Date().toISOString();
  const event = (sequence: number, type: RunEvent['type'], data: Record<string, unknown>): RunEvent =>
    ({ version: 1, runId: 'preflight', sequence, at, type, data });
  const text = renderScriptedReport(buildScriptedReport([
    event(1, 'started', { mode: 'scripted', bundleId: null, platform: 'android', package: 'com.example.app', activity: null,
      intentExtras: {}, bridgeVersion: '1.3.0', jevModel: 'jev-1.13.0', projectionRule: 'android-full-text-v1',
      plannedSteps: [{ id: 'save', kind: 'do' }] }),
    event(2, 'preflight', { status: 'failed', exitCode: 0, failure: 'cleanup', durationMs: 2_600 })]));
  assert.match(text, /preflight failed \(its processes could not be stopped\);/);
});
