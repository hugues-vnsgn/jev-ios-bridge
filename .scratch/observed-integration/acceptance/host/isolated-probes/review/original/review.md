# Root isolated probe runner static review: BLOCKED

Exact source SHA256 `cade6d237a99c0e871083006c1e07fbaf14a5c4e01c6f2911239d45899918d10`. Static review only; no runner/runtime/pack/build/store/device command executed. Original source is preserved as runner.py.

## Findings

1. **P2 — Owned child cleanup and failure receipts are incomplete** (`root-isolated-probe-runner.py:65–74`). The child starts a new session, but only TimeoutExpired triggers kill/reap. KeyboardInterrupt or another exception during wait exits the wrapper without closing the owned process group or writing result.json. Default SIGTERM also bypasses that cleanup. A child in its new session can continue after its wrapper ends, violating bounded owned-child execution. Additionally, an exit between timeout and killpg can raise ProcessLookupError and bypass reap/result publication. Guarantee cleanup on handled interruption/error, target only the owned group, tolerate already-exited races, await the owned child and publish truthful raw/exit/failure receipts. This is a source finding, not an executed failure claim.

2. **P2 — Evidence label escapes the intended vault** (`:15,21–22`). Path joining accepts absolute and parent-relative labels. For example, an absolute --label selects that absolute destination instead of root-isolated-probes; ../ similarly leaves the intended vault. exist_ok=False protects an existing final directory but does not enforce ownership/location. Require a single nonempty path component before creating any directory.

## Checked behavior

Tarball mode sets a new nonexistent cache, retries0, fetch45000ms, ignore-scripts and a90s command budget; it remains diagnostic and does not alter the original proof workflow. Startup mode requires matching runtime/PASS summary and exact helper/guard hashes, then invokes the unchanged helper. Main child environment removes all three named variables, pins Node PATH, uses child0022 within private0077 evidence. The launch receipt records source/runner/helper hashes before Popen; normal/timeout completion records after hashes and raw output hashes. These are useful contemporaneous fields, but do not compensate for the exceptional cleanup paths.

No earlier source/proof/static review was modified. Fixes require a new reviewed SHA; current source is not cleared for execution by this review. No Ticket09/12/native/live acceptance follows.
