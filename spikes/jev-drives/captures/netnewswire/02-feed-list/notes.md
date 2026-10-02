# NetNewsWire: feed list (Feeds)

Simulator jev-drives-eval (iPhone 17, iOS 26.4), screenHash `0kbqj5t`. Local "On My iPhone" account with the default feeds; article content is live and will drift. Captured 2026-10-01.

## How reached
1. Launch; tap "Don’t Allow" on the notification alert (01).

## Next steps a plan might ask
- "Open the Daring Fireball feed."
- "Show today's articles." (Today smart feed)
- "Show only feeds with unread articles." (Filter Read Feeds, icon-only)
- "Add a new feed." (Add, a "+" icon)

## Traps
- **No tap action on smart feeds:** Today, All Unread and Starred have only `touch`/`longPress` actions in the snapshot, no `tap`, though they are the obvious targets. Feed rows (e.g. Daring Fireball) do list `tap`.
- **Icon-only controls:** Filter Read Feeds, Settings (gear), Current Activity, Add (+) are icons in the screenshot; labels exist only in accessibility.
- Row labels fuse name and count ("Daring Fireball 48 unread"); counts drift with live content.
- One more feed (Six Colors) is below the fold.
