import type { ActionOption, Element, HistoryEntry, Observation, Scenario, Snapshot } from '../contracts/index.js';

export type ObservationVariant = 'compact' | 'full';
export interface ObservationBuildOptions {
  variant?: ObservationVariant;
  step?: number;
  maxHistory?: number;
  maxCandidates?: number;
  maxStateBytes?: number;
}

export class ObservationError extends Error {
  constructor(readonly code: 'INVALID_INPUT' | 'TOO_MANY_CANDIDATES' | 'TOO_MANY_ACTIONS' | 'STATE_BUDGET') {
    super(code);
    this.name = 'ObservationError';
  }
}

const MAX_CHOICE_OPTIONS = 255;
const NON_INPUT: ActionOption[] = [
  { id: 'wait', description: 'Wait for the current screen to change.', action: { kind: 'wait' } },
  { id: 'stop-goal', description: 'Stop because the scenario goal is already reached.', action: { kind: 'stop-goal' } },
  { id: 'stop-blocked', description: 'Stop because an observed blocker prevents progress.', action: { kind: 'stop-blocked' } },
  { id: 'none', description: 'No listed action fits the current observation.', action: { kind: 'none' } },
];

function checkedLimit(value: number | undefined, fallback: number, ceiling: number): number {
  const limit = value ?? fallback;
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > ceiling) throw new ObservationError('INVALID_INPUT');
  return limit;
}

function elementName(element: Element): string {
  const name = element.label?.trim() || element.identifier?.trim() || element.role.trim();
  return name || 'unlabelled element';
}

function describe(element: Element, variant: ObservationVariant): string {
  const parts = [`ref=${element.ref}`, `role=${element.role}`, `label=${element.label ?? ''}`];
  if (element.value !== undefined) parts.push(`value=${element.value}`);
  if (element.identifier !== undefined) parts.push(`identifier=${element.identifier}`);
  if (variant === 'full') {
    if (element.frame) parts.push(`frame=${element.frame.x},${element.frame.y},${element.frame.width},${element.frame.height}`);
    if (element.state) parts.push(`state=${JSON.stringify(element.state)}`);
  }
  parts.push(`actions=${element.actions.join(',')}`);
  return parts.join(' | ');
}

/** Stable within a captured screen, including duplicate labels. */
export function actionOptions(snapshot: Snapshot, scenario: Scenario, maxCandidates = 64): ActionOption[] {
  const candidates = snapshot.elements.filter(element =>
    element.state?.visible !== false && element.state?.enabled !== false &&
    (!element.frame || (element.frame.width > 0 && element.frame.height > 0)) &&
    element.actions.some(action => action === 'tap' || action === 'typeText' ||
      (action === 'swipeWithin' && element.role !== 'application' && element.role !== 'window')));
  if (candidates.length > maxCandidates) throw new ObservationError('TOO_MANY_CANDIDATES');
  const options: ActionOption[] = [];
  const refs = new Set<string>();
  for (const element of candidates) {
    if (!element.ref || refs.has(element.ref)) throw new ObservationError('INVALID_INPUT');
    refs.add(element.ref);
    const ref = encodeURIComponent(element.ref);
    const target = elementName(element);
    if (element.actions.includes('tap')) {
      options.push({ id: `tap:${ref}`, description: `Tap ${target} (${element.role}, ref ${element.ref}).`, action: { kind: 'tap', targetRef: element.ref } });
    }
    if (element.actions.includes('typeText')) {
      for (const key of Object.keys(scenario.values).sort()) {
        options.push({ id: `type:${ref}:${encodeURIComponent(key)}`, description: `Type the scenario value ${key} into ${target} (${element.role}, ref ${element.ref}).`, action: { kind: 'type', targetRef: element.ref, valueKey: key } });
      }
    }
    if (element.actions.includes('swipeWithin') && element.role !== 'application' && element.role !== 'window') {
      for (const direction of ['up', 'down', 'left', 'right'] as const) {
        options.push({ id: `swipe:${ref}:${direction}`, description: `Swipe ${direction} within ${target} (${element.role}, ref ${element.ref}).`, action: { kind: 'swipe', targetRef: element.ref, direction } });
      }
    }
  }
  options.push(...NON_INPUT.map(option => ({ ...option })));
  if (options.length > MAX_CHOICE_OPTIONS) throw new ObservationError('TOO_MANY_ACTIONS');
  if (new Set(options.map(option => option.id)).size !== options.length) throw new ObservationError('INVALID_INPUT');
  return options;
}

/** Render only textual evidence; screenshotPath is deliberately excluded. */
export function buildObservation(
  scenario: Scenario,
  snapshot: Snapshot,
  history: HistoryEntry[] = [],
  buildOptions: ObservationBuildOptions = {},
): Observation {
  const variant = buildOptions.variant ?? 'full';
  if (variant !== 'compact' && variant !== 'full') throw new ObservationError('INVALID_INPUT');
  const maxHistory = checkedLimit(buildOptions.maxHistory, 3, 20);
  const maxCandidates = checkedLimit(buildOptions.maxCandidates, 64, 255);
  const maxStateBytes = checkedLimit(buildOptions.maxStateBytes, 24_000, 28_000);
  const options = actionOptions(snapshot, scenario, maxCandidates);
  const recent = maxHistory === 0 ? [] : history.slice(-maxHistory);
  const lines = [
    `Goal: ${scenario.goal}`,
    `App bundle: ${scenario.app.bundleId}`,
    `Step: ${buildOptions.step ?? history.length + 1}`,
    `Observation: ${variant}; snapshot sequence ${snapshot.sequence}; captured ${new Date(snapshot.capturedAt).toISOString()}; truncated ${snapshot.truncated}`,
    `Supplied scenario values: ${JSON.stringify(scenario.values)}`,
  ];
  if (scenario.preconditions?.length) lines.push(`Preconditions: ${scenario.preconditions.join('; ')}`);
  if (recent.length) lines.push('Recent steps:', ...recent.map(entry => `${entry.step}. ${entry.description}`));
  const visibleElements = snapshot.elements.filter(element =>
    element.state?.visible !== false && element.state?.enabled !== false &&
    (!element.frame || (element.frame.width > 0 && element.frame.height > 0)));
  lines.push('Visible elements:', ...visibleElements.map(element => describe(element, variant)));
  const text = lines.join('\n');
  // UTF-8 bytes are a deliberately conservative proxy for tokenizer input, with room for questions.
  if (Buffer.byteLength(text, 'utf8') > maxStateBytes) throw new ObservationError('STATE_BUDGET');
  return { snapshot, text, options };
}
