# Source-derived counterexamples, recorded anew after evidence loss

These are static predicate counterexamples, not executed reproductions or recovered original traces.

## P2-1

At races:64 forbidden=['touch']. Choose after=['list','snapshot-ui','screenshot']; every(op=>!forbidden.includes(op)) at:82 is true. Create/boot/install/launch counts remain<=1 and touch0, while cancellation flag/state/capacity remain unchanged. All relevant assertions pass despite forbidden future dispatch. H05.02 snapshots full calls only after cancellation finishes, so additional non-input calls before that snapshot are not rejected; H05.03/.06 and H06.05/.06 likewise only count touch alongside authority fields.

## P2-2

early-cli:16 persists calls before blocking. Later actual f.calls may append boot, but no per-dispatch file writer runs. Signal handling calls process.exit inside runCli, making early-cli:34 unreachable. Saved ['plist'] still satisfies races:159. This demonstrates missing observability; no boot was executed by this review.

H05.07/.08/.10 retain full-call equality. H05.09 explicitly checks all device calls empty before/after released close. These were checked and are not included in P2-1.
