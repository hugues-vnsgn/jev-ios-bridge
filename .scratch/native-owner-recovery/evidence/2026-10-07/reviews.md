# Independent reviews

Code review compared `f43fa9b` with `de138f4`, followed by pinned fix deltas. No agent reviewed its own implementation.

| Axis and scope | Reviewer | Verdict |
| --- | --- | --- |
| Standards: process, reconciliation, integration and docs | design_flexible | no documented breach or material smell |
| Standards: device guard | design_minimal | no documented breach or material smell |
| Spec: process, guard and ordinary caller integration | design_minimal | post-unlink sync failure found |
| Spec: reconciliation, recovery integration and docs | native_provider_extension | nested-manifest omission found |
| Spec: archive fix at `f32e1d7` | native_provider_extension | resolved |
| Spec: guard fix at `a195ebd` | design_minimal | resolved; independent filesystem reproduction |
| Standards: both fix deltas through `a195ebd` | native_provider_extension | clear |

Documentation-only head `081b12e` records the final 91-test gate and both fixes. Both GitHub Package checks passed at that exact head before merge. The merged tree is `e494df0`.

A separate provenance audit verified 43 archived hashes, 12 decompressed hashes, eight native source hashes at `223d733`, 29 original historical files, and five preflight installed-file hashes. It confirmed the metadata source excludes explicit reference-study calls and the old exit code stays unknown. This is explicit call-scope evidence, not a census of XCTest internals.

Before the diagnostic live probe, design_flexible reviewed `8f40553` and found a restoration-failure path that could retry a no-op and release ownership. The caller regression reproduced both state and identity failures. Review at `1ca6f2a` confirmed resolution: restoration failure retains resources/guard after exactly one shutdown. The same commit avoids Python stdlib name shadowing and records ENOENT separately from unknown filesystem errors. The merged host Implementation was unchanged.

The independent live-receipt audit by design_minimal confirmed every one of the apply/metadata-attempt's 24 receipts against raw output and ledgers, original 23-device state restoration, consumed claim preservation, and zero native execution in the refused attempt. Capture-file mtimes are not precise command start/end timestamps.
