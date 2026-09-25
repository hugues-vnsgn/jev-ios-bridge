# Code and design review of v0.1.0 before a stability promise

Type: task
Status: resolved
Claimed by: Claude Code (owner session)
Blocked by: none

## Question

Nothing to decide here; "Product assessment" and "The 1.0 stable contract" wait on the findings. Review the shipped v0.1.0 source (merge commit `f4a3c87`) as a candidate for a 1.0 stability promise, using the `code-review` and `codebase-design` skills:

- **Dead or legacy code:** which modules under `src/` still serve the rejected autonomous design (`run`, `scenario`, `observation`, `report`, `contracts` next to `src/scripted/`) and what the package ships that 1.0 should drop.
- **Seams:** whether the device driver, Jev client, run loop, evidence journal, and report are deep modules with interfaces worth freezing, or whether freezing now would lock in accidental shape.
- **Public surface inventory:** every externally observable contract today (script schema and its error messages, MCP tool schemas, CLI commands, flags and exit codes, report fields, `.jev-runs/` layout, environment variables) and which lack versioning.
- **Defects and risks:** correctness, cancellation and lock-recovery edges, and security of the watch server and redaction, ranked by severity.

Write the findings to a review file under this effort and link it here. Report facts and risks; the keep/cut decisions belong to the downstream tickets.

## Answer

Review: [`code-review.md`](../code-review.md), whole-source review of `main` after v0.1.0. It changes no code. `npm test` wasn't run (no `node_modules` in the checkout). The main agent spot-checked findings 1 and 3.

1. **`value: ''` never matches an empty field** (the comment below is confirmed). `src/scripted/select.ts:31` uses strict equality, and the device parser omits empty values (`src/device/index.ts:101,119`). None of 48,140 archived captured elements carries `value: ""`. The schema, `docs/usage.md`, and `skills/test-ios/SKILL.md` all promise it works.
2. **ADR-0004 isn't implemented yet:** `run.ts:286-287`, `docs/usage.md`, and `docs/architecture.md` still apply "uncertain wins". This blocks freezing verdict semantics.
3. **A retained device lock can't be recovered.** Cleanup gives up after 10 s (`run.ts:148`) while a command may run for 35 s (`device/index.ts:295`). Only a second `close()` releases the lock, which production never calls. The lock's `pid` is never checked, and its path is undocumented. Later runs on that simulator fail `DEVICE_BUSY` until someone deletes the file by hand.
4. **Dead code ships.** `src/run`, `src/scenario`, `src/observation`, and `src/jev` (745 lines) are unreachable from the CLI, MCP, and service entrypoints. `src/report` only serves the watch server's legacy fallback. All of it ships in `dist` with no `exports` map. The main run test exercises `spikes/scripted/run.ts`, a copy that differs from the shipped loop by 61 lines.
5. **The surfaces to freeze are unversioned, and one seam is vendor-shaped.** Only the JSONL envelope has a version (not the script format, reason codes, report, or event payloads). The report is prose only, and selector roles are MobileBuildMCP's strings. The device driver interface would change under tuning option B (schema "3", `act` returning the settled capture), so it and the evidence layout shouldn't be frozen before B is decided.
6. **Lower severity, none able to produce a false pass:**
   - a wait's guard must hold on every poll;
   - a run active in another process reports as `interrupted`;
   - MCP and CLI errors collapse into one generic message;
   - the API key reaches MobileBuildMCP child processes;
   - the watch token has no expiry and is valid for every run;
   - short typed values over-redact the evidence.

## Comments

- 2026-09-25, from "Why assertions abstain": captures omit `value` for empty fields, so a selector with `value: ''` probably never matches, contradicting "An empty value is allowed" in `skills/test-ios/SKILL.md` and `docs/usage.md`. Verify in `src/scripted/select.ts` and include it in the defects list.
