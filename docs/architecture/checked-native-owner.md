# Checked iOS actions need native owner evidence

Decision date: 2026-10-07. The owner selected a native-provider extension. This
record defines the implementation route; it does not accept a native capability.

## Modules and their Interfaces

```text
Bridge Device driver                     Run and Device lease
  supported MobileBuildMCP Interface     protected plan and one-use dispatch
    supported AXe Interface              intended target and activation path
      supported IDB Interface            native facts and owned native work
        native accessibility/input owner reference lifetime and contact evidence
```

IDB must obtain the actual point recipient and complete original parents, bind
references to an established validity scope, account for bounded/cancelled work,
and submit the same prepared event with applicable consumption and release
evidence. AXe compares these facts with the intended target. MobileBuildMCP keeps
the plan and consumes dispatch permission once. The Bridge retains its Device
lease until old work cannot act.

A capture row is an Element reference, not native identity. Stopping admission
does not settle started work. Submission does not prove consumption. Sending an
up event does not prove contact release. Each Interface carries these distinctions
in its results, ordering rules and failure modes.

The existing Device driver, DeviceLease and assessment Implementation already
concentrate local policy. Experimental XCTest calls belong in a separate Module,
outside `src/`; they do not enter the production Device driver. This preserves
ADR-0002 and ADR-0007. The latter's manual point-tap exception supplies no new
automatic checked-action capability.

## What the research establishes

The owned iOS 26.4/Xcode 27 experiment returned an actual `XCAXClient_iOS` from
`XCUIDevice.accessibilityInterface`. It measured the Objective-C signatures of
point acquisition, `isValidElement:`, snapshot requests and attribute requests.
It invoked none of those app-element queries.

The source investigation found no obtainable implementation or supported owner
contract for reference reset/reuse, complete unfiltered ancestry, or consumed
down/up and released contact. WDA's UID equality and cache re-query do not supply
those guarantees. Its synthesis completion does not certify contact release.

These conclusions come from local pinned reports at planning commit `f6fe2ab`:
`research/provider-extension/report.md`, `research/provider-access-search/report.md`
and `evidence/xctest-native-availability-2026-10-07/report.md` under
`.scratch/checked-ui-wayfinding/`. The complete archive stays on that planning
branch; it is not required to build the standalone study. WDA source was pinned
at `277112a4f9bd0088ea9377ef4b88b750231c1f4a`; the standalone metadata target at
`f5f57047314a8b202248a9deb139605dc8d18330`.

## Chosen research Interface

```python
run_study(plan, configuration, dependencies) -> StudyResult
```

`plan` is `metadata` or `reference-study`. Configuration binds the exact owned
device, fixture/runner build, fresh evidence directory and one admission
allowance. Dependencies supply the tool/process Adapter and monotonic clock.
`StudyResult` reports observations, local completion and retained resources.
It never reports a qualifying production capability.

The Implementation hides build hashing, inventory guards, positive app absence,
installation provenance, ABI validation, exact retained objects, bounded parent
reads, fixture replacement coordination, output validation and retention. The
Module earns Depth: deleting it would distribute this work across every study
and caller. Tests and the CLI cross this same Seam.

The native Implementation retains the original point object and calls
`isValidElement:` on that object before and after programmatic same-looking
replacement. Fresh acquisition is separate. It observes available snapshot
parents directly, bounded to 32 edges, without rebuilding parents from a capture
or replacing old references through a UID query. Strings are bounded to 1,024
UTF-8 bytes and the record stream to 1 MiB; exceeded limits stay explicit.

Admission stops on expiry before another native read or fixture transition.
An already-started synchronous call may continue. No process is killed to turn
timeout into completion. Method return, local reference release, runner exit and
native work settlement are separate facts. Metadata-only work can remove its
new runner after normal completion and positive exit. An app-element study
retains its fixture and device when native settlement remains unconfirmed,
even after local calls returned. The receipt names retained resources.

Protocol acceptance and process accounting are independent facts. A stream
refusal stops admission immediately; observation of an already-owned child's
return code and process group continues within the original allowance. A later
exit receipt preserves the original refusal and supplies no native-work fence.

The host and reconciliation share a private device guard compatible with the
existing Bridge lease namespace. Its unknown-owner claim survives frontend
loss. Each caller holds it before tool work through restoration, checks its
provenance before mutation, and releases only its matching claim after that
caller's work is positively settled. Retained reference studies keep the guard.
This excludes cooperating consumers in the default namespace, with no claim
about external tools or custom lease roots.

The separate metadata-resource reconciliation Interface recognizes one pinned
historical encoding defect. Reviewed metadata source, immutable receipts, exact
installation provenance and fresh liveness checks govern this exception. A
one-use claim remains durable after any uncertain cleanup. This workflow can
dispose of that zero-app-query metadata setup while preserving its invalid
result and unknown historical exit code. It supplies no reference-study cleanup
or production owner capability. Its contract is
`.scratch/native-owner-recovery/spec.md`.

The shared protocol is `spikes/native-owner/protocol.schema.json`. A request ID
correlates records only. A local reference label names an object held by this
runner, never a backend-issued identity or validity scope. Fixture generation
confirms fixture recreation only. Two references from this client do not establish
independent associations. An observed snapshot parent does not establish complete
original containment. No input selector is admitted.

## Dependency and Seam placement

| Dependency | Category | Implementation and tests |
| --- | --- | --- |
| Admission and record validation | In-process | Direct Interface tests; no Adapter |
| Evidence files and fixture hook | Local-substitutable | Actual temporary directories and owned fixture protocol |
| Xcode/simulator/process tools | Local tool dependence | Real process Adapter and deterministic test Adapter behind the study Interface |
| XCTest accessibility/input owner | True external | ABI-checked native Implementation; doubles prove local policy only |
| Released MobileBuildMCP | True external | Existing Device driver and CliRunner Seam retained |

Two real Adapters justify the host tool Seam. No generic selector registry,
identity allocator, or contact-certificate plug-in is introduced. The two current
studies give Leverage while changes stay local to `spikes/native-owner/`.

## Alternatives considered

A four-method start/inspect/stop/finish Interface supports interactive inspection,
but introduces ordering and handle state without a current caller. A common
`tap(snapshot, reference)` Interface has excellent Leverage for production, but
cannot yet be backed by native guarantees. The single study entry point has the
best current Depth and Locality; its narrow plan set is deliberate.

The future production driver can expose that common tap call after IDB, AXe and
MobileBuildMCP deliver supported capabilities. Its Implementation must qualify
the immutable prepared event, submit once, reconcile its consumed down/up and
release, and preserve unconfirmed outcomes without replay. `close()` stops
admission and retains the Device lease until settlement or an applicable fence.
These are conditional Interface requirements, not implemented promises.

That future Interface also preserves the existing tickets' context and delivery
requirements. Native facts must corroborate the app root and carry compatible
capture references, device boot/runtime, association and app-instance validity.
Coordinates require authoritative display/orientation, viewport, units, scale
and translation, with acquisition interval and expiry. The study's fixed point
supplies none of that production authority.

Ownership, context, bounded acquisition and checked input are separately proven
facets. The production 0 to 10,000 ms remaining allowance and epoch deadline span
processes without renewal; encoding/readiness precede final qualification and
the identical event follows the final admission check. Retain callbacks,
references, descendants and coalesced ownership until applicable settlement.
MobileBuildMCP must preserve protected plans, atomic one-use consumption and
operation tombstones after frontend loss, including its specified capacity
limits and usable status/cancel operations at capacity.

Public-consumer compilation, redaction/legacy checks, independent physical
recipient/release evidence, supported releases and Bridge benchmark/contract
gates remain distinct. Plain-tap support does not imply safe type-focus or
automatic navigation. Each supported action facet needs its own proof.

## Parallel delivery and production gates

The native target/fixture and host runner can be implemented in separate
worktrees against the frozen protocol, then reviewed and landed separately. Live
execution serializes on the one owned simulator after both slices are integrated.

All 23 remaining production tickets retain their requirements: 10 IDB, 5 AXe,
5 MobileBuildMCP and 3 Bridge. This study does not accept IDB 01. Its ordinary
positive capability still needs applicable native ancestry, validity and owned
work evidence. Input requires its own native consumer/contact contracts. The
dependency graph and supported IDB/vendor release gates continue to apply.
