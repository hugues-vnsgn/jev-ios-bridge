# The direct point selector is an iOS assertion stub

The inspected simulator framework's `XCAXClient_iOS` implementation rejects
`accessibilityElementForElementAtPoint:error:` unconditionally. Its presence and
matching signature do not make it usable for this iOS study. The source-backed
iOS alternative is the test-runner callback interface used by WebDriverAgent.
Callback ownership and native settlement still require investigation; no
replacement implementation or further device execution occurred.

```text
current study → XCAXClient_iOS direct point method → macOS-only assertion
WDA iOS path → testRunnerProxy → _XCT_requestElementAtPoint:reply: → callback element
```

## Static finding and runtime limit

The arm64 method body at `0x77b0–0x7824` saves self/selector, obtains
`NSAssertionHandler.currentHandler`, and calls
`handleFailureInMethod:object:file:lineNumber:description:`. Its arguments name
`XCAXClient_iOS.m:1055` and the message “%s is only supported in the local macOS
AX interface”. If that handler returns, the method returns nil. It never reads
the point or error-pointer argument and has no accessibility-request dispatch.

The [bounded disassembly](point-method-disassembly.log.gz),
[decoded constant strings](point-method-strings.json) and
[fixups](framework-fixups.log.gz) preserve this finding. The fixup for class
reference `0x00102268` resolves to Foundation's `NSAssertionHandler`. The
supervisor independently decoded the arm64 Mach-O UUID and both constant strings
from the captured binary, then compared that binary with the installed file.
[Verification](independent-verification.json) records matching hashes.

| Provenance | Recorded value |
| --- | --- |
| Installed binary | `/Applications/Xcode.app/Contents/Developer/Platforms/iPhoneSimulator.platform/Developer/Library/Frameworks/XCUIAutomation.framework/XCUIAutomation` |
| SHA-256 | `7a5f92eaf8028768ea58c32b1417bc94bf8fefb4900e17c752a31b1492cdd8d7` |
| arm64 UUID | `6C9998E3-2351-34D3-BAAB-B523F500A26A` |
| Framework | 16.0 / 25228 |
| Build tool | Xcode 27.0 / 27A266a |

The [build correspondence](build-correspondence.json) matches the bound plugin
bytes and derived test plan. The plugin links XCUIAutomation version 25228; its
test framework search path includes the inspected simulator framework directory.
Offline inspection of the saved result bundle supplies no caught exception
details beyond the generic point failure.

The actual loaded-image UUID and exception name/message/stack were not captured
by the live study. Therefore the assertion stub is a concrete static finding and
a supported explanation for the recorded failure, **not proof of the exact
caught runtime exception**. The live records independently prove that the first
point invocation threw before returning an element. No ABI mismatch was recorded.

## A concrete iOS acquisition lead

The pinned WDA archive is revision `277112a4f9bd0088ea9377ef4b88b750231c1f4a`,
SHA-256 `52dd2a367769f4d44cbfdd940db4e7b0abed52f72deee030ae9631c1f4f83109`.
Searching all 507 native source files finds the direct point selector only in
two private declarations. No call to it was found in those files. The
[search receipt](wda-search.json) preserves the scope and exact matches.

WDA's actual point path is
[FBActiveAppDetectionPoint.m:50–81](https://github.com/appium/WebDriverAgent/blob/277112a4f9bd0088ea9377ef4b88b750231c1f4a/WebDriverAgentLib/Utilities/FBActiveAppDetectionPoint.m#L50).
It obtains `testRunnerProxy`, sends `_XCT_requestElementAtPoint:reply:`, and
receives `(id element, NSError *error)`. The exact captured file has SHA-256
`dccb22862b9e8ed77a1dae9a4e580cedb55b8bec351ecb162eb0506a46b4ebe8`.
The [proxy source](wda/WebDriverAgentLib/Utilities/FBXCTestDaemonsProxy.m) and
[protocol declaration](wda/PrivateHeaders/XCTest/XCTMessagingRole_CapabilityExchange-Protocol.h)
preserve the supporting private interface.

WDA limits its semaphore wait to 0.3 seconds. That bounds waiting; it does not
cancel the request, acknowledge callback settlement or certify native owner
completion. Its non-main-display path returns nil. This implementation cannot be
copied into the study as a completion or authoritative-display guarantee.

## Next work owned by the supervisor

Rule out retrying the direct point selector for this inspected framework.
Investigate the iOS callback interface's runtime ABI, element provenance and
ownership of pending/late replies. Any new study must preserve its loaded-image
and bounded exception provenance, use the original shared admission allowance,
and retain outstanding work rather than equating wait expiry with completion.
The provider's actual completion/stopping contract remains necessary.

The current reference device/apps/guard stay retained. No new device work is
admitted, no cleanup is replayed, and no user backend decision is requested.
Complete ancestry, reference lifetime, independent associations, tap receipt and
contact release remain unestablished. All 23 production requirements are pending.

`manifest.json` inventories the selected research artifacts and decompressed raw
bytes; `origins.json` identifies copied originals. The original capture's
`source-receipts-manifest.json` also names the locally preserved binary and full
framework dump. Those two payloads are not copied into this repository. The
copied WDA sources retain their notices and [license](wda/LICENSE).
