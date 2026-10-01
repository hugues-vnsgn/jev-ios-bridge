import { createServer, type Server, type Socket } from 'node:net';
import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { chmod, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appLabel, isIosApp, type AppIdentity, type AppProblem, type LogSources, type Platform } from '../contracts/index.js';
import { appLine, logcatLine, masker, osLine, type PaneLine } from './format.js';

/** Messages on the pane socket, one JSON object per line. `hello`'s platform picks the header's source lines. */
export type PaneMessage =
  | { type: 'hello'; runId: string; appId: string; platform: Platform; sources: LogSources }
  | ({ type: 'line' } & PaneLine)
  | { type: 'note'; text: string }
  | { type: 'end'; verdict: string; reason: string; evidencePath: string; closeAfterMs?: number };

/** Where a run's pane socket lives. Short enough for the Unix socket path limit; per user on macOS. */
export function paneSocketPath(runId: string): string {
  return join(tmpdir(), `jev-logs-${runId.slice(0, 12)}.sock`);
}

class Follower {
  private position = 0;
  private rest = '';
  constructor(private readonly path: string, private readonly parse: (raw: string) => PaneLine | undefined) {}
  poll(emit: (line: PaneLine) => void): void {
    let descriptor: number;
    try { descriptor = openSync(this.path, 'r'); } catch { return; }
    try {
      const size = fstatSync(descriptor).size;
      if (size < this.position) this.position = 0;
      if (size === this.position) return;
      const buffer = Buffer.alloc(Math.min(size - this.position, 1 << 20));
      const read = readSync(descriptor, buffer, 0, buffer.length, this.position);
      this.position += read;
      const lines = (this.rest + buffer.subarray(0, read).toString('utf8')).split(/\r?\n/);
      this.rest = lines.pop() ?? '';
      for (const raw of lines) { const line = this.parse(raw); if (line) emit(line); }
    } finally { closeSync(descriptor); }
  }
}

export interface LogStream {
  readonly socketPath: string;
  /** The bridge is about to stop the app itself, so the app's exit isn't unexpected. */
  expectStop(): void;
  /** Send the run's outcome to attached panes, then stop serving. */
  finish(end: Omit<Extract<PaneMessage, { type: 'end' }>, 'type'>): Promise<void>;
}

const HISTORY_LIMIT = 5_000;

/**
 * Follow the app's log files (the two MobileBuildMCP writes on iOS, or the app's logcat file on Android), mask
 * the script's values, and serve the lines to panes over a Unix socket that only this user can open. Nothing
 * is written to disk. `appProblem` is the driver's answer to whether the app stopped; the pane notes it once.
 */
export async function startLogStream(options: {
  runId: string; app: AppIdentity; sources: LogSources; values: Record<string, string>;
  pollMs?: number; appProblem?: () => AppProblem | undefined;
}): Promise<LogStream> {
  const socketPath = paneSocketPath(options.runId);
  const mask = masker(options.values);
  const clients = new Set<Socket>();
  const history: string[] = [];
  const send = (message: PaneMessage) => {
    const text = JSON.stringify(message) + '\n';
    if (message.type !== 'hello') {
      history.push(text);
      if (history.length > HISTORY_LIMIT) history.splice(0, history.length - HISTORY_LIMIT);
    }
    for (const client of clients) client.write(text);
  };
  const hello: PaneMessage = { type: 'hello', runId: options.runId, appId: appLabel(options.app),
    platform: isIosApp(options.app) ? 'ios' : 'android', sources: options.sources };
  await unlink(socketPath).catch(() => {});
  const server: Server = createServer(client => {
    clients.add(client);
    client.on('close', () => clients.delete(client));
    client.on('error', () => clients.delete(client));
    client.write(JSON.stringify(hello) + '\n');
    for (const text of history) client.write(text);
  });
  await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(socketPath, done); });
  await chmod(socketPath, 0o600);

  const followers = [
    ...(options.sources.runtime ? [new Follower(options.sources.runtime, raw => appLine(raw))] : []),
    ...(options.sources.os ? [new Follower(options.sources.os, osLine)] : []),
    ...(options.sources.logcat ? [new Follower(options.sources.logcat, logcatLine)] : []),
  ];
  let stopExpected = false;
  let noted = false;
  const problem = () => { try { return options.appProblem?.(); } catch { return undefined; } };
  const tick = () => {
    for (const follower of followers) follower.poll(line => send({ type: 'line', ...line, text: mask(line.text) }));
    if (stopExpected || noted) return;
    const found = problem();
    if (found) {
      noted = true;
      send({ type: 'note', text: mask(found.note) });
    }
  };
  const timer = setInterval(tick, options.pollMs ?? 200);
  let finished = false;
  return {
    socketPath,
    expectStop() { stopExpected = true; },
    async finish(end) {
      if (finished) return;
      finished = true;
      stopExpected = true;
      clearInterval(timer);
      tick();
      send({ type: 'end', ...end });
      // Give attached panes a moment to read the last lines before the socket closes.
      await new Promise(done => setTimeout(done, 200));
      for (const client of clients) client.end();
      await new Promise<void>(done => server.close(() => done()));
      await unlink(socketPath).catch(() => {});
    },
  };
}
