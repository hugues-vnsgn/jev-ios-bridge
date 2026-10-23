# Appium Phase 3 build plan

Status: APPROVED TO BUILD on 2026-10-23. The owner asked to move faster and
told the root to decide and start. The remaining planning tickets no longer
hold the whole plan. Each one gates only the PR that needs it (see "Open
gates").

Phase 3 builds the Appium device driver behind the bridge's existing contracts
and switches every entry point to it. Users notice nothing until the last PR,
and after that nothing is supposed to change except the additive fields the
specification lists. Old backend code stays unused until Phase 4 removes it.
There is no release before Phase 4 passes; an urgent 1.4.x fix branches from
the `v1.4.0` tag.

The contract for every PR is the
[Phase 3 specification](../appium-mcp-migration/phases/phase-3-adapter.md). This
plan only splits it into PRs. When the two disagree, the specification wins,
and the root asks the owner.

## How the build runs

- **Roles.**
  - **Root:** Claude. Writes each brief, verifies, owns branch topology,
    asks the owner.
  - **Worker A:** the Codex pane at Orca leaf `04af4618`. It owns the device
    lane: it finishes P08, runs P19, then builds P3.6 and P3.7.
  - **Worker B:** a second Codex pane at Orca leaf `fdc9c39c`. It owns the main
    chain: P3.1, P3.2, P3.3, P3.4, P3.5, P3.8, P3.9, P3.10.
  - Both workers use GPT-6.1-Sol only, with no subagent or reviewer on any
    other model. Only one of them touches a device at a time.
  - **Owner:** merges every PR.
- **Order.** PRs are stacked. The planning PR (`feat/appium-phase3`) is the
  root, and each build PR branches from its parent's branch and targets it, so
  no worker waits for a merge. The owner merges bottom-up with merge commits,
  and GitHub retargets each child to `main` as its parent lands. The root is
  the only stacker. When a parent changes, the child merges it in and never
  rebases.
- **Briefs.** Each PR's brief is this plan's PR section plus
  `~/.codex/reports/jev-ios-bridge/phase3-build/owner-rules.md`. Before writing
  the brief, the root re-reads both against trunk.
- **Merge bar (PLAN-B).**
  - CI 6/6, including `node tests/fixtures/observed-packaging/proof.mjs`
  - the PR's unit box checked
  - no open P0/P1 after at most two fix rounds
  - then the owner's yes

  P0/P1 means a stuck store, a wrong owner, data loss, a forbidden side effect,
  or a specification MUST that is not met. Minor or pre-existing findings go to
  `FOLLOW-UPS.md`, never into a fix round.
- **Reviews.** A review starts only after CI is green on the head. Deep reviews
  (spec plus correctness, by the root and one independent Claude reviewer) are
  only for P3.4, P3.7 and P3.10. The other PRs get the root's spec check.
- **Caps.** Set from Phase 2's real spend (P2.4 about 50M, P2.6 about 27M,
  small fix PRs 4–10M). Hitting a cap triggers a report, never a halt
  mid-edit.
- **Tests.** Every behaviour change is test-first, with the red run recorded.
  Unit tests use the fake admission store backend
  (`Admission.forTesting({ backend: 'fake' })`), because Phase 2 showed that the
  durable store makes unit tests slow. There are no speed gates: a gate against
  a zero-latency fake proves nothing, and the timings in the specification are
  session cost, measured live in Phase 4.

## The fake Appium MCP and its recorded wire

This settles the map's "Fake MCP provider fidelity" item. The owner confirms it
when approving this plan.

- **Recording.** `scripts/record-appium-wire.mjs` runs a named case on the
  private pair through the real frozen stack. It records every MCP request and
  reply, with secrets and typed values masked, into
  `tests/fixtures/appium-wire/<platform>/<case>.jsonl`. The header line carries
  the stack lock hash, the WDA tree hash, the extension version and the
  fixture-app hash.
- **Replay.** The fake provider (`tests/fixtures/appium-wire/fake-mcp.ts`)
  serves those exchanges over the same stdio transport. It can also inject
  faults:
  - a late reply
  - a lost reply
  - a malformed envelope
  - a dead child
  - a disconnect
- **Staleness.** A test refuses a recording whose header hashes differ from the
  current stack constants. A re-freeze therefore forces a re-record and cannot
  silently keep old wire. Re-recording is a root-run step on the private pair,
  never a CI step.

## PRs

### P3.1 Ship the frozen stack

- **Depends on.** Nothing. Cap 15M.
- **Owns.**
  - `stack/` (the candidate `package.json` and lock, byte for byte)
  - `stack/wda/` (the 7.5 MB WDA archive and its provenance JSON, from the
    root's verified backup)
  - `scripts/build-stack-archive.mjs` and `scripts/build-plugin.mjs`
  - the `files` list in `package.json`
  - the notices generator and `THIRD_PARTY_NOTICES.md`
  - `src/appium/stack.ts`
  - the CI workflow's install step
  - `tests/fixtures/observed-packaging/proof.mjs`
  - `docs/maintainers/re-freeze.md`
- **Build.** Follows "Entry and composition":
  - the stack archive, its manifest and the WDA archive
  - first-use offline extraction into one content-addressed per-account
    directory, then the marker and loaded-file re-check
  - the host check: Apple silicon, Node 24 or later
  - the iOS 26.5 / Xcode 27.0 warning
  - the re-freeze recipe
- **Unit box.**
  - Tamper with the archive, the manifest, the marker and the runner: each is
    refused before any session.
  - An Intel host and Node 22 refuse before effects.
  - The packaging proof finds both archives and the notices file in the
    tarball and the plugin zip, and extracts them offline.
- **Spikes recorded.** The Application Support path with its space. Installing
  a roughly 100 MB plugin from a real release stays a Phase 4 live claim. Two
  processes doing first use at once is covered by a test that uses
  the admission store as the lock.

### P3.2 Private MCP client, sessions and the fake provider

- **Depends on.** P3.1. Cap 25M.
- **Owns.**
  - `src/appium/client.ts`: the `@modelcontextprotocol/sdk` 1.32.1 `Client`,
    a child with a restricted environment and a private HOME, `delete_all`, and
    the protocol-version check
  - `src/appium/session.ts`: the pinned capability profiles per platform and
    path (from "Locked device effects"), refusal of forbidden capabilities and
    relaxed-security tools, the settings call with readback, and
    `skipLogCapture`
  - `tests/fixtures/appium-wire/` with the recorder and the fake provider
- **Build.**
  - the child lifecycle
  - one session per command
  - the driven-pause keep-alive
  - recording the first wire cases on the fixture app
- **Unit box.**
  - A forbidden capability, `webDriverAgentUrl`, a `settings[...]` capability
    and a missing `skipLogCapture` each refuse.
  - A failed settings readback refuses.
  - Disconnect and dead-child faults leave component records for the fence.
  - A stale recording is refused.

### P3.3 Public-core extension

- **Depends on.** P3.2 and ticket 09. Cap 12M.
- **Owns.** `src/appium/extension/`.
- **Build.** The allowlisted, session-bound, versioned operations that ticket 09
  locks: structured results, session inventory, terminate, `startActivity`,
  replace text, and whatever else 09 names. The extension imports the
  extracted tree by absolute file URL, and takes `zod` from the same tree.
- **Unit box.**
  - A non-allowlisted operation is refused.
  - A wrong session is refused.
  - A version mismatch is refused.

### P3.4 Observation (deep review)

- **Depends on.** P3.3. Cap 25M.
- **Owns.**
  - `src/appium/observe/`: bounded XML parsing with DTD and entity refusal,
    the normalizer, completeness, the bridge hash and element-reference
    issuance
  - `src/device/settle.ts`: the Android loop moved here and shared
  - `src/device/image.ts`: downscaling to a JPEG of at most 800 px
  - the tap-alias rule rename in `src/scripted/select.ts`
- **Build.** "Locked observation choices" and "Locked settling and screen
  change":
  - the pinned settings
  - the three iOS gap fixes
  - truncation refusal at the depth limit
  - snapshot-bound `eN` references
  - one settle loop
  - a hash that excludes the status bar
- **Unit box.**
  - Recorded wire replays to snapshots that match the committed goldens
    (`android-capture.json`, `android-elements.json`, `android-render.json`
    byte-identical), or the ADR-0004/0006 corpus gate allows the change.
  - A depth-70 leaf refuses.
  - A reference from an old snapshot or another session refuses.
  - The duplicate and alias cases from ticket 19 resolve as locked.

### P3.5 Operations

- **Depends on.** P3.4, 07 and 08. Cap 25M.
- **Owns.** `src/appium/operations/`.
- **Build.** These follow the forms that 07 and 08 lock:
  - tap
  - replace text, as the locked sequence
  - swipe, scroll and back
  - the observed tap with a hold
  - the Android `tapAt` conversion from the downscaled screenshot
  - Android restart through `startActivity`
  - terminate and close

  Every authorized input is exactly one native attempt. Dispatch closes on a
  lost acknowledgement, and the partial outcome is kept. Echoes are filtered
  before they reach logs. iOS attach and iOS `tapAt` stay explicit refusals.
- **Unit box.**
  - Missing, ambiguous and stale targets dispatch nothing.
  - A lost reply between the clear and set steps does not retype.
  - The shown value comes from a fresh capture.
  - A typed value never appears in a log.

### P3.6 Native helpers and diagnostics

- **Depends on.** P3.1 only. The native helpers never use the MCP client, so this PR branches from P3.1 beside P3.2. Cap 15M.
- **Owns.**
  - `src/appium/native/`: the iOS `simctl launch --console-pty` launch and its
    console owner, the `log stream` observer, observed-preparation
    `simctl boot` and `install`, and the Android wake and read-only probes
  - the console and `log stream` paths in `src/device/logs.ts`
- **Build.** "Locked native steps":
  - `APP_EXITED` by the console PID, with expected stops marked
  - unavailable versus empty
  - logcat and the exit watch kept unchanged
- **Unit box.**
  - A lost console reads unavailable or unknown, never empty or healthy.
  - A bridge-initiated stop is not an app failure.
  - The helpers never read the UI.

### P3.7 Fencing (deep review)

- **Depends on.** P3.2. It can run before P3.4 when the worker is free. Cap 40M.
- **Owns.**
  - `src/appium/fence/`
  - `src/device/admission-sqlite.ts` (component and receipt kinds; this PR is
    its only writer in Phase 3)
  - `src/device/admission.ts` (the recovery sweep)
  - `src/device/android/recovery.ts`
- **Build.**
  - "Fencing Appium components": the Phase 1 Python mechanisms ported to
    TypeScript, the stop proof per component, the Android settings restore,
    and foreign automation by owned inventory
  - the carried Phase 2 items: branded identity types, and independently
    nullable recovery closure fields
  - an ADR-0012 offline upgrade, if the schema changes
- **Unit box.**
  - Each receipt kind, and its absence: an absent receipt quarantines.
  - TERM, 5 s, KILL inside 45 s.
  - The dead-owner sweep restores and releases only with every receipt.
  - A foreign UiAutomator2 or WDA gives `DEVICE_BUSY` exit 3; the bridge's own
    components are not foreign.

### P3.8 Appium device driver

- **Depends on.** P3.4–P3.7. Cap 25M.
- **Owns.** `src/appium/driver.ts`, which implements `DeviceDriver` and the
  preparation and observed-action roles, plus the report fields.
- **Build.**
  - `prepared.stack`, `error.vendorSource`, `agentSha256` as the UiAutomator2
    APK hash, and no iOS reference metrics
  - the additive goldens: `report-json.json`, `evidence-layout.json`,
    `observed-replies-v1.json`, and `vocabulary.json` descriptions

  It is constructed only by tests; there is no runtime selector.
- **Unit box.** The goldens change only additively, and the contract tests pass.

### P3.9 Preservation matrix

- **Depends on.** P3.8. Tests and fixtures only. Cap 20M.
- **Owns.** `tests/appium-*.test.ts` and new wire cases.
- **Build.** The "Verification and exit" matrix, run through the real adapter
  and services against the fake provider. It covers:
  - scripted, driven (hand-back and `resolve_step`), observed prepare, start
    and retrieve with races, and Android capture against a competing owner
  - success, refusal, cancellation before and after dispatch, late and lost
    replies, process loss, disconnection, ambiguity and staleness, and
    changing screens
  - zero forbidden calls on the key-free paths

  A production defect it finds goes to the root as a report.

### P3.10 Switch composition (deep review)

- **Depends on.** P3.9. Cap 30M.
- **Owns.**
  - `src/cli.ts`, `src/mcp/index.ts`, `src/device/factory.ts`,
    `src/capture.ts`, `src/observed/cli.ts`, `src/mcp/observed.ts`
  - the guide pages with vendor wording
  - `GLOSSARY.md` (Appium-era terms: private MCP child, extension, foreign
    automation)
- **Build.** Route every entry point through the Appium driver. Old backend code
  stays in the tree, unused. Remove the vendor-pinned wording from the docs.
- **Unit box.**
  - The full check passes.
  - The packaging proof passes against the switched artifact.
  - No path reaches MobileBuildMCP or the mobilecli agent.

## Exit checklist

This matches the specification's "Verification and exit".

- [ ] The preservation matrix (P3.9) passes for every mode in its platform
      scope, with success, refusal, cancellation and recovery.
- [ ] The public contract checks and goldens pass, changing only additively.
- [ ] Typecheck, the full host check, the build and the packaging proof pass at
      the P3.10 head.
- [ ] A separate Standards and Spec review of the switched head finds no open
      P0/P1.
- [ ] No previously valid behaviour is downgraded to `UNSUPPORTED_ACTION`.
      Unproved parity stays listed as outstanding.
- [ ] Every live claim is listed for Phase 4: the two screen sizes, logs and
      crashes, the 20 cycles, the phone, Node 24, real-HOME and fresh-keyboard
      effects, and plugin install from a real release.

## Open gates

None. On 2026-10-23 all 19 map tickets were resolved. Ticket 08 locked P3.5's
gestures, 09 locked P3.3's extension, and 19 confirmed P3.4's alias rows. It
also added two P3.4 rules: a page-source timeout ends the session, and the
settle cap is a return deadline.
