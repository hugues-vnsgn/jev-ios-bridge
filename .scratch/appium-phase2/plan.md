# Appium Phase 2 build plan

Phase 2 gives jev-ios-bridge one admission authority for every entry point and platform, named profiles, and a store that can evolve.
The people who notice are users running scenarios on a shared Mac, and the next maintainer who adds Appium in Phase 3.
The rule the program enforces is that every package owns its files, so two workers never edit the same file at the same time.
The program is nine PRs, built by two Codex workers in pairs, in this stack order.
P2.1 write-cost bench, P2.2 named profiles, P2.3 identity pair and schema 3, P2.4 live identity and preflight, P2.5 legacy import and activation tooling, P2.6 authority lifecycle, P2.7 race and recovery suite, P2.8 DeviceLease retirement, P2.9 Phase 2 exit.
The contract for every PR is the [Phase 2 specification](../appium-mcp-migration/phases/phase-2-ownership.md). This plan only splits it.

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs `skills/hugues-mode/playbooks/autopilot-stack.md`, because the work is coupled and the operator keeps merge authority. The main agent is the root and owns the stack's topology. Worker 1 is the Codex pane at Orca leaf `04af4618` and worker 2 is the Codex pane at leaf `b8ac43da`. Every PR is the operator's item and stops at stack-ready. The operator lands the contiguous verified run bottom-up.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

## Program checklist

### Arm the program

- [ ] State the protocol and this plan to the operator, then stop. Start execution only on the operator's explicit go.
- [ ] Before the first build, open the planning PR from `feat/appium-phase2` to `main`, and resolve ticket 10 with the operator's decision. The operator merges it, so every owner reads the spec from trunk.
- [ ] Read these from trunk at program start. Re-read them at every tick.
  - [ ] `git show origin/main:skills/hugues-mode/playbooks/autopilot-stack.md` from the hStack plugin root, and its `autopilot-full.md`
  - [ ] Apply the `swarm` skill; hold on a missing or unreadable file
  - [ ] Invoke the required control skill through the native host; hold if unavailable/denied. No `control-cli` is installed, so lanes drive the harness named in the boot recipe (Appendix C)
  - [ ] `git show origin/main:skills/hugues-mode/playbooks/opening-a-pr.md` from the hStack plugin root
  - [ ] Apply each other bundled leaf skill; reach a consumer or external leaf through the native host; stop on an unavailable, denied or unreadable dependency
- [ ] On the operator's go, arm the audit tick as `/loop 1h` with the tick prompt below. Never leave the cadence to memory.
- [ ] Use this tick prompt, verbatim. "Re-read the execution playbook from trunk. Audit the operation against it and fix drift in this tick. Probe every active lane and judge progress by side effects only. Stand down a stuck lane and dispatch its replacement now. Then post a short status message to the operator in chat only when the audit found a tracked change that no earlier status message reported, such as a PR opened, a code-ready head, a round launched or closed, a verdict, a merge, a stuck agent and the action taken, a blocker added or cleared, or a decision only the operator can make. Name every such change and nothing else. Do not repeat a table, the merged list, or an unchanged blocker. If the audit found none, end the turn with no reply text. Either way, log this tick's row in your decision trail. The row names the items reported, or none."
- [ ] On the operator's hold or stand-down, send every owner a zero-writes order at once.

### Spawn owners

- [ ] Spawn one owner per PR with the full lifecycle the execution playbook names. The owner is a fresh Codex turn in its worker pane, briefed with this plan's PR section, the spec sections it names, and the worktree path.
- [ ] Give each owner its cap and the stop rules. P2.1 3M, P2.2 10M, P2.3 14M, P2.4 16M, P2.5 12M, P2.6 18M, P2.7 12M, P2.8 16M, P2.9 10M processed tokens.
  - [ ] Stop and report when the cap is reached. Check usage after each Build box.
  - [ ] A failing test gets one diagnosis with `diagnosing-bugs`, one fix and one retry. A second failure stops the owner.
  - [ ] A spec gap gets one sentence naming the section and the question. The owner never decides it.
  - [ ] A needed edit to a file outside the PR's Files list stops the owner. The root reassigns it.
  - [ ] Devices are only the private AVD `jev_appium_phase1_20261018`, identity revalidated first. Never the `18pro` simulator, other AVDs, the phone, shared ADB or CoreSimulator services.
  - [ ] Never open or change the real per-user store under `~/Library/Application Support/jev-ios-bridge/admission`. Never print, copy or commit the `TYPESAFE_API_KEY` value. No Jev calls.
- [ ] Follow this dependency graph. Start dependent work only after its parent merges, or base it on the parent branch when the execution playbook stacks.
  - [ ] P2.1 and P2.2 are independent and first. Both branch from `main`. Worker 2 takes P2.1, worker 1 takes P2.2.
  - [ ] P2.3 after P2.1, on worker 2.
  - [ ] P2.4 after P2.2 and P2.3, on worker 1. P2.5 after P2.3, on worker 2. They run in parallel.
  - [ ] P2.6 after P2.4 and P2.5, on worker 1. Worker 2 is idle by design.
  - [ ] P2.7 after P2.6, on worker 2. P2.8 after P2.6, on worker 1. They run in parallel.
  - [ ] P2.9 after P2.7 and P2.8, on worker 2.
- [ ] Hold the file boundaries. Each PR touches only the files in its Files block. The shared-file owners are fixed.
  - [ ] P2.3 is the only writer of the schema in `src/device/admission-sqlite.ts` and of every 2B refusal code in `src/scripted/vocabulary.ts`.
  - [ ] P2.6 is the only writer of lifecycle logic in `src/device/admission.ts` and `src/device/admission-sqlite.ts`.
  - [ ] P2.2 owns device selection in `src/device/index.ts`. P2.3 may change only its admission call sites there.
  - [ ] P2.7 writes tests and test fixtures only. A production defect it finds goes to the root as a report.
- [ ] Hold the review gate. P2.2, P2.4 and P2.5 change an interaction. They wait for the operator's review in chat with screenshots and a video before merge.

### PR mechanics, for every PR

- [ ] Resolve the forge once. Default to `gh`; if `command -v origin` succeeds and Origin can resolve the repository, use `origin pr` for every PR operation. Record any fallback to `gh`. Never require `gt`.
- [ ] Open the PR ready, never draft, per **Opening a PR**. Use the run's built-in PR tool when it has one, else `origin pr create --status open --base <base-branch>` or `gh pr create --base <base-branch>` according to the resolved forge. A stack child targets its parent branch.
- [ ] Run the repo's lint and typecheck once before the PR-facing push. Push with hooks on. Here that is `npm run typecheck`, then `npm run check`.
- [ ] Run `/deslop` before each commit and `/no-comments` before review.
- [ ] Triage every Bugbot and security-reviewer comment per `../references/bugbot-triage.md`.
- [ ] Rebase onto current trunk before the code-ready report and babysit. Keep that merge base in fix rounds. Rebase again only at merge prep, on a `git merge-tree` conflict with trunk, or on a CI failure that comes from a change on trunk.
- [ ] Each owner works in its own worktree `.worktrees/feat/<pr-id>` and stages explicit paths only. Never `git add -A`.

### Verdict and merge, for every PR

- [ ] A full swarm runs once, at the code-ready head. Another full swarm runs only for new behavior, a redesign, or a large new diff. A rebase, a merge-conflict resolution, or a minor fix gets a single verifier at the new head. Run each full swarm per the `swarm` skill. One gates lane. The ten live lanes from the PR's **Verify, live** block. The perf lane from its **Verify, perf** block. Two or more audit lanes, each with its own focus, that read the diff and the receipts and distrust the PR body. The root audits the receipts in the merge-ready report before the verdict.
- [ ] Clean only when every lane is `PASS`. Findings go back to the owner, including a defect that a lane filed as a note. A new head gets a fresh verdict, except for results that stay valid under the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends each clean PR to the linear stack in the order P2.1 to P2.9, with its base set to its parent's branch. The operator lands the contiguous verified run bottom-up. A verdict survives a rebase only when the patch-id is unchanged, per `playbooks/shipping.md`.

### Boot recipe, for every live lane

Each live lane runs on its own cloud VM at the PR head. Drive through `control-ui` or `control-cli` from `cursor-team-kit`. This program has neither, so each lane runs in its own disposable local worktree and drives the observed-host harness, which wires the CLI and MCP server to a fake store and fake devices.

- [ ] `git fetch origin <head-branch> && git checkout <head SHA>`. Run it in `git worktree add /tmp/swarm-<pr-id>/worker-<n>/src <head SHA>`.
- [ ] Run `npm ci`, `npm ci --prefix .scratch/appium-mcp-migration/candidate-stack` and `npm run build`. Ready when `dist/` exists.
- [ ] Drive only through `tests/fixtures/observed-host/harness.ts` (`hostFixture().cli`, `.mcp`, `.spawnOwner`), fake adb and console fixtures under `tests/fixtures/android/`, and `Admission.forTesting({ backend: 'fake' })` stores. Never run the built CLI outside the harness, because the production store is anchored to the OS account. Read-only diagnostics are `admission-maintenance` status commands against the fake store.
- [ ] Save every screenshot to `/tmp/swarm-<pr-id>/worker-<n>/<slug>.png` and return the paths with the report. For this terminal surface the screenshot is the lane's terminal transcript, saved under the same name with `.txt`.

## Measure the per-command write cost on trunk (P2.1)

**Depends on.** None. Branches from `main`.

**Files.**

- [ ] Create `spikes/benchmarks/perf/admission-writes.ts`.
- [ ] Create `.scratch/appium-phase2/perf/admission-writes-baseline.md`.

**Build.**

- [ ] Write the bench. It opens a private on-disk fake store with `Admission.forTesting`, acquires one owner, binds driver `fake`, and awaits `OwnedSession.dispatch` with an inert callback 1,000 times. It keeps the real journal settings (DELETE journal, `synchronous=EXTRA`, `fullfsync=ON`) and never batches.
- [ ] Record dispatch-to-callback latency and whole-dispatch latency separately, as p50, p95 and max, then reopen the store and count settled command rows.

**You see.**

- [ ] `npm exec -- tsx spikes/benchmarks/perf/admission-writes.ts --commands 1000` prints both distributions, `1000 callbacks` and `1000 settled rows`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] The bench's own assertion fails when settled rows differ from callbacks. Run the bench with `--commands 10`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `haiku high` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run `npm run check` at trunk and head. Trunk lacks the bench, so record that and gate the bench run plus a green suite. Save `regression.png`. Pass when both suites pass and the head bench prints both distributions.
- [ ] Lane 2. Run the bench with `--commands 10`. Save `ten.png`. Pass when it prints `10 settled rows`.
- [ ] Lane 3. Run it with `--commands 1000`. Save `thousand.png`. Pass when it prints `1000 settled rows`.
- [ ] Lane 4. Run it twice on one store path. Save `rerun.png`. Pass when the second run refuses a non-empty store or uses a fresh one, and says which.
- [ ] Lane 5. Kill it mid-run with SIGTERM. Save `kill.png`. Pass when a rerun still opens the store and the lost run's rows are a prefix of its commands.
- [ ] Lane 6. Check the store path. Save `path.png`. Pass when it is under the lane's temp directory and never under `~/Library/Application Support`.
- [ ] Lane 7. Grep the bench for `memory` and `BEGIN` batching. Save `settings.png`. Pass when no in-memory store or batched transaction appears.
- [ ] Lane 8. Run it with `TYPESAFE_API_KEY` unset. Save `nokey.png`. Pass when it runs and makes no network call.
- [ ] Lane 9. Run it with `--commands 0`. Save `zero.png`. Pass when it refuses with a usage message.
- [ ] Lane 10. Read the baseline note. Save `note.png`. Pass when it names the machine, the SHA and both distributions.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Dispatch-to-callback p95 for one authorized command. Trunk lacks the bench, so the diff-added work is the bench itself and the end state is a recorded baseline.
- [ ] Probe. Three interleaved runs of `--commands 1000` on the same machine.
- [ ] Baseline. Record the trunk p50 and p95 first, in the baseline note.
- [ ] Rule. No ratio is claimed. A 1,000-command run must finish under 60 seconds, else the measurement is reported as unusable.

**Review gate.** None. P2.1 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends P2.1 to the stack and the operator lands it bottom-up.

## Add named profiles (P2.2)

**Depends on.** None. Branches from `main`.

**Files.**

- [ ] Create `src/profiles.ts` and `tests/profiles.test.ts`.
- [ ] Edit `src/cli.ts`, `src/capture.ts`, `src/mcp/index.ts`, `src/service.ts`, `src/scripted/run.ts` (phase deadlines only), `src/device/index.ts` (selection only), `src/device/factory.ts`.
- [ ] Edit `tests/service.test.ts`, `tests/mcp.test.ts`, `tests/device-factory.test.ts`, `tests/android-capture.test.ts`, `tests/contract.test.ts`, `tests/golden/mcp.json`, `tests/docs.test.ts`, `docs/guide/06-running.md`.

**Build.**

- [ ] Parse `.jev/profiles.json` version 1 in `src/profiles.ts` per Profile selection behavior, with the name pattern, reserved keys and unknown keys refused (`INVALID_PROFILE_FILE`, `PROFILE_NOT_FOUND`).
- [ ] Add `--profile` to `run` and `capture`, and `profile` to MCP `start_scenario`. Apply the precedence explicit, then `defaultProfile`, then the unchanged legacy order.
- [ ] Detect profile and scenario conflicts by name, with no device probe. Same-kind names compare as written (UDIDs case-insensitively), and mixed kinds such as an AVD name against a serial refuse `PROFILE_CONFLICT`, fail closed until P2.4 adds identity agreement.
- [ ] Add budgets `startupMs`, `operationMs` and `cleanupMs`. Defaults are today's hard-coded timeouts for those phases. Requests only tighten, else `PROFILE_CONFLICT`. Propose the upper bounds in the code-ready report for the operator's approval.
- [ ] Record the binding (name plus content digest) on the run and inside the attempt intent JSON. Hand-back and recovery read the binding, never the file.

**You see.**

- [ ] `run scenario.json --profile pixel` with a conflicting scenario device prints `PROFILE_CONFLICT` and leaves the fake store unchanged.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `tests/profiles.test.ts` covers every refusal code with zero mutations, precedence, budgets and the binding. Run `npm exec -- tsx --test tests/profiles.test.ts tests/service.test.ts tests/mcp.test.ts tests/device-factory.test.ts tests/android-capture.test.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `haiku high` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run a legacy iOS scenario without a profile at trunk and head. Save `legacy.png`. Pass when both pick the same device and report the same fields.
- [ ] Lane 2. Run with a valid explicit profile. Save `explicit.png`. Pass when the run records the profile name and digest.
- [ ] Lane 3. Run with only `defaultProfile` set. Save `default.png`. Pass when the default is used and recorded.
- [ ] Lane 4. Run with an unknown profile name. Save `unknown.png`. Pass when it prints `PROFILE_NOT_FOUND` and the fake store is unchanged.
- [ ] Lane 5. Run with a malformed profiles file. Save `malformed.png`. Pass when it prints `INVALID_PROFILE_FILE` and nothing ran.
- [ ] Lane 6. Run with a reserved key such as `signing`. Save `reserved.png`. Pass when it refuses before any effect.
- [ ] Lane 7. Start through MCP with `profile` and a wider `limits`. Save `mcp-wider.png`. Pass when it returns `PROFILE_CONFLICT`.
- [ ] Lane 8. Start through MCP with a tighter `limits`. Save `mcp-tighter.png`. Pass when the run uses the tighter value.
- [ ] Lane 9. Change the profiles file after the run starts, then hand back. Save `binding.png`. Pass when hand-back uses the recorded binding.
- [ ] Lane 10. Run capture with `--profile` on a fake emulator. Save `capture.png`. Pass when capture selects the profile's device.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time from `run` start to the first admission request, in the harness, with and without a profile.
- [ ] Probe. Twenty interleaved trunk and head runs of the legacy scenario, then twenty head runs with a profile.
- [ ] Baseline. Record the trunk median first.
- [ ] Rule. The head legacy median fails above trunk plus 10 percent. The profile run fails above 50 milliseconds more than the head legacy run.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2, 4 and 7 screenshot transcripts into `.scratch/appium-phase2/review/P2.2-review-<slug>.txt`.
- [ ] Record a 30 to 60 second terminal video of lanes 2 and 4 with `asciinema rec`. Save it as `.scratch/appium-phase2/review/P2.2-review.cast`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends P2.2 to the stack and the operator lands it bottom-up.

## Add the identity pair and schema 3 (P2.3)

**Depends on.** P2.1, for the bench used by its perf block.

**Files.**

- [ ] Create `src/device/admission-upgrade.ts`.
- [ ] Edit `src/device/admission.ts`, `src/device/admission-sqlite.ts`, `src/device/admission-maintenance.ts`, `src/device/admission-migration.ts`, `src/device/admission-allocation.ts`, `src/scripted/vocabulary.ts`, `docs/guide/reference/reason-codes.md`.
- [ ] Edit `src/device/index.ts` at admission call sites only.
- [ ] Edit `tests/admission-core.test.ts`, `tests/admission-allocation.test.ts`, `tests/admission-migration.test.ts`, `tests/admission-maintenance-entry.test.ts`, `tests/fixtures/admission-migration/crash-worker.ts`.

**Build.**

- [ ] Add the identity pair (category, value) and `canonicalAllocationId` per Identity, leaving every existing iOS value and allocation ID valid.
- [ ] Write the 2 to 3 step per The 2 to 3 step. Schema 3 holds every Phase 2 record type now, so 2C needs no schema 4. Those are quarantines, fence receipts, component inventory, each command's component, late-reply observations, `upgrades`, recovery claims and the maintenance journal.
- [ ] Add `admission-maintenance upgrade` and `upgrade --recover` per Upgrades, Backup, Receipts and Interrupted upgrades, with the recovery recorded as a maintenance event.
- [ ] Add the immutability triggers, the exact version match, and the fresh-initialization mode per Fresh and test stores.
- [ ] Add every 2B refusal code, including the ones P2.5 uses (`UPGRADE_BLOCKED` and the import codes from Legacy lease import).

**You see.**

- [ ] On a fixture schema 2 store, `admission-maintenance upgrade <declaration>` prints a receipt with row counts and digests before and after, and the backup path.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Upgrade cases from Verification and exit. 2 to 3 with preserved counts and digests, crashes before and after COMMIT with checked `--recover`, identical rerun, `UPGRADE_BLOCKED`, wrong-version openers both ways, trigger-blocked edits and chain-built fresh stores. Run `npm exec -- tsx --test tests/admission-core.test.ts tests/admission-allocation.test.ts tests/admission-migration.test.ts tests/admission-maintenance-entry.test.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `haiku high` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run one observed action against a fresh fake store at trunk and head. Save `regression.png`. Pass when both complete and the head store reports schema 3.
- [ ] Lane 2. Upgrade a fixture schema 2 store. Save `upgrade.png`. Pass when the receipt's before and after counts match.
- [ ] Lane 3. Repeat the identical upgrade. Save `rerun.png`. Pass when it returns the stored receipt with no change.
- [ ] Lane 4. Kill the upgrade before COMMIT, then run `--recover`. Save `recover-before.png`. Pass when the store is schema 2, matches the backup and the guard is gone.
- [ ] Lane 5. Kill it after COMMIT, then run `--recover`. Save `recover-after.png`. Pass when the store is schema 3 with the receipt and a recovery event.
- [ ] Lane 6. Upgrade with an active attempt. Save `blocked.png`. Pass when it prints `UPGRADE_BLOCKED` listing the attempt.
- [ ] Lane 7. Open a schema 3 store with the trunk binary. Save `old-binary.png`. Pass when trunk refuses `STATE_UNAVAILABLE` naming the version.
- [ ] Lane 8. Try to edit a terminal outcome with sqlite3. Save `trigger.png`. Pass when the trigger aborts the write.
- [ ] Lane 9. List the backup folder. Save `backup.png`. Pass when the backup is mode 0700 and its sha256 matches the receipt.
- [ ] Lane 10. Read an existing allocation by ID after upgrade. Save `allocation.png`. Pass when the record and its checksum are unchanged.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Dispatch-to-callback p95 from the P2.1 bench, plus upgrade wall time on the largest fixture store.
- [ ] Probe. Three interleaved bench runs at trunk and head, then three upgrades of a copy of the fixture store.
- [ ] Baseline. Use the trunk p95 recorded by P2.1, remeasured first on the same machine.
- [ ] Rule. Head p95 fails above trunk plus 20 percent. An upgrade of the fixture store fails above 30 seconds.

**Review gate.** None. P2.3 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends P2.3 to the stack and the operator lands it bottom-up.

## Resolve device identity live before admission (P2.4)

**Depends on.** P2.2 and P2.3.

**Files.**

- [ ] Create `src/device/identity.ts` and `src/device/android/probe.ts`.
- [ ] Edit `src/device/index.ts`, `src/device/android/driver.ts`, `src/device/factory.ts`, `src/scripted/vocabulary.ts` (identity codes only), `docs/guide/reference/reason-codes.md`.
- [ ] Create fixtures under `tests/fixtures/android/console/`. Edit `tests/android-device.test.ts`, `tests/android-driver.test.ts`, `tests/device.test.ts`.

**Build.**

- [ ] Resolve every device name live per Resolution, with `DEVICE_AMBIGUOUS` (including one AVD on several transports), `DEVICE_NOT_FOUND`, `DEVICE_IDENTITY_CONFLICT` and `DEVICE_IDENTITY_UNAVAILABLE` with its closed reasons. Refuse `ios-phone` with `CATEGORY_NOT_ENABLED`.
- [ ] Read emulator provenance through the read-only runner in `probe.ts` per Emulator provenance and Pre-admission identity probes. Remove the `avd || name` fallback in `driver.ts`.
- [ ] Run every check in Identity and preflight before effects, and record the probe replies in the attempt intent once admitted.
- [ ] Replace P2.2's fail-closed mixed-kind profile conflict with identity agreement, so aliases of one device agree and different identities refuse `PROFILE_CONFLICT`.
- [ ] Run one live trial on the private AVD only. Capture the exact console stdout for success, missing, empty and mismatched token, `offline` and a `-read-only` second instance as fixtures.

**You see.**

- [ ] A scenario naming an AVD with two running instances prints `DEVICE_AMBIGUOUS` and makes no device command.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] The identity-aliasing list in Verification and exit passes against the fake adb and console replaying the captured fixtures. Run `npm exec -- tsx --test tests/android-device.test.ts tests/android-driver.test.ts tests/device.test.ts tests/device-factory.test.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `haiku high` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run a legacy iOS scenario by UDID at trunk and head. Save `ios-legacy.png`. Pass when both admit the same identity.
- [ ] Lane 2. Same AVD name under two roots. Save `two-roots.png`. Pass when it prints `DEVICE_AMBIGUOUS`.
- [ ] Lane 3. A `-read-only` second instance. Save `read-only.png`. Pass when both instances share one key and the name refuses without a serial.
- [ ] Lane 4. Empty console stdout. Save `empty.png`. Pass when it prints `DEVICE_IDENTITY_UNAVAILABLE` with `MALFORMED_PROVENANCE`.
- [ ] Lane 5. A `KO:` reply. Save `ko.png`. Pass when it refuses with `MALFORMED_PROVENANCE`.
- [ ] Lane 6. Guest property and console disagree. Save `conflict.png`. Pass when it prints `DEVICE_IDENTITY_CONFLICT` and the device is not quarantined.
- [ ] Lane 7. Emulator version 29. Save `old-emulator.png`. Pass when the reason is `EMULATOR_VERSION_UNSUPPORTED`.
- [ ] Lane 8. A console not on loopback. Save `remote.png`. Pass when the reason is `REMOTE_CONSOLE`.
- [ ] Lane 9. A reserved `ios-phone` name. Save `ios-phone.png`. Pass when it prints `CATEGORY_NOT_ENABLED` before any effect.
- [ ] Lane 10. Grep every log and record from lanes 2 to 9 for the console token. Save `token.png`. Pass when no token or `grpc.` value appears.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time from run start to admission for an Android scenario on the fake console. Trunk resolves without probes, so also time the probe step alone.
- [ ] Probe. Twenty interleaved trunk and head runs on the fake console.
- [ ] Baseline. Record the trunk median first.
- [ ] Rule. The probe step fails above 500 milliseconds on the fake console. The head end-to-end median fails above trunk plus 600 milliseconds.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2, 4 and 6 screenshot transcripts into `.scratch/appium-phase2/review/P2.4-review-<slug>.txt`, plus the live trial's captured stdout list.
- [ ] Record a 30 to 60 second terminal video of lanes 2 and 6 with `asciinema rec`. Save it as `.scratch/appium-phase2/review/P2.4-review.cast`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends P2.4 to the stack and the operator lands it bottom-up.

## Import legacy leases and add activation tooling (P2.5)

**Depends on.** P2.3.

**Files.**

- [ ] Create `src/device/admission-import.ts`, `tests/admission-import.test.ts` and `docs/guide/admission-activation.md`.
- [ ] Edit `src/device/admission-maintenance.ts` (new subcommands only), `src/device/admission-migration.ts` (lease source reading only), `docs/guide/14-observed-actions.md`, `tests/admission-maintenance-entry.test.ts`.
- [ ] Read `src/device/lease.ts` but never edit it.

**Build.**

- [ ] Add the repeatable offline import per Legacy lease import. Every leftover legacy lease becomes a `historical` quarantine, UUIDs exact and other names name-matched, and a live PID refuses.
- [ ] Add the read-only `admission-maintenance preflight`, and make `upgrade` and `import` repeat its checks, per the Activation runbook requirements.
- [ ] Write the runbook text and the public guide update. Nothing here runs against the real store.

**You see.**

- [ ] `admission-maintenance preflight` on a fixture store with a leftover lease prints each check, the lease and its planned quarantine, and changes nothing.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `tests/admission-import.test.ts` covers UUID and name-matched imports, a live PID, a repeated import and preflight's zero writes. Run `npm exec -- tsx --test tests/admission-import.test.ts tests/admission-maintenance-entry.test.ts tests/admission-migration.test.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `haiku high` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run the existing offline migration on a fixture at trunk and head. Save `migration.png`. Pass when both receipts preserve the same logical records.
- [ ] Lane 2. Preflight a clean fixture store. Save `preflight-clean.png`. Pass when every check passes and the store hash is unchanged.
- [ ] Lane 3. Preflight with a running writer. Save `preflight-writer.png`. Pass when it reports the writer and refuses to call the store ready.
- [ ] Lane 4. Import a UUID lease. Save `import-uuid.png`. Pass when it becomes a `historical` quarantine on that exact device.
- [ ] Lane 5. Import a name-only lease. Save `import-name.png`. Pass when it is name-matched and the import receipt says so.
- [ ] Lane 6. Import a lease whose PID is alive. Save `live-pid.png`. Pass when the import refuses and writes nothing.
- [ ] Lane 7. Repeat an identical import. Save `repeat.png`. Pass when it returns the same receipt with no new quarantine.
- [ ] Lane 8. Run `upgrade` while preflight fails. Save `upgrade-gated.png`. Pass when upgrade refuses with the same failing check.
- [ ] Lane 9. Follow the runbook's steps on a fixture store. Save `runbook.png`. Pass when each step's printed result matches the runbook text.
- [ ] Lane 10. Check the source lease files after import. Save `sources.png`. Pass when their bytes and hashes are unchanged.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Preflight and import wall time on a fixture with 200 leftover leases. Trunk has no import, so only absolute budgets apply.
- [ ] Probe. Five runs of each on fresh copies of the fixture.
- [ ] Baseline. Record trunk migration wall time on the same fixture first, as context only.
- [ ] Rule. Preflight fails above 5 seconds and import above 15 seconds.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2, 5 and 9 screenshot transcripts into `.scratch/appium-phase2/review/P2.5-review-<slug>.txt`.
- [ ] Record a 30 to 60 second terminal video of lanes 2 and 5 with `asciinema rec`. Save it as `.scratch/appium-phase2/review/P2.5-review.cast`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends P2.5 to the stack and the operator lands it bottom-up.

## Make admission the authority for every command and release (P2.6)

**Depends on.** P2.4 and P2.5.

**Files.**

- [ ] Edit `src/device/admission.ts`, `src/device/admission-sqlite.ts`, `src/device/admission-allocation.ts`, `src/scripted/vocabulary.ts` (release codes only), `docs/guide/reference/reason-codes.md`.
- [ ] Edit `tests/admission-core.test.ts`, `tests/admission-allocation.test.ts`, `tests/admission-driver.test.ts`, `tests/fixtures/admission-core-worker.ts`, `tests/fixtures/admission-core-protocol.ts`.

**Build.**

- [ ] Record each command with its component before it is sent, and turn outstanding commands uncertain at closure, per Release state contract and Every command is recorded.
- [ ] Validate fence receipts in the authority with the ordered refusal table in Release. Derive availability from owner and covered quarantines, replacing `terminal()` setting device state.
- [ ] Append late replies as observations, retrieve identical retries after a lost COMMIT, and recover a dead owner at admission under one exclusive recovery claim per generation.

**You see.**

- [ ] A receipt for an earlier generation prints `STALE_OWNER` and leaves the outcome, quarantine and capacity rows unchanged.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] The release-state prototype cases, each with its refusal code and unchanged records. Run `npm exec -- tsx --test tests/admission-core.test.ts tests/admission-allocation.test.ts tests/admission-driver.test.ts tests/appium-admission.test.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `haiku high` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run a completed observed action at trunk and head. Save `happy.png`. Pass when both end with the device available and the outcome completed.
- [ ] Lane 2. An inconclusive action with a full receipt. Save `inconclusive.png`. Pass when the lease frees, the outcome stays inconclusive and the allocation stays quarantined.
- [ ] Lane 3. A late reply after closure. Save `late.png`. Pass when it is an observation and no disposition changes.
- [ ] Lane 4. A lost COMMIT reply, then an identical retry. Save `lost-commit.png`. Pass when the retry retrieves the record with zero device effects.
- [ ] Lane 5. Kill the owner, then admit again. Save `abandoned.png`. Pass when admission records recovery and a `native` quarantine before any sweep.
- [ ] Lane 6. Two runs recover the same generation at once. Save `claim.png`. Pass when exactly one holds the claim and the other makes no device command.
- [ ] Lane 7. A receipt for an earlier generation. Save `stale.png`. Pass when it prints `STALE_OWNER`.
- [ ] Lane 8. A probe receipt naming nothing. Save `unbound.png`. Pass when it prints `UNBOUND_PROOF`.
- [ ] Lane 9. An unknown creation. Save `unknown-creation.png`. Pass when every receipt refuses `NOT_COVERABLE`.
- [ ] Lane 10. An imported historical quarantine. Save `historical.png`. Pass when every receipt refuses and the quarantine stays.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Dispatch-to-callback p95 from the P2.1 bench, now including the per-command record.
- [ ] Probe. Three interleaved bench runs at trunk and head.
- [ ] Baseline. Remeasure trunk first on the same machine.
- [ ] Rule. Head p95 fails above trunk plus 25 percent or above 20 milliseconds absolute.

**Review gate.** None. P2.6 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends P2.6 to the stack and the operator lands it bottom-up.

## Prove the races and crash recovery (P2.7)

**Depends on.** P2.6.

**Files.**

- [ ] Create `tests/admission-races.test.ts`.
- [ ] Edit `tests/fixtures/public-contention.ts`, `tests/fixtures/observed-host/harness.ts`, `tests/observed-public-races.test.ts`, `tests/observed-host-fault.test.ts`.

**Build.**

- [ ] Write H01, H02, H03, H11, P3 and P4 from `~/.codex/reports/jev-ios-bridge/task_892837c8ab47/proof-plan.md` as tests, reusing the admission core worker barriers and the host fixture.
- [ ] Add the cross-process scripted, observed and capture competition and the HOME, cwd, project and temp alias cases from Verification and exit.

**You see.**

- [ ] `tests/admission-races.test.ts` names each case by its H or P id and passes at the P2.6 head.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Each case fails when its guarded write is removed in a scratch copy, recorded once in the PR. Run `npm exec -- tsx --test tests/admission-races.test.ts tests/observed-public-races.test.ts tests/observed-host-fault.test.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `haiku high` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run the existing public race suite at trunk and head. Save `regression.png`. Pass when both pass.
- [ ] Lane 2. H01 fifty times. Save `h01.png`. Pass when every run sends at most one creation.
- [ ] Lane 3. H02 fifty times. Save `h02.png`. Pass when no run sends after closure.
- [ ] Lane 4. H03 with an authority restart. Save `h03.png`. Pass when no buffered request is submitted.
- [ ] Lane 5. H11 at every journal boundary. Save `h11.png`. Pass when at most one issuer exists and uncertainty is retained.
- [ ] Lane 6. P3 across reservation boundaries. Save `p3.png`. Pass when duplicates retrieve or conflict without a second creation.
- [ ] Lane 7. P4 with writer death. Save `p4.png`. Pass when the admission, issue and closure order is monotonic.
- [ ] Lane 8. Scripted and observed runs race for one device. Save `cross-entry.png`. Pass when one owner wins and the loser's state is unchanged.
- [ ] Lane 9. Two HOME values for one OS account. Save `aliases.png`. Pass when both reach the one production root seam.
- [ ] Lane 10. Run the whole file with `--test-concurrency=4`. Save `concurrency.png`. Pass when it passes three times in a row.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall time of `npm test`. Trunk lacks the new file, so also time `tests/admission-races.test.ts` alone.
- [ ] Probe. Three interleaved `npm test` runs at trunk and head.
- [ ] Baseline. Record the trunk median first.
- [ ] Rule. The new file fails above 120 seconds alone. Head `npm test` fails above trunk plus 150 seconds.

**Review gate.** None. P2.7 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends P2.7 to the stack and the operator lands it bottom-up.

## Retire DeviceLease as an ownership authority (P2.8)

**Depends on.** P2.6.

**Files.**

- [ ] Create `src/device/operation-tracker.ts`.
- [ ] Edit `src/device/lease.ts`, `src/device/index.ts`, `src/device/android/driver.ts`, `src/device/android/adb.ts`, `GLOSSARY.md`.
- [ ] Edit `tests/lease.test.ts`, `tests/device-lease.test.ts`, `tests/android-ledger.test.ts`, `tests/android-adb.test.ts`, `tests/android-driver.test.ts`, `tests/device.test.ts`.

**Build.**

- [ ] Shrink `DeviceLease` to in-process mechanics renamed `OperationTracker`, and keep the `$TMPDIR` lock file only as the compatibility marker, per Retiring DeviceLease as an ownership authority.
- [ ] Move `ownedProcesses` and the command ledger into admission's component inventory and fence receipts. Give iOS the recovery at admission and remove Android's reclaim on process death.
- [ ] Add adb stop evidence. Run one live check on the private AVD to fix the device-side process match, and treat an ambiguous match as no proof.
- [ ] Generalize **Fence** in `GLOSSARY.md` to any native component.

**You see.**

- [ ] Killing an Android owner mid-command, then starting a new run, prints the recovery, the sweep and the accepted receipt, or `DEVICE_QUARANTINED`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] The lease retirement case in Verification and exit, with the reused-PID split from ticket 08. Run `npm exec -- tsx --test tests/lease.test.ts tests/device-lease.test.ts tests/android-ledger.test.ts tests/android-adb.test.ts tests/android-driver.test.ts tests/device.test.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `haiku high` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run an Android scenario to completion on the fake adb at trunk and head. Save `regression.png`. Pass when both complete and the head leaves no marker.
- [ ] Lane 2. Kill the owner with an outstanding adb command. Save `kill-adb.png`. Pass when the next admission recovers only after stop evidence.
- [ ] Lane 3. Same with an outstanding agent and stream. Save `kill-agent.png`. Pass when every component is in the receipt.
- [ ] Lane 4. A reused owner PID. Save `owner-pid.png`. Pass when recovery is permitted.
- [ ] Lane 5. A reused component PID. Save `component-pid.png`. Pass when no stop is sent to the new process and release refuses.
- [ ] Lane 6. An offline device during recovery. Save `offline.png`. Pass when it refuses `DEVICE_QUARANTINED` and the quarantine stays.
- [ ] Lane 7. An unknown marker with a dead PID. Save `unknown-marker.png`. Pass when it refuses `DEVICE_BUSY`.
- [ ] Lane 8. An uncertain MobileBuildMCP command on iOS. Save `mbm-uncertain.png`. Pass when the device stays quarantined.
- [ ] Lane 9. A settled one-shot MobileBuildMCP command. Save `mbm-settled.png`. Pass when release succeeds.
- [ ] Lane 10. Watch the marker file through one run. Save `marker.png`. Pass when it appears after admission and disappears at release only.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall time of a 50-step Android scenario on the fake adb, where every read-only query is now recorded.
- [ ] Probe. Ten interleaved trunk and head runs.
- [ ] Baseline. Record the trunk median first.
- [ ] Rule. Head fails above trunk plus 25 percent.

**Review gate.** None. P2.8 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends P2.8 to the stack and the operator lands it bottom-up.

## Close Phase 2 with exit evidence (P2.9)

**Depends on.** P2.7 and P2.8.

**Files.**

- [ ] Create `.scratch/appium-phase2/phase-2-exit.md`.
- [ ] Edit `.scratch/appium-mcp-migration/phases/phase-2-ownership.md` (status line only), `tests/contract.test.ts`, `tests/mcp.test.ts`, `tests/docs.test.ts`.

**Build.**

- [ ] Walk every bullet of Verification and exit and link the test or receipt that covers it. A bullet with no evidence is a blocker in the exit note, not a pass.
- [ ] Rerun the P2.1 bench at the stack head and record the per-command write cost against the P2.1 baseline.
- [ ] Add the public contract checks for the new refusal codes and the `profile` field.

**You see.**

- [ ] `.scratch/appium-phase2/phase-2-exit.md` lists every exit bullet with a link and a verdict, and the measured write cost.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Contract and docs tests cover every new code and field. Run `npm run check`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `haiku high` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run the P2.2 lane 1 legacy scenario at trunk and head. Save `legacy.png`. Pass when both match.
- [ ] Lane 2. Run a profile scenario end to end. Save `profile.png`. Pass when it completes and records its binding.
- [ ] Lane 3. Upgrade, import and run on one fixture store. Save `upgrade-run.png`. Pass when the run admits on schema 3.
- [ ] Lane 4. Kill and recover an owner. Save `recover.png`. Pass when recovery needs an accepted receipt.
- [ ] Lane 5. Cross-entry competition. Save `cross-entry.png`. Pass when one owner wins.
- [ ] Lane 6. Every refusal code once through MCP. Save `codes.png`. Pass when each matches the reason-code guide.
- [ ] Lane 7. Install the packed tarball in a clean folder. Save `packed.png`. Pass when the observed packaging proof passes.
- [ ] Lane 8. Read the activation runbook against `admission-maintenance --help`. Save `runbook.png`. Pass when every command named exists.
- [ ] Lane 9. Read the exit note. Save `exit.png`. Pass when no bullet lacks a link.
- [ ] Lane 10. Open the real-store path read-only check. Save `real-store.png`. Pass when no lane in the program touched `~/Library/Application Support/jev-ios-bridge/admission`, by its unchanged modification time.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Dispatch-to-callback p95 from the P2.1 bench at the stack head.
- [ ] Probe. Three interleaved runs at the P2.1 trunk SHA and the stack head.
- [ ] Baseline. Remeasure the P2.1 trunk SHA first.
- [ ] Rule. Head p95 fails above trunk plus 30 percent or above 20 milliseconds absolute.

**Review gate.** None. P2.9 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends P2.9 to the stack and the operator lands it bottom-up.

## Close the program

- [ ] Every box above is checked with its evidence.
- [ ] Reply to the operator with the report the execution playbook names.

## Appendix A. Prototype evidence

No new prototype ran for this plan. The open questions were product calls the operator settled in tickets 01 to 09, and the cross-section gaps were settled in ticket 08.

- The release-state model was prototyped on branch `prototype/release-state`. P2.6 implements its cases.
- Emulator provenance was researched on branch `research/emulator-provenance`. P2.4 implements its steps.
- File overlap was mapped read-only by both workers at `8ca631bb9`. The reports are `~/.codex/reports/jev-ios-bridge/phase2-briefs-explore/2a-2b-seams.md` and `2c-2d-seams.md`.

Still unproven, each with the PR that proves it.

- The exact console stdout for token and offline cases. P2.4's live trial captures it.
- The device-side process match for an adb command. P2.8's live check fixes it.
- The cost of one durable write per command. P2.1 measures trunk and P2.9 measures the head.
- The upper bounds of the three profile budgets. P2.2 proposes them for the operator.

## Appendix B. Alternatives rejected

- Four PRs, one per roadmap package. Rejected because 2A, 2B and 2C all write `src/device/admission.ts` and `src/device/admission-sqlite.ts`, so two workers could not build in parallel and each PR would be too large to review.
- Building 2A and 2B in parallel with no owner for the identity type. Rejected because the seam report found definite collisions in the admission files and fixtures.
- A schema 3 without the 2C record types. Rejected because each later record type needs another upgrade step and another backup on the real store.
- Ten cloud VM lanes on real devices. Rejected because the devices are private and used one at a time, so lanes use the fake-store harness and live device work stays with the owner, serialized.

## Appendix C. Risks

- No `control-cli` skill is installed. Lanes drive the observed-host harness instead, which exercises the same CLI and MCP code over real processes. Watch in every PR that no lane runs the built CLI outside the harness.
- A lane or owner could open the real per-user store, because the production root ignores HOME. P2.9 lane 10 checks its modification time, and every owner brief forbids it.
- P2.2 and P2.3 both edit `src/device/index.ts`. P2.3 is limited to admission call sites, and the second to land rebases.
- `src/scripted/vocabulary.ts` and the reason-code guide take additions from P2.3, P2.4 and P2.6. The hunks are append-only, and the root rebases them in stack order.
- P2.6 is the largest change and holds the single authority. It gets the `interrogate` skill before code-ready, and worker 2 is idle while it runs.
- Codex panes ask approval for git and gh commands. The root approves only commands named in the owner's brief.

## Appendix D. Links and reading list

- The contract is `.scratch/appium-mcp-migration/phases/phase-2-ownership.md` and tickets 01 to 10 under `.scratch/appium-phase2/issues/`.
- Read ADR-0011 and ADR-0012 under `docs/adr/` before P2.3 and P2.6.
- The race case definitions are in `~/.codex/reports/jev-ios-bridge/task_892837c8ab47/proof-plan.md`, lines 30 to 40 and 11 to 12.
- P2.3 and P2.6 get the `how` skill before Build and the `interrogate` skill before code-ready.
- The decision trail follows the `show-me-your-work` skill and stays local, in the main agent's session notes.
