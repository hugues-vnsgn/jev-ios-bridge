# Observed-action rollout progress

Execution authorized by the owner on 2026-10-08. Planning base: `b8c4a50942551bdf95d00036a6d2f7bb6142ff43` (`plan/observed-action-rollout-2026-10-08`).

| Work | Execution | Agent / model / effort | Evidence |
| --- | --- | --- | --- |
| Durable admission core | integrated | admission_core / gpt-6-astra / high | Integrated `9911710`; independent fix review PASS; 42 focused tests Node24/26, full check1007/1007 plus typecheck/build |
| Offline migration | integrated | migration_readiness / gpt-6-astra / high | Integrated `60efe5f`; all findings independently closed; full check1091/1091 plus typecheck/build; Node24 combined126/126 |
| Transactional allocation store | integrated | allocation_store / gpt-6-astra / high | Integrated `009a798`/`a49abb7`; Spec and Standards repair re-review PASS; combined1144/1144 plus typecheck/build; Node24 combined179/179 |
| Creation and artifact adapters | integrated | source_adapters / gpt-6.1-sol / high | Integrated `448a026`; independent fix review PASS; 41 focused tests Node24/26 |
| Shared iOS driver | implementing | shared_driver / gpt-6.1-sol / high | Read-only interface compatibility complete; receives accepted03 capability and exclusive driver/lease/factory ownership |
| Remaining packages | waiting for dependencies | Assigned in implementation handoff | No acceptance claimed |

Root owns integration, independent review dispatch, shared ADR/domain updates and host acceptance. Only the designated Orca pane may operate live simulators, after host gates. Publishing remains out of scope. Each implementer reports exact skills read/applied, red/green evidence, clean commit and remaining limits. Tracker `Status` remains its triage label; `Execution` and `Claimed by` record active work.

## Continuation — 2026-10-08

The owner authorized continuing the remaining execution order. Current integration base is `dc31c577a30b2aca0c8638f03420fd05b611dce7`; the main checkout remains protected. The predecessor allocation worker ended with `turn_aborted` at 03:48:24 UTC. Its candidate files and evidence are preserved, and a new allocation-store worker resumes the same worktree and exact write set. No duplicate writer was dispatched.

Remaining sequence: 03 review/integration → 05 driver → 06 runtime + 07 allocator → 08 public adapters → 09 faults + 10 installed documentation → H01–H09 → 11 serial live acceptance → 12 independent safety review. Live acceptance remains UNVERIFIED. The old pane address returned `terminal_handle_stale`; refreshed inventory identifies its tab/leaf as the current coordinator session. A verified sole-operator binding is required before ticket11 dispatch.

The owner subsequently approved the idle sibling pane `b0e5a4b6-106b-4dab-a49a-b3933445d4ef:f8633393-2114-4b9e-a4d7-6a85e0f16db3` with `gpt-6-luna` high. Ticket11 and the handoff now bind that pane. No live work has been dispatched.

Wave E readiness completed without product edits or device commands. Runtime and allocator agreed on full `ActionBinding` consumption, authoritative `readAction()` projection and zero-call parked attachment. Allocator readiness found two prerequisites: installed metadata exposes iOS18.6/26.4, while the historical iOS27.0 target is absent; and second storage checks need all held reservation bytes, including retained/quarantined records. Root dispatched the prior store owner in a fresh worktree at `b70a7ab` to add only `readAllocationCapacity(): { heldAllocations; reservedBytes }` with tests and independent review. No runtime substitution is automatic.

Driver baseline evidence includes an unintended real runner invocation on synthetic UUID `ABCDEF00-0000-4000-8000-000000000001`: app launch failed and the old diagnostic path attempted a list. Raw vendor stdout was not retained by that old path, so side effects are unconfirmed. The worker preserved the original red log, corrected explicit existing runner/window-opener injections, and will issue no cleanup or diagnostic device calls. This incident is not live acceptance evidence.

Ticket03 accepted at `a49abb7`: combined check1144/1144, zero skips, typecheck/build pass; exact Node24.0.0 combined admission/migration/allocation/artifact/source suites179/179, zero skips. The first Root capture inherited umask0077 into test children and accidentally masked unsafe-permission fixtures; its four failing results are preserved. Keeping evidence private while using fixture umask0022 makes the four unchanged cases pass and both complete checks pass. No product/assertion repair was made for that harness mistake. [Independent review and integration evidence](../observed-integration/acceptance/host/allocation-review.md).

Independent review of both first-wave candidates found three Spec defects and one Standards/maintainability resource-management defect. All four were fixed and independently re-reviewed; the historical adapter red-evidence overclaim was corrected. Added `Execution` and `Claimed by` fields were explicitly authorized by Root, so they are not an outstanding scope finding. The unavailable Simplify skill was not run; independent maintainability review was performed instead.

Combined integration at `448a026`: `npm run check` passed1048/1048 tests, zero skips, typecheck and build. Node24.0.0 focused combined suite passed83/83, zero skips. [Raw evidence and corrected report](../observed-integration/acceptance/host/wave1/). This accepts only tickets01/04; complete H01–H09, live acceptance and final safety review remain pending.
