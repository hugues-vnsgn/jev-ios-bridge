# Reconcile the registered metadata-only setup

Type: task
Status: resolved
Blocked by: none
Claimed by: reconciliation implementer

Implement section 2 of [the spec](../spec.md) using [the case](../approved-case.json).
Scope: new reconcile implementation/CLI/test/verification files. Preserve normal
study validation and original receipts. No live operations. Supervisor reviews,
integrates, performs the applicable joined steps, and lands.

## Answer

Separate pinned-case Interface implemented and landed. Inspection and one-use apply passed their fresh gates; original receipts stayed unchanged. Reboot later exposed dangling metadata, recorded separately; the consumed case cannot be replayed. See [evidence](../evidence/2026-10-07/report.md).
