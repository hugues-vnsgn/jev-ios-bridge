# v0.1.0 release plan

Status: complete. GitHub prerelease v0.1.0 published and its downloaded package verified, 2026-09-25. Target: tested code merged to `main`, tagged `v0.1.0`, and published as a GitHub prerelease with an installable npm tarball. The owner authorized work through release; no npm registry publication is planned.

## Accepted direction and evidence

The autonomous-action designs failed all three unchanged feasibility gates. Their source, labels, results, and no-go decisions remain preserved in tickets 08, 18, and 19. The owner approved evaluating explicit scripts, with Jev judging assertions only. [ADR-0003](../../docs/adr/0003-explicit-scripts-with-jev-assertions.md) now supersedes ADR-0001.

The separate frozen scripted assertion experiment passed: 22/24 true and 23/24 false claims confidently correct, with zero confidently wrong judgments. The 12 reviewed real scripts matched six pass and six assertion-failure oracles; three fault probes stopped inconclusively without actions or model requests. These are exploratory results, not a universal error bound. Real transient-wait corpus coverage remains explicitly deferred.

Production follows [the scripted integration plan](scripted-production-plan.md). Public CLI/MCP inputs are scripts; legacy goal/checkpoint inputs are rejected. The integrated check passed 157 tests, type checking, and build. The blind report-and-source diagnosis identified the planted bug. Installed-host testing passed after two preserved inconclusive attempts. The watch and tool-interface decisions are resolved.

## Execution gates

| Work | Evidence and status |
| --- | --- |
| Watch view and tool decision, tickets 14–15 | **Passed.** Actual scripted log rendered at desktop/narrow widths; screenshot/timeline/judgment/verdict agreement, token access and inert text checked. Three-tool contract and skill packaging recorded. |
| Installed host, ticket 16 | **Passed.** Clean-installed package and `/test-ios` submitted the reviewed script once and returned the correct report. Two inconclusive attempts remain preserved. |
| Measurements, ticket 17 | **Complete with limits.** The prepared-app Weather baseline passed in 90.449 seconds and is recorded separately from the official build-inclusive run. Weather/Contacts bridge scripts passed; Reminders reached correct visible state but abstained at 0.87. No verified Reminders baseline exists after four preserved attempts. All costs, maintenance windows and missing authoring data are recorded; no Reminders ratio or total-savings claim. |
| Final specification | **Reviewed.** Runtime contract and measured limitations consolidated in the spec. |
| Review and package | **Code review closed.** One nonblocking duplication heuristic accepted; the cancellation race was fixed and independently verified. 157 tests, typecheck/build, Node 24 CI, and clean 42-file tarball install passed. Final documentation/package and published-asset checks passed. |
| Merge and release | **Complete.** PR 1 merged to `main`; merge-commit CI passed; tag/prerelease published; fresh public download and clean install verified. |

The release cannot describe an inconclusive host attempt as a pass or hide benchmark failures. A contradictory measurement reopens the relevant decision. Architecture acceptance does not itself authorize an unsupported performance claim.

## Ownership and isolation

Codex owns the entire effort; Claude Code has stopped working in this repository. The main agent owns the tracker, owner discussions, docs, spec, integration decisions, commits, and release. Coding, builds, and tests are delegated to `gpt-6-sol` at high reasoning, with disjoint file ownership. One agent at a time owns device operations. Timed benchmarks run without concurrent GUI or build activity.

All bridge device effects use `mobilebuildmcp@2.7.1`. Dedicated simulator: `0E42FDE2-5E09-42D3-9876-9EF0037FCBE7`. Never touch OPS simulators or physical devices. Upstream baselines may create and remove their own disposable benchmark simulators. Operator recovery does not add native simulator commands to product code.

The real API key remains only in the original checkout's private `.env`; live tools load that file by reference. Never print, copy, or commit it. Strip it from model-host environments; only the bridge process receives it. Disable MobileBuildMCP error reporting.

At merge, the release branch supersedes the main checkout's stale ticket 06 claim and untracked simulator-name configuration. Preserve and reconcile other original changes rather than discarding them blindly. Keep the tested UUID configuration and leave `.env` untouched.

## Release contents and limits

Ship the CLI/MCP server, `/test-ios` skill, setup instructions, measured results, known limitations, and installable `jev-ios-bridge-0.1.0.tgz`. The package remains private for npm registry purposes. GitHub prerelease notes must say simulator only, Claude Code first, Codex best effort, explicit scripts, printable US-keyboard typing, and the tested Xcode/runtime combination.

Real iPhone UI automation, autonomous navigation, CI operation, automatic hooks, non-English assurance, and Codex parity are outside v0.1.0. Screenshots stay local but are not redacted; observed screen text and checkpoint claims are sent to TypeSafe. Unknown device acknowledgement retains the device lock for manual recovery. These limits belong in usage and release notes.


## Original checkout reconciliation

The original tracked edits and two untracked planning/config files were preserved in local stash `8c56c963cf05de6bc90a97443a51dc75d6248a7c` before merge preparation. Ticket 07 and domain-boundary decisions are incorporated in the release branch; its completed ticket 06 and UUID configuration supersede the stale claim and simulator-name config as the owner directed. The stash remains available and will not be blindly applied over the completed branch. The original `.env` stayed in place at mode 600 and was not part of the stash. A local Git exclude keeps `.worktrees/` ignored while old `main` awaits the merge.


## Published release

[GitHub prerelease v0.1.0](https://github.com/hugues-vnsgn/jev-ios-bridge/releases/tag/v0.1.0) was published at 2026-09-25 04:21:30 UTC from tested merge commit `f4a3c87036c2ab1dfb0834e40b3efacc988b88ca`. [PR 1](https://github.com/hugues-vnsgn/jev-ios-bridge/pull/1) is merged; [main CI](https://github.com/hugues-vnsgn/jev-ios-bridge/actions/runs/36094046112) passed. The source trees of the reviewed branch and merge commit are identical.

The 46,196-byte asset `jev-ios-bridge-0.1.0.tgz` has SHA-256 `a0dc94da40f11695ca8fc701766966e9e6ccb78086cd7f372cce99132d365495`. A fresh public download matched that digest, installed cleanly, and returned `0.1.0` through both executable entrypoints. All 42 installed files matched the tested package. [Publication verification](../../spikes/benchmarks/results/publication-verification.json) records the evidence. This audit update changes only release records after the tag; runtime/package content remains that tested release.
