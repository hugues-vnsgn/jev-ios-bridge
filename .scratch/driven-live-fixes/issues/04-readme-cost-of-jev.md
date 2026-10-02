# README: what Jev costs, and where a driven run's money goes

Status: ready-for-agent
Type: docs

## Problem

The README never says what a check costs. Jev's price ($0.042 per million input tokens, output free, `spikes/benchmarks/jev-pricing.json`) is the point of the tool, and the first live trial showed that the Claude side, not Jev, sets the bill.

## What to build

A short README section, near driven mode:

- Jev's price and what a run uses: a checkpoint is about 1.5–3k input tokens; a driven decision 2–6k; a driven run of 13 decisions about 55k tokens, about $0.002.
- Claude's side is most of the cost: in the first live trial, Claude driving directly cost about $0.60 per flow, and driven mode $1.10–$1.66. Reading the guides, authoring, and one Claude turn per poll and hand-back cost more than the taps Jev saved. Say it plainly, as experimental-mode evidence from one app and two short flows.
- How to keep Claude's side down today: write `do` steps from the expected behaviour without reading source, prefer short scripts, rerun saved scripts.
- No app-identifying details.

## Acceptance

The section states Jev's price with its source and date, the measured per-run numbers, and the trial's Claude-versus-Jev split, with links to the pricing file and guide 13.
