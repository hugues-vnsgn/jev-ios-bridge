/** Jev's Choice takes at most 255 options. */
export const MAX_OPTIONS = 255;
const round = (n) => Math.round(n);
function frameText(element) {
    const f = element.frame;
    return f ? ` at x ${round(f.x)}, y ${round(f.y)}, ${round(f.width)}x${round(f.height)}` : '';
}
/** The element as Jev reads it in the screen text: role, then label (or placeholder), value, identifier, frame. */
export function describeElement(element) {
    const parts = [element.role];
    if (element.placeholder !== undefined && !element.value)
        parts.push(`placeholder "${element.placeholder}"`);
    else if (element.label)
        parts.push(`"${element.label}"`);
    if (element.value)
        parts.push(`value "${element.value}"`);
    if (element.identifier)
        parts.push(`identifier "${element.identifier}"`);
    if (parts.length === 1)
        parts.push('(no label)');
    return parts.join(' ') + frameText(element);
}
function usable(element) {
    if (element.selectable === false)
        return false;
    if (element.state?.visible !== true || element.state.enabled !== true)
        return false;
    if (!element.frame || element.frame.width <= 0 || element.frame.height <= 0)
        return false;
    if (/status.?bar/i.test(`${element.role} ${element.identifier ?? ''}`))
        return false;
    return true;
}
const FIXED = [
    { key: 'scroll:up', description: 'Scroll toward the top to reveal content above the current view',
        meaning: { kind: 'action', action: { kind: 'scroll', direction: 'up' } } },
    { key: 'scroll:down', description: 'Scroll toward the bottom to reveal content below the current view',
        meaning: { kind: 'action', action: { kind: 'scroll', direction: 'down' } } },
    { key: 'back', description: 'Go back: the platform back action (Android Back key, iOS navigation back)',
        meaning: { kind: 'action', action: { kind: 'back' } } },
    { key: 'step_done', description: 'The current step is already done on this screen; no action is needed',
        meaning: { kind: 'step_done' } },
    { key: 'none_fits', description: 'None of these actions performs the current step; hand it back to Claude',
        meaning: { kind: 'none_fits' } },
];
/** Builds the options for one decision from a snapshot's elements and the value keys the step may type. */
export function buildCandidates(elements, valueKeys = []) {
    const seen = new Set();
    // A ref seen twice would give two options one key: the first element keeps it.
    const live = elements.filter(e => usable(e) && !seen.has(e.ref) && seen.add(e.ref));
    const taps = live.filter(e => e.actions.includes('tap')).map(e => ({
        key: `tap:${e.ref}`,
        description: `Tap the ${describeElement(e)}`,
        meaning: { kind: 'action', action: { kind: 'tap', targetRef: e.ref }, element: e },
    }));
    const keys = [...new Set(valueKeys)].sort();
    const types = live.filter(e => e.actions.includes('typeText')).flatMap(e => keys.map((valueKey) => ({
        key: `type:${e.ref}:${valueKey}`,
        description: `Replace the text of the ${describeElement(e)} with the plan value ${valueKey}`,
        meaning: { kind: 'action', action: { kind: 'type', targetRef: e.ref, valueKey }, element: e },
    })));
    const room = MAX_OPTIONS - FIXED.length;
    const variable = [...types, ...taps]; // typed values first: a plan value must never be the one cut
    const kept = [...variable.slice(0, room), ...FIXED];
    return {
        candidates: kept.map(({ key, description }) => ({ key, description })),
        dropped: Math.max(0, variable.length - room),
        meanings: new Map(kept.map(({ key, meaning }) => [key, meaning])),
    };
}
/** Android's permission prompts come from the permission controller; every element on one carries its id prefix. */
const PERMISSION_CONTROLLER_IDS = ['com.android.permissioncontroller:', 'com.google.android.permissioncontroller:'];
/** The buttons of iOS's system permission alerts (notifications, paste, photos, tracking...), whole label. */
const PERMISSION_BUTTONS = new Set(['allow', "don't allow", 'allow once', 'allow while using app', 'allow full access',
    'allow paste', "don't allow paste", 'limit access...', 'ask app not to track']);
/** A label as the alert list holds it: trimmed, lower case, typographic apostrophe and ellipsis made plain. */
const alertLabel = (label) => label.trim().toLowerCase().replace(/\u2019/g, "'").replace(/\u2026/g, '...');
/**
 * Whether the screen shows a system permission dialog, which Jev must never answer (C17): on Android, any element
 * from the permission controller; on iOS, a button labelled like a permission alert's ("Allow", "Don't Allow",
 * "Allow Once"...). An app's own button with one of those labels counts too: it goes to Claude, which is safe.
 */
export function isPermissionDialog(elements, platform) {
    if (platform === 'android') {
        return elements.some(({ identifier }) => identifier !== undefined && PERMISSION_CONTROLLER_IDS.some(id => identifier.startsWith(id)));
    }
    return elements.some(e => e.role === 'button' && e.label !== undefined && PERMISSION_BUTTONS.has(alertLabel(e.label)));
}
/** Android's app error dialogs are framework layouts whose every button has an `android:id/aerr_` id (AOSP's
 *  app_anr_dialog.xml and app_error_dialog.xml), whatever the device's language. */
const APP_ERROR_ID_PREFIX = 'android:id/aerr_';
/**
 * Whether the screen shows Android's app error dialog ("App isn't responding", "App keeps stopping"), for the app
 * under test or any other. It is an unexpected system dialog, which Jev never answers (C17): "Close app" kills the app.
 * iOS has no such dialog.
 */
export function isAppErrorDialog(elements, platform) {
    return platform === 'android' && elements.some(({ identifier }) => identifier?.startsWith(APP_ERROR_ID_PREFIX) === true);
}
/** What a key Jev (or Claude) chose means in this set; undefined when the set never offered it. */
export function lookupCandidate(set, key) {
    return set.meanings.get(key);
}
