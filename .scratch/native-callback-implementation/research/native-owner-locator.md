# Actual native input handlers obtained from the offline runtime

2026-10-07. **The owner implementation is locally obtainable as installed binaries.** A read-only mount of the existing iOS 26.4 image exposed `testmanagerd`, Recap, HID, IOKit, BackBoardServices and `backboardd`. Static inspection crossed the previously missing daemon boundary. No simulator was booted or called; no target executable was loaded. The research-owned attachment was detached successfully.

**XCTest input success cannot certify consumption on this runtime:** the actual touch handler treats an expired confirmation wait as success. The downstream BackBoard touch observer is a useful extension candidate, but its inspected API does not establish cancellation release or correlate the full prepared tap with native contacts. These findings preserve the checked-input gate while replacing the earlier broad source-access blocker with specific implementation boundaries.

## Image and cleanup provenance

`/Library/Developer/CoreSimulator/Images/images.plist` identifies the existing iOS 26.4 build `23E254a` image:

```text
/System/Library/AssetsV2/com_apple_MobileAsset_iOSSimulatorRuntime/c060853b459625d7878fd533de79c966fb98d31b.asset/AssetData/Restore/094-99015-001.dmg
```

`hdiutil imageinfo` reports unencrypted, read-only ULFO/LZFSE storage containing Apple_APFS, with 8,484,038,660 compressed bytes and 18,058,610,176 logical bytes. Empty CoreSimulator mount directories did not mean the runtime was absent. The inventory also locates an existing iOS 27 image, which this pass did not mount. [Inventory](native-owner-locator-evidence/runtime-inventory.json), [image metadata](native-owner-locator-evidence/ios-26.4-imageinfo.txt).

Before mounting, `hdiutil info -plist` listed no attachments. With supervisor authorization, `hdiutil attach -readonly -nobrowse -noautoopen` mounted the image at a unique temporary directory outside CoreSimulator locations. Its receipt identified `/dev/disk7` as backing device and `/dev/disk8s1` as the mounted volume. After the supervisor finished parallel point-query inspection, `hdiutil detach /dev/disk7` succeeded; the final attachment inventory was empty and the empty temporary mountpoint was removed. No existing attachment was touched. [Command](native-owner-locator-evidence/attach-command.json), [before](native-owner-locator-evidence/attachments-before.plist), [attachment receipt](native-owner-locator-evidence/attach-receipt.plist), [detach receipt](native-owner-locator-evidence/detach-receipt.txt), [after](native-owner-locator-evidence/attachments-after.plist), [cleanup](native-owner-locator-evidence/cleanup.json).

All paths below are relative to the image's `Library/Developer/CoreSimulator/Profiles/Runtimes/iOS 26.4.simruntime/Contents/Resources/RuntimeRoot`. [Binary hashes, UUIDs and tools](native-owner-locator-evidence/binary-provenance.json) pin each inspected implementation; [artifact hashes](native-owner-locator-evidence/artifact-hashes.json) pin the bounded extracts. No binaries or full image dumps are retained.

## Actual completion path

The arm64 `usr/libexec/testmanagerd` SHA-256 is `b3ce1abf3f887333435b7024b29c440ab247057228b55c95d953afcec494da44`.

1. `XCTestSession._XCT_synthesizeEvent:implicitConfirmationInterval:completion:` at `0x100030d50` checks UI-testing readiness, then forwards to `XCTouchGesturePerformer`. Its legacy sibling at `0x100030c28` also forwards to that performer.
2. `_synthesizeTouchEvent:implicitConfirmationInterval:completion:` at `0x100010d58` validates the event, queues work and uses `_executeEventWithDescription:implicitConfirmationInterval:confirmationNotification:block:`. This method registers the next user-testing notification and gives playback a block that waits on its semaphore.
3. The wait block at `0x100013584` returns normally when the semaphore deadline expires. The corresponding cold path at `0x100015118` contains the diagnostic text: "event will be implicitly confirmed with no error other than this log message." This is an explicit implementation of success without notification, not a conjecture based on a selector name.
4. The playback-completion continuation at `0x100011aa0` runs that wait block, clears the performer's busy flag, and invokes the captured completion. The success-path error capture was initialized to nil at `0x100011924`. No per-down/up receipt is added here.

[Daemon input disassembly](native-owner-locator-evidence/testmanagerd-input-disassembly.txt), [selected symbols](native-owner-locator-evidence/testmanagerd-input-symbols.txt).

The next-notification mechanism itself is also weaker than operation correlation: `XCAXManager_iOS` stores handlers under a user-testing event key; notification handling copies the handlers for that key, removes the key and dispatches callbacks. The inspected path does not match an immutable tap/contact identity. [Daemon notification and playback methods](native-owner-locator-evidence/testmanagerd-playback-disassembly.txt).

## Injection crosses into HID; playback completion is not a receiver certificate

The actual path is:

```text
testmanagerd XCTouchGesturePerformer._performEventActions
  -> Recap RCPInlinePlayer.playEventActions
  -> RCPPlayer.playEventStream
  -> RCPVirtualHIDService.postHIDEvent
  -> HIDVirtualEventService.dispatchEvent
  -> IOKit IOHIDVirtualServiceClientDispatchEvent
  -> io_hideventsystem_dispatch_event_for_virtual_service
```

Recap's `RCPInlinePlayer` completion follows playback and either queues completion directly or uses `dispatch_after`, depending on `ignoresCompletionDelay`. `RCPPlayer` sends events through a delivery service. `RCPVirtualHIDService.postHIDEvent:` calls `HIDVirtualEventService.dispatchEvent:` and does not turn its Boolean into an operation error. HID's Boolean reflects `IOHIDVirtualServiceClientDispatchEvent`; IOKit serializes the event, assigns its sender ID and calls `io_hideventsystem_dispatch_event_for_virtual_service`. None of these inspected return paths supplies an app-consumption/contact-release record. [Recap playback](native-owner-locator-evidence/recap-playback-disassembly.txt), [delivery](native-owner-locator-evidence/recap-delivery-disassembly.txt), [HID](native-owner-locator-evidence/hid-virtual-disassembly.txt), [IOKit dispatch](native-owner-locator-evidence/iokit-dispatch-disassembly.txt).

Recap has digitizer contact-count fields, but their presence does not prove receiver-owned contact state. No claim of authoritative release is made from generator bookkeeping, HID cancellation or playback teardown.

## A concrete BackBoard extension candidate, with known limits

`usr/libexec/backboardd` SHA-256 is `f0dd6f1ce66dfe101da11e999fb528a1dd971043eec50216ba35f74eed579aed`. Its stripped Objective-C method addresses can be recovered by the shipped `dyld_info -objc` and `-disassemble` tools; no shared-cache extractor was needed.

`BKTouchDeliveryObservationManager` accepts per-touch observations and receives native lifecycle callbacks. Its client, `BKSTouchDeliveryObservationService` in BackBoardServices, offers `addObserver:forTouchIdentifier:`. It delivers `touchUpOccuredForIdentifier:detached:context:pid:` and `touchDetachedForIdentifier:context:pid:`. This is a real downstream observation route worth examining for a provider extension. [BackBoard methods](native-owner-locator-evidence/backboard-contact-objc.txt), [client methods](native-owner-locator-evidence/backboardservices-touch-objc.txt).

The implementation also establishes limits:

- `BKTouchDeliveryObservationManager.touchDidHIDCancel:` at `0x10001c4d0` is a single return instruction. The inspected observation manager does not publish a cancellation certificate through that callback.
- `observeTouchEventDeliveryDidOccur:response:` acknowledges processing of observer updates. The client queues observer callbacks asynchronously; the server response clears its pending-notification flag and sends queued updates. It is not an acknowledgement from the tapped app.
- `BKHIDDirectTouchEventProcessor.cancelTouchesWithIdentifiers:` at `0x10003c4e8` queues asynchronous work and exposes no completion argument. Its method return does not certify release.
- Global-observer handling can replace the touch identifier with zero. A global observation alone cannot bind a saved tap to the exact contact.

[BackBoard implementation](native-owner-locator-evidence/backboard-contact-disassembly.txt), [bounded helper blocks](native-owner-locator-evidence/backboard-contact-helper-disassembly.txt), [BackBoardServices implementation](native-owner-locator-evidence/backboardservices-touch-disassembly.txt).

## Next implementation boundary

Do not build a checked-input adapter around XCTest's synthesis success. First establish how a prepared sender/path maps to BackBoard's touch identifier, whether the per-touch observer has sufficient supported access, and which native state transition proves absence of that contact after up or cancellation. The exact candidate is the BackBoard observer/direct-touch processor boundary identified above. It needs a release/fence contract and independent fixture evidence, not another transport wrapper.

The supervisor used the same offline image to trace the point-query callback through `XCTestSession`, `XCAXManager_iOS` and AXRuntime. That separate report owns read-only acquisition claims. This report establishes the input timeout behavior and locates the downstream candidate; it accepts no production ticket and proves no arbitrary-app contact-release capability.
