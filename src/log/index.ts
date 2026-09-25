import { mkdir, readFile, open, copyFile, chmod, realpath } from 'node:fs/promises';
import { createHmac, randomBytes } from 'node:crypto';
import { resolve, join, basename } from 'node:path';
import type { RunEvent, RunLog } from '../contracts/index.js';

export function validateRunId(runId: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(runId)) throw new Error('Invalid run id');
  return runId;
}

const protocolValues: Record<string, ReadonlySet<string>> = {
  mode: new Set(['scripted']),
  kind: new Set(['action', 'wait', 'checkpoint', 'tap', 'type', 'replaceText', 'swipe',
    'stop-goal', 'stop-blocked', 'none']),
  'plannedSteps.kind': new Set(['action', 'wait', 'checkpoint']),
  action: new Set(['tap', 'type', 'replaceText', 'swipe', 'wait']),
  'action.kind': new Set(['tap', 'type', 'replaceText', 'swipe', 'wait',
    'stop-goal', 'stop-blocked', 'none']),
  'action.direction': new Set(['up', 'down', 'left', 'right']),
  status: new Set(['passed', 'failed', 'inconclusive']),
  verdict: new Set(['passed', 'failed', 'inconclusive']),
  phase: new Set(['prepare', 'observe', 'decide', 'act', 'wait', 'budget', 'reobserve', 'cleanup', 'run']),
  model: new Set(['jev-1.13.0']),
};
const errorCodes = new Set([
  'ABORTED', 'ACTION_FAILED', 'AUTH', 'CANCELLED', 'CLEANUP_FAILED', 'CLI_ERROR',
  'DEVICE_BUSY', 'DEVICE_ERROR', 'ELEMENT_REF_NOT_FOUND', 'EMPTY_CAPTURE', 'EMPTY_SCREEN',
  'EXECUTION_ERROR', 'GUARD_AMBIGUOUS', 'GUARD_FORBIDDEN', 'GUARD_MISSING',
  'INVALID_CAPTURE', 'INVALID_DEVICE', 'INVALID_ENVELOPE', 'INVALID_INPUT',
  'INVALID_JSON', 'INVALID_JUDGMENT', 'INVALID_SELECTOR', 'MALFORMED_RESPONSE',
  'MISSING_VALUE', 'NETWORK', 'NO_DEVICE', 'RATE_LIMIT', 'READ_FAILED', 'REQUEST_BUDGET',
  'SCREEN_CHANGED', 'SCRIPT_INCOMPLETE', 'SERVICE', 'SNAPSHOT_EXPIRED',
  'SNAPSHOT_TRUNCATED', 'STATE_BUDGET', 'STEP_LIMIT', 'TARGET_AMBIGUOUS',
  'TARGET_MISSING', 'TARGET_UNAVAILABLE', 'TERMINAL_ACK_MISSING', 'TIMEOUT',
  'TRUNCATED', 'UI_ACTION_UNCONFIRMED', 'UNKNOWN', 'UNSUPPORTED_ACTION',
  'UNSUPPORTED_LEADING_DASH_TEXT', 'WAIT_TIMEOUT', 'WALL_LIMIT',
]);
protocolValues.code = errorCodes;
protocolValues.reason = new Set([...errorCodes, 'ALL_CHECKPOINTS_PASSED', 'ASSERTION_FALSE', 'ASSERTION_UNCERTAIN']);
const identifierParents = new Set(['plannedSteps', 'checkpoints', 'assertions', 'options']);

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
      if (field === 'stepId' || field === 'checkpointId' || field === 'judgment.choice' ||
          (path.at(-1) === 'id' && identifierParents.has(path.at(-2) ?? ''))) return identifier(input);
      return text(input);
    }
    if (Array.isArray(input)) return input.map(item => walk(item, path));
    if (input && typeof input === 'object') {
      return Object.fromEntries(Object.entries(input).map(([key, item]) => [dynamicKeys ? identifier(key) : key,
        typeof item === 'string' && /^(authorization|apiKey|api_key|password|token)$/i.test(key) ? '[REDACTED]' : walk(item, [...path, key],
          key === 'probabilities' || key === 'values' || (key === 'assertions' && !Array.isArray(item)))]));
    }
    return input;
  };
  return value => walk(value);
}

export function redact(value: unknown, secrets: string[]): unknown {
  return createRedactor(secrets)(value);
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
  };
}
