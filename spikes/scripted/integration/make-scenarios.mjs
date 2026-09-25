import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const out = join(dir, 'scenarios');
mkdirSync(out, { recursive: true });
const faultsOut = join(dir, 'faults');
mkdirSync(faultsOut, { recursive: true });
const udid = '0E42FDE2-5E09-42D3-9876-9EF0037FCBE7';
const app = {
  weather: 'com.sentry.weather.Weather',
  contacts: 'com.apple.MobileAddressBook',
  reminders: 'com.apple.reminders',
  diagnostic: 'dev.jevbridge.diagnostic',
};
const present = (...selectors) => ({ present: selectors });
const action = (id, guard, operation) => ({ id, kind: 'action', guard, action: operation });
const checkpoint = (guard, claim) => ({ id: 'verify', kind: 'checkpoint', guard,
  assertions: [{ id: 'claim', claim }] });
const wait = (id, guard, until) => ({ id, kind: 'wait', guard, until, timeoutMs: 10_000 });
const script = (bundleId, preconditions, values, steps) => ({
  app: { bundleId }, device: { udid }, preconditions, values, steps,
});

const weatherMain = { present: [
  { role: 'button', identifier: 'weather.locationButton' },
  { role: 'button', identifier: 'weather.settingsButton' },
], absent: [{ role: 'text', label: 'Locations' }, { role: 'text', label: 'Settings' }] };
const locationsOpen = present(
  { role: 'text', label: 'Locations' },
  { role: 'button', label: 'Close', identifier: 'weather.locationsSheet' },
);
const weatherDistanceReady = present(
  { role: 'text', label: 'Settings' },
  { role: 'text', label: 'Distance' },
);
const weatherDistanceMi = present(
  { role: 'text', label: 'Settings' },
  { role: 'button', label: 'mi', value: 'selected' },
  { role: 'button', label: 'km', value: 'not selected' },
);
const weatherDistanceKm = present(
  { role: 'text', label: 'Settings' },
  { role: 'button', label: 'mi', value: 'not selected' },
  { role: 'button', label: 'km', value: 'selected' },
);
const contactsList = present(
  { role: 'application', label: 'Contacts' },
  { role: 'text-field', value: 'Search' },
);
const contactsSearchReady = {
  present: [
    { role: 'application', label: 'Contacts' },
    { role: 'image', identifier: 'magnifyingglass', label: 'Search' },
    { role: 'text-field' },
  ],
  absent: [
    { role: 'text', identifier: 'ContactCardHeaderView' },
    { role: 'button', label: 'Done' },
    { role: 'button', label: 'Cancel' },
    { role: 'alert' },
  ],
};
const ninaQuery = present({ role: 'text-field', value: 'Nina Calder' });
const ninaNoResults = present(
  { role: 'text-field', value: 'Nina Calder' },
  { role: 'text', label: 'No Results for “Nina Calder”' },
);
const ninaReady = present(
  { role: 'text-field', value: 'Nina Calder' },
  { role: 'other', label: 'Search results' },
);
const nolanCard = present(
  { role: 'text', identifier: 'ContactCardHeaderView', label: 'Nolan Ames' },
  { role: 'button', label: 'Edit' },
  { role: 'button', label: 'home, nolan.final@example.test' },
);
const nolanQuery = present(
  { role: 'other', label: 'Search results' },
  { role: 'text-field', value: 'Nolan Ames' },
);
const nolanSearchResult = present(
  { role: 'other', label: 'Search results' },
  { role: 'text-field', value: 'Nolan Ames' },
  { role: 'button', label: 'Contact photo for Nolan Ames' },
);
const nolanEdit = present(
  { role: 'text-field', identifier: 'First name', value: 'Nolan' },
  { role: 'text-field', identifier: 'home' },
  { role: 'button', label: 'close' },
);
const remindersLists = present(
  { role: 'text', label: 'My Lists' },
  { role: 'button', label: 'Signal Kit, 1 reminder' },
);
const remindersSearchReady = present(
  { role: 'text', label: 'My Lists' },
  { role: 'text-field' },
);
const signalKit = present(
  { role: 'other', label: 'Signal Kit' },
  { role: 'other', label: 'Charge lantern, Incomplete, Use green cable' },
);
const signalKitReady = present(
  { role: 'other', label: 'Signal Kit' },
  { role: 'button', label: 'New Reminder' },
);
const lanternEdit = present(
  { role: 'text-field', label: 'Title', value: 'Charge lantern' },
  { role: 'text-field', label: 'Notes' },
  { role: 'button', label: 'Done' },
);
const shopNone = present(
  { role: 'text', identifier: 'selection.summary', label: 'Selected: None' },
  { role: 'button', identifier: 'choose.apple', label: 'Add Apple ($2)' },
  { role: 'button', identifier: 'choose.bread', label: 'Add Bread ($3)' },
);
const selected = value => present({ role: 'text', identifier: 'selection.summary', label: `Selected: ${value}` });
const shopReady = present(
  { role: 'other', label: 'Sample Shop' },
  { role: 'text', identifier: 'selection.summary' },
);
const complete = present(
  { role: 'text', identifier: 'confirmation.title', label: 'Order complete' },
  { role: 'text', label: 'Bread: $3' },
  { role: 'text', label: 'Apple: $2' },
);

const cases = [
  ['w01-locations-open', 'weather', 'passed',
    script(app.weather, ['Weather main screen is in front; no sheet is open.'], {}, [
      action('openLocations', weatherMain, { kind: 'tap', selector: { role: 'button', identifier: 'weather.locationButton' } }),
      checkpoint(locationsOpen, 'The Locations sheet is open with its search field visible.'),
    ])],
  ['w02-distance-km', 'weather', 'passed',
    script(app.weather, ['Weather main is in front; Distance will be mi selected when Settings opens.'], {}, [
      action('openSettings', weatherMain, { kind: 'tap', selector: { role: 'button', identifier: 'weather.settingsButton' } }),
      action('selectKm', weatherDistanceMi, { kind: 'tap', selector: { role: 'button', label: 'km', value: 'not selected' } }),
      wait('settleKm', weatherDistanceReady, weatherDistanceKm),
      checkpoint(weatherDistanceReady, 'The Distance setting has km selected.'),
    ])],
  ['w03-distance-mi-claim', 'weather', 'failed',
    script(app.weather, ['Weather main is in front; Distance will be mi selected when Settings opens.'], {}, [
      action('openSettings', weatherMain, { kind: 'tap', selector: { role: 'button', identifier: 'weather.settingsButton' } }),
      action('selectKm', weatherDistanceMi, { kind: 'tap', selector: { role: 'button', label: 'km', value: 'not selected' } }),
      wait('settleKm', weatherDistanceReady, weatherDistanceKm),
      checkpoint(weatherDistanceReady, 'The Distance setting has mi selected.'),
    ])],

  ['c01-nina-no-results', 'contacts', 'passed',
    script(app.contacts, ['Contacts list or Search results is in front with one Search text field.'],
      { query: 'Nina Calder' }, [
        action('searchNina', contactsSearchReady, { kind: 'replaceText', selector: { role: 'text-field' }, valueKey: 'query' }),
        wait('settleResults', ninaQuery, present({ role: 'text', label: 'No Results for “Nina Calder”' })),
        checkpoint(ninaReady, 'Contacts shows No Results for Nina Calder.'),
      ])],
  ['c02-nina-card-claim', 'contacts', 'failed',
    script(app.contacts, ['Contacts list or Search results is in front with one Search text field.'],
      { query: 'Nina Calder' }, [
        action('searchNina', contactsSearchReady, { kind: 'replaceText', selector: { role: 'text-field' }, valueKey: 'query' }),
        wait('settleResults', ninaQuery, present({ role: 'text', label: 'No Results for “Nina Calder”' })),
        checkpoint(ninaReady, 'A Nina Calder contact card is open.'),
      ])],
  ['c03-nolan-edit-final', 'contacts', 'passed',
    script(app.contacts, ['Contacts list or Search results is in front; synthetic Nolan Ames is saved with a final email.'],
      { query: 'Nolan Ames' }, [
      action('searchNolan', contactsSearchReady,
        { kind: 'replaceText', selector: { role: 'text-field' }, valueKey: 'query' }),
      wait('settleNolan', nolanQuery, nolanSearchResult),
      action('openNolan', nolanSearchResult,
        { kind: 'tap', selector: { role: 'button', label: 'Contact photo for Nolan Ames' } }),
      action('openEdit', nolanCard, { kind: 'tap', selector: { role: 'button', label: 'Edit' } }),
      checkpoint(nolanEdit, 'The Nolan Ames Edit form email field contains nolan.final@example.test.'),
    ])],

  ['r01-signal-kit-note', 'reminders', 'passed',
    script(app.reminders, ['My Lists is in front with a Signal Kit row showing one reminder.'], {}, [
      action('openSignalKit', remindersLists, { kind: 'tap', selector: { role: 'button', label: 'Signal Kit, 1 reminder' } }),
      checkpoint(signalKitReady, 'The Signal Kit list visibly contains Charge lantern with the note Use green cable.'),
    ])],
  ['r02-signal-kit-empty-claim', 'reminders', 'failed',
    script(app.reminders, ['My Lists is in front with a Signal Kit row showing one reminder.'], {}, [
      action('openSignalKit', remindersLists, { kind: 'tap', selector: { role: 'button', label: 'Signal Kit, 1 reminder' } }),
      checkpoint(signalKitReady, 'The Signal Kit list has no reminders.'),
    ])],
  ['r03-reminders-search-claim', 'reminders', 'failed',
    script(app.reminders, ['My Lists is in front with a Signal Kit row showing one reminder.'], {}, [
      action('openSearch', remindersLists, { kind: 'tap', selector: { role: 'button', label: 'Search' } }),
      checkpoint(remindersSearchReady, 'The Reminders Search field contains Charge lantern.'),
    ])],

  ['d01-bread-selected', 'diagnostic', 'passed',
    script(app.diagnostic, ['Diagnostic App has been stopped and relaunched; selection summary reads Selected: None.'], {}, [
      action('addBread', shopNone, { kind: 'tap', selector: { role: 'button', identifier: 'choose.bread' } }),
      wait('settleBread', shopReady, selected('Bread')),
      checkpoint(shopReady, 'The selection summary reads Selected: Bread.'),
    ])],
  ['d02-bread-first-total-claim', 'diagnostic', 'failed',
    script(app.diagnostic, ['Diagnostic App has been stopped and relaunched; selection summary reads Selected: None.'], {}, [
      action('addBread', shopNone, { kind: 'tap', selector: { role: 'button', identifier: 'choose.bread' } }),
      action('addApple', selected('Bread'), { kind: 'tap', selector: { role: 'button', identifier: 'choose.apple' } }),
      action('finishOrder', selected('Bread, Apple'), { kind: 'tap', selector: { role: 'button', identifier: 'order.complete' } }),
      checkpoint(complete, 'The Order complete confirmation shows Total: $5.'),
    ])],
  ['d03-apple-first-order-claim', 'diagnostic', 'failed',
    script(app.diagnostic, ['Diagnostic App has been stopped and relaunched; selection summary reads Selected: None.'], {}, [
      action('addApple', shopNone, { kind: 'tap', selector: { role: 'button', identifier: 'choose.apple' } }),
      action('addBread', selected('Apple'), { kind: 'tap', selector: { role: 'button', identifier: 'choose.bread' } }),
      wait('settleBoth', shopReady, selected('Apple, Bread')),
      checkpoint(shopReady, 'The selection summary reads Selected: Bread, Apple.'),
    ])],
];

const oracle = [];
for (const [id, appName, expectedVerdict, scenario] of cases) {
  writeFileSync(join(out, `${id}.json`), JSON.stringify(scenario, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  oracle.push({ id, app: appName, expectedVerdict });
}
writeFileSync(join(dir, 'expected-oracles.json'), JSON.stringify({ version: 1, scripts: oracle }, null, 2) + '\n',
  { flag: 'wx', mode: 0o600 });

const faults = [
  ['f01-missing-target', 'TARGET_MISSING', script(app.diagnostic,
    ['Diagnostic App starts at Selected: None.'], {}, [
      action('tapMissing', shopNone, { kind: 'tap', selector: { role: 'button', identifier: 'choose.nonexistent' } }),
      checkpoint(shopReady, 'The Sample Shop screen is open.'),
    ])],
  ['f02-ambiguous-target', 'TARGET_AMBIGUOUS', script(app.diagnostic,
    ['Diagnostic App starts at Selected: None with distinct Apple and Bread buttons.'], {}, [
      action('tapAmbiguousButton', shopNone, { kind: 'tap', selector: { role: 'button' } }),
      checkpoint(shopReady, 'The Sample Shop screen is open.'),
    ])],
  ['f03-cancel-wait', 'CANCELLED', script(app.diagnostic,
    ['Diagnostic App starts at Selected: None. Send SIGINT after the first wait poll.'], {}, [
      { id: 'waitForAbsentMarker', kind: 'wait', guard: shopNone,
        until: present({ role: 'text', label: 'This marker never appears' }), timeoutMs: 60_000 },
      checkpoint(shopReady, 'The Sample Shop screen is open.'),
    ])],
];
for (const [id, , scenario] of faults) {
  writeFileSync(join(faultsOut, `${id}.json`), JSON.stringify(scenario, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 });
}
writeFileSync(join(dir, 'fault-oracles.json'), JSON.stringify({ version: 1,
  scripts: faults.map(([id, expectedReason]) => ({ id, expectedVerdict: 'inconclusive', expectedReason })) }, null, 2) + '\n',
  { flag: 'wx', mode: 0o600 });
process.stdout.write(JSON.stringify({ scripts: cases.length,
  passes: oracle.filter(item => item.expectedVerdict === 'passed').length,
  assertionFailures: oracle.filter(item => item.expectedVerdict === 'failed').length,
  faultProbes: faults.length }) + '\n');
