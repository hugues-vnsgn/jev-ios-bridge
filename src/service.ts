import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod/v4';
import type { DeviceDriver, LogSources } from './contracts/index.js';
import type { ScriptedJudge, ScriptedScenario } from './scripted/contracts.js';
import { parseScriptedScenarioSource, resolveScriptValues } from './scripted/schema.js';
import { createRunLog, readRunEvents, readRunReport, validateRunId } from './log/index.js';
import { buildScriptedReport, type ScriptedReport } from './scripted/report.js';
import { buildReportJson, type ReportJson } from './scripted/report-json.js';
import { runScriptedScenario, type ScriptedRunLimits } from './scripted/run.js';
import { openDrivenProject } from './driven/project.js';
import { startWatchServer } from './watch/index.js';
import { startLogStream, type LogStream } from './logpane/stream.js';
import { logsCommand, openPaneWindow } from './logpane/window.js';
import type { DrivenJudge } from './driven/decide.js';
import { createHandbackGate, DEFAULT_HANDBACK_TIMEOUT_MS, HandbackAnswerError, MAX_HANDBACK_TIMEOUT_MS,
  MIN_HANDBACK_TIMEOUT_MS, type HandbackGate, type PausePackage } from './driven/handback.js';
import type { HandbackAnswer } from './driven/step.js';

/** How the live log pane is offered. Without this, runs have no pane. */
export interface LogPaneOptions {
  /** Absolute path of this bridge's cli.js, used in the attach command. */
  cliPath: string;
  /** Open a terminal window automatically (still subject to SSH, CI, and desktop checks). */
  openWindow: boolean;
  /** Told whether a window opened, and the attach command otherwise. */
  onNotice?(runId: string, text: string): void;
}

/** A run of a script with `do` steps has a hand-back gate, where it waits for Claude. */
interface Job { abort: AbortController; done: Promise<void>; state: 'running' | 'finished'; gate?: HandbackGate }

/** A run's state: `needs_claude` while it is paused on a hand-back, holding the device. */
export type RunState = 'running' | 'needs_claude' | 'finished' | 'interrupted';

export const startLimitsSchema = z.strictObject({
  maxSteps: z.number().int().min(1).max(100).optional(),
  wallTimeMs: z.number().int().min(1).max(3_600_000).optional(),
});
/** The limits with driven mode's: how long a hand-back pause waits for Claude (default 5 minutes). Published by
 *  start_scenario only while the experimental switch is on. */
export const drivenStartLimitsSchema = startLimitsSchema.extend({
  handbackTimeoutMs: z.number().int().min(MIN_HANDBACK_TIMEOUT_MS).max(MAX_HANDBACK_TIMEOUT_MS).optional(),
});

export class BridgeService {
  private readonly jobs = new Map<string, Job>();
  private watch: Awaited<ReturnType<typeof startWatchServer>> | undefined;
  private startingWatch: ReturnType<typeof startWatchServer> | undefined;
  private stopping = false;
  readonly baseDir: string;
  constructor(private readonly options: {
    baseDir: string;
    /** Builds the run's driver, given the run's ID, which names the driver's own files (the Android app log). */
    createDriver: (scenario: ScriptedScenario, run: { runId: string }) => DeviceDriver;
    createJudge: (scenario: ScriptedScenario) => ScriptedJudge;
    /** Jev for `do` steps. Without it, a script with a `do` step is refused when its run starts. */
    createDrivenJudge?: (scenario: ScriptedScenario) => DrivenJudge;
    policy?: ScriptedRunLimits;
    logPane?: LogPaneOptions;
    /** Where a script's `{ "fromEnv": NAME }` values, JEV_PROJECT_DIR and JEV_EXPERIMENTAL_DRIVEN are read.
     *  Defaults to this process's environment. */
    env?: Readonly<Record<string, string | undefined>>;
  }) { this.baseDir = resolve(options.baseDir); }

  async start(input: unknown, requestedLimits: unknown = {}): Promise<{ runId: string; watchUrl: string; logsCommand?: string }> {
    if (this.stopping) throw new Error('Bridge is shutting down');
    // Read once, here: from now on every part of the run (driver, redactor, log pane) sees only the text.
    const scenario = resolveScriptValues(parseScriptedScenarioSource(input), this.options.env ?? process.env);
    const parsedLimits = drivenStartLimitsSchema.parse(requestedLimits);
    const limits: ScriptedRunLimits = { ...this.options.policy,
      ...(parsedLimits.maxSteps === undefined ? {} : { maxSteps: parsedLimits.maxSteps }),
      ...(parsedLimits.wallTimeMs === undefined ? {} : { wallTimeMs: parsedLimits.wallTimeMs }),
    };
    // E13: a do script needs driven mode on in the project and the experimental switch, checked before the device
    // is touched. `project.drivenOptions(log)` gives the run its preflight and local-only screens (E12, E14): spread
    // it into the run's `driven` options beside the judge and the hand-back gate.
    const project = await openDrivenProject(scenario, this.options.env ?? process.env);
    const runId = randomUUID();
    const driver = this.options.createDriver(scenario, { runId });
    const judge = this.options.createJudge(scenario);
    if (this.stopping) throw new Error('Bridge is shutting down');
    const log = await createRunLog(this.baseDir, runId, { values: Object.values(scenario.values) });
    if (this.stopping) throw new Error('Bridge is shutting down');
    this.startingWatch ??= startWatchServer(this.baseDir);
    this.watch = await this.startingWatch;
    if (this.stopping) throw new Error('Bridge is shutting down');
    const gate = scenario.steps.some(step => step.kind === 'do') ? createHandbackGate({ scenario,
      timeoutMs: parsedLimits.handbackTimeoutMs ?? DEFAULT_HANDBACK_TIMEOUT_MS, evidenceDir: resolve(this.baseDir, runId) }) : undefined;
    const drivenJudge = gate ? this.options.createDrivenJudge?.(scenario) : undefined;
    const job: Job = { abort: new AbortController(), done: Promise.resolve(), state: 'running', ...(gate ? { gate } : {}) };
    this.jobs.set(runId, job);
    const pane = this.options.logPane;
    let stream: Promise<LogStream | undefined> | undefined;
    const attach = pane ? logsCommand(pane.cliPath, runId) : undefined;
    const startPane = (logSources: LogSources) => {
      if (!pane || !attach) return;
      stream = startLogStream({ runId, app: scenario.app, sources: logSources, values: scenario.values,
        appProblem: () => driver.appProblem?.() })
        .then(async started => {
          const window = pane.openWindow ? await openPaneWindow(resolve(this.baseDir, runId), attach)
            : { opened: false as const, reason: 'turned off with --no-log-pane' };
          pane.onNotice?.(runId, window.opened ? `Log pane: opened in ${window.app}.`
            : `Log pane: no window (${window.reason}). Follow the app's output with: ${attach}`);
          return started;
        }, () => undefined);
    };
    job.done = runScriptedScenario({ runId, scenario, driver, judge, log, signal: job.abort.signal, limits,
      ...(gate && drivenJudge ? { driven: { judge: drivenJudge, handback: gate.handback, ...project?.drivenOptions(log) } } : {}),
      ...(pane ? { onPrepared: ({ logSources }) => startPane(logSources),
        onCleanup: () => { void stream?.then(started => started?.expectStop()); } } : {}),
    }).then(() => { job.state = 'finished'; }, async () => {
      // Never serialize upstream exceptions, which can carry screen text or credentials.
      try {
        const events = await log.read();
        if (!events.some(event => event.type === 'verdict')) {
          await log.append('verdict', { verdict: 'inconclusive', reason: 'INTERNAL_ERROR', steps: 0, inputTokens: 0, durationMs: 0 });
          await log.writeReport?.(buildReportJson(await log.read()));
        }
      } finally { job.state = 'finished'; }
    }).catch(() => { job.state = 'finished'; }).finally(() => { gate?.close(); }).then(async () => {
      const started = await stream;
      if (!started) return;
      const { report } = await this.status(runId).catch(() => ({ report: undefined }));
      await started.finish({ verdict: report?.verdict ?? 'inconclusive', reason: report?.reason ?? 'INTERRUPTED',
        evidencePath: resolve(this.baseDir, runId), ...(report?.verdict === 'passed' ? { closeAfterMs: 3_000 } : {}) });
    }).catch(() => {});
    await log.read();
    return { runId, watchUrl: this.watch.urlFor(runId), ...(attach ? { logsCommand: attach } : {}) };
  }

  /** The run's report so far. A wait ends early when the run finishes or pauses for Claude; a paused run
   *  returns at once, with its pause package. */
  async status(runId: string, waitMs = 0, signal?: AbortSignal): Promise<{ state: RunState; report: ScriptedReport; pause?: PausePackage }> {
    validateRunId(runId);
    if (!Number.isInteger(waitMs) || waitMs < 0 || waitMs > 45_000) throw new Error('Invalid report wait');
    const job = this.jobs.get(runId);
    if (job?.state === 'running' && waitMs > 0 && !job.gate?.pending()) {
      await new Promise<void>((done, reject) => {
        let unsubscribe = () => {};
        const cleanup = () => { clearTimeout(timer); unsubscribe(); signal?.removeEventListener('abort', abort); };
        const finish = () => { cleanup(); done(); };
        const abort = () => { cleanup(); reject(new Error('Report wait cancelled')); };
        const timer = setTimeout(finish, waitMs);
        if (job.gate) unsubscribe = job.gate.onPause(finish);
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
        void job.done.then(finish, finish);
      });
    }
    const events = await readRunEvents(this.baseDir, runId);
    const pause = job?.state === 'running' ? job.gate?.pending() : undefined;
    const state = pause ? 'needs_claude'
      : job?.state ?? (events.some(event => event.type === 'verdict') ? 'finished' : 'interrupted');
    return { state, report: buildScriptedReport(events), ...(pause ? { pause } : {}) };
  }

  /** Delivers Claude's answer to the run's open pause. Throws HandbackAnswerError, whose message is safe to show
   *  Claude, when there is no such pause or the answer doesn't fit it; the pause then stays open. */
  async resolve(runId: string, pauseId: string, answer: unknown): Promise<HandbackAnswer> {
    const job = this.jobs.get(validateRunId(runId));
    if (!job || job.state !== 'running') throw new HandbackAnswerError(`Run ${runId} is not active in this bridge process`);
    if (!job.gate) throw new HandbackAnswerError(`Run ${runId} has no do steps, so it never waits for an answer`);
    return job.gate.resolve(pauseId, answer);
  }

  /** The frozen report: report.json when the run recorded one, otherwise built from run.jsonl. */
  async reportJson(runId: string): Promise<ReportJson> {
    const stored = await readRunReport(this.baseDir, runId);
    return (stored ?? buildReportJson(await readRunEvents(this.baseDir, runId))) as ReportJson;
  }

  async cancel(runId: string): Promise<void> {
    const job = this.jobs.get(validateRunId(runId));
    if (!job) throw new Error('Run is not active in this bridge process');
    job.abort.abort();
    await job.done;
  }

  async close(): Promise<void> {
    this.stopping = true;
    for (const job of this.jobs.values()) job.abort.abort();
    await Promise.all([...this.jobs.values()].map(job => job.done));
    const watch = this.watch ?? await this.startingWatch;
    await watch?.close();
  }
}
