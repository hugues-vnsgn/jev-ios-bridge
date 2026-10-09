export class ScriptSelectionError extends Error {
    code;
    constructor(code) {
        super(code);
        this.code = code;
        this.name = 'ScriptSelectionError';
    }
}
function usableFrame(element) {
    return element.frame !== undefined && element.frame.width > 0 && element.frame.height > 0;
}
function visible(element) {
    return element.state?.visible === true && usableFrame(element);
}
/** An element marked `selectable: false` (for example, text Android shows inside a button, which the mapping
 *  lifts onto the button and marks unselectable) is shown to Jev but never matches a selector. */
function selectable(element) {
    return element.selectable !== false;
}
function matches(element, selector) {
    const fields = Object.entries(selector).filter(([, value]) => value !== undefined);
    if (!fields.length)
        throw new ScriptSelectionError('INVALID_SELECTOR');
    return fields.every(([name, value]) => element[name] === value);
}
function contains(outer, inner) {
    const slack = 0.5;
    return outer.x <= inner.x + slack && outer.y <= inner.y + slack &&
        outer.x + outer.width + slack >= inner.x + inner.width &&
        outer.y + outer.height + slack >= inner.y + inner.height;
}
function onePhysicalTargetPerAliasCluster(elements) {
    const identified = new Map();
    const distinct = [];
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
        group.sort((left, right) => right.frame.width * right.frame.height - left.frame.width * left.frame.height ||
            left.ref.localeCompare(right.ref, undefined, { numeric: true }));
        const clusters = [];
        for (const element of group) {
            const cluster = clusters.find(members => members.every(member => contains(member.frame, element.frame) || contains(element.frame, member.frame)));
            if (cluster)
                cluster.push(element);
            else
                clusters.push([element]);
        }
        distinct.push(...clusters.map(cluster => cluster[0]));
    }
    return distinct;
}
/** Pinned AXe taps the same public frame for these duplicate no-ID button refs. */
function equivalentUnidentifiedTapButtons(left, right) {
    if (left.identifier || right.identifier || left.role !== 'button' || right.role !== 'button' ||
        !left.label?.trim() || left.label !== right.label || left.value !== right.value ||
        left.state?.visible !== true || right.state?.visible !== true ||
        left.state.enabled !== true || right.state.enabled !== true ||
        !left.frame || !right.frame || !usableFrame(left) || !usableFrame(right) ||
        ![left.frame.x, left.frame.y, right.frame.x, right.frame.y].every(Number.isFinite) ||
        left.frame.x !== right.frame.x || left.frame.y !== right.frame.y ||
        left.frame.width !== right.frame.width || left.frame.height !== right.frame.height ||
        !left.actions.includes('tap') || !right.actions.includes('tap'))
        return false;
    const actions = new Set(left.actions);
    const otherActions = new Set(right.actions);
    return actions.size === otherActions.size && [...actions].every(action => otherActions.has(action));
}
function collapseUnidentifiedTapButtonAliases(elements) {
    const distinct = [];
    for (const element of [...elements].sort((left, right) => left.ref.localeCompare(right.ref, undefined, { numeric: true }))) {
        if (!distinct.some(existing => equivalentUnidentifiedTapButtons(existing, element)))
            distinct.push(element);
    }
    return distinct;
}
function visibleMatches(snapshot, selector, options) {
    if (snapshot.truncated)
        throw new ScriptSelectionError('SNAPSHOT_TRUNCATED');
    const matched = onePhysicalTargetPerAliasCluster(snapshot.elements.filter(element => matches(element, selector) && visible(element) && selectable(element)));
    return options.tapAliasRule === 'mobilebuildmcp-2.7.1'
        ? collapseUnidentifiedTapButtonAliases(matched) : matched;
}
export function assertScreenGuard(snapshot, guard, options = {}) {
    if (snapshot.truncated)
        throw new ScriptSelectionError('SNAPSHOT_TRUNCATED');
    for (const selector of guard.present) {
        const matches = visibleMatches(snapshot, selector, options);
        if (matches.length === 0)
            throw new ScriptSelectionError('GUARD_MISSING');
        if (matches.length !== 1)
            throw new ScriptSelectionError('GUARD_AMBIGUOUS');
    }
    for (const selector of guard.absent ?? []) {
        if (visibleMatches(snapshot, selector, options).length)
            throw new ScriptSelectionError('GUARD_FORBIDDEN');
    }
}
export function resolveActionTarget(snapshot, selector, action, options = {}) {
    if (snapshot.truncated)
        throw new ScriptSelectionError('SNAPSHOT_TRUNCATED');
    const allMatches = snapshot.elements.filter(element => matches(element, selector) && selectable(element));
    if (!allMatches.length)
        throw new ScriptSelectionError('TARGET_MISSING');
    const available = onePhysicalTargetPerAliasCluster(allMatches.filter(element => visible(element) && element.state?.enabled === true && element.actions.includes(action)));
    const candidates = action === 'tap' && options.tapAliasRule === 'mobilebuildmcp-2.7.1'
        ? collapseUnidentifiedTapButtonAliases(available) : available;
    if (!candidates.length)
        throw new ScriptSelectionError('TARGET_UNAVAILABLE');
    if (candidates.length !== 1)
        throw new ScriptSelectionError('TARGET_AMBIGUOUS');
    return candidates[0];
}
