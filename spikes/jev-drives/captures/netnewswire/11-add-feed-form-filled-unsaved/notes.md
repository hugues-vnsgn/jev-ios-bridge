# NetNewsWire: Add Feed form filled but not saved

Simulator jev-drives-eval (iPhone 17, iOS 26.4), screenHash `0a1xl8i`. Local "On My iPhone" account with the default feeds; article content is live and will drift. Captured 2026-10-01.

## How reached
1. As 10.
2. type-text into the URL field: "https://example.com/feed.xml".
3. type-text into the Title field: "Example Feed".
4. Not saved. Afterwards tapped Cancel; no feed was added.

## Next steps a plan might ask
- "Add the feed." (the sheet's Add, top right)
- "Is the feed in my list?" (no, still unsaved)
- "Put it in a folder."

## Traps
- **Unsaved form:** URL and title visible, but nothing saved until the sheet's Add is tapped.
- **Duplicate buttons:** two "Add" buttons are visible tap targets: the sheet's confirm (y 82, top right) and the occluded toolbar "+" (y 803) from the feed list underneath. Same for `other`/`button` twins of Add and Cancel.
- Folder row label "Folder, On My iPhone" fuses label and value.
