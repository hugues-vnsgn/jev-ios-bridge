---
name: verify-jev-ios-bridge
description: Verify jev-ios-bridge through its built CLI and MCP tools. Use after changing scenario execution, reports, Android capture, cancellation, driven handbacks, or observed actions, or when asked for evidence that the bridge works.
---

# Verify jev-ios-bridge

Start at [the feature map](features/README.md). Read the selected feature before
launching. Choose coverage from the change and report every unvisited entry point.
The primary user interfaces are the CLI and stdio MCP. A host refusal check proves
only refusal. It does not prove device behavior or a clean whole-map cycle.

## Launch

Run from the checkout containing this skill. Set `bridge_root` to that checkout's
absolute path. Use Node >=24 and locked dependencies. Run `npm ci` if
`node_modules` is absent. The CLI is short lived, so launch builds its entry point.

```sh
bridge_root="$(pwd -P)"
node .agents/skills/verify-jev-ios-bridge/scripts/verify.mjs build
node .agents/skills/verify-jev-ios-bridge/scripts/verify.mjs doctor
```

The build helper runs `npm run build` and records SHA-256 digests of source,
build configuration, dependency lockfile, and all dist files. Doctor requires that
receipt, matching digests and revision, the package version, and the observed
prepare/start line in `--help`. A stale 1.4.0 binary fails even if its version
matches. A failed build or doctor blocks driving that artifact.

For Android, use only a task-assigned emulator. The diagnostic proof uses AVD
`Medium_Phone_API_36.1`. Put the SDK's `emulator` and `platform-tools` directories
on `PATH`. On this macOS host, resolve the installed SDK and export it for Gradle.

```sh
export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
test -d "$ANDROID_HOME/platform-tools"
export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$PATH"
emulator -list-avds
```

Require the output to include the assigned AVD.
Create private, separate evidence and project directories for each attempt.

```sh
umask 077
mkdir -p "$bridge_root/.jev-runs/verification"
proof_evidence="$(mktemp -d "$bridge_root/.jev-runs/verification/android-XXXXXXXX")"
proof_project="$(mktemp -d "${TMPDIR:-/tmp}/jev-project-XXXXXXXX")"
proof_runs="$proof_evidence/runs"
mkdir -p "$proof_runs"
key_file=/Users/hugues_mini/Codes/AgentTools/jev-ios-bridge/.env
node "$bridge_root/.agents/skills/verify-jev-ios-bridge/scripts/verify.mjs" android-start \
  --avd Medium_Phone_API_36.1 --port 5588 --evidence "$proof_evidence"
assigned_serial="$(node -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1])).serial' "$proof_evidence/emulator.json")"
```

`android-start` refuses an already running copy of the AVD or occupied emulator
ports. It launches `emulator -avd <assigned> -port 5588 -no-snapshot-save`, records
its PID and process start time in `emulator.json`, and waits up to four minutes.
Ready means the exact serial is online, its AVD name matches, boot completion is
`1`, and the Android package manager answers. The helper passes no Jev key to the
emulator. On launch failure, run Cleanup with that attempt's paths before retrying.
It uses the assigned AVD's existing data and saves no new snapshot.

Follow [the scripted recipe](features/scripted.md) through its APK build, installation,
and initial capture, then return here for Doctor and smoke before its Run Android
step. Use the hStack native-execution helper for Gradle. Run every ADB operation with
`-s "$assigned_serial"`. Require installation success and package
`dev.jevbridge.diagnostic` to exist before doctor. Keep one driver per device.
A connected physical phone is not an assignment. Phone `2985e9c` is unassigned
and must not be driven. The helper accepts only its recorded emulator.

Every live iOS scripted or driven run opens and writes the real per-user admission
store at `~/Library/Application Support/jev-ios-bridge/admission` during
`src/device/index.ts` preparation through `Admission.open()`. Obtain the owner's
explicit go-ahead for that store before any live iOS drive. Separate project and
runs directories do not isolate it. Without that authorization, report iOS as
unverified and owner-gated. Observed prepare/start and admission migration or
maintenance against that store have the same gate. Use [observed actions](features/observed.md)
for that branch. Android scripted runs do not open iOS admission.

For MCP, launch this checkout's `node dist/cli.js mcp` through a stdio MCP client.
Initialize and list tools before calls. Keep stdout for protocol traffic, record
the server PID, and retain the same connection for the run's lifetime. Follow
[the MCP recipe](features/mcp.md) for environment and lifecycle details.

## Doctor

Doctor is read-only. It reads build provenance and calls version/help without
credentials, device selection, or a live run. For the live Android proof, run it
again with the owned emulator and the key loaded only by explicit env-file path.

```sh
node --env-file="$key_file" "$bridge_root/.agents/skills/verify-jev-ios-bridge/scripts/verify.mjs" doctor \
  --serial "$assigned_serial" --evidence "$proof_evidence" > "$proof_evidence/doctor.json"
```

Require exit 0. It verifies Node >=24, source/dist identity, version/help, PID and
start-time ownership, AVD identity, serial online, boot completion, package-manager
readiness, installed diagnostic package, and key presence without echoing the key. The key check proves presence,
not authentication. The live checkpoint proves authentication. An authentication
failure blocks the proof. Never copy the key into a request, log, or child device
environment. Doctor starts no device, builds nothing, and opens no admission store.

## Drive

Run the device-free smoke before a live feature.

```sh
node "$bridge_root/.agents/skills/verify-jev-ios-bridge/scripts/verify.mjs" smoke \
  --evidence "$proof_evidence"
```

Require exit 0. Smoke invokes public version/help, malformed-JSON refusal, and
unknown-report refusal. It checks literal exit codes, diagnostics, and absence
of run files in its credential-free temporary project, then removes that project.

Follow the selected feature's exact commands. For the Android diagnostic proof,
follow [scripted checks](features/scripted.md) with `bridge_root`, `key_file`,
`proof_project`, `proof_runs`, `proof_evidence`, and `assigned_serial` from Launch.
Preserve the CLI exit even when the expected verdict fails. Require verdict
`failed`, reason `ASSERTION_FALSE`, exit 1, a persisted report and trace, and
screenshots. Retrieve that actual run through `report <run-id> --json` and compare
it with the stored report. A Jev authentication error or inconclusive result does
not pass. Do not change the planted assertion to obtain a passing verdict.

Use fresh `JEV_PROJECT_DIR` and `JEV_RUNS_DIR` paths for each attempt. A separate
project isolates output, not a shared device or per-user authority. A fixture or
injected judge proves only the named boundary. Only a real run proves device
behavior. Exercise affected MCP entry points separately when that adapter changes.

## Evidence

Evidence survives cleanup under the named `proof_evidence` directory at
`<checkout>/.jev-runs/verification/android-XXXXXXXX/`. Build provenance stays in
`dist/.verification-build.json`. Copy it to the attempt before teardown.

```sh
cp "$bridge_root/dist/.verification-build.json" "$proof_evidence/build.json"
```

Retain the assignment and build identity, exact commands, stdout, stderr, exit
codes, `doctor.json`, `emulator.json`, `emulator.log`, smoke receipts, and the real
run's `report.json`, `run.jsonl`, and screenshots. Record actions and resulting
state, not only a final screen. Compare the retrieved report to the stored result
and inspect the trace for the expected actions and terminal verdict. Verify files
and other side effects alongside visible state. Keep all attempts, including
failed launches and inconclusive judgments. Local app logs can contain private
values. Keep typed secrets and keys out of receipts and follow the repository's
data-handling rules before sharing artifacts.

When a safe path uses a dry-run or test mode, observe files and network effects
rather than trusting its name. Report every setup step missing from the recipe,
fix the text, and rerun. An unexplained manual workaround invalidates the proof.

## Cleanup

Run cleanup after every attempt, including failures. Let a terminal scripted run
finish its bridge cleanup. For an active run, use `cancel_run` through its owning
MCP connection or signal only the CLI PID you started. Await terminal cleanup,
close the owned MCP client, and wait for its server. Preserve uncertainty and
quarantine instead of rewriting authority or retrying input.

Stop the emulator through its recorded ownership receipt.

```sh
node "$bridge_root/.agents/skills/verify-jev-ios-bridge/scripts/verify.mjs" cleanup \
  --evidence "$proof_evidence"
```

The helper checks the PID's start time before signalling, sends SIGTERM and then
SIGKILL only if that same process remains, and requires its serial to disappear
from `adb devices`. It writes `cleanup.json` while retaining all evidence. A PID
mismatch blocks signalling. Never kill by process name, stop shared ADB or
CoreSimulator, erase a device, or remove the real admission store.

Remove only this attempt's scratch project, then reopen its evidence.

```sh
node -e 'const fs=require("node:fs"),p=require("node:path"); const d=process.argv[1]; if (!p.basename(d).startsWith("jev-project-")) throw Error("Unexpected scratch path"); fs.rmSync(d,{recursive:true,force:true});' "$proof_project"
node -e 'const fs=require("node:fs"),p=require("node:path"); const d=process.argv[1]; for(const f of ["build.json","doctor.json","emulator.json","cleanup.json"]) {if(!fs.statSync(p.join(d,f)).isFile())throw Error(f);} const runs=fs.readdirSync(p.join(d,"runs"),{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name); if(!runs.length)throw Error("No run evidence"); for(const id of runs){for(const f of ["report.json","run.jsonl"])fs.accessSync(p.join(d,"runs",id,f));} console.log("Evidence retained at "+d);' "$proof_evidence"
```

Also confirm the run's screenshots remain readable. For an attempt that failed
before driving, confirm its launch or smoke receipts remain instead of requiring
nonexistent run artifacts. Keep the evidence path in the final receipt.

## Helpers

`scripts/verify.mjs` is executable. Every mode is invoked above. `build` creates
the build receipt. `doctor` reads readiness. `smoke` records host refusal checks.
`android-start` launches only the assigned AVD. `cleanup` stops only its recorded
PID. Helpers never load a key or select a physical device.

Finish with revision, passed/failed/not-run cases, run ID, evidence path, cleanup
status, and every deviation. Name iOS live and observed as unverified when gated.
For map upkeep, use the discovered `maintain-verification-skill` entry through the
active host's native skill mechanism. Maintenance drives the whole map serially.
One generator proof does not certify all mapped features.
