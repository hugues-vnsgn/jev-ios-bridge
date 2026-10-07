# Preserve research admission after temporary-state loss

Approved by supervisor on 2026-10-07. Scope: prospective host ownership only.

The archived reference run remains unsettled. Its recorded temporary guard and
original temporary receipts are now absent. That absence supplies no native
settlement. A deterministic call through `run_study` reproduced the defect:
a retained reference study followed by loss of its synthetic temporary guard
allowed a successor to start 11 device-tool calls.

Before tool work, acquire a persistent research claim under
`~/Library/Application Support/jev-ios-bridge/native-owner/claims`, then the
existing Bridge-compatible temporary claim. Reuse `DeviceGuard` exclusive
creation, immutable provenance, file identity checks and uncertain-write rules.
`Configuration.ownership_root` permits isolated callers/tests. Both claims must
match before tools run. Settled cleanup releases temporary then persistent;
retained work keeps both. A fresh persistent claim may be released after a
busy temporary claim only when no tool work started. Existing or uncertain
persistent claims never authorize replacement. Record both claims in receipts.

Implementation and verification:

- [x] Add restart/temp-loss regression through the real study entry point; observe red.
- [x] Add stable claim root and paired acquisition/check/release with partial-failure accounting.
- [x] Isolate every test configuration, including reconciliation subprocesses.
- [x] Verify retained work blocks both plans, clean metadata releases both,
      pre-native refusal releases only owned claims, and replaced/malformed claims refuse.
- [x] Run host regressions and document evidence and limits.
- [x] Independent review (supervisor-owned).

This is no native fence and does not adopt or release historical ownership.
Do not inspect arbitrary archives, hardcode historical request IDs, install any
real claim, or perform device commands. Existing Bridge consumers still know
only the temporary claim. Manual removal of both stores defeats this exclusion;
this change does not assert tamper resistance or reboot settlement.

## Integrated parent-record correction

- [x] Reproduce parent metadata incorrectly consuming the 32-edge allowance.
- [x] Validate explicit root-factory, independent-root, comparison-method,
  native-comparison, edge and termination record shapes; count edge only.
- [x] Preserve the actual historical unphased edge shape and failure diagnostics.
- [x] Reject unknown/malformed phases and disguised edge fields.
- [x] Verify 32 actual edge observations with metadata accepted, 33 rejected;
  full host 125 tests pass. See `host-parent-review-fix.md`.
- [x] Supervisor/native worker verify actual native encoder boundary traces.
