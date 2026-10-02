# ReadMe: Add New Book form filled but not saved

Simulator jev-drives-eval (iPhone 17, iOS 26.4), screenHash `1a4y18z`. Captured 2026-10-01.

## How reached
1. Launch, tap "Add New Book" (06).
2. type-text into the Title field: "The Left Hand of Darkness".
3. type-text into the Author field: "Ursula K. Le Guin". The simulator's keyboard autocorrected it to "Ursula K. Lê Guin".
4. Nothing saved. Afterwards the sheet was swiped down (AXe swipe 200,90 to 200,800); no book was added.

## Next steps a plan might ask
- "Add the book to the library." (Add to Library, now enabled)
- "Is the new book saved?" (no: the form is still open)
- "Set the review to 'Classic'."
- "Check the author reads 'Ursula K. Le Guin'." (it doesn't)

## Traps
- **Unsaved form:** the title and author are visible and the list underneath is still in the text, so "the book is in my library" can look true. It isn't until Add to Library is tapped.
- **Typed value differs from the plan's:** autocorrect turned "Le" into "Lê".
- Review placeholder still reads as a value ("Review…").
- Duplicate texts: "Add to Library" appears as both an `other` and a `button` with the same frame.
