# NetNewsWire: paste permission alert (opening Add Feed)

Simulator jev-drives-eval (iPhone 17, iOS 26.4), screenHash `0vj4wq6`. Local "On My iPhone" account with the default feeds; article content is live and will drift. Captured 2026-10-01.

## How reached
1. As 08, then tap "Add Feed".
2. The system alert "“NetNewsWire” would like to paste from “CoreSimulatorBridge”. Do you want to allow this?" appears (Don’t Allow Paste / Allow Paste). The app reads the clipboard to prefill a URL.
3. Afterwards tapped "Don’t Allow Paste".

## Next steps a plan might ask
- "Enter the feed URL https://example.com/feed.xml." (alert must be handled first)
- "Allow paste." / "Don't allow paste."

## Traps
- **Unexpected dialog / system UI** that appears only when the clipboard holds something, so it is not reproducible run to run.
- App content underneath absent from the text (SpringBoard only).
- "Return to ReadMe" system breadcrumb button.
