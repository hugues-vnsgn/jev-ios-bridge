# 10 — Document and verify the installed observed workflow

Type: task
Status: ready-for-agent
Claimed by: observed_installed_workflow
Execution: accepted by Root; candidate a319e5b integrated as eff4d10
Mode: AFK
Blocked by: 08
Owner: Documentation/packaging implementer
Model: gpt-6.1-sol
Effort: medium
Skills: writing-for-agents, unslop, project-organization, do-test, use-git-worktree
Expected commit: `docs: add observed workflow guide and installed runtime checks`

## Dispatch contract

Root supplies a full base SHA from the final pinned planning ref plus integrated dependencies, an isolated worktree/branch and this issue path. Follow [the implementation handoff](../../observed-integration/implementation-plan.md) for common protected files, context, ownership transfers and fixed-format response. Execution starts on Root’s explicit ticket dispatch with the pinned base and satisfied dependencies; the charting effort remains planning only. Stop and report a contract contradiction, unsupported operation, unsafe authority/replay, missing prerequisite or required protected-file edit; return bounded evidence, never substitute success.

## Context

[Validation](../../observed-integration/evidence/validation-matrix.md): H09/live prerequisites/limits. [Public](../../observed-integration/evidence/public-contract.md), [allocation](../../observed-integration/evidence/allocation-contract.md), [inventory](../../observed-integration/evidence/inventory-decision.md): installed usage and scope.

## Write ownership

Allowed writes: `docs/guide/14-observed-actions.md`; `docs/guide/reference/observed-format.md`; `docs/guide/README.md`; `docs/guide/08-troubleshooting.md`; `skills/test-ios/SKILL.md`; `tests/observed-docs.test.ts`; `tests/observed-packaging.test.ts`; `tests/fixtures/observed-packaging/**`; `.github/workflows/check.yml`; this issue's Status and Comments only.

Protected shared files: `src/**`; `src/version.ts`; `package.json`; `package-lock.json`; `README.md`; `CHANGELOG.md`; `docs/adr/**`; `scripts/build-plugin.mjs`; `src/device/index.ts`; `existing goldens`; `all other tests`, plus the common protected set in the handoff. Exactly one owner writes these allowed files; Root integrates and controls the next transfer.

## Bounded work

Write installed CLI/MCP workflow, offline migration invocation/quiescence and declared roots, key-free enablement, unchanged app artifact requirements, distinct identities, retrieval after lost reply, retained/unknown-create handling and limits. Link normative format rather than duplicate lifecycle rules. Add Node 24.0.0 CI gate and clean packed-install/plugin smoke with no extra runtime flags; verify packaged maintenance entry and startup. Tests check real installed commands, not mirrored documentation prose. Root owns ADR/domain/release changes and broader packaging fixes.

## Acceptance and stop criteria

H09 Node minimum/CI, npm pack clean isolated installation, CLI/MCP startup and npm run build:plugin pass without secrets/device operations; legacy golden checks unchanged. Docs links resolve and accurately state synthetic versus real loss and native limitations. Return any packaging defect for Root.

Completion: Installed users can find migration and safe workflow usage, while the Node 24.0.0 gate exercises SQLite. Final shipping/live verdict remains Root-owned. Return the handoff's fixed-format report with full commit/base SHA, files, commands/results, evidence, limitations and unresolved dependencies. A missing required assertion stays UNVERIFIED; a confirmed defect is BLOCKED until Root assigns its fix. No live operations, merge or publish belong to this ticket.

## Comments

### Root bounded acceptance

Both independent axes PASS on exact candidate `a319e5bea63415b6ac981c4ce4e8a25679b010c9`; integration `eff4d10dba92bd087d5fdcf980b0b16395d5bd98`. Root's physical affected34/34 and actual default full1482/1482 plus typecheck/build PASS on Node26.8.1 and exact24.0.0, zero skips. Root added the README guide link after these checks. Status remains the canonical triage label; Execution records acceptance. Complete composed host/live acceptance remains pending. [Root review and durable evidence](../../observed-integration/acceptance/host/installed-workflow-review.md).


### Installed workflow candidate — 2026-10-08

Implemented the installed migration/observed guide, normative local format reference, skill branch, troubleshooting/index links, minimum Node 24.0.0 CI matrix and mandatory isolated clean-install/plugin proof. Root authorized the narrow existing guide-example classifier transfer; all declaration/prepare/action examples use actual production parsers while existing Scenario validation/count remain intact.

Original dispatch base was `d0f49f6c12cbaffb4c034217b7e25b96c52c6cb2`. Root advanced the paused worktree to `75d7618167729b9b9a5547eaa468e37eb12b2504` after the independently accepted maintenance-entry dependency repair, preserving all eleven owned file hashes and metadata. Both unchanged mandatory proof commands now pass on Node 26.8.1 and exact 24.0.0: genuine clean registry tarball installs, actual installed bin/shebang, CLI/MCP schema/text/gates, original alias maintenance help, plugin build and independent plugin npm ci. Each proof records 37 commands, no skipped cases or forbidden effects.

Final actual `npm run check` passes 1482/1482 on both runtimes, zero skips, with typecheck/build; affected guide/docs/packaging scans pass 34/34 each. All fourteen golden files remain byte identical. Evidence and final report are under `/tmp/jev-ticket10-evidence/`; Root owns durable acceptance publication and final matrix/live verdict. Original bin-path harness failure, real maintenance-help failures and the first full test-child umask/timing failures remain preserved separately. Remote CI is configured, not executed here. No real admission activation, device/key access, merge or publication occurred.
