import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { DeviceDriver, JevJudge, RunReport, Scenario } from './contracts/index.js';
import { parseScenario } from './scenario/index.js';
import { createRunLog, readRunEvents, validateRunId } from './log/index.js';
import { buildReport } from './report/index.js';
import { runScenario } from './run/index.js';
import { buildObservation } from './observation/index.js';
import { startWatchServer } from './watch/index.js';

interface Job { abort: AbortController; done: Promise<void>; state: 'running' | 'finished' }

export class BridgeService {
  private readonly jobs = new Map<string, Job>();
  private watch: Awaited<ReturnType<typeof startWatchServer>> | undefined;
  private startingWatch: ReturnType<typeof startWatchServer> | undefined;
  private stopping = false;
  readonly baseDir: string;
  constructor(private readonly options: {
    baseDir: string;
    createDriver: (scenario: Scenario) => DeviceDriver;
    createJudge: () => JevJudge;
  }) { this.baseDir = resolve(options.baseDir); }

  async start(input: unknown): Promise<{ runId: string; watchUrl: string }> {
    if (this.stopping) throw new Error('Bridge is shutting down');
    const scenario = parseScenario(input);
    const driver = this.options.createDriver(scenario);
    const judge = this.options.createJudge();
    if (this.stopping) throw new Error('Bridge is shutting down');
    const runId = randomUUID();
    const log = await createRunLog(this.baseDir, runId, { values: Object.values(scenario.values) });
    if (this.stopping) throw new Error('Bridge is shutting down');
    this.startingWatch ??= startWatchServer(this.baseDir);
    this.watch = await this.startingWatch;
    if (this.stopping) throw new Error('Bridge is shutting down');
    const job: Job = { abort: new AbortController(), done: Promise.resolve(), state: 'running' };
    this.jobs.set(runId, job);
    job.done = runScenario({ runId, scenario, driver, judge, log, signal: job.abort.signal,
      observationBuilder: buildObservation,
    }).then(() => { job.state = 'finished'; }, async () => {
      // Never serialize upstream exceptions, which can carry screen text or credentials.
      try {
        const events = await log.read();
        if (!events.some(event => event.type === 'verdict')) {
          await log.append('verdict', { verdict: 'inconclusive', reason: 'Run could not complete. Check local setup.', steps: 0, inputTokens: 0, durationMs: 0 });
        }
      } finally { job.state = 'finished'; }
    }).catch(() => { job.state = 'finished'; });
    await log.read();
    return { runId, watchUrl: `${this.watch.url}&run=${runId}` };
  }

  async status(runId: string): Promise<{ state: 'running' | 'finished' | 'interrupted'; report: RunReport }> {
    validateRunId(runId);
    const events = await readRunEvents(this.baseDir, runId);
    const state = this.jobs.get(runId)?.state ?? (events.some(event => event.type === 'verdict') ? 'finished' : 'interrupted');
    return { state, report: buildReport(events) };
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
