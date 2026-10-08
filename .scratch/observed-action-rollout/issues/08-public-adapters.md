# 08 — Expose the shared workflow through additive CLI and MCP adapters

Type: task
Status: ready-for-agent
Execution: integrated
Claimed by: /root/observed_runtime
Mode: AFK
Blocked by: 06, 07
Owner: Public-adapter implementer
Model: gpt-6.1-sol
Effort: high
Skills: cook, tdd, use-git-worktree
Expected commit: `feat: expose observed allocation and action CLI and MCP`

## Dispatch contract

Root supplies a full base SHA from the final pinned planning ref plus integrated dependencies, an isolated worktree/branch and this issue path. Follow [the implementation handoff](../../observed-integration/implementation-plan.md) for common protected files, context, ownership transfers and fixed-format response. Execution starts on Root’s explicit ticket dispatch with the pinned base and satisfied dependencies; the charting effort remains planning only. Stop and report a contract contradiction, unsupported operation, unsafe authority/replay, missing prerequisite or required protected-file edit; return bounded evidence, never substitute success.

## Context

[Public contract](../../observed-integration/evidence/public-contract.md): all tools/commands/envelopes/flags/exits. [Allocation](../../observed-integration/evidence/allocation-contract.md): public preparation interface. [Seam](../../observed-integration/evidence/seam-decision.md): composition.

## Write ownership

Allowed writes: `src/cli.ts`; `src/mcp/index.ts`; `src/mcp/observed.ts`; `src/observed/cli.ts`; `tests/observed-cli.test.ts`; `tests/observed-mcp.test.ts`; `tests/observed-contract.test.ts`; `tests/fixtures/observed-mcp-server.ts`; `tests/fixtures/observed-cli-server.ts`; `tests/golden/observed-*.json`; this issue's Status and Comments only.

Protected shared files: `src/device/**`; `src/observed/service.ts`; `src/observed/allocation*.ts`; `src/observed/schema.ts`; `src/observed/report.ts`; `src/experimental/**`; `src/service.ts`; `existing tests/golden/*.json except new observed-*`, plus the common protected set in the handoff. Exactly one owner writes these allowed files; Root integrates and controls the next transfer.

## Bounded work

One writer installs all seven commands and seven tools against the same integrated service; no adapter lifecycle. Implement enablement/start suppression with reads/cancel/retire retained, safe errors, summary plus full JSON MCP text blocks, one JSON stdout CLI snapshot, exact exit/signal handling and owned shutdown. Keep Jev judge construction lazy; startup and observed operations are key-free. Versioned golden additions are new fixtures. Preserve legacy tool schemas/reply keys, exits and report meaning; request Root review for any intentional whole-tool-list fixture delta.

## Acceptance and stop criteria

H01/H02/H03/H05/H09 public subsets through subprocess and stdio harness: all outcomes/errors/active/unresolved, flag off/on, no key/SDK/network, reads wait abort only, allocation exit followed by separate action process, signals 130/143, identical/conflicting requests zero repeated backend calls. Run existing MCP/CLI contract tests, targeted new tests and typecheck.

Completion: Production packed src entry points provide the accepted contract. Both transports demonstrably share runtime/authority and no existing golden meaning changes. Return the handoff's fixed-format report with full commit/base SHA, files, commands/results, evidence, limitations and unresolved dependencies. A missing required assertion stays UNVERIFIED; a confirmed defect is BLOCKED until Root assigns its fix. No live operations, merge or publish belong to this ticket.

## Comments

2026-10-08: Root dispatched adapter-only implementation at 6ef2690fbb990e86fc57603c952304167d8c39b8 in linked feat/observed-public-adapters. Cook/TDD/worktree/codebase-design/do-test apply at the agreed CLI subprocess, MCP stdio and shared-service seams. No provider workflow, production stores/devices/secrets or protected writes.


2026-10-08: Implemented at accepted updated base `1275f93c616c90aba63e92468679cf39f13157b5`. Seven CLI/MCP operations share the accepted runtime/allocator through lazy composition and an internal typed bootstrap used by real entrypoints and isolated fake subprocess fixtures. Exact `JEV_EXPERIMENTAL_OBSERVED === '1'` only; strict raw input/64KiB handling, one CLI JSON record, two MCP text blocks, authority-based exits, read-only waits and bounded signal exit. Production accepts no fake/admission-root override or implicit recovery/migration. Normal preparation process exit preserves parked readiness.

Root granted only two existing MCP whole-list assertions/flag-off fixture setup, and only the named legacy capture-refusal test's complete exact Node24 SQLite notice handling (formal repair scope `85c638db4298ec0ae126d27335dc2e28d671897e`). Legacy stdout/exit/reason/key assertions and all old goldens remain unchanged. The latter fixture boundary reproduces on pre08 accepted source; unknown/incomplete/other notices stay unfiltered.

Original twelve-file round1/gates and independent findings remain preserved. Root-owned evidence-directory overlap fix was integrated disjointly before final adapter gates; unchanged original repro hash is retained. Two independent P2 repairs now delegate after loss of eligible ready authority during config validation and make real CLI signals exit130/143 after bounded finalization even with a pending fake active resource. CLI fixture no longer forces ordinary exit. Final same regression oracle is genuinely red3/3 on immutable round1 source and green after repair; setup-only failures and response-kind overassertion remain separately classified.

Final frozen thirteen source/test/golden files: [manifest](../../observed-integration/acceptance/host/public-adapters/author/round2/final-source.json), [post-gate hash check](../../observed-integration/acceptance/host/public-adapters/author/round2/final-hash-check.json), [report](../../observed-integration/acceptance/host/public-adapters/author/round2/report.md). Focused63/63 Node26.8.1 and exact24.0.0, full1470/1470 plus typecheck/build, coverage160/160 with94.16%lines/83.42%branches aggregate,0skips. Both independent axes PASS on the frozen mapping; exact commit association follows. Exact tarball/local-dependency npm-bin proof passes both runtimes and stays partial; clean install belongs to10. Full H01–H09/live acceptance remains UNVERIFIED. Simplify unavailable and not run. One focused owned commit; source stopped for Root integration.

### Root acceptance — 2026-10-08

Accepted candidate `a38e7a039c680fce5acb4181e763613958feb742`, integrated as `538e5770d1a02b7ef92d2dd69cd3a8a9d692ec4a`, after both independent round2 axes and exact commit association. Root passes combined 725/725 on Node26.8.1 and exact24.0.0, full 1470/1470 plus typecheck/build, zero skips; all 34 audited files match. [Review, separate preserved rounds and limits](../../observed-integration/acceptance/host/public-adapters-review.md). All 330 round2 artifacts are preserved with verified hashes; the three author links above now point to their preserved Root copies. Whole host gates and clean installation remain pending tickets09/10.
