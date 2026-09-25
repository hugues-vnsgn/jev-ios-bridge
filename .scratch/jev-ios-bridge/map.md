# Map: jev-ios-bridge

Label: wayfinder:map
Created: 2026-09-21 · Re-charted: 2026-09-25

## Destination

A verified implementation and GitHub prerelease v0.1.0 of the bridge, including its installable package, tools, run loop, observation, policy, report, and watch view. The owner expanded the planning effort through release on 2026-09-24. Measured feasibility evidence, the reviewed corpus, and the go/no-go decision remain gates; implementation must not turn missing evidence into a resolved ticket.

## Notes

- **Domain:** agent tooling (Claude Code MCP servers and skills), iOS simulator automation through MobileBuildMCP, and TypeSafe Jev.
- **Settled while re-charting on 2026-09-24**, from the research tickets and a grilling session with the owner:
  - **Why the bridge exists.** The host submits one complete script and reads one report, without receiving screens step by step. The bridge executes the script; Jev judges checkpoint assertions. Lower cost remains a measurement question.
  - **The bridge owns scripted execution** ([ADR-0003](../../docs/adr/0003-explicit-scripts-with-jev-assertions.md)), accepted after the assertion and real-execution gates. ADR-0001’s autonomous action design failed three experiments and is superseded.
  - **Claude Code is the first-class host.** Codex is supported on a best-effort basis.
  - **Device layer:** `mobilebuildmcp@2.7.1` ([ADR-0002](../../docs/adr/0002-mobilebuildmcp-as-device-layer.md)).
  - **Stack:** TypeScript on Node 24, using `@typesafe-ai/sdk`. "Tool surface: tools, report format, and /test-ios" picks the MCP SDK line.
- **Read before any ticket:** [`CONTEXT.md`](../../CONTEXT.md), the ADRs, and [`docs/architecture.md`](../../docs/architecture.md). The evidence is in [`docs/research/`](../../docs/research/).
- **Skills:**
  - `typesafe:typesafe-ai` for anything touching Jev (read the live docs);
  - `grilling` and `domain-modeling` for grilling tickets;
  - `prototype` for prototype tickets;
  - `codebase-design` when a ticket shapes a module seam;
  - `mermaid-diagrams` for diagrams;
  - `unslop` before anything reviewers read.
- **Tracker:** local markdown; see [`docs/agents/issue-tracker.md`](../../docs/agents/issue-tracker.md). Refer to tickets by name. After opening, claiming, closing, or rewiring a ticket, run `python3 scripts/render-route.py`.
- **Reaching the destination:** consolidate decisions into the spec, implement and verify the bridge, review the changes, then publish the GitHub prerelease. The main agent owns integration and ticket updates; delegated agents own explicitly assigned files. External messages to engineers are not part of the release authorization.

## Decisions so far

- [Second feasibility run](issues/18-feasibility-revision.md): also no-go, with 16/20 correct, 14/20 accepted, and two accepted errors. [Checkpoint feasibility](issues/19-checkpoint-feasibility.md) now tests explicit observable subgoals while keeping the same success bar and autonomous bridge-owned execution.

- [First feasibility run](issues/08-feasibility-run.md): no-go. Filtered full observations with history and threshold 0.9 produced 15/20 correct actions and 7/20 accepted cases, with no accepted errors or false-pass assertions. [A revision](issues/18-feasibility-revision.md) must meet the same bar on fresh held-out cases before production design proceeds.

- [Local environment](issues/06-local-environment.md): dedicated iOS 26.4 simulator is ready, pinned MobileBuildMCP captures work, and the supplied key authenticates. Settings, Contacts, Reminders, and Files are available; Apple Weather was unavailable; the pinned Sentry Weather fixture was subsequently built and installed.

- [Jev today: model, API, SDK, limits](issues/01-jev-today.md): `jev-1.13.0` is text-only and stateless. A request is capped at 64k tokens, with 32k for the state plus the longest question. Noul answers carry no confidence. TypeSafe publishes no cookbook for choosing UI actions.
- [MobileBuildMCP: simulator and real-iPhone capability](issues/02-mobilebuildmcp-capability.md): the project was renamed on 2026-09-23. Element references expire after 60 s. Full snapshot data comes only from the CLI. There is no UI automation on a real iPhone.
- [Claude and Jev: dividing the work](issues/03-claude-and-jev.md): a tool call cannot ask Claude anything mid-run, and `structuredContent` hides the text report. The evidence leaves two shapes viable: a loop run by the bridge, or a loop run by a Claude subagent. The owner chose the bridge.
- [Watching a run: options for a live view](issues/04-watching-a-run.md): the Claude Code CLI shows one progress line, and MCP logging is deprecated. The practical watch view is a localhost page served from the run log.
- [Driving a real iPhone: what a second device layer takes](issues/05-driving-a-real-iphone.md): WebDriverAgent through Appium is the plausible path, sized M. Most of that cost is per-developer signing and keeping it working across Xcode releases. Jev's view of the screen can stay the same.
- [Domain boundaries](../../docs/domain-boundaries.md): one iOS Scenario Verification context owns the run and verdict policy. Preparation and evidence presentation are supporting modules; the integration patterns remain explicitly inferred.
- [Feasibility plan: the go/no-go bar and the step questions](issues/07-feasibility-plan.md): 30 owner-labelled cases, split into 10 tuning and 20 held-out cases. One Choice selects a complete action; independent Nouls check completion and assertions. Compare compact/full observations with/without history, then freeze one configuration. The exploratory bar is 18/20 correct choices, at least 16/20 accepted with no accepted errors, and no false-pass assertions. The environment and reviewed corpus still precede live evaluation.

- [Checkpoint feasibility](issues/19-checkpoint-feasibility.md): third no-go, 17/20 correct actions and 10/20 accepted, with no accepted errors or false-pass assertions. All original criteria remain unchanged. [Product direction](issues/20-post-feasibility-direction.md) records the owner-approved pivot to explicit scripts. [Scripted feasibility](issues/21-scripted-feasibility.md) passed its separate assertion and real-execution gates. The main agent accepted that architecture under the release delegation; installed-host and measurement checks still gate release.

- [Scripted feasibility](issues/21-scripted-feasibility.md): 22/24 true and 23/24 false claims confidently correct, zero confidently wrong judgments. Twelve real scripts matched their oracles; three fault probes stopped safely. Production integration passes 147 tests. The blind report-and-source diagnosis succeeded; installed-host testing and same-machine benchmarks are in progress.

## Route

Green nodes are the frontier (open and unblocked), blue are claimed, grey are resolved, and white are blocked. `scripts/render-route.py` generates this block, so don't edit it by hand.

<!-- route:start -->
```mermaid
flowchart LR
    T01["01 Jev today<br/><small>research</small>"]
    T02["02 MobileBuildMCP<br/><small>research</small>"]
    T03["03 Claude and Jev<br/><small>research</small>"]
    T04["04 Watching a run<br/><small>research</small>"]
    T05["05 Driving a real iPhone<br/><small>research</small>"]
    T06["06 Local environment<br/><small>task</small>"]
    T07["07 Feasibility plan<br/><small>grilling</small>"]
    T08["08 Feasibility run<br/><small>prototype</small>"]
    T09["09 Observation schema<br/><small>grilling</small>"]
    T10["10 Scenario language<br/><small>grilling</small>"]
    T11["11 Step-loop policy<br/><small>grilling</small>"]
    T12["12 Device driver<br/><small>grilling</small>"]
    T13["13 Run log<br/><small>grilling</small>"]
    T14["14 Watch view<br/><small>prototype</small>"]
    T15["15 Tool surface<br/><small>grilling</small>"]
    T16["16 Vertical slice<br/><small>prototype</small>"]
    T17["17 Slice measurements<br/><small>task</small>"]
    T18["18 Feasibility revision<br/><small>prototype</small>"]
    T19["19 Checkpoint feasibility<br/><small>prototype</small>"]
    T20["20 Product direction after three feasibility no-go results<br/><small>grilling</small>"]
    T21["21 Scripted feasibility<br/><small>prototype</small>"]
    T06 --> T08
    T07 --> T08
    T21 --> T09
    T21 --> T10
    T21 --> T11
    T09 --> T11
    T10 --> T11
    T05 --> T12
    T09 --> T12
    T09 --> T13
    T11 --> T13
    T12 --> T13
    T12 --> T14
    T13 --> T14
    T10 --> T15
    T11 --> T15
    T12 --> T15
    T13 --> T15
    T14 --> T15
    T11 --> T16
    T12 --> T16
    T15 --> T16
    T16 --> T17
    T08 --> T18
    T18 --> T19
    T19 --> T20
    T20 --> T21
    classDef resolved fill:#e4e4e7,stroke:#a1a1aa,color:#52525b
    classDef claimed fill:#dbeafe,stroke:#2563eb,color:#1e3a8a
    classDef frontier fill:#dcfce7,stroke:#16a34a,color:#14532d,stroke-width:2px
    classDef blocked fill:#ffffff,stroke:#a1a1aa,color:#18181b
    class T01,T02,T03,T04,T05,T06,T07,T08,T09,T10,T11,T12,T13,T18,T19,T20,T21 resolved
    class T14 claimed
    class T15,T16,T17 blocked
```
<!-- route:end -->

## Not yet specified

- **Hooks:** Claude Code hooks that start a run automatically, for example after Swift edits. This depends on how long a run takes, which "Slice measurements: cost, speed, and diagnosis against the baseline" measures.
- **Distribution:** GitHub prerelease `v0.1.0` with an installable `jev-ios-bridge` npm tarball; no npm registry publication is planned.
- **Non-English screens:** Jev is documented to be less accurate on them.
- **Prompt injection:** screen text that steers Jev's answers, in apps that show user-written content.
- **Cost budget per run:** what a run may cost, once the feasibility and slice measurements give real numbers.

## Out of scope

- **Building real-iPhone support.** It needs a second device layer. "Driving a real iPhone: what a second device layer takes" sizes that work for a later effort.
- **A loop owned by the host agent**, whether in the main session or in a subagent. The bridge's value is one scenario submission per run (ADR-0001).
- **Running in CI or without a person.** v1 must not block it: scenarios are files, and a run needs no interactive host.
- **Codex parity.** Codex's 60 s default timeout, and the fact that it shows no progress, would force either start-and-poll tools or a per-user timeout override. Codex would also need a watch view outside the host.
- **A watch view built as an MCP App, or as an overlay inside the app under test.** MCP Apps do not render in the Claude Code CLI, and an overlay would change what Jev sees.
- **Simulator or UI automation code of our own**, whether over `simctl`, `idb`, or AXe directly (ADR-0002).
- **Sending screenshots to Jev.** Jev accepts text only.
