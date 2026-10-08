// Driven mode's mask marker, `⟦value:<key>⟧`. A typed value in a do script may contain neither bracket
// (`openDrivenProject` refuses it), so no value can overlap a marker. The v1 log pane keeps `[value:<key>]`.
export const MARKER_OPEN = '⟦';
export const MARKER_CLOSE = '⟧';
export const marker = (key: string): string => `${MARKER_OPEN}value:${key}${MARKER_CLOSE}`;
