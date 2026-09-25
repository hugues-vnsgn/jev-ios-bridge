# v0.1.0 release plan

Status: production integration and release verification, 2026-09-25. Target: tested code merged to `main`, tagged `v0.1.0`, and published as a GitHub prerelease with an installable npm tarball. The owner authorized work through release; no npm registry publication is planned.

## Accepted direction and evidence

The autonomous-action designs failed all three unchanged feasibility gates. Their source, labels, results, and no-go decisions remain preserved in tickets 08, 18, and 19. The owner approved evaluating explicit scripts, with Jev judging assertions only. [ADR-0003](../../docs/adr/0003-explicit-scripts-with-jev-assertions.md) now supersedes ADR-0001.

The separate frozen scripted assertion experiment passed: 22/24 true and 23/24 false claims confidently correct, with zero confidently wrong judgments. The 12 reviewed real scripts matched six pass and six assertion-failure oracles; three fault probes stopped inconclusively without actions or model requests. These are exploratory results, not a universal error bound. Real transient-wait corpus coverage remains explicitly deferred.

Production follows [the scripted integration plan](scripted-production-plan.md). Public CLI/MCP inputs are scripts; legacy goal/checkpoint inputs are rejected. The integrated check passed 147 tests, type checking, and build. The blind report-and-source diagnosis identified the planted bug. Installed-host testing has exposed two preserved inconclusive attempts, and remains in progress.

## Remaining gates

| Work | Required evidence |
| --- | --- |
| Watch view and tool decision, tickets 14–15 | Render a real scripted log, inspect the visual result, verify screenshot/timeline/judgment/verdict agreement and private access. Record the chosen three-tool contract and skill packaging. |
| Installed host, ticket 16 | Clean-installed package and `/test-ios` submit one complete script; the bridge executes it and the host reads its correct terminal report. Preserve unsuccessful attempts. |
| Measurements, ticket 17 | Run the Weather, Contacts, and Reminders scripts and upstream baselines on this machine. Record wall time, calls, usage, Jev costs, phase timing, uncertainty and reference expiry. Separate build/setup and execution. Measure authoring/maintenance where instrumented and disclose uncaptured initial work. Do not claim total savings from prepared execution alone. |
| Final specification | Consolidate the resolved tickets and ADRs into `.scratch/jev-ios-bridge/spec.md`, including measured limitations and unsupported cases. |
| Review and package | Independent standards and spec reviews, resolved findings, final applicable checks, secret scan, and clean tarball install. Preserve assertion request parity and evidence provenance. |
| Merge and release | Reconcile original-checkout changes, push reviewed commits, verify CI, merge to `main`, tag the tested commit, publish GitHub prerelease and tarball, and verify its download/install path. |

The release cannot describe an inconclusive host attempt as a pass or hide benchmark failures. A contradictory measurement reopens the relevant decision. Architecture acceptance does not itself authorize an unsupported performance claim.

## Ownership and isolation

Codex owns the entire effort; Claude Code has stopped working in this repository. The main agent owns the tracker, owner discussions, docs, spec, integration decisions, commits, and release. Coding, builds, and tests are delegated to `gpt-6-sol` at high reasoning, with disjoint file ownership. One agent at a time owns device operations. Timed benchmarks run without concurrent GUI or build activity.

All bridge device effects use `mobilebuildmcp@2.7.1`. Dedicated simulator: `0E42FDE2-5E09-42D3-9876-9EF0037FCBE7`. Never touch OPS simulators or physical devices. Upstream baselines may create and remove their own disposable benchmark simulators. Operator recovery does not add native simulator commands to product code.

The real API key remains only in the original checkout's private `.env`; live tools load that file by reference. Never print, copy, or commit it. Strip it from model-host environments; only the bridge process receives it. Disable MobileBuildMCP error reporting.

At merge, the release branch supersedes the main checkout's stale ticket 06 claim and untracked simulator-name configuration. Preserve and reconcile other original changes rather than discarding them blindly. Keep the tested UUID configuration and leave `.env` untouched.

## Release contents and limits

Ship the CLI/MCP server, `/test-ios` skill, setup instructions, measured results, known limitations, and installable `jev-ios-bridge-0.1.0.tgz`. The package remains private for npm registry purposes. GitHub prerelease notes must say simulator only, Claude Code first, Codex best effort, explicit scripts, printable US-keyboard typing, and the tested Xcode/runtime combination.

Real iPhone UI automation, autonomous navigation, CI operation, automatic hooks, non-English assurance, and Codex parity are outside v0.1.0. Screenshots stay local but are not redacted; observed screen text and checkpoint claims are sent to TypeSafe. Unknown device acknowledgement retains the device lock for manual recovery. These limits belong in usage and release notes.
