# Watch view: a localhost timeline page

Type: prototype
Status: resolved
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


## Answer

Keep the localhost timeline. It renders the same recorded verdict, actions, checkpoint claims/probabilities, screenshots, and available app-log tails as the report. Bind to `127.0.0.1` on an available port and return the token-bearing URL with the run ID. The server and page end with the bridge process. Use Simulator.app for a live device view; the bridge provides captured screenshots, not video or an overlay.

The supported scripted path has no Jev Choice or build stages: Jev judges assertions, while build/install happen before the run. The timeline labels those facts directly. A misleading "Checkpoint confirmed" heading on failed assertions was corrected to "Checkpoint result."

Verification replayed actual Diagnostic d03: 12 events, three actions, four decoded screenshots, a 4% assertion probability, and matching failed checkpoint/final verdict. Desktop and 375-pixel layouts rendered without overflow or browser errors. Missing/wrong tokens returned 401, invalid image names returned 400, CSP was present, and injected markup remained inert text. The main agent inspected the corrected screenshots and accepts the view under the owner's implementation-through-release delegation.

Assets: [full timeline](../../../docs/research/assets/watch-scripted-d03-full.png), [final result](../../../docs/research/assets/watch-scripted-d03-final.png), [narrow screen](../../../docs/research/assets/watch-scripted-d03-narrow.png), and [check evidence](../../../docs/research/assets/watch-scripted-d03-evidence.json). Browser inspection used an isolated headless profile and did not control the simulator.
