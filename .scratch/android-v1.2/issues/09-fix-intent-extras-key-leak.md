# Phase 3: intentExtras keys leak registered values

Status: closed
Closed: Fixed on agent/android-v1.2-phase3 at f612006, after review round 2
Blocked by: none

Spec: [../spec.md](../spec.md), "Phase 3". Found by Codex's review of `agent/android-v1.2-phase3` at 40c9e1c (Spec axis, P2; Standards axis, no findings).

## Finding

**Privacy: `intentExtras` keys are written in the clear.** The redactor in `src/log/index.ts` pseudonymized keys only in maps named `probabilities`, `values` and `assertions`. `intentExtras` was never added, so a key that contains a registered script value or `TYPESAFE_API_KEY` survives in `run.jsonl`'s `started` event, and `report.json` copies it from there.

## Acceptance

- A colliding `intentExtras` key becomes a `redacted_<hmac>` pseudonym in `run.jsonl` and `report.json`; ordinary extras stay unchanged.
- A regression test with synthetic data only, covering a typed value and a synthetic API key.
- iOS messages, reports and golden entries stay byte-identical.
- `npm run check` passes.

## Comments

**2026-09-30, owner and Claude:** Chose patch plus a whole-evidence leak test over a one-line patch. The allowlist of data-keyed maps is hand-kept, so the next map missing from it would leak the same way; a test that scans everything the run writes catches that without naming the map.

**2026-09-30, Claude (commit ebe6daf):** `src/log/index.ts` names the data-keyed maps in one set, `dataKeyedMaps`, and adds `intentExtras`. The new test in `tests/scripted-run.test.ts` places two synthetic secrets (a typed value and `TYPESAFE_API_KEY`) in intent-extra keys (exact and embedded), an intent-extra value, the typed value, the driver's shown value and an assertion claim. It then scans `run.jsonl`, `report.json` and the prose report. It failed before the fix (`synthetic-typed-7f3a survived in the written evidence`) and passes after. `logTails` keys are not added: they are log-source names from the vendor, not the script. Gates at ebe6daf: `npm run check` passes (typecheck, 242 tests, build); no golden file changed.

**2026-09-30, Claude, review round 1 (commit 28334ff):** Two-axis review of 40c9e1c...95e3191. Standards: 4 findings, all P3. Spec: 3 findings, all P3. No P1 or P2 on either axis. Fixed:
- The leak test did not plant a secret in every field a value reaches. It now also plants the typed value in a step ID, an assertion ID, the action selector and on-screen text, and asserts the run passes so the checkpoint's observation is written. Temporarily removing `intentExtras` from `dataKeyedMaps` still fails it with `synthetic-typed-7f3a survived in the written evidence`.
- The `dataKeyedMaps` comment said "registered value"; it now uses the glossary's "typed value or the API key", says why `assertions` is checked beside the set, and quotes the test name exactly.
- The test read `run.jsonl` twice; it now reads it once.
- This Issue was marked closed before the review ran; it now closes at 28334ff, after this round.

Gates at 28334ff: `npm run check` passes (typecheck, 242 tests, build); no golden file changed.

**2026-09-30, Claude, review round 2 (commit f612006):** GPT-6-Astra reviewed 40c9e1c...410070f. Standards: no findings. Spec: 1 finding, P2. Its claim was that the leak test planted secrets only in a hand-picked scenario, so a free-keyed map added to the script later would never carry a secret through it, and "catches that without naming the map" (owner decision above) was not true. Agreed; rated P3 here, since nothing leaks today, but fixed rather than reworded. String values are redacted by default and only keys are opt-in, so a new free-keyed map is the one way this leak comes back. The test now walks the JSON Schema of the iOS, Android and published script schemas, collects every object with an `additionalProperties` schema (today `app.intentExtras` and `values`), and fails by path unless the scenario plants a secret-bearing key in each. It also parses the scenario, and `values` now carries such a key. Checked by hand: adding a `z.record` to the Android `app` schema fails the test with `app.launchFlags is a free-keyed script map with no secret-bearing key here`; removing `intentExtras` from `dataKeyedMaps` fails it with `synthetic-typed-7f3a survived in the written evidence`. Maps from the device or vendor (`logTails`) are outside the script schemas and stay out of this guarantee.

Gates at f612006: `npm run check` passes (typecheck, 242 tests, build); no golden file changed.
