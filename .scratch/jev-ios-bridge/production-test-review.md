# Production verification

**Verdict: UNVERIFIED for release.** The scripted runtime, installed-host path, watch view, measurements, code review and package smoke checks are complete. Final documentation/package checks and published-asset verification remain open.

Oracle: [v0.1 specification](spec.md), accepted tickets 09–16, and [scripted evaluation protocol](scripted-evaluation-plan.md). Final implementation snapshot: `29da755`, including the post-review cancellation fix `8fb9aac`. The [post-review check artifact](../../spikes/benchmarks/results/production-release-check-post-review-2026-09-25.json) binds 42 files by SHA-256; the main agent independently matched every hash to that commit.

`npm run check` passed type checking, **157 tests with zero failures, skips, or cancellations**, and build on Node 26.8.1. Raw output remains private at the path and hash in the artifact. A clean installation of the 42-file tarball returned version `0.1.0`; source, packed, and installed CLI and skill hashes match. [Node 24 CI](https://github.com/hugues-vnsgn/jev-ios-bridge/actions/runs/36087738941) also passed on `29da755`.

| Behavior | Oracle and exercised evidence | Result |
| --- | --- | --- |
| Strict scripted inputs and limits | Production schema/service/MCP tests reject legacy shapes, unknown fields, bad IDs/selectors/values, missing terminal checkpoints, and invalid limits before device work | PASS |
| Unique targets and distinguishing guards | Selector tests cover missing, ambiguous, disabled/offscreen/unknown targets, generic aliases and the pinned tap-only equivalence rule; real Contacts startup regression covers empty results plus card/editor exclusions | PASS |
| Assertion input and answer validation | Production parity tests preserve all 24 frozen request payloads; adapter tests cover no Choice/oracle metadata, budgets, malformed/unknown responses and pinned model | PASS |
| Fixed verdict rules | False, uncertain, mixed, intermediate and final checkpoint tests; six expected real passes and six intended assertion failures | PASS |
| Wait/global limits and cancellation | Regression: a late capture passed before the fix and times out after it. Regression: cancellation during final log writes produced a pass before the fix and becomes inconclusive afterward. Cleanup cancellation remains conservative | PASS |
| Device lifecycle and concurrency | Acknowledgement fencing, retained-lock, stale/changed-screen, wrong-device, concurrent-case-variant UUID, and cleanup tests; live target faults and cancelled wait clean up without new actions | PASS |
| Redaction and evidence correlation | Regressions were red for corrupted protocol enums and colliding assertion IDs; known enums now survive and sensitive IDs remain distinct/correlated through per-run keyed pseudonyms. Literal text, unknown enum-looking strings and regex characters remain redacted | PASS |
| Reports and interruption | Full redacted assertion observations, useful semantic excerpts, terminal evidence priority, 24,000-byte output bound, screenshot/event links, preserved earlier checkpoints, incomplete-tail recovery and corrupt-middle rejection | PASS |
| Host submission and report | Clean-installed `/test-ios` submitted the reviewed Contacts c01 script unchanged, start once/report once; correct pass, one Jev request, successful cleanup and absent lock. Two earlier inconclusive attempts preserved | PASS |
| Human watch view | Actual d03 replay, four decoded screenshots, matching 4% failed claim and failed verdict, desktop/narrow inspection, token/CSP/inert-markup checks; corrected misleading checkpoint heading | PASS |
| Report supports diagnosis | Blind Claude task received failed report plus two source files only and identified the planted total-calculation defect | PASS |
| Clean package contents | Exactly 42 allowlisted files, no private paths or `.env`, clean install and matching CLI/skill hashes | PASS |
| Comparative task measurements | All three tasks measured: two bridge passes, one intended abstention on a 0.87 claim; no verified Reminders baseline, no ratio claimed; all failed attempts and unknown initial authoring cost retained | PASS with recorded limits |
| Final release commit and asset | Code review and Node 24 CI passed; final prose/package checks, merge/tag/prerelease and downloaded-asset smoke pending | UNVERIFIED |

The initial redaction regression caused one integrated run to fail before its fix; it was not skipped or weakened. The final 155-test check includes the unchanged expectation. No held-out labels or assertion thresholds were changed during hardening.

Real transient-wait assertion corpus coverage remains an accepted deferral. Deterministic waits have scripted coverage and real cancellation evidence. Initial script-authoring time/tokens were not metered; disclose that cost gap rather than infer a total saving. These limits must remain in release notes.

A read-only exact-key scan checked all 1,253 reachable Git blobs and found zero matches. A separate scan of 1,545 tracked/publishable working-tree files also found zero matches. The key was read privately for comparison and never printed or copied to an artifact. Newly added benchmark evidence will be scanned before publication.


Independent Spec review found an additional late-cancellation case after a failed checkpoint. Its regression failed before `8fb9aac` and passes afterward: terminal cancellation is inconclusive, earlier failed proof remains, and cleanup failure retains priority. The final combined check passed 157 tests. The new package's direct installed `.bin/jev-ios-bridge` and `node .../dist/cli.js` both returned `0.1.0`; all 42 source-manifest files matched `29da755`. Earlier 155-test/package evidence remains unchanged.

The main agent independently read the hash-verified raw Weather and Contacts tool-result proofs. Weather captures establish all seven settings, London with 11°, 78% precipitation and 9.7 km visibility, then the five precipitation-detail values. Contacts captures establish the saved card header, organization, phone digits and exact email, with an Edit button and no Done editor control. The Reminders attempt is excluded after its actual field text contradicted the intended list name; a harness completion flag is not accepted as task proof.


The promised prepared-app Weather baseline also passed once: 90.449 seconds with no app build/install inside the timer. The main agent checked the raw setting, main-screen and detail captures. Source/prompt/suite differences and starting-state proof are archived separately from the original baseline. Final tarball `a0dc94da40f11695ca8fc701766966e9e6ccb78086cd7f372cce99132d365495` passed clean install, direct bin and node CLI version checks, with all 38 dist files and the skill unchanged from the tested runtime. Packaged documents and source were independently bound to `abf6922`.

The prose checker found only intentional numeric ranges and domain terms after edits. Local links in the main docs/spec/release notes resolve. Archived unified diffs retain required blank-line context prefixes; a narrowly scoped Git attribute preserves those bytes while excluding that artifact syntax from trailing-space diagnostics.
