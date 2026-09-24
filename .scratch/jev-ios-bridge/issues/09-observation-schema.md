# Observation schema: what Jev sees each step

Type: grilling
Status: open
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
