# 01 — Run a native observation with recorded ownership

Type: task
Status: resolved

Implement the host Interface and lifecycle in ../spec.md and the architecture
record. Own only spikes/native-owner/host/ and spikes/native-owner/README.md.
The schema/native environment contract is frozen. Test refusals, bounded parsing,
deadline retention, true child-process ownership and metadata-only cleanup at
run_study. Commit local work; supervisor reviews and lands. This ticket does not
accept a checked-UI production capability.

## Answer

Implemented in `spikes/native-owner/host/` and merged in
[PR 45](https://github.com/hugues-vnsgn/jev-ios-bridge/pull/45), source
`ea9bcdb1b834f039e9595523b19d49430522fa40`. All 33 host regressions pass
locally and in CI. Independent Standards and Spec reviews cleared the original
executable ownership gap after the fix.

The joined metadata run correctly refused the native target's numeric completion
flags and retained resources. The implementation and live limits are recorded
in [the evidence report](../evidence/2026-10-07/report.md). This resolution covers
the research host Module; it accepts no production guarantee.
