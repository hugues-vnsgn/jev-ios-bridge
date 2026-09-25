# Developer guide outline

Type: prototype
Status: resolved
Claimed by: Claude Code (owner session)
Blocked by: 04, 05

## Question

What should the developer guide look like for someone who wants to use the bridge in their own app? Prototype a rough outline of `docs/guide/` for native iOS (SwiftUI/UIKit) and KMP/Compose Multiplatform developers using Claude Code, and react to it with the owner. Cover at least:

- the page set and reading order (quickstart, preparing an app, accessibility identifiers per UI framework, writing scripts and guards, writing claims, reading reports and evidence, troubleshooting, data handling, limits);
- one worked example per framework, and what fixture it uses;
- what moves out of `README.md` and `docs/usage.md`, and what `/test-ios` links to;
- what ships in the tarball.

Link the outline as the asset.

## Comments

- 2026-09-25, from "Product assessment": build the guide around **repeatable checks** (scripts kept in the repo and re-run after changes). State plainly that the bridge can be slower than Claude driving the app directly, that script-authoring cost is unmeasured, that 1.0 assurance covers English screens only, and that verification should use synthetic data in apps the developer controls (prompt-injection risk). Live Compose findings to teach: guards need identifier or role, not label alone, because merged buttons repeat their label on a text child; empty Compose fields omit `value`; tags must be unique per instance (see "Live Compose capture").
- 2026-09-25, from "Compose app evidence plan": the Compose evidence app is `BFSOne_Mobile_App` (CMP 1.9.0) through its debug gallery shortcut, with `cmp` as the fallback. Also teach: the new optional `app.launchArgs` for debug entry points; `value: ''` is rejected, so don't select or assert emptiness through `value`; component-level identifiers that repeat per instance (`numberInput.field`, `of-field-clear`); and "not tested" for `heading()`, SwiftUI chrome around Compose, and `usingNativeTextInput`.

## Answer

Decided with the owner on 2026-09-25. The owner accepted the outline as drafted: [`guide-outline.md`](../guide-outline.md) (the prototype asset).

1. **Pages:** `docs/guide/` with an index; 11 numbered pages (quickstart, preparing your app, identifiers, writing scripts, writing claims, running, reports and evidence, troubleshooting, data handling, limits, stability); `examples/`; and `reference/` (script format, reason codes, `report.json`). A new developer reads the index and pages 01–07 in order. Claude authoring a script reads pages 03–05 and `reference/script-format.md`.
2. **Worked examples:**
   - **Quickstart:** the diagnostic app, whose planted $3 total gives a failed report on the first run.
   - **SwiftUI:** the vendored Weather app with its existing `weather-scripted.json`, annotated step by step.
   - **Compose:** a cut-down, annotated copy of one BFSOne gallery evidence script. The page says outside readers can't build the app. There's no new public Compose fixture.
3. **Old docs:**
   - `docs/usage.md` is split into the guide pages and deleted.
   - `README.md` shrinks to a pitch, install steps, a guide link, and current status.
   - The v0.1.0 experiment history moves to `docs/releases/v0.1.0.md`.
4. **`/test-ios`** stays short. It links to guide pages 03–05 and `reference/script-format.md` through the installed package path (`node_modules/jev-ios-bridge/docs/guide/...`), not relative or GitHub links.
5. **Tarball:** `dist/`, `skills/`, `README.md`, `docs/guide/`, `LICENSE`, and `CHANGELOG.md`. ADRs, research, spikes, and example app sources stay on GitHub, linked at the release tag.
6. **License: MIT.** The repo has no license today. 1.0 adds a `LICENSE` file and `"license": "MIT"` in `package.json`. Outside developers can't lawfully use it otherwise.
7. **Carried into the guide:** the framing and limits from "Product assessment", the Compose lessons from "Live Compose capture" and "Compose app evidence plan", ADR-0004's claim rules, and ADR-0005's upgrade notes. Page 09's wording and page 10's cost-per-run figure come from their own tickets or fog.
