/**
 * The stamp that opens every line of `adb logcat -v threadtime,year`: the device's local date and time, with
 * no zone, `2026-09-28 23:22:52.533`. One parser for the log pane's line parser and the app-exit watcher.
 */

export interface ThreadtimeStamp {
  year: number; month: number; day: number; hour: number; minute: number; second: number; millisecond: number;
  /** The time of day as written, `23:22:52.533`. */
  time: string;
  /** The line after the stamp and the whitespace that follows it. */
  rest: string;
}

const STAMP = /^(\d{4})-(\d\d)-(\d\d) ((\d\d):(\d\d):(\d\d)\.(\d{3}))\s+/;

/** A line's stamp, or `undefined` when it doesn't open with one. */
export function threadtimeStamp(raw: string): ThreadtimeStamp | undefined {
  const stamp = STAMP.exec(raw);
  if (!stamp) return undefined;
  const [year, month, day, , hour, minute, second, millisecond] = stamp.slice(1).map(Number) as number[];
  return { year: year!, month: month!, day: day!, hour: hour!, minute: minute!, second: second!, millisecond: millisecond!,
    time: stamp[4]!, rest: raw.slice(stamp[0].length) };
}
