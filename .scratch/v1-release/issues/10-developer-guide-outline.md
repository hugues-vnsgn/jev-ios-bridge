# Developer guide outline

Type: prototype
Status: open
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
