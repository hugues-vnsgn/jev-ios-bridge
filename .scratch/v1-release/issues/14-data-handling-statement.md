# Data-handling statement for outside developers

Type: grilling
Status: open
Blocked by: 12

## Question

What exactly does guide page `09-data-handling.md` promise and warn about, before developers point the bridge at their own apps? The page set is fixed by "Developer guide outline". Start from the current `docs/usage.md` section "Evidence and data handling", and decide:

- **What leaves the machine:** screen text and claims go to TypeSafe. What does the guide say about TypeSafe's retention and use? That's a fact to look up, not assume.
- **What stays local:** screenshots (unredacted), `run.jsonl`, `report.json`, device log excerpts, and the evidence folder's permissions and manual retention.
- **The log pane:** the app's own logs can carry secrets (BFSOne's debug network log records every request). Settle what the pane shows, stores, or redacts. It depends on "Live log pane".
- **Redaction:** what the bridge redacts (the API key, exact typed values) and its stated limits (transformed values aren't caught).
- **Prompt injection** through on-screen text, and the "synthetic data in apps you control" rule.
- **The watch page token**, and who on the machine can read a run's evidence.
