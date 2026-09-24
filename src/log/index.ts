import { mkdir, readFile, open, copyFile, chmod, realpath } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import type { RunEvent, RunLog } from '../contracts/index.js';

export function validateRunId(runId: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(runId)) throw new Error('Invalid run id');
  return runId;
}

export function redact(value: unknown, secrets: string[]): unknown {
  const ordered = [...new Set(secrets.filter(Boolean))].sort((a, b) => b.length - a.length);
  const text = (input: string) => ordered.reduce((result, secret) => result.split(secret).join('[REDACTED]'), input);
  const enums: Record<string, readonly string[]> = {
    verdict: ['passed', 'failed', 'inconclusive'], status: ['passed', 'failed', 'inconclusive'],
    'action.kind': ['tap', 'type', 'swipe', 'wait', 'stop-goal', 'stop-blocked', 'none'],
    'action.direction': ['up', 'down', 'left', 'right'], phase: ['prepare', 'observe', 'decide', 'act', 'cleanup'],
  };
  const walk = (input: unknown, path: string[] = [], dynamicKeys = false): unknown => {
    if (typeof input === 'string') {
      // These are generated protocol values, not copies of scenario text. A typed
      // value such as "passed" must not erase the run's recorded verdict.
      if (enums[path.join('.')]?.includes(input)) return input;
      if (path.join('.') === 'screenshotPath' && /^screen-\d+\.(jpg|png)$/.test(input)) return input;
      return text(input);
    }
    if (Array.isArray(input)) return input.map(item => walk(item, path));
    if (input && typeof input === 'object') {
      return Object.fromEntries(Object.entries(input).map(([key, item]) => [dynamicKeys ? text(key) : key,
        typeof item === 'string' && /^(authorization|apiKey|api_key|password|token)$/i.test(key) ? '[REDACTED]' : walk(item, [...path, key],
          key === 'probabilities' || key === 'values' || (key === 'assertions' && !Array.isArray(item)))]));
    }
    return input;
  };
  return walk(value);
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
          data: redact(stored, secrets) as Record<string, unknown>,
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
