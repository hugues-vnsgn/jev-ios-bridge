# Handing a step back to Claude

Type: grilling
Status: resolved
Blocked by: 03

## Question

How a paused step reaches Claude and comes back. Settled direction (Codex Q8, Q15, Q17, Q22, Q26):

- **The bridge keeps the device lease** through a hand-back. It returns a paused step with evidence (screen text, screenshot) as an MCP tool result; Claude answers with one corrective action (or a plan revision) through another tool call; the bridge captures a fresh screen before Jev resumes. MCP elicitation is a user dialog, not a callback into Claude, so it isn't the mechanism.
- **Triggers:** Jev below threshold, no candidate fits, a guard trips, an unexpected dialog the plan doesn't cover (Jev never grants permissions or dismisses warnings on its own), a screen the bridge can't safely send to Jev, a destructive action.
- **Screens Jev can't read** (icon-only, canvas) go to Claude with the screenshot; how often this happens is measured, not hidden.
- **Wrong turns aren't app failures:** after a bounded hand-back, a flow that can't recover ends `INCONCLUSIVE`. `FAILED` only when a valid check is reached and the app visibly contradicts it.
- **The bridge owns the recorded verdict.** Claude explains it and may flag an apparent mistake, but any revised conclusion is shown separately.

Still to settle: tool names and schemas, time-outs while waiting for Claude, how hand-backs and Claude's cost appear in the report.

## Answer

Owner approved 2026-10-01 (design batch E1–E15).

- **E3:** keep `start_scenario`, `get_report`, `cancel_run`; add **`resolve_step`**. When Jev needs help, `get_report` returns `status: "needs_claude"` with reason, step, screen text, a screenshot and Jev's top 3 picks. Claude answers with `resolve_step` carrying exactly one of: `tap` (element ref), `tapAt` (x, y; Claude only), `type` (field ref + value key), `scroll`, `back`, `revise` (replace the remaining steps), `stop`. The bridge keeps the device lease while paused.
- **E4:** a pause waits **5 minutes** (configurable); no answer → `INCONCLUSIVE` with `HANDBACK_TIMEOUT`, lease released.
- **E5:** every action records `decidedBy`: `script` | `jev` | `claude`; the report lists hand-backs with reasons and Jev's tokens. Claude's own cost is measured from the session transcript in the live trial.
