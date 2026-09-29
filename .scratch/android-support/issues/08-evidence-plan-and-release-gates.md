# Evidence plan and release gates for v1.2.0

Type: grilling
Status: resolved
Claimed by: Claude Code (owner session)
Blocked by: 04, 05

## Question

What must be true before v1.2.0 ships?

- Which scripts run on which apps (the Android twin app with its planted failure, `cmp` or `cmp-test`, Settings), with which expected verdicts, one run each.
- What real phones get in v1.2.0: "untested" wording, and the checks to run once the Xiaomi is free.
- Whether iOS regressions are re-checked (the three benchmark scripts), and contract tests.
- A clean install of the plugin and tarball on a Mac with the Android SDK, and what the quickstart walkthrough covers.
- **Speed:** whether v1.2.0 sets a speed target or only reports the numbers. Measured: a capture takes 0.4–0.8 s, the first capture after an action 0.55–0.72 s, and typing 100 characters 1.2–3.1 s.
- **Android 12:** which runs repeat on the `jev-actions-api31` emulator, and a non-English typing check (for example Vietnamese text in the twin app or a probe field).

## Answer

Resolved 2026-09-29 with the owner; every recommendation accepted. Modelled on the v1.0.0 and v1.1.0 release checks (`docs/releases/`). Evidence goes to `spikes/benchmarks/results/v1.2.0/`, as for 1.0.

1. **Android scripts, one run each on `Medium_Phone_API_36.1` (Android 16):**

   | Script | App | Exercises | Expected |
   | --- | --- | --- | --- |
   | twin-fail | `dev.jevbridge.diagnostic` | Add Apple and Bread, complete, claim `Total: $5` (the planted bug shows $3) | failed |
   | twin-pass | twin | True claims: `Selected: Apple, Bread`, `Order complete` | passed |
   | twin-ambiguous | twin | A planted guard that matches two elements | inconclusive |
   | cmp-number-input | the owner's `cmp` app | Replace text, type into the empty placeholder field, claim the formatted value | passed |
   | cmp-list-swipe | `cmp` | `swipeWithin` on the Compose million-row list, claim a later row is visible | passed |
   | settings-search | Settings | Type into a classic field, open Display, claim Dark theme is off | passed |

2. **Android 12 (`jev-actions-api31`, API 31):**
   - twin-fail;
   - settings-search, typing `Tiếng Việt` checked by a guard (the non-English typing gate);
   - cmp-number-input, if `cmp` installs on API 31.
3. **Crashes and freezes:**
   - One manual twin-pass run with `adb shell am crash dev.jevbridge.diagnostic` sent partway through. Expected: `APP_EXITED`, the crash in the log pane, and the pane closing cleanly.
   - `APP_NOT_RESPONDING` is covered by tests fed the recorded event lines in `findings/06-assets/`, not by a live run. The twin app gains no freeze button.
4. **Cleanup gate:** after every Android run, no mobilecli daemon, no on-device `DeviceServer`, no `adb forward`, and no device lock remain. Any leftover fails the release.
5. **iOS regression:**
   - All existing tests pass.
   - Golden files change only for the reason-code and MCP descriptions reworded in "Where Android plugs into the code".
   - One run each of Weather, Contacts, Reminders and the iOS diagnostic app, expecting 1.0's verdicts (Reminders' 0.90 count claim stays accepted as borderline).
6. **Real phones:**
   - The release notes and the limits page say real Android phones are untested.
   - A checklist file for the Xiaomi runs once it's free: twin-fail, settings-search with Vietnamese, the Xiaomi input setting, and the cleanup check.
   - Problems found there go into 1.2.1.
7. **Install and quickstart:**
   - A fresh plugin install on this Mac with a throwaway `CLAUDE_CONFIG_DIR`, set up for Android only (no simulator UDID); the server must start.
   - The quickstart's new Android section (twin-fail on the emulator through `/test-android`) works as written.
   - The tarball install reports 1.2.0.
8. **Speed and Jev:**
   - Speed is reported only: per-script durations, capture and settle times, and typing speed.
   - No new Jev corpus. A golden test proves the production renderer emits exactly the text judged in "What Jev sees on Android, and the 10-screen check".
   - A script that misses its expected verdict gets a diagnosis, a fix and one rerun, never a re-roll.
