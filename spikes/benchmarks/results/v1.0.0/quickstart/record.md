# Quickstart walkthrough (release check 7)

`docs/guide/01-quickstart.md` was followed as written in a fresh project (`/tmp/jev-quickstart`) on 2026-09-26, with Claude Code 2.1.280 as the host.

**Deviations the pre-tag state or the safety rules required:**
- **Step 1:** installed the locally packed tarball, because the release doesn't exist before the tag.
- **Step 2:** loaded the owner's existing `.env` by explicit path instead of writing a new one (the key is never copied).
- **Step 3:** used the existing dedicated simulator instead of creating one (only the dedicated simulator may be used).
- **Step 4:** cloned `main` (`cd1c36d`) instead of tag `v1.0.0`, which doesn't exist yet.

| Step | Result |
| --- | --- |
| 1. Install | `npx jev-ios-bridge --version` prints `1.0.0` |
| 3. Simulator config | `.mobilebuildmcp/config.yaml` as written |
| 4. `npx mobilebuildmcp simulator build-and-run …DiagnosticApp…` | Built, installed, and launched the diagnostic app |
| 5. `node --env-file=… run …/scenario.json` | **failed**, `ASSERTION_FALSE`, exit code **1**; claim "…Total: $5" at 0.020; log pane opened; evidence folder with `report.json`, `run.jsonl`, screenshots, and `.gitignore` |
| 6. `.mcp.json`, copied skill, and `/test-ios …` through `claude -p` with the project's MCP config | Claude submitted once through `start_scenario`, waited through `get_report`, and reported **failed** with the `$3` total as evidence (host cost $0.29). Claude also tried a Bash check, which this headless run didn't allow. |

**Result:** the quickstart works as written, apart from the release download and tag clone, which can only be checked after publishing.
