# 09 — Verify integrated authority with independent host faults

Type: task
Status: ready-for-agent
Mode: AFK
Blocked by: 08
Owner: Host-verification implementer
Model: gpt-6.1-sol
Effort: medium
Skills: do-test, diagnosing-bugs, use-git-worktree
Expected commit: `test: verify observed workflow authority under host faults`

## Dispatch contract

Root supplies a full base SHA from the final pinned planning ref plus integrated dependencies, an isolated worktree/branch and this issue path. Follow [the implementation handoff](../../observed-integration/implementation-plan.md) for common protected files, context, ownership transfers and fixed-format response. Execution starts on Root’s explicit ticket dispatch with the pinned base and satisfied dependencies; the charting effort remains planning only. Stop and report a contract contradiction, unsupported operation, unsafe authority/replay, missing prerequisite or required protected-file edit; return bounded evidence, never substitute success.

## Context

[Validation matrix](../../observed-integration/evidence/validation-matrix.md): H01–H09. [Admission](../../observed-integration/evidence/admission-decision.md): regression matrix. [Public](../../observed-integration/evidence/public-contract.md) and [allocation](../../observed-integration/evidence/allocation-contract.md): oracles.

## Write ownership

Allowed writes: `tests/observed-host-fault.test.ts`; `tests/observed-public-races.test.ts`; `tests/observed-crash.test.ts`; `tests/fixtures/observed-host/**`; this issue's Status and Comments only.

Protected shared files: `src/**`; `spikes/**`; `docs/**`; `skills/**`; `.github/**`; `all other tests`; `acceptance/**`; `existing goldens`, plus the common protected set in the handoff. Exactly one owner writes these allowed files; Root integrates and controls the next transfer.

## Bounded work

Build black-box public subprocess/stdio and milestone harnesses using integrated production resolver/store and isolated fake backends. Cover independent-process/cwd/root aliases, real owner kills, cancellation/dispatch barriers, ignored aborts, COMMIT/export faults, byte/state-invariant reads, duplicate retrieval and legacy successor exclusion. Include recorded store milestones, exact backend counts and null crash flags. Reuse producer tests by invoking public behavior, not duplicating implementation. Report confirmed defects with minimal reproduction for Root; source repairs remain Root-owned.

## Acceptance and stop criteria

H03–H08 exhaustive mapped cases and H01/H02 boundary regressions have assertions and explicit skipped rows. Run added suites and full npm run check once; return commands/counts and case-to-row coverage. Root alone publishes acceptance/host artifacts and integrated verdict.

Completion: Every required host fault row has evidence or a named UNVERIFIED blocker. No simulator, migration of real stores, transport failure or native release claim is inferred. Return the handoff's fixed-format report with full commit/base SHA, files, commands/results, evidence, limitations and unresolved dependencies. A missing required assertion stays UNVERIFIED; a confirmed defect is BLOCKED until Root assigns its fix. No live operations, merge or publish belong to this ticket.

## Comments

