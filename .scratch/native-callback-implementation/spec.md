# Acquire diagnostic point objects through the XCTest callback

Status: approved by supervisor for offline implementation

## Scope

Replace the unusable direct iOS point selector in the existing standalone reference study with the installed `XCTRunnerDaemonSession requestElementAtPoint:reply:` wrapper. Keep the actual callback object for the existing validity, snapshot, parent and replacement observations. This is a runnable diagnostic improvement outside production source. It accepts none of the 23 production requirements. Device execution remains separately admitted.

## Native contract

Inject a fixed point-request collaborator into `ObservationStudy`; the real runner resolves `XCTRunnerDaemonSession.sharedSession` only for reference-study. Check the getter and wrapper Objective-C signatures before calling them. The wrapper must return void with CGPoint and block arguments; metadata mode does not acquire a daemon session or issue a point query. Keep the existing AX client for validity and snapshot reads. Remove the direct point call from the reference path.

Before each point send, create and retain one request state object, then check the original deadline and stop condition again immediately before sending. Send once at (160,170); allow at most the original and fresh requests in one study. A thrown send, stop or expired deadline prevents another point request. A valid first callback is an observation permitting subsequent diagnostic reads under admission; it does not settle native work.

Protect request state against simultaneous callback and study access. Retain the exact first non-error element; downstream reads use object identity, not a reconstructed ID. First nil/error reply fails acquisition. A duplicate cannot replace the first result; count it and fail further admission. After a stopped/expired request, a late element stays retained for accounting and is never consumed as a fresh result. Bound retained payloads to one first callback payload and one late payload per request; count further callbacks without retaining more objects.

Keep callback state alive independently of stack locals and the caller's wait. The standalone runner retains the study/request owner for the remainder of that test process when a point request has been issued. Reference-study resources remain retained by the existing host policy. End normal local waiting at stop/deadline, without cancellation, retry, connection invalidation or a fabricated native completion. The final record is a snapshot of callback accounting at that time; later callbacks may update retained state but must not emit records after `finished`. State this observation cutoff explicitly. No finite observation proves that no future duplicate will arrive.

While waiting, yield through the existing injected wait boundary. The live implementation pumps the runner run loop in bounded slices; tests advance a fake clock and deliver controlled callbacks. Wait slices never create a new allowance. Check admission after the callback and before every subsequent native call.

## Provenance

Before the real send, record loaded image name and Mach-O UUID for the installed session wrapper IMP, the session class, and the AX client implementation used by the study. Use runtime image lookup; never substitute an on-disk UUID. A missing UUID yields explicit unavailable provenance and refuses the send. Record the checked method types. For doubles, inject deterministic provenance.

Catch exceptions around preparation and invocation. Record bounded exception name/reason and at most 16 stack frame image UUID/offset pairs, without object descriptions or screen trees. If a field exceeds protocol limits, record its byte count and an explicit provenance-limit reason; never silently truncate it into apparently complete evidence. A caught exception does not mean native work returned or stopped.

## One original deadline

Replace the restarted native allowance with `JEV_NATIVE_OWNER_ADMISSION_DEADLINE`, an absolute value in the same clock domain used by the host's initial admission deadline. Use explicit `clock_gettime(CLOCK_MONOTONIC_RAW)` on both the macOS host and simulator-native side, after verifying its SDK/Python definition and same-host simulator applicability. Keep the stop file. Never compute a new deadline in `derive_plan`, native entry or point acquisition. Reject absent/nonfinite deadlines and expired admission before native work. Inject clocks in both test suites; elapsed-record time remains relative to native study start.

If shared-domain applicability cannot be supported from local/primary evidence, pause this design point for supervisor resolution rather than quietly falling back to renewed seconds. Physical iOS devices are outside this implementation.

## Wire contract for parallel implementation

Keep schema `jev.native-owner/1` and existing operations. Add required `pointCallbacks` to every `finished.details`:

```json
{"started":0,"sendReturned":0,"replyReceived":0,"pending":0,"late":0,"duplicate":0,"retainedObjects":0,"observationClosed":true,"nativeSettled":false}
```

All count fields are nonnegative integers; `started <= 2`, `sendReturned <= started`, `replyReceived <= started`, and `pending == started - replyReceived`. `replyReceived` counts requests with at least one callback, including nil/error replies; `late` and `duplicate` count callback events. `retainedObjects` reports retained callback payload objects at the final snapshot. `observationClosed` is always true at final output and `nativeSettled` is always false. Zero queries in metadata require all seven counts zero. Existing `nativeSettlement` stays `unconfirmed`. Local method return counts only return of the send method; it does not count a callback. `localReferencesReleased` must be false when callback state still retains an element.

Point observation details name phase, source `requestElementAtPoint:reply:`, reply/error presence, replyReceived, and nativeSettled false. Successful first replies keep existing local reference labels. Failure reasons distinguish unsupported ABI, missing provenance, native exception, nil reply, native error, deadline, stop and duplicate callback. The final summary remains authoritative when late events occur before its cutoff. Metadata provenance records stay bounded under existing string/stream limits.

The host validates summary arithmetic, Boolean types and the false settlement claim. The historical metadata reconciler may add an all-zero callback summary only to its diagnostic copy after its existing sealed zero-query case checks; it rejects an original callback-summary field and never changes archive bytes. Fresh runs have no legacy fallback. Reject any callback count or point-send record in metadata; preserve metadata cleanup only for genuinely zero-query work. Reference-study remains retained regardless of callback counts or native method return. Missing/malformed callback summaries refuse cleanup.

## Acceptance

Use actual `ObservationStudy` in macOS policy tests with controlled point transport and clock. Prove ordinary original/fresh callback objects reach existing validity/snapshot paths, no direct point invocation, inline and background callbacks, nil/error, incompatible ABI, exception provenance, no callback, stop, expiry during preparation, late callback, duplicate callback, and object retention across autorelease pools. A pending or ambiguous send prevents another request. Verify metadata never resolves the transport.

Host tests exercise `run_study` and stream parsing with independent callback records. Prove malformed/contradictory claims fail, reference resources stay retained, zero-query metadata cleanup still works, and delayed startup cannot extend the original deadline. Serialize native policy output into the real Python validator for at least one ordinary and one pending callback case. Generic simulator build proves compilation only; no simulator is booted or queried during this work.

## Historical compatibility amendment

Supervisor authorized a narrowly scoped update to `host/reconcile.py`. Its
existing sealed-case validation must succeed before adapting the registered
metadata-only numeric-flags defect. Reject any original `pointCallbacks` field.
After confirming exactly zero app queries and the exact numeric flag defect,
supply an all-zero callback summary only to the diagnostic parsing copy.
Original records, source/build receipts and `originalStreamValid:false` remain
unchanged. The normal study parser has no legacy fallback.
