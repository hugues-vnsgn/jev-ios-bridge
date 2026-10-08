# Observed-action rollout progress

Execution authorized by the owner on 2026-10-08. Planning base: `b8c4a50942551bdf95d00036a6d2f7bb6142ff43` (`plan/observed-action-rollout-2026-10-08`).

| Work | Execution | Agent / model / effort | Evidence |
| --- | --- | --- | --- |
| Durable admission core | in progress | admission_core / gpt-6-astra / high | Isolated branch `feat/observed-admission-core`; Cook, TDD, codebase-design, do-test required |
| Creation and artifact adapters | in progress | source_adapters / gpt-6.1-sol / high | Isolated branch `feat/observed-source-adapters`; Cook, TDD, codebase-design, do-test required |
| Remaining packages | waiting for dependencies | Assigned in implementation handoff | No acceptance claimed |

Root owns integration, independent review dispatch, shared ADR/domain updates and host acceptance. Only the designated Orca pane may operate live simulators, after host gates. Publishing remains out of scope. Each implementer reports exact skills read/applied, red/green evidence, clean commit and remaining limits. Tracker `Status` remains its triage label; `Execution` and `Claimed by` record active work.
