# Ticket09 repair2 independent Standards: PASS

Exact candidate `d0c24bbbef7961a9377d6338fcff140e7373244e`; sole parent `08a985805cb442a2404eb9561ae92f69748ae5e0`. Commit/frozen/current association PASS: all10 scoped files and immutable copies match before/after; six paths changed in this child. Protected mapping is107 unchanged plus exactly one authorized producer delta. Tracked source remains clean.

## Findings

**Documented breaches: 0. Blocking heuristic findings: 0.** Applied code-review’s Standards axis, documented AGENTS/domain/glossary, ADR0002/0005/0007/0008/0009 and explicit repair ownership; tooling excluded.

**LOW, possible Duplicated Code** (`tests/fixtures/observed-host/early-cli.ts:25–41`): source/runner/window wrappers repeat result/error tracing. A shared serialization helper could reduce maintenance; preserve synchronous attempt recording before delegation. Nonblocking advisory; no unrelated refactor required.

The producer delta is solely synchronous trace('window') immediately before the identical assertion failure (`observed-cli-server.ts:76`); no hook, scheduling or lifecycle change. Early SIGTERM traces append/fsync real delegated attempts/results/errors and actual exit (`early-cli.ts:16–41`), retain original return/error behavior and leave termination to production. Parent teardown awaits the owned child before archiving and deleting isolated roots (`public-races.test.ts:154–163`). Complete-prefix comparisons preserve actual pre-barrier operations and allow only already-authorized creation/tap; they reject later presentation/cleanup/reads, including after owner exit (`public-races.test.ts:82–107`; `observed-crash.test.ts:119–140`). No copied lifecycle or manufactured replies.

## Evidence and limits

Independently hashed30765 archived regular files and25 symlinks without following targets; all match index. Parsed2560 trace files/60684 complete records with no malformed/incomplete traces; all84 corrected-case trace associations match. Matrix retains396 IDs and truthful source/command/verdict mappings.

Raw author logs support193/193 bounded tests on each runtime and1668/1668 actual full Node24 with typecheck/build. Both actual full Node26 attempts fail1667/1668 solely on the unchanged protected1100ms boot-poll oracle; typecheck passed, build was not reached. This is not a Standards breach or full26 PASS. Protected fixture repair is separate.

Original report/runner reviews remain unchanged; prior lost raw archives stay explicitly unavailable. No reviewer execution, store/device/key/network operation or product edit. Ticket09/H/live/native/Ticket12 acceptance remains unverified; independent Spec is separate.
