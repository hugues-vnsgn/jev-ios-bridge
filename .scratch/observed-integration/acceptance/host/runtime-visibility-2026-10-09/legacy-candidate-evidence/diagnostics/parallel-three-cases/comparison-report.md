# Bounded comparative diagnosis

The accepted baseline (Source441) and frozen candidate 4fa9cc99 (Source443) each ran exactly four concurrent Node24.0.0 repetitions of the same anchored three-case invocation. Baseline roots all closed before candidate roots started. Both cohorts passed 12/12 selected cases; all eight command roots closed naturally with exit0.

| Whole-case time, ms | Baseline median / max | Candidate median / max |
| --- | --- | --- |
| Metadata cancellation | 150.811 / 455.833 | 354.439 / 437.952 |
| H06.03 CLI beforeCommit | 10613.612 / 10739.178 | 11921.258 / 11972.046 |
| H05.01 MCP durable cancel | 7691.659 / 8388.952 | 10175.234 / 10540.963 |

Sixteen fresh public/backend archive pairs retain complete calls, milestones and 48 natural-close command receipts. Every H06 trace contains one touch and the beforeCommit finalization fault; every H05 trace reaches backend:snapshot-ui:1 with no touch. No forbidden-network milestone or signaled command child was observed.

Baseline Source441, candidate Source443/protected440 and both compiled69 vectors stayed unchanged. Prior 481+79 immutable files and both evidence seals rehashed unchanged. Exact Node/options, the three test files, test/fixture/harness bytes, original timeouts/assertions, concurrency and minimal environment strategy were preserved. Different checkout and private archive paths are recorded per run. No further invocation, default retry or Source repair occurred.

No failure was reproduced. Candidate whole-case medians were higher in this one ordered comparison; preparation and milestone-stage costs were not separately measured. This result cannot establish original causation or prove that the new boundary causes a delay. The original failed Node24 default remains authoritative. Its removed raw public fault trees lacked HOST_EVIDENCE_DIR and cannot be reconstructed; the retained archives here are fresh comparison evidence.

Author is idle pending Root's next decision.
