# Native AX request settlement: concrete boundary and remaining access

Date: 2026-10-07. Scope: static analysis only; no simulator, private binary execution, retained-resource cleanup, or new native admission.

## Result

The actual iOS AX request protocol has a bounded caller wait and an independently running server callback. A caller timeout is demonstrably not an operation-owned stop acknowledgement. Successful replies provide a narrower positive fact: the inspected synchronous hit-test callback returned before its response was sent. The inspected interfaces do not expose a per-request cancellation acknowledgement or a descendant-work registry. This analysis does not establish that no such interface exists elsewhere.

Plan executed: inspect the exact point MIG client, its server handler, callback scheduling, and reply construction; compare transport semantics against primary Apple documentation; assess whether those facts apply to the historical failed study. This is contract research, not a claimed bug fix or mock-based native regression test.

## Actual client/server implementation

The supervisor mounted the previously pinned iOS 26.4 runtime image readonly; attach provenance is in this directory. Inspected relative file: `System/Library/PrivateFrameworks/AXRuntime.framework/AXRuntime`, arm64, SHA-256 `fb9f921e607f6b2be6d243110fc365aa6411497f3651dd7420864c4eab2fa866` (matches prior point-owner report).

- `__AXMIGCopyElementAtPosition` at `0x4222c` creates a reply port, assembles a request, and calls `mach_msg` at `0x4234c`. `w1=0x113` is `MACH_SEND_MSG | MACH_RCV_MSG | MACH_SEND_TIMEOUT | MACH_RCV_TIMEOUT`. `x5` carries the supplied timeout. The installed SDK `usr/include/mach/message.h` defines those masks as 1, 2, 0x10, and 0x100. The error path at `0x423e4` deallocates the reply port; the inspected function sends no cancellation request.
- Server demultiplexer `__XCopyElementAtPosition` at `0x4383c` calls `__AXXMIGCopyElementAtPosition` at `0x43908` before completing the reply record.
- `__AXXMIGCopyElementAtPosition` at `0xa3b8` invokes `__handleNonMainThreadCallback` at `0xa46c`. The callback invokes a registered function pointer at `0xa5c4` and writes its returned status. Successful object processing then validates and releases the raw AX object before this function returns. This narrows completion to the registered callback; it does not specify work the callback might separately enqueue.
- `__handleNonMainThreadCallback` at `0x95ac` invokes directly on the main thread. Its admitted off-main path dispatches a block to the main queue at `0x9680` and waits on a semaphore with `DISPATCH_TIME_FOREVER` (`x1=-1`) at `0x968c`. That block invokes the original callback at `0xb3f0` and signals only afterward (`0xb400`). There is no caller-timeout check or cancel-token test in that queue block.
- `_mshMIGPerform` at `0x17590` invokes its selected handler at `0x17690`, then sends the constructed reply through `mach_msg` at `0x177d4`. It processes send failure after execution; losing the reply recipient does not undo the handler.

**Inference from the inspected bodies:** a request whose message was delivered can be queued on the server main thread while the client receive wait times out. Deallocating the client's reply port does not remove that queued callback. A later success reply proves return of this handler/callback stack, not global AX-service quiescence and not an undocumented transitive guarantee about arbitrary callback descendants.

The prior [daemon ordering report](../native-callback-implementation/research/point-owner/report.md) places this boundary below XCTestSession → XCAXManager_iOS → AXRuntime. Its remote-element forwarding paths remain part of any complete successful-request proof.

## Transport shortcuts rejected by primary contracts

Apple documents send and receive as sequential operations, including when combined in one `mach_msg` call. A receive timeout describes failure to obtain a reply during the wait, not retraction of an already delivered request. [Apple XNU mach_msg manual](https://github.com/apple-oss-distributions/xnu/blob/main/osfmk/man/mach_msg.html).

`NSXPCConnection.scheduleSendBarrierBlock` does not guarantee that the remote process has received the messages when the barrier executes. Therefore a send barrier is not a native-work fence. [Apple send-barrier contract](https://developer.apple.com/documentation/foundation/nsxpcconnection/schedulesendbarrierblock(_:)).

`NSXPCConnection.invalidate` calls outstanding reply/error/invalidation blocks and prevents further messaging on that connection. Its contract does not state that remote work spawned by earlier messages is stopped. A callback caused by invalidation cannot be treated as a successful native result. [Apple invalidation contract](https://developer.apple.com/documentation/foundation/nsxpcconnection/invalidate()).

The public macOS `AXUIElementSetMessagingTimeout` changes an accessibility API timeout. It documents no cancellation receipt, and it is not a supported iOS extension contract. [Apple API contract](https://developer.apple.com/documentation/applicationservices/1459345-axuielementsetmessagingtimeout).

## Historical retained reference study

The [archived direct-point diagnosis](../native-study-identities/research/point-exception/report.md) shows the installed direct selector is an assertion stub with no AX request dispatch. If the historical invocation were positively bound to this exact implementation and exception, that would support a narrow no-point-request-sent conclusion. The archive explicitly lacks the loaded-image UUID and the caught exception name/reason/stack. Its plugin/search-path correspondence is evidence of what was intended to load, not proof of the executing method implementation.

The missing historical temporary guard and original temporary receipts add no native settlement fact. The archived first point throw and runner exit cannot fill the runtime provenance gap. No later mock, rebuild, rerun, or current binary inspection retroactively supplies it. This report does not admit a new study or authorize deletion/adoption of retained resources.

## Feasible implementation route and exact missing access

An IDB wrapper can stop admitting new calls, preserve pending ownership, and recognize a received native reply. It cannot implement a correct `stop-and-acknowledge` for a request already delivered to this server by destroying its own connection or reply port.

A qualifying extension needs access at the actual callback owner: admission keyed to an operation, propagated cancellation, and an acknowledgement after its queued callback and owned descendants have returned or become unable to act. The currently inspected XCTest private point method carries CGPoint and a reply block; it exposes neither such operation handle nor a stop acknowledgement. The MIG request shown here is also not that extension.

For a successful ordinary read, the next focused proof is more tractable: identify the exact registered hit-test callback for the target process, show every remote-element forwarding request rejoins before return, bind loaded implementations, and establish no escaping owned work. That can establish operation-local completion without demanding global service idleness. Failure/timeout settlement remains a distinct requirement even if this positive proof succeeds.

Do not add a generic certificate-shaped API whose only implementation is this wrapper. The missing capability is an accessible native-owner contract or modification point, not a TypeScript/Objective-C result type. Source-backed evidence remains required for any recovery fence that would retire the historical run.

## Reproduction and selected instructions

Command: `xcrun llvm-objdump --macho --arch=arm64 --disassemble <readonly-runtime-root>/System/Library/PrivateFrameworks/AXRuntime.framework/AXRuntime`. Filter by the named symbol bodies and addresses above. `--disassemble-symbols` with Mach-O did not restrict output in this tool version; the successful inspection captured stdout and selected exact symbol/range records in memory. No binary was executed.

The following are bounded verbatim instruction excerpts from that inspection:

```text
    9674:	c0 02 00 f0	adrp	x0, 91 ; 0x64000
    9678:	00 44 45 f9	ldr	x0, [x0, #0xa88] ; literal pool symbol address: __dispatch_main_q
    967c:	e1 03 00 91	mov	x1, sp
    9680:	61 f8 00 94	bl	0x47804 ; symbol stub for: _dispatch_async
    9684:	e0 03 14 aa	mov	x0, x20
    9688:	01 00 80 92	mov	x1, #-0x1
    968c:	79 f8 00 94	bl	0x47870 ; symbol stub for: _dispatch_semaphore_wait
    a468:	e0 83 00 91	add	x0, sp, #0x20
    a46c:	50 fc ff 97	bl	__handleNonMainThreadCallback
    a470:	a8 83 5d f8	ldur	x8, [x29, #-0x28]
    a474:	09 19 40 b9	ldr	w9, [x8, #0x18]
    a59c:	00 04 46 2d	ldp	s0, s1, [x0, #0x30]
    a5a0:	02 78 40 79	ldrh	w2, [x0, #0x3c]
    a5a4:	03 38 40 b9	ldr	w3, [x0, #0x38]
    a5a8:	09 14 40 f9	ldr	x9, [x0, #0x28]
    a5ac:	29 05 40 f9	ldr	x9, [x9, #0x8]
    a5b0:	4a 03 00 f0	adrp	x10, 107 ; 0x75000
    a5b4:	45 59 42 f9	ldr	x5, [x10, #0x4b0]
    a5b8:	00 e0 43 f8	ldur	x0, [x0, #0x3e]
    a5bc:	61 62 44 f8	ldur	x1, [x19, #0x46]
    a5c0:	24 61 00 91	add	x4, x9, #0x18
    a5c4:	00 01 3f d6	blr	x8
    a5c8:	68 12 40 f9	ldr	x8, [x19, #0x20]
    a5cc:	08 05 40 f9	ldr	x8, [x8, #0x8]
    a5d0:	00 19 00 b9	str	w0, [x8, #0x18]
    a5d4:	fd 7b 41 a9	ldp	x29, x30, [sp, #0x10]
    a5d8:	f4 4f c2 a8	ldp	x20, x19, [sp], #0x20
    b3e4:	f3 03 00 aa	mov	x19, x0
    b3e8:	00 14 40 f9	ldr	x0, [x0, #0x28]
    b3ec:	08 08 40 f9	ldr	x8, [x0, #0x10]
    b3f0:	00 01 3f d6	blr	x8
    b3f4:	60 12 40 f9	ldr	x0, [x19, #0x20]
    b3f8:	fd 7b 41 a9	ldp	x29, x30, [sp, #0x10]
    b3fc:	f4 4f c2 a8	ldp	x20, x19, [sp], #0x20
    b400:	19 f1 00 14	b	0x47864 ; symbol stub for: _dispatch_semaphore_signal
   17688:	e0 03 15 aa	mov	x0, x21
   1768c:	e1 03 13 aa	mov	x1, x19
   17690:	e0 02 3f d6	blr	x23
   17694:	68 02 40 b9	ldr	w8, [x19]
   177c0:	e0 03 13 aa	mov	x0, x19
   177c4:	03 00 80 52	mov	w3, #0x0
   177c8:	04 00 80 52	mov	w4, #0x0
   177cc:	05 00 80 52	mov	w5, #0x0
   177d0:	06 00 80 52	mov	w6, #0x0
   177d4:	51 c0 00 94	bl	0x47918 ; symbol stub for: _mach_msg
   42334:	e0 03 00 91	mov	x0, sp
   42338:	61 22 80 52	mov	w1, #0x113
   4233c:	02 09 80 52	mov	w2, #0x48
   42340:	03 89 80 52	mov	w3, #0x448
   42344:	e5 03 13 aa	mov	x5, x19
   42348:	06 00 80 52	mov	w6, #0x0
   4234c:	73 15 00 94	bl	0x47918 ; symbol stub for: _mach_msg
   423e4:	e0 0f 40 b9	ldr	w0, [sp, #0xc]
   423e8:	73 15 00 94	bl	0x479b4 ; symbol stub for: _mig_dealloc_reply_port
   438f8:	a9 53 00 d1	sub	x9, x29, #0x14
   438fc:	f4 27 01 a9	stp	x20, x9, [sp, #0x10]
   43900:	ea 2f 00 a9	stp	x10, x11, [sp]
   43904:	e0 03 08 aa	mov	x0, x8
   43908:	ac 1a ff 97	bl	__AXXMIGCopyElementAtPosition
   4390c:	80 82 1e b8	stur	w0, [x20, #-0x18]
```
