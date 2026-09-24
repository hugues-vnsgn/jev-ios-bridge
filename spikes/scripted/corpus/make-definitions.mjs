import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const apps = {
  weather: 'com.sentry.weather.Weather',
  contacts: 'com.apple.MobileAddressBook',
  reminders: 'com.apple.reminders',
  diagnostic: 'dev.jevbridge.diagnostic',
};

// The two claims are factual drafts for owner review. The assembly step binds them to raw assets.
const specs = [
  ['s01-weather-ber-query', 'weather-berlin-search', 'weather',
    ['Launch the Sentry Weather mock fixture.', 'Tap the San Francisco location button.', 'Type Ber into the location search field.'],
    'The location search field contains Ber.', 'The location search field contains the complete word Berlin.',
    'The visible search text field has value Ber.', 'Berlin appears as a result, but the search field itself contains only Ber.'],
  ['s02-weather-berlin-results', 'weather-berlin-search', 'weather',
    ['From the Ber search, replace the location search text with Berlin.', 'Wait for the Berlin, Germany result to settle.'],
    'The location search results include Berlin, Germany.', 'The main Weather location button already reads Berlin.',
    'The locations sheet has a Berlin, Germany result button.', 'The underlying main location button still reads San Francisco.'],
  ['s03-weather-berlin-main', 'weather-berlin-search', 'weather',
    ['Tap the Berlin, Germany search result.', 'Tap Close on the locations sheet.'],
    'The main Weather location button reads Berlin.', 'The main Weather location button reads Oslo.',
    'The unsheeted main location button is labeled Berlin.', 'The same main location button is not labeled Oslo.'],

  ['s04-weather-lisbon-main', 'weather-lisbon-distance', 'weather',
    ['From Berlin main, open the locations sheet.', 'Search for Lisbon.', 'Tap the Lisbon, Portugal result.', 'Close the locations sheet.'],
    'The main Weather location button reads Lisbon.', 'The main Weather location button reads Berlin.',
    'The unsheeted location button and hero title read Lisbon.', 'The location button has changed from Berlin to Lisbon.'],
  ['s05-weather-lisbon-distance-mi', 'weather-lisbon-distance', 'weather',
    ['From Lisbon main, tap Settings.', 'Leave Distance at its initial mi selection.'],
    'The Distance setting has mi selected.', 'The Distance setting has km selected.',
    'The mi button value is selected in the Distance section.', 'The km button value is not selected.'],
  ['s06-weather-lisbon-distance-km', 'weather-lisbon-distance', 'weather',
    ['From Lisbon Settings with mi selected, tap the km Distance choice.'],
    'The Distance setting has km selected.', 'The Distance setting has mi selected.',
    'The km button value is selected in the Distance section.', 'The mi button value is not selected.'],

  ['s07-contacts-tessa-duplicate-list', 'contacts-tessa-duplicate', 'contacts',
    ['Create synthetic Northstar Lab Tessa Vale with six phone numbers and tessa.seed@example.test.',
      'Create synthetic Harbor Lab Tessa Vale with tessa.harbor@example.test.',
      'Return to the Contacts list and scroll until both Tessa Vale rows are above the Search overlay.'],
    'Two separate Tessa Vale rows are visible in the Contacts list.', 'A Tessa Vale contact card is open.',
    'The screenshot and full capture show two distinct Tessa Vale list rows with separate frames.',
    'The current screen is the Contacts list, not an opened contact card.'],
  ['s08-contacts-tessa-email-offscreen', 'contacts-tessa-duplicate', 'contacts',
    ['From the visible duplicate rows, open the six-phone Northstar Lab Tessa Vale card.', 'Tap Edit without scrolling the form.'],
    'The Tessa Vale Edit form shows six phone number fields.', 'The tessa.seed@example.test email field is visible in the current viewport.',
    'Six populated phone fields appear in the foreground Edit form.',
    'The email field lies below the viewport and has no visible text field in this capture.'],
  ['s09-contacts-tessa-old-email-visible', 'contacts-tessa-duplicate', 'contacts',
    ['Open Edit on the six-phone Northstar Lab Tessa Vale card.', 'Swipe upward within the Edit form by distance 0.25.'],
    'The visible Tessa Vale email field contains tessa.seed@example.test.',
    'The visible Tessa Vale email field contains tessa.final@example.test.',
    'The foreground Edit form now exposes the email field with the seed value.',
    'The exposed field has the seed value, not the proposed final value.'],

  ['s10-contacts-nolan-old-email-edit', 'contacts-nolan-email', 'contacts',
    ['Create synthetic Nolan Ames with nolan.seed@example.test and save the contact.', 'Open Nolan Ames Edit.'],
    'The Nolan Ames Edit form email field contains nolan.seed@example.test.',
    'The Nolan Ames Edit form email field contains nolan.final@example.test.',
    'The foreground Edit form visibly shows the seed email value.', 'The visible email field has not been replaced yet.'],
  ['s11-contacts-nolan-new-email-unsaved', 'contacts-nolan-email', 'contacts',
    ['From Nolan Ames Edit, replace the seed email with nolan.final@example.test.', 'Leave the Edit form open with Done available.'],
    'The Nolan Ames Edit form email field contains nolan.final@example.test.',
    'The foreground Nolan Ames screen is the saved contact card with an Edit button.',
    'The visible Edit form email field has the final value and Done is still available.',
    'The foreground screen is still the Edit form rather than the saved card.'],
  ['s12-contacts-nolan-new-email-saved', 'contacts-nolan-email', 'contacts',
    ['From Nolan Ames Edit with final email entered, tap Done.'],
    'The saved Nolan Ames contact card shows nolan.final@example.test.',
    'The saved Nolan Ames contact card shows nolan.seed@example.test.',
    'The card header and email row visibly show Nolan Ames and the final email.',
    'The saved card email row shows the final value, not the seed value.'],

  ['s13-contacts-nina-query', 'contacts-search-contrast', 'contacts',
    ['Return to the Contacts list.', 'Type Nina in Search and wait for the result area to settle.'],
    'The Contacts search field contains Nina.', 'The Contacts search field contains Nina Calder.',
    'The search field value is Nina.', 'Nina Calder is not the current search field value.'],
  ['s14-contacts-nina-calder-no-results', 'contacts-search-contrast', 'contacts',
    ['Replace Nina in Contacts Search with Nina Calder.', 'Wait for explicit No Results text.'],
    'Contacts shows No Results for Nina Calder.', 'A Nina Calder contact card is open.',
    'The foreground results text says No Results for Nina Calder.',
    'No contact card is open; the screen remains in Search results.'],
  ['s15-contacts-tessa-search-two-results', 'contacts-search-contrast', 'contacts',
    ['Replace Nina Calder in Contacts Search with Tessa Vale.', 'Wait for both matching rows.'],
    'The Contacts search results show two Tessa Vale rows.', 'Contacts shows No Results for Tessa Vale.',
    'Two separate matching Tessa Vale result rows are visible at the top of results.',
    'The search result area contains two matching rows, not a No Results message.'],

  ['s16-reminders-new-list-blank', 'reminders-signal-kit-list', 'reminders',
    ['Open Reminders My Lists.', 'Tap Add List and leave the New List name blank.'],
    'The New List form shows an empty List Name field.', 'The List Name field contains Signal Kit.',
    'The foreground New List form has a blank List Name value.', 'Signal Kit has not been typed into the field.'],
  ['s17-reminders-signal-kit-unsaved', 'reminders-signal-kit-list', 'reminders',
    ['From the blank New List form, type Signal Kit into List Name.', 'Leave the New List form open with Done available.'],
    'The New List form List Name field contains Signal Kit.', 'A Signal Kit row is already visible under My Lists.',
    'The foreground New List form shows Signal Kit in the text field.',
    'The form is still open and the background My Lists has no Signal Kit row.'],
  ['s18-reminders-signal-kit-saved', 'reminders-signal-kit-list', 'reminders',
    ['From the typed Signal Kit New List form, tap Done.', 'Return to My Lists.'],
    'My Lists shows a Signal Kit row with 0 reminders.', 'The Signal Kit row shows 2 reminders.',
    'The saved Signal Kit list row is explicitly labeled 0 reminders.',
    'A separate Market Errands row has 2 reminders, but Signal Kit has 0.'],

  ['s19-reminders-charge-lantern-note-empty', 'reminders-charge-lantern-note', 'reminders',
    ['Open the Signal Kit list.', 'Tap New Reminder and type Charge lantern in Title.', 'Leave Notes empty.'],
    'The Charge lantern editor has an empty Notes field.', 'The Charge lantern Notes field contains Use green cable.',
    'The foreground editor shows the title and a blank Notes field.', 'Use green cable has not been entered.'],
  ['s20-reminders-charge-lantern-note-unsaved', 'reminders-charge-lantern-note', 'reminders',
    ['From the Charge lantern editor, type Use green cable in Notes.', 'Leave the editor open with Done available.'],
    'The open Charge lantern editor shows Notes value Use green cable and a Done button.',
    'The Charge lantern Notes field is empty.',
    'The full capture and screenshot show the populated Notes field with Done still present.',
    'The Notes field visibly contains Use green cable.'],
  ['s21-reminders-charge-lantern-note-saved', 'reminders-charge-lantern-note', 'reminders',
    ['From the Charge lantern editor with its note entered, tap Done.'],
    'The Charge lantern list row includes the note Use green cable.',
    'The Charge lantern list row has no note text.',
    'The visible list row label includes Charge lantern, Incomplete, Use green cable.',
    'The row visibly includes note text after Done.'],

  ['s22-diagnostic-bread-selected', 'diagnostic-bread-first', 'diagnostic',
    ['Stop and relaunch the Diagnostic App to clear its in-memory selection.', 'Tap Add Bread ($3).'],
    'The Sample Shop selection summary reads Selected: Bread.',
    'The Sample Shop selection summary reads Selected: Apple.',
    'The visible selection summary has only Bread.', 'Apple is not the selected item in this screen.'],
  ['s23-diagnostic-bread-apple-selected', 'diagnostic-bread-first', 'diagnostic',
    ['From Bread selected, tap Add Apple ($2).'],
    'The Sample Shop selection summary reads Selected: Bread, Apple.',
    'The Sample Shop selection summary reads Selected: Apple, Bread.',
    'The visible summary lists Bread before Apple.', 'The displayed order is not Apple before Bread.'],
  ['s24-diagnostic-bread-first-total2', 'diagnostic-bread-first', 'diagnostic',
    ['With Bread then Apple selected, tap Complete order.'],
    'The Order complete confirmation shows Total: $2.',
    'The Order complete confirmation shows Total: $5.',
    'The confirmation lists Bread $3 and Apple $2, and the displayed total is $2.',
    'The visible total is $2 rather than the expected arithmetic sum $5.'],
];

if (specs.length !== 24) throw new Error(`expected 24 definitions, found ${specs.length}`);
const cases = specs.map(([id, workflowGroup, app, setupSteps, yes, no, yesWhy, noWhy], index) => {
  const positive = { claim: yes, expected: true, rationale: yesWhy };
  const negative = { claim: no, expected: false, rationale: noWhy };
  const pattern = index % 4;
  const claims = pattern === 0 ? [{ id: 'a', ...positive }, { id: 'b', ...negative }]
    : pattern === 1 ? [{ id: 'a', ...negative }, { id: 'b', ...positive }]
    : pattern === 2 ? [{ id: 'b', ...positive }, { id: 'a', ...negative }]
    : [{ id: 'b', ...negative }, { id: 'a', ...positive }];
  return { id, workflowGroup, app: { bundleId: apps[app] }, setupSteps, claims };
});
writeFileSync(join(dir, 'definitions.json'), JSON.stringify({ cases }, null, 2) + '\n');
process.stdout.write(JSON.stringify({ cases: cases.length,
  trueFirst: cases.filter(item => item.claims[0].expected).length,
  aTrue: cases.filter(item => item.claims.find(claim => claim.id === 'a')?.expected).length }) + '\n');
