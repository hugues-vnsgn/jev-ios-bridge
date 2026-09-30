# Phase 7: fix the whole-branch review findings

Status: ready-for-agent
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
