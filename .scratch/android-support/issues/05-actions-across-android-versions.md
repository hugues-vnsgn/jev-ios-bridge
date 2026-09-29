# Actions across Android versions

Type: task
Status: resolved
Claimed by: subagent (owner session, 2026-09-28)
Blocked by: 01

## Question

Which commands perform tap, replace text and swipe reliably on Android 12 through 16, and what does the driver do after each action?

- **Replace text:** Ctrl+A (`input keycombination 113 29`) needs API 33+. Find a select-all that works on Android 12 (API 31/32) on an emulator image created for this, not the Xiaomi. Also check the typed value's exactness, fields that reformat input, and password fields.
- **Tap:** by coordinates at the element's centre, or by mobilecli ref. Compare staleness and speed.
- **Swipe:** within an element's bounds, in each direction, on a scrollable list. mobilecli's raw tree has no `scrollable` flag, so a Compose list (a plain `android.view.View`) can't be recognised as a `scroll-view`. Decide how `swipeWithin` finds Compose lists: an upstream mobilecli change, another source for the flag, or a documented limit.
- **Typing speed:** the spike measured 4.8 s for 17 characters. Is there a faster path?
- **After an action:** mobilecli returns no settled screen. Decide whether the next capture waits for the screen to settle, and how animations affect dumps (with emulator animations on and off).

## Comments

- 2026-09-29, from the second spec review: item 8's "250 ms apart" is measured from when the earlier capture **returned** to when the later one **starts**. `settle.py` timestamped each capture before its request, and a capture reads the tree at the end of its ~0.6 s idle wait, so two requests 610 ms apart could read trees 30 ms apart. Replaying the corrected rule on the same 24 timelines: still 0 false settles. On a still screen the matching capture now starts at 0.85–0.94 s, not 0.60–0.66 s (about 0.25 s more, both measured at the request's start), and returns at about 0.90–0.99 s. The spec's phase 4 item 7 carries the corrected rule.

## Answer

Resolved 2026-09-29 with the owner; every recommendation accepted. Measured by a subagent on two emulators, Android 12 (`jev-actions-api31`, API 31) and Android 16 (`Medium_Phone_API_36.1`), using a throwaway Compose probe app. Evidence: [`findings/05-actions.md`](../findings/05-actions.md) and [`findings/05-assets/`](../findings/05-assets/) (scripts, raw results, probe-app sources).

1. **Replace text:** mobilecli `io keys ctrl+a`, a 0.2 s pause, a separate `io keys backspace`, then type. It cleared 20 of 20 Compose fields and every classic field on both versions, and doesn't need the old value's length. On API 31, `input keycombination 113 29` drops Ctrl and types `a`. Sending `ctrl+a backspace` in one call fails on Compose.
2. **Type:** always `mobilecli io text -- <value>`. It's exact for special characters, spaces, a trailing space, `-5`, and non-ASCII text (which it pastes through the clipboard). Values that start with `-` are allowed on Android. `adb shell input text` is not used, because it can't type a literal `%s`.
3. **After typing:** the step records the field's shown value in the report and doesn't fail on a mismatch, because formatting fields legitimately differ (`5551234567` shows as `(555) 123-4567`). Script authors check a value with a guard or a claim, as the typing-guard lesson already says.
4. **Password fields:** the driver reads the real `password` flag (see 6). A password field's content never reaches the report or Jev: only whether it has text. Classic password fields briefly show the last typed character, so the raw text is never used.
5. **Tap:** at the element's centre, by coordinates, from a fresh settled capture (0.011–0.024 s). mobilecli refs are not used: they're slower (0.12–0.20 s), and a stale ref silently tapped the wrong element.
6. **Capture source and `swipeWithin` on Compose lists:** the driver reads the full tree from mobilecli's on-device agent through the `adb forward` mobilecli already opens (about 30 lines, about 0.02 s per dump on a still screen). That keeps the `scrollable` and `password` flags that mobilecli's Go side drops. Compose `LazyColumn`, `LazyRow` and scroll columns report `scrollable=true`, so they map to `scroll-view`. This depends on an internal protocol, so the pin to `mobilecli@1.0.14` (from "mobilecli as a dependency") guards it. Suggesting that mobilecli keep the fields upstream (about 4 lines in one struct) is a later, optional step.
7. **Swipe:** within the element's bounds, from 90% to 10% of its length in the swipe's direction, over 1000 ms. That's repeatable distance with almost no fling. All four directions work on both versions.
8. **Settle rule after every action:** capture until two captures at least 250 ms apart match (status bar ignored), capped at 3 s. When the cap is hit, the step is marked "screen still changing". It never stopped early in 24 runs, and it adds nothing on a still screen (settled at 0.60–0.66 s, including mobilecli's own 500 ms quiet wait).
9. **Animations:** the setup guide calls turning them off optional and faster. It isn't required: the bridge never changes device settings ("How a script names an Android app and device").
10. **Non-English typing comes into scope** for v1.2.0, tested on the emulator (`café`, `Tiếng Việt`, `日本` typed exactly on API 31). Jev's accuracy promise still covers English screens only.

**Speed facts for the spec:** `io text` types 17 characters in 0.09–0.28 s and 100 in 1.2–3.1 s (the spike's 4.8 s for 17 didn't reproduce). The first capture after an action takes 0.55–0.72 s.

**Disk:** the API 31 system image (4.2 GB) and the AVD `jev-actions-api31` (932 MB) are kept for the evidence runs. The owner decides later whether to delete them.
