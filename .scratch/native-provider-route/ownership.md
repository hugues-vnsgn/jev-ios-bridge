# Ownership extension route

2026-10-07 · base `1e69eb2598c5b9685b1b350abca10f550b735df2` · static inspection only

**No implementable external owner extension meeting the existing arbitrary, non-instrumented-app contract was found. The exact unavailable interface is now narrower: the target process’s UIAccessibility callback and AXRuntime element-cache resolver, not the XCTest client or daemon.** The shipped implementations are physically accessible and newly inspected below. Their rebuildable source and an owner-supported remote extension interface have not been obtained. This is not a claim that the binaries or every relevant implementation are unavailable.

## New owner trace

In iOS 26.4 arm64, `UIAccessibility.__copyAttributeValueCallback` at `0x372c` resolves the received two-word element identifier through `AXRuntime.__AXElementForAXUIElementUniqueId` at `0x382c`, retains the result, rejects nil or `_accessibilityElementShouldBeInvalid` at `0x383c–0x3848`, and sends `_iosAccessibilityAttributeValue:` to that local object at `0x38e0`. Invalid resolution returns `-25202` at `0x38a4`. Thus the native resolver and the app object's implementation are the relevant owner boundary. This trace does not identify the XCTest validity key's numeric mapping, prove every special/remote branch, or prove invalidation after every reset.

AXRuntime's ordinary identifier branch resolves against its process-local element cache (`__AXElementForAXUIElementUniqueId`, `0x1c20–0x1c28`). Special branches select the application callback or registered remote elements. The cache lookup takes a lock and queries an NSMapTable using the complemented object-address value. Its removal and clear functions mutate that table. The inspected resolver does not establish a boot/app-instance/association certificate, safe non-reuse, or cross-process retention lease. Those semantics require the allocator/removal callers and special remote paths, not just a successful lookup. In particular, `__AXUIElementValidate` at `0x10ab4` is a CF-type/field decoder; its name does not imply live remote validity.

`__UIAccessibilityStart` registers the callbacks using `__AXUIElementRegisterServerWithRunLoop` at `0x35b8` (or system-wide registration on its other branch). `AXSimpleRuntimeManager.start` also installs callbacks on its current process/run loop. This is a concrete server implementation slot, but registering it in an external helper supplies the helper's server and objects. It does not replace or augment another app's registered callbacks. Extending the target callback would require target-process injection/instrumentation or an Apple-provided runtime extension. The former changes the required operating model; no supported latter hook was located.

## Feasibility decisions

| Candidate | What is actually accessible | Why it cannot yet satisfy the required positive |
| --- | --- | --- |
| Rebuild IDB/WDA or wrap XCTest | Client source and diagnostic integration | Can preserve original wrappers and report native replies; cannot add fields/leases to the target-process resolver or expose omitted native containers. |
| AXRuntime server registration | Installed implementation and exported private functions | Registers a local server. A new standalone provider owns only its own objects; forwarding to the old server retains the old gaps. |
| Direct private attribute requests | Existing AXRuntime transport and callback dispatch | Potentially useful for additional observations, but a new attribute number requires proven owner mapping and complete semantics. No arbitrary selector or integer probing is justified. |
| Public UIKit container | App-side object property | Requires access inside each target app; does not provide arbitrary-app remote lifetime or original containment certificates. |
| macOS AXUIElement through Simulator | Public macOS client API | Apple documents accessible macOS applications. Simulator's projection does not acquire a documented identity/containment contract for the underlying guest originals. |
| Public XCUIElementSnapshot | Snapshot attributes and descendants | No documented lease, original-item generation/reset domain or unfiltered native-container certificate. |

Current official sources checked: [AXUIElement](https://developer.apple.com/documentation/applicationservices/axuielement_h) explicitly describes macOS clients and distinguishes invalid elements from messaging failure; [UIKit accessibilityContainer](https://developer.apple.com/documentation/uikit/uiaccessibilityelement/accessibilitycontainer) exposes the containing view on the local object; [XCUIElementSnapshot](https://developer.apple.com/documentation/xcuiautomation/xcuielementsnapshot) describes snapshot descendants. Apple's [Accessibility API catalog](https://developer.apple.com/documentation/accessibility) presents app accessibility and assistive technologies, not an arbitrary-app provider replacement interface. The public [merchant-api-control entitlement page](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.accessibility.merchant-api-control) lists iOS availability but supplies no ownership/extension semantics; its existence cannot justify a new route. Search absence is not proof of universal nonexistence.

## Concrete next implementation prerequisite

The required extension must run where `__copyAttributeValueCallback` resolves the original object. Its supported interface must return complete original-container edges and owner-issued reference leases/generations covering app incarnation, association and remote-hosted branches. It must invalidate leases on removal/replacement/reset and validate/compare them for independent clients. A daemon-side registry over existing wrappers cannot supply those facts.

With that provider access, the minimal implementation is: (1) add an owner-side original-object lease and complete-container operation at this callback/resolver boundary; (2) expose it through one bounded request/reply protocol; (3) extend the existing native study to test the ignored-container positive, replacement, association reset and independent-client comparison; (4) only then implement the IDB capability. TDD doubles test client policy but do not accept the native positive. No production source change is proposed before the owner interface is available.

Remaining static investigation is possible: follow `_iosAccessibilityAttributeValue:` parent/validity mappings, element-cache insertion/removal callers, and special remote-element branches. Those bodies have not all been inspected; they are not physically inaccessible. That work could prove more version-specific observations, but it cannot turn local callback registration into a supported external provider hook. The decisive access question is whether Apple supplies a rebuildable target accessibility owner or a supported mechanism to extend its callback protocol without target-app instrumentation. No such access is present in this workspace. Input/contact certification is a separate parallel lane.

## Reproducible source evidence

Supervisor-owned read-only iOS 26.4 runtime root:
`/private/var/folders/yd/86fjng8s4hbfhcz7_0yqcl9w0000gn/T/jev-provider-route-mwa8ptay/Library/Developer/CoreSimulator/Profiles/Runtimes/iOS 26.4.simruntime/Contents/Resources/RuntimeRoot`.

| Runtime-relative binary | SHA-256 | arm64 UUID |
| --- | --- | --- |
| `System/Library/PrivateFrameworks/AXRuntime.framework/AXRuntime` | `fb9f921e607f6b2be6d243110fc365aa6411497f3651dd7420864c4eab2fa866` | `473BBBD4-3FAB-3B1A-A160-081117EE71A3` |
| `System/Library/PrivateFrameworks/UIAccessibility.framework/UIAccessibility` | `1e425a7d56a9725500e7934c7ff6041fe0d8c7c6ba7828b6d1459309bba3161e` | `1FC7778D-308F-379F-BED6-C96B252502F8` |

Commands: `xcrun nm -arch arm64 <binary>`, `xcrun llvm-objdump --macho --arch=arm64 --disassemble <binary>`, `xcrun dwarfdump --uuid <binary>`; SHA-256 from exact file bytes. Selected instructions below were extracted from the disassembly; unrelated bodies were discarded. No binary loading, simulator calls, app changes, secrets, cleanup or external messages occurred.


### UIAccessibility selected instructions

```text
    3598:	52 86 01 94	bl	0x64ee0 ; symbol stub for: _CFRunLoopGetCurrent
    359c:	e2 03 00 aa	mov	x2, x0
    35a0:	e0 03 00 91	mov	x0, sp
    35a4:	01 00 80 d2	mov	x1, #0x0
    35a8:	93 00 00 34	cbz	w19, 0x35b8
    35ac:	23 00 80 52	mov	w3, #0x1
    35b0:	81 87 01 94	bl	0x653b4 ; symbol stub for: __AXUIElementRegisterSystemWideServerWithRunLoop
    35b4:	02 00 00 14	b	0x35bc
    35b8:	7c 87 01 94	bl	0x653a8 ; symbol stub for: __AXUIElementRegisterServerWithRunLoop
    35bc:	f3 03 00 aa	mov	x19, x0
    3828:	e0 07 40 a9	ldp	x0, x1, [sp]
    382c:	8e 86 01 94	bl	0x65264 ; symbol stub for: __AXElementForAXUIElementUniqueId
    3830:	fd 03 1d aa	mov	x29, x29
    3834:	1e 88 01 94	bl	0x658ac ; symbol stub for: _objc_retainAutoreleasedReturnValue
    3838:	f4 03 00 aa	mov	x20, x0
    383c:	80 00 00 b4	cbz	x0, 0x384c
    3840:	e0 03 14 aa	mov	x0, x20
    3844:	9f 45 02 94	bl	_objc_msgSend$_accessibilityElementShouldBeInvalid
    3848:	60 03 00 34	cbz	w0, 0x38b4
    38a4:	33 4e 8c 12	mov	w19, #-0x6272
    38a8:	3f 00 00 14	b	0x39a4
    38d8:	e0 03 14 aa	mov	x0, x20
    38dc:	e2 03 16 aa	mov	x2, x22
    38e0:	20 5f 02 94	bl	"_objc_msgSend$_iosAccessibilityAttributeValue:"
    38e4:	fd 03 1d aa	mov	x29, x29
    38e8:	f1 87 01 94	bl	0x658ac ; symbol stub for: _objc_retainAutoreleasedReturnValue
```

### AXRuntime selected instructions

```text
    1c0c:	88 03 00 f0	adrp	x8, 115 ; 0x74000
    1c10:	08 01 29 91	add	x8, x8, #0xa40
    1c14:	08 01 40 f9	ldr	x8, [x8]
    1c18:	3f 00 08 eb	cmp	x1, x8
    1c1c:	80 00 00 54	b.eq	0x1c2c
    1c20:	e0 03 13 aa	mov	x0, x19
    1c24:	0f 3d 00 94	bl	__AXIsInElementCache
    1c28:	60 00 00 b4	cbz	x0, 0x1c34
    1c2c:	e6 17 01 94	bl	0x47bc4 ; symbol stub for: _objc_retain_x19
    1c30:	02 00 00 14	b	0x1c38
    1c34:	13 00 80 d2	mov	x19, #0x0
    1c38:	e0 03 13 aa	mov	x0, x19
   10df0:	28 03 00 b0	adrp	x8, 101 ; 0x75000
   10df4:	00 b5 42 f9	ldr	x0, [x8, #0x568]
   10df8:	22 45 01 14	b	_objc_msgSend$removeAllObjects
   110bc:	20 03 00 90	adrp	x0, 100 ; 0x75000
   110c0:	00 40 15 91	add	x0, x0, #0x550
   110c4:	e1 03 00 91	mov	x1, sp
   110c8:	95 d7 00 94	bl	0x46f1c ; symbol stub for: _AX_PERFORM_WITH_LOCK
   110cc:	e8 1f 40 f9	ldr	x8, [sp, #0x38]
   110d0:	13 0d 40 f9	ldr	x19, [x8, #0x18]
   11124:	28 03 00 90	adrp	x8, 100 ; 0x75000
   11128:	00 b5 42 f9	ldr	x0, [x8, #0x568]
   1112c:	68 16 40 f9	ldr	x8, [x19, #0x28]
   11130:	e1 03 28 aa	mvn	x1, x8
   11134:	24 d9 00 94	bl	0x475c4 ; symbol stub for: _NSMapGet
   11138:	fd 03 1d aa	mov	x29, x29
   1113c:	9c da 00 94	bl	0x47bac ; symbol stub for: _objc_retainAutoreleasedReturnValue
   11140:	a0 00 00 b4	cbz	x0, 0x11154
   11144:	08 08 40 f9	ldr	x8, [x0, #0x10]
   11148:	69 12 40 f9	ldr	x9, [x19, #0x20]
   1114c:	29 05 40 f9	ldr	x9, [x9, #0x8]
   11150:	28 0d 00 f9	str	x8, [x9, #0x18]
   11160:	28 03 00 90	adrp	x8, 100 ; 0x75000
   11164:	08 b5 42 f9	ldr	x8, [x8, #0x568]
   11168:	09 10 40 f9	ldr	x9, [x0, #0x20]
   1116c:	e1 03 29 aa	mvn	x1, x9
   11170:	e0 03 08 aa	mov	x0, x8
   11174:	1a d9 00 14	b	0x475dc ; symbol stub for: _NSMapRemove
```
