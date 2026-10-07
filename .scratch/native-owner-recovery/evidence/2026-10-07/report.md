# Metadata recovery and startup observations, 2026-10-07

The implementation landed in [PR 48](https://github.com/hugues-vnsgn/jev-ios-bridge/pull/48), merge `e494df03d5cc8541542cc0f6ff1d9bbdc0151630`. Process rejection now preserves independent child accounting. Both study and recovery use the Bridge-compatible device guard. The separate recovery Interface disposed of the registered metadata setup once. The following fixed-metadata attempt refused before native execution, and reference research remains unrun.

```text
original metadata: retained / RECORD_SCHEMA; historical exit code unknown
  one-use recovery: canonical runner/fixture absence observed; Shutdown restored
    next boot: container lookup returns old path; metadata refuses
      diagnostic boot: listapps repeats old path; lstat reports ENOENT
        Shutdown restored; guard released; reference study remains gated
```

## Source and verification

The host executed merged code `e494df0`, whose reviewed head was `081b12e`. Native build binding SHA-256 is `d40570d4a3d5029d58c9067e0f9703db963c5f883ffa6f04419ea44b29b82838`, source commit `07874551ff5015837b5400cd6c2a4aa03c6d92ad`. All eight source files, eleven product files and the test plan matched before the metadata attempt. This attempt did not reach XCTest, so it supplies no live validation of the fixed native encoding.

The host suite passes 91 tests. Package checks pass 929 tests, typechecking and build. The diagnostic caller has one passing regression with two restoration-failure cases. Tests use actual temporary claims, the actual TypeScript lease consumer and harmless children that exit naturally; device responses in policy tests are doubles.

Independent Standards and Spec reviews found and resolved two code defects: an unregistered nested `manifest.json` escaped archive inventory, and post-unlink sync failure reported false retained ownership. The diagnostic review also caught a second restoration attempt that could release the guard after final-state validation failed. Each fix has failing-before and passing-after evidence under `verification/`. Review details are in [reviews.md](reviews.md).

## Live outcomes

| Step | Request | Result | Owned commands |
| --- | --- | --- | ---: |
| Inspection | `e9846dbc-e5fe-4b2d-bfab-a305da8fdf24` | retained / METADATA_RECONCILIATION_READY | 6 |
| Apply | `5b0d33e1-9a06-4003-b5eb-b029d6b0663f` | completed / METADATA_RESOURCES_RECONCILED | 17 |
| Fixed metadata attempt | `411cb08c-31fe-4183-a55e-ee7420d033b3` | refused / APP_ABSENCE_UNCONFIRMED | 7 |
| Startup diagnostic | `ab0d2e14-310f-4a31-b0f9-0015297377f6` | completed / READONLY_CONTAINER_LOOKUP_INSPECTED | 10 |

Inspection verified immutable provenance, fixture absence, recorded PID/group and current runner absence, and the exact registered container with five matching hashes. It issued only reads and released its guard after its own children settled.

Apply repeated those gates, claimed the case permanently, issued one runner uninstall, observed canonical runner and fixture absence, restored Shutdown and verified other devices' current states. All 17 owned commands exited with absent groups and closed streams. The claim is `completed` and remains consumed. It cannot authorize another uninstall or remove a later installation.

The fixed metadata attempt booted the owned simulator, then its runner lookup returned 0 and the original container URL. It issued no installation, launch, XCTest command, native observation or input. The host correctly refused and restored its initial state; all seven commands settled and its guard released.

The diagnostic used its own 90-second allowance and guard. Both container lookups returned the old URL. Raw `simctl listapps` also listed the runner with that same `Path`, `Bundle` and `BundleContainer`. Explicit `lstat` returned ENOENT for the app and UUID parent; their Application parent existed. This establishes dangling installed-app metadata in these observations. It does not identify which provider component persisted it or prove that the APIs use independent caches. Fixture lookup retained canonical absence.

The diagnostic performed no uninstall, installation, launch, XCTest, accessibility or input operation. Its ten commands settled, all 23 device states returned to their initial map, the owned device returned to Shutdown, and its guard released. The original reconciliation's observed absence did not persist across the later boot; its receipt is preserved as an observation at that time.

## Preserved facts and frontier

All 29 original critical receipt files and the original 43-file archive remain unchanged. Original metadata remains `retained / RECORD_SCHEMA`; its two completion flags remain numeric ones. Its historical `xcodebuild` return code remains unknown. Success text and later process absence have not been converted into an exit code. New receipts retain `nativeSettlement: unconfirmed`.

The final verified simulator state is Shutdown. These four calls retain no subprocess or device guard. The consumed historical case claim remains on disk. The provider still reports a runner path whose files are absent; that inconsistency blocks ordinary metadata admission. The reference study is unrun, and all 23 production requirements remain pending: 10 IDB, 5 AXe, 5 MobileBuildMCP and 3 Bridge.

The next research ticket is [04](../../issues/04-startup-registration-authority.md): establish an owner-supported route to trustworthy startup registration/absence without replaying the consumed case or weakening the ordinary gate. Context7 and primary-source limits are recorded in [resources.md](resources.md).

`manifest.json` pins every archived file and the decompressed bytes of raw logs/plans. No app binary or result bundle is copied. JSON receipts and original observations retain their bytes. The trace checker reproduces the captured disagreement; a provider fix remains unproved.
