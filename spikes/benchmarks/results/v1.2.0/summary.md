# v1.2.0 release checks (phase 8)

- **Candidate:** most checks ran on the phase 8 branch at `93c6ac7` (`src` tree `904c6c8b64199a27274a02aa1b38a48482610a3c`, the same as phase 7's final commit then).
- **Changed since, and rerun (2026-10-01):** the reviews of PRs #29 to #32 led to Issues 30 and 31, which changed `src` (now tree `aaf924a…`). They touch only failure paths: a wait of up to 1 s for late crash or freeze events after a failed step, stopping the streams when cleanup fails, owning every leftover before the takeover sweep, a stricter takeover identity check, and a masked pane note. Checks 5 and 15 exercise those paths, so they were **rerun once each on the new code** (`eb5c9be`, the same `src` tree). Check 1 was rerun too. The other live checks ran on `93c6ac7`; nothing they exercise changed.
- **Pre-merge deviation:** the release spec says to check the merge commit of phases 1 to 7. Those PRs (#29, #30 and #31) wait for the owner's review, so the checks ran on the branch that holds them all. The code is identical: phase 7 and its review fixes changed no `src/` file. After the merges, rerun check 1 (CI) on the merge commit.
- **Devices:**
  - both emulators ran through the private adb server on port 5099 only, one at a time, with `-no-snapshot-save`, and were shut down afterwards;
  - no phone and no port-5037 command were used;
  - mobilecli ran only for check 14, through the guarded wrapper, with a private home and its daemon stopped afterwards;
  - iOS ran on the dedicated simulator `0E42FDE2-5E09-42D3-9876-9EF0037FCBE7`, which was shut down afterwards.
- **The Jev key** was loaded by path (`node --env-file`), never printed, and a scan found it in no evidence file. The emulator's home screen lists an app the owner keeps local; its name is replaced by `[another app]`.
- **Personal details:** home folder paths in these files show as `~`, the phone's serial as `<serial>`, and the screenshots are cropped or blanked to hide paths and the window title. Run folders (`check-*/runs/`) stay local; [run-excerpts.md](run-excerpts.md) copies their numbers.

| # | Check | Kind | Result | Evidence |
|---|---|---|---|---|
| 1 | `npm run check` and CI | Blocking | **Local: pass**, 540/540 on `93c6ac7`, and 564/564 on the new code. CI passed on #29 to #32 at their latest heads. **Pending:** CI on the merge commit. | [check-01.md](check-01.md) |
| 2 | Golden tests | Blocking | **Pass** (part of 1). Existing entries changed only as the rules allow. The Android renderer emits the 10 judged texts byte for byte. `APP_NOT_RESPONDING` comes from the recorded `probe-anr` event lines. | `tests/golden/`, `tests/android-exit-watch.test.ts` |
| 3 | Android 16 scripts, one run each | Blocking | **Pass.** twin-fail **failed** (0.02); twin-pass **passed** (0.99, 0.98); twin-ambiguous **inconclusive** (`GUARD_AMBIGUOUS`); cmp-number-input **passed** (0.99); settings-list-swipe **passed** (0.99), standing in for cmp-list-swipe (owner accepted, 2026-10-01); settings-search **passed** (0.97). | `check-03/` |
| 4 | Android 12 runs | Blocking | **Pass.** twin-fail **failed** (0.02); settings-search-vi **passed** (`Tiếng Việt` checked by a guard; 0.97); cmp-number-input **passed** (0.99). cmp installed on API 31. | `check-04/` |
| 5 | Crash run | Blocking | **Pass.** `am crash` after the first action: `APP_EXITED`. The pane showed the `FATAL EXCEPTION` stack, the note "crashed: CrashedByAdbException at ActivityThread.java:2513", and "run finished: inconclusive (APP_EXITED)". Rerun on the new code on 2026-10-01 with the same result: the crash was sent after the first action, and the run ended at the third step's observe. | `check-05/`, `check-05/pane-cropped.png` |
| 6 | Cleanup gate after every Android run | Blocking | **Pass.** It was clean after every run in checks 3, 4, 5 and 15, and after check 14's hand clean-up of mobilecli's own agent, which is left running by design. | `*.cleanup.txt`, `check-15/cleanup.txt`, `check-14/hand-cleanup.txt` |
| 7 | iOS regression | Blocking | **Weather passed, Contacts passed, and the diagnostic app failed on the $3 total (0.02), all as expected.** **Reminders was inconclusive:** `counts` scored 0.89 against the 0.90 bound, with the other claims at 0.96 to 0.98. It is the borderline claim 1.0 accepted at 0.90 (0.87 in 0.1.0). The iOS observation text is pinned byte-identical, so this is Jev's run-to-run noise, not a bridge change. It wasn't rerun, because a rerun would be a re-roll. **Pass: the owner accepted it as borderline on 2026-10-01.** The per-claim scores come from the runs' reports, which weren't kept; the committed summaries record each verdict and reason ([run-excerpts.md](run-excerpts.md)). | `check-07/` |
| 8 | Real phones | Blocking (docs only) | **Pass.** The release notes and limits page say phones are untested, and the Xiaomi checklist is written. It wasn't run. | `real-phones/xiaomi-checklist.md` |
| 9 | Plugin install, Android only | Blocking | **Pending the owner:** the owner types the key into Claude Code. | |
| 10 | Quickstart walkthrough | Blocking | **Pending the owner:** it needs the plugin from check 9. | |
| 11 | Tarball install | Blocking | **Pass.** `jev-ios-bridge-1.2.0.tgz` (SHA-256 `c7f5b529…`) installed into an empty project. The CLI and the MCP `serverInfo` both give `1.2.0`, the files match `files`, and `skills/test-android/SKILL.md` is present. `capture --avd NoSuchAvd` exits 3 with `DEVICE_NOT_CONNECTED`. | `check-11/` |
| 12 | Speed | Report-only | A run took 2.7 to 10.9 s, and preparing the device 0.9 to 3.6 s. A tap or swipe took 0.7 to 2.3 s, and replacing a field's text 1.1 to 2.4 s. A step's own settled capture took 0.3 to 2.2 s; a single capture wasn't timed on its own. | `check-12-speed.md`, [run-excerpts.md](run-excerpts.md) |
| 13 | iOS log pane | Report-only | It showed the 1.1 header, the app's output, and "run finished: failed (ASSERTION_FALSE)". No false "app stopped" note. The file paths in the screenshot are blanked. | `check-13/ios-pane-cropped.png` |
| 14 | Foreign agent | Blocking | **Pass.** mobilecli's own agent (pid 11142) was started through the guarded wrapper. twin-pass was refused with `DEVICE_BUSY` in 82 ms, with no `prepared` event, so the app wasn't touched. Afterwards the agent was still running and its forward still there. Both were cleaned up by hand, and mobilecli's daemon was stopped. | `check-14/` |
| 15 | Crash takeover | Blocking | **Pass.** `kill -9` after the first action left 2 `adb logcat` processes, the agent, the forward and a lease file listing all four. By the time the second run had prepared, both logcat processes were gone. `prepared` recorded `sweptLeftovers: true`, the run **passed**, and the cleanup gate was clean. Rerun on the new code on 2026-10-01 with the same result. | `check-15/` |

## Found by these checks

- **Issue 27:** a fractional `AbortSignal.timeout` made every live Android run fail as the agent started. It was fixed before these checks.
- **Issue 25's deviations,** accepted by the owner on 2026-10-01: cmp-list-swipe is replaced by settings-list-swipe, and cmp-number-input doesn't type into the empty keypad-only field. A stable list screen in the twin app is a v1.2.x candidate.

## For the owner

1. **Checks 9 and 10.** Install the plugin with a throwaway `CLAUDE_CONFIG_DIR`, type the key yourself, set the Android device, then follow the quickstart's Android section. Afterwards, delete the throwaway folder. A secure-storage item may remain.
2. **After merging #29 to #31:** check 1's CI on the merge commit, then phase 9.
