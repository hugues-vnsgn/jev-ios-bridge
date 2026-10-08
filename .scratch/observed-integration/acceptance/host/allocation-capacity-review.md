# Allocation capacity repair review

Verdict: both independent review axes and Root's integrated rerun PASS for the bounded repair. The combined core/migration/allocation/artifact/source suites passed190/190 with zero skips on Node26 and exact Node24.0.0. [Raw integration evidence](allocation-capacity/integration/) records commands, exits, elapsed times, integrated SHA and fixture umask0022.

Base: `b70a7ab3883dfb1530918f16cc39324b1662f91e`. Candidate: `f4dbfcbc5bf76ad89888374ceaf6309655f01588`. Integrated product commit: `dd43313`. Author evidence was copied unchanged from the owned worktree; [source metadata](allocation-capacity/author-source.json) records provenance.

## Standards

Reviewer: `observed_runtime`, temporarily assigned the independent Standards axis before authoring ticket06.

Hard documented breaches: none. Changes stay within the transferred write set. The new read preserves ADR-0008's private SQLite authority and non-mutating inspection, and ADR-0009's retained capacity policy. Naming follows the domain glossary; ticket evidence is appended under Comments as required by `docs/agents/issue-tracker.md`.

Possible named smells: none warrant a finding. The typed capacity pair prevents a Data Clump. The Admission forwarding method preserves the required encapsulation of SQLite. Existing reservation arithmetic and the new read have different responsibilities; extracting them in this bounded change would risk altering protected write behavior.

The reviewer inspected the supplied report and raw logs: genuine initial red, eight validation failures followed by 11 passing capacity cases, 149/149 tests with zero skips on Node 26.8.1 and exact Node 24.0.0, typecheck/build without errors, and runtime umask 0022. Source inspection confirmed the existing consistent read transaction/checksum reader, checked arithmetic and unchanged lifecycle/release/guard behavior. No independent tests were rerun. Simplify was unavailable and did not run.

## Spec

Reviewer: `capacity_spec_review`, an independent reviewer who authored no implementation.

No findings. Inspected exact base-to-candidate diff and matching worktree HEAD. The typed capability meets Root's bounded authorization and the allocation contract's held-capacity requirements. It reads all records within one consistent transaction, validates checksums/capacity fields, excludes only `capacityHeld === false`, sums persisted reservation bytes, and rejects unsafe arithmetic. Changes stay within the five authorized files and introduce no lifecycle, release, guard or SQL-exposure changes.

The reviewer inspected instructions, ADRs 0008/0009, ticket03, accepted allocation contract, implementation, tests and raw evidence. Logs show red failures followed by 11 passing capacity cases and 149/149 tests with zero skips on Node 26.8.1 and exact 24.0.0. Runtime logs record umask 0022; typecheck/build logs contain no errors. The pinned diff check independently passed. Tests were reviewed from supplied raw logs, not rerun.

## Limits

This capability returns a consistent reservation snapshot. Allocator filesystem checks and external disk consumption remain downstream. Neither reviewer edited product files or accessed production stores, devices, secrets or app sources. Full host gates and live acceptance remain pending.

Summary: Standards 0 findings; Spec 0 findings. [Author report and matrix](allocation-capacity/report.md).
