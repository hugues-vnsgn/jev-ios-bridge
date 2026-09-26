# Write scripts

A script is a JSON file: the app to launch, typed values, and an ordered list of steps. It must end with a checkpoint. Full field reference: [script format](reference/script-format.md).

```json
{
  "version": 1,
  "app": { "bundleId": "dev.jevbridge.diagnostic" },
  "values": {},
  "steps": [
    {
      "id": "addApple",
      "kind": "action",
      "guard": { "present": [{ "role": "text", "identifier": "selection.summary", "label": "Selected: None" }] },
      "action": { "kind": "tap", "selector": { "role": "button", "identifier": "choose.apple" } }
    },
    {
      "id": "verify",
      "kind": "checkpoint",
      "guard": { "present": [{ "role": "text", "identifier": "selection.summary" }] },
      "assertions": [{ "id": "selection", "claim": "The selection summary reads Selected: Apple." }]
    }
  ]
}
```

## Steps

| Kind | What it does |
| --- | --- |
| `action`, `tap` | Taps the one element matching `selector`. |
| `action`, `replaceText` | Replaces the whole text of a field with `values[valueKey]`. |
| `action`, `swipe` | Swipes within the matching scrollable element: `up`, `down`, `left`, or `right`. |
| `wait` | Captures the screen repeatedly until the `until` guard holds, for up to `timeoutMs` (maximum 60 000). |
| `checkpoint` | Asks Jev to judge 1–20 claims about the current screen. |

Every step first captures the screen and checks its **guard**. Scripts have 1–100 steps, each with a unique `id`.

## Selectors

A selector matches elements exactly on any of `identifier`, `role`, `label`, and `value`. It needs at least one of `identifier`, `role`, or `label`; `value` only narrows. Prefer `identifier`. See [make elements selectable](03-identifiers.md).

An action needs **exactly one** visible, enabled element that supports it. With none, the run stops as `TARGET_MISSING` or `TARGET_UNAVAILABLE`; with several, as `TARGET_AMBIGUOUS`. The bridge never guesses.

## Guards prove where you are

- **`present`:** each selector must match exactly one visible element.
- **`absent`** (optional): each selector must match none.

A guard is how the script knows it's on the screen it expects. Choose anchors that only that screen has. One text field on its own could be the search field or a contact's notes field, but its identifier plus the screen title can't be both.

- **Sheets and dialogs:** a sheet can leave the screen behind it in the capture (UIKit and SwiftUI), and a Compose dialog hides it. Before acting on the main screen again, close the sheet and put its title in `absent`.
- **A guard that fails stops the run as inconclusive** (`GUARD_MISSING`, `GUARD_AMBIGUOUS`, `GUARD_FORBIDDEN`), not failed. It tells you the script didn't reach the state it expected; it proves nothing about the app.

## Typed values

Put every literal you type into `values`, and refer to it by key:

```json
"values": { "city": "London" },
…
{ "kind": "replaceText", "selector": { "identifier": "search.field", "role": "text-field" }, "valueKey": "city" }
```

- **Allowed:** printable US-keyboard characters, up to 2048 per value and 32 values per script. A value can't start with a hyphen; that's a limit of the pinned device layer.
- **Masked in the evidence.** Values are masked in the run log and the log pane. They can still show up in screenshots, and in the screen text sent to Jev.
- **Check the result in the next guard,** for example `{ "identifier": "search.field", "value": "London" }`. Keyboard state can change casing or how replace-all behaves.

## Patterns

- **Wait out a splash or animation:** a `wait` whose `until` names an element of the settled screen. Its `guard` must hold at every capture, so use something that stays on screen throughout, like the app root: `{ "role": "application", "label": "YourApp" }`.
- **Scroll a long list:** `swipe` on the list or `scroll-view` element, repeated as needed, with guards on anchors that prove where you are.
- **Open and close a sheet:** tap, checkpoint with the sheet's title in `present`, close, then put the title in `absent`.
- **Keypads and keyboards:** tap each key by identifier. After replacing text, the iOS edit menu can stay open; the next step's fresh capture handles that.
- **Launch into a known screen:** `app.launchArgs`, see [prepare your app](02-prepare-your-app.md).

## Scripts that fail to parse

The CLI prints each problem with its path and exits 3, for example `✖ Add "version": 1 to the script; this bridge reads script format version 1`. Under MCP, `start_scenario` returns an error.
