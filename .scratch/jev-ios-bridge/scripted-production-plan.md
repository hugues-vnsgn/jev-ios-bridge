# Scripted production integration plan

Status: approved by the main agent under the owner's release delegation after the assertion, 12-script execution, and three fault-probe gates passed. Installed-host, diagnosis, benchmark, and final release checks remain pending.

## Public contract

The v0.1 CLI and MCP accept explicit scripts only. They reject the former goal-only and autonomous-checkpoint forms. Keep the three tool names `start_scenario`, `get_report`, and `cancel_run`, one submission, progress-only running replies, a bounded 45-second report wait, and final evidence reports. `/test-ios` authors the full script before submission and does not direct steps during a run.

Promote the tested script schema, selectors, runner, assertion projection and adapter, and report into `src/scripted/`. Preserve the spike and immutable experimental evidence for replay. Keep legacy modules only where historical tests/harnesses depend on them; public service, CLI, and MCP must no longer call their autonomous loop or Choice judge. No new dependency is required.

## Boundaries

| Owner | Implementation |
| --- | --- |
| Production ports agent | `src/scripted/{contracts,schema,observe,jev}.ts`; service, CLI, MCP, public-input fixtures and tests |
| Execution/review agent | `src/scripted/{select,run,report}.ts`; watch rendering, device context types, runner/report/watch tests |
| Live execution agent | Dedicated-simulator checks, installed-host and benchmark artifacts; only agent issuing device commands |
| Main agent | Ticket decisions, spec and domain docs, skill prose, integration review, commits and release |

Coordinate contracts first. `DeviceDriver.prepare` needs only app/device/preconditions. `act` additionally needs explicit typed values. Introduce those narrow contexts without changing launch, acknowledgement, lock, or cleanup behavior; remove dummy goal/assertion data from the production runner. Keep legacy callers structurally compatible.

Preserve the existing case-insensitive device lock: uppercase/lowercase UUID spellings already share one lock. Canonicalize the UUID consistently in CLI calls and snapshots as well, verify exclusion with two driver instances, and retain invalid-alias rejection. This is an invariant check, not a previously demonstrated lock bypass.

The generic selector rule remains strict. Only the concrete pinned MobileBuildMCP factory opts into its proven identical-button tap alias rule. The option belongs to internal service/runner configuration, not the user script or tool limits.

## Policy and observations

Preserve the validated Noul-only request and full-text projection byte-for-byte in behavior: model `jev-1.13.0`, no Choice/completion question, current claims and observed screen only, fixed 0.9/0.1 bounds, 24,000-byte rendered-state cap, 28,000-byte state-plus-question cap, and 56,000-byte request cap. Unknown/malformed answers, uncertain claims, unavailable targets, wrong guards, timeout, and cancellation remain inconclusive. A confidently false assertion fails; all steps/checkpoints must pass before a passed verdict. Cleanup failure prevents a pass.

Public run limits are integer maxSteps 1–100 and wallTimeMs 1–3,600,000, with whole-run defaults 100 steps and 300,000 ms. Explicit benchmark limits may be larger in time but never alter judgment thresholds. Preserve bounded waits, failed-phase timings, reference counters, and interrupted evidence.

Preparation uses MobileBuildMCP's logging launch, which restarts the app. The simulator must be booted and the app installed. Scripts start from observed post-launch screens; persistent test data may be a precondition, transient navigation must be performed by the script. Apps may restore different UI states; guards must recognize the intended class of screen and reject editors or modals that expose similar controls.

## Evidence and reporting corrections

The live Weather report exposed a truncation problem: the first 48 accessibility rows omit foreground Settings controls. Production must retain the redacted assertion observation as local evidence and build a useful semantic excerpt that includes labelled/value-bearing foreground controls. Do not change the text sent to Jev to fix report presentation. Link each checkpoint to its decisive step/screenshot and claims/probabilities, label truncation, and provide the full local evidence path.

Running/interrupted progress counts script step numbers, not repeated wait-capture events. Report and watch use the same recorded final verdict and checkpoint events; neither re-judges evidence. Adapt the watch page to scripted action, judgment, wait, and checkpoint fields while preserving token access, text-only rendering, private files, and interrupted-run recovery.

The privacy description must match the implementation: TypeSafe receives observed screen text and current assertion claims. Supplied typed values go to device actions and redaction; they can subsequently appear in captured screen text. Screenshots remain local. Host context includes the submitted script and final report, not per-step running screens.

## Verification and completion

Run production-import tests for schema, selector equivalence, Noul request identity, loop policy, cancellation, locks, report recovery, and redaction. Update service/MCP/CLI fixtures to scripts and test rejection of legacy inputs before device work. Verify public limits, running-report isolation, and installed package/skill behavior. Run one integrated `npm run check` after the module owners finish.

Then complete the real installed Claude Code path, blind diagnostic report task, and same-machine benchmark comparisons. Baselines run without concurrent GUI/build activity. Record failures and authoring/maintenance costs rather than claiming savings from prepared execution alone. Reconcile tickets 09–17 and the production spec with those results, finish independent standards/spec review, and only then merge and publish the GitHub v0.1.0 prerelease.
