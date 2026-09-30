# Phase 3: intentExtras keys leak registered values

Status: closed
Closed: Fixed on agent/android-v1.2-phase3 at ebe6daf
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
