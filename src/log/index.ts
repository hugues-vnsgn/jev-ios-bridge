import { mkdir, readFile, open, copyFile, chmod, realpath, rename, writeFile } from 'node:fs/promises';
import { createHmac, randomBytes } from 'node:crypto';
import { resolve, join, basename } from 'node:path';
import { PLATFORMS, type RunEvent, type RunLog } from '../contracts/index.js';
import { PROJECTION_RULES } from '../scripted/observe.js';
import { REASON_CODES } from '../scripted/vocabulary.js';
import { BRIDGE_VERSION } from '../version.js';
import { HANDBACK_ANSWER_KINDS, PAUSE_REASON_TEXT } from '../driven/vocabulary.js';

export function validateRunId(runId: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(runId)) throw new Error('Invalid run id');
  return runId;
}

const STEP_KINDS = ['action', 'wait', 'checkpoint', 'do'];
const DIRECTIONS = new Set(['up', 'down', 'left', 'right']);
const protocolValues: Record<string, ReadonlySet<string>> = {
  mode: new Set(['scripted']),
  // A step's kind, and a hand-back answer's kind (`handback_answer`).
  kind: new Set([...STEP_KINDS, ...HANDBACK_ANSWER_KINDS]),
  'plannedSteps.kind': new Set(STEP_KINDS),
  // The steps a `revise` answer put in place.
  'steps.kind': new Set(STEP_KINDS),
  action: new Set(['tap', 'replaceText', 'swipe', 'wait', 'type', 'scroll', 'back', 'tapAt']),
  'action.direction': DIRECTIONS,
  // A driven scroll's, or a target search's, direction.
  direction: DIRECTIONS,
  decidedBy: new Set(['script', 'jev', 'claude']),
  actPath: new Set(['back-button', 'edge-swipe', 'back-key', 'scroll-within', 'screen-middle']),
  // A checkpoint's status, or a `preflight` event's.
  status: new Set(['passed', 'failed', 'inconclusive', 'ok', 'missing']),
  failure: new Set(['exit', 'timeout', 'spawn', 'cleanup']),
  verdict: new Set(['passed', 'failed', 'inconclusive']),
  phase: new Set(['prepare', 'observe', 'decide', 'act', 'wait', 'budget', 'reobserve', 'cleanup', 'run', 'handback', 'preflight']),
  model: new Set(['jev-1.13.0']),
  platform: new Set(PLATFORMS),
};
const errorCodes: ReadonlySet<string> = new Set(Object.keys(REASON_CODES));
protocolValues.code = errorCodes;
// A verdict's or error's reason code, or a `handback` event's pause reason.
protocolValues.reason = new Set([...errorCodes, ...Object.keys(PAUSE_REASON_TEXT)]);
protocolValues.bridgeVersion = new Set([BRIDGE_VERSION]);
protocolValues.jevModel = protocolValues.model!;
protocolValues.projectionRule = new Set(Object.values(PROJECTION_RULES));
const identifierParents = new Set(['plannedSteps', 'assertions', 'steps']);
// Maps whose keys come from the script or from Jev, not the contract, so a key can carry a typed value
// or the API key and is pseudonymized like an identifier. A new map of that kind belongs here (`assertions`
// is also one, but only where it is a map rather than a list, so it is checked beside this set). The
// "no typed value or API key survives" test in tests/scripted-run.test.ts finds every free-keyed map in the
// script schemas and fails until it plants a secret there, then fails again if this set is missing it.
const dataKeyedMaps = new Set(['probabilities', 'values', 'intentExtras']);

function createRedactor(secrets: string[]): (value: unknown) => unknown {
  const ordered = [...new Set(secrets.filter(Boolean))].sort((a, b) => b.length - a.length);
  const pattern = ordered.length ? new RegExp(ordered.map(secret =>
    secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g') : undefined;
  const text = (input: string) => pattern ? input.replace(pattern, '[REDACTED]') : input;
  const pseudonymKey = randomBytes(32);
  const identifier = (input: string) => ordered.some(secret => input.includes(secret))
    ? `redacted_${createHmac('sha256', pseudonymKey).update(input).digest('hex').slice(0, 32)}` : input;
  const walk = (input: unknown, path: string[] = [], dynamicKeys = false): unknown => {
    if (typeof input === 'string') {
      const field = path.join('.');
      if (protocolValues[field]?.has(input)) return input;
      if (field === 'screenshotPath' && /^screen-\d+\.(jpg|png)$/.test(input)) return input;
      if (field === 'stepId' || (path.at(-1) === 'id' && identifierParents.has(path.at(-2) ?? ''))) return identifier(input);
      return text(input);
    }
    if (Array.isArray(input)) return input.map(item => walk(item, path));
    if (input && typeof input === 'object') {
      return Object.fromEntries(Object.entries(input).map(([key, item]) => [dynamicKeys ? identifier(key) : key,
        typeof item === 'string' && /^(authorization|apiKey|api_key|password|token)$/i.test(key) ? '[REDACTED]' : walk(item, [...path, key],
          dataKeyedMaps.has(key) || (key === 'assertions' && !Array.isArray(item)))]));
    }
    return input;
  };
  return value => walk(value);
}

export function redact(value: unknown, secrets: string[]): unknown {
  return createRedactor(secrets)(value);
}

/** Read a run's report.json, or undefined when the run recorded none (for example, it was interrupted). */
export async function readRunReport(baseDir: string, runId: string): Promise<unknown> {
  try { return JSON.parse(await readFile(join(resolve(baseDir), validateRunId(runId), 'report.json'), 'utf8')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export async function readRunEvents(baseDir: string, runId: string): Promise<RunEvent[]> {
  const text = await readFile(join(resolve(baseDir), validateRunId(runId), 'run.jsonl'), 'utf8');
  const lines = text.split('\n');
  const events: RunEvent[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    let event: RunEvent;
    try { event = JSON.parse(line) as RunEvent; }
    catch {
      // A process interruption can leave only the final record incomplete.
      if (i === lines.length - 1) break;
      throw new Error('Corrupt run log');
    }
    if (event.version !== 1 || event.runId !== runId || event.sequence !== events.length + 1 || !event.data) {
      throw new Error('Invalid run log sequence');
    }
    events.push(event);
  }
  return events;
}

export async function createRunLog(baseDir: string, runId: string, options: { values?: string[] } = {}): Promise<RunLog> {
  const root = resolve(baseDir);
  await mkdir(root, { recursive: true, mode: 0o700 });
  // Evidence holds unredacted screenshots; keep the whole folder out of the app's git repository.
  await writeFile(join(root, '.gitignore'), '# jev-ios-bridge run evidence (screenshots, logs); never commit it\n*\n',
    { flag: 'wx', mode: 0o600 }).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'EEXIST') throw error; });
  const directory = join(root, validateRunId(runId));
  // Exclusive creation prevents accidental resume/overwrite of another run.
  await mkdir(directory, { mode: 0o700 });
  const filename = join(directory, 'run.jsonl');
  const file = await open(filename, 'wx', 0o600);
  await file.close();
  let sequence = 0;
  let queue: Promise<void> = Promise.resolve();
  const secrets = [...(options.values ?? []), process.env.TYPESAFE_API_KEY ?? ''];
  const redactData = createRedactor(secrets);
  return {
    append(type, data) {
      const pending = queue.then(async () => {
        let stored = { ...data };
        if (type === 'step' && typeof data.screenshotPath === 'string') {
          const source = await realpath(data.screenshotPath);
          const imageName = `screen-${sequence + 1}${basename(source).toLowerCase().endsWith('.png') ? '.png' : '.jpg'}`;
          await copyFile(source, join(directory, imageName));
          await chmod(join(directory, imageName), 0o600);
          stored = { ...stored, screenshotPath: imageName };
        }
        const event: RunEvent = {
          version: 1, runId, sequence: sequence + 1, at: new Date().toISOString(), type,
          data: redactData(stored) as Record<string, unknown>,
        };
        const handle = await open(filename, 'a', 0o600);
        try { await handle.writeFile(JSON.stringify(event) + '\n'); await handle.sync(); }
        finally { await handle.close(); }
        sequence++;
      });
      // Return this write's error to its caller, but let the next error/verdict record proceed.
      queue = pending.catch(() => {});
      return pending;
    },
    async read() { await queue; return readRunEvents(root, runId); },
    async writeReport(report) {
      await queue;
      // Write-then-rename, so a reader never sees a partial report.json.
      const temporary = join(directory, 'report.json.tmp');
      await writeFile(temporary, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
      await rename(temporary, join(directory, 'report.json'));
    },
  };
}
