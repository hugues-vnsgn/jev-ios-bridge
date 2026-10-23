# Tap, gestures and coordinates

This throwaway prototype supplies evidence for ticket 08 at base `685b435d07c5ab6b9becf00177b9a5ee09fdfb30`. The owner decides the operation contract. No adapter code changed.

Counts come exclusively from PFX `FIXTURE_EVENT` lines. They count app callbacks. OS touch-packet counts remain unknown. Raw logs, scripts, source XML, settings, screenshots, failed attempts, and shutdown receipts remain in `/Users/hugues_mini/.codex/reports/jev-ios-bridge/phase3-build/P08-evidence`.

## Dispatch and callbacks

| Operation | Dispatch | Android callbacks | iOS callbacks |
| --- | --- | --- | --- |
| Visible Alpha tap | Direct element click, three trials each | One tap each | One tap each |
| Visible Beta centre tap | W3C move 0, down, pause 50 ms, up, three trials each | One tap each | One tap each |
| Largest-scrollable down | One W3C drag | One vertical swipe | One vertical swipe |
| Largest-scrollable up | One W3C drag | One vertical swipe | One vertical swipe |
| Screen-middle down | One W3C drag | One vertical swipe | One vertical swipe |
| Screen-middle up | One W3C drag | One vertical swipe | One vertical swipe |
| Horizontal left | One W3C drag | Two, vertical and horizontal observers | Two, vertical and horizontal observers |
| Detail back | Android `pressKeyCode(4)`, iOS `detail.back` click | One back, Navigation restored | One tap, Navigation restored |
| Left-edge back | W3C drag from x=20 to width-20 at mid-height, 300 ms | Not requested | Zero, Detail remains open |
| Hold | W3C down, authored pause, up | Not requested | One hold per trial, six trials |
| JPEG pixel tap | W3C centre tap after coordinate conversion | One Gamma tap | Not requested |

The horizontal callbacks come from nested observers, not two dispatched sequences. Other menu and back setup operations each recorded one callback. Final comparisons contain 23 Android operations with 24 callbacks and 33 iOS operations with 33 callbacks. The failed first iOS attempt is retained separately.

Android largest-scrollable uses 90% to 10% of its frame in 1000 ms. Screen-middle uses 70% to 30% in 1000 ms. Reverse strokes reverse the endpoints. iOS largest-scrollable uses distance 0.4 after MobileBuildMCP's 15% insets, in 1000 ms. On the 640-point frame, y=594 to y=414 gives 180 points, or 28.125% after rounding. Root confirmed preserving this actual approximately 28% stroke and recording the 0.4 parameter. General iOS horizontal swipe uses the full inset span in 1000 ms. iOS screen-middle uses a centred 200-point stroke in 500 ms. Installed AXe binary disassembly confirms these inherited defaults. See [source-audit.md](source-audit.md).

The iOS fixture hides the standard navigation back button and has no edge-swipe recorder. Zero callbacks cannot establish zero native input attempts. Edge-back parity remains unproven. A separate back-button operation subsequently returned to Navigation with one callback. There was no mutating fallback after the edge attempt.

## Hold calibration

| Authored pause, ms | Fixture duration, ms |
| --- | --- |
| 0 | 14.963 |
| 50 | 74.390 |
| 100 | 133.417 |
| 250 | 253.828 |
| 50 | 76.426 |
| 50 | 71.049 |

The 50 ms group has n=3, median 74.390 ms, and range 71.049 to 76.426 ms. Each trial recorded one hold callback. The fixture uses device Date between the first DragGesture onChanged callback and onEnded. This measures neither physical down-to-up duration nor MCP round-trip time. The calibration changes with the authored pause. WDA schedules lift at the accumulated action duration. Callback delivery can affect the residual, whose exact cause was not traced. These values establish callback intervals only. Full values remain in `hold-results.json`.

## Screenshot and conversion

One screenshot per platform followed successful fixture settling. Appium returned Android PNG 320x640 and iOS PNG 1206x2622. Sharp produced JPEG 320x640 and 368x800 with an 800 px limit and no enlargement. Neither screenshot was retaken. Saved image headers and JPEG contents were inspected.

Android window rect stayed at x=0, y=0, width=320, height=640 in PORTRAIT around capture and before input. JPEG pixel x=226, y=152 converted to device x=226, y=152 using `screenPointOf` scale, round, and clamp. One Gamma callback proves activation. Quantization error relative to the resolved centre is zero on each axis, n=1. The identity scale and integer centre explain zero error. Spread is not estimable. Physical landing error is unknown because callbacks contain no coordinates.

Root accepted this 1:1 hit as conversion-path proof. Non-unit Android scaling, another screen size, rotation, and stale-refusal runtime cases remain Phase 4. Root requires scaling-math unit tests during the adapter build. iOS coordinate tapping was not tested.

## Hidden retries and verification

Frozen appium-mcp 1.97.0 iOS convenience swipe can try native swipe, native drag, then W3C actions, up to three mutations. Long press can try native hold then W3C, up to two, and enforces a 500 ms minimum. Scroll-to-element loops. Native mobile scroll does not guarantee one drag. Explicit `appium_perform_actions` forwards once with no mutating catch fallback. `handleTap` has no such fallback. Direct click permits native implicit scrolling on offscreen targets. This comparison used visible controls. The public Android key tool has no mutating fallback, but this probe used the direct driver method through its evidence extension.

The first iOS attempt failed before swiping because XCUITest has no `getOrientation` method. The evidence helper now uses `proxyCommand('/orientation', 'GET')` on iOS and retains `getOrientation` on Android, matching frozen `command.ts`. Cleanup passed before one full retry. Android's immediate shutdown verification initially refused. Later read-only observations showed the PID gone, serial absent, and ports closed. One verification retry passed. The original lagging predicate is unknown.

Final shutdown passed six offline and closed-port samples per platform. Android settings returned to baseline and both MCP children exited 0. The run pinned `skipLogCapture=true`, iOS `waitForIdleTimeout=1` and `snapshotMaxDepth=50`, and the locked Android settings. Frozen hashes matched and the main checkout's tracked status was unchanged. No Jev or real admission store was used.

Typecheck, the full 2613-test host suite and build, packaging proof, and the retained-evidence verifier passed. No production tests changed. The fixture XML settle instrument does not prove the production normalizer or every locked settling rule. Explicit W3C gestures avoid the convenience fallbacks, but the owner still decides dispatch. Both visible tap forms worked. Neither callback counts nor handler inspection prove every driver's internal native-attempt count.

`verify-evidence.mjs` rechecks raw callback membership, tap counts, image headers, shutdown receipts, settings restoration, frozen hashes, and saved host checks. Its argument is the external evidence directory above. It does not boot or contact devices. The workflow checklist is external `workflow.md`. Device work used GPT-6.1-Sol at inherited high effort. The resumed report and publication used GPT-6.1-Sol at xhigh. The worker changed neither setting and used no subagents or reviewers.
