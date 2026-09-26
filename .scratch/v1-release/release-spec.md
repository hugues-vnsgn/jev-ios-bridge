# v1.0.0 release spec

Status: **accepted by the owner, 2026-09-25**, after an independent review against every ticket and ADR. Executor: Claude Code (the owner reassigned it from Codex on 2026-09-26). Owner: Do Viet Hung. The owner approved merging each phase PR after CI passes; the executor stops for the owner's go-ahead before tagging and publishing.

This spec is an index of the decisions it depends on. Each work item names the ticket or ADR that holds its detail; read that source before starting the item. Where this spec and a source disagree, stop and ask the owner. Don't pick one yourself. "Review #N" means row N of the defects table in [`code-review.md`](code-review.md) §4.

## Goal

Ship **jev-ios-bridge v1.0.0** as a regular GitHub release, with the packed tarball and its SHA-256 (no npm registry). 1.0 promises a stable script format, MCP tools and CLI, verdict semantics, and report and evidence layout ([ADR-0005](../../docs/adr/0005-the-1-0-stability-contract.md)). It serves **repeatable checks**: scripts that developers keep in their repo and re-run after changes ([Product assessment](issues/05-product-assessment.md)). The audience is native iOS (SwiftUI/UIKit) and Compose Multiplatform developers using Claude Code. Codex stays best effort.

## Sources

| Decision | Source |
| --- | --- |
| Go decision and the five go conditions | [Product assessment](issues/05-product-assessment.md) |
| Defects to fix | [Code and design review](issues/02-code-and-design-review.md), [`code-review.md`](code-review.md) |
| Verdict rules, the model pin, and the corpus gate | [Assertion policy for 1.0](issues/07-assertion-policy.md), [ADR-0004](../../docs/adr/0004-fixed-assertion-bounds-single-judgment.md) |
| The stability contract | [The 1.0 stable contract](issues/08-stable-contract.md), [ADR-0005](../../docs/adr/0005-the-1-0-stability-contract.md) |
| Tuning and the speed check | [Performance target and tuning plan](issues/06-performance-target.md), [`bridge-latency.md`](../../docs/research/bridge-latency.md) |
| Compose evidence | [Compose app evidence plan](issues/09-compose-evidence-plan.md), [BFSOne evidence shortcut](issues/13-bfsone-evidence-shortcut.md) |
| Log pane | [Live log pane](issues/12-live-log-pane.md) |
| Guide, docs, license, and tarball | [Developer guide outline](issues/10-developer-guide-outline.md), [`guide-outline.md`](guide-outline.md) |
| Data handling | [Data-handling statement](issues/14-data-handling-statement.md) |
| Checks, order, and reporting | [Release gates and the spec's assembly](issues/15-release-gates-and-spec.md) |

## Rules for the whole release

- **Machine and device.** The reference machine is the owner's Mac that produced the v0.1.0 numbers. Use only its dedicated simulator `0E42FDE2-5E09-42D3-9876-9EF0037FCBE7`. Never touch other simulators or physical devices. One agent at a time owns device operations.
- **Jev key.** Follow [`AGENTS.md`](../../AGENTS.md): load `.env` by an explicit path, and never print, copy, or commit `TYPESAFE_API_KEY`. A live authentication failure is a blocker to report, not a reason to substitute a key.
- **Other people's repos.** Don't edit, commit to, or push `~/Codes/cmp` or `~/Codes/Mobiles/BFSOne_Mobile_App`.
  - **BFSOne:** never log in, register, or submit anything. Its production server is `api.beelogistics.com`. Don't read BFSOne's `.env`: it holds a plaintext test login (found while surveying the app for "Compose app evidence plan").
  - **`cmp`:** build it where it is, without source edits.
- **The owner's standing preferences.**
  - Leave the owner's modified `.mcp.json` out of every commit.
  - Work in one PR per phase. Merge each to `main` with a merge commit after CI passes, then delete its branch.
- **Where evidence goes.** Put raw evidence under `spikes/benchmarks/results/v1.0.0/`, one subfolder per check. Fill in the checks table in this file, committed in phase 8's release-records PR. This spec itself lands on `main` before phase 1.
- **Stop and ask the owner** when:
  - a check fails for a cause outside the bridge (MobileBuildMCP, TypeSafe, Xcode, Compose Multiplatform, BFSOne, `cmp`), including an app crash;
  - this spec contradicts a source.
- **A verdict that differs from the expected one** is a bridge bug to fix ([Performance target and tuning plan](issues/06-performance-target.md)). If the fix is to a script rather than the bridge, record why and run it once more ([Compose app evidence plan](issues/09-compose-evidence-plan.md) item 5).

## Work, in order

Each phase is one PR. Unit and golden tests land with the phase that needs them. If phase 3 rejects the new shape, its PR still records the experiment's evidence.

### Phase 1: the contract ([ADR-0005](../../docs/adr/0005-the-1-0-stability-contract.md); [The 1.0 stable contract](issues/08-stable-contract.md))

1. **Scripts.**
   - Require `"version": 1`, and reject an unversioned script with a message telling the author to add it.
   - Add `"version": 1` to every script in the repo: `spikes/benchmarks/scenarios/*.json`, `examples/diagnostic-app/scenario.json`, and any script under `tests/`.
2. **`report.json`.**
   - Write a versioned `report.json` into each run's evidence folder. It records the verdict, reason, checkpoints, claims with probabilities, evidence file names, Jev model, and bridge version. The executor names its version field.
   - Add `run --json`, which prints it.
   - MCP `get_report` keeps returning prose plus the evidence path.
   - `start_scenario`'s `{runId, watchUrl}` reply is frozen. Phase 5 adds one optional field to it.
3. **Reason codes:** publish a fixed, bridge-owned list. An unknown MobileBuildMCP code becomes `DEVICE_ERROR`, with the vendor code kept as detail. The service fallback gets its own code, which the executor names.
4. **Roles:** publish a bridge-owned list. The driver translates any vendor rename.
5. **CLI exit codes.**
   - `0` passed, `1` failed, `2` inconclusive, `3` could not start (bad script, missing key, no simulator).
   - Document `130` and `143` for SIGINT and SIGTERM.
   - `report <id>` returns the same codes as `run`.
   - Print schema errors instead of the one generic line (the CLI half of review #7).
6. **Versions.**
   - Bump `package.json` to `1.0.0`, and make it the only source of the version, replacing the copies in `cli.ts` and `mcp/index.ts`.
   - Record the bridge version, Jev model, and observation projection rule in the `started` or `verdict` event and in `report.json`.
7. **Golden-file contract tests** covering:
   - accepted and rejected scripts, with exact messages;
   - MCP input shapes and the `start_scenario` reply;
   - the `report.json` shape;
   - CLI exit codes;
   - the role and reason-code lists;
   - the frozen evidence layout: folder location, file names, JSONL envelope, event type names, and the `verdict` event's fields.

### Phase 2: fixes

1. **`value: ''`** (review #2): reject it in the schema, and correct the docs and `/test-ios` ([Compose app evidence plan](issues/09-compose-evidence-plan.md) item 3). Test it against a real parsed capture.
2. **ADR-0004 precedence** (review #1): any claim at or below 0.1 fails its checkpoint even when other claims are uncertain, and the report still lists the uncertain claims (`src/scripted/run.ts:286-287`). Keep one judgment per checkpoint, with no re-asks. Show the model in the report header.
3. **The retained device lock** (review #3):
   - make cleanup wait at least as long as the command deadline, or release the lock when the late acknowledgement arrives;
   - detect a stale lock by checking whether its `pid` is still alive;
   - document the lock path and a safe manual procedure.
4. **Dead code** (`code-review.md` §1 recommendations; [Code and design review](issues/02-code-and-design-review.md) item 4):
   - Delete `src/run`, `src/scenario`, `src/observation`, and `src/jev`, plus `src/report` and the watch server's fallback to it (`src/watch/index.ts:54-55`).
   - Remove the legacy types and allow-list entries from `src/contracts/index.ts` and `src/log/index.ts`.
   - Add an `exports` map that exposes only the bin, and turn off `declaration`. The contract is the CLI and MCP, not a library API.
   - Point the main run test at `src/scripted/run.ts`, not `spikes/scripted/run.ts` (review #14).
5. **Data handling** ([Data-handling statement](issues/14-data-handling-statement.md) items 3–5):
   - device child processes get an environment without `TYPESAFE_API_KEY` (review #8);
   - one watch token per run, valid only for that run while the server lives (review #9);
   - the bridge writes a `.gitignore` containing `*` when it creates the evidence root.
6. **Not fixed in 1.0:**
   - review #4 (a wait's guard must hold at every poll);
   - review #5 (a run active in another process reports as `interrupted`);
   - review #6 (a cancel during cleanup turns `failed` into `inconclusive`);
   - the MCP half of review #7 (MCP errors collapse to one message);
   - review #10 (short typed values over-redact);
   - review #11–#13.

   Guide page 10 lists #4, #5, #6, the MCP half of #7, and #10 as known limits.

### Phase 3: the observation-shape experiment ([Assertion policy for 1.0](issues/07-assertion-policy.md) items 6–7; [`assertion-uncertainty.md`](../../docs/research/assertion-uncertainty.md))

Run the pre-registered experiment (explicit empty values, and list-end or scroll evidence; under $0.001). Freeze the wording before any call. Adopt the new shape only if it passes the corpus gate:
- zero confidently wrong and at most 3/48 uncertain on the frozen 24-screen corpus; **and**
- zero confidently wrong when the 300 archived judgments are re-scored.

Otherwise keep today's shape. Record the result under `spikes/benchmarks/results/v1.0.0/observation-shape/`. The Jev model stays `jev-1.13.0`.

### Phase 4: tuning ([Performance target and tuning plan](issues/06-performance-target.md))

- **A.** Depend on `mobilebuildmcp@2.7.1` and run its CLI directly, with no `npx`.
- **B.** Reuse the settled capture each action returns: `--verbose`, and accept schema `"3"`. Capture separately only when it's missing or the settle timed out.
  - **Protect the observation text.** ADR-0004 requires the corpus gate for any change to the observation text sent to Jev. Add a test showing that `renderAssertionState` produces byte-identical text from a schema-`"3"` action capture and from a schema-`"2"` snapshot of the same screen. If it can't be identical, re-run the corpus gate before adopting B.
- **C.** Take the screenshot concurrently with the snapshot, whenever a separate capture is taken.
  - When B's action capture is reused, take the screenshot as soon as the action returns.
  - **Check that they agree:** on the phase 7 benchmark runs, record for each step whether a snapshot taken after the screenshot has the same `screenHash` as the capture used. Treat any mismatch as a defect to investigate.

None of these may weaken guards, reference-freshness checks, or evidence completeness. Don't build D (a long-lived client).

### Phase 5: new features

1. **`app.launchArgs`:** an optional array of strings, passed to `simulator launch-app --launch-args` and recorded in `run.jsonl` and `report.json` ([Compose app evidence plan](issues/09-compose-evidence-plan.md) item 3).
2. **The log pane and `jev-ios-bridge logs RUN_ID`** ([Live log pane](issues/12-live-log-pane.md)).
   - It covers the sources, layout, `.command` window, fallback, lifecycle (a passed run closes after a few seconds), masking, `JEV_LOG_PANE=off`, `JEV_LOG_PANE_APP`, and `--no-log-pane`.
   - The attach command goes into `start_scenario`'s reply as a new optional field (ticket item 5), which the executor names. It's an allowed 1.x addition, so update the golden files.
   - The throwaway prototype is on the owner's local branch `prototype/log-pane` (commit `977c5a4`, `spikes/log-pane/PROTOTYPE-log-pane.mjs`). Treat it as a reference, not code to ship.
3. **Compose evidence scripts.** Author them now that `launchArgs` exists, as `"version": 1` scripts:
   - the six BFSOne gallery scripts in `spikes/benchmarks/scenarios/compose-bfsone-*.json`;
   - the five `cmp` fallback scripts in `spikes/benchmarks/scenarios/compose-cmp-*.json`.

   Use the flows and expected verdicts in [Compose app evidence plan](issues/09-compose-evidence-plan.md) items 4 and 6.

### Phase 6: docs, license, and package ([Developer guide outline](issues/10-developer-guide-outline.md); [`guide-outline.md`](guide-outline.md))

1. **Write `docs/guide/`** to the accepted outline:
   - the index and 11 numbered pages;
   - `examples/swiftui-weather.md` and `examples/compose-gallery.md`;
   - `reference/` (the script format, reason codes, and `report.json`).

   Carry in the lessons listed in the ticket's comments. Page 09 follows the [Data-handling statement](issues/14-data-handling-statement.md). Page 10 lists the limits, including the Compose areas not tested, phase 2's known limits, and placeholders for phase 7's speed and cost numbers.
2. **Delete `docs/usage.md`,** after moving its content into the guide. Shrink `README.md`, and move the v0.1.0 experiment history to `docs/releases/v0.1.0.md`.
3. **Links in shipped files.** Shipped docs link only to files inside the tarball. Link anything outside it (ADRs, research, spikes, example app sources, `CONTEXT.md`) by its GitHub URL at the `v1.0.0` tag ([Developer guide outline](issues/10-developer-guide-outline.md) item 5; `code-review.md` §1, "What ships").
4. **Keep `/test-ios` short.** Link guide pages 03–05 and `reference/script-format.md` through `node_modules/jev-ios-bridge/docs/guide/...`, and teach the claim rules from ADR-0004.
5. **License:** add an MIT `LICENSE` and `"license": "MIT"`.
6. **CHANGELOG:** add `CHANGELOG.md` for 1.0.0 with Added, Changed, Removed, Fixed, and "Upgrading from 0.1.0":
   - add `"version": 1`;
   - drop `value: ''`;
   - "could not start" is now exit code 3;
   - a false claim now fails beside uncertain ones.
7. **Tarball `files`:** `dist/`, `skills/`, `README.md`, `docs/guide/`, `LICENSE`, and `CHANGELOG.md`.
8. **Release notes:** `docs/releases/v1.0.0.md`, shaped like the v0.1.0 notes (what's in it, measured results, limits), with placeholders for phase 7's numbers.

Run `unslop` over everything people read.

### Phase 7: final checks on the release candidate

**Before checks 3 and 5, rebuild and reinstall** Weather, the diagnostic app, and the Compose app on the dedicated simulator.

**Which Compose app.** Read [BFSOne evidence shortcut](issues/13-bfsone-evidence-shortcut.md) now.
- **If it records a merged commit:**
  - `git clone ~/Codes/Mobiles/BFSOne_Mobile_App` into a temporary folder, which leaves the owner's checkout untouched;
  - check out that commit;
  - build through MobileBuildMCP (workspace `iosApp/iosApp.xcworkspace`, scheme `iosApp`);
  - record the commit and CMP version.
- **If it records none:** use `cmp`.
  - Record a SHA-256 of its source tree (excluding `build/` and `.gradle/`) and CMP 1.11.1.
  - Say which app was used in page 10 and the release notes.

Run every check on the candidate merge commit (the last of phases 1–6), and put the evidence under `spikes/benchmarks/results/v1.0.0/`. **Blocking** checks must pass. **Report-only** checks are recorded, and a miss doesn't block.

| # | Check | Kind | How | Evidence |
| --- | --- | --- | --- | --- |
| 1 | `npm run check` and CI | Blocking | Local run, plus the `check.yml` run on the merge commit | | 162 tests pass locally; CI green on `cd1c36d` ([run](https://github.com/hugues-vnsgn/jev-ios-bridge/actions/runs/36226241771)); re-checked on the release-records merge commit. |
| 2 | Golden-file contract tests | Blocking | Part of 1, listed separately | | Pass (part of 1). |
| 3 | Benchmark verdicts: Weather, Contacts, Reminders, **one run each**, with no new direct-MobileBuildMCP baselines | Blocking | Use the v0.1.0 harness (`spikes/benchmarks/run-bridge.mjs`). Each verdict matches v0.1.0, except where ADR-0004's precedence legitimately changes it; if so, record why. | | Weather passed and Contacts passed (both match). Reminders **passed** at `counts` = 0.90, against 0.87 inconclusive in 0.1.0; the owner accepted it as a borderline pass. One script fix (Contacts, a vacuous `alert` role). One re-run of Reminders after the measurement-mode fix (PR #19). [summary](../../spikes/benchmarks/results/v1.0.0/benchmarks/summary.md) |
| 4 | Benchmark speed: "Prepared bridge execution", measured as in [`scripted-benchmarks.md`](../../docs/research/scripted-benchmarks.md), against v0.1.0 (Weather 107.670 s, Contacts 74.766 s, Reminders 91.173 s) | Blocking: no script above its v0.1.0 time. Report-only: at least 30% faster. | From the same three runs | | None slower. Weather 63.1 s (−41%), Contacts 54.7 s (−27%), Reminders 55.5 s (−39%). |
| 5 | Compose: the six BFSOne scripts, or the five `cmp` scripts, one run each | Blocking | Expected verdicts per [Compose app evidence plan](issues/09-compose-evidence-plan.md) items 4–6. For BFSOne, no request to `api.beelogistics.com` in any run's app log. | | BFSOne `8eccf629` (CMP 1.9.0): all six expected verdicts, 0 requests to `api.beelogistics.com`. The text script was re-run once after adding its post-typing guard (a dropped keystroke). [summary](../../spikes/benchmarks/results/v1.0.0/compose/summary.md) |
| 6 | Clean install from the packed tarball into an empty project | Blocking | `npm install <tgz>`. `npx jev-ios-bridge --version` and `node node_modules/jev-ios-bridge/dist/cli.js --version` both print `1.0.0`. The installed file list matches `files`. | | Both entry points print `1.0.0`; 43 files; re-checked on the release-records merge commit. [record](../../spikes/benchmarks/results/v1.0.0/install/record.md) |
| 7 | Quickstart walkthrough | Blocking | Follow `docs/guide/01-quickstart.md` as written, with Claude Code as the host, through `/test-ios` and MCP, on `examples/diagnostic-app`. Expect a **failed** report that points at the $3 total. If Claude Code isn't available, stop and ask the owner. | | Works as written through Claude Code, `/test-ios`, and MCP: **failed** on the $3 total, exit 1. Pre-tag deviations recorded. [record](../../spikes/benchmarks/results/v1.0.0/quickstart/record.md) |
| 8 | Log pane | Blocking | In the owner's logged-in desktop session, not under `CI` or SSH, check that it opens on a run, masks a supplied value, closes after a pass, and stays open after a failure. Save a `screencapture` of the window for each case. Separately, check that `JEV_LOG_PANE=off` and the SSH/CI fallback print the `logs` command. If no desktop session is available, stop and ask the owner to watch. | | Opens, masks, stays open after a failure, and falls back correctly. After a pass the pane finishes but Terminal keeps the window; the owner accepted this and the docs were updated. [record](../../spikes/benchmarks/results/v1.0.0/log-pane/record.md) |
| 9 | Cost per run | Report-only | Jev cost per checkpoint and per run, from checks 3 and 5. Price from current TypeSafe pricing, cross-checked against `spikes/benchmarks/jev-pricing.json`, and record the date and source. Host-model cost is excluded. | | $0.00016 per checkpoint (3,705 tokens on average), $0.0001–$0.0008 per run, at $0.042 per million input tokens (2026-09-26). [summary](../../spikes/benchmarks/results/v1.0.0/benchmarks/summary.md#cost-check-9) |

### Phase 8: release records, tag, and publish

1. **Release-records PR** (docs only):
   - write the phase 7 numbers into guide page 10 and `docs/releases/v1.0.0.md`;
   - fix any guide step that check 7 found wrong;
   - fill in the checks table in this file.

   Re-run checks 1, 2, and 6 on its merge commit. That commit is the one to tag.
2. **Tag and publish.** Tag `v1.0.0` from it, and publish a **regular** GitHub release (not a prerelease) from `docs/releases/v1.0.0.md`, attaching the packed tarball.
3. **Verify the published asset.** Record the asset's size and SHA-256. Download it fresh from the public release, check the digest, install it cleanly, and confirm both entry points report `1.0.0`. Save the evidence the way `spikes/benchmarks/results/publication-verification.json` did for v0.1.0.

## What the executor reports back

- the filled checks table, with a link to each piece of evidence;
- the PR list;
- the release URL, the asset SHA-256, and the fresh-download result;
- every stop-and-ask event and the owner's answer;
- the names the executor chose (the `report.json` version field, the service-fallback code, and the `start_scenario` log field).

Unsuccessful attempts stay in the record, as they did for v0.1.0. Never describe an inconclusive or failed attempt as a pass.

## Out of scope for this release

npm publication, real-iPhone UI automation, autonomous navigation, automatic hooks, CI operation of the bridge, Codex as a first-class host, a docs website, and React Native or Flutter guidance ([map](map.md), "Out of scope"). Don't add them.
