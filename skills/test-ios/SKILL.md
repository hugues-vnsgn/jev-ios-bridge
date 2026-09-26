---
name: test-ios
description: Verify an iOS app through the jev-ios-bridge MCP tools using an explicit action script, then report its recorded verdict. Use for iOS UI verification when the bridge tools are available.
---

# Verify an iOS scenario

1. Establish the installed app bundle ID and configured dedicated, booted simulator. Arrange persistent test data before starting. Preparation restarts the app, so the script must navigate from its post-launch screen. The bridge does not build, install, seed, or reset app data.
2. Use the supplied script unchanged when the request specifies an exact scenario. Otherwise author the complete script from app source, known accessibility identifiers, and reviewed UI evidence before submitting it. The shape is `{version: 1, app: {bundleId}, device?: {udid}, preconditions?: [...], values: {name: literal}, steps: [...]}`; `version: 1` is required. A selector `role` must be one of: application, window, button, keyboard-key, text-field, menu, text, image, switch, slider, cell, scroll-view, list, tab, other. Give every step a unique ID and end at an assertion checkpoint.
   - An action step has `kind: "action"`, a `guard`, and an `action`: `tap` with a `selector`; `replaceText` with `selector` and `valueKey`; or `swipe` with `selector` and `direction`.
   - A wait step has `kind: "wait"`, a starting `guard`, an `until` guard, and `timeoutMs` up to 60000.
   - A checkpoint has `kind: "checkpoint"`, a `guard`, and `assertions: [{id, claim}]` about the current visible screen.
   - A guard has `present: [selector, ...]` and optional `absent: [...]`. A selector uses exact `identifier`, `role`, `label`, or `value`; at least one identifier/role/label is required. An empty value is allowed. Use distinguishing screen anchors: one editable field alone could be a search field or a contact's Notes field. The bridge requires a unique eligible physical target; snapshot refs and list indices are not authored selectors.
3. Supply every typed literal in `values`. Text replacement replaces the entire field. Values must be printable US-keyboard text, at most 2048 characters, and cannot start with a hyphen for the pinned device layer. Use 1–100 steps and 1–20 claims per checkpoint. Claims must describe visible evidence; a visible editor does not establish whether backend storage has committed. Legacy `goal` and autonomous `checkpoints` inputs are unsupported.
4. Call `start_scenario` once with `{scenario}` and optional `limits: {maxSteps, wallTimeMs}`. These are whole-run limits (maxSteps at most 100) and cannot change judgment thresholds. Save the run ID and show its local watch URL. TypeSafe receives observed screen text and current claims; typed values can appear in that screen text. Screenshots remain local.
5. Let the bridge control the simulator. Call `get_report` with `{runId, waitMs: 45000}` and repeat only while running. Running replies contain progress, not screen evidence for choosing another action. The complete script is fixed for that run; there is no per-step host control or resume.
6. Return the recorded verdict, decisive evidence, and local evidence path. Passed means every scripted step and checkpoint passed; failed means a declared assertion was confidently false; inconclusive means verification remains unresolved. Preserve reported setup, selector, model, and cleanup problems. A missing tool or inconclusive run is never a pass.
7. If asked to stop an active run, call `cancel_run`, await cleanup, and read its report. Completed verdicts remain authoritative.

The task is complete when the user has the recorded outcome and evidence needed to investigate it. Keep the simulator available to the bridge until that run finishes.
