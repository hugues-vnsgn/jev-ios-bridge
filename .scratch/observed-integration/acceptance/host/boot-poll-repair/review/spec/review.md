# Boot polling fixture Spec: PASS

Candidate `6610b1363850a2cd019c508f1170a0fe1edec8ec`; exact parent `33cf39373353d3dd0137be20a172af0bd4059c5e`. No findings in the authorized single-test repair.

`tests/observed-allocation.test.ts:388–405` preserves bootTimeoutMs1100, exactly two polls, interval≥1000ms, exactly one boot and zero install. It adds explicit no-second-poll at999ms and second-poll at1000ms, then advances the real production stage timer to1100ms. No alternate abort or fabricated allocator result is introduced. Awaited first/second call barriers and setImmediate turns let the settled fake command schedule its real polling delay. The15s test timeout bounds fixture hangs; it does not change the product boot budget.

Timer mocks are test-local and reset in finally before allocator close/fixture cleanup. Adjacent tests, backend fixture, production source, goldens and default parallelism are unchanged. This faithfully tests allocation-contract:72/105 (bounded preparation/Booted before install) and the accepted cadence at allocation.ts:219–221; the existing stage-abort implementation remains at:111–118.

Original/corrected files match parent/candidate/current/frozen copies before/after. Corrected SHA256: `77afc9f5ab9f06435c72e34eb6b3e431a9b563905a6cd0609405205a73cafcad`. One test path plus15 scoped evidence files comprise the commit; no product source delta.

Read preserved controlled150ms latency negatives: both26.8.1/exact24.0.0 fail the original exact-two oracle with actual1, one boot and no install, unchanged source hashes. Corrected focused logs show1/1 on each runtime, zero skips. These are Root executions; none were run by this reviewer.

Full composed gates were pending in reviewed evidence. This PASS covers fixture validity and exact source association only; it does not accept ticket09, H rows, live results or ticket12. Earlier failed full gates remain failures, not replaced by focused selection.
