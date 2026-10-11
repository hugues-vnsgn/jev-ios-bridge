// Sequential imports are deliberate: the ordinary recorder validates the initial
// key-free environment before the dedicated guard loads the one real credential.
await import('./process-preload.mjs');
await import('./legacy-guard.mjs');
