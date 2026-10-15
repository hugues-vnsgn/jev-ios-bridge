# Standalone native observation target

`NativeOwnerStudy` links XCTest and XCUIAutomation directly. It has no WDA
library, setup hooks, swizzling or global timeout changes. Both test methods
require the explicit environment described in the shared study specification.
Do not launch them independently against an arbitrary device.
The builder selects a fixed profile from the shared declaration and expands
`StudyInfo.plist` with its expected IDs. Entry checks the actual main/plugin
bundle IDs and compiled plan before acquiring `XCUIDevice`. The observation
stream emits identity immediately after `started`, before the native getter.
Fixture activation uses the plist-bound ID; telemetry must report that same ID.

`ObservationStudy.run` owns original objects, serial private-selector reads and
record accounting. Reference point acquisition uses the validated
`XCTRunnerDaemonSession requestElementAtPoint:reply:` callback wrapper. The
runner retains the reference study for its process lifetime and refuses a second
reference run in that process. Metadata never resolves the point session. Every invocation checks its exact Objective-C ABI and admission
before starting. The four-method metadata inspection invokes no app-element query.
Admission is checked again after signature preparation and record delivery,
immediately before invocation or fixture activation; denied calls are not counted.
Reference study uses public fixture activation and the actual callback point object
at (160,170). For each validity phase it requests exactly the exported
`XC_kAXXCAttributeIsValid` key through `attributesForElement:attributes:error:`.
It records dictionary/key presence, bounded scalar type/value and NSError
domain/code. A nonnil dictionary never becomes a validity Boolean. Error userInfo
and unrequested attributes are excluded.

Parent traversal acquires a separate application element through
`XCAccessibilityElement.elementWithProcessIdentifier:` using verified fixture
telemetry. It compares retained objects using the native `isEqual:` method and
records the checked method's loaded UUID and encoding. PID-based construction is
only an observation input; it supplies no app-instance or association authority.
Native equality supplements pointer-cycle detection. The walk records its exact
termination, including an independently equal root, a missing parent before that
root, native-reference cycle or 32-edge limit. Even a root match leaves complete
ancestry and association scope unestablished. An equal root at exactly 32 edges
requires no 33rd parent read.

`ReferenceAccess` resolves only the fixed attribute symbol/root class and their
method provenance. Missing symbol, image provenance or ABI prevents the related
call. String/error-domain evidence is bounded to 1,024 UTF-8 bytes; unsupported
values and extra dictionary entries produce explicit failures. The existing
fixture replacement hook is unchanged. Local labels correlate retained objects
only; they are not native identities.

Method return, reply receipt, retained callback payloads and unknown native
settlement are reported separately. A synchronized bounded request owner retains
first/late elements, counts duplicate callbacks and prevents result replacement.
Stop, deadline, duplicate or a thrown send closes further point admission.
`finished.pointCallbacks` is a final observation snapshot; later replies update
retained state without appending to the closed stream. The final release flag
and counters share one snapshot. Neither a reply nor a returned send proves
native settlement.

Admission uses the original absolute `JEV_NATIVE_OWNER_ADMISSION_DEADLINE` in
`CLOCK_MONOTONIC_RAW` seconds shared by the macOS host and this simulator-only
study. Startup and callback waiting consume that same deadline. The stop file
remains an independent admission check. The live wait pumps the runner run loop.
Loaded wrapper/session/accessibility image UUIDs come from in-memory Mach-O
headers; exception names, reasons and up to 16 image-relative frames are bounded. A method that throws is not counted as returned. A synchronous method
that never returns prevents completion; it is never killed or declared settled by
this target. All coverage stays unestablished. No input selector is invoked.

The private snapshot parameters (`maxDepth`, `maxChildren`, `maxArrayCount` and
`traverseFromParentsToChildren`) are investigation inputs observed in WDA source
at `277112a4f9bd0088ea9377ef4b88b750231c1f4a`; they are not an owner-supported
bounded-work contract. Their names are recorded in
`WebDriverAgentLib/Categories/XCAXClient_iOS+FBSnapshotReqParams.m`. Native error,
missing getter and incomplete parent replies stay explicit.

The macOS `NativeOwnerPolicyTests` target tests the actual observation
Implementation through controlled selector replies and record encoding. These
tests establish local policy only. They run without booting or operating a simulator:

```sh
cd spikes/native-owner/native
xcodegen generate --spec project.yml
xcodebuild test -project NativeOwnerStudy.xcodeproj -scheme NativeOwnerPolicyTests \
  -destination 'platform=macOS' -derivedDataPath /private/tmp/native-owner-policy
```

Build both real iOS targets without device execution, with fresh paths and source/
product binding receipts:

```sh
python3 build.py --plan metadata --derived-data /private/tmp/native-owner-metadata-build \
  --receipts /private/tmp/native-owner-metadata-build-receipts
python3 build.py --plan reference-study --derived-data /private/tmp/native-owner-reference-build \
  --receipts /private/tmp/native-owner-reference-build-receipts
```

Generated projects and build logs are ignored; builds and receipts stay outside
Git. A successful generic build is compilation, not a native study result.
The receipt covers the builder, shared declaration and binding code, host code,
protocol, recursive native inputs and fixture sources/resources, explicit plist,
all generated-project files, all product files and the original `.xctestrun`.
Generated projects and bytecode caches are excluded from source inventories;
projects have their own inventory. Host test code and documentation are not build
inputs. The fixture target excludes its root README and ignore file; nested
fixture resources stay bound.
