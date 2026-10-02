/**
 * What start mode "attach" reads off a device instead of relaunching the app (Issue 11): on Android which app is
 * resumed. iOS refuses attach (Issue 14): MobileBuildMCP 2.7.1 can't tell which app is in front.
 */

/**
 * The package of the resumed activity in `dumpsys activity activities`: `topResumedActivity=` (API 29 and later),
 * else the first `ResumedActivity:` or `mResumedActivity:` line. Undefined when nothing is resumed.
 */
export function resumedPackage(activities: string): string | undefined {
  const record = String.raw`ActivityRecord\{\S+ u\d+ ([^\s/]+)/`;
  return new RegExp(String.raw`topResumedActivity=${record}`).exec(activities)?.[1]
    ?? new RegExp(String.raw`ResumedActivity:\s*${record}`).exec(activities)?.[1];
}
