import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const deviceId = '0E42FDE2-5E09-42D3-9876-9EF0037FCBE7';
const apps = {
  settings: 'com.apple.Preferences',
  contacts: 'com.apple.MobileAddressBook',
  reminders: 'com.apple.reminders',
};

const groups = [
  {
    id: 'settings-onofflabels', partition: 'tuning', app: 'settings',
    goal: 'Turn on On/Off Labels in Accessibility.', values: {},
    assertions: [{ id: 'labels_enabled', claim: 'On/Off Labels is visibly enabled.' }],
    cases: [
      ['t01-settings-onofflabels-root', ['tap:e54'], false, [false], []],
      ['t02-settings-onofflabels-accessibility', ['tap:e44', 'tap:e47', 'tap:e166', 'tap:e169'], false, [false], ['Opened Accessibility from Settings.']],
      ['t03-settings-onofflabels-off', ['tap:e35', 'tap:e37'], false, [false], ['Opened Accessibility.', 'Opened Display & Text Size.']],
      ['t04-settings-onofflabels-on', ['stop-goal'], true, [true], ['Opened Display & Text Size.', 'Turned on On/Off Labels.']],
    ],
  },
  {
    id: 'contacts-create', partition: 'tuning', app: 'contacts',
    goal: 'Create a saved contact named Mira Vale.', values: { firstName: 'Mira', lastName: 'Vale' },
    assertions: [{ id: 'contact_saved', claim: 'A saved contact named Mira Vale is visible.' }],
    cases: [
      ['t05-contacts-create-list', ['tap:e89'], false, [false], []],
      ['t06-contacts-create-blank', ['type:e116:firstName', 'type:e119:lastName'], false, [false], ['Tapped Add on the Contacts list.']],
      ['t07-contacts-create-filled', ['tap:e103'], false, [false], ['Opened a new contact form.', 'Typed first name Mira and last name Vale.']],
    ],
  },
  {
    id: 'reminders-create', partition: 'tuning', app: 'reminders',
    goal: 'Create a reminder titled Call Mira in the local Reminders list.', values: { title: 'Call Mira' },
    assertions: [{ id: 'reminder_saved', claim: 'A saved reminder titled Call Mira is visible.' }],
    cases: [
      ['t08-reminders-create-onboarding', ['tap:e78'], false, [false], []],
      ['t09-reminders-create-icloud-prompt', ['tap:e71'], false, [false], ['Tapped Continue on Reminders onboarding.']],
      ['t10-reminders-create-empty-list', ['tap:e44'], false, [false], ['Continued onboarding.', 'Chose Not Now for iCloud syncing.']],
    ],
  },
  {
    id: 'settings-ios-build', partition: 'heldout', app: 'settings',
    goal: 'Open the detailed iOS version screen and find its build identifier.', values: {},
    assertions: [{ id: 'build_shown', claim: 'The iOS build identifier 23E254a is visible.' }],
    cases: [
      ['h01-settings-about-general', ['tap:e32', 'tap:e35', 'tap:e190', 'tap:e193'], false, [false], ['Opened General from Settings.']],
      ['h02-settings-about-version-row', ['tap:e32', 'tap:e35', 'tap:e210', 'tap:e213'], false, [false], ['Opened General.', 'Opened About.']],
      ['h03-settings-about-build-detail', ['stop-goal'], true, [true], ['Opened General.', 'Opened About.', 'Opened iOS Version.']],
    ],
  },
  {
    id: 'settings-region-check', partition: 'heldout', app: 'settings',
    goal: 'Verify the device region shown in Language & Region is United States.', values: {},
    assertions: [
      { id: 'region_us', claim: 'The device region shown is United States.' },
      { id: 'region_france', claim: 'The device region shown is France.' },
    ],
    cases: [
      ['h04-settings-region-check', ['stop-goal'], true, [true, false], ['Opened General.', 'Opened Language & Region.']],
    ],
  },
  {
    id: 'settings-dictation-languages', partition: 'heldout', app: 'settings',
    goal: 'Open the Dictation Languages list under Keyboard settings.', values: {},
    assertions: [{ id: 'languages_shown', claim: 'The Dictation Languages list shows English (US) and Vietnamese.' }],
    cases: [
      ['h05-settings-keyboard-top', ['swipe:e22:up'], false, [false], ['Opened General.', 'Opened Keyboard.']],
      ['h06-settings-dictation-languages-row', ['tap:e54', 'tap:e73'], false, [false], ['Opened Keyboard.', 'Scrolled down to the Dictation section.']],
      ['h07-settings-dictation-languages-open', ['stop-goal'], true, [true], ['Opened Keyboard.', 'Scrolled to Dictation Languages.', 'Opened Dictation Languages.']],
    ],
  },
  {
    id: 'contacts-find', partition: 'heldout', app: 'contacts',
    goal: 'Open the saved contact Mira Stone.', values: { query: 'Mira' },
    assertions: [{ id: 'contact_open', claim: 'The Mira Stone contact card is open.' }],
    cases: [
      ['h08-contacts-find-list', ['tap:e55', 'type:e89:query'], false, [false], []],
      ['h09-contacts-find-results', ['tap:e88'], false, [false], ['Typed Mira in Contacts search.']],
      ['h10-contacts-find-opened', ['stop-goal'], true, [true], ['Searched Contacts for Mira.', 'Opened the Mira Stone result.']],
    ],
  },
  {
    id: 'contacts-edit', partition: 'heldout', app: 'contacts',
    goal: "Change Mira Vale's last name to Stone and verify the saved contact.", values: { lastName: 'Stone' },
    assertions: [{ id: 'surname_stone', claim: 'The saved contact card shows Mira Stone.' }],
    cases: [
      ['h11-contacts-edit-detail', ['tap:e11'], false, [false], ['Opened the saved Mira Vale contact.']],
      ['h12-contacts-edit-form', ['type:e30:lastName'], false, [false], ['Opened Mira Vale.', 'Tapped Edit.']],
      ['h13-contacts-edit-saved', ['stop-goal'], true, [true], ['Tapped Edit.', 'Replaced Vale with Stone.', 'Tapped Done.']],
    ],
  },
  {
    id: 'reminders-complete', partition: 'heldout', app: 'reminders',
    goal: 'Complete Call Mira and verify that it appears as Completed.', values: {},
    assertions: [{ id: 'reminder_completed', claim: 'Call Mira is visibly marked Completed.' }],
    cases: [
      ['h14-reminders-complete-list', ['tap:e26'], false, [false], ['Created the reminder Call Mira.']],
      ['h15-reminders-complete-call-mira', ['tap:e11'], false, [false], ['Tapped the completion circle for Call Mira; the item left the active list.']],
      ['h16-reminders-complete-menu', ['tap:e67'], false, [false], ['Completed Call Mira.', "Opened the list's More menu."]],
      ['h17-reminders-complete-confirmed', ['stop-goal'], true, [true], ['Completed Call Mira.', 'Opened More.', 'Selected Show Completed.']],
    ],
  },
  {
    id: 'reminders-missing', partition: 'heldout', app: 'reminders',
    goal: 'Open the pre-existing reminder titled Follow up with Nia without creating a new reminder.', values: { query: 'Follow up with Nia' },
    assertions: [{ id: 'target_open', claim: 'The Follow up with Nia reminder is visibly open.' }],
    cases: [
      ['h18-reminders-missing-lists', ['tap:e10'], false, [false], []],
      ['h19-reminders-missing-search', ['type:e66:query'], false, [false], ['Opened Reminders search.']],
      ['h20-reminders-missing-no-results', ['stop-blocked'], false, [false], ['Opened Reminders search.', 'Searched for Follow up with Nia.', 'Waited for search results to settle.']],
    ],
  },
];

function digest(path) { return createHash('sha256').update(readFileSync(path)).digest('hex'); }

function compactElements(capture) {
  const elements = new Map();
  for (const row of [...(capture.targets ?? []), ...(capture.scroll ?? []), ...(capture.text ?? [])]) {
    const parts = row.split('|');
    if (parts.length !== 6) throw new Error(`Invalid compact row: ${row}`);
    const [ref, action, role, label, value, identifier] = parts;
    const mappedAction = action === 'swipe' ? 'swipeWithin' : action === 'text' ? null : action;
    const existing = elements.get(ref);
    if (existing) {
      if (mappedAction && !existing.actions.includes(mappedAction)) existing.actions.push(mappedAction);
      continue;
    }
    elements.set(ref, {
      ref, role, ...(label ? { label } : {}), ...(value ? { value } : {}),
      ...(identifier ? { identifier } : {}), actions: mappedAction ? [mappedAction] : [],
    });
  }
  return [...elements.values()];
}

function makeCase(group, [id, acceptableActionIds, goalReached, expected, steps]) {
  const compactPath = `raw/${id}.compact.json`;
  const fullPath = `raw/${id}.full.json`;
  const screenshotPath = `raw/${id}.jpg`;
  const compact = JSON.parse(readFileSync(join(dir, compactPath), 'utf8')).data.capture;
  const full = JSON.parse(readFileSync(join(dir, fullPath), 'utf8')).data.capture;
  if (compact.screenHash !== full.screenHash || compact.udid !== deviceId || full.simulatorId !== deviceId ||
      compact.count !== full.elements.length) throw new Error(`Capture pair mismatch: ${id}`);
  const elements = compactElements(compact);
  const meta = JSON.parse(readFileSync(join(dir, `raw/${id}.meta.json`), 'utf8'));
  const captureTime = Date.parse(meta.capturedAt);
  const screenshot = screenshotPath;
  const item = {
    id, scenarioGroup: group.id, partition: group.partition,
    scenario: {
      goal: group.goal, app: { bundleId: apps[group.app] }, assertions: group.assertions,
      values: group.values, device: { udid: deviceId },
    },
    compactSnapshot: {
      deviceId, capturedAt: captureTime, expiresAt: captureTime + 60_000,
      sequence: compact.seq, elements, truncated: compact.count > elements.length,
      screenshotPath: screenshot,
    },
    fullSnapshot: {
      deviceId, capturedAt: full.capturedAtMs, expiresAt: full.expiresAtMs,
      sequence: full.seq, elements: full.elements, truncated: false,
      screenshotPath: screenshot,
    },
    history: steps.map((description, index) => ({ step: index + 1, description })),
    assets: {
      compactPath, fullPath, screenshotPath,
      sha256: {
        compact: digest(join(dir, compactPath)),
        full: digest(join(dir, fullPath)),
        screenshot: digest(join(dir, screenshotPath)),
      },
    },
    labels: {
      acceptableActionIds, goalReached,
      assertions: Object.fromEntries(group.assertions.map((assertion, index) => [assertion.id, expected[index]])),
    },
  };
  if (id === 't02-settings-onofflabels-accessibility') {
    item.positionalVariant = {
      goal: 'Open the second row in the Vision section of Accessibility.',
      acceptableActionIds: ['tap:e44', 'tap:e47', 'tap:e166', 'tap:e169'],
    };
  }
  return item;
}

const cases = groups.flatMap(group => group.cases.map(row => makeCase(group, row)));
if (cases.length !== 30 || cases.filter(item => item.partition === 'tuning').length !== 10) {
  throw new Error('Unexpected corpus split');
}
writeFileSync(join(dir, 'corpus.json'), JSON.stringify({ version: 1, cases }, null, 2) + '\n');
process.stdout.write(`Wrote ${cases.length} cases to spikes/feasibility/corpus/corpus.json\n`);
