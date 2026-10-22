# Extension contract

Type: grilling
Status: open
Labels: wayfinder:grilling
Mode: HITL
Parent: [Appium Phase 3 decision map](../map.md)
Blocked by: 01, 05, 07, 08

## Question

Which operations go through the bridge's own appium-mcp extension instead of
public appium-mcp tools? And what are the extension's name, version, request,
result and error schemas, operation allowlist, and session and app binding?

## Required investigation or discussion

Start from the prototypes' findings on observation, text replacement and
gestures, from the stack shipping answer (how the private server is started),
and from Phase 1's `protocol-extension.mjs`, `extension-controlled-server.mjs`
and `fixtures/protocol.json` (five public tools plus `jev_phase1_stack`).
Settle these:

- How the extension is loaded through public `appium-mcp/core`.
- Which public tools remain registered.
- How every consumed result is validated.
- How the fake MCP provider replays the contract.

No arbitrary driver methods or scripts, no remote attachment, and no private
upstream imports.

## Completion criterion

The owner locks the extension contract and the public-tool allowlist. Write
them into the "Entry and composition" section of the Phase 3 specification;
add an ADR only if the trade-off is hard to reverse.

## Context

- [Phase 3 specification](../../appium-mcp-migration/phases/phase-3-adapter.md)
- [Public compatibility research](../../appium-mcp-migration/research/public-compatibility.md), "Public seams"
- [Published spec](../../appium-mcp-migration/spec.md), Decisions 6 and 7, Testing Decision 5

## Comments

Charted on 2026-10-22.
