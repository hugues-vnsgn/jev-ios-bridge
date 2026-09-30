/**
 * The app-exit watcher: folds the `am_*` lines of `adb logcat -b events -v threadtime,year` into whether the
 * launched app is still running, and why not (release spec phase 5 items 4 and 6). A pure function of the
 * lines it is fed, so `appRunning()` stays synchronous and tests replay lines recorded on emulators.
 */

import type { AppProblem } from '../../contracts/index.js';
import { threadtimeStamp } from './threadtime.js';

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

/**
 * The events the watcher reads, in the events filter's order, each with the index of its pid field (API 36):
 * - `am_proc_died`: user, pid, process, adj, state;
 * - `am_crash`: pid, user, process, flags, exception, message, file, line, recoverable;
 * - `am_anr`: user, pid, process, flags, reason;
 * - `am_kill`: user, pid, process, adj, reason, pss.
 */
const PID_FIELD: Record<string, number> = { am_proc_died: 1, am_crash: 0, am_anr: 1, am_kill: 1 };

/**
 * The events stream's logcat filter (release spec phase 5 item 4): `am_proc_start` and the events the
 * watcher reads, silencing every other tag.
 */
export const EVENT_FILTER = ['am_proc_start', ...Object.keys(PID_FIELD)].map(tag => `${tag}:I`).concat('*:S');

/** An event the watcher reads, `am_kill : [0,15898,…]`. */
const EVENT = new RegExp(`\\b(${Object.keys(PID_FIELD).join('|')})\\s*: \\[(.*)\\]$`);

/** `strsignal()` text, which a native crash's `am_crash` carries as its message, to the signal's name. */
const SIGNALS: Record<string, string> = {
  'Segmentation fault': 'SIGSEGV', Aborted: 'SIGABRT', 'Bus error': 'SIGBUS', 'Floating point exception': 'SIGFPE',
  'Illegal instruction': 'SIGILL', 'Trace/breakpoint trap': 'SIGTRAP', 'Bad system call': 'SIGSYS',
};

type Seen = { tag: string; pid: string; fields: string[]; expected: boolean };
type Exit = { note: string; expected: boolean };

/**
 * Watch one launch of `package`. `startTime` is the device time, in epoch seconds with milliseconds, the
 * streams started from, and `utcOffsetMinutes` the device's UTC offset: a line stamped before it is ignored,
 * so a crash logcat replays from an earlier run can't mark this one exited.
 */
export function createExitWatch(options: { package: string; startTime: number; utcOffsetMinutes: number }): AppExitWatch {
  const startMs = Math.round(options.startTime * 1000);
  // Only events naming the package or the launched pid are kept, so the list stays short; they're folded when
  // asked, so one seen before launched() still counts once the pid is known.
  const seen: Seen[] = [];
  let pid: number | undefined;
  let expecting = false;
  let ended = false;

  const fold = () => {
    let exit: Exit | undefined;
    let frozen = false;
    for (const { tag, pid: eventPid, fields, expected } of seen) {
      if (tag === 'am_crash' && fields[4] === 'Native crash' && fields[2] === options.package) {
        // Its pid is system_server's, not the app's, so it matches by package alone.
        exit = { note: nativeCrashNote(fields), expected: false };
      } else if (pid !== undefined && eventPid === String(pid)) {
        if (tag === 'am_crash') {
          if (fields[2] === options.package) exit = { note: crashNote(fields), expected: false };
        } else if (tag === 'am_anr') frozen = true;
        else if (tag === 'am_kill') exit = { note: killNote(fields[4] ?? ''), expected };
        else exit = { note: 'exited', expected };
      }
      if (exit) break;
    }
    return { exit, frozen };
  };

  return {
    feed(raw) {
      if (ended) return;
      const at = lineEpochMs(raw, options.utcOffsetMinutes);
      if (at === undefined || at < startMs) return;
      const event = raw.match(EVENT);
      if (!event) return;
      const [, tag, list] = event as [string, string, string];
      const fields = list.split(',');
      const eventPid = fields[PID_FIELD[tag]!]!;
      if (fields[2] === options.package || (pid !== undefined && eventPid === String(pid))) {
        seen.push({ tag, pid: eventPid, fields, expected: expecting });
      }
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
      if (exit && !exit.expected) return { code: 'APP_EXITED', note: exit.note };
      // A freeze seen before the bridge's own stop still counts.
      return frozen ? { code: 'APP_NOT_RESPONDING', note: 'not responding' } : undefined;
    },
  };
}

/** Epoch milliseconds of a line's local stamp, or `undefined` when it has none or it isn't a real time. */
function lineEpochMs(raw: string, utcOffsetMinutes: number): number | undefined {
  const stamp = threadtimeStamp(raw);
  if (!stamp) return undefined;
  const local = Date.UTC(stamp.year, stamp.month - 1, stamp.day, stamp.hour, stamp.minute, stamp.second, stamp.millisecond);
  const written = `${stamp.date}T${stamp.time}`;
  if (new Date(local).toISOString().slice(0, 23) !== written) return undefined;
  return local - utcOffsetMinutes * 60_000;
}

/** An `am_kill` whose reason starts `stop ` is a force-stop, as `am force-stop` logs it. */
function killNote(reason: string): string {
  return /^stop /.test(reason) ? 'force-stopped by another process' : 'killed';
}

/**
 * The note names the exception's class (the innermost, for a nested one) and where it was thrown, never the
 * message, which is the app's own text and may hold a script value. The message may hold commas too, so the
 * file and line are read from the end.
 */
function crashNote(fields: string[]): string {
  const exception = fields[4] ?? '';
  const [file, line] = fields.slice(-3, -1);
  const innermost = exception.slice(Math.max(exception.lastIndexOf('.'), exception.lastIndexOf('$')) + 1);
  const name = /^[\w$.]+$/.test(exception) ? innermost : '';
  const known = file && file !== 'unknown' && /^[\w$.-]+$/.test(file) && /^\d+$/.test(line ?? '');
  const where = known ? ` at ${file}:${line}` : '';
  return name ? `crashed: ${name}${where}` : 'crashed';
}

/** A native crash's message is the system's `strsignal()` text, never the app's; the note names its signal. */
function nativeCrashNote(fields: string[]): string {
  const signal = fields[5] ?? '';
  // Only a known text is named, so no field text ever reaches the note unmapped.
  return Object.hasOwn(SIGNALS, signal) ? `native crash: ${SIGNALS[signal]!}` : 'native crash';
}
