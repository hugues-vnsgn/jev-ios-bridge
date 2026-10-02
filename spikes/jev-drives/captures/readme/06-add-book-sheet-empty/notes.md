# ReadMe: Add New Book sheet, empty

Simulator jev-drives-eval (iPhone 17, iOS 26.4), screenHash `0p9onvg`. Captured 2026-10-01.

## How reached
1. Launch (01). (Bosch now has an image from 04.)
2. Tap "Add New Book".

## Next steps a plan might ask
- "Enter the title 'The Left Hand of Darkness'."
- "Add the book to the library." (not possible yet: Add to Library is disabled until title and author are filled)
- "Close the form without adding a book."

## Traps
- **Occluded list exposed:** the whole library list under the sheet (rows, Edit, Add New Book) is still in the capture as visible tap targets.
- **Placeholders read as values:** empty fields show `value: "Title"`, `"Author"`, `"Review…"`; an empty field looks filled.
- **No Cancel button:** the sheet is closed only by swiping it down.
- **Disabled control with a misleading twin:** the Add to Library button has `enabled: false`, but an `other` element with the same label and frame says `enabled: true`.
