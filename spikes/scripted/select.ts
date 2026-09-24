import type { Element, Snapshot } from '../../src/contracts/index.js';
import type { ScreenGuard, Selector } from './contracts.js';

export type SelectionErrorCode =
  | 'SNAPSHOT_TRUNCATED' | 'INVALID_SELECTOR'
  | 'TARGET_MISSING' | 'TARGET_UNAVAILABLE' | 'TARGET_AMBIGUOUS'
  | 'GUARD_MISSING' | 'GUARD_AMBIGUOUS' | 'GUARD_FORBIDDEN';

export class ScriptSelectionError extends Error {
  constructor(readonly code: SelectionErrorCode) {
    super(code);
    this.name = 'ScriptSelectionError';
  }
}

/** Internal driver capability; authored scenarios cannot request alias collapsing. */
export interface SelectionOptions {
  tapAliasRule?: 'mobilebuildmcp-2.7.1';
}

function usableFrame(element: Element): boolean {
  return element.frame !== undefined && element.frame.width > 0 && element.frame.height > 0;
}

function visible(element: Element): boolean {
  return element.state?.visible === true && usableFrame(element);
}

function matches(element: Element, selector: Selector): boolean {
  const fields = Object.entries(selector).filter(([, value]) => value !== undefined);
  if (!fields.length) throw new ScriptSelectionError('INVALID_SELECTOR');
  return fields.every(([name, value]) => element[name as keyof Selector] === value);
}

function contains(outer: NonNullable<Element['frame']>, inner: NonNullable<Element['frame']>): boolean {
  const slack = 0.5;
  return outer.x <= inner.x + slack && outer.y <= inner.y + slack &&
    outer.x + outer.width + slack >= inner.x + inner.width &&
    outer.y + outer.height + slack >= inner.y + inner.height;
}

function onePhysicalTargetPerAliasCluster(elements: Element[]): Element[] {
  const identified = new Map<string, Element[]>();
  const distinct: Element[] = [];
  for (const element of elements) {
    if (!element.identifier?.trim() || !element.frame) {
      distinct.push(element);
      continue;
    }
    const identity = JSON.stringify([element.identifier.trim(), element.role, element.label ?? '', element.value ?? '']);
    const group = identified.get(identity) ?? [];
    group.push(element);
    identified.set(identity, group);
  }
  for (const group of identified.values()) {
    group.sort((left, right) => right.frame!.width * right.frame!.height - left.frame!.width * left.frame!.height ||
      left.ref.localeCompare(right.ref, undefined, { numeric: true }));
    const clusters: Element[][] = [];
    for (const element of group) {
      const cluster = clusters.find(members => members.every(member =>
        contains(member.frame!, element.frame!) || contains(element.frame!, member.frame!)));
      if (cluster) cluster.push(element);
      else clusters.push([element]);
    }
    distinct.push(...clusters.map(cluster => cluster[0]!));
  }
  return distinct;
}

/** Pinned AXe taps the same public frame for these duplicate no-ID button refs. */
function equivalentUnidentifiedTapButtons(left: Element, right: Element): boolean {
  if (left.identifier || right.identifier || left.role !== 'button' || right.role !== 'button' ||
      !left.label?.trim() || left.label !== right.label || left.value !== right.value ||
      left.state?.visible !== true || right.state?.visible !== true ||
      left.state.enabled !== true || right.state.enabled !== true ||
      !left.frame || !right.frame || !usableFrame(left) || !usableFrame(right) ||
      ![left.frame.x, left.frame.y, right.frame.x, right.frame.y].every(Number.isFinite) ||
      left.frame.x !== right.frame.x || left.frame.y !== right.frame.y ||
      left.frame.width !== right.frame.width || left.frame.height !== right.frame.height ||
      !left.actions.includes('tap') || !right.actions.includes('tap')) return false;
  const actions = new Set(left.actions);
  const otherActions = new Set(right.actions);
  return actions.size === otherActions.size && [...actions].every(action => otherActions.has(action));
}

function collapseUnidentifiedTapButtonAliases(elements: Element[]): Element[] {
  const distinct: Element[] = [];
  for (const element of [...elements].sort((left, right) =>
    left.ref.localeCompare(right.ref, undefined, { numeric: true }))) {
    if (!distinct.some(existing => equivalentUnidentifiedTapButtons(existing, element))) distinct.push(element);
  }
  return distinct;
}

function visibleMatches(snapshot: Snapshot, selector: Selector, options: SelectionOptions): Element[] {
  if (snapshot.truncated) throw new ScriptSelectionError('SNAPSHOT_TRUNCATED');
  const matched = onePhysicalTargetPerAliasCluster(
    snapshot.elements.filter(element => matches(element, selector) && visible(element)));
  return options.tapAliasRule === 'mobilebuildmcp-2.7.1'
    ? collapseUnidentifiedTapButtonAliases(matched) : matched;
}

export function assertScreenGuard(snapshot: Snapshot, guard: ScreenGuard,
  options: SelectionOptions = {}): void {
  if (snapshot.truncated) throw new ScriptSelectionError('SNAPSHOT_TRUNCATED');
  for (const selector of guard.present) {
    const matches = visibleMatches(snapshot, selector, options);
    if (matches.length === 0) throw new ScriptSelectionError('GUARD_MISSING');
    if (matches.length !== 1) throw new ScriptSelectionError('GUARD_AMBIGUOUS');
  }
  for (const selector of guard.absent ?? []) {
    if (visibleMatches(snapshot, selector, options).length) throw new ScriptSelectionError('GUARD_FORBIDDEN');
  }
}

export function resolveActionTarget(snapshot: Snapshot, selector: Selector,
  action: 'tap' | 'typeText' | 'swipeWithin', options: SelectionOptions = {}): Element {
  if (snapshot.truncated) throw new ScriptSelectionError('SNAPSHOT_TRUNCATED');
  const allMatches = snapshot.elements.filter(element => matches(element, selector));
  if (!allMatches.length) throw new ScriptSelectionError('TARGET_MISSING');
  const available = onePhysicalTargetPerAliasCluster(allMatches.filter(element =>
    visible(element) && element.state?.enabled === true && element.actions.includes(action)));
  const candidates = action === 'tap' && options.tapAliasRule === 'mobilebuildmcp-2.7.1'
    ? collapseUnidentifiedTapButtonAliases(available) : available;
  if (!candidates.length) throw new ScriptSelectionError('TARGET_UNAVAILABLE');
  if (candidates.length !== 1) throw new ScriptSelectionError('TARGET_AMBIGUOUS');
  return candidates[0]!;
}
