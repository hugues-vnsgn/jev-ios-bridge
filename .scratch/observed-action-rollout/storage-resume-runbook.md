# Resume after the storage refusal

Current as of 2026-10-11. Root coordinates the resumed roadmap; the sole operator performs all account, native, build and device operations. This runbook prepares the remaining work. Root dispatches each gated stage after auditing its prerequisites.

## Bind the current checkpoint

Worktree: `/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic`. Evidence checkpoint: `7482f2a4d`; Root supplies the full current integrated SHA at dispatch and declares subsequent evidence-only changes. Product remains frozen against the accepted [443 Source / 69 compiled / 15 original host manifest](../observed-integration/acceptance/host/runtime-visibility-2026-10-09/root-adr-review-correction/root-audit.json).

Sole operator: `term_b2a0f5b5-3228-4fad-bf5d-d08d08be3405`, tab/leaf `b0e5a4b6-106b-4dab-a49a-b3933445d4ef:2002f159-05e1-4609-822f-a0e72b9674ab`, GPT-6.1-Sol xhigh. Root verifies the current pane and idle state before sending effects. [Binding](../observed-integration/acceptance/host/live-resume-2026-10-11/root-binding.json).

Read the [resume checkpoint](../observed-integration/acceptance/host/live-resume-2026-10-11/resume-checkpoint.json), [operational audit](../observed-integration/acceptance/host/live-resume-2026-10-11/root-operational-entry-audit.json) and [ticket 11](issues/11-live-acceptance.md) before dispatch. These establish completed compatibility, configuration, migration and capacity. **Do not rerun migration.** Preserve installation `d411f7ce-9db6-4aa7-9c86-f337e739020a`, all historical sources, protected identities and guards. Effective default configuration digest is `0ef4ca5a076024284eef7594e40dc638ee7be61dcc69b99fca1aff3249ded77d`; the [digest correction](../observed-integration/acceptance/host/live-resume-2026-10-11/root-config-digest-correction.json) explains the earlier handoff error.

This runbook overrides the stale operator, entry-directory, “not dispatched” status and initial migration sequence in the historical operational handoffs. Their remaining build requirements still apply. The canonical `acceptance/live/report.md` and `versions.json` currently describe an older runtime refusal; use the current checkpoint until the operator publishes the accepted live report, preserving the older receipts. This resume grants no cleanup, budget changes, runtime fallback, merge, push or publication.

## 1. Obtain fresh storage acceptance

The saved [storage result](../observed-integration/acceptance/live/entry-2026-10-11-v2/04-storage-result.json) records 17,591,939,072 bytes free on both relevant paths. With zero existing reservations, the five-case entry plan requires:

| Path | Required bytes | Calculation |
| --- | ---: | --- |
| Simulator storage | 64,424,509,440 | Five 8 GiB reservations + 20 GiB floor |
| Staging storage | 75,161,927,680 | Simulator requirement + five 2 GiB artifact allowances |

The saved staging shortfall is 57,569,988,608 bytes (53.62 GiB), before build headroom. This is a conservative whole-plan entry requirement; production additionally checks each preparation. [Workspace attribution](../observed-integration/acceptance/host/live-resume-2026-10-11/root-disk-attribution-audit.json) contains overlapping totals, not reclaimable-space estimates or cleanup permission.

Root dispatches a bounded read-only recheck through the existing production storage helper to the sole operator, with a fresh private evidence directory and pinned source. If account capacity may have changed, inspect current capacity through existing read methods and include its reservations in the calculation. Retain commands, output, actual closes, helper inputs, observed free bytes and arithmetic. Keep per-preparation checks enabled. Complete this gate only when both requirements pass; otherwise preserve the new refusal and report the measured blocker. No app build or allocation follows a refusal. Storage recovery must preserve evidence, stores, protected devices and claims; cleanup needs an explicitly scoped decision.

## 2. Build and accept the unchanged apps

After storage passes, the sole operator builds the fixture and Weather in separate fresh isolated DerivedData directories, using fixed Xcode and a generic iOS Simulator destination. Use the exact projects, schemes and bundle IDs in the [operational build instructions](operational-entry-after-legacy-compatibility.md). Preserve source/project hashes before and after, exact commands and raw outputs, explicit resulting `.app` paths, complete app-content hashes, platform, architecture and minimum OS. Inspect compatibility with the accepted iPhone17/iOS27.0 metadata. No recursive output search or project/source modification.

Return the manifests to Root. Completion requires Root's accepted build/entry audit; refreshed storage must still support the plan after build consumption. Retain finite Node/vendor version metadata without loading `.env` or starting SDK/network judgments.

## 3. Dispatch and audit L01–L05 serially

Root supplies a pinned ticket 11 dispatch only after accepted storage/build evidence. The [validation matrix](../observed-integration/evidence/validation-matrix.md) is authoritative for public requests, selectors, adapter combinations, per-row outcomes and exact command counts. Prepare five unique declared action identities and fresh create-source allocations; retain all five. Run L01 through L05 serially, stopping at the first failure or uncertainty. Never replay with a replacement identity.

The operator writes `acceptance/live/{report.md,builds.json,allocations.json,versions.json}` and each `L01`–`L05` directory as required by the matrix. Each row needs public requests/responses, actual backend command receipts, readiness and action snapshots/JPEGs, authoritative cross-process retrieval, terminal export and observed V/R/N totals. L04 must preserve successful real-touch bytes before the harness withholds its reply; describe this as synthetic reply loss. Future postconditions and L03's absent precondition are not readiness prerequisites. Preserve the four protected UUIDs and all claims; no device shutdown/reset/erase/delete.

Complete this stage only when Root audits all five row oracles and effect counts as PASS. Missing proof remains UNVERIFIED; confirmed defects or environmental refusals remain BLOCKED with their raw evidence.

## 4. Independent final review

After ticket 11 passes, dispatch [ticket 12](issues/12-independent-review.md) to the nonauthor GPT-6-Astra high reviewer. Supply planning base `b8c4a50942551bdf95d00036a6d2f7bb6142ff43`, the full final integrated/evidence SHAs, existing code/package review and all H01–H09/L01–L05 evidence. The reviewer records findings, gate verdicts, limitations and a merge-ready recommendation in the owned safety report. Root resolves confirmed findings and obtains bounded re-review before declaring readiness. PASS does not authorize merge, version bump or publication.

## Preparation while storage remains blocked

Read-only agents can inspect the fixture/Weather source and project settings, draft finite build invocations and app-manifest fields, map each live request to its matrix oracle, and review the proposed L04 recording boundary. Root may grant isolated documentation/harness-draft paths for those preparations. Drafts remain unexecuted and confer no acceptance. Host/account/device operations stay with the sole operator; product and target-app sources stay frozen. Prepare the final reviewer brief now, but dispatch acceptance review only after its dependencies pass.
