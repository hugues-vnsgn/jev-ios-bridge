# KotlinConf: session search with a typed query

Simulator jev-drives-eval (iPhone 17, iOS 26.4), screenHash `1rioxzg`. Debug build from source (app 40.0.5 (73)) against the production backend; read-only: privacy notice rejected, no votes, no feedback. Schedule content drifts. Captured 2026-10-01.

## How reached
1. As 04, tap Back to the schedule.
2. Tap "Search" (magnifier icon).
3. type-text into the search field (it has no label): "coroutines". A system "Paste" edit-menu callout appeared next to the field.

## Next steps a plan might ask
- "Open the Spring Boot With Coroutines and Virtual Threads workshop."
- "Clear the search."
- "Filter the results by the Backend tag." (Filter by tags)
- "Bookmark the Kotlin Performance Tracing session." (the 4th result, scrolled off)

## Traps
- **Unexpected system UI:** the iOS edit-menu callout ("Paste") overlays the results, with hidden "Back"/"Forward" arrow buttons (one at x = -15, off screen).
- **Duplicate buttons:** two "Back" buttons: the screen's back arrow (y 62) and the edit menu's (y 140).
- **Scrolled-off target:** "4 sessions found", 3 visible; the 4th result's card is below the fold (only its bookmark switch is in the text).
- Search field has no label, only its value.
