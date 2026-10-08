# Ticket09 final Spec: BLOCKED

Candidate `08a985805cb442a2404eb9561ae92f69748ae5e0`; sole parent `75d7618167729b9b9a5547eaa468e37eb12b2504`. Fresh commit/current/frozen checks match all nine allowed files and108 protected base files. The six original findings remain closed. Two P2 regression-oracle findings remain:

1. **Incomplete cancellation/late-reply dispatch assertions.** `tests/observed-public-races.test.ts:55–67,82–84` checks selected forbidden names; launch/readiness rows forbid only touch. Counterexample: a subsequent list/snapshot-ui/screenshot plus the same cancelled terminal passes. H05.02:98–101, H05.03:116–118, H05.06:169–171 and `tests/observed-crash.test.ts:118–120,131–134` similarly omit non-input successors. Admission-decision:149 requires “revokes future command issuance”;:151 forbids “app stop or further device commands as cleanup”; public-contract:77 denies later authorization. The oracle must cover the complete call sequence with only explicitly already-authorized work allowed. This is a test weakness, not a confirmed product defect.

2. **Early SIGTERM call evidence is stale.** `tests/fixtures/observed-host/early-cli.ts:14–16` snapshots calls before its barrier; the next refresh (:34) follows runCli. Production signal handling exits at `src/cli.ts:132`, preventing that refresh. `tests/observed-public-races.test.ts:159` therefore accepts the old snapshot even if later device calls occurred. Counterexample: saved calls=['plist'], actual calls later append boot, process exits143; the assertion still passes. Same dispatch clauses and validation-matrix:56 require zero forbidden effects. Retain actual dispatch evidence through exit.

Preserved original logs were reread:193/193 added and1668/1668 default full check per Node26.8.1/exact24.0.0, typecheck/build passed, zero skips. No reviewer execution.396 inventory IDs remain distinct from193 executed tests.

**Evidence loss:**3176 indexed raw files and the previous private final audit were cleared from /tmp. Earlier messages report48 conforming H05.01 traces; that audit is unavailable and is not recertified. Surviving indexes/logs/source support fresh metadata association, not recreated raw proof. Original partial JSONL bytes were already unavailable.

Startup-wrapper parity, injected SQLITE_FULL, isolated migration and no-live/native/ticket12 limits remain. No additional source defect or scope creep found in the completed static review.
