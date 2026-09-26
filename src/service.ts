import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod/v4';
import type { DeviceDriver } from './contracts/index.js';
import type { ScriptedJudge, ScriptedScenario } from './scripted/contracts.js';
import { parseScriptedScenario } from './scripted/schema.js';
import { createRunLog, readRunEvents, readRunReport, validateRunId } from './log/index.js';
import { buildScriptedReport, type ScriptedReport } from './scripted/report.js';
import { buildReportJson, type ReportJson } from './scripted/report-json.js';
import { runScriptedScenario, type ScriptedRunLimits, type ScriptedRunOptions } from './scripted/run.js';
import { startWatchServer } from './watch/index.js';
import { startLogStream, type LogStream } from './logpane/stream.js';
import { logsCommand, openPaneWindow } from './logpane/window.js';

/** How the live log pane is offered. Without this, runs have no pane. */
export interface LogPaneOptions {
  /** Absolute path of this bridge's cli.js, used in the attach command. */
  cliPath: string;
  /** Open a terminal window automatically (still subject to SSH, CI, and desktop checks). */
  openWindow: boolean;
  /** Told whether a window opened, and the attach command otherwise. */
  onNotice?(runId: string, text: string): void;
}

interface Job { abort: AbortController; done: Promise<void>; state: 'running' | 'finished' }

export const startLimitsSchema = z.strictObject({
  maxSteps: z.number().int().min(1).max(100).optional(),
  wallTimeMs: z.number().int().min(1).max(3_600_000).optional(),
});

export class BridgeService {
  private readonly jobs = new Map<string, Job>();
  private watch: Awaited<ReturnType<typeof startWatchServer>> | undefined;
  private startingWatch: ReturnType<typeof startWatchServer> | undefined;
  private stopping = false;
  readonly baseDir: string;
  constructor(private readonly options: {
    baseDir: string;
    createDriver: (scenario: ScriptedScenario) => DeviceDriver;
    createJudge: (scenario: ScriptedScenario) => ScriptedJudge;
    policy?: ScriptedRunLimits;
    /** Only the pinned MobileBuildMCP driver may enable its proven tap alias rule. */
    tapAliasRule?: ScriptedRunOptions['tapAliasRule'];
    logPane?: LogPaneOptions;
  }) { this.baseDir = resolve(options.baseDir); }

  async start(input: unknown, requestedLimits: unknown = {}): Promise<{ runId: string; watchUrl: string; logsCommand?: string }> {
    if (this.stopping) throw new Error('Bridge is shutting down');
    const scenario = parseScriptedScenario(input);
    const parsedLimits = startLimitsSchema.parse(requestedLimits);
    const limits: ScriptedRunLimits = { ...this.options.policy,
      ...(parsedLimits.maxSteps === undefined ? {} : { maxSteps: parsedLimits.maxSteps }),
      ...(parsedLimits.wallTimeMs === undefined ? {} : { wallTimeMs: parsedLimits.wallTimeMs }),
    };
    const driver = this.options.createDriver(scenario);
    const judge = this.options.createJudge(scenario);
    if (this.stopping) throw new Error('Bridge is shutting down');
    const runId = randomUUID();
    const log = await createRunLog(this.baseDir, runId, { values: Object.values(scenario.values) });
    if (this.stopping) throw new Error('Bridge is shutting down');
    this.startingWatch ??= startWatchServer(this.baseDir);
    this.watch = await this.startingWatch;
    if (this.stopping) throw new Error('Bridge is shutting down');
    const job: Job = { abort: new AbortController(), done: Promise.resolve(), state: 'running' };
    this.jobs.set(runId, job);
    const pane = this.options.logPane;
    let stream: Promise<LogStream | undefined> | undefined;
    const attach = pane ? logsCommand(pane.cliPath, runId) : undefined;
    const startPane = (logSources: { runtime?: string; os?: string }) => {
      if (!pane || !attach) return;
      stream = startLogStream({ runId, bundleId: scenario.app.bundleId, sources: logSources, values: scenario.values })
        .then(async started => {
          const window = pane.openWindow ? await openPaneWindow(resolve(this.baseDir, runId), attach)
            : { opened: false as const, reason: 'turned off with --no-log-pane' };
          pane.onNotice?.(runId, window.opened ? `Log pane: opened in ${window.app}.`
            : `Log pane: no window (${window.reason}). Follow the app's output with: ${attach}`);
          return started;
        }, () => undefined);
    };
    job.done = runScriptedScenario({ runId, scenario, driver, judge, log, signal: job.abort.signal, limits,
      ...(this.options.tapAliasRule ? { tapAliasRule: this.options.tapAliasRule } : {}),
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
    }).catch(() => { job.state = 'finished'; }).then(async () => {
      const started = await stream;
      if (!started) return;
      const { report } = await this.status(runId).catch(() => ({ report: undefined }));
      await started.finish({ verdict: report?.verdict ?? 'inconclusive', reason: report?.reason ?? 'INTERRUPTED',
        evidencePath: resolve(this.baseDir, runId), ...(report?.verdict === 'passed' ? { closeAfterMs: 3_000 } : {}) });
    }).catch(() => {});
    await log.read();
    return { runId, watchUrl: this.watch.urlFor(runId), ...(attach ? { logsCommand: attach } : {}) };
  }

  async status(runId: string, waitMs = 0, signal?: AbortSignal): Promise<{ state: 'running' | 'finished' | 'interrupted'; report: ScriptedReport }> {
    validateRunId(runId);
    if (!Number.isInteger(waitMs) || waitMs < 0 || waitMs > 45_000) throw new Error('Invalid report wait');
    const job = this.jobs.get(runId);
    if (job?.state === 'running' && waitMs > 0) {
      await new Promise<void>((done, reject) => {
        const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
        const finish = () => { cleanup(); done(); };
        const abort = () => { cleanup(); reject(new Error('Report wait cancelled')); };
        const timer = setTimeout(finish, waitMs);
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
        void job.done.then(finish, finish);
      });
    }
    const events = await readRunEvents(this.baseDir, runId);
    const state = this.jobs.get(runId)?.state ?? (events.some(event => event.type === 'verdict') ? 'finished' : 'interrupted');
    return { state, report: buildScriptedReport(events) };
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
