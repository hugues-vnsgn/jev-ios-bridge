/**
 * The stamp that opens every line of `adb logcat -v threadtime,year`: the device's local date and time, with
 * no zone, `2026-09-28 23:22:52.533`. One parser for the log pane's line parser and the app-exit watcher.
 */
const STAMP = /^((\d{4})-(\d\d)-(\d\d)) ((\d\d):(\d\d):(\d\d)\.(\d{3}))\s+/;
/** A line's stamp, or `undefined` when it doesn't open with one. */
export function threadtimeStamp(raw) {
    const stamp = STAMP.exec(raw);
    if (!stamp)
        return undefined;
    const [, year, month, day, , hour, minute, second, millisecond] = stamp.slice(1).map(Number);
    return { year: year, month: month, day: day, hour: hour, minute: minute, second: second, millisecond: millisecond,
        date: stamp[1], time: stamp[5], rest: raw.slice(stamp[0].length) };
}
