# KotlinConf: schedule (May 20, Workshop Day)

Simulator jev-drives-eval (iPhone 17, iOS 26.4), screenHash `0vp4vmw`. Debug build from source (app 40.0.5 (73)) against the production backend; read-only: privacy notice rejected, no votes, no feedback. Schedule content drifts. Captured 2026-10-01.

## How reached
1. Launch, Reject (01), Let’s get started! (02), "Don’t Allow" on the iOS notification alert.

## Next steps a plan might ask
- "Show the schedule for May 21."
- "Open the Koog workshop." (Building AI Agents in Kotlin with Koog)
- "Bookmark the Koog workshop."
- "Show only bookmarked sessions." (Filter bookmarked, icon-only, a switch)

## Traps
- **Duplicate rows:** two "Coffee Break" rows (10:30 and 15:00), differing only by time in their `other` labels.
- **Hidden risky controls reported visible:** "Vote negative/neutral/positive" (server writes, not allowed) and an unlabeled button sit under the bottom tab bar (y ≈ 827) yet report `visible: true`.
- **Unlabeled button:** one session-card button (y 826) has no label at all.
- **Icon-only:** Search, Filter bookmarked (bookmark icon) at top; tab bar items are icons in the screenshot.
- Session list continues below the fold.
