# Fix: PR #36 review of `6fb36c8` (two P1, one P2)

Status: resolved
Type: task
Category: bug
Spec: [../spec.md](../spec.md)
Review: the reviewer's report on PR #36 at `6fb36c8` (2026-10-02): Spec 2 × P1, Standards 1 × P2, two optional refactors
Blocked by: none

## What to build

1. **P1 Claude's answer on a changed screen** (`src/driven/step.ts` `handBack`). After a pause the answer ran on the paused snapshot. Only a driver that noticed staleness stopped it, and the Android driver checks only its own capture number, which nothing changes during a pause. So any answer could land on a screen Claude never saw: tap, type, back, tapAt. Capture the screen again before carrying out an action answer. On the same screen, act on the new capture, finding the element again. On a changed screen, do nothing and hand back `SCREEN_CHANGED` with the new screen. If even the new capture turns out stale, hand back again; never retry. ADR-0007 states the rule.
2. **P1 Jev answering Android's app error dialog** (`src/driven/candidates.ts`, `step.ts` `ask`). C17: Jev never dismisses unexpected dialogs. The "isn't responding" and "keeps stopping" dialogs are AOSP layouts whose buttons all have `android:id/aerr_` ids (`app_anr_dialog.xml`: close, wait, report; `app_error_dialog.xml`: restart, app_info, close, report, mute). `isAppErrorDialog` detects them. `ask` hands them back as the new pause reason `APP_ERROR_DIALOG` before Jev is asked, on every path (first decision, target search, completion check).
3. **P2 Prose evidence** (`src/scripted/report.ts`, `src/watch/index.ts`). The text report and the watch page named a driven action by its ref alone (`tap e17`). Name the recorded `target`: `tap button "Sign in" (ref b1)`. A script step's action, which records no target, reads as before.
4. **Refactor (a)** (`step.ts`): one `carryOut` for every device action of a `do` step, shared by `perform` and the target search's scrolls. The search event still follows the capture after its scroll, because it records `changed`.
5. **Refactor (b)**, extracting preflight process supervision from `driven/project.ts`: not here, see [Issue 20](20-extract-preflight-supervision.md). It's a code move with no bug, and it would grow a release PR.

## Acceptance

- The review's probe through the real Android driver: `tests/driven-android-pause.test.ts` pauses on one screen, moves the fake device to another, and shows that no tap, key or swipe reaches it, for tap, back and tapAt.
- `tests/driven-step.test.ts`: every answer kind on a changed screen hands back; on the same screen the answer acts on a later capture's ref; a stale fresh capture hands back without a retry.
- `tests/driven-safety.test.ts`: the recorded Calendar and KotlinConf freezes go to Claude without asking Jev, including when the target search reaches one. `isAppErrorDialog` is true for exactly those 2 of the 82 captured screens.
- `npm run check` passes (920 tests). The v1 goldens are unchanged; the 1.3-only driven goldens change only by the target lines.

## Comments

- 2026-10-02, coordinator: all three findings were confirmed before fixing. The P1 stale finding was wider than reported: on Android it covered element taps and typing as well as back and tapAt.
- 2026-10-02, coordinator, a known limit: a screen that keeps changing on its own, such as a timer, makes every answer hand back `SCREEN_CHANGED`. The pause text and the skills tell Claude to answer `revise` or `stop` there. Safety wins over liveness, as decided for C17 and E10.
