# Vendor report fields and stack provenance

Type: grilling
Status: open
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
