# Actions across Android versions

Type: task
Status: open
Blocked by: 01

## Question

Which commands perform tap, replace text and swipe reliably on Android 12 through 16, and what does the driver do after each action?

- **Replace text:** Ctrl+A (`input keycombination 113 29`) needs API 33+. Find a select-all that works on Android 12 (API 31/32) on an emulator image created for this, not the Xiaomi. Also check the typed value's exactness, fields that reformat input, and password fields.
- **Tap:** by coordinates at the element's centre, or by mobilecli ref. Compare staleness and speed.
- **Swipe:** within an element's bounds, in each direction, on a scrollable list.
- **Typing speed:** the spike measured 4.8 s for 17 characters. Is there a faster path?
- **After an action:** mobilecli returns no settled screen. Decide whether the next capture waits for the screen to settle, and how animations affect dumps (with emulator animations on and off).
