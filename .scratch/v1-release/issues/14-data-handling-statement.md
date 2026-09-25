# Data-handling statement for outside developers

Type: grilling
Status: resolved
Claimed by: Claude Code (owner session)
Blocked by: 12

## Question

What exactly does guide page `09-data-handling.md` promise and warn about, before developers point the bridge at their own apps? The page set is fixed by "Developer guide outline". Start from the current `docs/usage.md` section "Evidence and data handling", and decide:

- **What leaves the machine:** screen text and claims go to TypeSafe. What does the guide say about TypeSafe's retention and use? That's a fact to look up, not assume.
- **What stays local:** screenshots (unredacted), `run.jsonl`, `report.json`, device log excerpts, and the evidence folder's permissions and manual retention.
- **The log pane:** the app's own logs can carry secrets (BFSOne's debug network log records every request). Settle what the pane shows, stores, or redacts. It depends on "Live log pane".
- **Redaction:** what the bridge redacts (the API key, exact typed values) and its stated limits (transformed values aren't caught).
- **Prompt injection** through on-screen text, and the "synthetic data in apps you control" rule.
- **The watch page token**, and who on the machine can read a run's evidence.

## Comments

- 2026-09-25, from "Live log pane": the pane masks supplied values, sends nothing to Jev or the host, and keeps no copy of its own. The app's logs remain in MobileBuildMCP's own log files (`~/Library/Developer/MobileBuildMCP/workspaces/<workspace>/logs/`), under its retention, not the bridge's. Page 09 must say so, and warn that debug network logs, like BFSOne's, can put tokens in those files.

## Answer

Decided with the owner on 2026-09-25. The facts come from the code (`src/scripted/observe.ts:25-40`, `src/log/index.ts:42-70`, `src/scripted/jev.ts:91`, and `src/device/index.ts:173-176`), MobileBuildMCP 2.7.1's log lifecycle, and a research pass over TypeSafe's published terms, fetched 2026-09-25.

1. **What goes to TypeSafe.** At checkpoints only, the observation contains every visible element: role, label, value, identifier, frame, and state. It includes values the script typed, because claims need them; secure fields show dots. The claims go too. The page shows one real example payload.
2. **What goes to the host (Claude, and so Anthropic):** the submitted script with its values, the final report with supplied values masked, and the watch URL. The watch URL, token included, ends up in the host's transcript.
3. **Bridge change before 1.0:** device child processes get an environment **without `TYPESAFE_API_KEY`** (review defect 8). The page can then say the key goes only to TypeSafe.
4. **Bridge change before 1.0:** **one watch token per run**, valid only for that run while the server lives (review defect 9). It replaces the single token valid for every run under the evidence root.
5. **Bridge change before 1.0:** when the bridge creates the evidence root, it writes a **`.gitignore` containing `*`** inside it, so screenshots and journals can't be committed by accident.
6. **What stays local:**
   - **Evidence:** `.jev-runs/<run-id>/`, owner-only (0700/0600), with screenshots unredacted, kept until the developer deletes it.
   - **App logs:** in MobileBuildMCP's log folder, `~/Library/Developer/MobileBuildMCP/workspaces/<workspace>/logs/`. The folder is owner-only, and MobileBuildMCP sweeps files older than about 3 days.
   - **The SDK:** runs at `logLevel: 'warn'`, so request bodies are never logged locally.
7. **App-log warning:** an app's own logs can hold tokens or personal data (BFSOne's debug network log records every request). The pane masks only supplied values, and 1.0 adds no other masking.
8. **The safety rule, at the top of page 09 and in the quickstart:** "Use test data in apps you control. Don't run the bridge against real user accounts or production data. Text on screen that someone else wrote can steer Jev's judgment."
9. **TypeSafe summary, dated and linked** (Privacy Policy 2025-11-19, MCA 2026-09-23, DPA 2026-04-24, AUP 2026-09-23, `docs.typesafe.ai/legal.md` and `models.md`):
   - TypeSafe says it doesn't train on customer input: training needs the customer's prior consent (MCA §4.1). "Jev is not trained on customer requests or responses."
   - Data is kept "as long as reasonably necessary", including in backups. Telemetry derived from it can be kept and used to improve the service (MCA §4.1, §4.3, §10.3).
   - There's no self-serve deletion; zero data retention is enterprise-only, through sales.
   - Hosted in the US.
   - The developer must have the rights and consents for whatever is on screen, and indemnifies TypeSafe for claims about input (MCA §5, §13).
   - The page ends: "Check TypeSafe's current terms before using real data."
