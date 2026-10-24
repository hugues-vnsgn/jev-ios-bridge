# Text replacement and shown value

Type: prototype
Status: resolved
Claimed by: root (Claude); evidence built by the Codex worker (brief ~/.codex/reports/jev-ios-bridge/phase3-build/P07-text-replacement-brief.md); owner decides
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

Added from What the old vendors give us today: decide whether to keep or relax
the iOS typing limits at cutover. Today MobileBuildMCP types with a US keyboard
only, refuses a leading hyphen (`UNSUPPORTED_LEADING_DASH_TEXT`), and the iOS
value validation messages carry these limits.

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
Resolved on 2026-10-23 by the owner after reviewing P07 with the root.

## Answer

Prototype `prototype/text-replacement` at `a6e3cbbc5`. The evidence is in
`~/.codex/reports/jev-ios-bridge/phase3-build/P07-evidence/`. It used the
fixture app.

- **Sequence.**
  - iOS: `clear` then `setValue`, as two dispatched commands. This worked on
    plain, Unicode, masked, empty, pre-filled and secure fields. The
    lost-acknowledgement test passed, with no retype.
  - Android: `mobile: replaceElementValue`, one command. This worked on plain,
    Unicode, masked and empty fields.
- **Shown value.** The field's own fresh value. It is omitted when only the
  hint shows, and secure fields stay masked.
- **iOS typing limits** are relaxed.
- **Echo filtering.** The child's stderr is redacted before anything is
  persisted. P07 found typed values in appium-mcp's stderr.
- **Not proved.** Android pre-filled and secure fields: the worker stopped at
  the retry limit. They move to [19](19-observation-coverage-on-a-fixture-app.md).

The text is under "Locked text replacement" in the Phase 3 specification.
