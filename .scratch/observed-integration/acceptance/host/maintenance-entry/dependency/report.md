# Audited dependency advance

Root accepted maintenance dependency tree `2c6c41845e9db05de451d7b10d1674fc9136b891` and its preserved evidence at `75d7618167729b9b9a5547eaa468e37eb12b2504`. Both workers were paused/frozen before their fast-forward from `d0f49f6c12cbaffb4c034217b7e25b96c52c6cb2` to that exact acceptance base.

| Worker | Preserved files | Audit |
| --- | --- | --- |
| 10 installed workflow | 11 frozen guide/test/fixture/CI paths plus own issue metadata | [Before](10/before.json), [after](10/after.json), [actual git output](10/advance.log) |
| 09 host faults | 9 frozen test/fixture/matrix/own issue paths | [Before](09/before.json), [after](09/after.json), [actual git output](09/advance.log) |

Incoming paths are disjoint from each owned set. Every owned file matches its original private freeze and Root's before-copy afterward; each owned binary diff remains identical. Original source/issues/status snapshots are preserved. The incoming maintenance and report-fixture dependency changes require explicit new-base provenance; they are not described as unchanged old protected source.

Ticket10 has the sole heavy window for both original mandatory clean packed-install/plugin proofs, final source freeze and final checks. The help assertion, proof harness and install requirements are unchanged; fresh evidence directories preserve the old failures. Ticket09 verifies the new base/provenance and remains queued until Root grants its window. Both implementation candidates still require exact-source independent reviews and Root integration; no whole host or live acceptance is inferred.
