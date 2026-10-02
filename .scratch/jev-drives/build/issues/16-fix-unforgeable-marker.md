# Fix: an unforgeable mask marker (Codex round 3 P2)

Status: ready-for-agent
Type: task
Spec: [../spec.md](../spec.md)
Review: `.worktrees/handoffs/jev-drives/codex-review-round3.md` (the remaining finding and its probe), Issue 15's report (its three leftover cases)
Blocked by: none

## What to build

Driven mode masks typed values with `[value:<key>]`, built from characters a typed value may also contain, so a value can overlap a marker's edge (`{ user: "abc", pin: "user]123" }` leaks `user]123`).

1. **Marker:** everything driven mode sends to Jev or shows in the pause package uses `⟦value:<key>⟧` (U+27E6 / U+27E7) instead of `[value:<key>]`: `maskValues`/`maskElement`/`maskSnapshot` in `src/driven/decide.ts`, plan values in the request, checkpoint masking for `do` scripts, the pause package. The v1 log pane masker (`src/logpane/format.ts`, `[value:<key>]`) and the run-log redactor (`[REDACTED]`) stay exactly as they are.
2. **Values:** in scripts with a `do` step, refuse any typed value containing `⟦` or `⟧` with `INVALID_VALUE` (replace the coordinator's `[value:` rule in `openDrivenProject`; the message names the key, never the value). iOS values are ASCII-only, so this only ever bites Android values.
3. **Masking:** with values unable to contain the marker's brackets, scan left to right; an existing marker is skipped whole; otherwise the longest typed value starting at that position is replaced. Masking twice changes nothing.
4. Update the docs (`13-driven-steps.md`, any `[value:` mention for driven mode) and the skills' driven sections.

## Acceptance

Regression tests: Codex's round-3 probe and Issue 15's three leftover cases (`{user:'abc', other:'[value:user]'}`, `{k:'ab', w:'q[value:k'}`, `{user:'abc', pin:'user]123'}`) leave no typed value in Jev's request or the pause package, and masking is idempotent; a value with `⟦` is refused. `npm run check` passes; no golden changes (v1 masking untouched).
