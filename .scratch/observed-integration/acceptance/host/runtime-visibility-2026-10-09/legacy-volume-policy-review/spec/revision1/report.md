# Spec review : legacy-volume proposal revision1

**FAIL: one P2 missing/partial requirement.** Wrong behavior: 0 findings. Unasked behavior: 0 findings. This verdict concerns proposal completeness.

Inspected fixed diff `e971d3312b595a5d841b1d70288302c40f7a5b70...91084c0c065373a978c8437f8f8362c4f5e4dbc9`, product `3edf247ab44d3332bc4bab5f3a43104536d84ce9`, and proposal SHA256 `94ab01cb03679e8f92008a874e90cddaaa970e509799bb3c380fbe060f6a028a`. Approved Cryptex v3 remains hash `e8cbff80f2a1610a6e0b4ec1b372086e490f0bc8a8030d6ecf2e5c7105859d13`.

## Finding

**P2 : require stable immediate Volumes enumeration.** Proposal:17 requires proof around "every runtime listing"; :27 bounds immediate Volumes entries; :29 requires "Inspect all supported roots" and duplicate refusal. None explicitly requires full namespace identity snapshots around the initial Volumes `readdir`, or binds its candidate set to that snapshot. :23 covers metadata identity but leaves this enumeration stage unspecified. Current Source:352-359 performs only a strict precheck; Cryptex discovery already checks namespace identity around enumeration at Source:294-298. If Volumes changes during listing, later per-mount proofs may describe the replacement namespace while an incomplete earlier candidate set omits a duplicate. Require cancellation-aware full ancestor/namespace snapshots before and after this listing, refuse observed changes, bind candidates to the verified snapshot, and require a genuine enumeration-change regression. This detects observed changes without claiming atomic inventory pinning.

## Evidence and gates

Independent retained audit: **3130/3130 checks PASS**; 692 operator artifacts, 134 exact plutil children with actual successful close, 402 complete input captures, and before/after/completion bindings for 441 Source, 69 compiled, 15 host and 121 prior-evidence files. Genuine final lstat sequence 9002 confirms uid 0/gid 80/mode 0775 Profiles refusal; zero diskutil/Cryptex calls. New lookup Xcode JSON retains exact 77,555 raw bytes; earlier sanitized phase5 JSON qualification persists.

Actual legacy mount status and full mode observations remain **UNVERIFIED**, as proposal:9/19 declares; their absence is a factual gate, not another design finding. Owner approval, implementation, installed compatibility, operational entry, L01-L05 and ticket12 remain pending. No tests or native queries were run. [Clause correspondence](clause-matrix.md), [receipt audit](evidence-audit.json), [input hashes](inputs-manifest.json).
