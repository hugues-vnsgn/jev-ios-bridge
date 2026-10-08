// The project's driven-mode files, read from `.jev/` in the project folder (JEV_PROJECT_DIR, else the working
// directory), strictly validated:
// - `.jev/config.json`: `{ "drivenMode"?: boolean, "localOnlyScreens"?: [{ "identifier"?: regex, "label"?: regex }] }`.
// - `.jev/preflight.json`: `{ "command": [program, ...args], "timeoutMs"?: 1..120000 (10000) }`.
//
// Opt-in (E13): a script with a `do` step runs only when config.json has `"drivenMode": true` and the experimental
// switch JEV_EXPERIMENTAL_DRIVEN is on; otherwise it is refused with DRIVEN_NOT_ENABLED before the device is
// touched. A script without `do` steps reads nothing here, so version 1 runs are as in 1.2.
//
// Preflight (E12): run once per run, before the first `test_write` do step, without a shell, in the project
// folder, with a timeout. Exit 0 lets Jev perform test writes; a missing file, a non-zero exit, a timeout or a
// command that can't start sends them to Claude. The run log gets one `preflight` event: status, exit code,
// duration. The command's output is never read, and it never gets the TypeSafe key. Once the command ends, its
// whole process group is stopped and confirmed gone; one that won't go fails the preflight (`cleanup`) and keeps
// the run from releasing the device lease (`settle`).
//
// Local-only screens (E14): a screen with any element matching a rule is never sent to Jev.
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod/v4';
import type { RunLog, Snapshot } from '../contracts/index.js';
import type { ScriptedScenario } from '../scripted/contracts.js';
import { MARKER_CLOSE, MARKER_OPEN } from './marker.js';

export const EXPERIMENTAL_DRIVEN_ENV = 'JEV_EXPERIMENTAL_DRIVEN';
export const DEFAULT_PREFLIGHT_TIMEOUT_MS = 10_000;
export const MAX_PREFLIGHT_TIMEOUT_MS = 120_000;

/** A project file problem, or the opt-in refusal. The message names files and settings, never a value. */
export class DrivenProjectError extends Error {
  constructor(readonly code: 'DRIVEN_NOT_ENABLED' | 'INVALID_PROJECT_FILE' | 'INVALID_VALUE', message: string) {
    super(message);
    this.name = 'DrivenProjectError';
  }
}

const pattern = z.string().min(1).max(500).refine(source => {
  try { new RegExp(source); return true; } catch { return false; }
}, 'must be a valid regular expression');

const localOnlyRuleSchema = z.strictObject({ identifier: pattern.optional(), label: pattern.optional() })
  .refine(rule => rule.identifier !== undefined || rule.label !== undefined, 'needs an identifier or a label pattern');

const configSchema = z.strictObject({
  drivenMode: z.boolean().optional(),
  localOnlyScreens: z.array(localOnlyRuleSchema).max(100).optional(),
});

const preflightSchema = z.strictObject({
  command: z.array(z.string().min(1).max(4096)).min(1).max(64),
  timeoutMs: z.number().int().min(1).max(MAX_PREFLIGHT_TIMEOUT_MS).optional(),
});

/** A local-only rule: an element matches when every pattern given matches its field. */
export interface LocalOnlyScreenRule { identifier?: string; label?: string }
export interface DrivenProjectConfig { drivenMode: boolean; localOnlyScreens: LocalOnlyScreenRule[] }
export interface PreflightConfig { command: string[]; timeoutMs: number }

/** The project folder: JEV_PROJECT_DIR, else `cwd`. */
export function projectDirFrom(env: Readonly<Record<string, string | undefined>>, cwd = process.cwd()): string {
  return resolve(env.JEV_PROJECT_DIR?.trim() || cwd);
}

/** The experimental switch: `1` or `true` (the plugin's boolean setting arrives as text). */
export function experimentalDrivenOn(env: Readonly<Record<string, string | undefined>>): boolean {
  const value = env[EXPERIMENTAL_DRIVEN_ENV]?.trim().toLowerCase();
  return value === '1' || value === 'true';
}

/** A `.jev/` file's JSON, or undefined when the file doesn't exist. */
async function readJevFile(projectDir: string, name: string): Promise<unknown> {
  let text: string;
  try { text = await readFile(join(projectDir, '.jev', name), 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new DrivenProjectError('INVALID_PROJECT_FILE', `Cannot read .jev/${name} in the project folder`);
  }
  try { return JSON.parse(text); }
  catch { throw new DrivenProjectError('INVALID_PROJECT_FILE', `.jev/${name} is not valid JSON`); }
}

function parseJevFile<T>(name: string, schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  throw new DrivenProjectError('INVALID_PROJECT_FILE', `.jev/${name} is invalid:\n${z.prettifyError(parsed.error)}`);
}

/** `.jev/config.json`; a missing file means driven mode off and no local-only screens. */
export async function readProjectConfig(projectDir: string): Promise<DrivenProjectConfig> {
  const input = await readJevFile(projectDir, 'config.json');
  if (input === undefined) return { drivenMode: false, localOnlyScreens: [] };
  const config = parseJevFile('config.json', configSchema, input);
  return { drivenMode: config.drivenMode ?? false, localOnlyScreens: (config.localOnlyScreens ?? []).map(rule => ({
    ...(rule.identifier === undefined ? {} : { identifier: rule.identifier }),
    ...(rule.label === undefined ? {} : { label: rule.label }) })) };
}

/** `.jev/preflight.json`, or undefined when there is none. */
export async function readPreflight(projectDir: string): Promise<PreflightConfig | undefined> {
  const input = await readJevFile(projectDir, 'preflight.json');
  if (input === undefined) return undefined;
  const preflight = parseJevFile('preflight.json', preflightSchema, input);
  return { command: preflight.command, timeoutMs: preflight.timeoutMs ?? DEFAULT_PREFLIGHT_TIMEOUT_MS };
}

/** Whether any element on the screen matches any rule. Hidden elements count: they are in what Jev would read. */
export function localOnlyScreen(rules: readonly LocalOnlyScreenRule[], snapshot: Snapshot): boolean {
  return localOnlyMatcher(rules)(snapshot);
}

/** {@link localOnlyScreen} with the rules compiled once. */
function localOnlyMatcher(rules: readonly LocalOnlyScreenRule[]): (snapshot: Snapshot) => boolean {
  if (!rules.length) return () => false;
  const compiled = rules.map(rule => ({ identifier: rule.identifier === undefined ? undefined : new RegExp(rule.identifier),
    label: rule.label === undefined ? undefined : new RegExp(rule.label) }));
  const matches = (regex: RegExp | undefined, text: string | undefined) =>
    regex === undefined || (text !== undefined && regex.test(text));
  return snapshot => snapshot.elements.some(element => compiled.some(rule =>
    matches(rule.identifier, element.identifier) && matches(rule.label, element.label)));
}

type PreflightOutcome =
  | { status: 'ok'; exitCode: 0 }
  | { status: 'failed'; exitCode: number | null; failure: 'exit' | 'timeout' | 'spawn' | 'cleanup' }
  | { status: 'cancelled' };

/** How the preflight reaches its command's process group; a seam for tests. */
export interface ProcessGroups {
  /** Sends a signal to every process in the group; a group already gone is no error. */
  send(group: number, signal: 'SIGTERM' | 'SIGKILL'): void;
  /** Whether any process in the group remains. */
  alive(group: number): boolean;
}

const processGroups: ProcessGroups = {
  send(group, signal) { try { process.kill(-group, signal); } catch { /* already gone */ } },
  alive(group) {
    try { process.kill(-group, 0); return true; }
    catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
  },
};

/** How long the group gets after SIGTERM before SIGKILL, and after SIGKILL before it counts as surviving. */
const PREFLIGHT_GRACE_MS = 500;
const PREFLIGHT_REAP_MS = 2_000;
const POLL_MS = 20;

export interface PreflightProcessOptions { groups?: ProcessGroups; graceMs?: number; reapMs?: number }

const pause = (ms: number) => new Promise(done => setTimeout(done, ms));

/** Polls until the group is empty or `ms` pass (or `signal` aborts); returns whether it is empty. */
async function emptied(groups: ProcessGroups, group: number, ms: number, signal?: AbortSignal): Promise<boolean> {
  const deadline = performance.now() + ms;
  while (groups.alive(group)) {
    if (performance.now() >= deadline || signal?.aborted) return false;
    await pause(POLL_MS);
  }
  return true;
}

/** Stops the whole group: SIGTERM, a short grace, SIGKILL; returns whether it was confirmed gone. */
async function stopGroup(group: number, options: PreflightProcessOptions): Promise<boolean> {
  const groups = options.groups ?? processGroups;
  if (!groups.alive(group)) return true;
  groups.send(group, 'SIGTERM');
  if (await emptied(groups, group, options.graceMs ?? PREFLIGHT_GRACE_MS)) return true;
  groups.send(group, 'SIGKILL');
  return emptied(groups, group, options.reapMs ?? PREFLIGHT_REAP_MS);
}

/** What one preflight left: its outcome, and the process group still alive after cleanup, if any. */
interface PreflightRun { outcome: PreflightOutcome; survivors?: number }

/**
 * Runs the command without a shell, its output discarded, in its own process group. However the command ends (it
 * exits, its timeout, a cancel), the whole group is then stopped and confirmed gone before this returns, so a
 * helper it left in the background can't outlive it. A group that won't go fails the preflight (`cleanup`).
 */
async function execute(preflight: PreflightConfig, projectDir: string, signal: AbortSignal | undefined,
  options: PreflightProcessOptions): Promise<PreflightRun> {
  const [program, ...args] = preflight.command as [string, ...string[]];
  const { TYPESAFE_API_KEY: _key, ...env } = process.env;
  if (signal?.aborted) return { outcome: { status: 'cancelled' } };
  let child: ReturnType<typeof spawn>;
  // spawn throws at once on some arguments (a NUL byte); that is a command that can't start, like ENOENT.
  try {
    child = spawn(program.includes('/') ? resolve(projectDir, program) : program, args,
      { cwd: projectDir, env, shell: false, stdio: 'ignore', detached: true });
  } catch { return { outcome: { status: 'failed', exitCode: null, failure: 'spawn' } }; }
  const outcome = await new Promise<PreflightOutcome>(done => {
    const finish = (result: PreflightOutcome) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      done(result);
    };
    const timer = setTimeout(() => finish({ status: 'failed', exitCode: null, failure: 'timeout' }), preflight.timeoutMs);
    const cancel = () => finish({ status: 'cancelled' });
    signal?.addEventListener('abort', cancel, { once: true });
    child.once('error', () => finish({ status: 'failed', exitCode: null, failure: 'spawn' }));
    child.once('exit', code => finish(code === 0 ? { status: 'ok', exitCode: 0 }
      : { status: 'failed', exitCode: code, failure: 'exit' }));
  });
  // The group is the child's pid (detached); a command that never started has none.
  const group = child.pid;
  if (group === undefined || await stopGroup(group, options)) return { outcome };
  // Logged even for a cancel: it explains why the run then keeps the lease.
  return { survivors: group, outcome: { status: 'failed', exitCode: 'exitCode' in outcome ? outcome.exitCode : null,
    failure: 'cleanup' } };
}

/** One preflight, run but not yet logged: whether test writes are allowed, the `preflight` event to log (none for
 *  a cancel), and the process group still alive after cleanup, if any. */
interface PreflightResult { allowed: boolean; event?: Record<string, unknown>; survivors?: number }

async function runPreflightCommand(preflight: PreflightConfig | undefined, projectDir: string,
  signal: AbortSignal | undefined, options: PreflightProcessOptions): Promise<PreflightResult> {
  if (!preflight) return { allowed: false, event: { status: 'missing', exitCode: null, durationMs: 0 } };
  const began = performance.now();
  const { outcome, survivors } = await execute(preflight, projectDir, signal, options);
  const left = survivors === undefined ? {} : { survivors };
  if (outcome.status === 'cancelled') return { allowed: false, ...left };
  return { allowed: outcome.status === 'ok', event: { ...outcome, durationMs: Math.round(performance.now() - began) },
    ...left };
}

async function appendPreflightEvent(result: PreflightResult, log: RunLog): Promise<boolean> {
  if (result.event) await log.append('preflight', result.event);
  return result.allowed;
}

/**
 * Runs the preflight and logs its `preflight` event; returns whether Jev may perform test writes. A cancelled run
 * whose processes are gone logs nothing. It returns only once the command's processes are gone, or fails the
 * preflight (`cleanup`) if they won't go.
 */
export async function runPreflight(preflight: PreflightConfig | undefined, projectDir: string, log: RunLog,
  signal?: AbortSignal): Promise<boolean> {
  return appendPreflightEvent(await runPreflightCommand(preflight, projectDir, signal, {}), log);
}

/**
 * One run's preflight: `testWritesAllowed` runs it on the first call and returns its answer on every call;
 * `settle` waits for it to finish and for any process it left to go, and rejects if one is still there when
 * `signal` aborts. The run settles before closing the driver, so the device lease is kept while anything survives.
 * Settling depends on the processes alone: a failure to log the `preflight` event reaches the run through
 * `testWritesAllowed`, like its other log-write failures, and never keeps the driver open.
 */
export function preflightOnce(preflight: PreflightConfig | undefined, projectDir: string, log: RunLog,
  options: PreflightProcessOptions = {}): Pick<DrivenProjectOptions, 'testWritesAllowed' | 'settle'> {
  let running: Promise<PreflightResult> | undefined;
  let answer: Promise<boolean> | undefined;
  return {
    testWritesAllowed: signal =>
      answer ??= (running = runPreflightCommand(preflight, projectDir, signal, options))
        .then(result => appendPreflightEvent(result, log)),
    async settle(signal) {
      const run = await running;
      if (run?.survivors === undefined) return;
      // Only waits: by now the group's number may belong to someone else, so it is never signalled again.
      if (!await emptied(options.groups ?? processGroups, run.survivors, Number.POSITIVE_INFINITY, signal)) {
        throw new Error('The preflight\'s processes are still running');
      }
    },
  };
}

/** What the run's driven options take from the project. */
export interface DrivenProjectOptions {
  /** Runs the preflight on the first call and returns its answer on every call. */
  testWritesAllowed(signal: AbortSignal): Promise<boolean>;
  /** Resolves once the preflight (if it ran) and every process it started are gone; rejects if any remain when
   *  `signal` aborts. */
  settle(signal: AbortSignal): Promise<void>;
  localOnlyScreen(snapshot: Snapshot): boolean;
}

export interface DrivenProject {
  projectDir: string;
  config: DrivenProjectConfig;
  preflight: PreflightConfig | undefined;
  /** One run's options: its preflight runs at most once, logged to `log`. */
  drivenOptions(log: RunLog): DrivenProjectOptions;
}

/**
 * The opt-in gate and the project load, for a run about to start. A script without `do` steps returns undefined
 * and reads nothing. Throws DrivenProjectError: INVALID_PROJECT_FILE for a bad `.jev/` file, DRIVEN_NOT_ENABLED
 * when driven mode isn't turned on both ways.
 */
export async function openDrivenProject(scenario: ScriptedScenario,
  env: Readonly<Record<string, string | undefined>>): Promise<DrivenProject | undefined> {
  if (!scenario.steps.some(step => step.kind === 'do')) return undefined;
  // A typed value holding a mask-marker bracket could overlap a marker, so masking couldn't be guaranteed for it
  // (Issues 15, 16). Refused in do scripts only; the message names the key, never the value.
  const [markerKey] = Object.entries(scenario.values)
    .find(([, value]) => value.includes(MARKER_OPEN) || value.includes(MARKER_CLOSE)) ?? [];
  if (markerKey !== undefined) {
    throw new DrivenProjectError('INVALID_VALUE', `INVALID_VALUE: the value "${markerKey}" contains ` +
      `"${MARKER_OPEN}" or "${MARKER_CLOSE}", which driven mode uses to mask typed values. Use a value without them.`);
  }
  const projectDir = projectDirFrom(env);
  const config = await readProjectConfig(projectDir);
  const missing = [
    ...(config.drivenMode ? [] : ['"drivenMode": true in .jev/config.json']),
    ...(experimentalDrivenOn(env) ? [] : [`${EXPERIMENTAL_DRIVEN_ENV}=1 (the plugin's experimentalDriven setting)`]),
  ];
  if (missing.length) {
    throw new DrivenProjectError('DRIVEN_NOT_ENABLED', `DRIVEN_NOT_ENABLED: the script has a do step, but driven mode ` +
      `isn't turned on. It needs ${missing.join(' and ')}.`);
  }
  const preflight = await readPreflight(projectDir);
  const isLocalOnly = localOnlyMatcher(config.localOnlyScreens);
  return { projectDir, config, preflight,
    drivenOptions: log => ({ ...preflightOnce(preflight, projectDir, log), localOnlyScreen: isLocalOnly }) };
}
