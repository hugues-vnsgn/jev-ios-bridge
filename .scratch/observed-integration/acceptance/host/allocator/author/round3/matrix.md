# Round3 active-preparation retirement matrix

Exact final-source.json. Root clarification459dafc252c5c43e4674d8f8265f8427b75c601b; accepted allocation-contract:103 and public-contract:79. Round2 six-file snapshot and556/147/1355 gates remain unchanged in ../review-repair; round2 acceptance is BLOCKED by the preserved new P2. Extends ../review-repair/matrix.md and ../matrix.md.

| Boundary | Strict assertion | Evidence |
| --- | --- | --- |
| Healthy pending boot, retire lowercase allocation ID | ALLOCATION_BUSY, verified IDs/state preparing/absolute stored directory; preparation-active message names allocation cancellation commands, no executing/action cancellation claim | red-retire-preparing.log genuine1failure; green-retire-preparing.log valid case |
| Read unavailable/missing, wrong allocation ID, retained state, invalid action ID, relative evidence | Safe STORE_UNAVAILABLE/unknown; no invented action/state/directory/raw vendor leakage; pending preparation still completes | Six pending-boot negative authority cases |
| Pure retirement | SQLite bytes and full durable record unchanged, cancellationRequested remains false, zero commands at retirement; release same pending boot permits original allocation ready/prepared with exact once-only sequence | All seven pending-boot cases |
| Cancel remains executing-only for busy enrichment | Fabricated preparing state on existing executing action cannot broaden busy cancellation context; safe STORE_UNAVAILABLE; exact bytes/backend calls unchanged | busy preparing-state case plus original six unsafe contexts |
| Executing lifecycle | Both cancel/retire retain actual executing state/action/evidence and explicit action cancellation commands | Original two valid busy cases |
| Independent unchanged boundaries | New original preparing-retire probe and all five prior probes run unmodified on both Node26.8.1 and exact24.0.0 | original-probes-node26.log/original-probes-node24.log,6/6 each,0skips |

No backend/store authority or phase budgets changed. Only allocation.ts, allocation-schema.ts and observed-allocation.test.ts source changed versus round2. Other three source/test files match the previous map. All fixtures are isolated Admission.forTesting with explicit CURRENT fake runner/opener/source/host metadata; no live backend, device, app, key or production-store use.
