# Test-environment preflight and permitted writes

Type: grilling
Status: resolved
Blocked by: 03

## Question

A generic bridge can't know whether an app talks to test or production data. Settled direction (Codex Q2, Q7, Q14): **a project-supplied, machine-checkable preflight** runs before any autonomous write. It checks project facts such as build flavor, endpoint or tenant, and **fails closed**: if it's missing or fails, the run pauses before write steps. Writes also need an explicit permitted-effect step in Claude's plan.

Still to settle: what form the preflight takes (a command, a script field, a file in the app repo), what it returns, how its result appears in the report, and an example for an app like the owner's app, whose test tenant lives on the production server.

## Answer

Owner approved 2026-10-01 (design batch E1–E15).

- **E12:** the app repo holds **`.jev/preflight.json`** naming a command (e.g. `./scripts/is-test-env.sh`). The bridge runs it once before the first `test_write` step: exit 0 = test environment; a missing file or any failure = no Jev writes, those steps go to Claude. It lives in the repo, not the plan, so Claude can't declare it. The result is in the report.
