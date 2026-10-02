# ReadMe: trailing swipe action revealed (Delete)

Simulator jev-drives-eval (iPhone 17, iOS 26.4), screenHash `0vgido5`. Captured 2026-10-01.

## How reached
1. Launch (01). Add New Book sheet had been opened and swiped away unsaved (07).
2. Coordinate swipe left on the "Dare to Lead" row (AXe swipe 340,720 to 200,720). A red trash button appears.
3. Afterwards closed with a coordinate tap on the title area; nothing deleted.

## Next steps a plan might ask
- "Delete Dare to Lead." (destructive)
- "Cancel the swipe and open Dare to Lead."
- "Open Bosch."

## Traps
- **Destructive, icon-only:** the trash button shows only an icon; the capture labels it "Delete" (identifier `trash`).
- The swiped row's text is partly off screen in the screenshot but complete in the text.
- Only reachable by a swipe gesture on the row, which the bridge's current actions (swipe within a scroll area) don't target per row.
