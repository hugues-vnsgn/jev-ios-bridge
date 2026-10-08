# Remaining observed workflow execution

Current milestone: tickets 01–07 and their bounded repairs are accepted. Runtime and allocator are integrated at `6d5536a551df853dd92fdf63253c1bacc244263f`; combined 657/657 tests pass on Node 26.8.1 and exact 24.0.0, full 1423/1423 plus typecheck/build pass, zero skips. [Runtime review](../observed-integration/acceptance/host/runtime-review.md); [allocator review](../observed-integration/acceptance/host/allocator-review.md).

## Execution order

| Order | Work | Owner / prerequisite | Required result |
| --- | --- | --- | --- |
| 1 | [08 CLI/MCP adapters](issues/08-public-adapters.md), active | observed_runtime, gpt-6.1-sol high; fresh worktree at `6ef2690` | Seven commands and seven tools use the shared service, with strict schemas, full JSON, exact exits/signals and lazy key-free startup. Both independent review axes and Root integration checks pass. |
| 2a | [09 host faults](issues/09-host-fault-suite.md) | gpt-6.1-sol medium; accepted 08 | Public child-process/stdio proofs cover duplicates, aliases, parked transfer, cancellation barriers, real fake-owner kills, crash flags, COMMIT/export/storage faults and read invariance. Map assertions to H01–H08; return minimal reproductions for Root repairs. |
| 2b | [10 docs/packaging](issues/10-docs-packaging.md), parallel with 09 | gpt-6.1-sol medium; accepted 08 | Installed guide and agent skill cover migration, identities, lost replies, retention and limits. Exact Node 24.0.0 CI, clean npm packed installation, installed CLI/MCP and plugin build pass with unchanged legacy goldens. |
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
