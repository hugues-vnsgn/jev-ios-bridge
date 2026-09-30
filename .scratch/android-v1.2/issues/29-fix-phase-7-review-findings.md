# Phase 7: fix the whole-branch review findings

Status: claimed
Claimed by: claude-issue-29
Blocked by: none

Spec: [../spec.md](../spec.md), "Phase 7", and Issues 23 to 25 with their comments. A two-axis review of phase 7 (`agent/android-v1.2-phase6...agent/android-v1.2-phase7`) found the items below. Docs, tests and evidence scripts only. Change no `src/` file.

## Wrong statements (the code wins)

1. **P1, `10-limits.md`:** "An upper-case copy of a value isn't masked, in the log file or the log pane, as on iOS." The Android log file masks nothing: `logcat.ts` points adb's stdout straight at it, and `09-data-handling.md` says so. Limit the line to the log pane and `run.jsonl`. Also check every page for any other claim that a log file is masked.
2. **P2, `09-data-handling.md` on intent extras:** "or the value of a key named like `password` or `token`". The code masks only exact key names, case-insensitive: `authorization`, `apiKey`, `api_key`, `password`, `token` (`src/log/index.ts`). Say exactly that, and say that keys such as `authToken` are kept in clear.
3. **P2, "no look at other connected devices"** (`09`) and "it doesn't read other connected devices" (`docs/releases/v1.2.0.md`). When a script names an AVD, the bridge lists devices (`adb devices -l`) and reads each running emulator's AVD name (`ro.boot.qemu.avd_name`). Say what it reads: the device list and each emulator's AVD name, nothing else. mobilecli's own reads don't apply, because the bridge never runs it.
4. **P3, `docs/architecture.md`:** the module is the file `src/capture.ts`, not `src/capture`.
5. **P3, the quickstart's Android section:** `adb` and `emulator` aren't on the PATH after an Android Studio install. Give the full paths (`~/Library/Android/sdk/platform-tools/adb`, `~/Library/Android/sdk/emulator/emulator`), or one line that adds both to the PATH.
6. **P3, `03-identifiers.md`:** an empty field shows its hint as `placeholder` only when it has no content description (`mapping.ts`). Say so.

## Consistency

7. **"lock" to "device lease"** (CONTEXT.md: avoid "lock"):
   - **What changes:** new and edited text in `06-running.md` and `08-troubleshooting.md` says "device lease". The heading "Cancelling and the device lock" becomes "Cancelling and the device lease". Update every link and anchor to it, and the docs test's anchor check.
   - **What stays:** "lock file", for the file on disk, and the frozen iOS message "is locked by".
8. **`10-limits.md`'s speed table:**
   - replace the `cmp-list-swipe` row with `settings-list-swipe`, which stands in for it (Issue 25);
   - split "settings-search … (Vietnamese)" into `settings-search` (Android 16) and `settings-search-vi` (Android 12).

   Check the release notes' script count and names against `spikes/benchmarks/scenarios/android-*.json`.
9. **"non-ASCII", not "non-English",** wherever the clipboard is meant. English with a curly quote goes through the clipboard too. Keep "non-English" only where the point is Jev's language promise.
10. **One name for a foreign agent in the guide:** "another tool's UI-automation agent" (a foreign agent) on first use on a page, and "foreign agent" after that.
11. **Repeated explanations.** The clipboard caveat, "never runs mobilecli", "tried only on Apple silicon" and the settle rule each get one full home (`09`, `12`, `10` and `12` or `08`). Elsewhere, one short sentence and a link. Keep what the quickstart needs inline.
12. **`02-prepare-your-app.md`:** move the Android note out from under "## A simulator of its own" into its own short section, or link it to `12-android-setup.md`.
13. **Phones:** the release notes and `package.json`'s description mustn't drop phones. Say "emulator or phone (phones untested)", as the other pages do.
14. **`11-stability.md`:** tighten "Everything here is an addition: … Only the one-line descriptions … were reworded; their meaning is the same", and don't repeat the CHANGELOG's "Changed".

## Evidence scripts and tests

15. **`tests/android-evidence-scripts.test.ts`** globs `spikes/benchmarks/scenarios/android-*.json` plus the example, rather than keeping a hand-written list. It asserts that there are seven.
16. **`android-cmp-number-input.json`'s precondition:** replace "Build ~/Codes/cmp as it is" with "the owner's Compose Multiplatform sample app (`cmp`, package `org.example.project`), built as it is", and keep the build command.

## Recorded, no change

- The phase 8 placeholders (`_[phase 8]_`, `<!-- phase 8: … -->`) stay until phase 8 fills them.
- The two script deviations in Issue 25 (the list swipe, and the empty-field typing) wait for the owner's decision. They're named in the PRs.

## Acceptance

- `npm run check` passes. `unslop` goes over every page touched.
- No `src/` file and no golden file changes. No device is touched.

## Comments

### 2026-09-30, claude-issue-29: built

**Commits:** `60019d2` (claim), `85e4346` (the fixes), `0966532` (review fixes). No `src/` or golden file changed, and no device was touched.

**What changed, per item:**
1. `10-limits.md`: the upper-case line now names only the log pane and `run.jsonl`. No other page claimed that a log file is masked.
2. `09`: names exactly `authorization`, `apiKey`, `api_key`, `password` and `token` (case doesn't matter), and says `authToken` is kept in clear.
3. `09` and the release notes list what the bridge reads about other devices: `adb devices -l`, `adb forward --list` (it keeps only the run's device), and `ro.boot.qemu.avd_name` on each running emulator when the name isn't a listed serial. The spec review found the forward listing (`forwardsOn`) and the wider AVD-read condition in `driver.ts`, so this goes beyond the Issue's "device list and each emulator's AVD name, nothing else", because the code wins.
4. `docs/architecture.md`: `src/capture.ts`. The other rows leave off the extension; I followed the Issue.
5. Quickstart: a one-line `export PATH=…` for `platform-tools` and `emulator`.
6. `03`: the hint shows as `placeholder` only without a content description. A field with a content description shows it as `label` and has no `placeholder`.
7. The heading is now "Cancelling and the device lease" and the link in 08 follows it. Phase 7's edited bullet in 06 says "lease". The older iOS lines ("the lock stays", 08's "the lock was kept") and reason-codes' frozen `UI_ACTION_UNCONFIRMED` wording are unchanged, because the Issue scopes this to new and edited text. Both reviewers noted that 06's bullet list now mixes the two words. **Owner decision:** change those three older bullets too, or keep them.
8. Speed table: `settings-list-swipe`, `settings-search` (Android 16) and `settings-search-vi` (Android 12). The release notes now name all six Android 16 scripts and `settings-search-vi`.
9. "Non-ASCII" in 04, 09 (heading), 10, `script-format.md`, the CHANGELOG and the release notes. "Non-English" stays only where the point is Jev's language promise.
10. The first mention on a guide page is "another tool's UI-automation agent (a foreign agent)", then "foreign agent" (06, 08, 10, 12). The CHANGELOG and release notes aren't guide pages and are unchanged.
11. Homes: clipboard in 09 (04 and 10 link to it; `script-format.md` keeps its full text by the owner's ruling), "never runs mobilecli" in 12 (09 links to it), Apple silicon in 10 (the quickstart links to it), and the settle rule in 12 (06 and 10 link to it; 02 and 08 already did).
12. `02`: a new "## An Android device of its own" section.
13. The release notes and `package.json` say "emulator or phone (phones untested)". **Deviation:** I also changed `plugin/plugin.json`'s description, which had the same sentence, so the two stay alike. The CHANGELOG says both descriptions match.
14. `11`: now "1.2 adds Android and changes nothing above", followed by a link to the CHANGELOG. It no longer restates "Changed".
15. The evidence-script test globs `android-*.json`, adds the example, and asserts there are seven.
16. The cmp precondition text was replaced as given, and the build command kept.

**Tests added:**
- `tests/docs.test.ts`: 12 tests, one each for items 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12 and 13.
- `tests/android-evidence-scripts.test.ts`: the count of seven; a no-home-path check in each script's test; and the cmp wording.
- Changes to existing tests: one test title that phase 7 added now says non-ASCII. No test from before `b4ede43` changed.

**Gate:** `npm run check` passed with 554 of 554 tests at `0966532`. The log is `$TMPDIR/implement-phase7-29-check.log`. `unslop` went over every changed line: the checker found nothing on them, and I tightened two sentences by hand.

**Review (`/code-review` against `38138be`):**
- Standards: no hard violations. I fixed the test weaknesses (a vacuous prepare-page check, a phones check that depended on line position, a log-file regex that could misfire, a narrow home-path check, and a stale test name). I left the two separate `readdirSync` filters: each test file keeps its own.
- Spec: nothing missing. The two statements that went beyond the code (items 3 and 6) are fixed. The `plugin.json` change and the extra evidence tests were accepted as reasonable.
