# Scripted assertion corpus: owner label review

Corpus SHA-256: 4d7e3853e79c7ffd3315ce9d908ebe9d4685ce28cff59674470ca0f861b43303
Manifest SHA-256: 527e9b4b60e18e54df243447f19c96c7b51ac1b64496b601524f32810a2d837d
Implementation SHA-256: dbdb58f782d86191a2d35b7a932b0ca9cc38568503d1908c03310795f6c44884

Review all 24 paired screens, both claim labels, rationale, setup, raw capture and screenshot. The approval template remains false until the owner decides.

## s01-weather-ber-query — weather-berlin-search

App: com.sentry.weather.Weather. Snapshot sequence: 10.
Raw full capture: raw/s01-weather-ber-query.full.json. Screenshot: raw/s01-weather-ber-query.jpg.
Setup: Launch the Sentry Weather mock fixture. → Tap the San Francisco location button. → Type Ber into the location search field.

- **a (true)** The location search field contains Ber. — The visible search text field has value Ber.
- **b (false)** The location search field contains the complete word Berlin. — Berlin appears as a result, but the search field itself contains only Ber.

## s02-weather-berlin-results — weather-berlin-search

App: com.sentry.weather.Weather. Snapshot sequence: 14.
Raw full capture: raw/s02-weather-berlin-results.full.json. Screenshot: raw/s02-weather-berlin-results.jpg.
Setup: From the Ber search, replace the location search text with Berlin. → Wait for the Berlin, Germany result to settle.

- **a (false)** The main Weather location button already reads Berlin. — The underlying main location button still reads San Francisco.
- **b (true)** The location search results include Berlin, Germany. — The locations sheet has a Berlin, Germany result button.

## s03-weather-berlin-main — weather-berlin-search

App: com.sentry.weather.Weather. Snapshot sequence: 21.
Raw full capture: raw/s03-weather-berlin-main.full.json. Screenshot: raw/s03-weather-berlin-main.jpg.
Setup: Tap the Berlin, Germany search result. → Tap Close on the locations sheet.

- **b (true)** The main Weather location button reads Berlin. — The unsheeted main location button is labeled Berlin.
- **a (false)** The main Weather location button reads Oslo. — The same main location button is not labeled Oslo.

## s04-weather-lisbon-main — weather-lisbon-distance

App: com.sentry.weather.Weather. Snapshot sequence: 33.
Raw full capture: raw/s04-weather-lisbon-main.full.json. Screenshot: raw/s04-weather-lisbon-main.jpg.
Setup: From Berlin main, open the locations sheet. → Search for Lisbon. → Tap the Lisbon, Portugal result. → Close the locations sheet.

- **b (false)** The main Weather location button reads Berlin. — The location button has changed from Berlin to Lisbon.
- **a (true)** The main Weather location button reads Lisbon. — The unsheeted location button and hero title read Lisbon.

## s05-weather-lisbon-distance-mi — weather-lisbon-distance

App: com.sentry.weather.Weather. Snapshot sequence: 37.
Raw full capture: raw/s05-weather-lisbon-distance-mi.full.json. Screenshot: raw/s05-weather-lisbon-distance-mi.jpg.
Setup: From Lisbon main, tap Settings. → Leave Distance at its initial mi selection.

- **a (true)** The Distance setting has mi selected. — The mi button value is selected in the Distance section.
- **b (false)** The Distance setting has km selected. — The km button value is not selected.

## s06-weather-lisbon-distance-km — weather-lisbon-distance

App: com.sentry.weather.Weather. Snapshot sequence: 41.
Raw full capture: raw/s06-weather-lisbon-distance-km.full.json. Screenshot: raw/s06-weather-lisbon-distance-km.jpg.
Setup: From Lisbon Settings with mi selected, tap the km Distance choice.

- **a (false)** The Distance setting has mi selected. — The mi button value is not selected.
- **b (true)** The Distance setting has km selected. — The km button value is selected in the Distance section.

## s07-contacts-tessa-duplicate-list — contacts-tessa-duplicate

App: com.apple.MobileAddressBook. Snapshot sequence: 216.
Raw full capture: raw/s07-contacts-tessa-duplicate-list.full.json. Screenshot: raw/s07-contacts-tessa-duplicate-list.jpg.
Setup: Create synthetic Northstar Lab Tessa Vale with six phone numbers and tessa.seed@example.test. → Create synthetic Harbor Lab Tessa Vale with tessa.harbor@example.test. → Return to the Contacts list and scroll until both Tessa Vale rows are above the Search overlay.

- **b (true)** Two separate Tessa Vale rows are visible in the Contacts list. — The screenshot and full capture show two distinct Tessa Vale list rows with separate frames.
- **a (false)** A Tessa Vale contact card is open. — The current screen is the Contacts list, not an opened contact card.

## s08-contacts-tessa-email-offscreen — contacts-tessa-duplicate

App: com.apple.MobileAddressBook. Snapshot sequence: 184.
Raw full capture: raw/s08-contacts-tessa-email-offscreen.full.json. Screenshot: raw/s08-contacts-tessa-email-offscreen.jpg.
Setup: From the visible duplicate rows, open the six-phone Northstar Lab Tessa Vale card. → Tap Edit without scrolling the form.

- **b (false)** The tessa.seed@example.test email field is visible in the current viewport. — The email field lies below the viewport and has no visible text field in this capture.
- **a (true)** The Tessa Vale Edit form shows six phone number fields. — Six populated phone fields appear in the foreground Edit form.

## s09-contacts-tessa-old-email-visible — contacts-tessa-duplicate

App: com.apple.MobileAddressBook. Snapshot sequence: 200.
Raw full capture: raw/s09-contacts-tessa-old-email-visible.full.json. Screenshot: raw/s09-contacts-tessa-old-email-visible.jpg.
Setup: Open Edit on the six-phone Northstar Lab Tessa Vale card. → Swipe upward within the Edit form by distance 0.25.

- **a (true)** The visible Tessa Vale email field contains tessa.seed@example.test. — The foreground Edit form now exposes the email field with the seed value.
- **b (false)** The visible Tessa Vale email field contains tessa.final@example.test. — The exposed field has the seed value, not the proposed final value.

## s10-contacts-nolan-old-email-edit — contacts-nolan-email

App: com.apple.MobileAddressBook. Snapshot sequence: 234.
Raw full capture: raw/s10-contacts-nolan-old-email-edit.full.json. Screenshot: raw/s10-contacts-nolan-old-email-edit.jpg.
Setup: Create synthetic Nolan Ames with nolan.seed@example.test and save the contact. → Open Nolan Ames Edit.

- **a (false)** The Nolan Ames Edit form email field contains nolan.final@example.test. — The visible email field has not been replaced yet.
- **b (true)** The Nolan Ames Edit form email field contains nolan.seed@example.test. — The foreground Edit form visibly shows the seed email value.

## s11-contacts-nolan-new-email-unsaved — contacts-nolan-email

App: com.apple.MobileAddressBook. Snapshot sequence: 238.
Raw full capture: raw/s11-contacts-nolan-new-email-unsaved.full.json. Screenshot: raw/s11-contacts-nolan-new-email-unsaved.jpg.
Setup: From Nolan Ames Edit, replace the seed email with nolan.final@example.test. → Leave the Edit form open with Done available.

- **b (true)** The Nolan Ames Edit form email field contains nolan.final@example.test. — The visible Edit form email field has the final value and Done is still available.
- **a (false)** The foreground Nolan Ames screen is the saved contact card with an Edit button. — The foreground screen is still the Edit form rather than the saved card.

## s12-contacts-nolan-new-email-saved — contacts-nolan-email

App: com.apple.MobileAddressBook. Snapshot sequence: 242.
Raw full capture: raw/s12-contacts-nolan-new-email-saved.full.json. Screenshot: raw/s12-contacts-nolan-new-email-saved.jpg.
Setup: From Nolan Ames Edit with final email entered, tap Done.

- **b (false)** The saved Nolan Ames contact card shows nolan.seed@example.test. — The saved card email row shows the final value, not the seed value.
- **a (true)** The saved Nolan Ames contact card shows nolan.final@example.test. — The card header and email row visibly show Nolan Ames and the final email.

## s13-contacts-nina-query — contacts-search-contrast

App: com.apple.MobileAddressBook. Snapshot sequence: 249.
Raw full capture: raw/s13-contacts-nina-query.full.json. Screenshot: raw/s13-contacts-nina-query.jpg.
Setup: Return to the Contacts list. → Type Nina in Search and wait for the result area to settle.

- **a (true)** The Contacts search field contains Nina. — The search field value is Nina.
- **b (false)** The Contacts search field contains Nina Calder. — Nina Calder is not the current search field value.

## s14-contacts-nina-calder-no-results — contacts-search-contrast

App: com.apple.MobileAddressBook. Snapshot sequence: 253.
Raw full capture: raw/s14-contacts-nina-calder-no-results.full.json. Screenshot: raw/s14-contacts-nina-calder-no-results.jpg.
Setup: Replace Nina in Contacts Search with Nina Calder. → Wait for explicit No Results text.

- **a (false)** A Nina Calder contact card is open. — No contact card is open; the screen remains in Search results.
- **b (true)** Contacts shows No Results for Nina Calder. — The foreground results text says No Results for Nina Calder.

## s15-contacts-tessa-search-two-results — contacts-search-contrast

App: com.apple.MobileAddressBook. Snapshot sequence: 257.
Raw full capture: raw/s15-contacts-tessa-search-two-results.full.json. Screenshot: raw/s15-contacts-tessa-search-two-results.jpg.
Setup: Replace Nina Calder in Contacts Search with Tessa Vale. → Wait for both matching rows.

- **b (true)** The Contacts search results show two Tessa Vale rows. — Two separate matching Tessa Vale result rows are visible at the top of results.
- **a (false)** Contacts shows No Results for Tessa Vale. — The search result area contains two matching rows, not a No Results message.

## s16-reminders-new-list-blank — reminders-signal-kit-list

App: com.apple.reminders. Snapshot sequence: 62.
Raw full capture: raw/s16-reminders-new-list-blank.full.json. Screenshot: raw/s16-reminders-new-list-blank.jpg.
Setup: Open Reminders My Lists. → Tap Add List and leave the New List name blank.

- **b (false)** The List Name field contains Signal Kit. — Signal Kit has not been typed into the field.
- **a (true)** The New List form shows an empty List Name field. — The foreground New List form has a blank List Name value.

## s17-reminders-signal-kit-unsaved — reminders-signal-kit-list

App: com.apple.reminders. Snapshot sequence: 66.
Raw full capture: raw/s17-reminders-signal-kit-unsaved.full.json. Screenshot: raw/s17-reminders-signal-kit-unsaved.jpg.
Setup: From the blank New List form, type Signal Kit into List Name. → Leave the New List form open with Done available.

- **a (true)** The New List form List Name field contains Signal Kit. — The foreground New List form shows Signal Kit in the text field.
- **b (false)** A Signal Kit row is already visible under My Lists. — The form is still open and the background My Lists has no Signal Kit row.

## s18-reminders-signal-kit-saved — reminders-signal-kit-list

App: com.apple.reminders. Snapshot sequence: 73.
Raw full capture: raw/s18-reminders-signal-kit-saved.full.json. Screenshot: raw/s18-reminders-signal-kit-saved.jpg.
Setup: From the typed Signal Kit New List form, tap Done. → Return to My Lists.

- **a (false)** The Signal Kit row shows 2 reminders. — A separate Market Errands row has 2 reminders, but Signal Kit has 0.
- **b (true)** My Lists shows a Signal Kit row with 0 reminders. — The saved Signal Kit list row is explicitly labeled 0 reminders.

## s19-reminders-charge-lantern-note-empty — reminders-charge-lantern-note

App: com.apple.reminders. Snapshot sequence: 83.
Raw full capture: raw/s19-reminders-charge-lantern-note-empty.full.json. Screenshot: raw/s19-reminders-charge-lantern-note-empty.jpg.
Setup: Open the Signal Kit list. → Tap New Reminder and type Charge lantern in Title. → Leave Notes empty.

- **b (true)** The Charge lantern editor has an empty Notes field. — The foreground editor shows the title and a blank Notes field.
- **a (false)** The Charge lantern Notes field contains Use green cable. — Use green cable has not been entered.

## s20-reminders-charge-lantern-note-unsaved — reminders-charge-lantern-note

App: com.apple.reminders. Snapshot sequence: 87.
Raw full capture: raw/s20-reminders-charge-lantern-note-unsaved.full.json. Screenshot: raw/s20-reminders-charge-lantern-note-unsaved.jpg.
Setup: From the Charge lantern editor, type Use green cable in Notes. → Leave the editor open with Done available.

- **b (false)** The Charge lantern Notes field is empty. — The Notes field visibly contains Use green cable.
- **a (true)** The open Charge lantern editor shows Notes value Use green cable and a Done button. — The full capture and screenshot show the populated Notes field with Done still present.

## s21-reminders-charge-lantern-note-saved — reminders-charge-lantern-note

App: com.apple.reminders. Snapshot sequence: 91.
Raw full capture: raw/s21-reminders-charge-lantern-note-saved.full.json. Screenshot: raw/s21-reminders-charge-lantern-note-saved.jpg.
Setup: From the Charge lantern editor with its note entered, tap Done.

- **a (true)** The Charge lantern list row includes the note Use green cable. — The visible list row label includes Charge lantern, Incomplete, Use green cable.
- **b (false)** The Charge lantern list row has no note text. — The row visibly includes note text after Done.

## s22-diagnostic-bread-selected — diagnostic-bread-first

App: dev.jevbridge.diagnostic. Snapshot sequence: 46.
Raw full capture: raw/s22-diagnostic-bread-selected.full.json. Screenshot: raw/s22-diagnostic-bread-selected.jpg.
Setup: Stop and relaunch the Diagnostic App to clear its in-memory selection. → Tap Add Bread ($3).

- **a (false)** The Sample Shop selection summary reads Selected: Apple. — Apple is not the selected item in this screen.
- **b (true)** The Sample Shop selection summary reads Selected: Bread. — The visible selection summary has only Bread.

## s23-diagnostic-bread-apple-selected — diagnostic-bread-first

App: dev.jevbridge.diagnostic. Snapshot sequence: 50.
Raw full capture: raw/s23-diagnostic-bread-apple-selected.full.json. Screenshot: raw/s23-diagnostic-bread-apple-selected.jpg.
Setup: From Bread selected, tap Add Apple ($2).

- **b (true)** The Sample Shop selection summary reads Selected: Bread, Apple. — The visible summary lists Bread before Apple.
- **a (false)** The Sample Shop selection summary reads Selected: Apple, Bread. — The displayed order is not Apple before Bread.

## s24-diagnostic-bread-first-total2 — diagnostic-bread-first

App: dev.jevbridge.diagnostic. Snapshot sequence: 54.
Raw full capture: raw/s24-diagnostic-bread-first-total2.full.json. Screenshot: raw/s24-diagnostic-bread-first-total2.jpg.
Setup: With Bread then Apple selected, tap Complete order.

- **b (false)** The Order complete confirmation shows Total: $5. — The visible total is $2 rather than the expected arithmetic sum $5.
- **a (true)** The Order complete confirmation shows Total: $2. — The confirmation lists Bread $3 and Apple $2, and the displayed total is $2.
