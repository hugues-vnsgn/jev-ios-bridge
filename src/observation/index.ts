import type { ActionOption, Element, HistoryEntry, Observation, Scenario, Snapshot } from '../contracts/index.js';

export type ObservationVariant = 'compact' | 'full';
export type OptionRule = 'v1' | 'v2';
export interface ObservationBuildOptions {
  variant?: ObservationVariant;
  optionRule?: OptionRule;
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

function hasSupportedAction(element: Element): boolean {
  return element.actions.some(action => action === 'tap' || action === 'typeText' ||
    (action === 'swipeWithin' && element.role !== 'application' && element.role !== 'window'));
}

function hasObservationEvidence(element: Element): boolean {
  return hasSupportedAction(element) || Boolean(element.label?.trim() || element.value?.trim() || element.identifier?.trim()) ||
    /^(text|statictext|title|heading|alert)$/i.test(element.role);
}

function isPureScrollBar(element: Element): boolean {
  return element.role === 'slider' && /^(?:vertical|horizontal) scroll bar,?\s*\d+ pages?$/i.test(element.label?.trim() ?? '');
}

function contains(outer: NonNullable<Element['frame']>, inner: NonNullable<Element['frame']>): boolean {
  const epsilon = 0.5;
  return outer.x <= inner.x + epsilon && outer.y <= inner.y + epsilon &&
    outer.x + outer.width + epsilon >= inner.x + inner.width &&
    outer.y + outer.height + epsilon >= inner.y + inner.height;
}

function canonicalTapRefs(elements: Element[]): Map<string, string> {
  const byIdentity = new Map<string, Element[]>();
  for (const element of elements) {
    if (!element.actions.includes('tap') || !element.identifier?.trim() || !element.frame) continue;
    const identity = JSON.stringify([element.identifier.trim(), element.role, element.label ?? '', element.value ?? '']);
    const group = byIdentity.get(identity) ?? [];
    group.push(element);
    byIdentity.set(identity, group);
  }
  const aliases = new Map<string, string>();
  for (const group of byIdentity.values()) {
    const ranked = group.sort((a, b) =>
      b.frame!.width * b.frame!.height - a.frame!.width * a.frame!.height ||
      a.ref.localeCompare(b.ref, undefined, { numeric: true }));
    const clusters: Element[][] = [];
    for (const element of ranked) {
      // Every pair must describe the same physical target; a large common ancestor
      // alone must not merge two distant child controls.
      const cluster = clusters.find(members => members.every(member =>
        contains(member.frame!, element.frame!) || contains(element.frame!, member.frame!)));
      if (cluster) cluster.push(element);
      else clusters.push([element]);
    }
    for (const cluster of clusters) {
      const canonical = cluster[0]!;
      for (const element of cluster) if (element.ref !== canonical.ref) aliases.set(element.ref, canonical.ref);
    }
  }
  return aliases;
}

const swipeExplanation: Record<'up' | 'down' | 'left' | 'right', string> = {
  up: 'finger from bottom to top; content moves up to reveal later, lower items',
  down: 'finger from top to bottom; content moves down to reveal earlier, higher items',
  left: 'finger from right to left; content moves left to reveal items farther right',
  right: 'finger from left to right; content moves right to reveal items farther left',
};

export interface ActionProjection { options: ActionOption[]; collapsedTapRefs: Record<string, string[]> }

/** Stable within a captured screen, including duplicate labels. */
export function projectActionOptions(snapshot: Snapshot, scenario: Scenario, maxCandidates = 64,
  projection: { variant?: ObservationVariant; optionRule?: OptionRule } = {}): ActionProjection {
  const optionRule = projection.optionRule ?? 'v1';
  const variant = projection.variant ?? 'full';
  const candidates = snapshot.elements.filter(element =>
    element.state?.visible !== false && element.state?.enabled !== false &&
    (!element.frame || (element.frame.width > 0 && element.frame.height > 0)) &&
    !(optionRule === 'v2' && isPureScrollBar(element)) &&
    hasSupportedAction(element));
  if (optionRule === 'v1' && candidates.length > maxCandidates) throw new ObservationError('TOO_MANY_CANDIDATES');
  const aliasToCanonical = optionRule === 'v2' && variant === 'full' ? canonicalTapRefs(candidates) : new Map<string, string>();
  const collapsedTapRefs: Record<string, string[]> = {};
  for (const [alias, canonical] of aliasToCanonical) (collapsedTapRefs[canonical] ??= []).push(alias);
  const options: ActionOption[] = [];
  const refs = new Set<string>();
  for (const element of candidates) {
    if (!element.ref || refs.has(element.ref)) throw new ObservationError('INVALID_INPUT');
    refs.add(element.ref);
    const ref = encodeURIComponent(element.ref);
    const target = elementName(element);
    if (element.actions.includes('tap') && !aliasToCanonical.has(element.ref) &&
        !(optionRule === 'v2' && element.actions.includes('typeText') && Object.keys(scenario.values).length > 0)) {
      options.push({ id: `tap:${ref}`, description: `Tap ${target} (${element.role}, ref ${element.ref}).`, action: { kind: 'tap', targetRef: element.ref } });
    }
    if (element.actions.includes('typeText')) {
      for (const key of Object.keys(scenario.values).sort()) {
        options.push({ id: `type:${ref}:${encodeURIComponent(key)}`, description: `Replace all text in ${target} with the supplied scenario value ${key} (${element.role}, ref ${element.ref}).`, action: { kind: 'type', targetRef: element.ref, valueKey: key } });
      }
    }
    if (element.actions.includes('swipeWithin') && element.role !== 'application' && element.role !== 'window') {
      for (const direction of ['up', 'down', 'left', 'right'] as const) {
        const description = optionRule === 'v2'
          ? `Swipe ${direction} within ${target}: move the ${swipeExplanation[direction]} (${element.role}, ref ${element.ref}).`
          : `Swipe ${direction} within ${target} (${element.role}, ref ${element.ref}).`;
        options.push({ id: `swipe:${ref}:${direction}`, description, action: { kind: 'swipe', targetRef: element.ref, direction } });
      }
    }
  }
  options.push(...NON_INPUT.map(option => ({ ...option })));
  if (optionRule === 'v2' && new Set(options.flatMap(option => 'targetRef' in option.action ? [option.action.targetRef] : [])).size > maxCandidates) {
    throw new ObservationError('TOO_MANY_CANDIDATES');
  }
  if (options.length > MAX_CHOICE_OPTIONS) throw new ObservationError('TOO_MANY_ACTIONS');
  if (new Set(options.map(option => option.id)).size !== options.length) throw new ObservationError('INVALID_INPUT');
  return { options, collapsedTapRefs };
}

export function actionOptions(snapshot: Snapshot, scenario: Scenario, maxCandidates = 64,
  projection: { variant?: ObservationVariant; optionRule?: OptionRule } = {}): ActionOption[] {
  return projectActionOptions(snapshot, scenario, maxCandidates, projection).options;
}

/** Render only textual evidence; screenshotPath is deliberately excluded. */
export function buildObservation(
  scenario: Scenario,
  snapshot: Snapshot,
  history: HistoryEntry[] = [],
  buildOptions: ObservationBuildOptions = {},
): Observation {
  const variant = buildOptions.variant ?? 'full';
  const optionRule = buildOptions.optionRule ?? 'v1';
  if (variant !== 'compact' && variant !== 'full') throw new ObservationError('INVALID_INPUT');
  if (optionRule !== 'v1' && optionRule !== 'v2') throw new ObservationError('INVALID_INPUT');
  const maxHistory = checkedLimit(buildOptions.maxHistory, 3, 20);
  const maxCandidates = checkedLimit(buildOptions.maxCandidates, 64, 255);
  const maxStateBytes = checkedLimit(buildOptions.maxStateBytes, 24_000, 28_000);
  const { options, collapsedTapRefs } = projectActionOptions(snapshot, scenario, maxCandidates, { variant, optionRule });
  const collapsed = new Set(Object.values(collapsedTapRefs).flat());
  const selectableRefs = new Set(options.flatMap(option => 'targetRef' in option.action ? [option.action.targetRef] : []));
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
    (!element.frame || (element.frame.width > 0 && element.frame.height > 0)) &&
    !(optionRule === 'v2' && (isPureScrollBar(element) || (collapsed.has(element.ref) && !selectableRefs.has(element.ref)))) &&
    hasObservationEvidence(element));
  lines.push('Visible elements:', ...visibleElements.map(element => describe(element, variant)));
  const text = lines.join('\n');
  // UTF-8 bytes are a deliberately conservative proxy for tokenizer input, with room for questions.
  if (Buffer.byteLength(text, 'utf8') > maxStateBytes) throw new ObservationError('STATE_BUDGET');
  return { snapshot, text, options };
}
