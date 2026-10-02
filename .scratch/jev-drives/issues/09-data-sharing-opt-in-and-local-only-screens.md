# Data sharing: opt-in and local-only screens

Type: grilling
Status: resolved
Blocked by: 03

## Question

v1.2 sends screen text to TypeSafe only at checkpoints; a driven run sends it at every decision (Codex Q18, Q24). Settled direction:

- Driven mode needs an **explicit project opt-in**, with the change disclosed in the docs and skills.
- **Local-only steps** in the plan never send their screens to Jev; Claude handles them.
- **Project screen rules** mark sensitive screens; known input values are redacted before any Jev call; when the bridge can't safely prepare an observation, it pauses for Claude.

Still to settle: where the opt-in and screen rules live, their format, and how `09-data-handling.md` changes.

## Answer

Owner approved 2026-10-01 (design batch E1–E15).

- **E13 opt-in:** driven steps run only if the app repo has **`.jev/config.json`** with `"drivenMode": true`, and, while experimental, the bridge's switch is on (plugin setting or `JEV_EXPERIMENTAL_DRIVEN=1`).
- **E14 local-only:** a `do` step with `"localOnly": true` goes to Claude and its screens never reach Jev; `.jev/config.json` may list screen rules (identifier or label patterns) that keep a matching screen from Jev; typed values are masked before every Jev call.
