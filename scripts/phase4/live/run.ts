import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, chmod, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod/v4';
import { runCycles, type CycleBackend, type CycleRecord } from './cycles.js';
import { cycleScenario } from './cycles.js';
import type { ScriptedScenario } from '../../../src/scripted/contracts.js';
import { Refusal, readActivation, readAssignment, writeEvidenceAttempt, type ActivationRecord, type AssignmentRecord, type OwnerFile } from './records.js';
import { liveMatrixSchema, type LiveMatrix, type LiveRow } from './row.js';

/** What the runner needs from the world around it. Everything live is injected, so a test never touches a device. */
export interface RunnerDeps {
  /** The environment the runner and its child commands read. */
  env: Record<string, string | undefined>;
  /** The working folder relative paths resolve against. */
  cwd: string;
  now: () => Date;
  out: (line: string) => void;
  err: (line: string) => void;
  /** The versions recorded beside an attempt. */
  versions: () => Promise<unknown>;
  /** The backend the cycles run on. */
  cycleBackend: (input: { scenario: ScriptedScenario; logRoot: string }) => Promise<CycleBackend>;
  signal: AbortSignal;
}

/** The exit codes the runner reports. */
const EXIT = { ok: 0, failed: 1, usage: 2, refused: 3 } as const;

const JEV_KEY = 'TYPESAFE_API_KEY';
const REDACTED = '[REDACTED]';

interface Options {
  assignment?: string | undefined;
  device?: string | undefined;
  evidence?: string | undefined;
  matrix?: string | undefined;
  rows?: string | undefined;
  activation?: string | undefined;
  scenario?: string | undefined;
  cycles?: string | undefined;
  row?: string | undefined;
  verdict?: string | undefined;
  reason?: string | undefined;
  artifact: string[];
}

const optionSpec = {
  assignment: { type: 'string' },
  device: { type: 'string' },
  evidence: { type: 'string' },
  matrix: { type: 'string' },
  rows: { type: 'string' },
  activation: { type: 'string' },
  scenario: { type: 'string' },
  cycles: { type: 'string' },
  row: { type: 'string' },
  verdict: { type: 'string' },
  reason: { type: 'string' },
  artifact: { type: 'string', multiple: true },
} as const;

const USAGE = `Usage:
  run --assignment FILE --device ID --evidence DIR --matrix FILE --rows IDS [--activation FILE] [--scenario FILE] [--cycles N]
  assignment --assignment FILE --device ID
  record --assignment FILE --device ID --evidence DIR --matrix FILE --row ID -- ARGV...
  verdict --assignment FILE --device ID --evidence DIR --matrix FILE --row ID --verdict VERDICT --reason TEXT [--artifact PATH...]`;

class UsageError extends Error {}

function parse(argv: string[]): { command: string; options: Options; positionals: string[]; tail: string[] } {
  const separator = argv.indexOf('--');
  const head = separator === -1 ? argv : argv.slice(0, separator);
  const tail = separator === -1 ? [] : argv.slice(separator + 1);
  let values: Record<string, string | string[] | boolean | undefined>;
  let positionals: string[];
  try {
    const parsed = parseArgs({ args: head, allowPositionals: true, options: optionSpec, strict: true });
    values = parsed.values as Record<string, string | string[] | boolean | undefined>;
    positionals = parsed.positionals;
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
  const [command, ...rest] = positionals;
  if (!command) throw new UsageError('A command is required.');
  const text = (name: keyof Options): string | undefined => {
    const value = values[name];
    return typeof value === 'string' ? value : undefined;
  };
  const artifacts = values.artifact;
  return {
    command,
    positionals: rest,
    options: {
      assignment: text('assignment'),
      device: text('device'),
      evidence: text('evidence'),
      matrix: text('matrix'),
      rows: text('rows'),
      activation: text('activation'),
      scenario: text('scenario'),
      cycles: text('cycles'),
      row: text('row'),
      verdict: text('verdict'),
      reason: text('reason'),
      artifact: Array.isArray(artifacts) ? artifacts.filter((value): value is string => typeof value === 'string')
        : typeof artifacts === 'string' ? [artifacts] : [],
    },
    tail,
  };
}

function required(value: string | undefined, name: string): string {
  if (value === undefined || value === '') throw new UsageError(`--${name} is required.`);
  return value;
}

/** The live matrix, read from its file. */
async function readMatrix(file: string, cwd: string): Promise<LiveMatrix> {
  const path = resolve(cwd, file);
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    throw new Refusal('matrix-invalid', `The live matrix ${path} does not exist.`);
  }
  const parsed = liveMatrixSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Refusal('matrix-invalid', `The live matrix ${path} is invalid: ${parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')}.`);
  }
  return parsed.data;
}

/** The rows a run names. An unknown row is a refusal before anything runs. */
function rowsOf(matrix: LiveMatrix, requested: string): LiveRow[] {
  const ids = requested.split(',').map(id => id.trim()).filter(Boolean);
  const rows: LiveRow[] = [];
  for (const id of ids) {
    const row = matrix.rows.find(candidate => candidate.id === id);
    if (!row) throw new Refusal('unknown-row', `The live matrix has no row ${id}.`);
    rows.push(row);
  }
  if (!rows.length) throw new UsageError('--rows names no row.');
  return rows;
}

/** The assignment record, and the device it names. */
async function assignmentOf(options: Options, deps: RunnerDeps): Promise<OwnerFile<AssignmentRecord>> {
  const file = required(options.assignment, 'assignment');
  const device = required(options.device, 'device');
  return await readAssignment(file, { cwd: deps.cwd, now: deps.now(), device });
}

/** The row's own verdict, and the reasons a row may be refused. */
type RowVerdict = 'untested' | 'passed' | 'failed' | 'refused';

async function writeVerdict(path: string, verdict: RowVerdict, reason: string, at: Date, steps?: string[]): Promise<void> {
  const body: Record<string, unknown> = { verdict, reason, at: at.toISOString() };
  if (steps) body.steps = steps;
  await writeFile(path, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

/** The private folder of a row's latest attempt, or of the one the operator is working in. */
async function openAttempt(evidence: string, row: string): Promise<{ path: string; outputs: string } | undefined> {
  const rowFolder = join(resolve(evidence), row);
  let names: string[];
  try {
    names = await readdir(rowFolder);
  } catch {
    return undefined;
  }
  const attempts = names.filter(name => /^attempt-\d+$/.test(name)).sort();
  const last = attempts.at(-1);
  if (!last) return undefined;
  const path = join(rowFolder, last);
  return { path, outputs: join(path, 'outputs') };
}

/** The evidence of a row's latest attempt, when it is still open (no verdict beyond untested). */
async function openAttemptFor(evidence: string, row: string): Promise<{ path: string; outputs: string } | undefined> {
  const attempt = await openAttempt(evidence, row);
  if (!attempt) return undefined;
  const verdict = JSON.parse(await readFile(join(attempt.path, 'verdict.json'), 'utf8')) as { verdict?: string };
  return verdict.verdict === 'untested' ? attempt : undefined;
}

/** The mask that keeps the key out of every recorded byte. */
function mask(text: string, key: string | undefined): string {
  return key ? text.replaceAll(key, REDACTED) : text;
}

interface CommandRecord {
  seq: number;
  argv: string[];
  cwd: string;
  startedAt: string;
  endedAt: string;
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
}

/**
 * Runs one command with no shell, captures its output into the attempt's own folder, and appends one line
 * to the command log. The key is masked in the argument, in both outputs, and reaches the child only when
 * the row needs it.
 */
async function recordCommand(input: {
  attempt: { path: string; outputs: string };
  argv: string[];
  cwd: string;
  env: Record<string, string | undefined>;
  key: string | undefined;
  needsKey: boolean;
  now: () => Date;
}): Promise<CommandRecord> {
  const key = input.key;
  const maskedArgv = input.argv.map(argument => mask(argument, key));
  const childEnv: Record<string, string | undefined> = { ...input.env };
  if (input.needsKey && key) childEnv[JEV_KEY] = key;
  else delete childEnv[JEV_KEY];
  const startedAt = input.now().toISOString();
  const result = await new Promise<{ stdout: string; stderr: string; code: number | null; signal: string | null }>(resolve => {
    const child = spawn(input.argv[0]!, input.argv.slice(1), { cwd: input.cwd, env: childEnv, shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', chunk => { stdout += String(chunk); });
    child.stderr?.on('data', chunk => { stderr += String(chunk); });
    child.on('error', error => resolve({ stdout, stderr: stderr + error.message, code: null, signal: null }));
    child.on('close', (code, signal) => resolve({ stdout, stderr, code, signal: signal ?? null }));
  });
  const stdout = mask(result.stdout, key);
  const stderr = mask(result.stderr, key);
  const log = await readdir(input.attempt.outputs).catch(() => []);
  const seq = log.filter(name => /^\d+\.stdout$/.test(name)).length + 1;
  await writeFile(join(input.attempt.outputs, `${String(seq)}.stdout`), stdout, { mode: 0o600 });
  await writeFile(join(input.attempt.outputs, `${String(seq)}.stderr`), stderr, { mode: 0o600 });
  await chmod(join(input.attempt.outputs, `${String(seq)}.stdout`), 0o600);
  await chmod(join(input.attempt.outputs, `${String(seq)}.stderr`), 0o600);
  const record: CommandRecord = {
    seq,
    argv: maskedArgv,
    cwd: input.cwd,
    startedAt,
    endedAt: input.now().toISOString(),
    exitCode: result.code,
    signal: result.signal,
    stdout: `outputs/${String(seq)}.stdout`,
    stderr: `outputs/${String(seq)}.stderr`,
  };
  await appendFile(join(input.attempt.path, 'commands.jsonl'), `${JSON.stringify(record)}\n`, { mode: 0o600 });
  return record;
}

/** The artifact's absolute path, size and digest. */
async function artifactOf(path: string, cwd: string): Promise<{ path: string; size: number; sha256: string }> {
  const absolute = isAbsolute(path) ? path : resolve(cwd, path);
  const raw = await readFile(absolute);
  return { path: absolute, size: raw.length, sha256: createHash('sha256').update(raw).digest('hex') };
}

async function commandAssignment(options: Options, deps: RunnerDeps): Promise<number> {
  const file = required(options.assignment, 'assignment');
  const device = required(options.device, 'device');
  const assignment = await readAssignment(file, { cwd: deps.cwd, now: deps.now() });
  if (assignment.record.device !== device.toUpperCase() && assignment.record.device !== device) {
    throw new Refusal('device-mismatch', `The assignment record names device ${assignment.record.device}, not ${device}.`);
  }
  deps.out(JSON.stringify({ record: assignment.record, path: assignment.path, sha256: assignment.sha256 }));
  return EXIT.ok;
}

async function commandRecord(options: Options, deps: RunnerDeps, argv: string[]): Promise<number> {
  if (!argv.length) throw new UsageError('A recorded command needs an argument.');
  await assignmentOf(options, deps);
  const evidence = required(options.evidence, 'evidence');
  const matrix = await readMatrix(required(options.matrix, 'matrix'), deps.cwd);
  const rowId = required(options.row, 'row');
  const row = matrix.rows.find(candidate => candidate.id === rowId);
  if (!row) throw new Refusal('unknown-row', `The live matrix has no row ${rowId}.`);
  const attempt = await openAttemptFor(evidence, rowId);
  if (!attempt) throw new Refusal('no-attempt', `The row ${rowId} has no open attempt; run the row first.`);
  const key = deps.env[JEV_KEY];
  await recordCommand({
    attempt,
    argv,
    cwd: deps.cwd,
    env: deps.env,
    key,
    needsKey: row.needs.jevKey,
    now: deps.now,
  });
  return EXIT.ok;
}

async function commandVerdict(options: Options, deps: RunnerDeps): Promise<number> {
  await assignmentOf(options, deps);
  const evidence = required(options.evidence, 'evidence');
  const matrix = await readMatrix(required(options.matrix, 'matrix'), deps.cwd);
  const rowId = required(options.row, 'row');
  const row = matrix.rows.find(candidate => candidate.id === rowId);
  if (!row) throw new Refusal('unknown-row', `The live matrix has no row ${rowId}.`);
  const verdictName = required(options.verdict, 'verdict');
  const parsedVerdict = z.enum(['passed', 'failed', 'refused']).safeParse(verdictName);
  if (!parsedVerdict.success) throw new UsageError(`--verdict must be passed, failed or refused.`);
  const reason = required(options.reason, 'reason');
  const attempt = await openAttempt(evidence, rowId);
  if (!attempt) throw new Refusal('no-attempt', `The row ${rowId} has no attempt.`);
  const current = JSON.parse(await readFile(join(attempt.path, 'verdict.json'), 'utf8')) as { verdict?: string };
  if (current.verdict !== 'untested') {
    throw new Refusal('no-attempt', `The row ${rowId} already has a verdict (${String(current.verdict)}); an attempt takes one verdict.`);
  }
  const artifacts: { path: string; size: number; sha256: string }[] = [];
  for (const artifact of options.artifact) {
    try {
      artifacts.push(await artifactOf(artifact, deps.cwd));
    } catch {
      throw new Refusal('missing-artifact', `The artifact ${artifact} does not exist.`);
    }
  }
  await writeFile(join(attempt.path, 'artifacts.json'), `${JSON.stringify(artifacts, null, 2)}\n`, { mode: 0o600 });
  await chmod(join(attempt.path, 'artifacts.json'), 0o600);
  await writeVerdict(join(attempt.path, 'verdict.json'), parsedVerdict.data, reason, deps.now());
  return EXIT.ok;
}

/** Why a row is refused before it runs. */
interface RefusalReason {
  verdict: 'refused';
  reason: string;
}

async function commandRun(options: Options, deps: RunnerDeps): Promise<number> {
  const assignment = await assignmentOf(options, deps);
  const evidence = required(options.evidence, 'evidence');
  const matrix = await readMatrix(required(options.matrix, 'matrix'), deps.cwd);
  const rows = rowsOf(matrix, required(options.rows, 'rows'));
  const cycles = options.cycles === undefined ? undefined : Number(options.cycles);
  if (cycles !== undefined && (!Number.isSafeInteger(cycles) || cycles < 1)) {
    throw new UsageError('--cycles must be a whole number of at least one.');
  }
  const activation = options.activation === undefined ? undefined : await readActivation(options.activation, { cwd: deps.cwd });
  let failed = false;
  for (const row of rows) {
    const refusal = await refusalOf(row, assignment, activation, options, deps);
    if (refusal) {
      failed = true;
      await refuseRow(row, refusal.reason, evidence, assignment, activation, deps);
      continue;
    }
    if (row.executor === 'cycles') {
      const outcome = await runCyclesRow(row, options, deps, evidence, assignment, activation);
      if (outcome !== EXIT.ok) failed = true;
      continue;
    }
    await writeEvidenceAttempt({ evidence, row, assignment, ...(activation ? { activation } : {}), versions: await deps.versions(), now: deps.now() });
  }
  return failed ? EXIT.failed : EXIT.ok;
}

/** The reason a row cannot run, or undefined when it can. */
async function refusalOf(row: LiveRow, assignment: OwnerFile<AssignmentRecord>, activation: OwnerFile<ActivationRecord> | undefined,
  options: Options, deps: RunnerDeps): Promise<RefusalReason | undefined> {
  const category = assignment.record.category;
  if (!row.devices.includes(category)) {
    return { verdict: 'refused', reason: 'category-mismatch' };
  }
  if (row.needs.phone && category !== 'android-phone') {
    return { verdict: 'refused', reason: 'category-mismatch' };
  }
  if (row.needs.storeActivation) {
    if (!activation) return { verdict: 'refused', reason: 'activation-missing' };
    const now = deps.now().getTime();
    if (now < Date.parse(activation.record.window.from) || now >= Date.parse(activation.record.window.until)) {
      return { verdict: 'refused', reason: 'activation-outside-window' };
    }
  }
  if (row.needs.jevKey && !deps.env[JEV_KEY]?.trim()) {
    return { verdict: 'refused', reason: 'jev-key-missing' };
  }
  if (row.executor === 'cycles') {
    if (!options.scenario) return { verdict: 'refused', reason: 'scenario-missing' };
    try {
      const raw = JSON.parse(await readFile(resolve(deps.cwd, options.scenario), 'utf8')) as unknown;
      cycleScenario(raw, { category, device: assignment.record.device });
    } catch (error) {
      if (error instanceof Refusal) return { verdict: 'refused', reason: 'scenario-refused' };
      throw error;
    }
  }
  return undefined;
}

/** A refused row is recorded as its own attempt, so the refusal is on the record. */
async function refuseRow(row: LiveRow, reason: string, evidence: string, assignment: OwnerFile<AssignmentRecord>,
  activation: OwnerFile<ActivationRecord> | undefined, deps: RunnerDeps): Promise<void> {
  const attempt = await writeEvidenceAttempt({
    evidence, row, assignment, ...(activation ? { activation } : {}), versions: await deps.versions(), now: deps.now(),
  });
  await writeVerdict(join(attempt.path, 'verdict.json'), 'refused', reason, deps.now(), row.steps);
}

/** A cycles row: it runs the harness and records every cycle. */
async function runCyclesRow(row: LiveRow, options: Options, deps: RunnerDeps, evidence: string,
  assignment: OwnerFile<AssignmentRecord>, activation: OwnerFile<ActivationRecord> | undefined): Promise<number> {
  const scenarioPath = required(options.scenario, 'scenario');
  const raw = JSON.parse(await readFile(resolve(deps.cwd, scenarioPath), 'utf8')) as unknown;
  const scenario = cycleScenario(raw, { category: assignment.record.category, device: assignment.record.device });
  const attempt = await writeEvidenceAttempt({
    evidence, row, assignment, ...(activation ? { activation } : {}), versions: await deps.versions(), now: deps.now(),
  });
  const count = options.cycles === undefined ? 20 : Number(options.cycles);
  const logRoot = join(attempt.path, 'cycles');
  const backend = await deps.cycleBackend({ scenario, logRoot });
  const lines: string[] = [];
  const result = await runCycles(count, backend, {
    signal: deps.signal,
    onCycle: (record: CycleRecord) => {
      lines.push(JSON.stringify({
        cycle: record.cycle,
        device: record.device,
        leftovers: record.leftovers,
        attempt: { id: record.attempt.id, kind: record.attempt.kind },
      }));
    },
  });
  await writeFile(join(attempt.path, 'cycles.jsonl'), lines.length ? `${lines.join('\n')}\n` : '', { mode: 0o600 });
  await chmod(join(attempt.path, 'cycles.jsonl'), 0o600);
  if (!result.passed) {
    const failure = result.failure;
    const reason = failure?.code === 'leftovers' || failure?.code === 'device-not-available'
      ? `${failure.reason}` : failure?.code === 'too-few-cycles' ? 'too few cycles'
        : (failure?.reason ?? 'the cycles did not pass');
    await writeVerdict(join(attempt.path, 'verdict.json'), 'failed', reason, deps.now(), row.steps);
    return EXIT.failed;
  }
  if (count < 20) {
    await writeVerdict(join(attempt.path, 'verdict.json'), 'failed', 'too few cycles', deps.now(), row.steps);
    return EXIT.failed;
  }
  await writeVerdict(join(attempt.path, 'verdict.json'), 'passed', 'every cycle released the device with nothing owned left', deps.now(), row.steps);
  return EXIT.ok;
}

/** The runner's entry point: it never throws, and reports what happened on the given streams. */
export async function main(argv: string[], deps: RunnerDeps): Promise<number> {
  try {
    const { command, options, positionals, tail } = parse(argv);
    switch (command) {
      case 'run': return await commandRun(options, deps);
      case 'assignment': return await commandAssignment(options, deps);
      case 'record': return await commandRecord(options, deps, tail.length ? tail : positionals);
      case 'verdict': return await commandVerdict(options, deps);
      default:
        deps.err(`Unknown command ${command}.`);
        deps.err(USAGE);
        return EXIT.usage;
    }
  } catch (error) {
    if (error instanceof UsageError) {
      deps.err(error.message);
      deps.err(USAGE);
      return EXIT.usage;
    }
    if (error instanceof Refusal) {
      deps.err(error.message);
      return EXIT.refused;
    }
    deps.err(error instanceof Error ? error.message : String(error));
    return EXIT.refused;
  }
}

/** The versions an attempt records: the runtime, the source it was built from, and the tools it found. */
async function readVersions(cwd: string): Promise<unknown> {
  const { execFileSync } = await import('node:child_process');
  const { readFile } = await import('node:fs/promises');
  const os = await import('node:os');
  const git = (args: string[]): string | undefined => {
    try {
      return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return undefined;
    }
  };
  const revision = git(['rev-parse', 'HEAD']);
  const dirty = git(['status', '--porcelain']) ? true : false;
  let packageVersion: string | undefined;
  try {
    packageVersion = (JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8')) as { version?: string }).version;
  } catch { /* an attempt still records what it knows */ }
  return {
    node: process.version,
    platform: os.platform(),
    osRelease: os.release(),
    ...(revision ? { git: { revision, dirty } } : {}),
    ...(packageVersion ? { package: packageVersion } : {}),
    tools: {},
  };
}

/** The runner's own dependencies, when it runs as a command. */
function liveDeps(): RunnerDeps {
  return {
    env: process.env,
    cwd: process.cwd(),
    now: () => new Date(),
    out: line => process.stdout.write(`${line}\n`),
    err: line => process.stderr.write(`${line}\n`),
    versions: async () => await readVersions(process.cwd()),
    cycleBackend: async () => { throw new Refusal('scenario-refused', 'No cycle backend is available in this build.'); },
    signal: new AbortController().signal,
  };
}

/** The command's entry point, when the runner runs as a command. */
export async function cli(argv: string[] = process.argv.slice(2)): Promise<number> {
  return await main(argv, liveDeps());
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  process.exitCode = await cli();
}
