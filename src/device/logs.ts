import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { masker } from '../logpane/format.js';

/** The last 4 KiB of an app log file, or a bracketed reason it can't be read. Shared by the device drivers. */
export async function readLogTail(path: string): Promise<string> {
  const result = await readTail(path);
  return result.kind === 'read' ? result.text : `[unavailable: ${result.reason}]`;
}

async function readTail(path: string): Promise<{ kind: 'read'; text: string } | { kind: 'unavailable'; reason: string }> {
  try {
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await file.stat();
      if (!stat.isFile()) return { kind: 'unavailable', reason: 'not a regular file' };
      const length = Math.min(stat.size, 4_096);
      if (length === 0) return { kind: 'read', text: '' };
      const bytes = Buffer.alloc(length);
      const { bytesRead } = await file.read(bytes, 0, length, stat.size - length);
      return { kind: 'read', text: bytes.subarray(0, bytesRead).toString('utf8') };
    } finally { await file.close(); }
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined;
    return { kind: 'unavailable', reason: typeof code === 'string' && /^[A-Z0-9_]+$/.test(code) ? code : 'READ_FAILED' };
  }
}

export interface NativeLogSource {
  readonly path: string;
  write(channel: 'stdout' | 'stderr', text: string): void;
  unavailable(reason: 'SOURCE_LOST' | 'SOURCE_ENDED' | 'SOURCE_STOPPED'): void;
  available(): boolean;
  finish(): Promise<void>;
  readTail(): Promise<string>;
}

/** The console and log stream write masked lines into exclusive, private files. */
export async function createNativeLogSource(options: { path: string; values: Record<string, string> }): Promise<NativeLogSource> {
  const file = await open(options.path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  const mask = masker(options.values);
  const pending = { stdout: '', stderr: '' };
  let reason: string | undefined;
  let finished: Promise<void> | undefined;
  let writes = Promise.resolve();
  let queuedBytes = 0;
  const write = (text: string) => {
    const masked = mask(text);
    const bytes = Buffer.byteLength(masked);
    if (queuedBytes + bytes > 1_048_576) { reason = 'BACKPRESSURE'; return; }
    queuedBytes += bytes;
    writes = writes.then(async () => {
      try { await file.writeFile(masked); }
      finally { queuedBytes -= bytes; }
    }).catch(() => { reason = 'WRITE_FAILED'; });
  };
  const flush = () => {
    for (const channel of ['stdout', 'stderr'] as const) {
      if (pending[channel]) write(pending[channel]);
      pending[channel] = '';
    }
  };
  return {
    path: options.path,
    write(channel, text) {
      if (reason || finished) return;
      const joined = pending[channel] + text;
      if (joined.length > 65_536) { reason = 'LINE_TOO_LONG'; pending[channel] = ''; return; }
      const end = joined.lastIndexOf('\n') + 1;
      if (end) write(joined.slice(0, end));
      pending[channel] = joined.slice(end);
    },
    unavailable(why) { if (!reason) { flush(); reason = why; } },
    available() { return reason === undefined && finished === undefined; },
    finish() { return finished ??= (async () => { flush(); await writes; await file.close(); })(); },
    async readTail() {
      await writes;
      if (reason) return `[unavailable: ${reason}]`;
      const result = await readTail(options.path);
      if (result.kind === 'read') return result.text;
      reason = result.reason;
      return `[unavailable: ${reason}]`;
    },
  };
}
