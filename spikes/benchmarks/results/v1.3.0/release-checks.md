# v1.3.0 release checks

Two sets of live runs on public apps. One run per check. Evidence folders (`run.jsonl`, `report.json`, screenshots) stay on the machine that ran them, under `~/Codes/eval-apps/live-checks/`.

- **Devices:** iOS simulator `jev-drives-eval`, an iPhone 17 on iOS 26.4 (Xcode 26.4.1). Android emulator `Medium_Phone_API_36.1` (Android 16), cold-booted on a private adb server.
- **Apps:** a test copy of the Kodeco course app ReadMe (`com.hugues.ReadMe`), and ListMaker (`com.kodeco.android`, debug build).

## 1. First live checks, on the build before the PR #36 review fixes

Build `a07d6d7`, 2026-10-02. Claude (`claude -p --model claude-opus-5-5`, the bridge's MCP server only) wrote each driven script from a prompt, ran it, and answered the pauses. Claude cost is the Claude Code client's estimate at API prices.

| # | Check | Verdict | Actions script / Jev / Claude | Hand-backs | Jev decisions (input tokens) | Claude cost | Run time |
|---|---|---|---|---|---|---|---|
| 1 | iOS version 1 script, CLI | passed | 1 / none / none | none | none (1,498 at the checkpoint) | none | 7.4 s |
| 2 | iOS driven: open a book | passed | 0 / 1 / 0 | none | 2 (6,999) | $0.26 | 9.3 s |
| 3 | iOS driven, destructive: delete a book | passed | 0 / 0 / 4, then `done` | 5 × `DESTRUCTIVE_STEP` | 4 (24,384) | $0.90 | 64.4 s |
| 4 | Android `test_write`, no preflight | passed | 0 / 0 / 3, and 1 search scroll | `NONE_FITS`, 2 × `NO_PREFLIGHT` | 5 (5,204) | $0.44 | 25.4 s |
| 5 | Android `test_write`, preflight passed | passed | 0 / 1 / 2, and 2 search scrolls | `NONE_FITS`, `LOW_CONFIDENCE` | 5 (5,229) | $0.43 | 22.0 s |
| 6 | Android scroll to a list, then back | inconclusive (`ASSERTION_UNCERTAIN`) | 0 / 1 / 1, and 2 search scrolls | `LOW_CONFIDENCE` | 5 (9,569) | $0.53 | 14.6 s |
| 6b | the same, with concrete claims | passed | 0 / 1 / 1, and 2 search scrolls | `LOW_CONFIDENCE`, answered `back` | 5 (9,634) | $0.48 | 13.6 s |
| 7 | driven script with the switch off | `DRIVEN_NOT_ENABLED`, exit 3 | none | none | none | none | 0 s |

- **Jev's share, counted from the run logs of checks 2 to 6b:** Jev carried out 4 of the 15 device actions and Claude 11, and the bridge's target search made 7 scrolls. Without Claude's 6 actions that happen by design (4 in a destructive step, 2 without a preflight), Jev did 4 of 9. Jev ended 9 of the 10 `do` steps by its own done check.
- **Where Jev fell short:** three hand-backs were right picks just under the floor: `type` at 0.83 against the `test_write` floor of 0.90, and the in-app Back icon at 0.78 and 0.74. Two were a button Jev didn't match to the step: ListMaker's "Add a new task icon" for creating a list. In check 3, Jev's picks matched two of Claude's taps, but a destructive step never lets Jev act.
- **Check 6** failed on its claim, not on the run: "The List Maker home screen is showing its lists" scored 0.85. 6b used concrete claims (0.95 and 0.94).
- **Check 5:** with a passed preflight, Jev made the write itself: it tapped Create at 0.94.
- **Check 1:** the version 1 run's report and log had no driven fields, and the simulator window came to the front.
- **Method note:** in checks 2 to 6 the sessions could also run shell commands. They used them to read the docs, and in check 6 to look around the emulator before submitting the script. Driven runs restart the app, so the verdicts stand. Check 6b had no shell.

## 2. Re-check on the release code

`main` at `efe98cf` (PR #36 merged), 2026-10-02, iOS simulator only. A small MCP client played Claude's part over the real `start_scenario`, `get_report` and `resolve_step` tools, so each answer was fixed in advance. The Android emulator was busy with other work, so the Android side of the last fixes was checked through the real Android driver against a fake device instead (`tests/driven-android-pause.test.ts`).

| # | Check | Result | Run |
|---|---|---|---|
| R1 | version 1 script, CLI | **passed**, `ALL_CHECKPOINTS_PASSED`, 8.4 s. Jev read 1,498 input tokens, as in check 1, and the report has no driven fields. | `35797d0c-8aba-431f-8ff7-baef8f9683ae` |
| R2 | Claude's tap after a pause, screen unchanged | **passed**. The pause was on capture 4. After the answer, the bridge captured again (capture 5) and tapped on it. The action names its target `button "Bosch, Laurinda Dixon, Earthily Delightful."`. | `f250f4f1-3262-43a0-996a-cae58dd81729` |
| R3 | Settings brought to the front during the pause, then Claude answers the same tap | **no tap.** The new capture showed Settings, so the step paused again with `SCREEN_CHANGED`. Claude answered `stop`. The run log has no action event. | `d7f9fd56-a161-4013-8438-522cbfb9c499` |
| R4 | Jev drives the same step | **passed**, no pause. Jev tapped at 0.96, then judged the step done at 0.95. 8,491 Jev input tokens, 8.6 s. | `6563ec32-fdc2-4f9b-871a-dda95612e5f2` |
| R5 | driven script with the switch off | `DRIVEN_NOT_ENABLED`, exit 3, under 1 s. No run folder, and the app was not launched. | none |

## 3. The packages

Built once from the release branch with `npm run build:plugin` and `npm pack`. These exact files are the ones to publish.

| File | SHA-256 | Check |
|---|---|---|
| `jev-ios-bridge-plugin-1.3.0.zip` (238,424 bytes) | `6654891c31922bd6ac9dbb8a2ce7b9660eb6ee7348668830ab93d90fc3a07a04` | Unzipped and installed as Claude Code does (`npm ci --ignore-scripts`): `--version` prints `1.3.0`. Its MCP server lists `start_scenario`, `get_report` and `cancel_run`, plus `resolve_step` only with `JEV_EXPERIMENTAL_DRIVEN=1`. `claude plugin validate` passes the plugin and `marketplace.json`. |
| `jev-ios-bridge-1.3.0.tgz` (176,127 bytes) | `2d24039341c82d224d15184b56f7afa172a72b447d3fbc858d14a5f18348fb46` | `npm install` into an empty project, then `npx jev-ios-bridge --version` prints `1.3.0`. |

Neither file holds a key, a run's evidence, or a local path.
