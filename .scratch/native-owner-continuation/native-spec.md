# Observe raw validity and independent native root relationships

Status: supervisor approved, offline implementation

Extend the existing `ObservationStudy` reference path. Keep native settlement, ancestry completeness, native lifetime and independent associations unestablished. A root constructed from the fixture PID and a native equality reply provide observations, never PID-based identity authority.

Request exactly the runtime-exported `XC_kAXXCAttributeIsValid` key through `attributesForElement:attributes:error:` for each existing validity phase. Preserve dictionary presence, key presence, typed Boolean/finite numeric/bounded string scalar value, and bounded NSError domain/code. Missing key, nil/error, unrecognized value types and oversized replies are explicit failures; never interpret nonnil dictionary as valid. Read only the requested key, refuse extra dictionary entries, and retain no raw trees or error userInfo. Strings remain bounded to 1,024 UTF-8 bytes and the existing stream stays bounded to 1 MiB.

Acquire a separate `XCAccessibilityElement.elementWithProcessIdentifier:` root using the verified fixture PID (positive signed 32-bit). Compare actual retained walked objects through the native `isEqual:` implementation, supplementing local pointer cycle checks with native equality. Record root factory, expected PID and local-reference labels; equality is only an observed result within this acquisition. Record a terminal parent-walk reason: native-root-equal, nil-parent-before-root, native-reference-cycle, parent-limit, or unavailable/error. Every result keeps ancestry completeness unestablished, including the root-equal case.

Before these new calls validate exact method ABI, original deadline/stop admission and loaded method UUID/encoding. Resolve one fixed exported attribute symbol and one fixed native root class; missing symbol or provenance refuses the associated native call. No configurable selector registry. Record symbol provenance and actual method provenance without logging unbounded payloads.

Use `ObservationStudy.run` and its existing macOS XCTest doubles as the approved test seam. Preserve point callback accounting, operation enums and existing retained host behavior. No device execution or cleanup belongs to this task.
