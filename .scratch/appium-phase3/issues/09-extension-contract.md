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

Added from Device side effects of an Appium session:

- Driver settings after the session is created. appium-mcp drops
  `settings[...]` capabilities.
- The capability allowlist the bridge validates. Tool allowlists work per tool
  name, but `appium_session_management` also exposes `attach`, `select` and
  `remoteServerUrl`.
- Refusing the insecure features that relaxed security turns on (`adb_shell`,
  `shutdown_other_sims`, `adb_listen_all_network`, remote app URLs).
- The child environment: no `CAPABILITIES_CONFIG`, `ALLOW_REMOTE_APP_URLS=false`,
  and a deliberate disconnect policy.

Added from Shipping the frozen Appium stack:

- The extension script cannot resolve `appium-mcp/core` by bare specifier from
  `dist/`, and `exports` has no `require` condition. It must import the
  extracted stack by absolute file URL, and take `zod` from the same tree.
- Refuse the WDA-selecting capabilities that the report's section 9 lists.

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
