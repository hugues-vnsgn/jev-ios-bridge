# Scripted assertion corpus audit

Independent `gpt-6-sol` high audit completed before owner review and live evaluation. No unsupported claim or input defect remains after the documented preflight corrections. No Jev request was made.

- **Cases:** 24 fresh screens, eight workflow groups, four apps; each has one true and one false current-screen claim.
- **Assets:** all 48 full-capture/screenshot hashes match. Every normalized snapshot matches the raw parser output.
- **Freshness:** 24 distinct screen hashes and screenshot hashes; no screen-hash, full-capture, or screenshot overlap with prior v1–v3 raw corpora.
- **Labels:** all screenshots and relevant accessibility text reviewed. The Contacts foreground-card and Reminders row/editor claims use observable evidence, without inferring hidden storage state.
- **Oracle isolation:** neutral IDs, 12 true-first cases and 12 cases where ID `a` is true. Definitions and assembled cases agree. Each request contains exactly two Noul questions, without expected labels, rationale, screenshots, Choice, or a completion question.
- **Budgets:** maximum rendered state 20,313 bytes; maximum full request 24,637 bytes; maximum state plus longest question 24,360 bytes. Every request fits the unchanged caps.
- **Corpus SHA-256:** `4d7e3853e79c7ffd3315ce9d908ebe9d4685ce28cff59674470ca0f861b43303`.
- **Implementation SHA-256:** `dbdb58f782d86191a2d35b7a932b0ca9cc38568503d1908c03310795f6c44884`, archived in `2222fc2`.
- **Frozen manifest SHA-256:** `f2371bbcde3c6c9086d1bc924da04f32265e3a2fd979440a2b63cb0f7f53badf`.

The [owner case sheet](../../spikes/scripted/corpus/review/case-review.md) links all 24 screenshots and full captures. Its links resolve, the exact frozen manifest passed the CLI review step, and the approval template remains false. Owner approval has been requested.

The [protocol](scripted-evaluation-plan.md) requires at least 20/24 confident correct true claims and 20/24 confident correct false claims, with zero confidently wrong judgments. Correlated pairs count as 24 screen cases, not 48 independent trials. This audit establishes readiness for owner label review; it is not a feasibility result or release approval.
