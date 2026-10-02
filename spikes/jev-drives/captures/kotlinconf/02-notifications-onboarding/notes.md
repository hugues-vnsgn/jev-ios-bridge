# KotlinConf: notifications onboarding screen

Simulator jev-drives-eval (iPhone 17, iOS 26.4), screenHash `00t92bk`. Debug build from source (app 40.0.5 (73)) against the production backend; read-only: privacy notice rejected, no votes, no feedback. Schedule content drifts. Captured 2026-10-01.

## How reached
1. Launch; tap Reject on the privacy notice (01).

## Next steps a plan might ask
- "Turn off schedule update notifications."
- "Continue to the schedule." (Let’s get started!)
- "Are session reminders on?"

## Traps
- **Switch state missing:** the two switches (Session reminders, Schedule updates) have no value and no selected state in the text, so "is it on?" can't be answered from text.
- **Leads to a system dialog:** "Let’s get started!" triggers the iOS notification permission alert (handled with Don’t Allow; not captured here, the same alert as NetNewsWire 01).
- Long switch labels fuse title and description.
