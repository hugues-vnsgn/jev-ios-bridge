Spec review: BLOCKED — three findings on candidate c751a73df7931107af23619c350d2ca406ac55db, sole commit after dependency base 98f7de41baa316f47a65a7bc2160128a72051f3e.

1. P1 — Local cancellation is bypassed when its initial read fails (src/observed/service.ts:210). Admission decision:16 requires “A handle stops accepting commands synchronously when cancellation/finalization starts.” cancel() awaits inspect before reaching local revocation. Reproduction: pending fake capture; temporarily move the isolated SQLite file; cancel returns STORE_UNAVAILABLE; restore it and release the capture. The candidate dispatches touch and another capture, commits outcome_observed, and reports cancellationRequested:false. Revoke the owned job even when initial inspection fails. Evidence: probes.test.ts / probes.log, first case.

2. P2 — Finalization consumes the expired action deadline (src/observed/service.ts:163). Public contract:30 says “local finalization has a separate 5000ms budget.” A capture establishes already_satisfied in 58ms under a 500ms action timeout; confirmed local close finishes at 740ms, within finalization’s budget. The candidate nevertheless commits inconclusive/DEADLINE_EXCEEDED because it rechecks the expired action signal after close. Separate completed execution from finalization timing while preserving explicit cancellation. Evidence: probes.test.ts / probes.log, second case.

3. P2 — Host creation errors omit the retained creator’s evidence location (src/observed/service.ts:88–92). Public contract:103 says the creation-unresolved reason “points to its allocation evidence”; allocation contract:105 requires “allocation ID and evidence.” A real isolated unknown-create reservation with persisted /isolated/blocker-evidence blocks a separate ready action. The returned error includes blockingAllocationId but no evidenceDirectory. Return the blocking allocation’s authoritative persisted directory; do not substitute the requested action’s directory. Evidence: host-guard.test.ts / host-guard.log.

No additional scope finding: migration edits replace fixture construction while preserving all 43 cases/assertions. Review concerns the pinned original candidate; subsequently authorized owner repairs are not evaluated here.

Checks/evidence appendix

- Read final logs: focused 126/126 on Node26.8.1 and exact24.0.0; full check1258/1258 plus typecheck/build; coverage98.77% lines/90.32% branches; zero skips. These suites missed the reproduced boundaries.
- Independently ran only three bounded fake-backed cases (all failed as reported), child umask0022/evidence0077. No large suite or live/production operation.
- Matched all15 pinned source/test SHA256 values to final-source.json (manifest-audit.json). Pinned diff check passed.
- Read original125/126 Node24 warning failure, reconstructed pre-warning manifest provenance, fixture correspondence, and separate final reruns. Original manifest was reconstructed, not immutably preserved.
- Enabled spike production-store composition, downstream adapters/allocation integration, packaging and live acceptance remain outside this review’s execution evidence. Historical real-backend incident remains UNVERIFIED.
