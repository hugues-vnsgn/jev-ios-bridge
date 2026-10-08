# Root isolated probe runner static re-review: BLOCKED

Exact source SHA256 `a5f1ba157cb6377e5e0a7bd21b811e79c43e74b9d6e0c3ec50b3275c1ceda6c7`. All prior reports/snapshots remain unchanged; no execution or source edits.

## Closure

The one-component label, ordinary timeout/error cleanup, ProcessLookupError handling and spawn/handle publication findings remain closed. Repeated-signal suppression is now closed (`:73–79`): once received_signal exists, any subsequent signal returns instead of raising. This protects entry into finally after a signal-triggered interruption.

## Remaining finding

**P2 — First signal during non-signal cleanup entry can still bypass cleanup** (`:95–105`). When finally is entered due to TimeoutExpired or another non-signal error, received_signal remains None. Until each SIG_IGN handler is installed, a first SIGINT/SIGTERM invokes the old handler, which raises out of finally. Owned kill/reap and result publication are then skipped. Returning for repeated signals does not protect this separate first-signal path.

Deferring first signals throughout cleanup is required as well. A record-only signal handler and bounded polling wait would avoid asynchronous exceptions escaping cleanup and preserve prompt cancellation checks; other designs may also guarantee ownership and receipts. This is static control-flow evidence, not an executed reproduction or product defect.

No other new concrete blocker identified in the reviewed delta. Exact helper/guard checks, sanitized main-child environment, private evidence, finite budgets and contemporaneous receipts retain their intended scope. SIGKILL and unavailable evidence storage remain unavoidable proof limitations. This review does not certify Ticket09/12/native/live acceptance.
