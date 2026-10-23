# Frozen handler audit

Read directly from the frozen candidate stack's appium-mcp source, version 1.97.0. SHA-256 entries for the gesture source files are in frozen-before.json.

- `handlers/tap.ts` handleTap sends one elementClick or one W3C sequence. Its point sequence moves at duration 0, presses, pauses 50 ms, and releases. No mutating catch fallback.
- `handlers/tap.ts` handleLongPress tries iOS mobile: touchAndHold and catches any error before sending a W3C fallback. An uncertain first mutation can therefore be followed by another. Its 500 ms minimum also cannot represent today's observed 50 ms hold.
- `handlers/swipe-scroll.ts` handleSwipe with iOS direction, no elementUUID, and non-fast speed tries mobile: swipe, catches, tries mobile: dragFromToForDuration, catches, then W3C drag. Up to three mutating commands. Fast or element/custom-coordinate forms take one W3C path, but their defaults differ from today's geometry and timing.
- `handlers/swipe-scroll.ts` handleScroll sends one command, but iOS direction without elementUUID uses mobile: scroll. Its internal scrolling is not a one-drag guarantee. Other paths use an 800 ms move after a 250 ms pause by default.
- `handlers/scroll-to-element.ts` loops up to maxScrollAttempts, reads XML around each scroll, and can send several scroll mutations. It is a search operation, not one authorized scroll.
- `perform-actions.ts` sends one command.performActions and returns errors. command.ts forwards once to the embedded driver's performActions. The tested explicit sequence therefore bypasses gesture convenience fallbacks.
- `gesture.ts` dispatches back once through command.back. This prototype uses explicit Android driver.pressKeyCode(4) to preserve the Android BACK key semantics.
- Native XCUITest driver click forwards once to /element/:id/click. Its documentation warns XCTest may implicitly scroll an offscreen element into view. The comparison uses visible Recorder controls only.

Today's bridge source uses Android 1000 ms 90%-10% strokes within the largest eligible scrollable and 70%-30% for screen-middle. iOS SCROLL_STROKE_DISTANCE is 0.4, applied by MobileBuildMCP after 15% or at least 24-point insets. This makes the stroke 28% of an ordinary tall frame, despite the bridge comment saying 40%. General iOS swipe omits distance and uses the vendor default, the entire inset span. Both omit duration and therefore inherit AXe's default.

The local axe-reachability-upstream Sources/AXe/Commands/Swipe.swift supplies a 1 s swipe default. Gesture.swift supplies a centred 200-point scroll in 0.5 s and a left-edge path from x=20 to width-20 in 0.3 s. The exact bundled binary was independently disassembled. Its coordinate function contains width/2, height/2, +/-100 and +/-20 constants, and the default duration branches contain 0.5 s, 0.3 s and 1.0 s. The excerpts and binary hash are retained in axe-coordinates-excerpt.txt, axe-timing-excerpt.txt and axe-binary.json. These values preserve the installed binary defaults; they are not new timing choices.

Fixture events count app callbacks only. No successful zero-event action is automatically called zero OS inputs, and no duplicate nested callbacks are automatically called repeated gestures. Counts are derived exclusively from FIXTURE_EVENT lines.
