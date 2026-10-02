# Stuck detection, budgets and risky actions

Type: grilling
Status: resolved
Blocked by: 03

## Question

Rules kept in code, not in Jev:

- Stuck signs: unchanged screen after an action, the same action repeated, back-and-forth between two screens; per-step and per-run budgets.
- **Risk levels** (Codex Q2, Q21): Jev may press an explicitly permitted test write (Send, Approve) only under a stricter threshold and only after the project preflight passed (ticket 08); actions the project marks destructive or irreversible (Delete) always go to Claude, whatever Jev's confidence.
- App text is untrusted input to Jev (it can steer answers), so candidate lists, effects and limits are enforced by code.
- Thresholds come from the spike's frozen numbers.

## Comments

- 2026-10-01, from ticket 03's result: **target search is the bridge's job.** Jev never chose to scroll for a target it couldn't see (3 of 4 spike misses). Design a code-owned search: when Jev answers `none_fits` or stays under the threshold and the screen can scroll, the bridge scrolls and asks again, within a budget, then hands back to Claude. Must be proven on new cases in ticket 10.

## Answer

Owner approved 2026-10-01 (design batch E1–E15).

- **E9 target search:** when Jev answers `none_fits` or stays under the threshold and the screen can scroll, the bridge scrolls down up to 3 times, then up up to 3 times, asking Jev again each time; then hands back. Counts toward the step budget.
- **E10 stuck:** screen unchanged after an action → one retry, then hand back; the same action 3 times → hand back; A→B→A→B → hand back; **8 Jev decisions per step**, plus the run's step and time limits.
- **E11 risky-word net:** a Jev pick on a control labelled like Delete, Remove, Erase, Reset, Sign out, Unsubscribe or Pay is never accepted, whatever the step's effect; it goes to Claude.
