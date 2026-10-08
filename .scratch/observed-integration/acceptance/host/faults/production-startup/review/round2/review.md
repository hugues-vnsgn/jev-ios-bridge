# Supplemental H07 helper static re-review — BLOCKED

Reviewed source SHA256 `4cf3e442fc30071291dfa09e1caf15a30670f4b8d91e4ca5012cd57eb7d01a72`. Original source `ee824a1417b864a72fdf03fce3e7c02eb5848153eddbaef5e1750019df9433d3` and its findings remain intact. This is helper robustness review, not a host-matrix verdict.

All three original findings are resolved in the revised source: owned child/readline cleanup and raw close receipts precede failure publication; JSON parse callback errors reject pending RPCs; complete CLI stdout/stderr, MCP replies/summary and server stderr exclude the injected private exception. The fixed guarded Admission.open mapping and one-open-per-composition oracle remain appropriate. The guard denies authority access and SDK/driver/child effects; no production-root corruption is inferred.

**P2, remaining failure-preservation gap:** `launch` attaches child-process error handling but no error handler to `child.stdin`. An early child exit during `stdin.write`/`stdin.end` can emit EPIPE on that Writable separately from the child's error/close event. That unhandled event can bypass outer catch/finally, raw close publication and failure.json. Route stdin errors through pending rejection/controlled cleanup for both CLI and MCP children. This is an additional path of the original failure-preservation concern, not an unexecuted product failure claim.

No source edits, execution, tests/builds/stores/devices or secrets. Private source copies/diff/hashes only. Actual behavior after repair remains for Root's bounded probe; no ticket09/12/native/live PASS.
