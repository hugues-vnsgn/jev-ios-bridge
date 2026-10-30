# Phase 4 corpus kit

- `inventory.json` lists the frozen iOS 24/48 and Android 10/31 cases, recovered from git objects with each asset's commit, blob id and sha256.
- `manifest.json` is the preregistration. All captures are pending until fresh Appium XML and screenshots are attached.
- `android-request-ids.sealed.json` maps the neutral Android request ids back to `t`/`f`/`b`/`b2`. The manifest holds only its digest.
- `renderer-claims-check.md` checks corpus-provenance.md's renderer claims against today's code.
- `extracted/` is gitignored. `recover --extract <dir>` writes the frozen assets there.

Rerun with `npx tsx scripts/phase4/corpus/cli.ts recover --check`, then `manifest generate` and `manifest verify`. Attach a capture with `capture attach --screen <id> --xml <file> --screenshot <file> --kind live ...`. `replay --live-jev` is the only path that calls Jev.

The test that reads history skips in shallow CI clones, where the frozen commits are absent. The committed files are checked anyway.
