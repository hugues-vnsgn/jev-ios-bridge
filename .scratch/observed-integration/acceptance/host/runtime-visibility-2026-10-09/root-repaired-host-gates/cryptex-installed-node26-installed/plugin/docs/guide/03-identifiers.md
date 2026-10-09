# Make elements selectable

The bridge finds elements through the accessibility tree, the same information VoiceOver uses. Every element in a capture has:

| Field | What it is |
| --- | --- |
| `identifier` | Your accessibility identifier or test tag. The most reliable way to select. |
| `role` | One of the bridge's roles: `application`, `window`, `button`, `keyboard-key`, `text-field`, `menu`, `text`, `image`, `switch`, `slider`, `cell`, `scroll-view`, `list`, `tab`, `other`. |
| `label` | The accessible name, usually the visible text. |
| `value` | A field's text, or a control's state, such as `selected` or `1`. |

On Android, an element can also carry a `placeholder` (an empty field's grey hint), and `capture` marks some texts `"selectable": false` (below).

## See what the bridge sees

Capture the screen your script will be on:

```sh
npx mobilebuildmcp ui-automation snapshot-ui --simulator-id <UUID> --verbose --output json
```

On Android, use the bridge's own `capture`, which prints one line per element as a run reads it ([details](06-running.md#capture-an-android-screen)):

```sh
npx jev-ios-bridge capture --avd <AVD name>
```

Write selectors from what's actually there, not from what the source code suggests. A label you set in code can be merged with its children, and a tag can land on a wrapper.

## SwiftUI and UIKit

- **SwiftUI:** `.accessibilityIdentifier("checkout.complete")` on the control itself.
- **UIKit:** `view.accessibilityIdentifier = "checkout.complete"`.
- Standard controls expose their state. A `Toggle` is a `switch` with value `0` or `1`, and a selected segment carries `selected`, so scripts and claims can use it.

## Compose Multiplatform

- `Modifier.testTag("checkout.complete")` becomes the accessibility identifier on iOS, with no opt-in needed since Compose Multiplatform 1.8.0. **Use 1.12.1 or later if you can.** Earlier versions can crash under accessibility polling (below).
- **A Material button captures as two elements:** a `button` carrying the tag and label, plus a `text` child with the same label. A guard that selects by `label` alone matches both and fails as `GUARD_AMBIGUOUS`. Select by `identifier`, or by `role` plus `label`.
- **A dialog hides the screen behind it** from the tree. While it's up, guards for the underlying screen see nothing; use `absent` for them.
- **Elements scrolled out of view lose their labels** and can't be acted on. Scroll first, then select.
- **Your components must expose their state.** A custom checkbox or radio drawn without `Modifier.toggleable` or `selectable` semantics captures as a plain `button` with no checked state, so no guard or claim can see whether it's on. The same goes for a text field without a label or tag: it can't be told apart from its neighbours. Checked in one real design system: its checkbox and radio exposed no state, and its main form field had no name. Where a control prints its state in its label ("OFF" becomes "ON"), claims work fine.
- **Tested on:** Compose Multiplatform 1.9.0, in a real design-system gallery, and 1.11.1, in a demo app. Not tested: `heading()` semantics, SwiftUI navigation or tab bars wrapped around Compose screens, and native text input mode. See [limits](10-limits.md).

**The known crash:** on Compose Multiplatform 1.11.1, heavy polling while dialogs holding very large lists opened and closed crashed the app with `EXC_BAD_ACCESS` in `AccessibilityElement.<get-node>`. JetBrains fixed this in 1.12.1. The bridge reports such a run as `APP_EXITED`.

## Jetpack Compose and Compose Multiplatform on Android

- **Turn on `testTagsAsResourceId`** at the root composable. Without it, Android captures have no identifiers at all. [Android setup](12-android-setup.md#give-compose-elements-identifiers-testtagsasresourceid) shows where.
- With it, `Modifier.testTag("checkout.complete")` becomes the identifier `checkout.complete`.
- **A button's text is lifted into its label.** A Material button captures as a `button` labelled with its text, followed by that text marked `"selectable": false`. Jev sees both, but only the button can be matched, so a guard that selects by `label` alone matches just the button.
- **Checkboxes, radio buttons, and switches** are all `switch`, with `value` `1` or `0`. A selected tab carries `selected` in its state. Custom controls must [expose that state](12-android-setup.md#custom-tabs-and-toggles-must-expose-their-state).
- **A password field shows dots,** one per character, never its text.

## Android Views

- `android:id` becomes the identifier as its full resource ID, such as `com.example.app:id/title`. System screens (Settings) use theirs, such as `android:id/title`, which often repeats: add `role` and `label`.
- `EditText` is a `text-field`, lists and scroll views are `scroll-view`, and a `TextView` is `text`.

## Rules for every framework

- **Put the tag on the element that acts,** not on its wrapper. A tag on a `Box`, `Column`, or `UIKitView` becomes an `other` element: it works in a guard, but can't be tapped or typed into.
- **Make tags unique per instance.** Components that tag themselves repeat the same tag everywhere they're used. A number-input library that tags every field `numberInput.field` is one example. Tag each instance yourself, or add `value` to tell repeated elements apart.
- **You can't select emptiness.** An empty Compose text field has no `value` at all, and an empty native `UITextField` reports its placeholder as `value`. On Android, an empty field has no `value`. It shows its hint as `placeholder` only when it has no content description; a field with one shows that description as its `label`, and has no `placeholder`. So the bridge rejects `value: ""` in selectors. Check emptiness through text your app prints, if it matters.
- **Dynamic text is a poor selector.** Select by identifier, and put the changing text in a claim.
