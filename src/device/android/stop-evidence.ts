import type { AdbResult } from './adb.js';
export type RecordedAdbCommand = {
  host: import('../admission.js').OwnerProcess;
  serial: string;
  shellWords: string[];
};
export type AdbStopObservation =
  | { kind: 'stopped'; command: RecordedAdbCommand; processList: AdbResult }
  | { kind: 'unproven'; reason: 'host-alive' | 'host-reused' | 'host-unknown' | 'device-unavailable' |
      'unsupported-command' | 'malformed-process-list' | 'matching-process' | 'ambiguous-process' };
export type AdbStopProbe = {
  hostState: (host: RecordedAdbCommand['host']) => Promise<'exited' | 'alive' | 'reused' | 'unknown'>;
  revalidate: (serial: string) => Promise<void>;
  processList: (serial: string) => Promise<AdbResult>;
};

export async function inspectAdbStop(command: RecordedAdbCommand, probe: AdbStopProbe): Promise<AdbStopObservation> {
  const state = await probe.hostState(command.host);
  if (state !== 'exited') return { kind: 'unproven', reason: `host-${state}` };
  // Other adb commands may delegate to a differently named service or process. They need a qualified match.
  if (!['sleep', '/system/bin/sleep'].includes(command.shellWords[0] ?? '') || command.shellWords.length !== 2 ||
    !/^\d+(?:\.\d+)?$/.test(command.shellWords[1] ?? '')) return { kind: 'unproven', reason: 'unsupported-command' };
  let processList: AdbResult;
  try {
    await probe.revalidate(command.serial);
    processList = await probe.processList(command.serial);
  } catch { return { kind: 'unproven', reason: 'device-unavailable' }; }
  return adbDeviceStop(command, processList);
}

export function adbDeviceStop(command: RecordedAdbCommand, processList: AdbResult): AdbStopObservation {
  if (processList.exitCode !== 0 || processList.stderr.trim()) return { kind: 'unproven', reason: 'device-unavailable' };
  const lines = processList.stdout.trim().split(/\r?\n/);
  if (!processList.stdout.endsWith('\n') || processList.stdout.includes('\0') ||
    !/^\s*PID\s+NAME\s+ARGS\s*$/.test(lines[0] ?? '') || lines.length < 2) {
    return { kind: 'unproven', reason: 'malformed-process-list' };
  }
  if (!['sleep', '/system/bin/sleep'].includes(command.shellWords[0] ?? '') || command.shellWords.length !== 2 ||
    !/^\d+(?:\.\d+)?$/.test(command.shellWords[1] ?? '')) return { kind: 'unproven', reason: 'unsupported-command' };
  const program = command.shellWords[0]!;
  const basename = (word: string) => word.slice(word.lastIndexOf('/') + 1);
  const expected = [basename(program), ...command.shellWords.slice(1)].join(' ');
  const candidates: string[] = [];
  const pids = new Set<number>();
  for (const line of lines.slice(1)) {
    const match = /^\s*(\d+)\s+(\S+)\s+(.+)$/.exec(line);
    if (!match || !Number.isSafeInteger(Number(match[1])) || Number(match[1]) < 1 ||
      pids.has(Number(match[1])) || line.includes('...')) return { kind: 'unproven', reason: 'malformed-process-list' };
    pids.add(Number(match[1]));
    const name = match[2]!;
    const words = match[3]!.trim().split(/\s+/);
    if (basename(name) === basename(program) || words.some(word => basename(word) === basename(program))) {
      candidates.push([basename(words[0]!), ...words.slice(1)].join(' '));
    }
  }
  if (candidates.length) return { kind: 'unproven', reason: candidates.length === 1 && candidates[0] === expected
    ? 'matching-process' : 'ambiguous-process' };
  return { kind: 'stopped', command, processList };
}
