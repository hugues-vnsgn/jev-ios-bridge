# Assemble the v1.3.0 spec

Type: task
Status: open
Blocked by: 10

## Question

Write the v1.3.0 spec for driven mode, with live-test issues 01 (simulator window) and 02 (typed values from env vars) folded in; a fresh-agent review; the owner's acceptance; an ADR that amends ADR-0003.

The spec includes the **per-platform release gate** (Codex Q10, Q29): driven mode is offered on a platform only after it passes there, on a **fresh** cross-app sample: per evaluated app, at least 60 accepted Jev actions with zero wrong accepted actions (about a 5% one-sided 95% upper bound for that app), zero false PASS verdicts, complete live flows, ≥ 70% Jev-handled decisions, and ≥ 50% lower total model cost than Claude driving directly. State-changing actions are reported separately. Scripted runs keep working on every platform.
