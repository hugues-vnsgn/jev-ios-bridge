# A no-input callback implementation can proceed

**Implement the diagnostic callback path now. Keep production ownership and settlement acceptance separate.** The installed wrapper and pinned WDA caller provide enough evidence to write an adapter and test its local ownership rules. The lack of a complete native lifetime contract does not make that diagnostic unimplementable.

## Scope of the settlement requirement

The [IDB specification](/Users/hugues_mini/orca/workspaces/jev-ios-bridge/research-native-callback-contract/.scratch/idb-checked-capability/spec.md), decisions 15–18, concerns operation-owned handles, callbacks, tasks and children that can still perform work. It does not require proving that every accessibility service on the system is globally idle. A terminal contract for one query, covering only work causally started by that query, could satisfy the relevant part. No specification change is needed to use that narrower scope.

A successful query result and the end of all query-owned work are different facts. The [callback investigation](/Users/hugues_mini/orca/workspaces/jev-ios-bridge/research-native-callback-contract/.scratch/checked-ui-wayfinding/research/native-callback-contract/report.md) proves forwarding through the runner's remote proxy; it does not prove that this handler leaves work running after success. Conversely, it does not establish a terminal guarantee. Both directions remain unknown. Apple's [connection invalidation contract](https://developer.apple.com/documentation/foundation/nsxpcconnection/invalidate()) does not establish remote handler termination. Retaining an unknown state is appropriate; saying that a callback can never be terminal would exceed the evidence.

The consolidation's "What must change before implementation" heading is too broad if read to prohibit diagnostic implementation. Read it as prerequisites for the production claims. The existing [ObservationStudy](../../../spikes/native-owner/native/ObservationStudy.m) already reports `nativeSettlement: unconfirmed`, separates local method returns from settlement and keeps reference lifetime unestablished. The callback change fits that research contract.

## Implementable path

Use the existing runner session's `requestElementAtPoint:reply:` wrapper, reached through the same established session interface as the pinned WDA path. Verify selector signature and loaded-image provenance before sending. The wrapper has an arm64 CGPoint-plus-block signature; WDA supplies the block's element/error argument evidence. Unsupported shape must refuse before dispatch. Do not retry the direct iOS assertion stub.

Introduce a small request owner, registered before invocation. It owns the copied callback, the retained returned element and a synchronized state record. Track send admission, send return or exception, reply arrival, result usability, deadline/cancellation, duplicate replies and native settlement independently. A callback may arrive synchronously before dispatch returns. "Dispatch returned" must not overwrite a reply, and an exception after a callback must not erase the result or create a second send.

Use the original study allowance. Timeout or cancellation stops new point/snapshot/validity work and closes result admission; it does not detach the reply owner or start another point request. Late callbacks may update accounting but cannot restart study work. Emit callbacks through one serialized state/record owner; never let an arbitrary native callback thread race the study's sequence, byte budget or `finished` record.

The existing synchronous point function can be replaced by an adapter that waits through an injected pump/wait operation while the request owner remains retained. Do not hold the state lock across native invocation, record emission or waiting. Do not block the queue needed to deliver the callback. Tests should use a deterministic scheduler; a future admitted runtime study must establish actual callback-queue behavior rather than infer it from the fake.

After an on-time result, retain the actual element for the existing observation path. Its local label is only correlation. Do not reinterpret `isValidElement` as an owner-lifetime certificate: the [installed validity implementation](/Users/hugues_mini/orca/workspaces/jev-ios-bridge/research-native-callback-contract/.scratch/checked-ui-wayfinding/research/native-reference-contract/report.md) tests response-object presence. A diagnostic can still report the Boolean, provided its current `lifetimeScope: unestablished` remains explicit. Detailed attribute replies can be a later bounded slice; they need not delay fixing the point acquisition route.

## Tests that establish the implementation's claims

- A valid ordinary reply admits the existing diagnostic reads exactly once using the identical returned object; both the synchronous direct point selector and any input transport remain unused.
- Wrong or absent ABI refuses without a send; metadata preparation that exhausts the allowance also sends nothing.
- A synchronous callback before send return, asynchronous callback, nil/error reply and element-plus-error reply preserve distinct outcomes.
- Cancellation before admission sends nothing. Cancellation/deadline after admission preserves pending ownership; a late reply starts no new work. A never-replying fake leaves native settlement unconfirmed.
- Duplicate and concurrent callbacks cannot replace the first accepted element, duplicate downstream reads, race record sequences or bypass byte limits. Bound duplicate accounting rather than retaining arbitrary replies.
- An invocation exception before or after callback admission cannot grant a resend or erase possible outstanding work.
- Final records and host parsing distinguish returned local methods, received replies and native settlement. No record appears after `finished`; callbacks still outstanding must remain represented by retained state outside the useful-result stream.

These tests prove local state handling, not native termination. Existing host ownership/cleanup tests must continue to pass. No live execution is required to implement and test this adapter.

## What stronger owner evidence must establish

A concrete terminal route would identify the point handler's actual AX request, show that success/error reply occurs after its request-owned children are complete, and show how interruption or cancellation acknowledges that same scope. A synchronous native lookup with no escaped task can have such a contract; an asynchronous lookup can join its owned tasks before replying. This is a design criterion, not a finding about Apple's handler. A dedicated rebuildable owner could expose an operation token and terminal acknowledgement if it controls the real downstream boundary. A new wrapper around the same undocumented asynchronous dependency would not create that fact.

Reference acceptance separately needs allocator-backed original-item identity, replacement/non-reuse behavior, a corroborated app root, complete parent semantics and association invalidation. None follows from observing a terminal callback. A finite owned-fixture observation remains useful evidence even while these general rules are unknown. Do not expand this no-input slice into input receipts or silently relax production criteria.

The next source investigation should follow the concrete daemon selector already identified, not demand arbitrary global quiescence. In parallel, the diagnostic adapter above is ready to implement. This review made no device calls, changes to packages or production code, external messages, or commits.
