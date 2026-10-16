# Observed rollout — first implementation wave

## Context

The owner authorized autonomous execution of the [observed rollout](../../.scratch/observed-integration/implementation-plan.md), with skill-using parallel implementers and Root responsible for integration. Target apps remain unmodified; only the designated Orca pane may operate live simulators after host gates.

## What happened

Admission core and source/artifact adapters were implemented in separate worktrees. Cook, TDD, codebase-design, do-test and worktree isolation were applied. Independent code-review agents reviewed Spec and Standards/maintainability. They found a lost cancellation decision after a failed store write, unsafe preexisting SQLite sidecars, a staged-file verification race and a descriptor leak. Authors used diagnosis, regression tests and verification to fix all four; independent re-review passed.

Root integrated the components at `448a026`. Full check passed1048 tests with no skips, plus typecheck/build; minimum Node24.0.0 passed83 focused tests. [Review and raw evidence](../../.scratch/observed-integration/acceptance/host/wave1-review.md) records scope and limits.

## Reflection

Green initial suites missed four failure paths. Independent fault reproductions established the defects before fixes. Two historical adapter red logs were masked by fixture cleanup; the corrected report disclaims them and labels later mutation audits separately. Simplify was unavailable; independent maintainability review was performed without claiming the skill ran.

## Decisions and next work

Admission ownership transfers to the migration implementer from pinned `8d8c5a0`. Historical formats and conservative conflict rules are documented in ticket02. Migration must preserve source bytes and uncertainty, reserve historical identities without preparation permission, and require explicit operational quiescence. Root will review and integrate migration before allocation storage and driver work. The complete host/live acceptance matrix remains unverified; no merge, release or publication occurred.
