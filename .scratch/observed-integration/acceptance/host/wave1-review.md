# First-wave independent review

2026-10-08. Planning base `b8c4a50942551bdf95d00036a6d2f7bb6142ff43`. Admission candidate `03fcbe43332fea1272570dd9224808079d0329b3`; adapter candidate `d5a5a8de63470baff388268957e21b5f2dc80c3e`. These candidates are not integrated or accepted. All reproductions used temporary stores/files and fake effects; no devices were operated.

## Standards

Reviewer: `wave1_standards`, gpt-6.1-sol/high, code-review skill. No actionable admission standards findings.

- **P2, artifact cleanup:** `src/observed/artifact.ts:199` opens the input before opening output, but begins cleanup only after both opens. Injected output-open ENOSPC leaves one input FileHandle open. Start cleanup immediately after input opens; independently attempt both closes. Add a regression.
- Ticket metadata scope concern is resolved by Root: `Execution` and `Claimed by` were explicitly authorized at dispatch. No outstanding scope violation.
- Simplify was unavailable and was not invoked. Independent maintainability review covered the code instead.

Standards/maintainability: one confirmed resource-management defect, P2; no documented-standard breach.

## Spec

Reviewers: `core_spec_review` and `adapters_spec_review`, gpt-6-astra/high, code-review skill.

- **P1, cancellation persistence:** `src/device/admission.ts:98–101` closes issuance but does not retain cancellation if its transaction fails before COMMIT. Signal abort catches the storage failure; a late outstanding tap settles and finalization can commit observed/available. Latch cancellation before storage access and preserve its disposition through late settlement. Required regression includes signal-driven cancellation, failed persistence and late completion. Temporary reproduction output: `cancel-write-failure {"authority":"committed","disposition":"available","cancellationRequested":false}`.
- **P2, journal permissions:** `src/device/admission-sqlite.ts:71–75` accepts a preexisting rollback journal with mode0644, which SQLite then consumes. Validate sidecar ownership/type/permissions before opening SQLite; unsafe files must remain untouched. Cover symlinks and newly created journal mode0600. Temporary reproduction output: `unsafe-journal {"permissions":"644","acquisition":"acquired"}`.
- **P2, artifact descriptor verification:** `src/observed/artifact.ts:55` checks immutable metadata via lstat, then hashes a separately opened descriptor without binding the two stats. Changing staged Info.plist0400→0600 inside injected open makes verification succeed on a writable file. Validate immutable metadata on the descriptor being hashed and bind it to the checked stat. Add a regression.
- **Evidence correction:** historical adapter red logs for immutable staging and source mutation contain cleanup EACCES failures, masking the intended assertions. They do not establish the claimed behavioral reds. Correct the report without rewriting raw history; any new reproduction must be labeled accurately. Metadata-abort red demonstrates its timeout as claimed.

Spec: three confirmed defects, worst P1, plus one test-evidence correction.

## Verification and disposition

Reviewers independently reran admission30/30 and adapters38/38 targeted tests. Passing suites did not cover the reproduced defects. Their inspection confirmed reported minimum-runtime/typecheck logs. Earlier full checks predate final refinements and do not establish final combined acceptance.

Root returned the findings to each original author for diagnosing-bugs, TDD and do-test in parallel. Re-review and combined checks are required before integration acceptance. Migration remains dependent on accepted admission core; read-only migration preparation is allowed meanwhile.

## Resolution

Core repair `aa4c652de8234e16de0132af7536ee7e850a4060` and adapter repair `717b902184c818cc99832baa7dee0acfc1b910cd` were independently re-reviewed: all four findings resolved. Core reviewer independently passed16 focused assertions; adapter reviewer independently passed41 tests and typecheck. Genuine red/green pairs were inspected; corrected historical evidence explicitly retains its limitation. [Archived report/logs](wave1/) preserve the raw bytes.

Root integrated core as `2e0e3a0`/`9911710` and adapters as `b557e9d`/`448a026`. At combined `448a026`, `npm run check` exited0:1048 tests passed, zero skips, typecheck/build passed. Node24.0.0 `--import tsx --test tests/admission-core.test.ts tests/observed-artifact.test.ts tests/observed-sources.test.ts` exited0:83 tests passed, zero skips. These checks accept bounded tickets01/04, not the deferred public/live workflow. Ticket02 was dispatched from `8d8c5a0`, containing accepted core plus migration guidance; it has no adapter dependency.
