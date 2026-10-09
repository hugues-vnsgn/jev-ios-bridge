# Corrected-candidate Standards review

**FAIL — one material design judgment (D1); zero hard documented breaches or Fowler-baseline findings.**

Correction base: `4fa9cc99a94ebb8c79e6d1fe347ccb83745da13d`  
Candidate: `dcc06dc0939d73d860cae9e03d4f1f47bacbd279`  
Full policy base: `720cb380d07102d72b20a6a4f5f7787a0ab88f2b`

**P1/D1 — the private context channel depends on an invisible caller invariant.** `allocation-config.ts:143,301–302,410–411` resolves `productionInvokers.get(process) ?? ((executable, args, options) => process(executable, args, options))`. Real allocation wraps the registered factory in `trackedProcess` before verification (`allocation.ts:177–180`). That different function satisfies the public type but selects the three-argument fallback, dropping expectations before factory conversion/bootstrap. The new cases call the factory directly (`observed-legacy-volume-runtime.test.ts:357–372`).

This is a design judgment under `codebase-design/SKILL.md`: **Interface** includes all caller invariants; **Locality** keeps knowledge in one module; “The interface is the test surface” requires callers/tests to cross the same seam. It is not labelled a hard repo-rule violation or forced into a Fowler smell. Put context-aware invocation behind a private composition seam shared by tracked allocation and regressions, preserving diagnostics and exact three-argument unregistered callbacks.

All15 changed hunks were inspected using the preserved full720→4fa review. Grouped per-call expectations, shared proofs/reads, cancellation checks and close-only cleanup are otherwise maintainable. Public signatures/defaults and strict helpers remain unchanged. Repo vocabulary/stability/budget rules and all12 Fowler heuristics were applied; tooling-enforced matters omitted.

Exact owned SHA-256:

| File | SHA-256 |
| --- | --- |
| `src/observed/allocation-config.ts` | `735bd7e7b864292a371127d0a4ccecd2ad485ecf456c9081dd5c481b51427cee` |
| `tests/observed-legacy-volume-runtime.test.ts` | `415aa60fa936511bbe33bb4685533cd2c86391dc94057ee23245d8ac1ec3c5cd` |
| `tests/fixtures/observed-legacy-volume-runtime.ts` | `223b33b9b0e79e23a0963804e55f765b266b6592152709588f5dd739621a420f` |

2,337 bounded correspondence checks passed: Source443/protected440/compiled69 and14 command/raw receipts. Both Nodes retain genuine42 failures then42/746/595/2240 passes and typecheck/build0; direct42 regressions do not certify tracked composition. Root’s complete12913-file/10-recorded-link seal is relied on, not re-traversed. Original4fa Node24 cause remains unresolved. Independent Spec notified remainingP1; its final seal is separate. Clean37/wrapped startup, integration and native/live acceptance remain held/unverified. No tests/builds/native effects were performed.
