# ReadMe: book detail with image (Bosch)

Simulator jev-drives-eval (iPhone 17, iOS 26.4), screenHash `06dzthn`. Captured 2026-10-01.

## How reached
1. Launch, tap "Bosch" (02), tap "Update Image…" (03).
2. Coordinate tap on the first photo in the system picker (AXe `tap -x 66 -y 388`; Claude-only, MobileBuildMCP exposes no picker refs). Picker closes, image set.

## Next steps a plan might ask
- "Delete the cover image." (destructive, opens a confirmation; see 05)
- "Replace the cover image." (Update Image…)
- "Check the book now shows a cover photo."

## Traps
- **Destructive button:** "Delete Image" sits next to "Update Image…"; a wrong pick opens a delete confirmation.
- The new image has no label in the text (role image, no label), so "shows a cover photo" can only be inferred from the `b.square` placeholder having gone.
