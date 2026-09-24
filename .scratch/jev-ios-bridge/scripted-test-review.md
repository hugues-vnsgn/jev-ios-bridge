# Scripted prototype test review

**Verdict: UNVERIFIED for release.** The prototype passes its scripted checks; fresh assertion evaluation and real scripted integration remain pending. Oracle: [the preregistered protocol](scripted-evaluation-plan.md).

The coding agents ran `npm run check`: type checking, all **127 tests with zero skips**, and build passed. The assertion/schema/harness group has 13 focused tests; the selector/runner/report group has 21. The existing 93 tests remain green.

| Behavior | Evidence | Result |
| --- | --- | --- |
| Strict script and paired-corpus schema | Schema tests reject invalid shapes, value references, claim IDs and unbalanced labels | PASS |
| Noul-only request and response validation | Adapter tests exclude Choice, completion, oracle metadata and unexpected answers | PASS |
| Frozen source, manifest, approval and asset chain | Harness tests cover hash changes, raw-to-normalized capture integrity and budgets | PASS |
| Physical-target uniqueness | Runner tests cover overlapping aliases, distant duplicates, missing/disabled/offscreen targets and absent metadata | PASS |
| Fresh selection and guard enforcement | Stale references reobserve; changed or ambiguous screens stop without guessed actions | PASS |
| Global limits and cancellation | Lazy dispatch, noncooperative ports, acknowledgement fencing and cleanup tests | PASS |
| Bounded waits | Unexpected intermediate screens stop; wait and global limits stay bounded | PASS |
| False and uncertain claims | Scripted judgment tests yield failed and inconclusive outcomes respectively | PASS |
| Evidence and replay | Wrong-screen captures, assertion text, observed totals, artifact references and interrupted journals | PASS |
| Live assertion accuracy | 24 fresh paired-claim cases still being prepared; owner review precedes querying | UNVERIFIED |
| Live scripted execution and installed host | Runs follow only if assertion feasibility passes | UNVERIFIED |

The reviewer reproduced lifecycle defects before fixing them: pre-aborted dispatch, a dependency ignoring the wall deadline, loss of the wrong-screen capture, and polling through an unexpected screen. The unchanged regression assertions passed after fixes. The report-only diagnosis gap also has a regression that requires the false expected-total claim and actual observed total in the same report.

One integrated check first failed on an optional test-fixture field type. Correcting that fixture type restored type checking; no test assertions were weakened or skipped. No model or simulator calls were made by the test agents. Corpus captures are separate real-device evidence, not live Jev results.
