# Where bridge time goes: a per-step latency breakdown

Type: task
Status: open
Blocked by: none

## Question

Nothing to decide yet; "Performance target and tuning plan" and "Product assessment" wait on these facts. Prepared execution is dominated by device work (Weather: observe 51.5 s, act 49.0 s, judge 3.5 s out of 107.7 s). Break that down so the removable part is visible:

- **Process spawn overhead:** every device command runs `npx --yes mobilebuildmcp@2.7.1` (`src/device/index.ts`, `defaultRunner`). Measure a no-op or cheap command through `npx` vs a resolved local binary, cold and warm.
- **Per-command cost:** capture (compact vs full), screenshot, tap, type, swipe, and the settle or wait time inside each.
- **Commands per step:** how many device commands a typical action, wait, or checkpoint step issues (pre-guard capture, action, post-action capture, screenshot), from `spikes/benchmarks/results/bridge-step-timings.csv` and the archived journals.
- **Whether MobileBuildMCP offers a long-lived mode** (MCP server over stdio, daemon, batch) that the bridge could hold open for a whole run instead of spawning per command, and what ADR-0002 would say about it.

Use the dedicated simulator only, with no concurrent GUI or build work. Record the numbers and commands in `docs/research/` and link them here; don't change product code.
