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
record accounting. Every invocation checks its exact Objective-C ABI and admission
before starting. The four-method metadata inspection invokes no app-element query.
Admission is checked again after signature preparation and record delivery,
immediately before invocation or fixture activation; denied calls are not counted.
Reference study uses public fixture activation, the original point object at
(160,170), direct snapshot getters, and the file hook for replacement. Local object
labels describe this runner's retained objects; they are not native identities.

Method return, local reference release and unknown native settlement are reported
separately. A method that throws is not counted as returned. A synchronous method
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
