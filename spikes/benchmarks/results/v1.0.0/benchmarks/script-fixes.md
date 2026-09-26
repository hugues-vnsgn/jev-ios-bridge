# Benchmark script fixes during the v1.0.0 release checks

- **`contacts-scripted.json`, step `openNewContact`:** removed `{"role": "alert"}` from the guard's `absent` list.
  - **Why:** MobileBuildMCP 2.7.1 has no `alert` role; its role set is the 15 roles the bridge now owns, and alerts capture as other roles. So that selector could never match, and the guard never checked anything with it.
  - **Why it surfaced now:** 1.0 rejects roles outside the list, so the script failed validation before the run started.
  - **Effect:** the script behaves exactly as before. This is a script fix, not a bridge fix, and it was run once more per the release spec.
