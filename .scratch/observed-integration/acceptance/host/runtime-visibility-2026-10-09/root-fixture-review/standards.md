# Fixture correction: Standards

**PASS — zero hard documented violations; zero material design or Fowler findings.** Severity: none.

Scope: the supplied three-file diff against `5629e45778af71a9d1fc6aee616ea7d8e24920a3`, reviewed as working bytes bound in `standards-inputs.json`.

- `tests/fixtures/observed-cli-server.ts:97` / `tests/observed-cli.test.ts:98,129`: the PID-specific private readiness marker replaces a scheduling guess with observed entry into the report adapter. Existing CLI signal listeners are installed before that invocation (`src/cli.ts:116–121`). The wrapper forwards the original result and options. The marker neither grants authority nor changes production code.
- `tests/observed-cli.test.ts:21`: waiting for child `close` includes drained stdio; spawn and parsing errors reject the promise instead of escaping an event handler. The single-response assertion remains.
- `tests/observed-service.test.ts:528–544`: the existing fault seam marks finalization. The unchanged 6,500 ms assertion now measures the named finalization phase, including subsequent driver close and publication, rather than earlier action setup. The production 5,000 ms timer is unchanged (`src/observed/service.ts:166–173`). Public outcomes, quarantine, export and late-settlement assertions remain.

Hard-rule review: no conflict with AGENTS secrets rules, domain vocabulary, ADR-0005 frozen public surfaces or ADR-0008 admission authority. No production, golden or packaging-helper changes appear in this bounded diff.

Heuristic review: all twelve supplied Fowler heuristics considered; none warrants a finding. In particular, the local readiness helper has a concrete fixture use; analogous polling loops have distinct predicates and do not justify a generalized test framework. Tests and caller still use the existing composition/fault seams.

Evidence: the repaired Node24 receipt is closed with exit 0; its raw-log hash matches and records 4/4 passes. This is a focused diagnostic, not a replacement full-default verdict. Original full-default failures and unchanged focused pass remain retained. No tests or native operations were executed by this reviewer.
