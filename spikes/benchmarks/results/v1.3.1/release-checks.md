# v1.3.1 release checks

Live runs on a public app, one run per check, plus the evidence from the live trial the fixes came from. Evidence folders (`run.jsonl`, `report.json`, screenshots) stay on the machine that ran them, under `~/Codes/eval-apps/live-checks/release-1.3.1/`.

- **Code:** branch `release/v1.3.1` at `6050295` (main `081c690` with PR #39, plus the version and docs). `npm run check`: 929 tests, typecheck and build pass.
- **Bridge under test:** the plugin zip below, unzipped and installed as Claude Code does (`npm ci --ignore-scripts`). Not a source checkout.
- **Device and app:** iOS simulator `jev-drives-eval`, an iPhone 17 on iOS 26.4, with a test copy of the Kodeco course app ReadMe (`com.hugues.ReadMe`), as for v1.3.0.
- **Method:** as v1.3.0's re-check. A small MCP client played Claude's part over the real `start_scenario`, `get_report` and `resolve_step` tools, with each answer fixed in advance.

## 1. Where the fixes came from

The first live trial of driven mode (2026-10-02) ran two read-only flows on a real app that isn't public, on an iOS 18.6 simulator. Its details stay local; what it showed:

- **Scroll up:** the target search's three scrolls down each changed the screen, and its scroll up didn't, on a list under a fixed search bar. MobileBuildMCP's default stroke for a finger-down swipe started at 15% of a full-screen scroll view, on the header, so the search stopped after that one try. Re-run with the fixed build on the same screen: all three search scrolls up changed the screen.
- **Launch screen:** both driven runs' first Jev decision was taken on the app's launch screen ("Loading", 5 options, `none_fits`).
- **Write controls:** a read-only flow ended on an approval screen with live Approve and Reject buttons, neither of them a risky word.
- **Cost:** Claude driving the simulator directly cost $0.63 and $0.59 per flow; driven mode $1.66 and $1.10 for Claude, about $0.002 for Jev. Jev made 10 of 13 actions, with 0 wrong taps and 0 false PASS. This is in the README's "What a check costs".

## 2. Checks on the release package

| # | Check | Result | Run |
|---|---|---|---|
| R1 | version 1 script, CLI | **passed**, `ALL_CHECKPOINTS_PASSED`, 9.0 s. Jev read 1,498 input tokens, as in v1.3.0's R1 (0.970). | `f2715fc7-c366-499a-9d7d-ae54e85192c2` |
| R2 | Claude's tap after a pause, screen unchanged | **passed**. The bridge captured again and tapped `button "Bosch, Laurinda Dixon, Earthily Delightful."`; Claude answered `done`. | `bdaa202d-f1f6-4361-b86c-5f340a997ee5` |
| R3 | Settings brought to the front during the pause, then Claude answers the same tap | **no tap.** The step paused again with `SCREEN_CHANGED`; Claude answered `stop` (`STOPPED_BY_CLAUDE`). | `698e1a70-e08c-48fd-8cf7-866faa18c3bb` |
| R4 | Jev drives the same step | **passed**, no pause. Jev tapped at 0.96 and judged the step done at 0.96. 6,993 Jev input tokens. | `a9921129-c4bf-4097-84f3-aa43ac7ceac5` |
| R5 | driven script with the switch off | `DRIVEN_NOT_ENABLED`, exit 3, in 1 s. No run folder. | none |
| R6 | scroll My Library (3 pages) to its last book, then back to the top | **passed**. Down: Jev scrolled twice (0.94); its third identical pick went to Claude as `REPEATED_ACTION`, by design, and Claude scrolled once more. Up: **Jev scrolled up twice by itself (0.92)** and ended the step by its done check (0.90). 7 Jev decisions, 45,754 input tokens. | `7e396e39-e770-4390-9cf7-98eb118f6d80` |

Not checked live: the look again at a launch screen (ReadMe has none; covered by tests, including a regression through the real Android driver against a fake device), and Android.

## 3. The packages

Built once from `6050295` with `npm run build:plugin` and `npm pack`. These exact files are the ones to publish.

| File | SHA-256 | Check |
|---|---|---|
| `jev-ios-bridge-plugin-1.3.1.zip` (241,848 bytes) | `8115e1f76587ab33b677402303c8d9f813f84d59ab8135675f761a4000a61b2a` | Unzipped and installed as Claude Code does: `--version` prints `1.3.1`. Its MCP server, started from an empty folder without a key, answers as 1.3.1 and lists `start_scenario`, `get_report` and `cancel_run`, plus `resolve_step` only with `JEV_EXPERIMENTAL_DRIVEN=1`. `claude plugin validate` passes the plugin and `marketplace.json`. |
| `jev-ios-bridge-1.3.1.tgz` (179,605 bytes) | `657d0e5271519882cdf7dfde367832fb5e51fe659a2eae9d890dadf501c5a15e` | `npm install` into an empty project (0 vulnerabilities), then `npx jev-ios-bridge --version` prints `1.3.1`. |

Neither file holds a key, a run's evidence, or a local path.
