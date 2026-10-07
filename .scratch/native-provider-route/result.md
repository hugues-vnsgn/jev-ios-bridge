# Provider extension feasibility result

Status: blocked on a supported native-owner interface or deployable owner source.

The parallel investigation reached the actual owner boundaries. No implementable
extension meeting the existing arbitrary, non-instrumented-app contract was
established. Binaries were accessible and inspected; this is not a missing-file
claim or a claim of universal impossibility.

| Required fact | New concrete finding | Consequence |
| --- | --- | --- |
| Original ownership and reference scope | App-local UIAccessibility callbacks resolve original objects through AXRuntime's cache | An external IDB wrapper cannot add the missing target-owner semantics |
| Operation settlement | Client timed receive can expire while the server's main-thread callback remains queued/running | Client timeout, connection invalidation and reply-port disposal cannot implement a stop acknowledgement |
| Contact receipt/release | BackBoard observer has a real entitlement gate and requires an existing touch identifier | Access and event/contact correlation still need supported owner contracts; observer callbacks alone are insufficient |

[Ownership](ownership.md), [settlement](settlement.md) and [contact](contact.md)
contain exact pinned native traces and primary documentation. The [provider
request](provider-request.md) states the interface and acceptance experiment
needed to proceed; it is prepared locally and unsent.

## Work completed

Two delegated agents investigated ownership and settlement while the supervisor
traced the contact service. The existing iOS image was mounted read-only outside
CoreSimulator locations, inspected statically, then the owned disk7 attachment
was detached and its empty mountpoint removed. Attach/detach receipts are in
this directory. No simulator, installed-app, entitlement or retained-study
state was changed. No private executable was loaded. No production code or
acceptance status changed, and no additional policy-only wrapper was added.

## Implementation gate

Keep all 23 production tickets open. To preserve the current requirements,
implementation needs the supported interface/provisioning path named in the
request. Instrumenting a fixture can add independent recipient observations;
it does not alone supply arbitrary-app ownership or system contact settlement.
Changing to app instrumentation or a weaker tap guarantee is a product-scope
change and has not been authorized. Further static mapping may narrow specific
unknowns but does not itself grant a supported target-owner extension.
