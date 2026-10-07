# Draft request: supported checked iOS automation owner interface

Status: prepared locally; not submitted or sent.

We are building checked iOS simulator automation for arbitrary apps without
requiring changes to each app. Our local baseline is iOS 26.4 build 23E254a
with Xcode 27. We need a supported native interface or supported extension point
for the following operations. Names below describe requirements, not existing
Apple API names.

1. **Acquire original ownership.** Return the actual recipient at a qualified
   display point, complete original container edges through a corroborated app
   root, and owner-issued reference scope covering boot, app incarnation and
   association. Define replacement, deletion, reset and independent-client
   comparison behavior, including identifier reuse. Return explicit unknown
   when containers are omitted or a bound prevents complete evidence.
2. **Settle one operation.** Expose an operation identity for queued/running
   requests and their owned descendants. Completion or cancellation must
   acknowledge when that work can no longer act. Define timeout, lost reply,
   remote forwarding and frontend-loss behavior; keep pending state queryable
   without retrying the operation. No shared-service termination is acceptable.
3. **Correlate one prepared tap.** Bind the immutable prepared down/up event
   to native contact identifiers before possible issuance. Report consumer-side
   receipts for the same contact/event and preserve ambiguous submission.
4. **Release that contact.** Provide a contact-specific release acknowledgement
   or supported fence after up/cancellation. It must account for cancellation
   after possible down, remain available after admission expiry, and distinguish
   lost acknowledgement from proven absence. It must not replay a down event.

Please identify supported API names, required entitlements and the supported
provisioning path, runtime availability, complete semantics, and a reproducible
ordinary positive example. Rebuildable owner source is an alternative only if
it can actually be deployed through a supported operating model.

## Why the existing inspected paths are insufficient

- Target UIAccessibility attribute callbacks resolve original objects through
  the app-local AXRuntime cache. External local-server registration does not
  augment arbitrary target apps. See [ownership trace](ownership.md).
- The AX point MIG caller has a timed receive; server work may already be
  queued on its main thread and wait indefinitely. Destroying the reply port
  is not a stop acknowledgement. See [settlement trace](settlement.md).
- BackBoard touch-delivery observation has an explicit
  `com.apple.backboardd.touchDeliveryObservation` entitlement check and consumes
  an already known touch identifier. The inspected observer does not expose the
  required complete event/contact receipt and release contract. See [contact
  trace](contact.md).

We have not attempted to bypass authorization, modify system services, change
app instrumentation requirements, or treat private ABI discovery as a supported
API. We can provide the pinned bounded traces and our owned fixture test plan
for provider review.

## Acceptance experiment once access exists

Use one dedicated fixture and simulator. Establish complete ownership for an
ordinary nested button, preserve the exact prepared event, submit once, observe
its correlated down/up recipient receipts and positive release, then settle all
owned work. Repeat with omitted container, replacement, reset, delayed callback,
cancel-before-down, cancel-after-down and lost reply. Pin source/runtime hashes,
raw native receipts and independent fixture observations. Client mocks alone do
not satisfy any native positive.
