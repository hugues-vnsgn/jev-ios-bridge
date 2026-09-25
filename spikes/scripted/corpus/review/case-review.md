# Scripted bridge assertion labels: owner review

These 24 screens are new held-out captures from the dedicated `jev-ios-bridge` simulator. The eight workflow groups cover Weather, Contacts, Reminders, and Diagnostic App. Each screen has one proposed true claim and one proposed false claim. Review the image, raw accessibility capture, setup, and both labels before approving this exact bundle. No scripted Jev call has been made.

Corpus digest: `4d7e3853e79c7ffd3315ce9d908ebe9d4685ce28cff59674470ca0f861b43303`  
Frozen manifest digest: `f2371bbcde3c6c9086d1bc924da04f32265e3a2fd979440a2b63cb0f7f53badf`  
Implementation digest: `dbdb58f782d86191a2d35b7a932b0ca9cc38568503d1908c03310795f6c44884`

The two claims use neutral IDs `a` and `b`. Their order and ID assignment are each balanced across the corpus, so neither position nor ID reveals the expected answer. Labels and rationales stay in this local review data; they are excluded from Jev requests. The approval template is still `approved: false`.

Two rejected captures remain under `preflight/`: the first Tessa list view had its lower row behind Search, and a deeper email-form swipe exceeded the request byte cap. Neither is in the 24 scored screens. The scored list view exposes both rows; the scored email view uses a shorter real swipe and passes the fixed budget.

## weather-berlin-search

### s01-weather-ber-query

[Screenshot](../raw/s01-weather-ber-query.jpg) · [Full MobileBuildMCP capture](../raw/s01-weather-ber-query.full.json)

Setup: Launch the Sentry Weather mock fixture. → Tap the San Francisco location button. → Type Ber into the location search field.

- **a · expected true:** The location search field contains Ber. The visible search text field has value Ber.
- **b · expected false:** The location search field contains the complete word Berlin. Berlin appears as a result, but the search field itself contains only Ber.

### s02-weather-berlin-results

[Screenshot](../raw/s02-weather-berlin-results.jpg) · [Full MobileBuildMCP capture](../raw/s02-weather-berlin-results.full.json)

Setup: From the Ber search, replace the location search text with Berlin. → Wait for the Berlin, Germany result to settle.

- **a · expected false:** The main Weather location button already reads Berlin. The underlying main location button still reads San Francisco.
- **b · expected true:** The location search results include Berlin, Germany. The locations sheet has a Berlin, Germany result button.

### s03-weather-berlin-main

[Screenshot](../raw/s03-weather-berlin-main.jpg) · [Full MobileBuildMCP capture](../raw/s03-weather-berlin-main.full.json)

Setup: Tap the Berlin, Germany search result. → Tap Close on the locations sheet.

- **b · expected true:** The main Weather location button reads Berlin. The unsheeted main location button is labeled Berlin.
- **a · expected false:** The main Weather location button reads Oslo. The same main location button is not labeled Oslo.

## weather-lisbon-distance

### s04-weather-lisbon-main

[Screenshot](../raw/s04-weather-lisbon-main.jpg) · [Full MobileBuildMCP capture](../raw/s04-weather-lisbon-main.full.json)

Setup: From Berlin main, open the locations sheet. → Search for Lisbon. → Tap the Lisbon, Portugal result. → Close the locations sheet.

- **b · expected false:** The main Weather location button reads Berlin. The location button has changed from Berlin to Lisbon.
- **a · expected true:** The main Weather location button reads Lisbon. The unsheeted location button and hero title read Lisbon.

### s05-weather-lisbon-distance-mi

[Screenshot](../raw/s05-weather-lisbon-distance-mi.jpg) · [Full MobileBuildMCP capture](../raw/s05-weather-lisbon-distance-mi.full.json)

Setup: From Lisbon main, tap Settings. → Leave Distance at its initial mi selection.

- **a · expected true:** The Distance setting has mi selected. The mi button value is selected in the Distance section.
- **b · expected false:** The Distance setting has km selected. The km button value is not selected.

### s06-weather-lisbon-distance-km

[Screenshot](../raw/s06-weather-lisbon-distance-km.jpg) · [Full MobileBuildMCP capture](../raw/s06-weather-lisbon-distance-km.full.json)

Setup: From Lisbon Settings with mi selected, tap the km Distance choice.

- **a · expected false:** The Distance setting has mi selected. The mi button value is not selected.
- **b · expected true:** The Distance setting has km selected. The km button value is selected in the Distance section.

## contacts-tessa-duplicate

### s07-contacts-tessa-duplicate-list

[Screenshot](../raw/s07-contacts-tessa-duplicate-list.jpg) · [Full MobileBuildMCP capture](../raw/s07-contacts-tessa-duplicate-list.full.json)

Setup: Create synthetic Northstar Lab Tessa Vale with six phone numbers and tessa.seed@example.test. → Create synthetic Harbor Lab Tessa Vale with tessa.harbor@example.test. → Return to the Contacts list and scroll until both Tessa Vale rows are above the Search overlay.

- **b · expected true:** Two separate Tessa Vale rows are visible in the Contacts list. The screenshot and full capture show two distinct Tessa Vale list rows with separate frames.
- **a · expected false:** A Tessa Vale contact card is open. The current screen is the Contacts list, not an opened contact card.

### s08-contacts-tessa-email-offscreen

[Screenshot](../raw/s08-contacts-tessa-email-offscreen.jpg) · [Full MobileBuildMCP capture](../raw/s08-contacts-tessa-email-offscreen.full.json)

Setup: From the visible duplicate rows, open the six-phone Northstar Lab Tessa Vale card. → Tap Edit without scrolling the form.

- **b · expected false:** The tessa.seed@example.test email field is visible in the current viewport. The email field lies below the viewport and has no visible text field in this capture.
- **a · expected true:** The Tessa Vale Edit form shows six phone number fields. Six populated phone fields appear in the foreground Edit form.

### s09-contacts-tessa-old-email-visible

[Screenshot](../raw/s09-contacts-tessa-old-email-visible.jpg) · [Full MobileBuildMCP capture](../raw/s09-contacts-tessa-old-email-visible.full.json)

Setup: Open Edit on the six-phone Northstar Lab Tessa Vale card. → Swipe upward within the Edit form by distance 0.25.

- **a · expected true:** The visible Tessa Vale email field contains tessa.seed@example.test. The foreground Edit form now exposes the email field with the seed value.
- **b · expected false:** The visible Tessa Vale email field contains tessa.final@example.test. The exposed field has the seed value, not the proposed final value.

## contacts-nolan-email

### s10-contacts-nolan-old-email-edit

[Screenshot](../raw/s10-contacts-nolan-old-email-edit.jpg) · [Full MobileBuildMCP capture](../raw/s10-contacts-nolan-old-email-edit.full.json)

Setup: Create synthetic Nolan Ames with nolan.seed@example.test and save the contact. → Open Nolan Ames Edit.

- **a · expected false:** The Nolan Ames Edit form email field contains nolan.final@example.test. The visible email field has not been replaced yet.
- **b · expected true:** The Nolan Ames Edit form email field contains nolan.seed@example.test. The foreground Edit form visibly shows the seed email value.

### s11-contacts-nolan-new-email-unsaved

[Screenshot](../raw/s11-contacts-nolan-new-email-unsaved.jpg) · [Full MobileBuildMCP capture](../raw/s11-contacts-nolan-new-email-unsaved.full.json)

Setup: From Nolan Ames Edit, replace the seed email with nolan.final@example.test. → Leave the Edit form open with Done available.

- **b · expected true:** The Nolan Ames Edit form email field contains nolan.final@example.test. The visible Edit form email field has the final value and Done is still available.
- **a · expected false:** The foreground Nolan Ames screen is the saved contact card with an Edit button. The foreground screen is still the Edit form rather than the saved card.

### s12-contacts-nolan-new-email-saved

[Screenshot](../raw/s12-contacts-nolan-new-email-saved.jpg) · [Full MobileBuildMCP capture](../raw/s12-contacts-nolan-new-email-saved.full.json)

Setup: From Nolan Ames Edit with final email entered, tap Done.

- **b · expected false:** The saved Nolan Ames contact card shows nolan.seed@example.test. The saved card email row shows the final value, not the seed value.
- **a · expected true:** The saved Nolan Ames contact card shows nolan.final@example.test. The card header and email row visibly show Nolan Ames and the final email.

## contacts-search-contrast

### s13-contacts-nina-query

[Screenshot](../raw/s13-contacts-nina-query.jpg) · [Full MobileBuildMCP capture](../raw/s13-contacts-nina-query.full.json)

Setup: Return to the Contacts list. → Type Nina in Search and wait for the result area to settle.

- **a · expected true:** The Contacts search field contains Nina. The search field value is Nina.
- **b · expected false:** The Contacts search field contains Nina Calder. Nina Calder is not the current search field value.

### s14-contacts-nina-calder-no-results

[Screenshot](../raw/s14-contacts-nina-calder-no-results.jpg) · [Full MobileBuildMCP capture](../raw/s14-contacts-nina-calder-no-results.full.json)

Setup: Replace Nina in Contacts Search with Nina Calder. → Wait for explicit No Results text.

- **a · expected false:** A Nina Calder contact card is open. No contact card is open; the screen remains in Search results.
- **b · expected true:** Contacts shows No Results for Nina Calder. The foreground results text says No Results for Nina Calder.

### s15-contacts-tessa-search-two-results

[Screenshot](../raw/s15-contacts-tessa-search-two-results.jpg) · [Full MobileBuildMCP capture](../raw/s15-contacts-tessa-search-two-results.full.json)

Setup: Replace Nina Calder in Contacts Search with Tessa Vale. → Wait for both matching rows.

- **b · expected true:** The Contacts search results show two Tessa Vale rows. Two separate matching Tessa Vale result rows are visible at the top of results.
- **a · expected false:** Contacts shows No Results for Tessa Vale. The search result area contains two matching rows, not a No Results message.

## reminders-signal-kit-list

### s16-reminders-new-list-blank

[Screenshot](../raw/s16-reminders-new-list-blank.jpg) · [Full MobileBuildMCP capture](../raw/s16-reminders-new-list-blank.full.json)

Setup: Open Reminders My Lists. → Tap Add List and leave the New List name blank.

- **b · expected false:** The List Name field contains Signal Kit. Signal Kit has not been typed into the field.
- **a · expected true:** The New List form shows an empty List Name field. The foreground New List form has a blank List Name value.

### s17-reminders-signal-kit-unsaved

[Screenshot](../raw/s17-reminders-signal-kit-unsaved.jpg) · [Full MobileBuildMCP capture](../raw/s17-reminders-signal-kit-unsaved.full.json)

Setup: From the blank New List form, type Signal Kit into List Name. → Leave the New List form open with Done available.

- **a · expected true:** The New List form List Name field contains Signal Kit. The foreground New List form shows Signal Kit in the text field.
- **b · expected false:** A Signal Kit row is already visible under My Lists. The form is still open and the background My Lists has no Signal Kit row.

### s18-reminders-signal-kit-saved

[Screenshot](../raw/s18-reminders-signal-kit-saved.jpg) · [Full MobileBuildMCP capture](../raw/s18-reminders-signal-kit-saved.full.json)

Setup: From the typed Signal Kit New List form, tap Done. → Return to My Lists.

- **a · expected false:** The Signal Kit row shows 2 reminders. A separate Market Errands row has 2 reminders, but Signal Kit has 0.
- **b · expected true:** My Lists shows a Signal Kit row with 0 reminders. The saved Signal Kit list row is explicitly labeled 0 reminders.

## reminders-charge-lantern-note

### s19-reminders-charge-lantern-note-empty

[Screenshot](../raw/s19-reminders-charge-lantern-note-empty.jpg) · [Full MobileBuildMCP capture](../raw/s19-reminders-charge-lantern-note-empty.full.json)

Setup: Open the Signal Kit list. → Tap New Reminder and type Charge lantern in Title. → Leave Notes empty.

- **b · expected true:** The Charge lantern editor has an empty Notes field. The foreground editor shows the title and a blank Notes field.
- **a · expected false:** The Charge lantern Notes field contains Use green cable. Use green cable has not been entered.

### s20-reminders-charge-lantern-note-unsaved

[Screenshot](../raw/s20-reminders-charge-lantern-note-unsaved.jpg) · [Full MobileBuildMCP capture](../raw/s20-reminders-charge-lantern-note-unsaved.full.json)

Setup: From the Charge lantern editor, type Use green cable in Notes. → Leave the editor open with Done available.

- **b · expected false:** The Charge lantern Notes field is empty. The Notes field visibly contains Use green cable.
- **a · expected true:** The open Charge lantern editor shows Notes value Use green cable and a Done button. The full capture and screenshot show the populated Notes field with Done still present.

### s21-reminders-charge-lantern-note-saved

[Screenshot](../raw/s21-reminders-charge-lantern-note-saved.jpg) · [Full MobileBuildMCP capture](../raw/s21-reminders-charge-lantern-note-saved.full.json)

Setup: From the Charge lantern editor with its note entered, tap Done.

- **a · expected true:** The Charge lantern list row includes the note Use green cable. The visible list row label includes Charge lantern, Incomplete, Use green cable.
- **b · expected false:** The Charge lantern list row has no note text. The row visibly includes note text after Done.

## diagnostic-bread-first

### s22-diagnostic-bread-selected

[Screenshot](../raw/s22-diagnostic-bread-selected.jpg) · [Full MobileBuildMCP capture](../raw/s22-diagnostic-bread-selected.full.json)

Setup: Stop and relaunch the Diagnostic App to clear its in-memory selection. → Tap Add Bread ($3).

- **a · expected false:** The Sample Shop selection summary reads Selected: Apple. Apple is not the selected item in this screen.
- **b · expected true:** The Sample Shop selection summary reads Selected: Bread. The visible selection summary has only Bread.

### s23-diagnostic-bread-apple-selected

[Screenshot](../raw/s23-diagnostic-bread-apple-selected.jpg) · [Full MobileBuildMCP capture](../raw/s23-diagnostic-bread-apple-selected.full.json)

Setup: From Bread selected, tap Add Apple ($2).

- **b · expected true:** The Sample Shop selection summary reads Selected: Bread, Apple. The visible summary lists Bread before Apple.
- **a · expected false:** The Sample Shop selection summary reads Selected: Apple, Bread. The displayed order is not Apple before Bread.

### s24-diagnostic-bread-first-total2

[Screenshot](../raw/s24-diagnostic-bread-first-total2.jpg) · [Full MobileBuildMCP capture](../raw/s24-diagnostic-bread-first-total2.full.json)

Setup: With Bread then Apple selected, tap Complete order.

- **b · expected false:** The Order complete confirmation shows Total: $5. The visible total is $2 rather than the expected arithmetic sum $5.
- **a · expected true:** The Order complete confirmation shows Total: $2. The confirmation lists Bread $3 and Apple $2, and the displayed total is $2.
