# Phase 4 corpus kit

- `inventory.json` lists the frozen iOS 24/48 and Android 10/31 cases, recovered from git objects with each asset's commit, blob id and sha256.
- `manifest.json` is the preregistration. All captures are pending until fresh Appium XML and screenshots are attached.
- `android-request-ids.sealed.json` maps the neutral Android request ids back to `t`/`f`/`b`/`b2`. The manifest holds only its digest.
- `renderer-claims-check.md` checks corpus-provenance.md's renderer claims against today's code.
- `extracted/` is gitignored. `recover --extract <dir>` writes the frozen assets there.

Rerun with `npx tsx scripts/phase4/corpus/cli.ts recover --check`, then `manifest generate` and `manifest verify`. Take a capture of the screen now in front on the assigned device with `capture take --screen <id> --platform ios|android --device <id> --assignment <file> --activation <file> --out <dir> --app-build <text>`. It opens one private session through the production stack and the owner's admission store, writes `<id>.xml`, `<id>.png` and `<id>.identity.json` (mode 600) and closes the session. It never launches, resets or terminates the app, never overwrites a capture, and keeps nothing the production normalizer rejects. Attach a capture with `capture attach --screen <id> --xml <file> --screenshot <file> --kind live ...`. `replay --live-jev` is the only path that calls Jev.

A replay writes one result record per screen under `results/<platform>/<screenId>.json`, plus `results/report.json` scoring the run against the frozen exit rule. A screen is judged once and never re-asked, so a second replay over the same records sends nothing.

The test that reads history skips in shallow CI clones, where the frozen commits are absent. The committed files are checked anyway.
