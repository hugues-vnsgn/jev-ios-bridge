# Jev decision call and acceptance rules

Status: ready-for-agent
Type: task
Spec: [../spec.md](../spec.md) (read the "Fixed rules" and "Gates" sections in full)
Blocked by: 04

## What to build

- `src/driven/decide.ts`: build the request exactly as the spike protocol (`spikes/jev-drives/protocol.md`, "The request"): Choice `next_action` + Noul `step_done`, state = goal, current step, done-when, plan values (masked as `[value:<key>]`), the last 2 actions, the screen (`renderAssertionState`). Budget rules as the scripted judge (28,000 / 56,000 bytes). Strict parse of the answer like `src/scripted/jev.ts` (never put response bodies in errors), the same error codes. A `DrivenJudge` interface with a fake for tests; the real one uses `@typesafe-ai/sdk` like `createAssertionJudge`.
- `src/driven/policy.ts`: the constants and the pure acceptance function: thresholds 0.80 / 0.90, destructive never, `step_done` needs the Noul ≥ 0.90, the risky-word net (E11), done = Noul ≥ 0.90 / not done ≤ 0.10. Returns `accept(action) | stepDone | handBack(reason)`, with the reason codes used in hand-back packages (`LOW_CONFIDENCE`, `NONE_FITS`, `RISKY_ACTION`, `DESTRUCTIVE_STEP`).

## Acceptance

- Tests: a request never carries the effect (port the spike's leak test); every acceptance rule incl. edge values (0.79/0.80, 0.89/0.90, risky words in label, value or identifier, matched as whole words and case-insensitively, so "Delete" and "delete account" match but "Deleted items" does not).
- `npm run check` passes.

## Comments

- 2026-10-01, coordinator, from Issue 04 (merged `338ca24`): `buildCandidates(elements, valueKeys)` takes value **keys** (descriptions say "the plan value <key>"); `lookupCandidate(set, key)` maps a key back to its action. **Mask typed text in candidate descriptions too**, not only in the screen text: `describeElement` includes a field's shown value, so text the bridge typed reappears in later option descriptions. Labels are quoted unescaped (as in the spike). Port the spike's 28,000-byte budget check here.
