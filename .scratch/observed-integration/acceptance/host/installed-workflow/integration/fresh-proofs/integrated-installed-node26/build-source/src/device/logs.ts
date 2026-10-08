import { constants } from 'node:fs';
import { open } from 'node:fs/promises';

/** The last 4 KiB of an app log file, or a bracketed reason it can't be read. Shared by the device drivers. */
export async function readLogTail(path: string): Promise<string> {
  try {
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await file.stat();
      if (!stat.isFile()) return '[unavailable: not a regular file]';
      const length = Math.min(stat.size, 4_096);
      if (length === 0) return '';
      const bytes = Buffer.alloc(length);
      const { bytesRead } = await file.read(bytes, 0, length, stat.size - length);
      return bytes.subarray(0, bytesRead).toString('utf8');
    } finally { await file.close(); }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return `[unavailable: ${code && /^[A-Z0-9_]+$/.test(code) ? code : 'READ_FAILED'}]`;
  }
}
