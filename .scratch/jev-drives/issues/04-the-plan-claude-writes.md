# The plan Claude writes

Type: grilling
Status: resolved
Blocked by: 03

## Question

The exact shape and rules of the plan Claude submits. Settled direction (Codex Q16, Q20, Q23, Q25, Q27, Q28):

- **A small validated plan**, not free prose: each step has a natural-language intent, a "done when" condition stated as visible evidence, input references (literal or `fromEnv`, see live-test issue 02), and its permitted effects (none, test write, destructive).
- **Scripted and driven steps can mix** in one plan (e.g. a fixed login, then Jev on a changing screen). Every action records who chose it: script, Jev or Claude.
- **Claude may revise the remaining steps** mid-run; completed steps and their evidence stay; each revision is recorded.
- **Start mode:** restart the app by default; an explicit "attach to the current screen" option; the report records which was used.
- **The expected result comes from the developer** (request, spec or existing tests). Claude turns it into checks; when it's missing, Claude asks or leaves that check inconclusive. No guessed claims (dogfood lesson).
- **Persistence:** the verdict is UI evidence. To show a record was saved, the plan reopens or searches for it; a backend check, where a project has one, is reported separately by Claude.

Still to settle: the schema itself, validation errors, how it reuses today's script schema, and the skill text that teaches Claude to write it.

## Answer

Owner approved 2026-10-01 (design batch E1–E15).

- **E1:** script `"version": 2` adds one step kind, `do` (a Jev-driven step): `id`, `intent`, `doneWhen` (visible evidence, required), `effect` (`none` | `test_write` | `destructive`, required), optional `values` (value keys the step may type; values come from the script's `values`, literal or `{ "fromEnv": NAME }`), optional `localOnly`. Existing `action`, `wait` and `checkpoint` steps work unchanged in version 2, so scripted and driven steps mix. Version 1 scripts are untouched.
- **E2:** `"start": "restart"` (default) or `"attach"` (start from the current screen without relaunching); recorded in the report.
