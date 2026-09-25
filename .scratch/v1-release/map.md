# Map: jev-ios-bridge v1.0.0

Label: wayfinder:map
Created: 2026-09-25

## Destination

A reviewed **v1.0.0 release spec**, handed off to Codex to execute. It records the go/no-go judgment on v0.1.0, the frozen 1.0 contract, the assertion policy, the performance target and tuning plan, the Compose Multiplatform evidence plan, the developer guide outline, and the release gates. If the product assessment says no-go, the destination becomes another prerelease spec, not 1.0.

## Notes

- **Domain:** agent tooling (a Claude Code MCP server and skill), iOS simulator automation through `mobilebuildmcp@2.7.1`, and TypeSafe Jev assertion judgment. Vocabulary: [`CONTEXT.md`](../../CONTEXT.md); design: [ADR-0003](../../docs/adr/0003-explicit-scripts-with-jev-assertions.md), [ADR-0002](../../docs/adr/0002-mobilebuildmcp-as-device-layer.md), [`docs/architecture.md`](../../docs/architecture.md).
- **Starting point:** GitHub prerelease [v0.1.0](https://github.com/hugues-vnsgn/jev-ios-bridge/releases/tag/v0.1.0), shipped by Codex from the [previous map](../jev-ios-bridge/map.md). Its measured results are in [`docs/research/scripted-benchmarks.md`](../../docs/research/scripted-benchmarks.md) and its limits in [`docs/releases/v0.1.0.md`](../../docs/releases/v0.1.0.md).
- **Settled while charting (owner, 2026-09-25):**
  - **Release form:** v1.0.0 as a regular GitHub release with the tarball; no npm registry.
  - **Plan, don't do:** this map ends at the release spec. **Codex executes it**, so the spec is written for an agent reader.
  - **Judgement covers three things:** Jev assertion quality, an honest product assessment, and a code/design review.
  - **The product assessment is a go/no-go gate** for a 1.0 stability promise.
  - **The 1.0 stability promise covers** a versioned script format, MCP tools plus CLI and exit codes, verdict semantics (the 0.9/0.1 bounds and pass/fail/inconclusive rules), and the report and evidence layout.
  - **Performance:** profile first, then set a numeric target from what is actually removable.
  - **Required new evidence:** one Kotlin Multiplatform / Compose Multiplatform iOS app.
  - **Docs audience:** native iOS developers (SwiftUI/UIKit) using Claude Code, plus KMP/Compose Multiplatform apps. Markdown in the repo, shipped in the tarball.
  - **Codex as a host stays best effort.**
- **Known performance lead:** every device command spawns `npx --yes mobilebuildmcp@2.7.1` (`src/device/index.ts`, `defaultRunner`). In the Weather run, observe plus act took 100.5 s of 107.7 s of prepared execution; Jev judgment took 3.5 s.
- **Skills:** `grilling` and `domain-modeling` for grilling tickets; `prototype` for prototype tickets; `research` for research tickets; `typesafe:typesafe-ai` for anything touching Jev; `codebase-design` for seams; `compose-multiplatform-ui` and `kmp-ios-integration` for Compose tickets; `code-review` for the review ticket; `unslop` before anything people read.
- **Device and secrets:** one agent at a time owns device operations, on the dedicated simulator `0E42FDE2-5E09-42D3-9876-9EF0037FCBE7` only. Follow `AGENTS.md` for the `.env` Jev key: load it by path; never print, copy, or commit it.
- **Tracker:** local markdown ([`docs/agents/issue-tracker.md`](../../docs/agents/issue-tracker.md)). Refer to tickets by name. After opening, claiming, closing, or rewiring a ticket, run `python3 scripts/render-route.py .scratch/v1-release`.

## Decisions so far

- [Product assessment: is v0.1.0 worth a stable promise?](issues/05-product-assessment.md): **go, conditionally.** 1.0 serves repeatable checks kept in the repo. Five go conditions: fix the three review defects, implement ADR-0004, meet the speed target, pass the Compose checks, and remove dead code while versioning frozen surfaces. Slower-than-direct speed, prompt injection, non-English screens, and unmeasured authoring cost are documented limits.
- [Performance target and tuning plan](issues/06-performance-target.md): 1.0 drops `npx`, reuses MobileBuildMCP's post-action capture, and screenshots concurrently; no long-lived client. Pass means at least 30% faster prepared execution per benchmark script, one run each, with unchanged verdicts.
- [Live Compose capture: settle the open questions on a real simulator](issues/11-live-compose-capture.md): on the owner's `cmp` demo (Compose Multiplatform 1.11.1), `testTag` reaches `identifier`, text fields are `text-field`, and empty Compose fields omit `value`. Merged buttons duplicate their label on a text child, so guards need identifier or role. No stale-element crash occurred. The app's number fields all share one identifier, and its launch screen animates for ~25 s. [Findings](../../docs/research/compose-cmp-capture.md).
- [Code and design review of v0.1.0 before a stability promise](issues/02-code-and-design-review.md): no false-pass path found. `value: ''` selectors never match, ADR-0004 is unimplemented, a retained device lock can only be cleared by deleting its file by hand, 745 lines of dead autonomous-design code ship, and the surfaces to freeze are unversioned. Don't freeze the driver seam before tuning option B is decided. [Review](code-review.md).
- [Where bridge time goes](issues/01-where-bridge-time-goes.md): Jev is 3% of step time. `npx` adds ~0.5 s to every device command (~26% of recorded time), CLI startup ~0.33 s more, and each action already returns a settled capture that the bridge discards. Ranked options: resolved binary, capture reuse, concurrent screenshot, long-lived client. [Findings](../../docs/research/bridge-latency.md).
- [Assertion policy for 1.0](issues/07-assertion-policy.md): 0.9/0.1 fixed; a confidently false claim now fails even beside uncertain ones; one judgment per checkpoint, no re-asks; claim rules taught, not enforced; model pinned per release behind a corpus gate; observation-shape experiment runs before 1.0 ([ADR-0004](../../docs/adr/0004-fixed-assertion-bounds-single-judgment.md)).
- [Compose Multiplatform on iOS through MobileBuildMCP](issues/04-compose-multiplatform-on-ios.md): `testTag` maps to the accessibility identifier with no opt-in since CMP 1.8.0; recommend 1.12.1+ and unique tags on actionable nodes; no bridge change expected. Candidate app: Alkaa (pinned fork). [Findings](../../docs/research/compose-multiplatform-ios.md); nine questions await a live capture.
- [Why assertions abstain](issues/03-why-assertions-abstain.md): uncertainty comes from implicit evidence (empty fields, unprinted list ends, saved-state inference), not compound claims or truncation. Keep 0.9/0.1 and teach claim-authoring rules; no blind re-asks. [Findings](../../docs/research/assertion-uncertainty.md).

## Route

Green nodes are the frontier (open and unblocked), blue are claimed, grey are resolved, and white are blocked. `scripts/render-route.py` generates this block, so don't edit it by hand.

<!-- route:start -->
```mermaid
flowchart LR
    T01["01 Where bridge time goes<br/><small>task</small>"]
    T02["02 Code and design review of v0.1.0 before a stability promise<br/><small>task</small>"]
    T03["03 Why assertions abstain<br/><small>research</small>"]
    T04["04 Compose Multiplatform on iOS through MobileBuildMCP<br/><small>research</small>"]
    T05["05 Product assessment<br/><small>grilling</small>"]
    T06["06 Performance target and tuning plan<br/><small>grilling</small>"]
    T07["07 Assertion policy for 1.0<br/><small>grilling</small>"]
    T08["08 The 1.0 stable contract<br/><small>grilling</small>"]
    T09["09 Compose app evidence plan<br/><small>grilling</small>"]
    T10["10 Developer guide outline<br/><small>prototype</small>"]
    T11["11 Live Compose capture<br/><small>task</small>"]
    T01 --> T05
    T02 --> T05
    T03 --> T05
    T01 --> T06
    T03 --> T07
    T02 --> T08
    T05 --> T08
    T07 --> T08
    T04 --> T09
    T05 --> T09
    T11 --> T09
    T04 --> T10
    T05 --> T10
    T04 --> T11
    classDef resolved fill:#e4e4e7,stroke:#a1a1aa,color:#52525b
    classDef claimed fill:#dbeafe,stroke:#2563eb,color:#1e3a8a
    classDef frontier fill:#dcfce7,stroke:#16a34a,color:#14532d,stroke-width:2px
    classDef blocked fill:#ffffff,stroke:#a1a1aa,color:#18181b
    class T01,T02,T03,T04,T05,T06,T07,T11 resolved
    class T08,T09,T10 frontier
```
<!-- route:end -->

## Not yet specified

- **Release gates and the spec's assembly:** the checklist Codex must pass before tagging 1.0 (tests, re-run benchmarks, Compose evidence, clean install, docs walkthrough). Its shape depends on the contract, the performance target, and the evidence plan.
- **MobileBuildMCP drift under a stable promise:** what a MobileBuildMCP upgrade must pass before a 1.x release adopts it (capture shape, selector behavior, typing). The Jev side is settled in "Assertion policy for 1.0". This probably graduates out of the contract ticket.
- **Migrating 0.1.0 scripts:** whether an unversioned 0.1.0 script is accepted, upgraded, or rejected once the format carries a version.
- **Data-handling statement for outside developers:** what the guide must say about screen text going to TypeSafe and unredacted local screenshots before developers point this at real apps.
- **Cost budget per run:** carried over from the previous map; a number for the docs once tuning changes the measurements.

## Out of scope

- **npm registry publication.** 1.0 ships as a GitHub release tarball (owner, 2026-09-25).
- **Executing the spec.** Implementation, measurement runs, and publishing belong to Codex after handoff.
- **Codex as a first-class host.** It stays best effort, as in v0.1.0.
- **A docs website.** Docs are repo markdown shipped in the package.
- **Selector guidance for React Native and Flutter apps.** The audience is native iOS plus KMP/Compose.
- **Real-iPhone UI automation, autonomous navigation, automatic hooks, and CI operation.** These were out of v0.1.0 and remain outside this effort.
