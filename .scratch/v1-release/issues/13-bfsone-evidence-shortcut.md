# BFSOne evidence shortcut: a debug-only gallery entry point

Type: task
Status: open
Blocked by: none

## Question

Nothing to decide; "Compose app evidence plan" needs this change before its BFSOne scripts can run. **HITL: the owner opens and lands a PR in `BFSOne_Mobile_App`** (remote `PHQUY/BFSOne_Mobile_App`), because it is another team's codebase. Checklist:

- [x] Debug builds only (`AppBuildConfig.isDebug` or `#if DEBUG`); Release behaviour is unchanged.
- [x] Launch argument `-of-evidence-gallery` opens `OFGalleryScreen` directly as the root. It skips the splash server check (`getDBList`), login, the notification permission request, and FCM registration. `FirebaseApp.configure()` may still run.
- [x] Under that argument, the app makes **no request to `api.beelogistics.com`**, and the debug network log shows none.
- [x] The `iosApp` scheme is shared (`iosApp.xcodeproj/xcshareddata/xcschemes/iosApp.xcscheme`), so a clean checkout builds through MobileBuildMCP.
- [x] The PR is merged, and its merge commit hash is recorded in this ticket's answer. Codex pins that commit.

If it isn't merged when Codex reaches the Compose gate, the `cmp` fallback in "Compose app evidence plan" applies. This ticket is then closed as not done, with no effect on 1.0.

## Answer

Merged: PR #120 (https://github.com/PHQUY/BFSOne_Mobile_App/pull/120), merge commit `8eccf629b232cd040848f0dd03a99cfa9656db63` on `main`. Pin that commit.

- The switch works only when `AppBuildConfig.isDebug` is true and the exact argument `-of-evidence-gallery` is present (`EvidenceLaunchTest`: debug with it, debug without it, release with it, a near-miss argument).
- Under it, `MainViewController` renders `OFGalleryScreen` in the light theme inside a safe-area scaffold, with no Koin and no FCM, and `didFinishLaunchingWithOptions` returns before the notification permission request. `FirebaseApp.configure()` still runs.
- Checked on an iPhone 14 Pro Max simulator (iOS 18.6). Without the argument, the log shows `getDBList` and three `getdata` calls to `api.beelogistics.com`. With it, the app log, the OS log and `simctl log show` contain no mention of that host.
- The shared scheme is `iosApp.xcodeproj/xcshareddata/xcschemes/iosApp.xcscheme`, with `-of-evidence-gallery` listed in its launch arguments and unticked.
- Not done: a Release build was not run. Release safety rests on `isDebug` and the unit test.

## Comments

- 2026-09-25: the owner has asked a coding agent to add `-of-evidence-gallery` in BFSOne. This ticket stays open until the PR is merged and its commit hash is recorded here.
- 2026-09-25: PR #120 merged as `8eccf629`; answer recorded above.
- 2026-09-26: the change exists as BFSOne commit `2b03477102f3410b51e7bd2a1e88239b7e3f4bfb` on branch `agent/BFSOne_Mobile_App-su7r-evidence-gallery` (pushed), and isn't merged into BFSOne `main` yet. Its commit message reports that it was checked on a simulator: the gallery opens offline, with no request to `api.beelogistics.com`.
