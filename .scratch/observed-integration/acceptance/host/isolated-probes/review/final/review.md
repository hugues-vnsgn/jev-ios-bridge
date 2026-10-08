# Root isolated probe runner static closure: PASS

Exact source SHA256 `42dedbf1e6936f6942794b88f1af2bffedd9ca95de3f67f46a8c80458beb8ab1`. Frozen snapshot and current source match before/after. All four previous BLOCKED reports and snapshots remain unchanged. Static source review only; no runner/runtime/pack/build/store/device command executed.

## Closure

All reported findings are closed. The one-component label is validated before directory creation (`:19–25`), preserving unique no-overwrite evidence destinations. The record-only SIGINT/SIGTERM handler cannot raise during spawn, handle publication or cleanup (`:72–78`). The bounded wait loop checks recorded interruption at most once per0.25s while waiting, and raises only inside the protected try (`:79–97`). The actual Popen handle exists before that loop; first or repeated signals cannot escape finally’s handler-installation transition.

Timeout/interruption/error cleanup kills only the owned new-session process group, tolerates ProcessLookupError, waits up to5s for the owned leader and records cleanup errors/unknown settlement (`:98–135`). Normal leader settlement is recorded directly. Source/runner/helper before/after hashes, raw output hashes, actual child exit/signal, timeout and received signal remain distinct receipt fields. Handler restoration follows receipt publication.

Tarball mode remains a90s diagnostic of the exact pinned package with a fresh cache, retries0, fetch45s and ignored scripts. Startup mode wraps the unchanged reviewed helper only after matching runtime/PASS proof summary and exact helper/guard checks. Main-child environment removes the three named variables, pins runtime PATH, and uses0022 inside private0077 evidence. The runner does not substitute a lifecycle or manufacture replies.

## Limits

This PASS closes static source findings; it does not prove executed timing/cleanup, network behavior or startup outcomes. Reap failures remain explicit unknown/error receipts rather than proof of settlement. SIGKILL, OS scheduling and unavailable evidence storage cannot guarantee a receipt. Preflight version/git/hash reads precede the launched-command budget. Matching proof summary alone is not independent clean-install verification; the helper validates installed file hashes, and separate genuine install/raw/source audits remain required. No Ticket09/12/native/live acceptance follows.
