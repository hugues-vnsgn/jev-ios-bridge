# Observed-action rollout progress

Execution authorized by the owner on 2026-10-08. Planning base: `b8c4a50942551bdf95d00036a6d2f7bb6142ff43` (`plan/observed-action-rollout-2026-10-08`).

| Work | Execution | Agent / model / effort | Evidence |
| --- | --- | --- | --- |
| Durable admission core | review fixes in progress | admission_core / gpt-6-astra / high | Candidate `03fcbe4`; 30 focused tests pass on Node 24/26; cancellation-persistence and existing-journal defects require fixes |
| Creation and artifact adapters | review fixes in progress | source_adapters / gpt-6.1-sol / high | Candidate `d5a5a8d`; 38 focused tests pass on Node 24/26; descriptor verification and cleanup defects require fixes |
| Remaining packages | waiting for dependencies | Assigned in implementation handoff | No acceptance claimed |

Root owns integration, independent review dispatch, shared ADR/domain updates and host acceptance. Only the designated Orca pane may operate live simulators, after host gates. Publishing remains out of scope. Each implementer reports exact skills read/applied, red/green evidence, clean commit and remaining limits. Tracker `Status` remains its triage label; `Execution` and `Claimed by` record active work.

Independent review of both first-wave candidates is complete. Spec review found three defects; Standards/maintainability review found one resource-management defect. Neither candidate is integrated or accepted yet. Implementers are applying diagnosing-bugs, TDD and do-test to the fixes. Two adapter historical red logs contain cleanup errors and do not prove the claimed behavioral failures; the author must correct that evidence. Added `Execution` and `Claimed by` fields were explicitly authorized by Root, so they are not an outstanding scope finding. The unavailable Simplify skill was not run; independent maintainability review was performed instead.
