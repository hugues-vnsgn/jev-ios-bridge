# NetNewsWire: timeline row swipe actions (More, Star)

Simulator jev-drives-eval (iPhone 17, iOS 26.4), screenHash `0ci3jcs`. Local "On My iPhone" account with the default feeds; article content is live and will drift. Captured 2026-10-01.

## How reached
1. Launch, Don’t Allow, Daring Fireball (03); the Spitballed article was opened and starred (04, 05), then Back.
2. Coordinate swipe left on the "Destroy Any Website" row (AXe swipe 360,530 to 200,530). Grey "More" and yellow "Star" buttons appear.
3. Afterwards closed with a coordinate tap; nothing starred.

## Next steps a plan might ask
- "Star the article 'Destroy Any Website'."
- "Open the article 'Bastardica'."
- "Mark 'Destroy Any Website' as read." (under More)

## Traps
- **Which row does Star apply to?** The Star button's label is just "Star"; the row it belongs to is only known from frame overlap (row y 484–577). Two rows up, another article is already starred.
- **Icon-only buttons** (ellipsis, star) with labels duplicated as separate `text` elements ("More", "Star").
- Starred row label now begins "Starred, …" instead of "Unread, …".
