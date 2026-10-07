# Hold device exclusion through restoration and retention

Type: task
Status: resolved
Blocked by: none
Claimed by: device-guard implementer

Implement Device-wide exclusion in [the spec](../spec.md). Own the new guard,
tests and verification file only. The supervisor integrates both callers after
their commits. Prove compatibility with the real Bridge lease consumer using
temporary files and harmless processes; no device execution or process kill.

## Answer

Bridge-compatible unknown-owner claim implemented, integrated and landed. Actual TypeScript consumer and frontend-exit tests pass. Live calls settled and released matching claims after verified restoration; no native-settlement guarantee was accepted. See [evidence](../evidence/2026-10-07/report.md).
