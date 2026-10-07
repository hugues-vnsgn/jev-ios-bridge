# Bind metadata and reference studies to their declared identities

Type: task
Status: resolved
Blocked by: none

Implement the [spec](../spec.md). Supervisor delegates code to `implementer`,
owns integration, review, builds, live operations, evidence and publication.
The source-bound Interface design is in
[the research note](../../native-owner-recovery/research/independent-study-identity.md).

Acceptance: both declared profiles are bound across build, host, runtime and
fixture telemetry; unsafe mismatches refuse through the public study Interface;
legacy case/diagnostic retain original IDs and contracts; meaningful regressions
pass; no production capability is enabled. Actual device evidence is a separate
supervisor-owned step under the spec.

## Answer

Merged [PR 50](https://github.com/hugues-vnsgn/jev-ios-bridge/pull/50) at
`61ddbbb5125a7de851d71df3a6a30a0b516d6803` after independent Standards/Spec
reviews, package CI, 107 host tests, 27 native policy tests, two historical
caller tests and both actual generic builds. The declared profiles agree
across build, host, native identity and fixture telemetry; unsafe mismatch
regressions pass. Historical identity and consumed-case contracts are preserved.

The supervisor executed both studies. Metadata completed and restored its
device/guard. Reference failed at its first native point lookup and retained
ownership; reference acquisition, parent and replacement checks are unrun.
The [source-bound report](../evidence/2026-10-07/report.md) preserves the failure
and ownership facts. Code acceptance does not accept any production capability.
