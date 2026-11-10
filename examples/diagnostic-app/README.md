# Diagnostic app

This two-screen SwiftUI app gives the bridge a known failure to report. On **Sample Shop**, add Apple ($2) and Bread ($3), then tap **Complete order**. The confirmation lists both items and says **Order complete**, but shows **Total: $3**. The correct total is $5. The planted bug is in `CheckoutModel.totalCents`: it returns the last selected item's price.

`scenario.json` supplies guarded taps for Apple, Bread, and Complete order, then checks the confirmation screen and the expected $5 total. A useful report should mark the run failed and show enough screen text to identify the bad total. The app uses in-memory synthetic items and resets when launched.

The first screen also exposes `Selected: Apple` and `Selected: Apple, Bread` as accessibility text after each tap. This makes the intermediate state visible in a screen capture.

Launched with the arguments `-screen fields` (script `"launchArgs": ["-screen", "fields"]`), the app opens a **Text fields** screen instead. It holds four text fields with no accessibility identifier: one labelled `Nickname`, one with neither identifier nor label, and two that share the label `Note`. The text `fields.echo` shows all four values. The Phase 4 replace-text locator row uses it. Without that argument the app is unchanged.

The Xcode project is checked in. To regenerate it, run `xcodegen generate` in this directory. Build without launching a simulator UI:

```sh
xcodebuild -project DiagnosticApp.xcodeproj -scheme DiagnosticApp -configuration Debug -destination 'generic/platform=iOS Simulator' -derivedDataPath build CODE_SIGNING_ALLOWED=NO build
```

The bundle ID is `dev.jevbridge.diagnostic`. Before you run the scenario, install the built app on the dedicated simulator with `xcrun simctl install <UUID> build/Build/Products/Debug-iphonesimulator/DiagnosticApp.app`. The bridge launches an installed app by bundle ID. `CheckoutModelTests.testTwoItemsShowTheirSum` is intentionally red until the bug is fixed. Do not treat that failure as an unrelated build break.

Keep `INFOPLIST_KEY_UILaunchScreen_Generation: YES` in `project.yml`. Without a launch screen, iOS letterboxed this app, and the MobileBuildMCP driver the bridge used before Appium reported a successful Add Apple tap at an accessibility coordinate above the visible button. The snapshot stayed unchanged. With the launch screen, those taps advanced through Apple, Bread, and confirmation, while the planted total still read $3.

This README reveals the planted cause. Keep it out of the diagnostic agent's prompt when testing whether the run report alone points to the defect.
