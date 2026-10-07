# Contact evidence: actual observer access boundary

Status: inspected candidate insufficient for the existing production contract.

The pinned iOS 26.4 BackBoard observer requires a concrete service entitlement.
`BKTouchDeliveryObservationManager.init` loads
`BKObserveTouchDeliveryObservingEntitlement` and passes it to
`BKHIDDomainServiceServer` at 0x10001BDDC. The exported constant at 0x40CD8
resolves through CFString 0x42588 to the bytes at 0x2E8B3:
`com.apple.backboardd.touchDeliveryObservation`. The adjacent cancel entitlement
is `com.apple.backboardd.cancelTouches`.

The domain server's connection handler calls the remote process's
`hasEntitlement:` at 0x646C and branches to rejection on false at 0x6470.
This establishes an actual authorization check, not just a promising class name.
It does not establish whether a particular simulator client is authorized, and
no connection or entitlement modification was attempted. A supported grant and
interface contract have not been supplied.

After admission, `setObservesTouch:withIdentifier:` reads the caller PID and
supplied unsigned touch identifier, then records that pair at 0x10001C2B0.
That interface consumes an existing identifier; it does not return the mapping
from a prepared injected event to its native contact. No such mapping has been
established in this investigation.

The previously pinned implementation also has immediate-return down, HID-cancel
and soft-cancel observer callbacks. Up/detach observations and observer-response
acknowledgements therefore do not by themselves provide the required paired
down/up-consumption and contact-release contract. This is a finding about this
observer, not proof that every private system route is incapable.

## Evidence

- [Observer service construction and per-contact subscription](contact-service.txt).
- [Domain service construction](contact-domain-service.txt) and [authorization handler](contact-entitlement-check.txt).
- [Resolved entitlement strings](contact-entitlements.json) and [binary hashes/UUIDs](contact-binary-provenance.json).
- [Earlier downstream delivery analysis](../native-callback-implementation/research/native-owner-locator.md) owns the no-op callback and timeout-success evidence.

Static inspection only: existing image mounted read-only, no simulator command,
private binary loading, service connection, entitlement modification or input.

## Public fixture evidence and its limit

Apple documents that UIKit delivers touch phases to a view's touch handlers.
A dedicated fixture can independently log recipient and began/ended/cancelled
phases through that supported app interface. [Handling touches in your view](https://developer.apple.com/documentation/uikit/handling-touches-in-your-view).

That app-local observation cannot establish arbitrary-app native association,
remote accessibility work settlement, or system-wide contact absence. Apple's
HID event-service documentation describes dispatch to the operating system,
not an app-consumption acknowledgement. [IOHIDEventService](https://developer.apple.com/documentation/hiddriverkit/iohideventservice).

## Required extension

A qualifying provider must bind its prepared event identity to the actual native
contact, expose ordered down/up consumer receipts, and expose contact-specific
release or a supported stopping acknowledgement. It must define authorization,
boot/app/association scope, lost-reply behavior and whether cancellation can
leave downstream work active. An observer wrapper without those facts cannot
close IDB 07.
