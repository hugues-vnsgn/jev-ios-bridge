# Code and design review of v0.1.0 before a stability promise

Type: task
Status: open
Blocked by: none

## Question

Nothing to decide here; "Product assessment" and "The 1.0 stable contract" wait on the findings. Review the shipped v0.1.0 source (merge commit `f4a3c87`) as a candidate for a 1.0 stability promise, using the `code-review` and `codebase-design` skills:

- **Dead or legacy code:** which modules under `src/` still serve the rejected autonomous design (`run`, `scenario`, `observation`, `report`, `contracts` next to `src/scripted/`) and what the package ships that 1.0 should drop.
- **Seams:** whether the device driver, Jev client, run loop, evidence journal, and report are deep modules with interfaces worth freezing, or whether freezing now would lock in accidental shape.
- **Public surface inventory:** every externally observable contract today (script schema and its error messages, MCP tool schemas, CLI commands, flags and exit codes, report fields, `.jev-runs/` layout, environment variables) and which lack versioning.
- **Defects and risks:** correctness, cancellation and lock-recovery edges, and security of the watch server and redaction, ranked by severity.

Write the findings to a review file under this effort and link it here. Report facts and risks; the keep/cut decisions belong to the downstream tickets.

## Comments

- 2026-09-25, from "Why assertions abstain": captures omit `value` for empty fields, so a selector with `value: ''` probably never matches, contradicting "An empty value is allowed" in `skills/test-ios/SKILL.md` and `docs/usage.md`. Verify in `src/scripted/select.ts` and include it in the defects list.
