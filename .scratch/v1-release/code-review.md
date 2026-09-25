# Code and design review of v0.1.0

For the ticket "Code and design review of v0.1.0 before a stability promise". Reviewed 2026-09-25 at `main` (`7bb3dde`). `src/`, `tests/`, `package.json`, and `skills/` are identical to the v0.1.0 merge `f4a3c87` (`git diff v0.1.0 main` is empty for them).

**Method.** I read all of `src/` and the tests that cover it, built the import graph with grep from `src/cli.ts`, and checked the ticket's `value: ''` claim against 685 archived capture files under `spikes/`. The review uses `codebase-design` vocabulary (module, interface, seam, adapter, depth). The Standards axis of `code-review` has no repo standard to check: the repo has no CODING_STANDARDS or CONTRIBUTING file and `AGENTS.md` sets none. So Fowler's smell list is the only baseline, and every smell is a judgement call. This is a whole-tree review, not a diff review, so there is no Spec axis.

**Not done.** I did not run `npm test`. There is no `node_modules`, the local Node is 22.22 against `engines >=24`, and installing would write files outside the one this ticket allows. I operated no device, made no Jev calls, and wrote no test, because static evidence was the cheaper proof. Each section lists facts first and recommendations after. Keep/cut decisions belong to the downstream tickets.

---

## 1. Dead or legacy code

### Facts: import graph from the entrypoints

```
cli.ts ─┬─ service.ts ─┬─ scripted/schema ── scripted/contracts ── contracts (types)
        │              ├─ scripted/run ─┬─ scripted/{select,observe,jev,report,schema}
        │              │                └─ device (concrete: DeviceCliError, StaleSnapshotError)
        │              ├─ log ── contracts
        │              └─ watch ─┬─ log, scripted/report
        │                        └─ report  (legacy fallback only, watch/index.ts:54-55)
        ├─ mcp ── service, scripted/schema, scripted/report
        ├─ device ── contracts
        └─ scripted/jev, scripted/report
```

| Module | Lines | Reachable from cli/mcp/service? | Who still imports it |
| --- | ---: | --- | --- |
| `src/run` | 306 | No | `tests/run.test.ts` |
| `src/scenario` | 63 | No (only `src/run`) | `tests/scenario.test.ts` |
| `src/observation` | 203 | No (only `src/run`) | `spikes/feasibility/harness.ts`, `tests/observation.test.ts`, `tests/jev.test.ts` |
| `src/jev` | 173 | No | `spikes/feasibility/{cli,harness}.ts`, `tests/jev.test.ts`, `tests/feasibility.test.ts` |
| `src/report` | 81 | Only through the watch fallback for journals without `mode: 'scripted'` | `tests/evidence.test.ts`, `tests/integration-edge.test.ts` |
| `src/contracts` | 130 | Yes, types only | Everything. About half of it is autonomous-design types: `Scenario`, `Checkpoint`, `CheckpointScenario`, `RunScenario`, `ActionOption`, `HistoryEntry`, `Observation`, `Judgment`, `JevJudge`, and the `wait`, `stop-goal`, `stop-blocked`, and `none` action kinds (lines 21-38, 63-85, 104-106) |

That is 745 unreachable lines, plus `src/report`, which serves only journals recorded before the scripted design.

**Legacy residue inside reachable modules:**
- `log/index.ts:13-18,40,55`: the redactor's protocol allow-lists carry `stop-goal`, `stop-blocked`, `none`, `judgment.choice`, `checkpointId`, and the `checkpoints` and `options` identifier parents.
- `watch/index.ts:21,23,24`: the page script has branches for goal, checkpoint, and choice events. Lines 54-55 fall back to `buildReport`.
- `device/index.ts:34`: `StaleSnapshotError`'s default message says "observe and ask Jev again". Line 410 accepts `wait` as a no-op action.
- `scripted/run.ts:169`: the judgment phase is still named `decide`/`decideMs`, a leftover from when Jev decided actions. It appears in the journal's `phaseTimingsMs`.

**Duplicate copies in `spikes/`:**
- `spikes/scripted/{select,observe,jev}.ts` match `src/scripted/` byte for byte apart from import paths.
- `run.ts`, `report.ts`, `schema.ts`, and `contracts.ts` have diverged: 61, 69, 58, and 50 differing lines.
- `tests/scripted-run.test.ts`, the largest run test at 585 lines, imports `spikes/scripted/run.js`, not `src/scripted/run.ts`.
- So `SCREEN_CHANGED`, `STEP_LIMIT`, `WALL_LIMIT`, and `GUARD_FORBIDDEN` in the run loop are tested only against the spike copy.

**What ships** (`package.json` `files`: `dist`, `skills`, `README.md`, `docs/usage.md`):
- `tsconfig.build.json` compiles all of `src/**`, with `declaration: true`, so `dist` includes the dead modules and their `.d.ts` files.
- `package.json` has no `exports` field, so any `jev-ios-bridge/dist/<module>/index.js` is importable. That makes the whole tree de facto public API.
- The shipped `README.md` links to files outside the tarball: `spikes/...`, `.scratch/...`, `CONTEXT.md`, `docs/architecture.md`, `docs/adr/...`, `examples/...`.

### Recommendations
- Before 1.0, delete `src/run`, `src/scenario`, `src/observation`, and `src/jev`. Also delete `src/report` together with the watch fallback, and remove the legacy types and allow-list entries from `contracts` and `log`. If evidence replay needs them, move them into `spikes/` with their tests. Old journals can still be read as raw JSONL.
- Keep a single copy of the scripted modules. Point `tests/scripted-run.test.ts` at `src/scripted/run.ts`, or retire the spike run.
- Add an `exports` map that exposes only the bin, and turn off `declaration`, unless a library API is meant to be part of the promise. I recommend it isn't: the contract is the CLI and MCP.
- Fix or trim the README links in the shipped copy.

---

## 2. Seams

### Facts

| Module | Interface today | Depth | Freeze-worthy now? |
| --- | --- | --- | --- |
| **Device driver** (`DeviceDriver`, `contracts/index.ts:87-93`; adapter `device/index.ts`) | `prepare`, `observe`, `act(action, snapshot, context, signal)`, `close`, optional `metrics` | Deep adapter: locks, acknowledgement tracking, reference refresh, log tails, envelope parsing. The interface is vendor-shaped, though. | **No.** See the leaks below. |
| **Jev client** (`ScriptedJudge`, `scripted/jev.ts`) | `judge(assertions, observationText, signal)` returns `{probabilities, inputTokens, latencyMs, model}` | Deep. Request budgets, strict parsing, and error mapping sit behind one method. | The interface is fine, but it isn't a user-facing contract. Keep it internal. |
| **Run loop** (`runScriptedScenario`, `scripted/run.ts:142-335`) | One options object in, `ScriptedReport` out | Deep, but a single 190-line function. The verdict rule is inline at line 286-287. | The semantics are worth freezing; the function shape isn't. |
| **Evidence journal** (`RunLog`, `log/index.ts:96-135`) | `append(type, data: Record<string, unknown>)`, `read()` | Deep: ordered queue, fsync, screenshot copy, redaction. | **No.** The payloads are untyped (below). |
| **Report** (`scripted/report.ts`) | `buildScriptedReport(events)` and `renderScriptedReport(report)` to text | Shallow-ish. `ScriptedReport` carries the whole `events` array plus derived checkpoints. | **No.** The host-facing report is prose (below). |
| **Watch server** (`watch/index.ts`) | `startWatchServer(baseDir)` returns `{url, close}` | Deep enough. The page is inline JS that reads raw event shapes. | The URL and endpoints can stay internal. |

**Where the device driver leaks:**
- Element references (`targetRef`), the ref expiry fields (`expiresAt`, `sequence`, `screenHash`), and the action names `typeText` and `swipeWithin` are MobileBuildMCP/AXe concepts. A WebDriverAgent adapter, the second device layer ADR-0002 anticipates, would have to fake them.
- `act` takes the whole `ActionScenarioContext` just to resolve one `valueKey`.
- The `Action` union still includes the legacy kinds, which the adapter has to reject.
- The run loop imports the concrete adapter's error classes (`run.ts:3`), not interface types.
- The alias rule `tapAliasRule: 'mobilebuildmcp-2.7.1'` is a vendor quirk. It is set in `cli.ts:35`, separately from the driver it describes, and consumed in `select.ts`.
- Stale-reference handling is split across the seam. The driver retries expired refs using `sameScreen` plus `rematch` (`device/index.ts:221,251,423-450`). The run loop then does its own `snapshotChanged` and re-resolution (`run.ts:51,230-246`). Both functions implement the same logic.

**Tuning option B from `docs/research/bridge-latency.md` (reuse the post-action capture, schema "3") changes this seam:**
- `parseEnvelope` and `terminalPayloadMatches` accept only `schemaVersion '2'` (`device/index.ts:53,78`).
- `act` returns `void` (`contracts/index.ts:90`), so it would need to return the settled `Snapshot`.
- The run loop's capture at the start of each step (`run.ts:206`) would become conditional. The next step's `step` journal event would then come from an action capture, which changes what `observeDurationMs` and `screenshotPath` mean in the evidence.

**Evidence journal untyped:**
- Event payload shapes exist only as object literals at the call sites in `run.ts`. The same eight-field `step` payload is repeated at lines 213, 235, and 260.
- The redactor's behaviour depends on field paths (`log/index.ts:11-40,53-63`). Renaming or adding a field silently changes what is pseudonymized or allow-listed.
- Screenshot copying is a hidden side effect of `append('step', {screenshotPath})` (`log/index.ts:113-119`).

**Report is prose:**
- MCP returns `content[0].text` only, with no `outputSchema` or `structuredContent` (`mcp/index.ts:8,26-27`). The CLI prints the same text.
- Structured JSON exists only on the token-protected watch `/events` endpoint.

### Recommendations
- **Don't freeze `DeviceDriver` or the evidence payloads until option B is decided.** Deciding B (or rejecting it) before the evidence layout is frozen avoids a 1.x break.
- **Keep the driver interface internal in 1.0.** Deepen it first: move stale-ref recovery entirely into the adapter, have `act` take the resolved literal and return the capture it produced, and move error classes to the contract. That makes a second adapter possible, and turns it from a one-adapter "hypothetical seam" into a real one.
- **Make the verdict rule one small pure function**, such as `checkpointStatus(probabilities)`. That gives locality for the ADR-0004 change and for the rule being frozen.
- **Type the journal events** (one Zod schema per type), have the redactor read field classes from those schemas, and version the payloads before freezing the evidence layout.
- **Freeze a structured report, not prose:** a JSON report with its own `reportVersion`, delivered as MCP `structuredContent` and through a CLI JSON flag. Declare the text rendering non-contractual.

---

## 3. Public surface inventory

"Versioned" means an explicit version field travels with the artifact.

| Surface | What is observable today | Versioned? |
| --- | --- | --- |
| **Script format** (`scripted/schema.ts`) | Root `app.bundleId` (dotted regex), `device.udid` (UUID only), `preconditions` (≤20 × ≤500 chars), `values` (≤32 keys matching `^[A-Za-z][A-Za-z0-9_-]{0,63}$`, ≤2048 printable ASCII, no leading `-`), `steps` (1–100, unique IDs, last step a `checkpoint`). Step kinds: `action` with `tap`, `replaceText` + `valueKey`, or `swipe` + `up/down/left/right`; `wait` with `until` and `timeoutMs` 1–60000; `checkpoint` with 1–20 unique `{id, claim ≤1000}`. Guard: `present` 1–12, `absent` ≤12. Selector: `identifier`, `role`, `label` (nonblank, ≤500), `value` (≤500, may be empty). Every object is strict, so unknown fields are rejected. **`role` values are the vendor's strings** (`text`, `button`, `text-field`, `other`, …), not a bridge enum. | **No.** There is no version field. |
| **Schema error messages** | Eight custom messages: "A selector needs an identifier, role, or label; value is only a filter"; "Assertion IDs must be unique within a checkpoint"; "Typed values must use printable US keyboard characters"; "A script may supply at most 32 typed values"; "MobileBuildMCP 2.7.1 cannot type text starting with a leading hyphen"; "A script must end at an assertion checkpoint"; "Step IDs must be unique"; "replaceText valueKey must name a supplied value". Everything else is Zod's default text. **Through MCP**, they appear only in the SDK's input-validation error, whose format the SDK owns. **Through the CLI**, every error collapses to "Bridge could not start. Check arguments, scenario, and environment." (`cli.ts:69`). | No |
| **MCP tools** (`mcp/index.ts`) | Server `jev-ios-bridge`, version `0.1.0`, hardcoded at line 12. `start_scenario {scenario, limits?: {maxSteps 1–100, wallTimeMs 1–3600000}}` returns text JSON `{"runId","watchUrl"}`. `get_report {runId, waitMs? 0–45000}` (readOnlyHint) returns text `Status: running…Recorded steps: N…` or `Status: finished|interrupted` + rendered report + `Full local evidence: <path>`. `cancel_run {runId}` returns `Run <id> stopped.`. Every failure returns `isError` + "Bridge operation failed. Check the run id and local configuration." No output schemas. | The server has a version string. The tools do not. |
| **CLI** (`cli.ts`) | `mcp`, `run <script.json> [--max-steps N] [--timeout-ms N]`, `report <run-id>`, `--help`, `--version` (hardcoded `0.1.0`, line 22). `run` writes `Watch: <url>` to stderr and the report to stdout. Exit codes for `run`: 0 passed, 1 failed, 2 inconclusive **or any error**. **Undocumented:** 130 on SIGINT and 143 on SIGTERM (lines 43-44, no report printed), and `report` exits 0 whatever the verdict. | `--version` only |
| **Verdict and reason codes** | Verdict: `passed`, `failed`, or `inconclusive`. Reasons: `ALL_CHECKPOINTS_PASSED`, `ASSERTION_FALSE`, `ASSERTION_UNCERTAIN`, `SCRIPT_INCOMPLETE`, about 48 error codes (`log/index.ts:25-37`), the service fallback prose "Run could not complete. Check local setup." (`service.ts:60`), and **any vendor code matching `^[A-Z0-9_]+$`** passed through from MobileBuildMCP (`run.ts:109`). The reason vocabulary is therefore open and vendor-controlled. | No |
| **Report text** (`scripted/report.ts:67-112`) | Header `Run <id>: <verdict>`, reason line, `Steps: …; Jev input tokens: …; duration: … ms.`, `Execution problem: <code> during <phase>`, `Checkpoint <id>: <status>.`, `Claim <id>: <claim>; probability yes 0.000.`, `Evidence: step …, run.jsonl event N, snapshot S.`, screen excerpt, `Screenshot: screen-N.jpg`, truncation notices, 24,000-byte budget. No model name, despite ADR-0004's "named in every report". | No |
| **`.jev-runs/` layout** | `${JEV_RUNS_DIR:-$PWD/.jev-runs}/<uuid>/run.jsonl` plus `screen-<sequence>.(jpg\|png)`. Directories are 0700 and files 0600. Retention is manual. | No |
| **JSONL events** (`contracts/index.ts:108-115`, written in `run.ts`) | Envelope `{version: 1, runId, sequence, at, type, data}`. Types: `started {mode:'scripted', bundleId, plannedSteps[{id,kind}]}`; `prepared {prepareDurationMs}`; `step {step, stepId, kind, snapshotSequence, observationSummary, observeDurationMs, assertionObservation?, screenshotPath?, logTails?, attempt?, poll?}`; `action {step, stepId, action, selector, resolvedRef, actDurationMs, stepDurationMs}` or the wait form `{action:'wait', timeoutMs, waitDurationMs}`; `judgment {step, stepId, model, probabilities, inputTokens, latencyMs, decideDurationMs}`; `checkpoint {step, stepId, status, stepDurationMs, assertions[{id,claim,probability}]}`; `error {stepId?, phase, code, stepDurationMs?}`; `verdict {verdict, reason, steps, inputTokens, durationMs, checkpointsPassed, checkpointCount, phaseTimingsMs, deviceMetrics?}`. Step IDs containing a secret are pseudonymized. `resolvedRef` is an ephemeral vendor ref. | **Envelope only** (`version: 1`). Payloads have no version. The observation projection has a version constant, `PROJECTION_RULE = 'visible-full-text-v1'` (`scripted/observe.ts:4`), but nothing records it. `model` is recorded on `judgment`. |
| **Environment and config** | `TYPESAFE_API_KEY` (required; also a redaction secret), `JEV_DEVICE_UDID`, `JEV_RUNS_DIR`. The bridge sets `MOBILEBUILDMCP_SENTRY_DISABLED=true` for its child processes. It reads `.mobilebuildmcp/config.yaml` with a regex that matches any `simulatorId:` line with a UUID value, not only the one under `sessionDefaults` (`device/index.ts:191`). Any environment variables the TypeSafe SDK reads itself were not inventoried, because the SDK wasn't installed locally. | No |
| **Device lock** | `$TMPDIR/jev-ios-bridge-device-locks/<UDID>.lock` containing `{pid, token}` (`device/index.ts:198-219,354`). The location is undocumented. | No |
| **Watch URL** | `http://127.0.0.1:<ephemeral>/?token=<64 hex>&run=<runId>`. The service appends `&run=` to a URL it assumes already has a query string (`service.ts:65`). Unauthenticated routes: `/`, `/app.js`, `/style.css`. Bearer-token routes: `/events?run=` (the full report JSON, including every event) and `/image?run=&name=screen-N.(png\|jpg)`. | No |
| **Pinned externals** | `mobilebuildmcp@2.7.1` through `npx --yes` on every call (`device/index.ts:171`), `jev-1.13.0` (`scripted/jev.ts:8`, and again in `log/index.ts:23`), SDK 0.6.0, MCP server 2.1.0, Zod 4.6.5. | Pinned, but not stated in any output other than `judgment.model` |

### Recommendations
- Add a required `version` (or `schema`) field to the script format. The strict schema already makes new optional fields safe for old scripts, but an old bridge reading a new script needs to fail with a clear message.
- Decide whether `role` is a bridge vocabulary or a vendor passthrough before freezing. A second device layer, or Compose semantics, may report different roles.
- Close the reason-code vocabulary: map unknown vendor codes to `DEVICE_ERROR` and give the service fallback a code.
- Put the bridge version, model, and projection rule in the `started` or `verdict` event and in the report.
- Document or change the CLI exit codes: give startup and usage errors their own code, separate from inconclusive, and state what 130, 143, and `report` return. Surface schema errors in the CLI.
- Read the version from `package.json` once, not in three places (`package.json`, `cli.ts:22`, `mcp/index.ts:12`).

---

## 4. Defects and risks (ranked)

I found no path to a false `passed`: every defect below fails toward `inconclusive` or a lost diagnosis. Item 1 isn't a safety defect either. Today's rule is more conservative than ADR-0004's, but the two differ.

| # | Severity | Finding | Where |
| --- | --- | --- | --- |
| 1 | **High (freeze blocker, already tracked)** | **The checkpoint rule is still "uncertain wins".** ADR-0004 reverses it to "false wins". The docs describe the old rule too. The code and docs must change before verdict semantics are frozen. | `scripted/run.ts:286-287`; `docs/usage.md:87`; `docs/architecture.md:28` |
| 2 | **High (documented feature that can't work)** | **A selector with `value: ''` never matches a real element.** `matches` uses strict equality (`select.ts:32`). The compact parser drops empty values (`device/index.ts:101`, `value ? {value} : {}`). The full parser keeps `value` only when the vendor sends a string (`:119`). Across 685 archived capture files (48,140 elements), **no element carries `value: ""`**: 45,242 omit `value`, including the blank "List Name" text field in `reminders-benchmark-preflight-blank-*.full.json`. One unlabeled search field reports `value: "Search"`, which looks like placeholder text (inference). So `value: ''` always yields `GUARD_MISSING` or `TARGET_MISSING`, and the run ends inconclusive. The schema accepts it (`tests/scripted-schema.test.ts:9-16`) and the docs promise it (`docs/usage.md:63`, "An empty value can be an additional filter"; `skills/test-ios/SKILL.md:13`, "An empty value is allowed"). The only matching test builds an `Element` with `value: ''` by hand and runs it against the spike copy (`tests/scripted-run.test.ts:116-121`). **The ticket comment's claim is confirmed.** Empty fields also can't be told apart from a field whose text equals its placeholder. | `src/scripted/select.ts:29-33`; `src/device/index.ts:101,119` |
| 3 | **Medium-High (operability)** | **A retained device lock has no recovery path.** Cleanup gives up after 10 s (`run.ts:148`), but a UI command's own deadline is 35 s (`device/index.ts:295`). So a slow command that later succeeds, in flight when a cancel or `WALL_LIMIT` lands, leaves `UI_ACTION_UNCONFIRMED` and the lock retained. Recovery works only if `close()` is called again after the command settles (`tests/device.test.ts:411`), and production never calls it again. The run loop calls `close` once, and the service discards the driver. A crash or SIGKILL leaves the lock too. The lock records `pid`, but nothing checks it. Its path is undocumented, and `docs/usage.md:89` says only "Do not blindly remove such a lock". Every later run on that simulator ends inconclusive with `DEVICE_BUSY` until someone deletes the file by hand. | `src/scripted/run.ts:148,316-317`; `src/device/index.ts:198-219,459-468` |
| 4 | **Medium (semantics to settle before freezing)** | **A wait's `guard` must hold at every poll, not only at the start.** The skill calls it "a starting `guard`". With the canonical spinner pattern (guard `Loading`, until `Done`), a single capture that shows neither stops the run with `GUARD_MISSING`. This is intentional (`tests/scripted-run.test.ts` "wait stops on an unexpected third screen") but undocumented, and it is a flake source. Also, if `until` holds only on a capture taken after `timeoutMs`, the result is `WAIT_TIMEOUT` rather than success (`run.ts:124`). | `src/scripted/run.ts:122-133`; `skills/test-ios/SKILL.md:11` |
| 5 | Medium | **A run active in another process is reported as `interrupted`.** Examples: a CLI `run` watched through MCP `get_report`, or two MCP servers sharing `.jev-runs`. Any job this process doesn't know about and that has no verdict is labelled `interrupted` (`service.ts:84`). `cancel_run` for such a run fails with the generic error. | `src/service.ts:84,88-90` |
| 6 | Medium | **A cancel during cleanup turns a recorded `failed` into `inconclusive`** (`run.ts:323-327`). This is deliberate (commit `8fb9aac`) and consistent with the rule that nothing is final until the verdict is appended. It does sit in tension with ADR-0004's "a confident failure is the most reliable signal", so it should be decided explicitly as part of the frozen verdict semantics. | `src/scripted/run.ts:323-327` |
| 7 | Medium (error surface) | **Errors aren't diagnosable from the public surface.** Every MCP handler failure returns one string (`mcp/index.ts:9`), so a missing key (`jev.ts:90`), a busy device before start, an unknown run, and a corrupt log all look the same. The CLI does the same for every error, including schema errors and bad `--max-steps` input (`cli.ts:69`). Exit code 2 conflates startup failure with an inconclusive verdict. | `src/mcp/index.ts:9`; `src/cli.ts:62,69` |
| 8 | Low-Medium (secret hygiene) | **The Jev API key is exported to every MobileBuildMCP child process.** The runner passes `{...process.env}` to `npx` and MobileBuildMCP (`device/index.ts:175`). That package tree has Sentry telemetry on by default; the bridge turns it off only through an environment variable. The device layer doesn't need the key. | `src/device/index.ts:173-176` |
| 9 | Low-Medium (watch security) | **The watch token is broader and longer-lived than one run.** It is valid for every run under the evidence root, including runs from other processes and past sessions (`watch/index.ts:51-53`), for as long as the MCP server lives, with no expiry. It also leaves the machine inside the MCP tool result, so it lands in the host model's transcript. Checked and fine: the server binds `127.0.0.1` on an ephemeral port and compares the token in constant time. Data routes need a bearer header, so DNS rebinding and other cross-origin pages get only the static page. CSP, `nosniff`, and `no-referrer` are set, the page renders with `textContent` only, and image names are pinned to `screen-N`. Minor: a multibyte token makes `timingSafeEqual` throw, so the server returns 404 instead of 401 (`:48`). | `src/watch/index.ts:32,48-56`; `src/service.ts:65` |
| 10 | Low (redaction) | **Redaction is literal-only.** The documented gaps are transformed values, screenshots, and Jev seeing typed text. Two more exist. Short values over-redact: a one-character value masks that character across all journal and report text, which makes a failed run undiagnosable. And app log tails (4 KiB of runtime and OS logs per observation, `device/index.ts:399-400`) are journaled and served by the watch view with only that literal redaction. The API key is redacted only if it is in the environment when the log is created (`log/index.ts:107`). | `src/log/index.ts:42-68,107` |
| 11 | Low | **A partial `start` leaves a broken run.** If the watch server fails to start, or shutdown races `start` after `createRunLog`, the run directory is left with an empty `run.jsonl`. `buildScriptedReport` then throws "empty" permanently for that ID (`service.ts:46-50`, `report.ts:35`). | `src/service.ts:46-50` |
| 12 | Low | **A `maxSteps` below the script length runs the device for `maxSteps` steps and then ends `STEP_LIMIT`.** Rejecting it up front would save the wasted run. | `src/scripted/run.ts:201` |
| 13 | Low | `cancel_run` on a completed run answers "Run X stopped." (`service.ts:91-92`, `mcp/index.ts:33`). The service's `jobs` map is never pruned (`service.ts:20`). | `src/service.ts` |
| 14 | Low (test coverage) | **Core loop behaviour is verified against the spike copy, not the shipped loop.** This covers screen changes on stale retry, the step and wall limits, and forbidden guards (§1). `tests/scripted-production.test.ts` covers only the production-specific fixes. | `tests/scripted-run.test.ts` |

### Smell baseline (judgement calls; no repo standard exists)
- **Duplicated Code:**
  - The `spikes/scripted` copies.
  - `sameScreen` and `snapshotChanged` (`device/index.ts:221`, `run.ts:51`).
  - The ID regex, repeated in `schema.ts:4`, `jev.ts:27`, `scenario/index.ts:5`, `log/index.ts:7`, and `mcp/index.ts:7`.
- **Data Clumps:** the eight-field `step` payload, repeated three times in `run.ts`.
- **Primitive Obsession:** `Record<string, unknown>` event data and string reason codes.
- **Shotgun Surgery:**
  - A model change touches `scripted/jev.ts:8` and `log/index.ts:23`.
  - A version bump touches three files.
  - A new event field needs a matching redactor path.
- **Mysterious Name:** `decide` and `decideMs` for assertion judgment.

### Recommendations (for the downstream tickets)
- Items 1 and 2 before any freeze. For 2, choose one:
  - treat an absent value as `''` when matching; or
  - reject `value: ''` in the schema and correct `docs/usage.md:63` and `SKILL.md:13`.
  Either way, add a test built from a real parsed capture.
- Item 3 before 1.0:
  - make cleanup wait at least as long as the command deadline, or let the adapter release the lock once the late acknowledgement arrives;
  - add stale-lock detection by `pid` liveness;
  - document the lock path and a safe manual procedure.
- Items 4 and 6: state them in the verdict-semantics section of the stable contract.
- Items 7 to 9: fold into the stable-contract ticket: error codes, the environment passed to child processes, and a per-run or expiring watch token.
