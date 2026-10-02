# ReadMe: Delete Image confirmation popover

Simulator jev-drives-eval (iPhone 17, iOS 26.4), screenHash `0lz3qzo`. Captured 2026-10-01.

## How reached
1. Launch, Bosch (02), Update Image… and pick a photo (03, 04).
2. Tap "Delete Image". A confirmation popover "Delete image for Bosch?" with one red "Delete" button appears.
3. Afterwards dismissed with a coordinate tap outside (AXe `tap -x 200 -y 800`); nothing deleted.

## Next steps a plan might ask
- "Cancel; keep the image."
- "Confirm deleting the image." (destructive, goes to Claude per C21)
- "Go back to the library." (blocked until the popover closes)

## Traps
- **Destructive button + unexpected dialog:** the only button in the popover is "Delete". There is no Cancel button; cancelling means tapping outside ("dismiss popup", identifier `PopoverDismissRegion`, a full-screen `other`, not a tap target).
- **Occluded controls still reported visible:** Delete Image, Update Image…, the Bookmark and the back button underneath all appear with `visible: true`.
