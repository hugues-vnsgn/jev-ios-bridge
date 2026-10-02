# Live prototype across apps

Type: prototype
Status: open
Blocked by: 04, 05, 06, 07, 08, 09

## Question

A throwaway driven-mode loop, run on complete flows in the ticket 02 apps (at least one maintained outside this repo; the owner's app SM flows T1–T4 are one case), on the platform(s) chosen there.

- **Baselines first:** the same flows with v1.2 scripts and with Claude driving directly (the live test's Phase B method). Fix the cost target after the baselines and **before** the driven runs: at least 50% lower total model cost than Claude driving directly, with no correctness loss (Codex Q13).
- **Count everything** (Codex Q3, Q12, Q23): every action decision (scripted, Jev, Claude), hand-backs and plan revisions; completed flows; wrong actions; false PASS; total Claude + Jev cost; time. Report per app and platform, never only in aggregate.
- Outcome: whether to write the v1.3.0 spec, and the numbers it starts from.
