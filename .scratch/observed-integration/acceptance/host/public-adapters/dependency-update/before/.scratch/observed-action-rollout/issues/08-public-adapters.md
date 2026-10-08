# 08 — Expose the shared workflow through additive CLI and MCP adapters

Type: task
Status: ready-for-agent
Execution: in-progress
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
