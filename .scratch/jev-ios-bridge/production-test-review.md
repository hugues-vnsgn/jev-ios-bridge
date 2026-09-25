# Production verification

**Verdict: UNVERIFIED for release.** The scripted runtime, installed-host path, watch view, and package smoke checks pass. Comparative measurements, final review, CI on the release commit, and the published asset check remain open.

Oracle: [v0.1 specification](spec.md), accepted tickets 09–16, and [scripted evaluation protocol](scripted-evaluation-plan.md). Implementation snapshot: `9f8a25e`. The [check artifact](../../spikes/benchmarks/results/production-release-check-2026-09-25.json) binds 42 files by SHA-256; the main agent independently matched every hash to that commit.

`npm run check` passed type checking, **155 tests with zero failures, skips, or cancellations**, and build on Node 26.8.1. Raw output remains private at the path and hash in the artifact. A clean installation of the 42-file tarball returned version `0.1.0`; source, packed, and installed CLI and skill hashes match. Historical Node 24 CI is not a substitute for CI on this implementation commit.

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
| Comparative task measurements | Weather baseline retry succeeded after a preserved missing-AXe setup failure; remaining full-suite comparisons in progress | UNVERIFIED |
| Final release commit and asset | Independent review, release-commit CI, merge/tag/prerelease and downloaded-asset smoke still pending | UNVERIFIED |

The initial redaction regression caused one integrated run to fail before its fix; it was not skipped or weakened. The final 155-test check includes the unchanged expectation. No held-out labels or assertion thresholds were changed during hardening.

Real transient-wait assertion corpus coverage remains an accepted deferral. Deterministic waits have scripted coverage and real cancellation evidence. Initial script-authoring time/tokens were not metered; disclose that cost gap rather than infer a total saving. These limits must remain in release notes.

A read-only exact-key scan checked all 1,253 reachable Git blobs and found zero matches. A separate scan of 1,545 tracked/publishable working-tree files also found zero matches. The key was read privately for comparison and never printed or copied to an artifact. Newly added benchmark evidence will be scanned before publication.
