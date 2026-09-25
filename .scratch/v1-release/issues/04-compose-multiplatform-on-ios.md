# Compose Multiplatform on iOS through MobileBuildMCP

Type: research
Status: resolved
Blocked by: none

## Question

What does a Compose Multiplatform iOS screen look like to the bridge, and which app should be the 1.0 Compose evidence? "Compose app evidence plan" and "Developer guide outline" wait on this. Establish:

- **Accessibility mapping:** how Compose Multiplatform (current stable) exposes semantics on iOS: `Modifier.testTag` vs `accessibilityIdentifier` (including `testTagsAsResourceId`-style opt-ins), `contentDescription`, roles, merged vs unmerged semantics, and lazy lists, with the version where each behavior landed.
- **Through MobileBuildMCP 2.7.1:** whether its compact and full captures surface those identifiers, labels, and roles, and any known gaps (the whole Compose canvas as one element, off-screen lazy items, text fields).
- **Candidate apps:** open-source Compose Multiplatform iOS apps (for example the JetBrains samples) that build for the simulator with current Xcode, have realistic flows (lists, forms, navigation, text entry), and have licenses that allow use as a fixture. Rank two or three.
- **Mixed apps:** what changes when Compose is hosted inside SwiftUI (`ComposeUIViewController`) or SwiftUI inside Compose.

## Answer

Findings: [`docs/research/compose-multiplatform-ios.md`](../../../docs/research/compose-multiplatform-ios.md) (commit `db6bd03`). Read-only research from source, changelogs, and docs; no simulator capture was taken. The note ends with nine open questions that only a live capture can settle.

- **Semantics:** since Compose Multiplatform 1.8.0, the iOS accessibility tree needs no opt-in; it is built on demand and dropped after about 2 s idle. Apps on versions below 1.12.1 can crash when a client reads a stale element.
- **Mapping:** `Modifier.testTag` always becomes `accessibilityIdentifier` (no merging up to parents). Labels come from `contentDescription` or text; merged rows join up to five child texts with ", ". A text field's value is its edited text (1.10.0+).
- **Roles are UIKit traits:** Checkbox, RadioButton, and Tab all appear as Button, with state shown as Selected. Headings and tag-only containers probably come through as role `other`, which compact captures drop; full captures keep them.
- **MobileBuildMCP 2.7.1** has no Compose-specific handling. Lazy rows that haven't been built don't exist, and off-screen built rows are `visible: false`. Repeating a tag on every row makes selectors ambiguous. Two things are open: whether text fields surface as `text-field`, and whether merged children are traversed.
- **Mixed apps:** Compose inside SwiftUI gives one tree. Native views inside Compose are invisible by default (`isNativeAccessibilityEnabled = false`), and web views are invisible either way.
- **Guide and bridge:** require Compose Multiplatform 1.8.0+ and recommend 1.12.1+; put tags on the clickable or editable node and keep them unique per row. No bridge change appears to be needed (pending live confirmation).
- **Candidate app:** **Alkaa** (`igorescodro/alkaa` at `8524e06`, Apache-2.0, CMP 1.10.3, iOS 26.0+): offline, Compose-only, with lists, bottom navigation, and text-entry forms, and CI that already builds for the simulator. Use a pinned fork with stable tags, raised to CMP 1.12.1 if possible. Runners-up: JetBrains `examples/imageviewer` and Todometer. Mixed-shell check: JetBrains `examples/chat` with its bot disabled.
