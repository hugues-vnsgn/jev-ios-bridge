# Feasibility corpus

`corpus.json` contains 30 screen states from the dedicated iOS 26.4 simulator: 10 tuning cases and 20 held-out cases. The cases use Settings, Contacts, and Reminders. Mira Vale, Mira Stone, Call Mira, and Follow up with Nia are synthetic names and titles.

Each case points to a MobileBuildMCP compact capture, a full capture, and a screenshot in `raw/`. `capture.mjs` checks that compact and full captures have the same `screenHash`. `make-corpus.mjs` checks their element counts, builds the two observation variants, and records SHA-256 hashes of all three asset files. The labels in `corpus.json` are proposals for owner review; they have not been approved or sent to Jev.

The tuning partition covers a Settings switch, contact creation, and Reminders onboarding. The held-out partition covers different workflows: iOS build details, region, dictation languages, contact search and edit, reminder completion, and an absent reminder. The supplementary "second row" question reuses the Accessibility screen in tuning and does not add a 31st case.

The capture sequence seeded the local simulator through the app UI. In Contacts, it created Mira Vale, then edited her last name to Stone. In Reminders, it created Call Mira and later marked it completed. Follow up with Nia was deliberately never created. These setup facts explain the screenshots; they are not scenario preconditions sent to Jev.

The Reminders lists screen in h18 says there are zero active reminders. That alone does not rule out a completed reminder, so h18 and h19 continue into search. The h20 search screen was captured after MobileBuildMCP reported the UI settled. The owner should decide whether its empty results justify the proposed `stop-blocked` label.

There is no `wait` label. The simulator's General page has no Software Update entry, and none of the captured screens showed a transient loading state that warranted waiting. This is a coverage gap against the feasibility plan. A real wait screen must be captured and reviewed before claiming the planned action coverage.
