# Worked example: Compose Multiplatform (a design-system gallery)

These scripts check a real Compose Multiplatform 1.9.0 app: a freight company's iOS app, whose screens are all Compose inside a thin SwiftUI shell. The app isn't public, so you can't build it. The scripts are here to read, and they show the Compose-specific moves. Sources: [`compose-bfsone-*.json`](https://github.com/hugues-vnsgn/jev-ios-bridge/tree/v1.0.0/spikes/benchmarks/scenarios).

## A debug entry point

```json
"app": { "bundleId": "com.beelogistics.BFSOne", "launchArgs": ["-of-evidence-gallery"] }
```

Everything past this app's login screen talks to a production server, and logging in writes to it. So the team added a debug-only launch argument that opens the design-system gallery directly, with no login, no network, and no notification prompt. Every run starts on the same screen with the same data. See [prepare your app](../02-prepare-your-app.md#give-runs-a-stable-starting-point-debug-entry-points).

## Scrolling a Compose list

The gallery is one long `LazyColumn`. Compose offers a single full-screen `scroll-view` to swipe within:

```json
{ "id": "scroll1", "kind": "action",
  "guard": { "present": [{ "role": "application", "label": "BFS One" }] },
  "action": { "kind": "swipe", "selector": { "role": "scroll-view" }, "direction": "up" } }
```

The script repeats this until the target section is on screen. Elements scrolled out of view lose their labels in Compose, so the next step's guard names the section header that should now be visible.

## Tagged fields, repeated tags

The number fields come from a library that tags every instance `numberInput.field`, so the tag alone matches four fields. The field's displayed value tells them apart. The Quantity field is empty, so it reports its placeholder, `0`:

```json
{ "id": "focusQuantity", "kind": "action",
  "guard": { "present": [{ "role": "text", "label": "Quantity" }] },
  "action": { "kind": "tap", "selector": { "identifier": "numberInput.field", "value": "0" } } },
{ "id": "key4", "kind": "action",
  "guard": { "present": [{ "identifier": "numberInput.toolbar.done" }] },
  "action": { "kind": "tap", "selector": { "identifier": "numberInput.keypad.4" } } }
```

The keypad keys have one tag each, so they're easy to tap.

## Text entry into a tagged field

```json
{ "id": "searchUnits", "kind": "action",
  "guard": { "present": [{ "role": "text", "label": "OFPickerBody (full-screen pickers)" }, { "identifier": "of-picker-search" }] },
  "action": { "kind": "replaceText", "selector": { "identifier": "of-picker-search", "role": "text-field" }, "valueKey": "query" } },
{ "id": "filtered", "kind": "checkpoint",
  "guard": { "present": [{ "identifier": "of-picker-search", "role": "text-field" }] },
  "assertions": [
    { "id": "count", "claim": "The unit picker's results line reports 2 results." },
    { "id": "containers", "claim": "The unit picker lists Container 20' and Container 40'." }] }
```

The count claim uses the app's own "2 results" line, not a row count.

## Dialogs hide the screen behind them

```json
{ "id": "dialogOpen", "kind": "checkpoint",
  "guard": { "present": [{ "role": "text", "label": "Delete Request" }],
             "absent":  [{ "role": "text", "label": "§02 OFDialog / OFBottomSheet / OFEmptyState" }] },
  "assertions": [{ "id": "question", "claim": "A Delete Request dialog asks: Are you sure you want to delete this request?" }] }
```

While a Compose dialog is open, the gallery behind it is absent from the capture, so the guard can require that absence.

## What this app taught

- **Components need accessibility semantics.** This design system's checkbox and radio expose no checked state (they capture as plain buttons), and its main text field has no label or tag. No script can check "Issue Invoice is ticked" there. The scripts use controls that print their state instead, such as a Dark mode checkbox whose label flips from OFF to ON.
- **Claim printed text.** "The checkbox next to Dark mode is labelled ON" scored 0.88, but "A button labelled ON is visible" scored 0.99.
- **Labels repeat.** A guard on `{ "label": "Disabled" }` alone matches both a disabled text field and a disabled radio button on the same screen. The planted ambiguous-guard script uses it to prove the bridge refuses to guess (`GUARD_AMBIGUOUS`). With Material buttons, a label also repeats on the button's text child ([details](../03-identifiers.md#compose-multiplatform)).
