# Maintenance entrypoint repair — accepted

Root fast-forwarded the integration checkout from `c1577abbd6933aa133b7b2007a442c2a18c7b4cc` to the identical tested candidate `2c6c41845e9db05de451d7b10d1674fc9136b891`. This accepts the bounded dependency repair; whole H01–H09 and live acceptance remain UNVERIFIED.

## Defect and scope

Ticket10's genuine packed installation on both Node versions reached maintenance help and exposed a production entry guard defect: the `/tmp` spelling exited0 with empty stdout, while the canonical `/private/tmp` spelling printed help. The original failed commands, compiled bytes and frozen ticket10 source are [preserved](maintenance-entry/trigger/preservation.json). That is selected trigger evidence; registry caches and complete installed dependency trees are excluded from the preservation claim.

Product candidate `535973ed85ef206ab8a613105e9b24b620753c98` changes only `src/device/admission-maintenance.ts` and its new entry test. It uses guarded canonical filesystem comparison, matching the accepted CLI pattern. The complete help text and exported maintenance function remain byte identical; declaration validation, fixed production destination, source preservation and migration dispatch are unchanged. The same five-case oracle fails3/5 before repair and passes5/5 afterward on Node26.8.1 and exact24.0.0. [Repair basis](maintenance-entry/author/repair-basis.md).

Full exact24 validation exposed an additional unchanged offline-report stderr fixture boundary. The original selected test fails0/1 on both the maintenance parent and accepted pre08 code, with identical test bytes and the exact complete two-line SQLite runtime notice. Fixture-only child `2c6c418` changes just that named test in `tests/integration-edge.test.ts`: recognize the exact anchored notice, then retain the original empty program remainder assertion. Negative assertions keep incomplete, unknown and prefixed notices and subsequent diagnostics visible. Exit/stdout/evidence/key assertions stay unchanged. There is no production suppression, warning flag, golden or timeout change. [Baseline, final bytes and association](maintenance-entry/author/node24-report-warning/association.json).

## Independent reviews

Both axes PASS on the exact product candidate and its separate fixture child; current, frozen and committed hashes match before/after. The child reviews verify both earlier product files retain their reviewed bytes.

- Product [Spec](maintenance-entry/review/spec/review.md) and [Standards](maintenance-entry/review/standards/review.md).
- Fixture child [Spec](maintenance-entry/review/warning/spec/review.md) and [Standards](maintenance-entry/review/warning/standards/review.md).

These reviewers made no product changes or device/store migration operations. This is dependency review, not ticket12 safety acceptance.

## Checks and preserved failures

| Gate | Node26.8.1 | Exact Node24.0.0 |
| --- | --- | --- |
| Entry red / green, identical oracle | 3/5 → 5/5 | 3/5 → 5/5 |
| Focused admission/migration/entry suites, product candidate | 251/251 | 251/251 |
| Repaired selected report fixture | 1/1 | 1/1 |
| Complete final-candidate serial tests + typecheck/build | 1475/1475, PASS | 1475/1475, PASS |
| Actual final-candidate `npm run check` recheck | 1475/1475, PASS | 1475/1475, PASS |
| Physical Root checkout: entire entry file + selected report case | 5/5 + 1/1 | 5/5 + 1/1 |

All listed final gates have zero skips. Physical Root typecheck/build pass. All37 audited files match the accepted candidate before/after checks. Complete checks ran in the repair checkout at the identical fast-forwarded commit; physical Root focused checks are [recorded separately](maintenance-entry/integration/source-audit-after.json).

The first default Node26 full run failed the unchanged boot-poll fixture; its recheck passed. The first exact24 full run failed that timing case and the original stderr fixture. The first child exact24 full run failed only the timing case. The unchanged timing test passes isolated and in complete serial gates; later actual default commands pass on both versions. Every failure and later pass is preserved, with no assertion/budget change. The1100ms aggregate stage includes the first response and1000ms pause, so scheduler delay can prevent its assumed second poll. No selected or serial command is relabeled as a default full command.

Two result-harness mistakes are preserved separately: the report count reader first expected TAP from Node's spec reporter, and Root's first integration name filter missed the maintenance case names. Neither changed source. Corrected commands explicitly select the intended reporter/case or run the entire entry test file. [Root selection note](maintenance-entry/integration/first-selection-note.md).

Coverage on the product candidate runs48/48 with zero skips: maintenance source98.21% lines,76.92% branches,100% functions. The remaining uncovered source line is the unchanged JSON-read error catch; migration behavior is inspected as unchanged and tested by existing isolated suites, with no real migration inferred.

## Preservation and limits

All author artifacts, including raw coverage, are archived with every member hash verified; original files are untouched. Noncoverage artifacts also have loose copies. [Author inventory and archive checksum](maintenance-entry/author/preservation.json). Each independent report has its own preservation manifest. Initial ticket10 bin-path harness failure remains distinct from the actual maintenance source defect.

No production activation, key access, device operations, replay, cleanup, merge to main or publication occurred. Ticket10 must rerun its original mandatory clean-install proofs after Root's audited dependency update; these dependency checks do not substitute for that proof. Timing sensitivity remains documented for future complete gates.
