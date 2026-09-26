/**
 * Renderer variants for the observation-shape experiment (see PREREGISTRATION.md). V0 is production's
 * `visible-full-text-v1`; the adopted variant B became production's `visible-full-text-v2`.
 */
import type { Element, Snapshot } from '../../src/contracts/index.js';
import { MAX_STATE_BYTES } from '../../src/scripted/observe.js';

export type Variant = 'V0' | 'A' | 'B' | 'AB';

function isScrollBar(element: Element): boolean {
  return element.role === 'slider' && /^(?:vertical|horizontal) scroll bar,?\s*\d+ pages?$/i.test(element.label?.trim() ?? '');
}

function isVisibleEvidence(element: Element, keepScrollBars: boolean): boolean {
  if (element.state?.visible === false || (element.frame && (element.frame.width <= 0 || element.frame.height <= 0))) return false;
  if (/status.?bar/i.test(`${element.role} ${element.identifier ?? ''}`) || (!keepScrollBars && isScrollBar(element))) return false;
  return Boolean(element.label?.trim() || element.value?.trim() || element.identifier?.trim() ||
    element.actions.length > 0 || /^(text|statictext|title|heading|alert)$/i.test(element.role));
}

export function render(snapshot: Snapshot, variant: Variant): string {
  const explicitEmpty = variant === 'A' || variant === 'AB';
  const keepScrollBars = variant === 'B' || variant === 'AB';
  const elements = snapshot.elements.filter(element => isVisibleEvidence(element, keepScrollBars));
  const lines = ['Current iOS screen (full accessibility capture):', ...elements.map(element => JSON.stringify({
    role: element.role,
    ...(element.label !== undefined ? { label: element.label } : {}),
    ...(element.value !== undefined ? { value: element.value }
      : explicitEmpty && element.role === 'text-field' ? { value: '' } : {}),
    ...(element.identifier !== undefined ? { identifier: element.identifier } : {}),
    ...(element.frame ? { frame: element.frame } : {}),
    ...(element.state ? { state: element.state } : {}),
  }))];
  const state = lines.join('\n');
  if (Buffer.byteLength(state, 'utf8') > MAX_STATE_BYTES) throw new Error(`STATE_BUDGET ${variant}`);
  return state;
}

