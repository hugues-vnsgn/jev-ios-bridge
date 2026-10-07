# Standalone native observation target

`NativeOwnerStudy` links XCTest and XCUIAutomation directly. It has no WDA
library, setup hooks, swizzling or global timeout changes. Both test methods
require the explicit environment described in the shared study specification.
Do not launch them independently against an arbitrary device.

`ObservationStudy.run` owns original objects, serial private-selector reads and
record accounting. Every invocation checks its exact Objective-C ABI and admission
before starting. The four-method metadata inspection invokes no app-element query.
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
  -destination 'platform=macOS' -derivedDataPath /tmp/native-owner-policy
```

Build both real iOS targets without device execution, with fresh paths and source/
product binding receipts:

```sh
python3 build.py --derived-data /tmp/native-owner-build \
  --receipts /tmp/native-owner-build-receipts
```

Generated projects and build logs are ignored; builds and receipts stay outside
Git. A successful generic build is compilation, not a native study result.
