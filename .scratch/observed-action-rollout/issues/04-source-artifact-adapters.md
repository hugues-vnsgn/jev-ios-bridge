# 04 — Build narrow creation and artifact source adapters

Type: task
Status: ready-for-agent
Execution: implemented-awaiting-review
Claimed by: source-adapters
Mode: AFK
Blocked by: None
Owner: Source/artifact implementer
Model: gpt-6.1-sol
Effort: high
Skills: cook, tdd, project-organization, use-git-worktree
Expected commit: `feat: add bounded simulator creation and artifact adapters`

## Dispatch contract

Root supplies a full base SHA from the final pinned planning ref plus integrated dependencies, an isolated worktree/branch and this issue path. Follow [the implementation handoff](../../observed-integration/implementation-plan.md) for common protected files, context, ownership transfers and fixed-format response. Execution starts on Root’s explicit ticket dispatch with the pinned base and satisfied dependencies; the charting effort remains planning only. Stop and report a contract contradiction, unsupported operation, unsafe authority/replay, missing prerequisite or required protected-file edit; return bounded evidence, never substitute success.

## Context

[Inventory decision](../../observed-integration/evidence/inventory-decision.md), [provisioning research](../../observed-integration/evidence/provisioning.md), [allocation](../../observed-integration/evidence/allocation-contract.md): prerequisites/artifact staging.

## Write ownership

Allowed writes: `src/observed/create-source.ts`; `src/observed/supplied-source.ts`; `src/observed/artifact.ts`; `tests/observed-sources.test.ts`; `tests/observed-artifact.test.ts`; `tests/fixtures/observed-artifacts/**`; this issue's Status and Comments only.

Protected shared files: `src/device/**`; `src/observed/allocation.ts`; `src/observed/service.ts`; `src/experimental/**`; `src/process.ts`; `src/cli.ts`; `src/mcp/**`, plus the common protected set in the handoff. Exactly one owner writes these allowed files; Root integrates and controls the next transfer.

## Bounded work

Implement independently injected adapters, never orchestration or stores. Creation accepts an internally authorized dispatch callback and executes only the approved xcrun simctl create argument array with explicit type/runtime and single UUID-success validation; raw outcomes remain private diagnostic artifacts. Supplied selection validates configured provenance without arbitrary adoption. Artifact inspection/staging validates simulator platform/architecture/minimum OS/bundle metadata, bounded bytes and escaping symlinks, produces an immutable private staged copy/content digest and verifies it before install. Reuse existing process helpers by composition; request changes from Root if their interface is insufficient.

## Acceptance and stop criteria

H04 adapter subsets: malformed/lost/nonzero/abort-ignoring creation receipt yields uncertainty without retry; escaping symlink/content mutation/incompatible metadata refuses; no shell interpolation, direct list, destructive operation, default runtime or source fallback. Fake process/fs fixtures only; tests plus typecheck.

Completion: Adapters are testable without admission mocks granting real devices, have no device operation on module load, and publish typed inputs/outputs for 07. Real device listing/create is outside this ticket. Return the handoff's fixed-format report with full commit/base SHA, files, commands/results, evidence, limitations and unresolved dependencies. A missing required assertion stays UNVERIFIED; a confirmed defect is BLOCKED until Root assigns its fix. No live operations, merge or publish belong to this ticket.

## Comments

### 2026-10-08 — Source/artifact implementation handoff

Implemented the exact owned adapter/test files from base `b8c4a50942551bdf95d00036a6d2f7bb6142ff43`; independent review belongs to Root. Loaded Cook (reviewed-plan autonomous dispatch), TDD, codebase-design, do-test, project-organization, use-git-worktree, diagnosing-bugs, and code-review instructions. Root controls shared docs/journal and independent review; no nested agents. Simplify is unavailable and Root assigned maintainability review.

Creation requires an injected durable dispatch callback and process runner, closes issuance after return/cancellation, performs one exact argument-array create, validates a single UUID receipt and treats every started failure as unknown. The authorized operation remains pending until its runner settles. Supplied selection requires explicit configured provenance and a fresh/exclusive attestation; reservation, protected-device exclusions and vendor availability remain allocator responsibilities. Artifact inspection/staging validates plist plus modern Mach-O simulator/architecture/minimum OS metadata, bounded streamed content, relative contained symlinks, stable source snapshots, private 0500/0400 staging and a canonical digest. Verification refuses changed bytes, permissions, links or additions.

Evidence: final targeted tests 38/38 PASS with no skips on Node 26.8.1 and Node 24.0.0; final typecheck PASS. Full `npm run check` passed 1002/1002 with build before the final added fs-fault test and private diagnostic/cleanup refinements; affected targeted/typecheck checks passed again. Raw logs/report: `/tmp/observed-adapters-targeted-final.log`, `/tmp/observed-adapters-node24-final.log`, `/tmp/observed-adapters-typecheck-final.log`, `/tmp/observed-adapters-full-check.log`, `/tmp/observed-adapters-test-report.md`. Original abort-ignoring metadata red is valid. The initial source-mutation and writable-stage logs were subsequently found to show only EACCES cleanup failures, so they do not establish behavioral reds; see the 2026-10-08 review correction below. Their behavior is covered by green tests and later explicitly labeled mutation audits.

Bounded adapter subset PASS; combined H04 and installed/live acceptance remain UNVERIFIED until Root integration. Unsupported legacy/non-64-bit Mach-O metadata and absolute symlinks refuse; valid relative internal links are supported. Simulator prerequisite discovery, authority/store integration and installation are outside this write set. No real device commands, keys, shared files, merge or publishing were used.

### 2026-10-08 — Independent review fixes and evidence correction

Fixed both P2 findings within this ticket's source/test ownership. File hashing now binds the checked path stat to the opened descriptor (including owner/group/link count), validates immutable permissions/ownership/link count on the descriptor, and checks the descriptor again after hashing. Staging starts cleanup immediately after opening its source descriptor; a failed destination open still closes the source, and a source-close error no longer skips the destination close. Public interfaces are unchanged.

The three actual pre-fix regressions failed on the intended assertions without cleanup masking: `/tmp/observed-artifact-red-descriptor-immutable.log` (Missing expected rejection after 0400->0600 between lstat/open); `/tmp/observed-artifact-red-output-open-leak.log` (source fd remained 14 after output ENOSPC); `/tmp/observed-artifact-red-independent-close.log` (output fd remained 15 when source close rejected). Corresponding `green-*.log` files pass. Each loop followed test-first red -> narrow fix -> green.

Correction: `/tmp/observed-artifact-red-immutable.log` and `/tmp/observed-artifact-red-source-mutation.log` contain only EACCES fixture-cleanup errors masking the intended assertions. They are preserved unchanged and are not valid behavioral red proofs. The prior report and earlier comment's proof claim were corrected. The metadata-abort red remains valid. Separate assertion-sensitivity audits deliberately disabled immutable verification and the final source comparison, respectively: `/tmp/observed-artifact-mutation-audit-immutable-red.log` and `/tmp/observed-artifact-mutation-audit-source-red.log` each report Missing expected rejection with exit 1; these are labeled mutation audits, not original TDD/pre-fix evidence. Restored fixed code passed all five focused cases (`/tmp/observed-artifact-review-focused-green.log`).

Final review-fix checks: Node 26.8.1 and Node 24.0.0 targeted suites each 41/41 PASS, no skips, exit 0 (`/tmp/observed-adapters-review-node26.log`, `/tmp/observed-adapters-review-node24.log`); typecheck exit 0 (`/tmp/observed-adapters-review-typecheck.log`). Corrected matrix/report: `/tmp/observed-adapters-test-report.md`. Root owns the integrated full check and independent re-review; the old 1002-test full check does not cover these review fixes. Applied diagnosing-bugs, TDD, do-test and Cook. No devices, secrets, shared-file edits or nested agents.
