# Compose Multiplatform checks (release check 5)

**App:** BFSOne_Mobile_App at merge commit `8eccf629b232cd040848f0dd03a99cfa9656db63` (PR #120, the owner's `-of-evidence-gallery` shortcut, merged 2026-09-25). It's Compose Multiplatform 1.9.0.
- **Build:** a fresh clone of the pinned commit, built through MobileBuildMCP (workspace `iosApp/iosApp.xcworkspace`, scheme `iosApp`, Debug) in 111 s, then installed after an uninstall.
- **Runs:** one run each through the CLI on 2026-09-26, with `JEV_LOG_PANE=off`.
- **What's kept here:** only each run's `report.json`. The full run folders (screen text and screenshots of a private app) stay on the owner's machine in the git-ignored `.jev-runs/v1.0.0-release-checks/compose-runs/`.

| Script | Expected | Verdict | Claims | Requests to `api.beelogistics.com` in the app's logs |
| --- | --- | --- | --- | ---: |
| `compose-bfsone-toggle` | passed | passed | 0.99 | 0 |
| `compose-bfsone-text` | passed | passed (second run) | 0.98, 0.98 | 0 |
| `compose-bfsone-number` | passed | passed | 0.99 | 0 |
| `compose-bfsone-dialog-sheet` | passed | passed | 0.98, 0.98, 0.98 | 0 |
| `compose-bfsone-false-claim` | failed | failed (`ASSERTION_FALSE`) | 0.02 | 0 |
| `compose-bfsone-ambiguous-guard` | inconclusive | inconclusive (`GUARD_AMBIGUOUS`) | — | 0 |

- **Every expected verdict was met** (blocking).
- **The app made no production requests.** Its console and `os_log` files, which the debug network log writes to, never mention `api.beelogistics.com`.
- **First text run** ([`text.first-run.report.json`](text.first-run.report.json)): `failed`. The device layer typed "Contan" for "Contain", dropping one keystroke, so the list showed "No results", and Jev correctly judged the containers claim false (0.05). The script lacked the post-typing guard the guide calls for. With it added, a dropped keystroke stops the run as inconclusive instead of failing, and the second run passed; see [script-fixes.md](../benchmarks/script-fixes.md). The dropped keystroke is a MobileBuildMCP/AXe typing issue outside the bridge.
