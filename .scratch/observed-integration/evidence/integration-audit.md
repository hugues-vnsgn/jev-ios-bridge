# Preliminary integration seam audit

Date: 2026-10-08. Baseline: `2ae75e5`. Read-only agent inspection; no tests or device operations. These findings inform the open ticket, not an accepted public contract.

## Existing seams

- `src/mcp/index.ts:createMcpServer` calls `src/service.ts:BridgeService.start`, which invokes `runScriptedScenario`.
- `BridgeService.status` reconstructs scenario reports; `reportJson` reads the frozen `report.json`. They do not understand observed journal records.
- `spikes/observed-ui/cli.ts` calls `src/experimental/observed-run.ts:runObservedExperiment`, which wraps `runObservedTap` with validation, evidence paths, driver creation and journal setup.
- `src/device/index.ts:MobileBuildMcpDriver.tapOnce` owns the single held-touch request.

## Required decisions

1. `ObservedActionJournal.read` and `deviceStatus` (`src/experimental/observed-journal.ts:69–84`) quarantine unfinished intents or active claims. Public progress polling needs a separate, non-mutating interface.
2. `observed-run.ts` writes provisional `result.json` before final journal completion. Status must distinguish progress, terminal authority and failed/interrupted finalization.
3. `cancel_run` promises scenario cleanup. Observed cancellation retains uncertainty; use accurate lifecycle language and preserve legacy meanings.
4. A new script step would inherit checkpoint/Jev/report obligations from `src/scripted/schema.ts` and `src/scripted/run.ts`. An additive observed interface appears smaller, but the contract ticket must decide.
5. Existing CLI run preflight requires a Jev key (`src/cli.ts`); deterministic observed guards do not. Avoid inheriting unrelated authentication requirements.
6. Already satisfied means zero action submissions. Preparation can launch the app before checking the guard; do not describe it as zero device operations.
7. ADR-0005 freezes current script/report/verdict/CLI semantics. Keep observed outcomes distinct from Jev verdicts.

## Suggested checks

Keep existing contract, service, MCP, and handback goldens passing. Add public-entry tests for non-mutating polling, restart during finalization, cancellation with retained uncertainty, duplicate identities, competing entry points, one submission after withheld reply, and agreement between MCP/CLI authoritative outcomes.

Recommendation: one lifecycle module around the existing observed runner, with thin MCP/CLI adapters. Assign shared service/driver files to one owner. This recommendation remains open for design review.
