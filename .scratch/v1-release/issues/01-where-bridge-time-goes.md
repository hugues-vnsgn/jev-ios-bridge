# Where bridge time goes: a per-step latency breakdown

Type: task
Status: resolved
Claimed by: Claude Code (owner session)
Blocked by: none

## Question

Nothing to decide yet; "Performance target and tuning plan" and "Product assessment" wait on these facts. Prepared execution is dominated by device work (Weather: observe 51.5 s, act 49.0 s, judge 3.5 s out of 107.7 s). Break that down so the removable part is visible:

- **Process spawn overhead:** every device command runs `npx --yes mobilebuildmcp@2.7.1` (`src/device/index.ts`, `defaultRunner`). Measure a no-op or cheap command through `npx` vs a resolved local binary, cold and warm.
- **Per-command cost:** capture (compact vs full), screenshot, tap, type, swipe, and the settle or wait time inside each.
- **Commands per step:** how many device commands a typical action, wait, or checkpoint step issues (pre-guard capture, action, post-action capture, screenshot), from `spikes/benchmarks/results/bridge-step-timings.csv` and the archived journals.
- **Whether MobileBuildMCP offers a long-lived mode** (MCP server over stdio, daemon, batch) that the bridge could hold open for a whole run instead of spawning per command, and what ADR-0002 would say about it.

Use the dedicated simulator only, with no concurrent GUI or build work. Record the numbers and commands in `docs/research/` and link them here; don't change product code.

## Answer

Findings: [`docs/research/bridge-latency.md`](../../../docs/research/bridge-latency.md). Benchmark script and raw results: [`spikes/benchmarks/perf/`](../../../spikes/benchmarks/perf/). No product code changed.

- **Split:** across the 64 recorded steps, observe took 47%, act 50%, and Jev judgment 3%. Each observation is two device processes (snapshot, then screenshot), and each action is one, so about 180 processes in total.
- **`npx` costs about 0.5 s per command** (median 488–520 ms across all command types, 12 interleaved rounds, 120 calls). Part of it is a registry round-trip on every call. That is about 26% of recorded step time.
- **CLI startup costs about 0.33 s more per command**, even when called directly (the tool catalog is built on every call). Only a long-lived client removes it.
- **Actions already return the settled screen.** MobileBuildMCP polls for 100 ms of stability, up to 2.5 s, after each tap, type, or swipe, and returns that capture. The bridge ignores it and snapshots again. With `--verbose`, that capture is full but arrives as schema `"3"`, which the bridge currently rejects.
- **Settling and typing are real device time.** Real-app taps have a median of 3.1 s against 1.5 s on the static fixture, and replaceText 4.2 s (three AXe processes).
- **Long-lived modes:** MobileBuildMCP already runs a per-workspace daemon (the reason references survive across calls), but it speaks an internal, versioned socket protocol. The MCP stdio server returns compact snapshots only. AXe can't stay resident, and direct AXe/simctl is ruled out by ADR-0002.
- **Options for "Performance target and tuning plan"**, which combine:
  - A: resolved binary instead of `npx` (~0.5 s per command, low risk);
  - B: reuse the post-action capture (one snapshot fewer per action step, medium risk to guards);
  - C: screenshot concurrently with the snapshot (up to ~0.5 s per capture);
  - D: a long-lived client (~0.35 s more per command, but the daemon protocol is internal).

  Together, A, B, and C are estimated (not measured) to take a median action step from about 5.8 s to about 3.3–3.8 s.
