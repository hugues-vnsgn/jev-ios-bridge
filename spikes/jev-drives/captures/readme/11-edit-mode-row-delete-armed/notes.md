# ReadMe: edit mode with a row's Delete armed

Simulator jev-drives-eval (iPhone 17, iOS 26.4), screenHash `0ixzsoj`. Captured 2026-10-01.

## How reached
1. Launch, tap Edit (10).
2. Tap the red minus beside "Dare to Lead" (ref for `minus.circle.fill` on that row). The row slides and a red trash "Delete" button appears.
3. Afterwards tapped Done; nothing deleted. (After that the Edit button kept identifier `checkmark`.)

## Next steps a plan might ask
- "Confirm deleting Dare to Lead." (destructive)
- "Don't delete; leave edit mode."
- "Delete Bosch instead."

## Traps
- **Destructive button:** one tap on Delete removes the book (local data, no undo).
- **Duplicate rows:** the other three rows still show their own minus buttons; "Delete" applies only to Dare to Lead, visible only from frame.
- Icon-only Done (checkmark).
