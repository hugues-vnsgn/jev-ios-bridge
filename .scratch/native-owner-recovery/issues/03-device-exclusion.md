# 03 — Hold device exclusion through restoration and retention

Type: task
Status: claimed
Claimed by: device-guard implementer

Implement Device-wide exclusion in [the spec](../spec.md). Own the new guard,
tests and verification file only. The supervisor integrates both callers after
their commits. Prove compatibility with the real Bridge lease consumer using
temporary files and harmless processes; no device execution or process kill.
