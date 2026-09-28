# How Android elements map onto the bridge's elements

Type: prototype
Status: resolved
Claimed by: Claude Code (owner session)
Blocked by: none

## Question

How should the Android driver turn `mobilecli dump ui --format raw` into the bridge's `Element` (role, label, value, identifier, frame, state, actions), so that selectors and guards work as they do on iOS?

- **Roles:** map Android classes and flags (`clickable`, `checkable`, `scrollable`) onto the bridge's role list. Compose buttons arrive as a clickable `android.view.View`. Decide whether 1.x adds roles such as `checkbox` or `radio`.
- **Compose text lift:** a clickable node with no text takes its label from its text children. Decide what happens to those children (keep, hide, or mark them), given that iOS guides already warn that merged buttons duplicate their label on a text child.
- **Labels, values and hints:** `text` vs `content-desc` for label; an `EditText`'s text as `value`; `hint` kept apart; password fields.
- **Noise:** status and navigation bars (`com.android.systemui:` resource-ids), invisible nodes, zero-size nodes, and deep layout wrappers.
- **Actions:** which elements can be tapped, typed into or swiped, derived from flags.

Prototype the mapping over captures of the Android twin app, `cmp` or `cmp-test`, and Settings on the emulator, and show the owner the mapped rows next to the raw tree to react to.

## Comments

- Prototype: `spikes/android/element-mapping.prototype.html` on branch `prototype/android-element-mapping` (`670488d`), built by `node spikes/android/build-prototype.mjs` from the pure module `spikes/android/element-mapping.cjs` and ten emulator captures in `spikes/android/captures/`. It shows the twin app, cmp and Settings, with the open choices as switches, a selector tester, and the Jev text.

- 2026-09-28, from "What Jev sees on Android, and the 10-screen check": an empty field's placeholder is now dropped from Jev's view, and the field shows it as `placeholder` rather than `label`. It had caused a confidently wrong answer. Selection is unchanged.

## Answer

Resolved 2026-09-28 by the owner over the prototype (branch `prototype/android-element-mapping`, `c7c0e49`). The validated rules are the pure module `spikes/android/element-mapping.cjs` there, ready to lift into the Android driver.

- **Roles** come from the Android class, or for Compose from its **role marker**: a textless, non-clickable child with a role class (`android.widget.Button`) next to the text of a clickable `View`. The marker gives the role and is never an element. Otherwise: `EditText` is `text-field`; `Switch`, `CheckBox`, `RadioButton` and any checkable node are `switch` (no new roles for now); `SeekBar` is `slider`; `RecyclerView`, `ListView`, `ScrollView` and similar are `scroll-view`; any other clickable node is `button`; `TextView` is `text`; `ImageView` is `image`; anything else is `other`.
- **Blank buttons** (clickable or checkable, no text or content-desc) take their label from their **first** text descendant, stopping at nested actionable nodes. That text stays in Jev's observation as its own line, but **selectors skip it**, so a label-only guard matches once. Other inner texts (a Settings row's summary) stay ordinary text elements.
- **Labels:** content-desc, else text. **Text fields:** value is the text (absent when empty); the name comes from content-desc, else the hint, else the placeholder drawn inside it (that placeholder is then not selectable). **Switches** have value `"1"` or `"0"`, as on iOS.
- **Dropped:** everything under a `com.android.systemui:` resource-id (status and navigation bars), invisible and zero-size nodes, and every layout wrapper with no label, value or action, even when it has an ID.
- **IDs** are the full resource-id (`com.android.settings:id/title`); a Compose `testTag` arrives unchanged.
- **Actions:** `tap` for clickable nodes, switches and text fields; `typeText` for text fields; `swipeWithin` for scroll-view classes.
- **Measured on the captures:** Settings main list 56 raw elements become 25; the twin app's first screen becomes 6 elements; the million-row list's Jev text is 4.8 KB of the 24 KB budget.

Passed on: mobilecli's raw tree has no `scrollable` flag, so Compose lists can't be found for `swipeWithin` (added to "Actions across Android versions"). Apps without `testTagsAsResourceId` have no IDs, and custom Compose tabs don't report `selected` (guide fog).
