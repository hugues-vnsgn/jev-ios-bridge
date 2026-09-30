/**
 * The app-exit watcher: folds the `am_*` lines of `adb logcat -b events -v threadtime,year` into whether the
 * launched app is still running, and why not (release spec phase 5 items 4 and 6). A pure function of the
 * lines it is fed, so `appRunning()` stays synchronous and tests replay lines recorded on emulators.
 */

export type AppProblem = { code: 'APP_EXITED' | 'APP_NOT_RESPONDING'; note: string };
export interface AppExitWatch {
  /** One line of `logcat -b events -v threadtime,year`. */
  feed(raw: string): void;
  /** From `pidof` after `am start -W`; `undefined` when it found none. */
  launched(pid: number | undefined): void;
  /** The bridge is about to force-stop the app itself. */
  expectStop(): void;
  /** The events stream exited on its own. */
  streamEnded(): void;
  /** `undefined` when the watcher can't tell. */
  running(): boolean | undefined;
  problem(): AppProblem | undefined;
}

/** A line's device-local time, `2026-09-28 23:22:52.533`, and an event the watcher reads, `am_kill : [0,15898,…]`. */
const STAMP = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)\.(\d{3})\s/;
const EVENT = /\b(am_crash|am_anr|am_kill|am_proc_died)\s*: \[(.*)\]$/;

/** `strsignal()` text, which a native crash's `am_crash` carries as its message, to the signal's name. */
const SIGNALS: Record<string, string> = {
  'Segmentation fault': 'SIGSEGV', Aborted: 'SIGABRT', 'Bus error': 'SIGBUS', 'Floating point exception': 'SIGFPE',
  'Illegal instruction': 'SIGILL', 'Trace/breakpoint trap': 'SIGTRAP', 'Bad system call': 'SIGSYS',
};

type Seen = { tag: string; fields: string[]; expected: boolean };
type Exit = { note: string; expected: boolean };

/**
 * Watch one launch of `package`. `startTime` is the device time, in epoch seconds with milliseconds, the
 * streams started from, and `utcOffsetMinutes` the device's UTC offset: a line stamped before it is ignored,
 * so a crash logcat replays from an earlier run can't mark this one exited.
 */
export function createExitWatch(options: { package: string; startTime: number; utcOffsetMinutes: number }): AppExitWatch {
  const startMs = Math.round(options.startTime * 1000);
  // Only events naming the package are kept, so the list stays short; they're folded when asked, so one seen
  // before launched() still counts once the pid is known.
  const seen: Seen[] = [];
  let pid: number | undefined;
  let expecting = false;
  let ended = false;

  const fold = () => {
    let exit: Exit | undefined;
    let frozen = false;
    for (const { tag, fields, expected } of seen) {
      if (tag === 'am_crash' && fields[4] === 'Native crash') {
        // Its pid is system_server's, not the app's, so it matches by package alone.
        exit = { note: nativeCrashNote(fields), expected: false };
      } else if (pid !== undefined && fields[tag === 'am_crash' ? 0 : 1] === String(pid)) {
        if (tag === 'am_crash') exit = { note: crashNote(fields), expected: false };
        else if (tag === 'am_anr') frozen = true;
        else if (tag === 'am_kill') exit = { note: /^stop /.test(fields[4] ?? '') ? 'force-stopped by another process' : 'killed', expected };
        else exit = { note: 'exited', expected };
      }
      if (exit) break;
    }
    return { exit, frozen };
  };

  return {
    feed(raw) {
      if (ended) return;
      const at = deviceTime(raw, options.utcOffsetMinutes);
      if (at === undefined || at < startMs) return;
      const event = raw.match(EVENT);
      const fields = event?.[2]!.split(',');
      if (event && fields![2] === options.package) seen.push({ tag: event[1]!, fields: fields!, expected: expecting });
    },
    launched(found) { pid = found; },
    expectStop() { expecting = true; },
    streamEnded() { ended = true; },
    running() {
      if (fold().exit) return false;
      return pid === undefined || ended ? undefined : true;
    },
    problem() {
      const { exit, frozen } = fold();
      if (exit) return exit.expected ? undefined : { code: 'APP_EXITED', note: exit.note };
      return frozen ? { code: 'APP_NOT_RESPONDING', note: 'not responding' } : undefined;
    },
  };
}

/** Epoch milliseconds of a line's local stamp, or `undefined` when it has none or it isn't a real time. */
function deviceTime(raw: string, utcOffsetMinutes: number): number | undefined {
  const stamp = raw.match(STAMP);
  if (!stamp) return undefined;
  const [, year, month, day, hour, minute, second, ms] = stamp.map(Number);
  const local = Date.UTC(year!, month! - 1, day!, hour!, minute!, second!, ms!);
  if (new Date(local).toISOString().slice(0, 23) !== `${stamp.slice(1, 4).join('-')}T${stamp.slice(4, 7).join(':')}.${stamp[7]}`) return undefined;
  return local - utcOffsetMinutes * 60_000;
}

/**
 * `am_crash: [pid, user, process, flags, exception, message, file, line, recoverable]`. The note names the
 * exception's class (the innermost, for a nested one) and where it was thrown, never the message, which is
 * the app's own text and may hold a script value. The message may hold commas too, so the file and line are
 * read from the end.
 */
function crashNote(fields: string[]): string {
  const exception = fields[4] ?? '';
  const [file, line] = fields.slice(-3, -1);
  const name = /^[\w$.]+$/.test(exception) ? exception.slice(Math.max(exception.lastIndexOf('.'), exception.lastIndexOf('$')) + 1) : '';
  const where = file && file !== 'unknown' && /^[\w$.-]+$/.test(file) && /^\d+$/.test(line ?? '') ? ` at ${file}:${line}` : '';
  return name ? `crashed: ${name}${where}` : 'crashed';
}

/** A native crash's message is the system's `strsignal()` text, never the app's. */
function nativeCrashNote(fields: string[]): string {
  const signal = fields[5] ?? '';
  const name = SIGNALS[signal] ?? (/^[A-Za-z][\w ./-]{0,39}$/.test(signal) ? signal : '');
  return name ? `native crash: ${name}` : 'native crash';
}
