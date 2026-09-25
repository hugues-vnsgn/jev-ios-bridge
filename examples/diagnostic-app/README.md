# Diagnostic app

This two-screen SwiftUI app gives the bridge a known failure to report. On **Sample Shop**, add Apple ($2) and Bread ($3), then tap **Complete order**. The confirmation lists both items and says **Order complete**, but shows **Total: $3**. The correct total is $5. The planted bug is in `CheckoutModel.totalCents`: it returns the last selected item's price.

`scenario.json` supplies guarded taps for Apple, Bread, and Complete order, then checks the confirmation screen and the expected $5 total. A useful report should mark the run failed and show enough screen text to identify the bad total. The app uses in-memory synthetic items and resets when launched.

The first screen also exposes `Selected: Apple` and `Selected: Apple, Bread` as accessibility text after each tap. This makes the intermediate state visible in a MobileBuildMCP snapshot.

The Xcode project is checked in. To regenerate it, run `xcodegen generate` in this directory. Build without launching a simulator UI:

```sh
xcodebuild -project DiagnosticApp.xcodeproj -scheme DiagnosticApp -configuration Debug -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

The bundle ID is `dev.jevbridge.diagnostic`. Install the built `.app` on the dedicated simulator through MobileBuildMCP before running the scenario; the bridge currently launches an installed app by bundle ID. `CheckoutModelTests.testTwoItemsShowTheirSum` is intentionally red until the bug is fixed. Do not treat that failure as an unrelated build break.

Keep `INFOPLIST_KEY_UILaunchScreen_Generation: YES` in `project.yml`. Without a launch screen, iOS letterboxed this app and MobileBuildMCP reported a successful Add Apple tap at an accessibility coordinate above the visible button; the snapshot stayed unchanged. With the launch screen, pinned MobileBuildMCP taps advance through Apple, Bread, and confirmation, while the planted total still reads $3.

This README reveals the planted cause. Keep it out of the diagnostic agent's prompt when testing whether the run report alone points to the defect.
