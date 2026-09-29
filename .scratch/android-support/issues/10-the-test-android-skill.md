# The /test-android skill

Type: grilling
Status: open
Blocked by: none

## Question

What does the `/test-android` skill say, and how does an author see the screen while writing a script?

- How much it shares with `/test-ios` (`skills/test-ios/SKILL.md`): one shared body with platform notes, or two skills.
- How it captures a screen while authoring: mobilecli directly (it needs the guard environment, and the plugin path rewrite from "mobilecli as a dependency"), or a new bridge command that prints the mapped elements, with the selectors an author can use.
- What it teaches that differs from iOS: `testTagsAsResourceId`, `app.package`, `device.avd`, placeholders, password dots, non-English typing, and the claim notes from "What Jev sees on Android, and the 10-screen check".
