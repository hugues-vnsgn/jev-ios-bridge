# Live Compose capture: settle the open questions on a real simulator

Type: task
Status: resolved
Claimed by: Claude Code (owner session)
Blocked by: 04

## Question

Nothing to decide; "Compose app evidence plan" waits on these facts. "Compose Multiplatform on iOS through MobileBuildMCP" answered from source and left nine questions that only a live capture settles (listed at the end of [`docs/research/compose-multiplatform-ios.md`](../../../docs/research/compose-multiplatform-ios.md)). Among them: whether AXe reports Compose text fields as `text-field`, and whether it traverses the children of merged nodes.

**Owner decision (2026-09-25): use the owner's demo app `~/Codes/cmp`** (Compose Multiplatform 1.11.1, bundle ID prefix `org.example.project.cmp`, with `testTag`s, full-screen modals, and number-input and numpad screens) instead of Alkaa. It isn't a git repo: build it, but don't edit its source or upgrade it. Being below 1.12.1, it may hit the stale-element crash. Record it if so.

Build it for the dedicated simulator `0E42FDE2-5E09-42D3-9876-9EF0037FCBE7`, install it with MobileBuildMCP, and take compact and full `mobilebuildmcp@2.7.1` captures of its main, modal, and number-entry screens. Answer each open question with the capture excerpt that settles it; mark any the app can't exercise (for example, lazy lists or mixed SwiftUI) as not covered. Also record the build steps and times.

One agent at a time owns the device. Don't change product code. Store the captures as research assets and link them here.

## Answer

Findings: [`docs/research/compose-cmp-capture.md`](../../../docs/research/compose-cmp-capture.md), with 35 captures in [`docs/research/assets/compose-cmp/`](../../../docs/research/assets/compose-cmp/). `~/Codes/cmp` (Compose Multiplatform 1.11.1, bundle ID `org.example.project.cmp`) built and installed through MobileBuildMCP with no signing or file changes. First build 31.5 s (22 s of it Gradle), rebuild 6.0 s, install 4.9 s, launch 1.6–2.8 s. The app was stopped at the end and the device lock was clear before and after.

1. **First read works:** the first snapshot after launch had the full tree, with every `testTag` as `identifier`. Reads after 3–12 s gaps were identical.
2. **Text fields:** Compose `OutlinedTextField` and an embedded native `UITextField` are both `text-field` with `typeText`. An empty Compose field has **no `value` key**, matching the code review's `value: ''` finding. An empty native field reports its placeholder as `value`.
3. **Roles:** tagged containers and `LazyColumn` are `other`. MobileBuildMCP replaces the list's own swipe target with a full-screen `scroll-view` per Compose layer. Images are `image`; a disabled button has `enabled: false` and no actions. The app has no Switch or heading, so those weren't covered.
4. **Merged nodes:** a button and a `text` child share the same label, so a label-only guard fails as `GUARD_AMBIGUOUS`. Guides must use identifier or role plus label.
5. **Tag-only nodes** appear as `other` with their identifier, in full captures only.
6. **Off-screen rows** are present with `visible: false` and no actions. Off-screen buttons lose their label.
7. **After typing,** a field keeps its label and `value` holds the text. Replace-all works but leaves the iOS edit menu open. Not covered: the placeholder slot and native-input mode.
8. **No stale-element crash** in 122 snapshots and about 25 actions on 1.11.1. There was no 1.12.1 build to compare.
9. **Mixed shell:** SwiftUI navigation and tab chrome weren't covered. Opted-in native `UITextField`s inside Compose appear correctly.

**Problems for "Compose app evidence plan":**
- All five number fields share the identifier `numberInput.field`. The unique tags sit on non-actionable wrappers, so fixing it needs a per-instance identifier in the number-input library.
- The default screen replays about 25 s of modal open/close animation on every launch, so scripts must wait for it or navigate away first.
