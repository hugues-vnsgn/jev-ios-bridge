import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectActionOptions } from '../../legacy/observation.ts';

const dir = dirname(fileURLToPath(import.meta.url));
const deviceId = '0E42FDE2-5E09-42D3-9876-9EF0037FCBE7';
const original = JSON.parse(readFileSync(join(dir, '../corpus/corpus.json'), 'utf8'));

const groups = [
  {
    id: 'weather-temperature', app: 'com.sentry.weather.Weather',
    goal: 'Set Weather temperature units to Fahrenheit and verify Fahrenheit is selected in Settings.',
    values: {}, assertions: [
      { id: 'fahrenheit_selected', claim: 'The current screen visibly shows Fahrenheit selected.' },
      { id: 'celsius_selected', claim: 'The current screen visibly shows Celsius selected.' },
    ],
    cases: [
      ['v2-w01-celsius-main', ['tap:e89'], false, [false, false], []],
      ['v2-w02-celsius-settings', ['tap:e105'], false, [false, true], ['Opened Weather Settings.']],
      ['v2-w03-fahrenheit-selected', ['stop-goal'], true, [true, false], ['Opened Weather Settings.', 'Selected Fahrenheit.']],
    ],
  },
  {
    id: 'weather-wind-pressure', app: 'com.sentry.weather.Weather',
    goal: 'Set Weather wind speed to km/h and pressure to inHg, then verify both selections in Settings.',
    values: {}, assertions: [
      { id: 'wind_kmh_selected', claim: 'The current screen visibly shows wind speed km/h selected.' },
      { id: 'pressure_inhg_selected', claim: 'The current screen visibly shows pressure inHg selected.' },
      { id: 'pressure_mb_selected', claim: 'The current screen visibly shows pressure mb selected.' },
    ],
    cases: [
      ['v2-w04-fahrenheit-main', ['tap:e89'], false, [false, false, false], []],
      ['v2-w05-wind-pressure-defaults', ['tap:e109', 'tap:e113'], false, [false, false, true], ['Opened Weather Settings.']],
      ['v2-w06-wind-only-changed', ['tap:e113'], false, [true, false, true], ['Opened Weather Settings.', 'Selected wind speed km/h.']],
      ['v2-w07-wind-pressure-selected', ['stop-goal'], true, [true, true, false], ['Opened Weather Settings.', 'Selected wind speed km/h.', 'Selected pressure inHg.']],
    ],
  },
  {
    id: 'contacts-update-email', app: 'com.apple.MobileAddressBook',
    goal: 'Find the Noah Reed contact with noah.old@example.test, replace that address with noah.new@example.test, and verify the saved card.',
    values: { email: 'noah.new@example.test' }, assertions: [
      { id: 'new_email_saved', claim: 'The saved Noah Reed contact card visibly shows noah.new@example.test.' },
      { id: 'old_email_visible', claim: 'The current screen visibly shows noah.old@example.test.' },
    ],
    cases: [
      ['v2-c01-two-noah-rows', ['tap:e69', 'tap:e74'], false, [false, false], []],
      ['v2-c02-northstar-card-old-email', ['tap:e11'], false, [false, true], ['Inspected a Noah Reed card and found the old email.']],
      ['v2-c03-email-offscreen', ['swipe:e25:up'], false, [false, false], ['Opened the Noah Reed card with the old email.', 'Tapped Edit.']],
      ['v2-c04-old-email-visible', ['type:e96:email'], false, [false, true], ['Opened Edit.', 'Swiped up in the contact form to reveal the email field.']],
      ['v2-c05-new-email-unsaved', ['tap:e11'], false, [false, false], ['Revealed the old email field.', 'Replaced all text with the supplied new email.']],
      ['v2-c06-northstar-card-new-email', ['stop-goal'], true, [true, false], ['Replaced the old email.', 'Tapped Done.', 'Scrolled the saved card to the email row.']],
    ],
  },
  {
    id: 'contacts-missing', app: 'com.apple.MobileAddressBook',
    goal: 'Open an existing Lena Quill contact without creating a new contact.',
    values: { query: 'Lena Quill' }, assertions: [
      { id: 'lena_open', claim: 'The current screen visibly shows an open Lena Quill contact card.' },
    ],
    cases: [
      ['v2-c07-lena-search-ready', ['type:e111:query'], false, [false], ['Opened Contacts search.']],
      ['v2-c08-lena-no-results', ['stop-blocked'], false, [false], ['Opened Contacts search.', 'Searched for Lena Quill.', 'Waited for the results to settle.']],
    ],
  },
  {
    id: 'reminders-rename-list', app: 'com.apple.reminders',
    goal: 'Rename the saved Weekend Errands list to Market Errands and verify the saved list title.',
    values: { newName: 'Market Errands' }, assertions: [
      { id: 'market_saved', claim: 'The saved list title on this screen is Market Errands.' },
    ],
    cases: [
      ['v2-r01-weekend-list', ['tap:e11'], false, [false], []],
      ['v2-r02-more-menu', ['tap:e56'], false, [false], ['Opened the Weekend Errands list.', 'Tapped More.']],
      ['v2-r03-list-info-old-name', ['type:e71:newName'], false, [false], ['Opened More.', 'Opened Show List Info.']],
      ['v2-r04-list-info-new-name', ['tap:e57'], false, [false], ['Opened Show List Info.', 'Replaced the list name with Market Errands.']],
      ['v2-r05-renamed-list-saved', ['stop-goal'], true, [true], ['Replaced the old list name.', 'Tapped Done.']],
    ],
  },
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
    elements.set(ref, {
      ref, role, ...(label ? { label } : {}), ...(value ? { value } : {}),
      ...(identifier ? { identifier } : {}), actions: mappedAction ? [mappedAction] : [],
    });
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

function makeHeldoutCase(group, [id, rawAccepted, goalReached, expected, steps]) {
  const compactPath = `raw/${id}.compact.json`;
  const fullPath = `raw/${id}.full.json`;
  const screenshotPath = `raw/${id}.jpg`;
  const compact = JSON.parse(readFileSync(join(dir, compactPath), 'utf8')).data.capture;
  const full = JSON.parse(readFileSync(join(dir, fullPath), 'utf8')).data.capture;
  const meta = JSON.parse(readFileSync(join(dir, `raw/${id}.meta.json`), 'utf8'));
  if (compact.screenHash !== full.screenHash || compact.udid !== deviceId || full.simulatorId !== deviceId ||
      compact.count !== full.elements.length) throw new Error(`Capture mismatch: ${id}`);
  const elements = compactElements(compact);
  const captureTime = Date.parse(meta.capturedAt);
  const item = {
    id, scenarioGroup: group.id, partition: 'heldout',
    scenario: { goal: group.goal, app: { bundleId: group.app }, assertions: group.assertions.map(assertion => ({ ...assertion })),
      values: group.values, device: { udid: deviceId } },
    compactSnapshot: { deviceId, capturedAt: captureTime, expiresAt: captureTime + 60_000,
      sequence: compact.seq, elements, truncated: compact.count > elements.length, screenshotPath },
    fullSnapshot: { deviceId, capturedAt: full.capturedAtMs, expiresAt: full.expiresAtMs,
      sequence: full.seq, elements: full.elements, truncated: false, screenshotPath },
    history: steps.map((description, index) => ({ step: index + 1, description })),
    assets: { compactPath, fullPath, screenshotPath, sha256: {
      compact: sha256(join(dir, compactPath)), full: sha256(join(dir, fullPath)),
      screenshot: sha256(join(dir, screenshotPath)),
    } },
    labels: { acceptableActionIds: [], goalReached,
      assertions: Object.fromEntries(group.assertions.map((assertion, index) => [assertion.id, expected[index]])) },
  };
  if (id === 'v2-r05-renamed-list-saved') {
    item.scenario.assertions.push({ id: 'weekend_still_saved', claim: 'The saved list title on this screen is still Weekend Errands.' });
    item.labels.assertions.weekend_still_saved = false;
  }
  item.labels.acceptableActionIds = expandActionIds(item, rawAccepted);
  return item;
}

const tuning = original.cases.filter(item => item.partition === 'tuning').map(source => {
  const item = structuredClone(source);
  for (const path of [item.assets.compactPath, item.assets.fullPath, item.assets.screenshotPath]) {
    if (sha256(join(dir, path)) !== item.assets.sha256[path.endsWith('.compact.json') ? 'compact' :
      path.endsWith('.full.json') ? 'full' : 'screenshot']) throw new Error(`Copied tuning asset changed: ${path}`);
  }
  item.labels.acceptableActionIds = expandActionIds(item, source.labels.acceptableActionIds);
  if (item.positionalVariant) item.positionalVariant.acceptableActionIds =
    expandActionIds(item, source.positionalVariant.acceptableActionIds);
  return item;
});
const heldout = groups.flatMap(group => group.cases.map(row => makeHeldoutCase(group, row)));
if (tuning.length !== 10 || heldout.length !== 20) throw new Error('Unexpected corpus split');
writeFileSync(join(dir, 'corpus.json'), JSON.stringify({ version: 2, cases: [...tuning, ...heldout] }, null, 2) + '\n');
process.stdout.write('Wrote v2 corpus with 10 retained tuning and 20 fresh held-out cases.\n');
