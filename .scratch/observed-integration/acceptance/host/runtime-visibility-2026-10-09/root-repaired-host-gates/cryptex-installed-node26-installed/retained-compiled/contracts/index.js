/** The device platform a scenario runs on. Scripts without one are iOS. */
export const PLATFORMS = ['ios', 'android'];
/** Narrows an app identity to its iOS shape (a bundle ID). */
export function isIosApp(app) {
    return 'bundleId' in app;
}
/** The app's own label: its bundle ID on iOS, its package on Android. */
export function appLabel(app) {
    return isIosApp(app) ? app.bundleId : app.package;
}
/** Distinguishes an `ActOutcome` from a bare `Snapshot`: only the former carries a `screen` property. */
export function isActOutcome(result) {
    return 'screen' in result;
}
