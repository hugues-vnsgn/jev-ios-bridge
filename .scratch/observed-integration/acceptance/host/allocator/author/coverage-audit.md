# Final repaired coverage audit

Exact source: repair-gate-hashes.json. Raw: repair-final-coverage-node26.log, EXIT0,111/111,0skips. Threshold oracle: do-test80%lines/70%branches per changed file; no repository threshold overrides found.

| File | Lines | Branches | Functions | Verdict |
| --- | --- | --- | --- | --- |
| allocation-config.ts | 99.57% | 88.24% | 95.35% | PASS |
| allocation-schema.ts | 100% | 100% | 100% | PASS |
| allocation.ts | 98.44% | 88.11% | 91.94% | PASS |
| Overall source | 99.04% | 88.98% | 94.12% | PASS |

Read reported uncovered lines individually:

- config89: create name prefix/UUID predicate. Exact accepted name and malformed/noncanonical name rejection are asserted by production process composition, stopped receipt and plist allowlist tests. Fake injected spawn proves no invocation on denied requests. This mapped expression line is reported uncovered despite those assertions; no actual production spawn/native child certified.
- allocator104: directory path cursor declaration. Directory setup executes in every fresh allocation, verified through actual private readiness/proof/staged artifacts. No independent behavior or missing mutation branch on this declaration.
- allocator105: directory lstat try. Existing directories are traversed, missing directories are created, unsafe evidence/store/artifact path cases refuse. Assertions inspect private absolute evidence files and store association. Coverage reports this async setup line uncovered; host filesystem proofs are from the assertions rather than a claim of100% instrumentation.
- allocator196: supplied availability refusal. Explicit unavailable supplied vendor identity test asserts INVENTORY_INELIGIBLE/refused and exact sole list call, no boot/create. Happy supplied test asserts list-before-boot. Both test names are visibly PASS in the same coverage log.
- allocator197: closing supplied conditional; no separate behavior.
- allocator198: booting phase assignment. Created and supplied phase/cancel/stage tests assert the phase-dependent effects and known acknowledged BOOT_FAILED result. No distinct missing branch on assignment.

These are declaration/control/source-map reporting limitations, not permission to omit the behavioral assertions. Critical mutation branches have concrete matrix rows: reserve/stage/create guard/known receipt/admit/park, cancellation before/after commit failure, lost replies, unknown creation, stage deadlines, held capacity, and uncertain failure finalization. Crash-owner proof remains limited to the explicitly killed fake-host preparation subprocess and synthetic lost-commit seams; no native settlement, real transport or production-storage certification is claimed.
