# Fix: processes and iOS attach (Codex review P1 #5; P2 #7, #10)

Status: ready-for-agent
Type: task
Spec: [../spec.md](../spec.md)
Review: `.worktrees/handoffs/jev-drives/codex-review-report.md` (findings 5, 7, 10)
Blocked by: none

## What to build

1. **#5 iOS attach (coordinator ruling).** MobileBuildMCP 2.7.1 can't tell which app is in front, and the spec requires refusing unless the app under test is in front. So **iOS attach is refused** before any device work with `UNSUPPORTED_ACTION` and a message saying attach is Android-only for now. Remove the iOS attach code path that calls `xcrun simctl` and `log stream` (Issue 11's iOS part, `src/device/attach.ts` iOS helpers, the iOS driver's `appState`/`osLog`/`logFolder` options) so the bridge no longer calls them. Android attach stays. Update docs (`13-driven-steps.md`, `script-format.md` start row, `reason-codes.md` if `APP_NOT_RUNNING` becomes unused — keep the code in the vocabulary, mark it unused on iOS in the docs; don't remove a code once added), and the skills.
2. **#7 Preflight children.** After the preflight command exits (any status), kill its process group (SIGTERM, short grace, SIGKILL) and wait until no process in the group remains before returning; same on timeout and cancel. If the group can't be confirmed gone, treat the preflight as failed and keep it from releasing the lease while anything survives (log `failure: "cleanup"`).
3. **#10** (only if any iOS log-stream code remains after #5; otherwise just confirm it's gone): a failed stop keeps the handle, ends `CLEANUP_FAILED`, and doesn't release the lease.

## Acceptance

Regression tests for #5 (iOS attach refused before device commands; Android attach unchanged), #7 (a background `sleep` from a preflight is gone after it returns; timeout/cancel confirm exit). `npm run check` passes; v1 goldens unchanged. Confirm with `grep` that `src/` no longer calls `simctl` or `log stream`.
