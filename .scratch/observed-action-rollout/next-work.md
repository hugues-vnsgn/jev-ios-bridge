# Remaining observed workflow execution

Current milestone: tickets 01–08 and their bounded repairs are accepted. Public adapters are integrated at `538e5770d1a02b7ef92d2dd69cd3a8a9d692ec4a`; both independent review axes pass on the exact candidate. Root's combined checks pass 725/725 on Node 26.8.1 and exact 24.0.0; full checks pass 1470/1470 plus typecheck/build, zero skips. All 34 audited runtime, allocator and adapter files match their accepted hashes. [Public adapter review](../observed-integration/acceptance/host/public-adapters-review.md).

The composed public tests exposed an evidence-directory overlap between allocator and action runtime. Root's two-file repair is accepted at `d0a6d7efef9fc0d55324e3803207fb2dffdfaf18`: both independent reviews PASS, focused 225/225 on both runtimes, complete 1428/1428 plus typecheck/build, zero skips. The first full-run timing assertion failure and later unchanged passes remain separate. [Repair review and provenance](../observed-integration/acceptance/host/evidence-overlap-review.md). Root advanced the paused adapter worktree to `1275f93c616c90aba63e92468679cf39f13157b5`, preserving all 13 owned files and the original reproduction byte for byte. The worker has resumed with the serialized heavy-check window and must rerun those original public cases unchanged.

Those original cases now pass unchanged. The first adapter round remains preserved as **BLOCKED** by two independent P2 findings despite its passing Node26/full checks. Round2 closes both findings, passes the exact24 fixture boundary and has both independent review axes associated with candidate `a38e7a039c680fce5acb4181e763613958feb742`. [Original reports and narrow repair scope](../observed-integration/acceptance/host/public-adapters-repair-scope.md).

## Next host work

1. Ticket09 builds independent public-process fault proofs for identities, cancellation, crash milestones, storage, migration and successor exclusion. Both CLI and MCP must have assertions where applicable, exact backend counts and truthful null crash flags. Confirmed source defects return to Root for bounded repairs.
2. Ticket10 writes the installed guide and agent skill, pins exact Node24.0.0 CI, and proves a clean packed installation, installed CLI/MCP/maintenance startup and plugin build. The existing tarball/local-dependency proof remains partial.
3. The two workers have disjoint files. Root serializes full tests, coverage, build and packaging runs, preserves failures, obtains independent reviews and integrates each candidate.
4. Root fills every H01–H09 subcase with row-level assertions and raw evidence. Ticket checks alone do not establish the full host matrix.

## Execution order

| Order | Work | Owner / prerequisite | Required result |
| --- | --- | --- | --- |
| Complete | [08 CLI/MCP adapters](issues/08-public-adapters.md) | observed_runtime, gpt-6.1-sol high; integrated `538e577` | Both P2 findings closed; both review axes and Root integration PASS. Seven commands and seven tools share authority. |
| Active 2a | [09 host faults](issues/09-host-fault-suite.md) | observed_host_faults, gpt-6.1-sol medium; base `d0f49f6` | Public child-process/stdio proofs cover duplicates, aliases, parked transfer, cancellation barriers, real fake-owner kills, crash flags, COMMIT/export/storage faults and read invariance. Map assertions to H01–H08; return minimal reproductions for Root repairs. [Explicit brief](dispatch/09.md). |
| Active 2b | [10 docs/packaging](issues/10-docs-packaging.md), parallel with 09 | observed_installed_workflow, gpt-6.1-sol medium; same base | Installed guide and agent skill cover migration, identities, lost replies, retention and limits. Exact Node 24.0.0 CI, clean npm packed installation, installed CLI/MCP and plugin build pass with unchanged legacy goldens. [Explicit brief](dispatch/10.md). |
| 3 | [H01–H09 host acceptance](../observed-integration/evidence/validation-matrix.md) | Root; integrated 09/10 | Publish row-level evidence, raw commands/counts/skips and source hashes. Both transports are asserted where applicable. Missing coverage remains UNVERIFIED and is completed before live entry. |
| 4 | [11 serial live acceptance](issues/11-live-acceptance.md) | Approved sibling pane, gpt-6-luna high; host gates and live prerequisites pass | Five fresh retained allocations on explicit iPhone 17/iOS 27.0. Build unchanged apps, run L01–L05 serially, preserve raw commands, snapshots/JPEGs, authoritative reads and exact counts. |
| 5 | [12 independent safety review](issues/12-independent-review.md) | capacity_spec_review, gpt-6-astra high; complete 11 evidence | Reviewer authored no implementation. Audit the integrated diff and all H/L evidence, record findings, recheck Root fixes, then Root returns the final merge-ready verdict. |

## Adapter details

CLI: `observed-allocate`, `observed-allocation`, `observed-allocation-cancel`, `observed-retire`, `observed-action`, `observed-report`, `observed-cancel`. MCP: prepare/get/cancel/retire allocation and start/get/cancel action. Exact names/schemas/envelopes are in the [public contract](../observed-integration/evidence/public-contract.md).

`JEV_EXPERIMENTAL_OBSERVED=1` enables preparation/start. Disabled mode retains five MCP read/cancel/retire tools and the corresponding CLI operations. Startup opens no store or device and constructs no Jev judge. Existing identities retrieve through shared authority; new action binding validates current private config. New observed golden fixtures cover additive historical fields and truthful preparing/executing busy context. Two actual-CLI legacy startup-list assertions receive the accepted additive names; existing legacy schemas/replies/goldens retain their meaning.

## Live prerequisite and cases

The owner chose to keep iOS 27.0 and wait for installation. It was absent from the last read-only installed metadata. Reverify the explicit runtime before entry; no fallback or runtime installation has been dispatched. The sole approved live pane is `b0e5a4b6-106b-4dab-a49a-b3933445d4ef:f8633393-2114-4b9e-a4d7-6a85e0f16db3`; configure its approved model only after host gates. Root remains coordinator.

L01 navigates fixture Home→Details; L02 proves already-satisfied with zero input; L03 proves false precondition with zero input; L04 withholds a successful real touch reply at the recording harness and proves inconclusive/quarantine with zero replay; L05 opens the unchanged Weather Settings sheet. Each preparation creates, boots, installs and launches once. Retain all five allocations. L04 is synthetic reply loss, not real transport or native release proof. Exact selectors, captures and counts remain those of the validation matrix.

Actual migration activation requires quiescent old writers and declared/excluded historical roots. Isolated host migration proofs do not establish that operational declaration. Supply the verified operational handoff before any production activation. Current implementation/review work remains key-free; protected claims and uncertain devices are retained.
