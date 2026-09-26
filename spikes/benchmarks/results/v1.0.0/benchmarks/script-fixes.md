# Benchmark script fixes during the v1.0.0 release checks

- **`contacts-scripted.json`, step `openNewContact`:** removed `{"role": "alert"}` from the guard's `absent` list.
  - **Why:** MobileBuildMCP 2.7.1 has no `alert` role; its role set is the 15 roles the bridge now owns, and alerts capture as other roles. So that selector could never match, and the guard never checked anything with it.
  - **Why it surfaced now:** 1.0 rejects roles outside the list, so the script failed validation before the run started.
  - **Effect:** the script behaves exactly as before. This is a script fix, not a bridge fix, and it was run once more per the release spec.
- **`compose-bfsone-text.json`, checkpoint `filtered`:** the guard now requires the search field to hold the typed text: `{"identifier": "of-picker-search", "role": "text-field", "label": "Contain"}`. Compose reports the field's text as its label.
  - **Why:** the first release-check run came back `failed`. The device layer typed "Contan" (one keystroke dropped), the list showed "No results", and Jev correctly judged the containers claim false (0.05).
  - **What the fix changes:** the guide says to check typed text in the next guard, and the script didn't. With the guard, a dropped keystroke stops the run as `GUARD_MISSING` (inconclusive, meaning the typing didn't land) instead of `failed`, which would wrongly blame the app.
  - **Run once more** per the release spec. The dropped keystroke itself is a MobileBuildMCP/AXe typing issue outside the bridge, reported to the owner.
