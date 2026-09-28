# Diagnostic app (Android)

The Android twin of [`../diagnostic-app`](../diagnostic-app/README.md), in Jetpack Compose on the Compose Multiplatform 1.11.1 artifacts. It has the same two screens, the same identifiers (`selection.summary`, `choose.apple`, `choose.bread`, `order.complete`, `confirmation.title`, `confirmation.total`), and the same planted bug: `CheckoutModel.totalCents` returns the last item's price, so the confirmation shows **Total: $3** instead of $5.

`MainActivity` sets `semantics { testTagsAsResourceId = true }` on the root, so every `testTag` appears as the element's `resource-id` in UI Automator dumps. Without it, Android captures carry no identifiers.

Build and install on an emulator (the application ID is `dev.jevbridge.diagnostic`):

```sh
./gradlew :app:assembleDebug
adb -s emulator-5554 install -r app/build/outputs/apk/debug/app-debug.apk
```

`CheckoutModelTest.twoItemsShowTheirSum` is intentionally red until the bug is fixed.

This README reveals the planted cause. Keep it out of the diagnostic agent's prompt.
