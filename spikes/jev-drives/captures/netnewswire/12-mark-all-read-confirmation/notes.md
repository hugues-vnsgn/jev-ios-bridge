# NetNewsWire: Mark All as Read confirmation popover

Simulator jev-drives-eval (iPhone 17, iOS 26.4), screenHash `1vwnxrf`. Local "On My iPhone" account with the default feeds; article content is live and will drift. Captured 2026-10-01.

## How reached
1. Launch, Don’t Allow; Add Feed cancelled (11); back on Feeds.
2. Tap "Daring Fireball 47 unread".
3. Tap "Mark All as Read" (icon-only, bottom left). A popover "Mark As Read. You can turn this confirmation off in Settings." with "Mark All as Read" and "Open Settings" appears.
4. Afterwards dismissed with a coordinate tap on the nav title; nothing marked.

## Next steps a plan might ask
- "Mark all articles as read." (confirm)
- "Cancel; keep them unread."
- "Turn off this confirmation." (Open Settings)

## Traps
- **Duplicate buttons with the same label:** "Mark All as Read" appears twice: the toolbar icon that opened the popover (y 803) and the confirm button in it (y 710). Only the second performs the bulk change.
- **Bulk/irreversible-ish change:** marks every article in the feed read.
- **No Cancel button:** dismiss is a tap outside.
