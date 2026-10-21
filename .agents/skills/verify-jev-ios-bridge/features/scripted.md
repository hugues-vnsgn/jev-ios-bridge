# Scripted checks and refusal

A saved script runs explicit actions and guards, then asks Jev to judge checkpoint claims. The Android diagnostic journey deliberately ends with a failed assertion about the order total.

## Sub-features

- `script-refusal` rejects malformed or unversioned input before creating a run.
- `script-android` runs the version 1 Android diagnostic through its three actions and final checkpoint.
- `script-ios` runs the corresponding iOS diagnostic after owner approval of admission-store access.
- `script-mcp` submits the same scenario through `start_scenario` and retrieves its result through `get_report`.

## How to get to it (user POV)

Run `node dist/cli.js run <script.json> --json --no-log-pane` from the built checkout, or submit the parsed script as `start_scenario`'s `scenario` argument. Use the platform's own diagnostic scenario.

## Driving it with the CLI and MCP

Preconditions:

- Complete the main skill's Launch through its initial build/doctor, SDK setup, private directories, and owned-emulator startup. Then follow the setup, APK build, installation, and initial capture below. Return to the main skill's live Doctor and smoke before Run Android. Refusal proof needs no device or key.
- For Android, use an assigned, exclusively owned emulator running API 31 or newer. Record its exact serial as `assigned_serial`. The phone `2985e9c` is excluded.
- Use Node 24 or newer, the Android SDK with API 36 for compilation, and a JDK compatible with the checked-in Gradle 9.1.0 wrapper and AGP 9.0.1.
- Load the real Jev key only with the original checkout's explicit environment-file path. An authentication failure blocks the journey.

- **Set paths.** Use `bridge_root`, `key_file`, `proof_project`, `proof_runs`, `proof_evidence`, and `assigned_serial` from the main skill's Launch. Keep its emulator ownership receipt in that same `proof_evidence` directory. Create the runs parent before capturing output. Keep native build evidence outside the checkout and installed plugin.

```sh
umask 077
mkdir -p "$proof_runs" "$HOME/hstack-evidence"
native_store="$(mktemp -d "$HOME/hstack-evidence/jev-android-build.XXXXXX")"
```

- **Build the diagnostic APK.** Read the loaded hStack plugin's `adapters/native-execution.md`. Resolve `hstack_root` from that loaded mode, not another installation. For hStack 0.5.3 on this host it is `/Users/hugues_mini/.codex/plugins/cache/hstack/hstack/0.5.3`. Use the same `ANDROID_HOME` and `PATH` exports as the main skill's Launch. The request records both explicitly. Create the build request and run the helper with `--no-daemon` so it leaves no reusable Gradle daemon. This is a build-only check, so it runs no intentionally failing app unit test.

```sh
export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
test -d "$ANDROID_HOME/platform-tools"
export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$PATH"
hstack_root="/Users/hugues_mini/.codex/plugins/cache/hstack/hstack/0.5.3"
python3 - "$bridge_root" "$native_store/gradle-build.json" <<'PY'
import json, os, pathlib, sys
app_root = pathlib.Path(sys.argv[1]) / "examples/diagnostic-app-android"
request = {
    "argv": [str(app_root / "gradlew"), ":app:assembleDebug", "--console=plain", "--no-daemon"],
    "cwd": str(app_root),
    "operation": "build",
    "target": {"task": ":app:assembleDebug"},
    "reports": [],
    "env": {"ANDROID_HOME": os.environ["ANDROID_HOME"], "PATH": os.environ["PATH"]},
    "timeout_seconds": 900
}
pathlib.Path(sys.argv[2]).write_text(json.dumps(request) + "\n")
PY
python3 "$hstack_root/adapters/native_exec.py" gradle \
  --request "$native_store/gradle-build.json" --store "$native_store"
apk="$bridge_root/examples/diagnostic-app-android/app/build/outputs/apk/debug/app-debug.apk"
test -f "$apk"
```

Require helper exit 0 with `outcome: passed` and `interpretation_status: build_only` in its summary.json, then the APK existence check. Retain the helper's attempt directory and APK hash. A build failure is a missing precondition, never live proof.

- **Install and confirm initial state.** Install only on the assigned emulator. The manifest's launcher is `dev.jevbridge.diagnostic/.MainActivity`. Force-stopping this diagnostic discards its in-memory selection. Launch it and capture the initial screen before the run.

```sh
adb -s "$assigned_serial" install -r "$apk"
adb -s "$assigned_serial" shell am force-stop dev.jevbridge.diagnostic
adb -s "$assigned_serial" shell am start -W -n dev.jevbridge.diagnostic/.MainActivity
node "$bridge_root/dist/cli.js" capture --serial "$assigned_serial" \
  > "$proof_runs/initial-screen.jsonl" 2> "$proof_runs/initial-screen.stderr"
```

Require install success, `Status: ok`, and capture exit 0. The capture must include `selection.summary` labelled `Selected: None`, and `choose.apple` labelled `Add Apple ($2)`. Use the [capture recipe](capture.md) for its cleanup proof. This capture uses automation and is part of the authorized device drive.

- **Run live Doctor and smoke.** After the initial capture, return to the main skill's Doctor section and run its check with the owned serial and explicit key env-file. Require exit 0. Then run the smoke command in its Drive section and require exit 0. Resume Run Android below only after both checks pass.

- **Run Android.** Execute the literal scenario below. Capture the status even though exit 1 is expected. If the shell exits on errors, disable that behavior around this command and restore it afterward.

```sh
JEV_ANDROID_DEVICE="$assigned_serial" JEV_PROJECT_DIR="$proof_project" JEV_RUNS_DIR="$proof_runs" \
node --env-file="$key_file" "$bridge_root/dist/cli.js" run \
  "$bridge_root/examples/diagnostic-app-android/scenario.json" --json --no-log-pane \
  > "$proof_runs/run.stdout.json" 2> "$proof_runs/run.stderr"
run_status=$?
printf '%s\n' "$run_status" > "$proof_runs/run.exit"
```

Require actions `addApple`, `addBread`, and `finishOrder`, then checkpoint `verify`. The final screenshot shows `Order complete`, `Apple: $2`, `Bread: $3`, and `Total: $3`. The claim expects `Total: $5`. Require report `platform: android`, `package: dev.jevbridge.diagnostic`, `verdict: failed`, `reason: ASSERTION_FALSE`, and exit 1. The expected failed verdict proves the bridge caught the fixture defect. An API error or inconclusive judgment fails this verification.

- **Keep and retrieve proof.** Read `runId` from stdout. Require `$proof_runs/<runId>/report.json`, `run.jsonl`, and the screenshot files listed by the report. Capture the action sequence and resulting screen. Follow [reports](reports.md) to retrieve the same run and compare its stored result. Run the main skill's Cleanup after every attempt and confirm these files and the native build receipt survive it.
- **Run through MCP.** When MCP is affected, follow [MCP lifecycle](mcp.md) with the parsed Android scenario. Require the same failed diagnostic result. CLI proof alone leaves this entry point unvisited.
- **Run iOS only after approval.** Live iOS scripted runs write the real per-user admission store. Obtain the owner's go-ahead before any live iOS drive. Require an assigned ready simulator as `assigned_udid` and the iOS diagnostic installed as in `docs/guide/01-quickstart.md`. Then run the gated command below and retain its status and evidence. Require the same total mismatch, `failed`, `ASSERTION_FALSE`, and exit 1.

```sh
JEV_PROJECT_DIR="$proof_project" JEV_RUNS_DIR="$proof_runs" JEV_DEVICE_UDID="$assigned_udid" \
node --env-file="$key_file" "$bridge_root/dist/cli.js" run \
  "$bridge_root/examples/diagnostic-app/scenario.json" --json --no-log-pane --no-device-window
```

## Gotchas

- Worktrees and `JEV_PROJECT_DIR` or `JEV_RUNS_DIR` do not isolate the real admission store at `~/Library/Application Support/jev-ios-bridge/admission`. Every live iOS scripted drive is owner-gated. Android scripted runs use their device lease instead.
- The bridge builds and installs neither diagnostic app. Missing SDK/JDK, unbuilt APK, unassigned emulator, locked device, foreign automation owner, or absent key is an unmet precondition. Record it without weakening the guards or checkpoint.
- The APK's minimum SDK is 24, but the bridge requires API 31 or newer. An API 24 emulator cannot prove this journey.
- `install -r` preserves app data. This fixture resets its selection on a new process, but other apps may need their own explicit test reset.
- A script's `device` selection wins over the environment. This diagnostic has no `device` field. Preserve `platform: android` and `app.package`; an iOS script cannot target Android.
- `--no-log-pane` suppresses the window, not the evidence. Check filenames from the actual report rather than guessing a screenshot sequence or extension.
