import type { Element, Platform, Snapshot } from '../contracts/index.js';

export const MAX_STATE_BYTES = 24_000;
/**
 * v2 keeps scroll-bar sliders ("Vertical scroll bar, 1 page 0%"), which v1 dropped: the observation-shape
 * experiment (spikes/observation-shape) passed ADR-0004's corpus gate with them. Explicit empty values were
 * rejected there, because they made Jev confidently call a field with withheld content empty.
 */
export const PROJECTION_RULE = 'visible-full-text-v2' as const;
/** The Android counterpart to `PROJECTION_RULE`: the iOS field set, plus `placeholder` in place of `label`. */
export const ANDROID_PROJECTION_RULE = 'android-full-text-v1' as const;

export class ScriptedObservationError extends Error {
  constructor(readonly code: 'TRUNCATED' | 'EMPTY_SCREEN' | 'STATE_BUDGET') {
    super(code);
    this.name = 'ScriptedObservationError';
  }
}

function isVisibleEvidence(element: Element, platform: Platform): boolean {
  if (element.state?.visible === false || (element.frame && (element.frame.width <= 0 || element.frame.height <= 0))) return false;
  if (/status.?bar/i.test(`${element.role} ${element.identifier ?? ''}`)) return false;
  const placeholderText = SHOWS_PLACEHOLDER[platform] ? element.placeholder?.trim() : undefined;
  return Boolean(element.label?.trim() || placeholderText || element.value?.trim() || element.identifier?.trim() ||
    element.actions.length > 0 || /^(text|statictext|title|heading|alert)$/i.test(element.role));
}

const HEADERS: Record<Platform, string> = {
  ios: 'Current iOS screen (full accessibility capture):',
  android: 'Current Android screen (full accessibility capture):',
};

/** The projection rule each platform's `started` event records, and Jev is shown under. */
export const PROJECTION_RULES: Record<Platform, typeof PROJECTION_RULE | typeof ANDROID_PROJECTION_RULE> = {
  ios: PROJECTION_RULE,
  android: ANDROID_PROJECTION_RULE,
};

/** Whether the platform's view treats an empty field's `placeholder` as evidence, shown in place of `label`.
 *  iOS never does, so its output stays byte-identical regardless of what a snapshot happens to carry. */
const SHOWS_PLACEHOLDER: Record<Platform, boolean> = {
  ios: false,
  android: true,
};

/**
 * Full text evidence for assertion judgments; no action options, values, history or screenshots.
 * The platform picks the header, and whether an element's `placeholder` counts as evidence and is shown
 * in place of `label` (`SHOWS_PLACEHOLDER`); it defaults to iOS, whose output is frozen byte for byte.
 */
export function renderAssertionState(snapshot: Snapshot, platform: Platform = 'ios'): string {
  if (snapshot.truncated) throw new ScriptedObservationError('TRUNCATED');
  const elements = snapshot.elements.filter(element => isVisibleEvidence(element, platform));
  if (elements.length === 0) throw new ScriptedObservationError('EMPTY_SCREEN');
  const lines = [HEADERS[platform], ...elements.map(element => JSON.stringify({
    role: element.role,
    ...(SHOWS_PLACEHOLDER[platform] && element.placeholder !== undefined ? { placeholder: element.placeholder } :
      element.label !== undefined ? { label: element.label } : {}),
    ...(element.value !== undefined ? { value: element.value } : {}),
    ...(element.identifier !== undefined ? { identifier: element.identifier } : {}),
    ...(element.frame ? { frame: element.frame } : {}),
    ...(element.state ? { state: element.state } : {}),
  }))];
  const state = lines.join('\n');
  if (Buffer.byteLength(state, 'utf8') > MAX_STATE_BYTES) throw new ScriptedObservationError('STATE_BUDGET');
  return state;
}
