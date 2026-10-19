# Admission write-cost baseline

P2.1 measures the existing trunk admission implementation. Two recorded runs are usable, and the third is unusable because it exceeds 60 seconds. The three-run series does not pass the performance gate. It makes no speedup claim.

## Machine and revision

- Date: 2026-10-19.
- Machine: Mac mini, Mac16,11, Apple M4 Pro, 12 CPU cores, 24 GB RAM.
- OS: macOS 27.0.1, build 26A434.
- Storage: internal solid-state storage, APFS, Apple Fabric protocol.
- Runtime: Node v26.8.1, npm 11.19.0, tsx 4.23.15.
- Trunk implementation: `cffd950236cf6d23d832b4f108102d056856ec88`.
- Benchmark: `spikes/benchmarks/perf/admission-writes.ts`, added by this PR. No production source changed.

## What the measurements include

Each invocation creates and retains a fresh private directory under the canonical OS temporary directory. It prints that directory before initialization. It never accepts an existing store path. Successive invocations therefore use different stores, including after a killed run.

`Admission.forTesting` initializes an on-disk fake store. The bench acquires one synthetic device owner and calls `bindDriver('fake')`. It then awaits 1,000 sequential `capture` dispatches with inert callbacks. No device, Jev request, production store, in-memory SQLite database, or batch transaction participates.

The source's existing `AdmissionSqlite.configure` requires DELETE journal mode and sets `synchronous=EXTRA` and `fullfsync=ON`. The bench leaves those settings unchanged.

- Dispatch-to-callback measures from immediately before `dispatch` to callback entry. It includes the complete authorization transaction, including connection open, validation, journal commit, and close. It is not an isolated COMMIT or fsync measurement.
- Whole-dispatch measures from the same start until the awaited dispatch resolves. It includes authorization and settlement, which are two separate durable write transactions.
- Initialization, acquisition, attachment, finalization, reopening, row verification, and summary output are outside timing. No timed command is discarded as warmup.

The clock is `performance.now()`. Percentiles use nearest rank, `ceil(p * n)`, on sorted samples. Units are milliseconds. Each run starts with no command rows and ends with 1,000 command rows, all settled. After timing, the bench finalizes the owner, reopens admission without initialization, opens a separate read-only SQLite connection, checks counts and integrity, and verifies DELETE journal mode.

## Recorded runs

The recorded series runs this command three times serially, with `TYPESAFE_API_KEY` unset. This owner launches no compiler, test suite, or other benchmark alongside the series.

```sh
env -u TYPESAFE_API_KEY npm exec -- tsx spikes/benchmarks/perf/admission-writes.ts --commands 1000
```

The series began after the repository checks finished. Each row below describes 1,000 measured dispatches.

| Run | Latency | p50 ms | p95 ms | Max ms |
| --- | --- | ---: | ---: | ---: |
| 1 | Dispatch-to-callback | 14.022 | 18.959 | 242.151 |
| 1 | Whole-dispatch | 28.320 | 36.903 | 460.451 |
| 2 | Dispatch-to-callback | 13.990 | 19.425 | 245.929 |
| 2 | Whole-dispatch | 28.361 | 37.699 | 421.549 |
| 3, unusable | Dispatch-to-callback | 56.358 | 99.873 | 823.917 |
| 3, unusable | Whole-dispatch | 113.592 | 180.962 | 911.459 |

| Run | Callbacks | Command rows | Settled rows | Dispatch successes | Dispatch failures | Measured loop seconds | Process wall seconds | Usable |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 1000 | 1000 | 1000 | 1000 | 0 | 30.220 | 30.601 | Yes |
| 2 | 1000 | 1000 | 1000 | 1000 | 0 | 30.888 | 31.274 | Yes |
| 3 | 1000 | 1000 | 1000 | 1000 | 0 | 107.984 | 108.430 | No |

All stores reopened with SQLite integrity `ok` and DELETE journal mode. Their directory suffixes are `QmhC1x`, `7UpzJZ`, and `bfEL2l`, under the printed `admission-writes-` temporary-store prefix. Complete outputs are `baseline-run-1.txt` through `baseline-run-3.txt` in `/tmp/jev-p2-1-evidence`.

One-minute load averages at the starts were 7.83, 6.58, and 5.06 on 12 CPU cores. Earlier exploratory runs and the separate profile are excluded from this table. One exploratory run overlapped a scoped TypeScript check.

Run 3 printed its completed row counts and distributions, then exited 1 with `measurement unusable: 1,000 commands took 60 seconds or longer`. A one-second host stack sample was captured after that run had already crossed 60 seconds. Its distributions are retained for diagnosis only, including that sampling overhead. There is no accepted three-run baseline until the root resolves or remeasures this open performance gate.

The desktop remains active, so this is a same-machine baseline rather than an idle-machine storage limit. No other user's process or device service is stopped.

## Limiter evidence and limits

A separate, excluded 100-command profile used `node --cpu-prof` and `/usr/bin/time -lp`. It completed in 2.91 seconds wall time with 0.22 seconds user CPU and 0.15 seconds system CPU. Inclusive profile samples attributed 2,744.922 ms to `AdmissionSqlite.write`, including 1,346.404 ms under authorization and 1,359.020 ms under settlement.

These observations point to native SQLite writes and waiting in the durable transaction path as the limiter. The profile does not isolate individual fsync calls. Its latency distributions are excluded from the baseline table. The later host sample of unusable run 3 shows `sqlite3_exec` through `vdbeCommit`, `syncJournal`, `unixSync`, and `fcntl`. This identifies the waiting path but does not establish why the host's storage latency changed. Raw profiling, the host sample, and run transcripts are in `/tmp/jev-p2-1-evidence` on the measuring Mac.

This bench measures admission overhead with no backend latency. It does not measure end-to-end device operations, contention between owners, or the future schema and component-inventory writes. Later packages must remeasure both revisions on the same machine. P2.1's usability rule is a 1,000-command run under 60 seconds. The later P2.6 and P2.9 rules also impose a 20 ms authorization p95 ceiling.

## Verification

```sh
npm exec -- tsx spikes/benchmarks/perf/admission-writes.ts --self-test
npm exec -- tsx spikes/benchmarks/perf/admission-writes.ts --commands 10
npm run typecheck
npm run check
```

The four self-tests cover literal nearest-rank distributions, a singleton and empty input, mismatched settled-row counts, the ten-command CLI path, and zero-command refusal before store creation. TDD first observed the missing count assertion fail, then pass after adding it. The ten-command CLI test likewise failed before the timed path existed and passed after implementation. A count mismatch uses the same assertion invoked against the reopened database.

The benchmark also passed a separate strict TypeScript check, because the repository's `tsconfig.json` does not include `spikes/benchmarks/perf`.

```sh
npm exec -- tsc --noEmit --ignoreConfig --target ES2023 --module NodeNext --moduleResolution NodeNext --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --esModuleInterop --skipLibCheck --types node spikes/benchmarks/perf/admission-writes.ts
```

The initial repository check passed 2,361 of 2,363 tests. Two public-core regressions failed because this fresh worktree lacked the pinned `appium-mcp` dependency. Installing the existing candidate-stack lockfile with `npm ci --ignore-scripts --no-audit --no-fund` fixed that environment prerequisite. A focused rerun passed both tests. No tracked dependency file changed.

The single full-check retry passed all 2,363 tests with zero failures and built successfully. The standalone `npm run typecheck` passed. The bench's four self-tests passed. The separate `--commands 10` run printed 10 callbacks and 10 settled rows, with 10 successes and zero failures.

The root owns the independent live lanes and exact-head verdict. This note does not claim those lanes have run.
