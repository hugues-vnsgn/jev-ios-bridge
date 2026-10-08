# Offline migration independent review

2026-10-08. Candidate `0b06c1be391aa3a33e208e709c7b29ba245dc222`, base `8d8c5a0f582d025eab9da85611b0d38ce6c377f2`. Candidate remains unintegrated. All review reproductions used isolated temporary stores, without device operations or production migration.

## Standards

Reviewer `wave1_standards`, gpt-6.1-sol/high, code-review skill. No documented-standard breaches or actionable baseline smells; seven changed paths satisfy the authorized write set. Simplify was unavailable and was not run.

**P2 resource/lifecycle defect:** `admission-migration.ts:66` opens historical records with blocking O_RDONLY before checking regular-file type. A recognized UUID lease path containing a FIFO hangs with no writer. A bounded child required SIGKILL after two seconds and retained migration.lock. Use nonblocking/no-follow open with descriptor validation and a bounded child regression. This duplicates the Spec finding below, not a second independent defect.

Standards/maintainability: one P2 finding, zero documented-standard breaches.

## Spec

Reviewer `core_spec_review`, gpt-6-astra/high, code-review and do-test skills.

- **P1 unsafe-source rerun:** `admission-migration.ts:198` validates source roots before taking the migration guard. After a successful import, replacing the formerly absent default journal root with a symlink makes re-import fail STATE_UNAVAILABLE while an already opened Admission still acquires devices. Observed `guardRetained false`, `acquire acquired`. This violates ticket02's unsafe-import closure and bypasses existing changed-source protection. Source-root failures for initialized destinations must close admission while preserving source/destination-overlap protection. Cover unsafe, missing declared and unreadable roots on rerun.
- **P2 malformed FIFO:** record opening blocks before file-type validation, preventing the required malformed-source refusal. Use nonblocking/no-follow opening and regular-descriptor validation; add a child-process regression.

Spec: two findings, worst P1. Operational declarations correctly remain assertions, with no fabricated quiescence or native-release proof.

## Evidence and disposition

Spec reviewer independently passed77/77 existing core/migration tests, zero skips. Both reviewers inspected Node24/26 and typecheck/build logs. Those passing suites omitted the two reproduced cases. Author raw logs remain at `/tmp/jev-migration-evidence-XmqMkh` pending final archival.

A newly saved repeated FIFO reproduction is `/tmp/jev-migration-fifo-review-NNyLJ4/reproduce.mjs` with `reproduction.log`: pinned candidate, Node26.8.1, deadline2000ms, elapsed2011ms, SIGKILL, stdout `entered`, no stderr, guard retained. Temporary source/store fixtures were removed; evidence files retained. This was a fresh repetition, not a claim that the earlier diagnostic run had been saved.

Root assigned both fixes to the original author with diagnosing-bugs, TDD and do-test. Re-review and combined integration checks remain required before ticket03 receives store ownership. No human intervention is required for these implementation defects.
