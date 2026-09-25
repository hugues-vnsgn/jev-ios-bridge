# BFSOne evidence shortcut: a debug-only gallery entry point

Type: task
Status: open
Blocked by: none

## Question

Nothing to decide; "Compose app evidence plan" needs this change before its BFSOne scripts can run. **HITL: the owner opens and lands a PR in `BFSOne_Mobile_App`** (remote `PHQUY/BFSOne_Mobile_App`), because it is another team's codebase. Checklist:

- [ ] Debug builds only (`AppBuildConfig.isDebug` or `#if DEBUG`); Release behaviour is unchanged.
- [ ] Launch argument `-of-evidence-gallery` opens `OFGalleryScreen` directly as the root. It skips the splash server check (`getDBList`), login, the notification permission request, and FCM registration. `FirebaseApp.configure()` may still run.
- [ ] Under that argument, the app makes **no request to `api.beelogistics.com`**, and the debug network log shows none.
- [ ] The `iosApp` scheme is shared (`iosApp.xcodeproj/xcshareddata/xcschemes/iosApp.xcscheme`), so a clean checkout builds through MobileBuildMCP.
- [ ] The PR is merged, and its merge commit hash is recorded in this ticket's answer. Codex pins that commit.

If it isn't merged when Codex reaches the Compose gate, the `cmp` fallback in "Compose app evidence plan" applies. This ticket is then closed as not done, with no effect on 1.0.

## Comments

- 2026-09-25: the owner has asked a coding agent to add `-of-evidence-gallery` in BFSOne. This ticket stays open until the PR is merged and its commit hash is recorded here.
