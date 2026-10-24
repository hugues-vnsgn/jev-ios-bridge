# Vendor report fields and stack provenance

Type: grilling
Status: resolved
Labels: wayfinder:grilling
Mode: HITL
Parent: [Appium Phase 3 decision map](../map.md)
Blocked by: 03, 05

## Question

What do the frozen report and contract fields that carry MobileBuildMCP
meaning report under Appium? These include `referenceExpiries`,
`nearTtlRefreshes`, `tapAliasRule`, and any others the vendor inventory finds.
And what additive provenance do reports and run logs gain (backend, frozen
stack versions, extension version)?

## Required investigation or discussion

Start from the vendor inventory's list of fields with vendor meaning and the
observation mapping's tap-alias decision. Constraints:

- The stability contract (ADR-0005) forbids silent semantic breaks.
- Provenance stays additive and truthful.
- No MobileBuildMCP expiry counts are manufactured.
- Automation timing is never presented as app performance.

Check every affected golden.

Added from What the old vendors give us today: its section 2 lists seventeen
public surfaces with vendor meaning. Settle at least:

- `error.vendorCode`, where `APP_NOT_INSTALLED` is now bridge-sourced (doc drift)
- `prepared.agentSha256` and `logSources`
- verdict `deviceMetrics`
- the element reference format in hand-backs and `resolve_step`
- observed `actionAcknowledged`

The 15-role list belongs to Observation mapping, and `SCREEN_CHANGED` to
Settling and screen change under Appium.

Added from Shipping the frozen Appium stack: the private child loads both MCP
SDK generations (1.32.1 through fastmcp, 2.3.1 through mcp-proxy). It also
loads fastmcp, mcp-proxy and zod. Phase 1's loaded-file record filtered all of
these out. Provenance should either record them or say why it doesn't.

## Completion criterion

The owner locks each field's Appium meaning and the provenance shape. Write
them into the "Mode compatibility" section (reports row) of the Phase 3
specification, and list the goldens that change additively.

## Context

- `src/contracts/index.ts:136-189`, contract goldens under `tests/`
- [Published spec](../../appium-mcp-migration/spec.md), Decisions 16, 26 and 29, Testing Decision 20
- ADR-0005, `docs/guide/11-stability.md`

## Comments

Charted on 2026-10-22.
Resolved on 2026-10-23 by the owner in a grilling session with the root.

## Answer

- **`error.vendorCode`** carries the underlying code, with a new additive
  `error.vendorSource` (`appium` | `adb` | `bridge`). The docs are fixed.
- **Provenance** is an additive `prepared.stack` block. `agentSha256` stays on
  Android as the UiAutomator2 server APK hash.
- **Loaded libraries.** Both SDK generations, fastmcp, mcp-proxy and zod are
  recorded in the manifest and the loaded-file check.
- **iOS reference metrics** are omitted on Appium runs. No fake counts.
- **Kept meanings** for `logSources`, the `eN` refs, `actionAcknowledged` and
  `tapAliasRule`. The guide is reworded in the composition-switch PR.
- **Additive goldens:** `report-json.json`, `evidence-layout.json`,
  `observed-replies-v1.json`, and `vocabulary.json` (descriptions only).

The full text is under "Locked report fields and provenance" in the Phase 3
specification's "Mode compatibility" section.
