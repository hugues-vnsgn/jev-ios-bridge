# Text replacement and shown value

Type: prototype
Status: open
Labels: wayfinder:prototype
Mode: HITL
Parent: [Appium Phase 3 decision map](../map.md)
Blocked by: 04, 05

## Question

Which exact native sequence replaces a text field's contents on each platform,
with every mutating step accounted for, and how does the bridge read the shown
value back from fresh evidence?

## Required investigation or discussion

On the private pair, try iOS `clear` then `setValue` (and any bounded
alternative), and Android `mobile: replaceElementValue`. Use plain, secure,
formatted (masked), Unicode, empty and pre-filled fields. For each attempt:

- Count actual native inputs, not SDK calls.
- Find where the typed value is echoed: responses, errors, vendor logs.
- Note the keyboard and focus state afterwards.
- Read the shown value from a fresh capture.

Also simulate a lost acknowledgment between steps, to find where dispatch
must close.

## Completion criterion

The owner locks four things: the replacement sequence per platform, which
steps are separate dispatched commands, the shown-value correspondence rule
(including when to omit it), and which responses and errors must be filtered
before they reach logs. Write them into the "Operation contract" section of
the Phase 3 specification.

## Context

- [Phase 3 specification](../../appium-mcp-migration/phases/phase-3-adapter.md), "Operation contract"
- [Public compatibility research](../../appium-mcp-migration/research/public-compatibility.md), "Replacement text and shown value"
- `src/device/android/driver.ts` (`typedFieldIn`, `actIssued`), `ActOutcome` in `src/contracts/index.ts`

## Comments

Charted on 2026-10-22.
