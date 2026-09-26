# Performance target and tuning plan

Type: grilling
Status: resolved
Claimed by: Claude Code (owner session)
Blocked by: 01

## Question

Given the breakdown from "Where bridge time goes", what numeric performance target does 1.0 commit to, and which changes get there? Decide:

- **The target and its measurement:** for example, prepared bridge execution for the Weather, Contacts, and Reminders scripts relative to v0.1.0, or host elapsed time relative to the prepared-app baseline. Say which machine, runs, and statistic count.
- **The tuning changes in scope:** a resolved binary or a long-lived device-layer process instead of per-command `npx`; fewer captures per step; parallel screenshot and capture; settle times. Say whether any of them changes ADR-0002 or needs a new ADR.
- **Which changes must not alter verdicts:** tuning must not weaken guards, reference-freshness checks, or evidence completeness.

## Answer

Decided with the owner on 2026-09-25, from "Where bridge time goes" ([`docs/research/bridge-latency.md`](../../../docs/research/bridge-latency.md)). The owner asked for a quick check, not another measurement campaign.

**Tuning changes in 1.0:**
- **A. No `npx`.** Depend on `mobilebuildmcp@2.7.1` and run its CLI directly (~0.5 s per device command).
- **B. Reuse the post-action capture.** Request the full settled capture with each action (`--verbose`, schema "3"). Use it as the next step's observation, and capture separately only if it's missing or the settle timed out. This removes one snapshot per action step. It changes the device driver seam (`act` returns a capture), so "The 1.0 stable contract" must not freeze that seam in its current shape.
- **C. Screenshot concurrently with the snapshot,** checked to show the same screen.
- **Not in 1.0: D, a long-lived client.** The daemon socket is MobileBuildMCP's internal protocol, and the MCP server loses full captures. Tying the stability promise to either isn't worth ~0.35 s per command.

None of these changes adds automation code of our own, so ADR-0002 is unaffected and no new ADR is needed. None may weaken guards, reference-freshness checks, or evidence completeness.

**Target and check:** after the changes, Codex runs the existing Weather, Contacts, and Reminders benchmark scripts **once each** on the reference machine, with no new direct-MobileBuildMCP baselines. The change passes when:
- prepared bridge execution is **at least 30% faster** than v0.1.0 for each script (Weather 107.7 s, Contacts 74.8 s, Reminders 91.2 s); and
- each verdict matches v0.1.0, except where ADR-0004's precedence change legitimately alters it. A changed verdict is a bug to fix, not a speed trade-off.

A script that improves but misses 30% is reported, not a release blocker.

## Comments

- 2026-09-26, during phase 4: **option B is not shipped in 1.0.** On a navigation tap in the diagnostic app, MobileBuildMCP 2.7.1 returned a mid-transition screen (old and new screens mixed) as its settled capture, so reusing it would weaken guards and evidence, which this ticket forbids. B stays in the driver behind `reuseActionCapture: true`, off by default. Evidence: `spikes/benchmarks/results/v1.0.0/capture-reuse/`. 1.0 ships A and C, and the speed check (report-only past "not slower") runs on that.
