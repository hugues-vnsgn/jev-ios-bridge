# ReadMe: photo picker (system PHPicker, out of process)

Simulator jev-drives-eval (iPhone 17, iOS 26.4), screenHash `0tsbr3x`. Captured 2026-10-01.

## How reached
1. Launch, tap "Bosch" row (02).
2. Tap "Update Image…".
3. System photo picker sheet appears (Photos / Collections, "Private Access to Photos" banner, 6 sample photos, close X).

## Next steps a plan might ask
- "Pick the first photo (the pink flowers)."
- "Close the photo picker without choosing."
- "Search photos for 'waterfall'."

## Traps
- **Unexpected/system UI, screen Jev can't read:** PHPicker runs out of process. The capture (and Jev's text) still shows only the detail screen underneath (Bookmark, Bosch, Update Image…). None of the picker's photos, its close button or tabs are in the text. The screenshot is the only evidence. This is a hand-to-Claude case.
- Choosing a photo needed a Claude-only coordinate tap (AXe `tap -x 66 -y 388`).
