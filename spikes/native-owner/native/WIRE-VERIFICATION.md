The 2026-10-07 metadata integration run reached native class completion, but its
finished record encoded `localMethodsReturned` and `localReferencesReleased` as
numeric `1`. The host correctly retained the run with `RECORD_SCHEMA`: the
protocol requires JSON booleans.

Objective-C comparison expressions have integer type. `@(comparison)` boxes a
number, and NSNumber equality accepts `1` as equal to `@YES`. The new regression
tests examine the emitted Foundation JSON bytes and CFBoolean identity before
and after decoding. They cover normal and exceptional completion, every intended
observation boolean, wrapped/direct snapshots, nil replies, native errors, and
true/false validity. They also check that protocol counters stay numeric.

Against the unchanged `223d733` Implementation, the two new tests reported 88
intended assertions and zero unexpected failures. After routing dynamic booleans
through explicit `@YES`/`@NO` literals, all 25 macOS policy tests passed without
warnings. Logs are `/tmp/jev-native-owner-wire-booleans-red.log` and
`/tmp/jev-native-owner-wire-booleans-green.log`.

```sh
xcodegen generate --spec spikes/native-owner/native/project.yml
xcodebuild test \
  -project spikes/native-owner/native/NativeOwnerStudy.xcodeproj \
  -scheme NativeOwnerPolicyTests -destination platform=macOS \
  -derivedDataPath /tmp/jev-native-owner-wire-policy-green
```

The standalone iOS probe and fixture use the existing generic build and binding
command; both output directories must be fresh:

```sh
python3 spikes/native-owner/native/build.py \
  --derived-data /tmp/jev-native-owner-study-wire-fix-build \
  --receipts /tmp/jev-native-owner-study-wire-fix-receipts
```

The receipts bind source hashes, source commit, actual app products, test plan,
and Xcode version. Generic compilation does not execute iOS tests. This fix does
not establish native settlement, reference lifetime, or complete ancestry.
Device integration and cleanup remain serialized by the supervisor.
