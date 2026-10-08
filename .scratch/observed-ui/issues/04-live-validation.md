# Validate the observed action on a dedicated simulator

Status: resolved
Type: task
Blocked by: 01, 02, 03

Use an independently provisioned dedicated simulator and an unmodified fixture.
Record the real backend command trace, before/after screenshots and durable journal.
Prove ordinary navigation (one bridge tap), already-satisfied (zero taps), and a
lost reply (no successor input admitted). Do not use mock results as native evidence.
Do not reuse the historical unresolved native-study device or delete its claims.
The current study's device allocation names only that retained device; a fresh
allocation is required before a live run. No provider extension is needed.

## Answer

Live cases passed after replacing experimental semantic tap with one vendor touch
down/up request. Ordinary navigation used one input command; already satisfied
used zero; controlled host response loss retained quarantine and a fresh process
issued zero backend commands. See [live report](../live/report.md) and
[integration verification](../integration/verification.md) for exact limits.
