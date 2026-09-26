import type { Element, Snapshot } from '../contracts/index.js';

export const MAX_STATE_BYTES = 24_000;
/**
 * v2 keeps scroll-bar sliders ("Vertical scroll bar, 1 page 0%"), which v1 dropped: the observation-shape
 * experiment (spikes/observation-shape) passed ADR-0004's corpus gate with them. Explicit empty values were
 * rejected there, because they made Jev confidently call a field with withheld content empty.
 */
export const PROJECTION_RULE = 'visible-full-text-v2' as const;

export class ScriptedObservationError extends Error {
  constructor(readonly code: 'TRUNCATED' | 'EMPTY_SCREEN' | 'STATE_BUDGET') {
    super(code);
    this.name = 'ScriptedObservationError';
  }
}

function isVisibleEvidence(element: Element): boolean {
  if (element.state?.visible === false || (element.frame && (element.frame.width <= 0 || element.frame.height <= 0))) return false;
  if (/status.?bar/i.test(`${element.role} ${element.identifier ?? ''}`)) return false;
  return Boolean(element.label?.trim() || element.value?.trim() || element.identifier?.trim() ||
    element.actions.length > 0 || /^(text|statictext|title|heading|alert)$/i.test(element.role));
}

/** Full text evidence for assertion judgments; no action options, values, history or screenshots. */
export function renderAssertionState(snapshot: Snapshot): string {
  if (snapshot.truncated) throw new ScriptedObservationError('TRUNCATED');
  const elements = snapshot.elements.filter(isVisibleEvidence);
  if (elements.length === 0) throw new ScriptedObservationError('EMPTY_SCREEN');
  const lines = ['Current iOS screen (full accessibility capture):', ...elements.map(element => JSON.stringify({
    role: element.role,
    ...(element.label !== undefined ? { label: element.label } : {}),
    ...(element.value !== undefined ? { value: element.value } : {}),
    ...(element.identifier !== undefined ? { identifier: element.identifier } : {}),
    ...(element.frame ? { frame: element.frame } : {}),
    ...(element.state ? { state: element.state } : {}),
  }))];
  const state = lines.join('\n');
  if (Buffer.byteLength(state, 'utf8') > MAX_STATE_BYTES) throw new ScriptedObservationError('STATE_BUDGET');
  return state;
}
