# Watch view: a localhost timeline page

Type: prototype
Status: open
Blocked by: 12, 13

## Question

What should a person see while a run is in progress, and is a page served by the bridge worth its cost?

Build a rough page over a recorded run log. It shows:

- a step timeline with screenshots;
- Jev's choice and its probabilities;
- build stages;
- the tails of the build and app logs.

Go through it with the human, then decide:

- **Port and binding:** 127.0.0.1, with a token in the URL.
- **How the human finds the URL:** in the tool result, the statusline, or a terminal link.
- **Lifetime:** the stdio process ends with the host session, and the page ends with it.
- **Screen:** per-step screenshots in the page. For a live screen, rely on Simulator.app or Claude Code Desktop's simulator pane, and check that the pane can show the simulator the bridge is driving without interfering. Streaming video from the bridge would need device code of our own, which ADR-0002 rules out.
- **Fallback, if the page costs too much:** the Claude Code progress line plus a statusline, both fed by the run log.

Link the prototype and a screenshot as assets.
