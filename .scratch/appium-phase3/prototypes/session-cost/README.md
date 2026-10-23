# Session startup cost and lifetime

P06 is a throwaway evidence asset. The owner decides session lifetime. These are **session costs, not app performance**. A lifetime-policy comparison is inconclusive. Android running-server warm startup and final action handover remain unproved, and the required iOS native-launch attach verdict is FAIL because app print streaming is unproved.

## Measured startup

All values below are seconds from MCP child spawn. Ready means owned creation returned successfully. First source means the returned diagnostic-app XML passed the app check. A single-run row has no estimate of run-to-run spread. Other rows give the median and full range of three runs, as the brief requested. No five-run speed comparison or adoption recommendation is claimed.

| Platform | Initial state | Runs | Ready | Ready range | First source | First-source range | Observed limiting boundary |
| --- | --- | ---: | ---: | --- | ---: | --- | --- |
| ios | cold | 1 | 77.802 | 77.802 to 77.802 | 78.465 | 78.465 to 78.465 | Native simulator/WDA setup waits |
| ios | cached restart | 3 | 6.418 | 5.867 to 6.870 | 6.513 | 5.968 to 6.980 | Native simulator/WDA setup waits |
| ios | automation running | 3 | 5.829 | 5.633 to 6.340 | 5.915 | 5.730 to 6.432 | Native simulator/WDA setup waits |
| android | cold | 1 | 12.357 | 12.357 to 12.357 | 13.415 | 13.415 to 13.415 | Embedded driver and device setup waits |
| android | cached restart | 3 | 6.796 | 5.507 to 7.747 | 6.991 | 5.582 to 7.963 | Embedded driver and device setup waits |

Cold means no WDA or UiAutomator2 server process was running. Cached restart means a booted device and cached inputs, with automation stopped by the preceding deletion. The iOS automation-running rows started with WDA present. Android has no valid automation-running timing sample. Its three cached restarts are the available warm-device observations.

The iOS cold sample includes a long native setup wait and overlaps completion of the earlier native app launch. It is not a controlled WDA-only cold-start cost. Its largest logged setup interval is 56.300 seconds, one run with no spread estimate, before the WDA connection request. That interval is a native-readiness boundary, not evidence of app execution time. The precise blocking native call remains unisolated.

The Node CPU samples and awaited driver calls place the coarse startup limit in native setup rather than a saturated client. The separate, unreported source profiles in each platform's `warm-3/source-profile.json` place source time in the downstream WDA or UiAutomator2 request. They do not identify the device's internal bottleneck. See `summary.json` for startup counters and `*/timeline.jsonl` for event timestamps. The optional Android startup profiler produced no valid reported warm sample.

Both sides used the frozen stack and flags below. Runs were serial, not alternated comparisons. Host and cache drift remain uncontrolled. Every reported startup awaited a successful create and a diagnostic source. Excluded failures are one busy-port create, one optional-profiler import failure before MCP initialization, and one first-source guard failure showing a System UI ANR dialog. They are retained, not replaced by fast error timings.

## Idle observations

The actual waits below are single session-cost observations. The probe's scheduled wait is their limiter, and one observation supplies no distribution. No Appium command ran during each pause. Every following static-label tap was accepted and returned diagnostic XML. These taps do not prove a new semantic app state. The separately checked native-launch button tap did change state.

| Platform | Requested idle, seconds | Actual wait, seconds | Runs | Resume | Timeout timer active |
| --- | ---: | ---: | ---: | --- | --- |
| ios | 60 | 60.138 | 1 | PASS | false |
| ios | 310 | 310.170 | 1 | PASS | false |
| ios | 900 | 900.162 | 1 | PASS | false |
| android | 60 | 60.357 | 1 | PASS | false |
| android | 310 | 310.084 | 1 | PASS | false |
| android | 900 | 900.072 | 1 | PASS | false |

Both drivers reported `newCommandTimeoutMs=300000` and no active timer before and after the pauses. The pinned MCP create path calls `driver.createSession` directly. The base-driver `executeCommand` path arms the command timer. This explains the observed inactivity limit being inert in this composition, for these runs only.

Native samples retained the same app and automation PIDs while observed. Android reported Awake and powered. One Android `adb shell ps` observation exceeded its deadline and stopped the observer. A single bounded observer repair resumed read-only sampling. The missed interval is unknown. See `android/observer-diagnosis.txt`. Raw `resumeMs` is supplementary only. Its iOS boundary excludes the metadata inspection and its Android boundary includes it, so those raw fields are not a matched comparison.

## Exit and handover

| Event | iOS | Android |
| --- | --- | --- |
| Creating client exits normally, `skip` | Child and owned registry entry survive EOF | Child and owned registry entry survive EOF |
| Close stdin, `delete_all` | Session deleted and child exits normally | Session deleted and child exits normally on the one retry |
| Kill creating client by recorded PID, `delete_all` | EOF cleanup deletes session and child exits | EOF cleanup deletes session and child exits |
| Kill MCP child by recorded PID | No disconnect receipt, native WDA/app survive | No disconnect receipt, native automation/app and owned forwarding survive |
| Fresh action handover | New owned session acts on the same native app PID | Not proved |

A retained Android `tcp:18200` to `tcp:6790` adb forward blocked the next create after its MCP process was killed. The exact private serial was `emulator-5570`. The harness subsequently removed only that verified owned forward after verifying the MCP PID absent. This is experiment cleanup, not a selected product handover policy. The original failure is `android/stdin-delete-all/failure.json`; the successful stdin retry is `android/stdin-delete-all-retry/eof.json`.

The extra Android running-server warm/handover attempt first failed in an optional profiler import before session creation. Its one corrected retry created a session but `first.xml` showed **System UI isn't responding**, with Close app and Wait buttons. It failed the diagnostic-source check. Device experiments stopped at the retry limit. See `android/warm-retry-stop.txt`, `warm-seed-import-failure/`, and `warm-seed/`. This is not a diagnostic-app crash or app-performance finding.

## Required iOS native-launch attach

**FAIL for the full required check.** Native attach and input work. App `print()` streaming was not demonstrated.

The recorded command was `xcrun simctl --set <private set> launch --console-pty --terminate-running-process 15013501-2535-42EB-A67F-45B015DF18F4 dev.jevbridge.diagnostic --p06-session-cost`. The simulator runtime path was stable in two observations, followed by two Booted observations before creation. The native console PID was 44246 and the app PID was 50967. Profiles set `autoLaunch=false`, `noReset=true`, and `shouldTerminateApp=false`.

`ios/cold/first.xml` identifies the diagnostic app. `cold/tap.json` changes Selected: None to Selected: Apple. The later `handover-act/tap.json` changes selection again while the app PID remains 50967 and the launch argument remains in its native argv. The console PID and launch incarnation are unchanged. Deleting the session leaves the app and console alive and stops WDA. Shutting down the private simulator ends the console with exit 0.

The frozen diagnostic sources contain no print or logging calls. The console captured framework diagnostics but no app prints, and its byte count stayed unchanged after those diagnostics. Those facts do not prove continued app print streaming. No fixture was rebuilt, changed, or substituted. `root-note.txt` records the question for the root and owner.

## Comparison with today's bridge

A matched current per-run startup is unmeasured. Both current preparation paths default to `Admission.open()`, and a live ordinary run would cross the forbidden real-store boundary. No admission-bearing bridge command was run.

The closest committed old preparation figures are Weather 2.436 seconds and Contacts 2.214 and 1.955 seconds in `docs/research/scripted-benchmarks.md`. Each was one preparation, with no within-run spread estimate. Their finer limiter was not retained, and their devices, scope, and vintage differ. They are historical context only, not a denominator for a speed ratio. The historical CLI-import experiments in `docs/research/bridge-latency.md` also do not measure a current per-run session on this pair.

## Reproduction and safety

Base `d8077568391107cb5e3349fc5c1e876e9448545b`, branch `prototype/session-cost`. Scripts are under `/tmp/p06/`. Bulky local evidence is under `~/.codex/reports/jev-ios-bridge/phase3-build/P06-evidence/`. Run `python3 /tmp/p06/summarize.py` and `python3 /tmp/p06/verify.py` to inspect retained evidence without device work. Do not rerun the device controllers without renewed coordination of the private pair.

The client was SDK 1.32.1 with its serializer and Client, using an explicit stdio transport to expose EOF and PID controls. The core was appium-mcp 1.97.0, XCUITest 12.17.1, UiAutomator2 8.7.0, frozen WDA 16.14.2, Node 26.8.1, and the pinned emulator 37.2.12. Both profiles use `noReset=true` and `shouldTerminateApp=false`. Android uses `skipUnlock=true`. Stderr goes directly to a file during lifecycle tests, matching Phase 1. The registry observer uses an unreferenced timer and sends no device command.

Only the private iOS set/UDID and AVD were used, one device at a time. Each boot passed load below 8. One attempted retry was refused above that threshold before device effects. No Jev, real admission store, app rebuild, frozen-file edit, other-device action, shared-service restart, PR, or product adapter change occurred.

Final shutdown receipts independently contain six successful observations per platform, with devices offline and owned ports closed. The evidence verifier checks 78 frozen-file hashes unchanged and the selected package identities. Host-check results and named limits are in `P06-report.md` and `P06-evidence/checks.json`. The full gate remains red if its original failure is followed by an isolated passing rerun.
