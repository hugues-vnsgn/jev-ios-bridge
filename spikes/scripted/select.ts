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

function visibleMatches(snapshot: Snapshot, selector: Selector): Element[] {
  if (snapshot.truncated) throw new ScriptSelectionError('SNAPSHOT_TRUNCATED');
  return onePhysicalTargetPerAliasCluster(snapshot.elements.filter(element => matches(element, selector) && visible(element)));
}

export function assertScreenGuard(snapshot: Snapshot, guard: ScreenGuard): void {
  if (snapshot.truncated) throw new ScriptSelectionError('SNAPSHOT_TRUNCATED');
  for (const selector of guard.present) {
    const matches = visibleMatches(snapshot, selector);
    if (matches.length === 0) throw new ScriptSelectionError('GUARD_MISSING');
    if (matches.length !== 1) throw new ScriptSelectionError('GUARD_AMBIGUOUS');
  }
  for (const selector of guard.absent ?? []) {
    if (visibleMatches(snapshot, selector).length) throw new ScriptSelectionError('GUARD_FORBIDDEN');
  }
}

export function resolveActionTarget(snapshot: Snapshot, selector: Selector,
  action: 'tap' | 'typeText' | 'swipeWithin'): Element {
  if (snapshot.truncated) throw new ScriptSelectionError('SNAPSHOT_TRUNCATED');
  const allMatches = snapshot.elements.filter(element => matches(element, selector));
  if (!allMatches.length) throw new ScriptSelectionError('TARGET_MISSING');
  const candidates = onePhysicalTargetPerAliasCluster(allMatches.filter(element =>
    visible(element) && element.state?.enabled === true && element.actions.includes(action)));
  if (!candidates.length) throw new ScriptSelectionError('TARGET_UNAVAILABLE');
  if (candidates.length !== 1) throw new ScriptSelectionError('TARGET_AMBIGUOUS');
  return candidates[0]!;
}
