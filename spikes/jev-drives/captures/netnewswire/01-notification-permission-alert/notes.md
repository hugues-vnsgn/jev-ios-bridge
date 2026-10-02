# NetNewsWire: notification permission alert on first launch

Simulator jev-drives-eval (iPhone 17, iOS 26.4), screenHash `13ftfeq`. Local "On My iPhone" account with the default feeds; article content is live and will drift. Captured 2026-10-01.

## How reached
1. Fresh install, `simctl launch com.ranchero.NetNewsWire.iOS-DEBUG`, wait ~8 s. The system alert "“NetNewsWire” Would Like to Send You Notifications" (Don’t Allow / Allow) appears over the Feeds screen.
2. Afterwards: tapped "Don’t Allow" (least privilege; a Claude/human decision, not a Jev one).

## Next steps a plan might ask
- "Open the Daring Fireball feed." (the alert must be handled first)
- "Allow notifications." / "Don't allow notifications."
- "Open Settings."

## Traps
- **Unexpected dialog / system UI:** a SpringBoard permission alert. Per C17 Jev never grants permissions or dismisses unexpected dialogs.
- **The app underneath is absent from the text:** none of the feed rows behind the alert are in the capture, only SpringBoard elements (status bar, app-switcher card). A "done when the feed list shows" check is unreadable until the alert is gone.
- **System button that leaves the app:** "Return to ReadMe" (breadcrumb) is a visible button that would switch apps.
