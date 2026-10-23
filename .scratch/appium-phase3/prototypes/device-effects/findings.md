# Findings for the owner

This test measures device effects. The owner decides which effects to allow. No operation contract or capability set was locked. Each case links direct before, active, and after readings.

| Tested session path | Before create | Active session | After delete or kill |
| --- | --- | --- | --- |
| Android first minimum | No Appium packages or Doze entries; hidden-API keys absent; diagnostic app foreground | Two server packages installed; both in Doze whitelist; three hidden-API keys equal 1; instrumentation running; one tcp:18200 to tcp:6790 forward; diagnostic app foreground | Two packages and their Doze entries remain; keys and forward removed; instrumentation gone; diagnostic app foreground |
| Android second minimum | Server packages and Doze entries already present | No package, grant, or Doze delta; keys equal 1; instrumentation and forward present | Keys and forward removed; instrumentation gone; installed state remains |
| Android provisioned skips | Server packages present; Settings helper absent | Same installed state and Doze entries; keys equal 1; instrumentation and forward present | Same installed state; keys and forward removed; instrumentation gone |
| Android unclean child | Server packages present; hidden-API keys and forward absent | Keys equal 1; instrumentation and forward present | Keys remain 1; instrumentation, server process, forward, and accessibility_enabled=1 remain |
| iOS skipLogCapture=true | Native console and subsystem stream alive; app foreground; WDA installed; private DeviceHub plist absent | Both processes alive; WDA bundle path changes and runner starts; DeviceHub alwaysSimulateHardwareKeyboard=false; app PID preserved | Console and stream alive; runner stops; installed WDA and private DeviceHub plist remain; app PID preserved |
| iOS skipLogCapture omitted | New native console and subsystem stream alive; app foreground; WDA installed; new private DeviceHub plist absent | Console survives; original stream exits 143 and its launchd log service is replaced; WDA reinstalled and running; DeviceHub plist written; app PID preserved | Console survives; original stream stays dead; Appium log service and runner stop; installed WDA and private DeviceHub plist remain |

## Effects within these profiles

Android still changes all three hidden-API policies, starts instrumentation, and creates its transport forward with every session, including all provisioning skips. First use installs the server APKs and adds both to Doze. Subsequent use reuses them without a package or grant delta. The Settings helper stayed absent in all four sessions. No helper notification-listener privilege or PROJECT_MEDIA grant appeared. This minimum session worked with the helper absent; helper-backed commands were not exercised.

On iOS, driver-managed preinstalled WDA is reinstalled each session, as shown by the changed device-reported bundle location. It starts during create and is stopped by clean delete. DeviceHub writes alwaysSimulateHardwareKeyboard=false to the child HOME and leaves it after delete. The legacy Simulator plist remains absent. The captured com.apple.keyboard.preferences and global defaults remain equal to their already-used baseline. The source report predicts keyboard writes, but these runs do not demonstrate new autocorrection or prediction values. Real-HOME preference effects and a fresh keyboard baseline remain untested.

## Preserved modes and recovery

The omitted skipLogCapture case contradicts ticket 12's preserved subsystem log source. The original stream dies during create even though the app and console survive. The explicit true case preserves both processes. This proves process survival, not app print emission or an APP_EXITED signal.

At all sampled checkpoints the diagnostic app remains foreground on both platforms. The iOS app PID remains unchanged and all six inspected iOS screenshots show no selection. Android has an active-session UI tree and foreground/process readings, without before-and-after screen capture. No app launch capability is supplied. These results support the attach and capture experiment, but do not prove absence of a brief foreground change between snapshots or acceptance for every run, driven, observed, capture, or attach path.

After the unclean Android case, the script verified its MCP child was absent, removed only the exact forward that appeared in that child's active snapshot, and restored each hidden-API key to its recorded absent state. A fourth reading records the restored keys and missing forward while instrumentation still runs. The existing private-device stop helper then force-stopped and disabled the installed server packages and shut down the AVD. These cleanup effects are separate from clean driver deletion. The AVD uses the approved read-only launch profile, so no reboot-persistence claim is made.

Both platforms passed six final samples showing the exact private device offline and owned ports closed. Load was below 8 at each guarded boot; iOS runtime availability was stable across three observations and the simulator was Booted twice before launch. Scripts and ownership receipts stay under /tmp/p17 and P17-evidence. No Jev, real admission store, other device, rebuild, frozen-file edit, or shared-service restart was used.
