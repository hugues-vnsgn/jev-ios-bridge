# The iOS daemon replies after a synchronous AX lookup

The installed iOS 26.4 image contains the previously uninspected native daemon.
Its point handler calls the AX manager synchronously and invokes the runner reply
after that method returns. This establishes ordering inside the handler; it does
not yet establish the lifetime of every request started below AXRuntime or a
stopping acknowledgement after a lost reply.

## Static path

`XCTestSession._XCT_requestElementAtPoint:reply:` at `0x10002f6d4` first checks UI
testing readiness. On success it obtains `axManager`, calls `elementAtPoint:error:`
at `0x10002f748`, then invokes the supplied reply with the result and error at
`0x10002f778`. The readiness-failure branch replies with nil and the readiness
error. No extra work queue or delayed block appears in this handler.
[Selected handler bodies](testmanagerd-point-disassembly.txt).

`XCAXManager_iOS.elementAtPoint:error:` at `0x10000a760` obtains the synchronized
system-wide element, sets the requesting client, and calls
`AXUIElementCopyElementAtPositionWithParams` at `0x10000a7ec`. Success wraps the
returned AX object with `XCAccessibilityElement.elementWithAXUIElement:`. The
manager releases its raw copied AX reference before returning the wrapper.
[Manager implementation](axmanager-point-disassembly.txt).

The attribute handler similarly replies after
`attributesForElement:attributes:error:` returns. The AX manager delegates this
read to `accessibilitySystem.accessibilityFramework`. This narrows where original
item resolution must be examined; it does not prove a cache or reset policy.

AXRuntime's point implementation reaches `__AXXMIGCopyElementAtPosition` or
`__AXMIGCopyElementAtPosition`, with additional paths for remote accessibility
elements. The retained extract names these deeper boundaries. No terminal or
cancellation contract for them is established here.
[AXRuntime point implementation](axruntime-point-disassembly.txt).

## Scope and next step

The native diagnostic can use the callback while keeping settlement unconfirmed.
A future production completion argument must cover the exact request and its
children, rather than global accessibility-service idleness. Inspect the MIG
request/reply and remote-element paths before interpreting a successful reply as
that stronger fact. Readiness initialization must also remain accounted for.

These are offline instructions from the mounted runtime image, not measurements
of a running daemon or the retained reference study. The [daemon provenance](provenance.json)
and [AXRuntime provenance](axruntime-provenance.json) record exact binary hashes.
The owner-locator report records the image and owned read-only mount receipt.
No binary was loaded, and no simulator, input or retained guard operation occurred.
