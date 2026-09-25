# Observation schema: what Jev sees each step

Type: grilling
Status: resolved
Blocked by: 21

## Question

What exact text does Jev see at each step? Start from the shape that worked in "Feasibility run: measure Jev on real screens". Decide:

- **Compact or full snapshot data.** Full data adds frames, visibility, and state. Only the CLI returns it, and it costs about 20 to 50 times the tokens, depending on formatting.
- **Candidate identity across steps.** References do not survive a step. Use the identifier, or role and label, and decide what happens when two elements match.
- **What is dropped:**
  - the status bar, whose clock changes the screen every minute;
  - hidden and zero-size elements;
  - duplicates.
- **Non-actionable context:** how titles, alerts, and static text rows are included.
- **Position:** numeric frames, named regions, or reading order. Jev's docs cover no spatial language.
- **Step history:** how many earlier steps to include, and how to summarise them.
- **Budget:**
  - fitting within 32k tokens for the state plus the longest question;
  - fitting within 255 options per Choice;
  - what happens on a screen with more than 64 targets, where the compact form cuts off.
- **Device independence:** one projection must serve both MobileBuildMCP and a future real-iPhone layer. See "Driving a real iPhone: what a second device layer takes".

## Answer

Use the validated full accessibility projection from ticket 21, with no history, future steps, supplied-value dictionary, Choice options, or completion question. Jev sees the current visible screen and current assertion claims only. Keep numeric frames/state plus meaningful titles, alerts, labels, values and identifiers; omit explicitly hidden/zero-size rows, status bars, pure scrollbars, and empty containers without useful evidence. The projection's duplicate rows remain as evaluated; selector canonicalization is a separate execution concern.

Reject truncated captures and budget overflow rather than silently cutting evidence: 24,000 rendered bytes, 28,000 JSON state-plus-longest-question bytes, and 56,000 total request bytes. The old 64-target compact and 255-Choice limits no longer define this assertion-only path. The generic Snapshot shape remains vendor-independent; any provider-specific tap equivalence is an explicit internal capability. Targets are resolved afresh from exact authored selectors, never durable snapshot refs. See the [validated protocol](../scripted-evaluation-plan.md) and [production plan](../scripted-production-plan.md).
