import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectActionOptions } from '../../legacy/observation.ts';

const dir = dirname(fileURLToPath(import.meta.url));
const simulatorId = '0E42FDE2-5E09-42D3-9876-9EF0037FCBE7';
const apps = {
  settings: 'com.apple.Preferences', contacts: 'com.apple.MobileAddressBook',
  reminders: 'com.apple.reminders', weather: 'com.sentry.weather.Weather',
  diagnostic: 'dev.jevbridge.diagnostic',
};
const original = JSON.parse(readFileSync(join(dir, '../corpus/corpus.json'), 'utf8'));
const previousHeldoutHashes = new Set(['../corpus', '../corpus-v2'].flatMap(relative => {
  const sourceDir = join(dir, relative);
  const corpus = JSON.parse(readFileSync(join(sourceDir, 'corpus.json'), 'utf8'));
  return corpus.cases.filter(item => item.partition === 'heldout').map(item =>
    JSON.parse(readFileSync(join(sourceDir, item.assets.compactPath), 'utf8')).data.capture.screenHash);
}));

// The four fields after actions are goalReached, assertion truth values, recent step descriptions, and values.
const cases = [
  { id: 't01-settings-onofflabels-root', group: 'tuning-settings-checkpoints', partition: 'tuning', app: 'settings',
    goal: 'The Accessibility page is open with its Vision section and Display & Text Size row visible.',
    assertions: [['accessibility_vision_visible', 'The Accessibility page visibly shows Vision and Display & Text Size.', false]],
    actions: ['tap:e54'], reached: false, history: [], values: {} },
  { id: 't02-settings-onofflabels-accessibility', group: 'tuning-settings-checkpoints', partition: 'tuning', app: 'settings',
    goal: 'The Display & Text Size page is open with the On/Off Labels control visible.',
    assertions: [['onoff_control_visible', 'The Display & Text Size page visibly shows the On/Off Labels control.', false]],
    actions: ['tap:e44', 'tap:e47', 'tap:e166', 'tap:e169'], reached: false,
    history: ['Opened Accessibility from Settings.'], values: {},
    positional: { goal: 'Open the second row in the Vision section so the Display & Text Size page is visible.',
      actions: ['tap:e44', 'tap:e47', 'tap:e166', 'tap:e169'] } },
  { id: 't03-settings-onofflabels-off', group: 'tuning-settings-checkpoints', partition: 'tuning', app: 'settings',
    goal: 'The On/Off Labels control is visibly on.',
    assertions: [['onoff_on', 'The On/Off Labels control visibly has value on.', false]],
    actions: ['tap:e35', 'tap:e37'], reached: false,
    history: ['Opened Accessibility.', 'Opened Display & Text Size.'], values: {} },
  { id: 't04-settings-onofflabels-on', group: 'tuning-settings-checkpoints', partition: 'tuning', app: 'settings',
    goal: 'The On/Off Labels control is visibly on.',
    assertions: [['onoff_on', 'The On/Off Labels control visibly has value on.', true]],
    actions: ['stop-goal'], reached: true,
    history: ['Opened Display & Text Size.', 'Turned on On/Off Labels.'], values: {} },
  { id: 't05-contacts-create-list', group: 'tuning-contact-checkpoints', partition: 'tuning', app: 'contacts',
    goal: 'A New Contact form is open with an empty First name field.',
    assertions: [['new_contact_form_open', 'A New Contact form visibly shows an empty First name field.', false]],
    actions: ['tap:e89'], reached: false, history: [], values: {} },
  { id: 't06-contacts-create-blank', group: 'tuning-contact-checkpoints', partition: 'tuning', app: 'contacts',
    goal: 'The First name field on the New Contact form contains Mira.',
    assertions: [['first_name_mira', 'The First name field visibly contains Mira.', false]],
    actions: ['type:e116:firstName'], reached: false,
    history: ['Tapped Add on the Contacts list.'], values: { firstName: 'Mira' } },
  { id: 't07-contacts-create-filled', group: 'tuning-contact-checkpoints', partition: 'tuning', app: 'contacts',
    goal: 'A saved Mira Vale contact card is visible, outside the edit form.',
    assertions: [['saved_mira_card', 'A saved contact card visibly shows Mira Vale.', false]],
    actions: ['tap:e103'], reached: false,
    history: ['Opened a new contact form.', 'Typed first name Mira and last name Vale.'], values: {} },
  { id: 't08-reminders-create-onboarding', group: 'tuning-reminders-checkpoints', partition: 'tuning', app: 'reminders',
    goal: 'The Welcome sheet is dismissed and the iCloud syncing choice is visibly in front.',
    assertions: [['icloud_choice_visible', 'The iCloud syncing choice is visibly in front.', false]],
    actions: ['tap:e78'], reached: false, history: [], values: {} },
  { id: 't09-reminders-create-icloud-prompt', group: 'tuning-reminders-checkpoints', partition: 'tuning', app: 'reminders',
    goal: 'The local Reminders list is visible with the iCloud prompt gone.',
    assertions: [['local_list_unblocked', 'The local Reminders list is visible without an iCloud prompt.', false]],
    actions: ['tap:e71'], reached: false, history: ['Tapped Continue on Reminders onboarding.'], values: {} },
  { id: 't10-reminders-create-empty-list', group: 'tuning-reminders-checkpoints', partition: 'tuning', app: 'reminders',
    goal: 'The New Reminder composer is open with its Title field visible.',
    assertions: [['composer_title_visible', 'The New Reminder composer visibly shows its Title field.', false]],
    actions: ['tap:e44'], reached: false,
    history: ['Continued onboarding.', 'Chose Not Now for iCloud syncing.'], values: {} },

  { id: 'v3-w01-location-picker', group: 'weather-oslo-wind-checkpoints', partition: 'heldout', app: 'weather',
    goal: 'Weather location search results visibly include Oslo.',
    assertions: [['oslo_result_visible', 'The Weather search result list visibly includes Oslo.', false]],
    actions: ['type:e103:query'], reached: false, history: ['Opened the Weather location picker.'], values: { query: 'Oslo' } },
  { id: 'v3-w02-oslo-search-result', group: 'weather-oslo-wind-checkpoints', partition: 'heldout', app: 'weather',
    goal: 'The main Weather location button visibly reads Oslo.',
    assertions: [['main_location_oslo', 'The main Weather location button visibly reads Oslo.', false]],
    actions: ['tap:e108'], reached: false, history: ['Typed Oslo into Weather location search.'], values: {} },
  { id: 'v3-w03-oslo-main', group: 'weather-oslo-wind-checkpoints', partition: 'heldout', app: 'weather',
    goal: 'The Weather Settings sheet is open with Wind speed controls visible.',
    assertions: [['wind_controls_visible', 'The Weather Settings sheet visibly shows Wind speed controls.', false]],
    actions: ['tap:e89'], reached: false,
    history: ['Selected Oslo from search.', 'Closed the location picker.'], values: {} },
  { id: 'v3-w04-wind-mph-settings', group: 'weather-oslo-wind-checkpoints', partition: 'heldout', app: 'weather',
    goal: 'Wind speed m/s is visibly selected in Weather Settings.',
    assertions: [['wind_ms_selected', 'Weather Settings visibly shows m/s selected for Wind speed.', false]],
    actions: ['tap:e110'], reached: false, history: ['Opened Weather Settings from Oslo.'], values: {} },
  { id: 'v3-w05-wind-ms-selected', group: 'weather-oslo-wind-checkpoints', partition: 'heldout', app: 'weather',
    goal: 'Wind speed m/s is visibly selected in Weather Settings.',
    assertions: [
      ['wind_ms_selected', 'Weather Settings visibly shows m/s selected for Wind speed.', true],
      ['wind_mph_selected', 'Weather Settings visibly shows mph selected for Wind speed.', false],
    ], actions: ['stop-goal'], reached: true,
    history: ['Opened Weather Settings from Oslo.', 'Selected m/s for Wind speed.'], values: {} },

  { id: 'v3-c01-two-iris-rows', group: 'contacts-iris-checkpoints', partition: 'heldout', app: 'contacts',
    goal: 'An Iris Moss contact card visibly shows iris.old@example.test.',
    assertions: [['iris_old_card_visible', 'An open Iris Moss contact card visibly shows iris.old@example.test.', false]],
    actions: ['tap:e79', 'tap:e84'], reached: false, history: [], values: {} },
  { id: 'v3-c02-iris-old-card', group: 'contacts-iris-checkpoints', partition: 'heldout', app: 'contacts',
    goal: 'The Iris Moss Edit form is open.',
    assertions: [['iris_edit_open', 'The Iris Moss Edit form is visibly open.', false]],
    actions: ['tap:e11'], reached: false,
    history: ['Inspected an Iris Moss card and found the unique old email.'], values: {} },
  { id: 'v3-c03-iris-email-offscreen', group: 'contacts-iris-checkpoints', partition: 'heldout', app: 'contacts',
    goal: 'The edit form visibly shows the email field containing iris.old@example.test.',
    assertions: [['old_email_field_visible', 'The email field containing iris.old@example.test is visibly in the edit form viewport.', false]],
    actions: ['swipe:e25:up'], reached: false,
    history: ['Opened the Iris Moss card with the old email.', 'Tapped Edit.'], values: {} },
  { id: 'v3-c04-iris-old-email-visible', group: 'contacts-iris-checkpoints', partition: 'heldout', app: 'contacts',
    goal: 'The edit form email field contains iris.new@example.test.',
    assertions: [['new_email_field_value', 'The edit form email field visibly contains iris.new@example.test.', false]],
    actions: ['type:e108:email'], reached: false,
    history: ['Opened Edit.', 'Swiped up in the contact form to reveal the old email field.'],
    values: { email: 'iris.new@example.test' } },
  { id: 'v3-c05-iris-new-email-unsaved', group: 'contacts-iris-checkpoints', partition: 'heldout', app: 'contacts',
    goal: 'A saved Iris Moss contact card visibly shows iris.new@example.test.',
    assertions: [['new_email_saved_card', 'A saved Iris Moss card visibly shows iris.new@example.test.', false]],
    actions: ['tap:e11'], reached: false,
    history: ['Revealed the old email field.', 'Replaced it with the supplied new email.'], values: {} },
  { id: 'v3-c06-iris-new-saved-card', group: 'contacts-iris-checkpoints', partition: 'heldout', app: 'contacts',
    goal: 'A saved Iris Moss contact card visibly shows iris.new@example.test.',
    assertions: [
      ['new_email_saved_card', 'A saved Iris Moss card visibly shows iris.new@example.test.', true],
      ['old_email_still_visible', 'The saved card visibly shows iris.old@example.test.', false],
    ], actions: ['stop-goal'], reached: true,
    history: ['Replaced the old email.', 'Tapped Done.', 'Scrolled the saved card to its email row.'], values: {} },
  { id: 'v3-c07-ada-search-ready', group: 'contacts-ada-blocker', partition: 'heldout', app: 'contacts',
    goal: 'Contacts search visibly reports finished results for Ada Birch.',
    assertions: [['ada_no_results_visible', 'Contacts search visibly says No Results for Ada Birch.', false]],
    actions: ['type:e116:query'], reached: false,
    history: ['Opened Contacts search.'], values: { query: 'Ada Birch' } },
  { id: 'v3-c08-ada-no-results', group: 'contacts-ada-blocker', partition: 'heldout', app: 'contacts',
    goal: 'An existing Ada Birch contact card is open.',
    assertions: [['ada_card_open', 'An existing Ada Birch contact card is visibly open.', false]],
    actions: ['stop-blocked'], reached: false,
    history: ['Opened Contacts search.', 'Searched for Ada Birch.', 'Waited for results to settle.'], values: {} },

  { id: 'v3-r01-pack-batteries-notes-empty', group: 'reminders-notes-save-checkpoints', partition: 'heldout', app: 'reminders',
    goal: 'The Pack batteries Details Notes field visibly contains Bring charger.',
    assertions: [['notes_bring_charger', 'The foreground Notes field visibly contains Bring charger.', false]],
    actions: ['type:e92:note'], reached: false,
    history: ['Opened Pack batteries Details.'], values: { note: 'Bring charger' } },
  { id: 'v3-r02-pack-batteries-notes-unsaved', group: 'reminders-notes-save-checkpoints', partition: 'heldout', app: 'reminders',
    goal: 'A saved Pack batteries reminder row visibly includes Bring charger.',
    assertions: [['saved_row_has_note', 'A saved Pack batteries reminder row visibly includes Bring charger.', false]],
    actions: ['tap:e75'], reached: false,
    history: ['Typed Bring charger into Pack batteries Notes.'], values: {} },
  { id: 'v3-r03-pack-batteries-saved-note', group: 'reminders-notes-save-checkpoints', partition: 'heldout', app: 'reminders',
    goal: 'A saved Pack batteries reminder row visibly includes Bring charger.',
    assertions: [
      ['saved_row_has_note', 'A saved Pack batteries reminder row visibly includes Bring charger.', true],
      ['saved_row_note_absent', 'The saved Pack batteries reminder row has no note.', false],
    ], actions: ['stop-goal'], reached: true,
    history: ['Typed Bring charger into Notes.', 'Tapped Done.'], values: {} },

  { id: 'v3-d01-shop-empty', group: 'diagnostic-checkpoints', partition: 'heldout', app: 'diagnostic',
    goal: 'Sample Shop visibly says Selected: Apple.',
    assertions: [['apple_selected', 'Sample Shop visibly says Selected: Apple.', false]],
    actions: ['tap:e16'], reached: false, history: [], values: {} },
  { id: 'v3-d02-apple-selected', group: 'diagnostic-checkpoints', partition: 'heldout', app: 'diagnostic',
    goal: 'Sample Shop visibly says Selected: Apple, Bread.',
    assertions: [['both_selected', 'Sample Shop visibly says Selected: Apple, Bread.', false]],
    actions: ['tap:e19'], reached: false, history: ['Tapped Add Apple.'], values: {} },
  { id: 'v3-d03-both-selected', group: 'diagnostic-checkpoints', partition: 'heldout', app: 'diagnostic',
    goal: 'The Order complete confirmation page is visibly open.',
    assertions: [['confirmation_visible', 'The Order complete confirmation page is visibly open.', false]],
    actions: ['tap:e22'], reached: false, history: ['Tapped Add Apple.', 'Tapped Add Bread.'], values: {} },
  { id: 'v3-d04-order-complete-total3', group: 'diagnostic-checkpoints', partition: 'heldout', app: 'diagnostic',
    goal: 'The Order complete confirmation page is visibly open.',
    assertions: [
      ['confirmation_visible', 'The Order complete confirmation page is visibly open.', true],
      ['total_three_visible', 'The confirmation visibly shows Total: $3.', true],
      ['total_five_visible', 'The confirmation visibly shows Total: $5.', false],
    ], actions: ['stop-goal'], reached: true,
    history: ['Tapped Add Apple.', 'Tapped Add Bread.', 'Tapped Complete order.'], values: {} },
];

function sha256(path) { return createHash('sha256').update(readFileSync(path)).digest('hex'); }

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
    elements.set(ref, { ref, role, ...(label ? { label } : {}), ...(value ? { value } : {}),
      ...(identifier ? { identifier } : {}), actions: mappedAction ? [mappedAction] : [] });
  }
  return [...elements.values()];
}

function expandActionIds(item, rawIds) {
  const full = projectActionOptions(item.fullSnapshot, item.scenario, 255, { variant: 'full', optionRule: 'v2' });
  const compact = projectActionOptions(item.compactSnapshot, item.scenario, 255, { variant: 'compact', optionRule: 'v2' });
  const fullIds = new Set(full.options.map(option => option.id));
  const compactIds = new Set(compact.options.map(option => option.id));
  const expanded = new Set();
  for (const id of rawIds) {
    if (!id.startsWith('tap:')) {
      if (!fullIds.has(id) && !compactIds.has(id)) throw new Error(`Unlisted action ${id} in ${item.id}`);
      expanded.add(id);
      continue;
    }
    const ref = decodeURIComponent(id.slice(4));
    const canonicalRef = Object.entries(full.collapsedTapRefs).find(([canonical, aliases]) =>
      canonical === ref || aliases.includes(ref))?.[0] ?? ref;
    const canonicalId = `tap:${encodeURIComponent(canonicalRef)}`;
    if (!fullIds.has(canonicalId)) throw new Error(`Missing full canonical ${canonicalId} in ${item.id}`);
    expanded.add(canonicalId);
    for (const alias of [canonicalRef, ...(full.collapsedTapRefs[canonicalRef] ?? [])]) {
      const aliasId = `tap:${encodeURIComponent(alias)}`;
      if (compactIds.has(aliasId)) expanded.add(aliasId);
    }
  }
  return [...expanded];
}

function makeCase(spec) {
  const compactPath = `raw/${spec.id}.compact.json`;
  const fullPath = `raw/${spec.id}.full.json`;
  const screenshotPath = `raw/${spec.id}.jpg`;
  const compact = JSON.parse(readFileSync(join(dir, compactPath), 'utf8')).data.capture;
  const full = JSON.parse(readFileSync(join(dir, fullPath), 'utf8')).data.capture;
  const meta = JSON.parse(readFileSync(join(dir, `raw/${spec.id}.meta.json`), 'utf8'));
  if (compact.screenHash !== full.screenHash || compact.udid !== simulatorId || full.simulatorId !== simulatorId ||
      compact.count !== full.elements.length) throw new Error(`Capture mismatch: ${spec.id}`);
  const elements = compactElements(compact);
  const captureTime = Date.parse(meta.capturedAt);
  const item = {
    id: spec.id, scenarioGroup: spec.group, partition: spec.partition,
    scenario: { goal: spec.goal, app: { bundleId: apps[spec.app] },
      assertions: spec.assertions.map(([id, claim]) => ({ id, claim })),
      values: spec.values, device: { udid: simulatorId } },
    compactSnapshot: { deviceId: simulatorId, capturedAt: captureTime, expiresAt: captureTime + 60_000,
      sequence: compact.seq, elements, truncated: compact.count > elements.length, screenshotPath },
    fullSnapshot: { deviceId: simulatorId, capturedAt: full.capturedAtMs, expiresAt: full.expiresAtMs,
      sequence: full.seq, elements: full.elements, truncated: false, screenshotPath },
    history: spec.history.map((description, index) => ({ step: index + 1, description })),
    assets: { compactPath, fullPath, screenshotPath, sha256: {
      compact: sha256(join(dir, compactPath)), full: sha256(join(dir, fullPath)),
      screenshot: sha256(join(dir, screenshotPath)),
    } },
    labels: { acceptableActionIds: [], goalReached: spec.reached,
      assertions: Object.fromEntries(spec.assertions.map(([id, , expected]) => [id, expected])) },
  };
  item.labels.acceptableActionIds = expandActionIds(item, spec.actions);
  if (spec.positional) item.positionalVariant = { goal: spec.positional.goal,
    acceptableActionIds: expandActionIds(item, spec.positional.actions) };
  return item;
}

const tuning = cases.filter(spec => spec.partition === 'tuning');
const heldout = cases.filter(spec => spec.partition === 'heldout');
if (tuning.length !== 10 || heldout.length !== 20) throw new Error('Unexpected v3 split');
for (const spec of tuning) {
  const old = original.cases.find(item => item.id === spec.id);
  if (!old || old.partition !== 'tuning') throw new Error(`Retained tuning case missing: ${spec.id}`);
  for (const [key, path] of Object.entries({ compact: old.assets.compactPath,
    full: old.assets.fullPath, screenshot: old.assets.screenshotPath })) {
    if (sha256(join(dir, path)) !== old.assets.sha256[key]) throw new Error(`Retained tuning asset changed: ${path}`);
  }
}
const generated = cases.map(makeCase);
const freshHashes = new Set();
for (const item of generated.filter(item => item.partition === 'heldout')) {
  const hash = JSON.parse(readFileSync(join(dir, item.assets.compactPath), 'utf8')).data.capture.screenHash;
  if (freshHashes.has(hash) || previousHeldoutHashes.has(hash)) throw new Error(`Held-out screen is not fresh: ${item.id}`);
  freshHashes.add(hash);
}
writeFileSync(join(dir, 'corpus.json'), JSON.stringify({ version: 3, cases: generated }, null, 2) + '\n');
process.stdout.write('Wrote v3 corpus: 10 retained tuning cases and 20 fresh held-out cases.\n');
