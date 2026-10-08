# Observed-action rollout progress

Execution authorized by the owner on 2026-10-08. Planning base: `b8c4a50942551bdf95d00036a6d2f7bb6142ff43` (`plan/observed-action-rollout-2026-10-08`).

| Work | Execution | Agent / model / effort | Evidence |
| --- | --- | --- | --- |
| Durable admission core | integrated | admission_core / gpt-6-astra / high | Integrated `9911710`; independent fix review PASS; 42 focused tests Node24/26, full check1007/1007 plus typecheck/build |
| Offline migration | in progress | migration_readiness / gpt-6-astra / high | Dispatched from `8d8c5a0`; isolated `feat/observed-offline-migration`; Cook/TDD/design/worktree/do-test required |
| Creation and artifact adapters | integrated | source_adapters / gpt-6.1-sol / high | Integrated `448a026`; independent fix review PASS; 41 focused tests Node24/26 |
| Remaining packages | waiting for dependencies | Assigned in implementation handoff | No acceptance claimed |

Root owns integration, independent review dispatch, shared ADR/domain updates and host acceptance. Only the designated Orca pane may operate live simulators, after host gates. Publishing remains out of scope. Each implementer reports exact skills read/applied, red/green evidence, clean commit and remaining limits. Tracker `Status` remains its triage label; `Execution` and `Claimed by` record active work.

Independent review of both first-wave candidates found three Spec defects and one Standards/maintainability resource-management defect. All four were fixed and independently re-reviewed; the historical adapter red-evidence overclaim was corrected. Added `Execution` and `Claimed by` fields were explicitly authorized by Root, so they are not an outstanding scope finding. The unavailable Simplify skill was not run; independent maintainability review was performed instead.

Combined integration at `448a026`: `npm run check` passed1048/1048 tests, zero skips, typecheck and build. Node24.0.0 focused combined suite passed83/83, zero skips. [Raw evidence and corrected report](../observed-integration/acceptance/host/wave1/). This accepts only tickets01/04; complete H01–H09, live acceptance and final safety review remain pending.
