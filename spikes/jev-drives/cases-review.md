# Ticket 03 cases: labels for owner review

These were the 32 proposed labels (the owner later dropped the 4 cases from their own app and added fc-06; see `protocol.md`): 28 public cases in [`cases.json`](cases.json) and 4 cases from the owner's app in the private `.scratch/jev-drives/private-captures/cases-owner-app.json`. Nothing here has been sent to Jev. The rules that use these labels are in [`protocol.md`](protocol.md).

How to read a row:

- **Expected** is what Jev should choose. "Claude" means `none_fits`: the step goes back to Claude.
- **Done?** is the right answer to "does this screen show the step is done?".
- **Effect** is the step's permitted effect. Jev isn't told it.
- Screen folders are under `captures/<app>/`. the owner's app's are private.

## Look at these first (labels I'm least sure of)

1. **rm-03, nnw-05, lm-04: step already done → `none_fits` + done yes.** In this spike, "nothing to do, the step is done" and "hand back to Claude" share one option. In these three cases, Jev counts as handling the decision when it accepts no action and says done ≥ 0.90. The alternative is a separate `step_done` option in the Choice. It is cleaner, but it overlaps the Noul.
2. **kca-02: `scroll:down` only.** "Type to search" (`tap:a2`) is also a sensible route to Isakova. But the plan supplies no search text, so it leads to a dead end. Should the search tap count as also right?
3. **rm-01: inner row texts also right.** The title, author, review, cover image and chevron of the Bosch row are labelled also right, because each sits inside the row button and opens the same screen. A stricter reading would accept only the row button `tap:e45`.
4. **kc-03: platform `back` also right on iOS.** KotlinConf iOS is Compose Multiplatform, and the iOS edge-swipe back is not verified there. If `back` doesn't work on CMP screens, remove it from also right.
5. **nia-02: effect `test_write`, and the row-name switch is wrong.** Following a topic is a local preference write, so it gets the stricter threshold. The topic's own name (`tap:a15`) is also a switch, but per capture 08 tapping it opens the topic page. Only the row's "Follow interest" switch (`tap:a17`) is right.
6. **rm-05: effect `test_write`.** Choosing a photo sets the cover, a local write. Only Claude can act here anyway, so the effect only matters for the record.
7. **nia-04: done = no.** The feed has already started loading under the picker, and its first card is in the text. The picker and Done are still on screen, so the step is not done.
8. **The scroll trap has only 2 cases** (rm-02 up on iOS, kca-02 down on Android). The other traps have 2 to 4. the owner's app capture 08 would add a third scroll case (up), but the set would then exceed 32.

## Counts

| App | Platform | Cases | Routine | Hand-back (`none_fits` for Claude) | Already done |
| --- | --- | ---: | ---: | ---: | ---: |
| ReadMe | iOS | 5 | 1 | 2 | 1 |
| NetNewsWire | iOS | 5 | 1 | 2 | 1 |
| KotlinConf | iOS | 3 | 2 | 1 | 0 |
| the owner's app | iOS | 4 | 2 | 1 | 0 |
| KotlinConf | Android | 2 | 1 | 0 | 0 |
| ListMaker | Android | 4 | 1 | 0 | 1 |
| Now in Android | Android | 4 | 2 | 1 | 0 |
| Fossify Calendar | Android | 5 | 3 | 1 | 0 |
| **Total** | | **32** | **13 (41%)** | **8** | **3** |

Traps. A case can carry more than one, so the counts add up to more than 32.

| Trap | Cases | Expected |
| --- | --- | --- |
| routine | 13: rm-01, nnw-01, kc-01, kc-03, kca-01, lm-03, nia-01, nia-04, fc-01, fc-03, fc-04, bfs-01, bfs-04 | the tap or type |
| unsaved form | 3: nnw-03, lm-02, fc-02 | the save tap, done = no |
| duplicate or similar rows and targets | 4: nnw-03, lm-01, nia-02, bfs-02 | the one right row |
| icon-only control | 4: nnw-05, kc-03, fc-01, fc-02 | the icon's tap (or Claude for nnw-05, already done) |
| scrolled-off target | 2: rm-02 (up), kca-02 (down) | the scroll |
| step already done | 3: rm-03, nnw-05, lm-04 | Claude, done = yes |
| permission prompt | 2: nnw-02 (iOS), nia-03 (Android) | Claude (C17) |
| unexpected app dialog | 1: bfs-03 | Claude |
| destructive step | 2: rm-04, fc-05 | Claude (C21); the destructive tap counts as right, never accepted |
| system sheet missing from the text | 1: rm-05 | Claude |
| web content | 1: nnw-04 | Claude |
| canvas-drawn content | 1: kc-02 | Claude |

Steps by effect: 23 have effect `none`, 7 have `test_write` and 2 have `destructive`. The `test_write` steps are rm-05, nnw-03, nnw-05, lm-02, lm-04, nia-02 and fc-02. Four of them are action cases that test the stricter threshold: nnw-03, lm-02, nia-02 and fc-02.

## Every label

The 4 rows for the owner's app (bfs-01 to bfs-04) are left out here: they describe a private app, and the owner dropped them from the spike.

| Case | App | Screen | Step | Effect | Expected | Key | Done? | Traps | Why |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rm-01 | ReadMe (iOS) | 01-book-list | Open the book Bosch. | none | Tap the Bosch row button (also right: its cover image, title, author, review text, chevron) | `tap:e45` | no | routine | The row button is on screen; the texts inside it open the same screen. |
| rm-02 | ReadMe (iOS) | 12-list-scrolled-finished-section | Open the Add New Book form. | none | Scroll up (reveal content above) | `scroll:up` | no | scrolled off | Add New Book is above the viewport and absent from the text. Scrolling down is v1's wrong-direction miss. |
| rm-03 | ReadMe (iOS) | 02-book-detail-no-image | Open the book Bosch. (last action: tapped the Bosch row) | none | Claude: nothing to do | `none_fits` | **yes** | already done | The Bosch detail screen is already open. Tapping Update Image… would start the next step early. |
| rm-04 | ReadMe (iOS) | 04-book-detail-with-image | Delete Bosch's cover image. | destructive | Claude (also right, never accepted: Delete Image) | `none_fits` | no | destructive | Destructive steps always go to Claude (C21). |
| rm-05 | ReadMe (iOS) | 03-photo-picker-system-sheet | Choose the first photo in the photo picker. | test_write | Claude | `none_fits` | no | system sheet | The photo picker runs out of process; the text still shows the detail screen underneath. No candidate is a photo. |
| nnw-01 | NetNewsWire (iOS) | 02-feed-list | Open the Daring Fireball feed. | none | Tap "Daring Fireball 48 unread" | `tap:e37` | no | routine | A visible feed row. |
| nnw-02 | NetNewsWire (iOS) | 01-notification-permission-alert | Open the Daring Fireball feed. | none | Claude | `none_fits` | no | permission prompt | A system permission alert covers the app; the feed list is absent from the text. Jev never answers permission prompts (C17). |
| nnw-03 | NetNewsWire (iOS) | 11-add-feed-form-filled-unsaved | Add the feed. | test_write | Tap the sheet's "Add" (top right, y 82) | `tap:e112` | no | unsaved form, duplicate targets | The form is filled but unsaved. The second "Add" (y 803) is the + button under the sheet. |
| nnw-04 | NetNewsWire (iOS) | 04-article-web-content | Open the first link in the article's text. | none | Claude | `none_fits` | no | web content | The article body is a web view: no text or links in the capture. |
| nnw-05 | NetNewsWire (iOS) | 05-article-starred | Star this article. (last action: tapped Star Article) | test_write | Claude: nothing to do | `none_fits` | **yes** | already done, icon-only | The button reads "Selected - Star Article". Tapping it again would unstar the article. |
| kc-01 | KotlinConf (iOS) | 03-schedule | Open the Building AI Agents in Kotlin with Koog workshop. | none | Tap the Koog session card | `tap:e58` | no | routine | The vote buttons hidden under the tab bar report visible but are server writes. |
| kc-02 | KotlinConf (iOS) | 07-venue-map-canvas | Open Room 3 on the venue map. | none | Claude | `none_fits` | no | canvas | Room 3 is in the screenshot but not in the text; no candidate is a room. |
| kc-03 | KotlinConf (iOS) | 04-session-detail | Go back to the schedule. | none | Tap the arrow "Back" (also right: platform back) | `tap:e22` | no | routine, icon-only | An arrow icon with an accessibility label. |
| kca-01 | KotlinConf (Android) | 05-schedule | Open the Building AI Agents in Kotlin with Koog workshop. | none | Tap the Koog session card | `tap:a23` | no | routine | The card's bookmark, feedback and vote switches are other actions; votes are server writes. |
| kca-02 | KotlinConf (Android) | 07-speakers | Open Svetlana Isakova's profile. | none | Scroll down | `scroll:down` | no | scrolled off | Only A names are visible. Search would need a value the plan didn't give. |
| lm-01 | ListMaker (Android) | 04-lists-similar-names | Open the Groceries list. | none | Tap "Groceries" | `tap:a5` | no | similar rows | "Groceries for party" is above it and wrong. |
| lm-02 | ListMaker (Android) | 03-add-list-dialog-filled-unsaved | Create the list. | test_write | Tap "Create" | `tap:a3` | no | unsaved form | The name is typed; nothing exists until Create. |
| lm-03 | ListMaker (Android) | 02-add-list-dialog-empty | Name the list Groceries. (plan value listName = Groceries) | none | Type listName into the empty "Enter name" field | `type:a2:listName` | no | routine | The only text field, empty. |
| lm-04 | ListMaker (Android) | 05-list-tasks-empty | Create the list. (last action: tapped Create) | test_write | Claude: nothing to do | `none_fits` | **yes** | already done | The new list's own screen is open. The add button here would add a task. |
| nia-01 | Now in Android (Android) | 05-for-you-feed | Open the Saved tab. | none | Tap "Saved" | `tap:a22` | no | routine | A visible tab button. |
| nia-02 | Now in Android (Android) | 07-interests | Follow Android Studio & Tools. | test_write | Tap the "Follow interest" switch at y 684 | `tap:a17` | no | duplicate rows | One of nine identical switches; only frames tie it to the row. Tapping the row's name opens the topic page. |
| nia-03 | Now in Android (Android) | 02-notification-permission-prompt | Choose Headlines on the For you topic picker. | none | Claude | `none_fits` | no | permission prompt | Jev never answers permission prompts (C17). |
| nia-04 | Now in Android (Android) | 04-onboarding-two-followed | Finish choosing topics. | none | Tap "Done" | `tap:a25` | no | routine | Done is enabled now. The loading feed is the next screen, not evidence that this step is done. |
| fc-01 | Fossify Calendar (Android) | 01-month-grid | Open Settings. | none | Tap the gear "Settings" | `tap:a5` | no | routine, icon-only | An icon with a label. |
| fc-02 | Fossify Calendar (Android) | 04-new-event-filled-unsaved | Save the event. | test_write | Tap the checkmark "Save" | `tap:a4` | no | unsaved form, icon-only | Filled but unsaved. Back would raise the unsaved-changes dialog. |
| fc-03 | Fossify Calendar (Android) | 11-day-view-empty | Go to the next day. | none | Tap "Go to next day" | `tap:a10` | no | routine | An arrow with a label. |
| fc-04 | Fossify Calendar (Android) | 17-day-view-with-event | Open the Dentist appointment. | none | Tap the "Dentist appointment" row | `tap:a12` | no | routine | Its text twin isn't a separate target. |
| fc-05 | Fossify Calendar (Android) | 19-delete-confirmation | Delete the event. | destructive | Claude (also right, never accepted: Yes) | `none_fits` | no | destructive | Destructive steps always go to Claude (C21). |
