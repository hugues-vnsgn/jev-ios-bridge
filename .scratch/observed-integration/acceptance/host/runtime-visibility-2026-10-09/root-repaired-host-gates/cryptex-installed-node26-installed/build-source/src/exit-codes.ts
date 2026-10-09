/** Frozen CLI exit codes (ADR-0005). Signals exit 130 (SIGINT) and 143 (SIGTERM). */
export const EXIT = { passed: 0, failed: 1, inconclusive: 2, couldNotStart: 3 } as const;
