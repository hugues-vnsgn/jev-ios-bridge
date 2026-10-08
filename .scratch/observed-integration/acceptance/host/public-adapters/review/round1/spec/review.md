# Spec review: BLOCKED — two P2 findings

Reviewed ticket08 against base `1275f93c616c90aba63e92468679cf39f13157b5`, the frozen 12-file manifest, and accepted public/allocation/admission/seam contracts. Candidate commit association is pending. No unasked product scope found in the reviewed surface.

1. **P2 — configuration failure masks authoritative retirement.** `src/observed/cli.ts:70–74` delegates after the failure reread only for imported or action-bound records. If a ready allocation becomes retained while configuration validation fails, the adapter emits `CONFIGURATION_ERROR`. Public contract line34 requires “Start on an unready allocation returns `ALLOCATION_NOT_READY`”; Root expressly requires current configuration to gate only eligible fresh-ready binding. Real isolated Admission reproduction prepares ready, durably retires during failing validation, then starts through the exported composition: observed CONFIGURATION_ERROR, retained authority, no additional backend calls. Expected shared-service ALLOCATION_NOT_READY. Proof: `retirement-race.test.ts`, `retirement-race.log` (1/1 fails).

2. **P2 — signals do not guarantee bounded CLI exit.** `src/cli.ts:120–122` awaits close then merely sets `process.exitCode`. Public contract line93 requires signals to “attempt bounded local finalization, then exit 130/143”. With a pending fake snapshot retaining an active resource, genuine `runCli` returns with exitCode143 after SIGTERM, but its process remains alive beyond6500ms. The existing CLI fixture explicitly exits after runCli, hiding this entrypoint behavior. Proof: `signal-exit-fixed-setup.test.ts`, corresponding log (1/1 fails; child stderr RUNCLI_RETURNED143; reviewer terminates only its own child). The resource is an interval inside the fake backend seam, not a real device operation.

All12 SHA256/git blobs matched before and after review and matched immutable copies. Separate raw probe setup errors remain preserved and are excluded from product findings. No full suite, production store, backend, device, or secret access performed. No live acceptance claimed.

## Evidence appendix

- Independent runtime: Node26.8.1. Commands and exits: `probes-command.json`, `retirement-race-command.json`, `signal-exit-fixed-setup-command.json`. All use `node --import tsx --test <private probe>`, isolated fake-backed fixtures; child umask0022.
- `probes.log`: 1pass/1fail (safe missing-option handling passes; initial config facade race fails). Real-store confirmation is the retirement probe above.
- `before-hashes.json`, `after-hashes.json`, `manifest.json`, `revision.json`; exact 12 source mappings and private `reviewed-source/` copies retained.
- Read author raw logs: final-focused-node26 60/60; final-focused-node24 59/60 with legacy SQLite-warning stderr assertion; final-full-check1467/1467 plus build output. These owner gates do not cover either finding. Parent independently attributes the warning to accepted pre08; I did not independently rerun its baseline.
- Read bin-entry32red (1failed),33green (3passed) and29-provenance.md.29 is fixture-only setup red, not product evidence.
- Initial signal-exit.log and probes-setup-error.log are setup failures; corrected probes have separate filenames/logs. Original results and frozen source remain unchanged.
