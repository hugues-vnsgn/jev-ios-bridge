# Root isolated probe runner static re-review: BLOCKED

Exact repaired source SHA256 `394148695b4470796069ff69d80b2d771b70ab690975d341aa96e09b3cc4c208`. Original cade6d23 report/source remain unchanged. No execution or source edits.

## Original findings

- Label isolation is closed (`:19–25`): the anchored one-component regex excludes absolute/parent-relative paths before directory creation; existing labels still fail without overwrite.
- Timeout/ordinary wait-error cleanup is closed (`:83–124`): exceptions enter finally, repeat interrupts are ignored during bounded owned-group kill/reap and receipt publication; ProcessLookupError is tolerated, cleanup failures and unknown exit are recorded, previous handlers are restored.

## Remaining finding

**P2 — Signal can interrupt spawn before the owned handle is published** (`:67,72–81,93–103`). The handler immediately raises InterruptedError. Signals are already handled this way during the right-hand-side Popen call. If SIGINT/SIGTERM arrives after Popen has created the new-session process but before the returned object is assigned to child, control enters except/finally with child still None. The cleanup condition excludes it, so the owned group may continue untracked and the receipt omits its actual exit. This is the same bounded ownership requirement at the spawn boundary, not an executed failure claim.

Defer raising during spawn/handle publication: record the signal until the owned handle exists, then enter the same cleanup path, or block/defer SIGINT/SIGTERM across that critical section. Preserve truthful failure/unknown receipts and kill/reap only this owned group.

No further concrete blocker found in the reviewed changed paths. Exact helper/guard checks, private evidence/child umasks, sanitized main-child environment, new cache/finite pack budget and before/after source receipt design remain intact. This static BLOCKED verdict does not assess Ticket09 or live/native acceptance.
