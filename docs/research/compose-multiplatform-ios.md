# Compose Multiplatform on iOS through MobileBuildMCP

Researched: 2026-09-25 · Sources:

- **Compose Multiplatform core**, `github.com/JetBrains/compose-multiplatform-core`, sparse checkout of `compose/ui/ui/src/` and `compose/ui/ui-uikit/` at tag `v1.12.1` (`a1a7f35`, 2026-09-15). This is the iOS runtime that turns Compose semantics into `UIAccessibility` objects.
- **Compose Multiplatform release notes**, `github.com/JetBrains/compose-multiplatform/CHANGELOG.md` at `06b8f82` (2026-09-24). Current stable is **1.12.1 (September 2026)**; 1.13.0-alpha01 is the newest prerelease. Pull request descriptions for #1719, #2243, #2331, #2416, #2848, #2916, #3214 and #3403 were read with `gh pr view`.
- **Kotlin Multiplatform docs**, fetched 2026-09-25: "Support for iOS accessibility features" (`kotlinlang.org/docs/multiplatform/compose-ios-accessibility.html`, page dated 22 July 2025) and "What's new in Compose Multiplatform 1.8.2" (`…/whats-new-compose-180.html`). context7 (`/jetbrains/kotlin-multiplatform-dev-docs`) was tried first; its index still shows the removed `AccessibilitySyncOptions` API, so every claim below is taken from the live page or the source.
- **MobileBuildMCP**, `github.com/getsentry/MobileBuildMCP` at tag `v2.7.1` (`d13ff0c7`), the version the bridge pins. Bundled AXe is `1.8.0` (`.axe-version`).
- **AXe**, `github.com/cameroncooke/AXe` at `v1.8.0` (`30f4bfa`), plus AXe issues #43 (closed), #50 (closed) and #65 (open).
- **Candidate apps**: the repositories listed in §3, cloned shallowly and read on 2026-09-25.
- **This repo**: `docs/research/mobilebuildmcp-simulator-and-device.md` (cited as `MBM:<line>`), `docs/adr/0002-mobilebuildmcp-as-device-layer.md`, `src/device/index.ts`, `src/scripted/select.ts`, `src/cli.ts`.

Citation keys (paths are at the commits above):

| Key | Repository | Link form |
| --- | --- | --- |
| `CMP:` | compose-multiplatform-core | `https://github.com/JetBrains/compose-multiplatform-core/blob/v1.12.1/<path>#L<line>` |
| `CL:` | compose-multiplatform `CHANGELOG.md` | `https://github.com/JetBrains/compose-multiplatform/blob/06b8f82/CHANGELOG.md` |
| `MB:` | MobileBuildMCP | `https://github.com/getsentry/MobileBuildMCP/blob/v2.7.1/<path>#L<line>` |
| `AXE:` | AXe | `https://github.com/cameroncooke/AXe/blob/v1.8.0/<path>` |

`CMP:` paths are shortened: `A11y.kt` is `compose/ui/ui/src/iosMain/kotlin/androidx/compose/ui/platform/Accessibility.ios.kt`; `NodeUtils.kt` and `ConfigUtils.kt` are `SemanticsNodeUtils.ios.kt` and `SemanticConfigurationUtils.ios.kt` in the `accessibility/` folder beside it; `CompTest.kt` is `compose/ui/ui/src/uikitInstrumentedTest/kotlin/androidx/compose/ui/accessibility/ComponentsAccessibilitySemanticTest.kt`.

**No simulator or device was operated.** Everything here is from reading source, release notes and docs. Statements marked *Inference* follow from that reading but have not been observed in a capture. §6 lists what a live capture must settle.

## Answer

1. **Compose Multiplatform 1.8.0 or later exposes a real per-node accessibility tree on iOS, with no opt-in.** `Modifier.testTag` becomes `accessibilityIdentifier` unconditionally; there is no iOS counterpart of Android's `testTagsAsResourceId`. Labels come from `contentDescription` or text, joined TalkBack-style across up to five descendants. Values come from the edited text, the state description, or progress. Roles are UIKit traits, not Compose `Role`s: Checkbox, RadioButton and Tab all look like plain buttons. The tree is built on the first request from any accessibility client and dropped after about 2 s without reads. Before 1.8.0, the tree synced only while an accessibility service was running unless the app opted in with `AccessibilitySyncOptions.Always`.
2. **MobileBuildMCP 2.7.1 should see those elements, but no capture proves it yet.** Its snapshot takes `AXUniqueId` as `identifier`, `AXLabel` as `label` and `AXValue` as `value`, and derives `role` from the AX type strings. Nothing in its source is specific to Compose. The known gaps are structural rather than Compose bugs. A lazy list only exposes composed rows. Rows outside the viewport come back `visible: false`. Headings and plain tagged containers probably come back as `other`, which compact captures omit. Labels on merged rows are comma-joined, so exact label selectors are brittle. Compose apps older than 1.12.1 can crash when an accessibility client reads a disposed element.
3. **Recommended evidence app: Alkaa** (`igorescodro/alkaa`, Apache-2.0, CMP 1.10.3), used as a pinned fork with stable test tags added. It is the only candidate that is offline, Compose-only on iOS, has lists, bottom navigation and several text-entry forms, and whose CI already runs `xcodebuild -sdk iphonesimulator`. Runners-up are JetBrains' `examples/imageviewer` (CMP 1.12.0, offline, but its CI never builds the iOS app and it has little text entry) and Todometer (CMP 1.12.0, rich forms, but no iOS CI). JetBrains' `examples/chat` is the only mixed SwiftUI/Compose shell found, and it is non-deterministic.
4. **Mixed apps work, with caveats.** Compose hosted in SwiftUI (`ComposeUIViewController`) gives one tree containing native chrome (navigation bar, back button, tab bar) plus Compose nodes. AXe 1.7.0 fixed missing SwiftUI back buttons and tab items, and 2.7.1 bundles 1.8.0. SwiftUI or UIKit hosted inside Compose (`UIKitView`, `UIKitViewController`) is **invisible to accessibility by default**, because `isNativeAccessibilityEnabled` defaults to `false`. Web views are invisible to AXe's tree walk whatever hosts them.

The guide, and "Compose app evidence plan", should require **CMP ≥ 1.8.0, recommend ≥ 1.12.1**, and tell authors to put `testTag` on the clickable or editable node itself.

## Findings

### 1. How Compose Multiplatform exposes semantics on iOS

#### 1.1 The tree and when it exists

| Version | What changed (iOS) | Source |
| --- | --- | --- |
| 1.6.0 (Feb 2024) | First iOS accessibility support ("Basic accessibility support", PR #1025). The docs describe it as "semantics data produced by Compose APIs is now mapped to native objects and properties". | `CL:` 1.6.0 / 1.6.0-beta02 `<sub>iOS</sub>`; kotlinlang accessibility page |
| 1.6.x–1.7.x | The tree syncs according to `AccessibilitySyncOptions`. Per the docs, with default settings "the iOS accessibility tree is synchronized with the UI only when Accessibility Services are running". Test automation had to opt in with `Always`. | kotlinlang accessibility page, "Choose the tree synchronization option" (marked 1.7.3 and earlier) |
| 1.8.0 (May 2025) | `AccessibilitySyncOptions` removed. "The tree is fully loaded after the first request from the iOS accessibility engine and is disposed of when the screen reader stops interacting with it." | `CL:` 1.8.0 iOS, PR #1780; "What's new 1.8.2" |
| 1.8.0 | "Align Compose components semantics with UIKit views accessibility" (#1719), traversal groups as `UIAccessibilityContainerTypeSemanticGroup` (#1809), text field traits (#1875), traversal inside scrollable containers (#1837). Content under a dialog or popup is no longer read (#1698). | `CL:` 1.8.0 iOS |
| 1.9.0 (Sep 2025) | "Do not flatten accessibility tree inside accessibility elements" (#2243). The PR fixes CMP-8463, a 1.8.1 regression that lost parent–child structure. | `CL:` 1.9.0 iOS |
| 1.9.1 (Oct 2025) | "Add ability to reach internal accessibility elements inside accessibility nodes" (#2416). The PR says: "Unlike Accessibility Engine, UI Automation uses different approach to get content inside accessibility elements … Add ability for UI Automation to reach child elements". | `CL:` 1.9.1 iOS; PR #2416 |
| 1.10.0 (Jan 2026) | "Align the semantics of TextFields with iOS text inputs" (#2331). The PR says: "Use accessibility value instead of accessibility label for TextField semantics." Merged-node text fixes (#2539). | `CL:` 1.10.0 iOS |
| 1.11.0 (May 2026) | Traversal groups become an extra node in the hierarchy (#2848). "The structure of accessibility elements is now better aligned with Android semantic nodes" (#2916). Link semantics (#2649). Opt-in native UIKit text input `PlatformImeOptions.usingNativeTextInput` (#2602). | `CL:` 1.11.0 iOS |
| 1.12.0 (Aug 2026) | Fix for a rare crash when iOS reads a disposed `AccessibilityElement` (#3214). The PR fixes CMP-10406, an `EXC_BAD_ACCESS` "when AX queries …". "Focusable nodes inside merged semantics remain focusable" (#3089). | `CL:` 1.12.0 iOS |
| 1.12.1 (Sep 2026) | "Fix crash when iOS reads `AccessibilityElement`'s properties after disposal" (#3403). The PR fixes CMP-10615, where the 1.12.0 `isAlive` guard "cannot prevent the crash". | `CL:` 1.12.1 iOS |

The tree changed shape in 1.8.1, 1.9.0, 1.11.0 and 1.11.0 again (#2848, #2916). Fixture expectations are therefore specific to one CMP version. *Inference:* pin CMP in the fixture, and re-capture whenever it moves.

**How the tree is served (1.12.1 source).**
- The Compose view's `accessibilityElements` is a single `AccessibilityRoot` (`CMP:A11y.kt#L1262`).
- Any call to the root's `accessibilityElements()` runs `activateAccessibilityIfNeeded()`, which builds the tree synchronously if it is absent (`#L466-472`, `#L1343-1349`).
- After each sync, a job disposes the whole tree if no read arrives within `2.seconds`, "assumed that iOS Accessibility has been disabled" (`#L1314-1329`, `#L1413-1426`).
- The tree is only enabled for the focused layer (`ComposeContainer.ios.kt#L382-389`). A focusable dialog or popup layer disables the layers under it.
- On iOS 17+, each element also calls `setAutomationElements(children …)` (`#L581-583`, `#L603-605`). This is the #2416 path that lets UI automation reach children of an element VoiceOver treats as a leaf.

*Inference:* any AX client that asks for the Compose view's children, AXe included, should trigger the build, and a snapshot taken more than 2 s after the previous one rebuilds from scratch. That rebuild-and-dispose cycle is exactly the one the 1.12.0 and 1.12.1 crash fixes cover, which is why the guide should recommend ≥ 1.12.1.

#### 1.2 Which nodes become elements

- **The flattened hierarchy.** The iOS tree is built from `owner.unmergedRootSemanticsNode` (`CMP:A11y.kt#L1690`). Nodes are flattened under the nearest traversal group or root, keeping Android's traversal order (`#L1509-1555`). Nodes that are accessibility elements keep their own children (since 1.9.0, #2243).
- **What an element must carry.** A node is an accessibility element (`isAccessibilityElement = true`) when it is not hidden and either merges descendants, or is "actionable" (click, long-click, set-text, focus, …) *and* "speaking" (content description, text, editable text, state, toggle, selection, progress). The rules are in `CMP:NodeUtils.kt#L295-359`, with the lists at `#L331-356`.
- **Nodes that carry only `testTag` still appear.** They are present as non-element objects (`isAccessibilityElement = false`) that keep their identifier. The source proves it with `Image(contentDescription = null, Modifier.testTag("Image 1"))`, which is expected as `isAccessibilityElement = false, identifier = "Image 1"`, no traits (`CMP:CompTest.kt#L340-378`).
- **Hidden nodes are skipped.** `hideFromAccessibility()` and `invisibleToUser()` nodes are never elements (`NodeUtils.kt#L373-375`; fixed in 1.8.0 and 1.9.0).

#### 1.3 Identifier, label, value, role

| iOS property | Compose source | Where |
| --- | --- | --- |
| `accessibilityIdentifier` | `SemanticsProperties.TestTag` from the node's **merged** config, else the tag of a `LinkAnnotation.Clickable` | `CMP:A11y.kt#L247-249` |
| `accessibilityLabel` | If the node is an element, a ", "-joined collection of content descriptions from itself and its child elements, stopping at 5 nodes. Otherwise its own `contentDescription`, else its `Text` (never `Text` for editable nodes). | `A11y.kt#L2051-2141` (`MAX_TEXT_COLLECT_NODES = 5` at `#L2076`); `NodeUtils.kt#L398-418` |
| `accessibilityValue` | `stateDescription`; else for text fields the `EditableText`; else progress as a percentage | `ConfigUtils.kt#L145-172` |
| `accessibilityHint` | the `onClick` action label | `A11y.kt#L251-252` |
| `accessibilityTraits` | see the next table | `ConfigUtils.kt#L60-142` |

**`testTag` never merges upward.** Its merge policy is `{ parentValue, _ -> parentValue }`, commented "Never merge TestTags, to avoid leaking internal test tags to parents" (`compose/ui/ui/src/commonMain/…/semantics/SemanticsProperties.kt#L203-211`). A tag on a `Text` inside a clickable `Row` stays on that `Text`'s node. It does not name the row. **There is no opt-in flag.** `testTagsAsResourceId` exists only in `androidMain`; nothing under `iosMain` reads it.

**Traits (the only "role" iOS receives).**

| Compose semantics | UIKit trait(s) | Source |
| --- | --- | --- |
| `onClick` (clickable, `Button`, `IconButton`, `Checkbox`, `RadioButton`, `Tab`, `Switch`) or `Role.Button` | `Button` | `ConfigUtils.kt#L103-117` |
| `Role.Switch` | adds `ToggleButton`, iOS 17+ only | `#L126-130` |
| `selected = true` or `ToggleableState.On` | adds `Selected` | `#L79-96` |
| `Role.Image` | `Image` | `#L123` |
| `Role.DropdownList`, or a progress bar with `setProgress` (Slider) | `Adjustable` | `#L98-101`, `#L120` |
| `heading()` | `Header` | `#L85-87` |
| `disabled()` | `NotEnabled` | `#L75-77` |
| `EditableText` (every text field) | private text-entry trait `(1<<18)|(1<<47)`, plus "is editing" `1<<21` while focused | `#L20-21`, `#L103-107` |
| plain `Text` with no other trait | `StaticText` | `#L134-140` |
| `Role.Checkbox`, `Role.RadioButton`, `Role.Tab`, `Role.ValueControl`, `Role.Carousel` | **no trait of their own** | absence in `#L112-132` |

The instrumented tests confirm the component-level result. `Switch` is Button (+ToggleButton on 17+), `Checkbox` is Button, a checked `TriStateCheckbox` and a selected `RadioButton` are Button+Selected, and a clickable `Text` is Button with its text as label (`CMP:CompTest.kt#L180-222`, `#L267-337`, `#L382-404`).

#### 1.4 Merged versus unmerged semantics

- **A merged node is one element.** A clickable `Row`/`Card`, a `Button`, or `Modifier.semantics(mergeDescendants = true)` is an element whose label joins its children's texts ("Title, Subtitle, Date"). Its identifier is only the tag set on that node.
- **Children stay reachable on iOS 17+.** Since 1.9.0 and 1.9.1, children inside the element keep their structure and are exposed to UI automation through `automationElements`. They are not accessibility elements themselves: `canBeAccessibilityElement` returns false for a speaking child under a merging or actionable parent (`NodeUtils.kt#L309-327`).
- *Inference:* a capture may contain both a `Save` button and a `Save` text inside it. Scripts should select with `role` as well as `label`, or by `identifier`.

#### 1.5 Lazy lists

- **Only composed rows exist.** Compose builds semantics only for composed nodes, so rows that `LazyColumn` has not composed are absent from the tree.
- **Composed rows outside the viewport are still exported.** Their frame is the unclipped bounds, and they are only focusable when accessibility focus sits in the same scroll container (`A11y.kt#L1532-1542`, `#L1625-1633`, `#L356-365`).
- **The list element scrolls through actions.** It advertises `UIFocusItemScrollableContainer` with content offset and size (`A11y.kt#L385-432`, `#L563-569`). It implements `accessibilityScroll` through `PageUp`/`PageDown` or `ScrollBy` (`NodeUtils.kt`, `scrollIfPossible`). Since 1.8.0 it has page-scroll announcements and traversal inside scroll containers (#1644, #1837, #1986).
- The docs' own example of lists is VoiceOver paging, not automation.

#### 1.6 Text fields

- **Label and value.** A Compose `TextField`, `OutlinedTextField` or `BasicTextField` node carries `EditableText`, so it gets the private text-entry trait. Its value is the current text (since 1.10.0, #2331). Its label is its `contentDescription`, or the joined texts of its child elements, such as the Material `label` slot.
- **Two input paths.** Text input goes through Compose's own UIKit text-input view by default. 1.11.0 added an opt-in native UIKit editing mode (`usingNativeTextInput`), which changes the editing view.
- *Inference:* a text field's label may include the placeholder while it is empty and drop it once text is typed. That makes `label` a poor selector for fields; `identifier` is stable.

### 2. What MobileBuildMCP 2.7.1 captures

#### 2.1 The capture path

- **AXe reads the tree.** It reads the frontmost app's tree through FBSimulatorControl, retrying up to five times until the tree has descendants (`AXE:Sources/AXe/Utilities/AccessibilityFetcher.swift`, `fetchFrontmostAccessibilityInfoJSONData`).
- **Field mapping.** MobileBuildMCP flattens that tree depth-first and maps each node:
  - `label` from `AXLabel`/`title`/`help`/`label`;
  - `value` from `AXValue`/`value`;
  - `identifier` from `AXUniqueId`/`AXIdentifier`/`identifier`/`id` (`MB:src/mcp/tools/ui-automation/shared/runtime-snapshot.ts#L271-273`);
  - `role` by regex over the joined `role`, `type`, `subrole` and `role_description` strings (`#L107-144`).
- **Nothing Compose-specific.** The repo contains no Compose, Kotlin, Flutter or React Native code or docs (`$ grep -ri` over the v2.7.1 tree found none).

*Inference, to confirm live:* a Compose element's `accessibilityIdentifier` should arrive as `identifier`, its label as `label`, and its value as `value`, because AXe serializes the same UIAccessibility properties for every app.

**Roles as MobileBuildMCP will name them.** The trait → AX type step happens inside Apple's accessibility bridge, and no Compose capture has been seen. The table below follows `deriveRole` (`#L107-144`) and the traits in §1.3.

| Compose node | Traits | Expected rs/1 `role` | Confidence |
| --- | --- | --- | --- |
| `Button`, clickable row/card, `IconButton`, `Checkbox`, `RadioButton`, `Tab` | Button (+Selected) | `button` | high: AX type contains "Button" |
| `Switch` on iOS 17+ | Button+ToggleButton | `button` or `switch` | open. `switch` changes tapping to a coordinate `touch` (`MB:…/shared/semantic-tap.ts#L76,102-110`) |
| `TextField` / `BasicTextField` | private text-entry trait | `text-field` if AX reports a text-field type | open: the trait is private, so this is the key capture question |
| `Text` | StaticText | `text` | high |
| `heading()` `Text` | Header only | probably `other` ("heading" matches no pattern) | open |
| `Image` with `contentDescription` | Image | `image` | high |
| testTag-only container, `LazyColumn` | none, not an element | `other`, possibly `scroll-view` via inference | open |

`selected` state and `enabled` come through as `state.selected` and `state.enabled` when AXe reports them (`runtime-snapshot.ts#L235`, `readState`). `NotEnabled` should surface as `enabled: false`.

#### 2.2 Compact versus full

- **Full capture** (`--verbose`, which the scripted path uses: `src/cli.ts#L33`) carries every flattened node, with `frame`, `state` and `actions`. `src/scripted/select.ts` requires `state.visible === true` and a non-zero frame. Compact rows carry neither (`src/device/index.ts#L87-104`), so scripted selection only works on full captures.
- **Compact capture** keeps only:
  - tap and type targets;
  - swipe-only scroll areas;
  - elements with role `text`.

  Each list is capped at 64, 32 or 64 rows (`MB:src/utils/structured-output-envelope.ts#L230-271`). *Inference:* a Compose heading that maps to `other`, a tagged container, and an `image` without an action never appear in compact output. They do appear in full.

#### 2.3 Gaps specific to Compose

1. **The whole canvas as one element.** This happens when the app is older than 1.6.0, or on 1.6–1.7 without `AccessibilitySyncOptions.Always`. It also happens on current versions for any area drawn without semantics: a custom `Canvas`, or an image with `contentDescription = null` and no tag. *Inference:* 1.6–1.7 apps would show an empty Compose container unless AXe counts as "Accessibility Services running". Treat pre-1.8 as unsupported.
2. **Off-screen lazy rows.**
   - Uncomposed rows do not exist, so scripts must scroll (`swipeWithin`) and re-observe.
   - Composed rows beyond the viewport get their unclipped frame. MobileBuildMCP then sets `visible: false` and strips their actions (`runtime-snapshot.ts#L466-494`).
   - The bridge then reports `TARGET_UNAVAILABLE` or `GUARD_MISSING` for them, which is the right behaviour, but the guide must say "scroll first".
   - A partly visible row gets its clipped frame (`A11y.kt#L1563`) and stays actionable.
3. **Scrolling a Compose list.** MobileBuildMCP gives `swipeWithin` only to roles `scroll-view`, `list` and `cell`. It can also give it to a container of at least 120×120 pt whose descendants overflow it (`#L185-213`, `#L320-328`, `#L497-560`). *Inference:* whether a `LazyColumn` gets `swipeWithin` depends on the AX type Apple reports and on whether beyond-bounds rows are exported. The viewport-level fallback swipe (`#L530-550`) is the backstop.
4. **Merged-label brittleness.** A card's label is up to five joined texts, and it changes when any of them changes. Selecting cards by `label` breaks on data changes. Use `testTag` on the clickable node.
5. **Duplicate identifiers.** A tag set inside a `LazyColumn` item template (`Modifier.testTag("row")`) repeats on every row. Both the bridge (`TARGET_AMBIGUOUS`) and AXe (`--id` ambiguity; AXe #50) then refuse to pick. MobileBuildMCP falls back to a coordinate tap when the selector is ambiguous (`semantic-tap.ts`). Tags must be unique per row, such as `"row-${id}"`.
6. **Text entry.**
   - `type-text` taps the field to focus it, then sends HID keys through AXe. Only US-keyboard characters are allowed (`MB:src/mcp/tools/ui-automation/type_text.ts#L45`).
   - `--replace-existing` sends ⌘A (`key-combo --modifiers 227 --key 4`, `#L156-163`) before typing.
   - *Open:* whether a Compose `BasicTextField` honours ⌘A from a hardware-keyboard HID event on the simulator, in both the default and `usingNativeTextInput` modes.
7. **The disposal crash.** Apps on CMP < 1.12.1 can crash when an AX client reads an element after the tree was disposed (#3214, #3403). MobileBuildMCP polls after every action, which *may* make this more likely than it is under VoiceOver.
8. **Dialogs and sheets.** A Compose `Dialog` or `Popup` is a separate layer that disables the layers under it (1.8.0 #1698; `ComposeContainer.ios.kt#L382-389`). *Inference:* while a Compose dialog is open, screen guards will not find elements from the screen behind it. That is correct, but surprising if the author expects them.

### 3. Candidate apps

Every repository below was shallow-cloned on 2026-09-25 and read, not built.

Each candidate was checked for five things:
- the iOS UI is Compose, hosted by `ComposeUIViewController`;
- the iOS project builds for the simulator;
- it has a list, navigation and text entry;
- it needs no network, keys or account;
- its license allows copying it as a fixture.

"Builds" below means the repo's own CI or Xcode project says so. Nobody ran it here.

#### Ranking

**1. Alkaa (task manager), `github.com/igorescodro/alkaa` at `8524e06` (2026-05-25). Recommended.**

- *License:* Apache-2.0 (`LICENSE`).
- *Versions:* Kotlin 2.3.21 and CMP **1.10.3** (`gradle/libs.versions.toml:8,39-44`), with Material3 `1.10.0-alpha05`.
- *iOS build:* direct integration. The Xcode project calls Gradle (`ios-app/alkaa.xcodeproj/project.pbxproj:175`). There is no CocoaPods, SPM or Firebase. `ContentView.swift` only hosts `MainViewController()`, so it is not a mixed shell.
- *CI:* runs `xcodebuild … -scheme alkaa -sdk iphonesimulator` on `macos-latest` (`.github/workflows/build.yml`, job `build-ios`).
- *Data:* local SQLDelight, with categories seeded on first launch. No network or keys.
- *Flows:*
  - task and tracker lists, and a category grid;
  - bottom navigation with five sections;
  - text entry: the add-task bar, task title and description, a category form in a bottom sheet, and search.
- *Tests to reuse:* shared UI tests (`TaskFlowTest`, `CategoryFlowTest`, `SearchFlowTest`) already script these flows by visible text.
- *Existing tags:* 3 `testTag`s and about 55 `contentDescription`s:
  - `Search.kt:221` is `testTag("search_bar")`;
  - `CategoryItemChip.kt:87` uses `testTag(name)`;
  - `HomeScreen.kt:159` uses `testTag(title.toString())` on a `StringResource`. *Inference:* that tag would render as an object string, not a stable id.
- *Risks:*
  - The app target sets `IPHONEOS_DEPLOYMENT_TARGET = 26.0` (pbxproj `:330,372`), so it needs an iOS 26 runtime. This Mac's benchmark simulator is iOS 26.4.
  - CMP 1.10.3 predates the 1.12.x disposal-crash fixes.
  - Its custom semantics keys (`checkboxName`, `color`) are invisible to iOS.
  - The alarm flow triggers a notification-permission prompt.
  - The last commit is four months old.

**2. JetBrains `examples/imageviewer`, `github.com/JetBrains/compose-multiplatform` at `06b8f82` (2026-09-24).**

- *License:* Apache-2.0.
- *Versions:* Kotlin 2.4.20 and CMP **1.12.0** (`examples/imageviewer/gradle.properties`).
- *iOS build:* direct integration; `main.ios.kt` uses `ComposeUIViewController`.
- *Data:* offline, with 35 images bundled in `composeResources`.
- *Flows:* a gallery grid/list toggle, a detail screen, fullscreen, and an edit dialog with two `TextField`s (`EditMemoryDialog.common.kt:53,67`). Navigation uses Navigation 3.
- *Existing tags:* `toggleGalleryStyleButton`, `squaresGalleryView` and `listGalleryView` (`GalleryScreen.kt:149,198,268`).
- *Risks:*
  - Repo CI only links the iOS framework (`linkIosArm64` in `examples/validateExamplesIos.sh`) and never runs `xcodebuild` for the simulator.
  - The README still says `podInstall`.
  - The camera page, the MapKit view and the camera and location permission prompts must be kept out of scripts.
  - It has little form entry.

**3. Todometer, `github.com/serbelga/Todometer-KMP` at `0b46dd6` (2026-09-09).**

- *License:* Apache-2.0.
- *Versions:* Kotlin 2.4.20 and CMP **1.12.0** (`gradle/libs.versions.toml:15,33`).
- *iOS build:* direct integration (`app/ios/Todometer.xcodeproj/project.pbxproj:154`).
- *Data:* offline SQLDelight.
- *Flows:* add and edit task, task lists, details and settings, with about 13 text fields. It is the richest set of forms here.
- *Existing tags:* an `elementId()` wrapper around `testTag`, used once.
- *Risks:*
  - There is no iOS CI; only Android and Wear builds run.
  - The README gives a stale iOS path.
  - It has almost no accessibility code.

#### Evaluated but not ranked

- **KotlinConf app** (`JetBrains/kotlinconf-app` `248474d`, Apache-2.0, CMP 1.11.1). It has the best semantics usage seen: 92 `semantics` calls with roles, `heading()` and `liveRegion`, and its CI builds for the simulator. It is not ranked because it loads content from the live `kotlinconf-app-prod.labs.jb.gg` backend and configures Firebase through SPM. It is useful as a pattern source, not a fixture.
- **JetBrains `examples/chat`.** A **mixed shell**: a SwiftUI `TabView`, Compose screens, and a SwiftUI message `TextField`. `ChatViewController()` passes `displayTextField = false`; see `iosApp/iosApp/ComposeInsideSwiftUIScreen.swift` and `shared/src/iosMain/kotlin/main.ios.kt`. It is not ranked because a bot posts random messages on a timer, which is not deterministic. It is a candidate for the one mixed-shell check, if the bot is disabled.
- **JetBrains `examples/nav_cupcake`.** Offline, with `NavHost` and radio-button option screens, but no text field and no iOS CI.
- **KMP-App-Template** (`Kotlin/KMP-App-Template`, CMP 1.11.1). It fetches `list.json` from GitHub and has no text entry.
- **Confetti.** Needs a backend, Firebase and sign-in.
- **PeopleInSpace.** Its iOS app is SwiftUI with one Compose map, and it uses the network.
- **Tivi.** Archived since 2024, CMP 1.7.0, needs keys.
- **Fruitties and kmp-production-sample.** Their iOS UI is SwiftUI.
- **`compose-multiplatform-ios-android-template`.** Stale (2023) and trivial.
- **`compose-multiplatform-core` `compose/mpp/demo`.** It has iOS accessibility and TextField demos, but it builds from the AOSP-style monorepo, which is too heavy for a fixture.

#### Fixture work (inference)

Fork Alkaa at a pinned commit, then:
1. Bump CMP to 1.12.1 if its Kotlin and Material3 pins allow it. Otherwise record 1.10.3 as a known-crash-exposure version.
2. Replace `testTag(title.toString())` with stable ids.
3. Add unique tags to the add-task field, save button, task rows (`task-<id>`), detail fields, category form and search results.
4. Replace the custom semantics keys with `stateDescription` or `contentDescription`.
5. Seed a fixed data set.
6. Keep scripts away from the alarm and permission flow.

The existing untagged screens are still worth one script. That script shows what an untouched third-party Compose app looks like to the bridge, using only labels and roles.

### 4. Mixed SwiftUI and Compose apps

**Compose inside SwiftUI or UIKit (`ComposeUIViewController` in `UIViewControllerRepresentable`, or pushed).**
- *One tree.* The Compose view is an ordinary UIView whose single accessibility child is the Compose root (`A11y.kt#L1262`). AXe walks the frontmost app, so native chrome and Compose nodes land in one flat rs/1 list. The bridge needs no change for this.
- *Native chrome.* The native `NavigationStack` bar, back button, `TabView` items and toolbar controls are SwiftUI elements. AXe 1.7.0 fixed `describe-ui` "exposing and activating real SwiftUI `TabView` tab items, navigation search fields, toolbar segmented picker items, and generated navigation back buttons" (`AXE:CHANGELOG.md` v1.7.0; issue #43). MobileBuildMCP 2.7.1 bundles AXe 1.8.0, so those now show up.
- *Identifiers from both sides.* SwiftUI `.accessibilityIdentifier` and Compose `testTag` share one namespace in the capture. Collisions are the author's to avoid.
- *One tree per Compose screen.* In a native-shell app each Compose screen is its own `ComposeUIViewController` with its own `AccessibilityMediator`, tree, 2 s disposal, and CMP crash exposure. *Inference:* screens covered by a pushed screen or a non-selected tab are normally removed from the window by UIKit, so they should not appear in captures.
- *Keyboard avoidance.* `ComposeUIViewController(configure = { onFocusBehavior = … })` controls whether Compose scrolls to a focused field. When native chrome owns layout, a field may end up under the keyboard. MobileBuildMCP then marks it as not tappable if its activation point leaves the viewport.

**SwiftUI or UIKit inside Compose (`UIKitViewController { UIHostingController(...) }`, `UIKitView`).**
- *Hidden by default.* `UIKitInteropProperties.isNativeAccessibilityEnabled` defaults to `false`, meaning accessibility uses Compose semantics for the interop area instead of traversing the native view (`CMP:…/viewinterop/UIKitInteropProperties.ios.kt#L30-31,L66`). With the default, **the embedded SwiftUI view's own elements and identifiers are not in the tree**. Only whatever `Modifier.semantics` the Compose side attached is visible.
- *Opting in has limits.* With `true`, the native subtree replaces the whole merged Compose subtree around it. Only the first native-accessible interop view in a merged subtree is exposed (`UIKitInteropProperties.ios.kt#L41-59`).
- *Older API.* The pre-1.7 `UIKitView(accessibilityEnabled = true)` parameter is deprecated in favour of these properties (`CMP:…/interop/UIKitView.ios.kt#L52-116`).
- *Touch delay.* Interop views receive touches through a cooperative 150 ms delay by default. *Inference:* a tap on an embedded native control may need a longer settle before the next observation.
- *Web views.* A `WKWebView`, whether native or hosted in Compose, exposes none of its page content to `describe-ui` (AXe #65, open).

### 5. Consequences for the plan

- **The guide's selector rules for Compose.**
  1. Use CMP ≥ 1.8.0, preferably ≥ 1.12.1.
  2. Put `Modifier.testTag` on the clickable or editable node, not on an inner `Text`.
  3. Make tags unique per list row.
  4. Select fields by `identifier` or `role: "text-field"`, not by label.
  5. Expect Checkbox, RadioButton and Tab to be `button`, with checked or selected state in `state.selected`.
  6. Scroll before selecting a row that is not yet on screen.
  7. Do not select embedded SwiftUI in Compose unless the app sets `isNativeAccessibilityEnabled = true`.
- **Bridge changes.** None is indicated by source reading. The selector fields (`identifier`, `role`, `label`, `value`) and full capture cover Compose if the open questions below come out as expected. A `role` other than those in §2.1 would need guide text, not code.
- **Evidence plan.** Pin the CMP version of the chosen app, and record one full capture per screen. The first capture should answer the open questions below before scripts are written.

### 6. Open questions that need a live capture

Each item needs one full `snapshot-ui --output json --verbose` of a Compose screen on the pinned simulator. The raw AXe `describe-ui` output for the same screen would also help.

1. **Does AXe see Compose nodes at all on first read?** Does the lazily built tree appear on the first `describe-ui`, or only after AXe's retry? Does a second capture more than 2 s later rebuild it without error?
2. **Text-field role.** Does the private text-entry trait come through as a type that `deriveRole` maps to `text-field`? If it does not, `type-text` is never offered and scripted `typeText` fails with `TARGET_UNAVAILABLE`.
3. **Roles for Switch (iOS 17+), headings, tagged containers and `LazyColumn`.** Which of `button`/`switch`/`other`/`scroll-view`/`list` do they get, and does the list get `swipeWithin`?
4. **Children of merged elements.** Does AXe's walk follow `automationElements` (CMP ≥ 1.9.1) or only `accessibilityElements`? That is, does a `Button("Save")` capture as one element or as a button plus a `Save` text?
5. **Non-element tagged nodes.** Does a node with only `testTag` (`isAccessibilityElement = false`) appear with its identifier in `describe-ui`?
6. **Beyond-bounds rows.** Are composed off-screen rows present, with frames outside the viewport (so `visible: false`), or omitted?
7. **Text-field label after typing.** Does the label keep the Material label text, and does the placeholder drop out? Does ⌘A replace the existing text in both input modes?
8. **Stability under polling.** Does repeated observe and act on a CMP 1.12.1 app stay crash-free for a full script? Is an app on an older CMP version any different?
9. **Mixed shell.** In a SwiftUI-shell app, do native back buttons and tab items plus Compose content appear in one capture with correct frames? Are hidden `ComposeUIViewController`s absent?

## Unverified

- The AX type strings Apple's simulator bridge emits for Compose's traits. Everything in the "Expected rs/1 `role`" column except `button`, `text` and `image` is inference.
- How CMP 1.6–1.7 behaves under AXe. The docs describe "Accessibility Services running", and it is unknown whether AXe's bridge counts.
- Whether the kotlinlang pages have been revised after the dates shown. The accessibility page's date is 22 July 2025.
