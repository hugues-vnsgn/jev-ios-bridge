---
researched: 2026-10-19
base: b5715dde8
status: answers ticket 02; feeds ticket 03
---

# Android emulator provenance

The running emulator itself is the only reliable source of which AVD it is. Ask it through the emulator console (`adb -s emulator-N emu avd id`, `avd name`, `avd path`), not the guest property `ro.boot.qemu.avd_name` the driver reads today. That property is only the AVD name: it cannot tell two same-named AVDs under different AVD roots apart, it is readable only once adb reports `device`, and the driver silently falls back to the serial when it is empty. `avd path` returns the AVD's content directory, which does tell them apart. It needs emulator 30 or later and a readable console token, and its output must be checked strictly because `adb emu` exits 0 even when the console refuses the command. The emulator's discovery file and a host process listing are useful cross-checks but are not always present. Do not recompute the AVD root from environment variables in the bridge: the emulator and Android Studio resolve them differently.

This investigation read documentation and source, then ran only local read-only commands (`emulator -version`, `-help-all`, `-list-avds`, `strings` on the installed emulator, reading `~/.android/avd/*`). It started no emulator, ran no `adb` command and made no Jev call. It read no credentials; the console token file was listed (mode only), never opened. Recommendations are for the Phase 2 specification, not completed behaviour.

Evidence labels: **[doc]** developer.android.com; **[src]** AOSP source at a pinned commit; **[bin]** the installed emulator 36.6.1 (its help text and embedded strings); **[local]** files on this Mac; **[inf]** inferred from source, not run.

## 1. What the names and paths actually are

| Thing | What it is | How to read it | Notes |
|---|---|---|---|
| AVD name (also "AVD id") | The basename of the root ini: `<avd root>/<name>.ini`. This is the `-avd`/`@name` argument. Charset is `[A-Za-z0-9_.-]`, no spaces. | Console `avd name`; guest `ro.boot.qemu.avd_name`; `emulator -list-avds` | [src] `info.c` `_checkAvdName`, `avdInfo_new` sets `deviceName` and `deviceId` to the `-avd` argument. [local] `emulator -list-avds` prints `Medium_Phone_API_36.1`, which is the ini basename, not the directory `Medium_Phone.avd`. |
| Device ID | Equal to the AVD name unless the emulator was started with `-id <name>`. | Console `avd id` | [bin] `-help-all` for `-id`: "specifies the ID of the virtual device separate from the AVD name... useful when running multiple clones of the same device... can be queried via `adb -s $device_serial emu avd id`." [src] `main-common.c` calls `avdInfo_setAvdId` when `-id` is given. |
| Display name | The human label from `config.ini` key `avd.ini.displayname` (spaces allowed), e.g. `Medium Phone API 36.1`. | Only in the discovery file as `avd.name` | [src] `qemu-setup.cpp` `get_display_name`. Do not confuse it with the AVD name: the discovery file's `avd.name` is the display name, while console `avd name` and the guest property are the ini basename. |
| Content directory | Where `config.ini`, `userdata-qemu.img`, `snapshots/` live. Often `<avd root>/<name>.avd` but the ini decides, so it may be elsewhere or named differently. | Console `avd path`; discovery `avd.dir` | [src] `info.c` `_avdInfo_getContentPath`: tries `path.rel` first, resolved as `<avd root>/../<path.rel>` (so relative to the parent of the AVD root), then falls back to the absolute `path` key. The ini's `path` is therefore not authoritative when `path.rel` resolves. [local] `Medium_Phone_API_36.1.ini` points at `Medium_Phone.avd`. |
| AVD root | The directory holding the `*.ini` files (`~/.android/avd` by default). | `android.avd.home` in the content directory's `hardware-qemu.ini` (when present) | [local] `Medium_Phone.avd/hardware-qemu.ini` has `android.avd.home = /Users/hugues_mini/.android/avd`. No console command returns it. |
| Serial | `emulator-<console port>`, assigned at start (5554 upward, steps of 2). Not stable across restarts. | `adb devices -l` | [doc] adb page and emulator-console page. [src] `qemu-setup.cpp` sets `android_serial_number_port = adb_port - 1`. |

## 2. Evidence sources compared

| Source | Gives | Needs | Since | Fails or misleads when |
|---|---|---|---|---|
| Guest `getprop ro.boot.qemu.avd_name` (current code) | AVD name only | adb state `device` | Host passes `androidboot.qemu.avd_name` when the `AndroidbootProps` feature is on; otherwise `qemu.avd_name` | Empty on guests that lack it (driver then returns the serial as identity); same value for same-named AVDs under different roots; offline or unauthorized emulators cannot be read. |
| Console `avd name` | AVD name | console reachable | Present in 29.0 and later; usable before authentication | Same name-only limit. |
| Console `avd id` | Device ID (`-id` or the name) | console auth | Absent in `emu-29.0-release`, present in `emu-30-release` | Equal to the name unless `-id` is used. |
| Console `avd path` | Content directory, lexically normalised | console auth | Absent in 29.0, present in 30 | Returns `NO_AVD_INFO` or an empty line in odd cases; not symlink-resolved; see section 4. |
| Discovery file `pid_<pid>.ini` | `port.serial`, `port.adb`, `avd.id`, `avd.dir`, `avd.name` (display name), `cmdline`, `emulator.version`, `grpc.*` | file readable, emulator started the gRPC service | Present in 30; absent at the expected path in 29.0 | Not written when the emulator was started with `-port`/`-ports` and without `-grpc` (section 3). Contains a gRPC bearer token. Stale after a crash. |
| Host process list (`ps`, `lsof`) | argv (`-avd`, `-port`, `-id`, `-datadir`), pid, start time, console listener | same user | any | `-port` absent from argv if auto-assigned; `ps eww` printed no environment for my own process in this sandbox (section 7), so it cannot be relied on to expose `ANDROID_AVD_HOME`. |
| `hardware-qemu.ini` in the content directory | `avd.name`, `avd.id`, `android.avd.home` | file exists | any | Persists after exit; missing for `-read-only` runs on this Mac (section 7). Corroboration only. |
| `emu-launch-params.txt` in the content directory | cwd, emulator binary, full argv of the last launch | file exists | any | Stale after exit. Corroboration only. |

## 3. Facts that decide the recipe

1. **`adb emu` talks to the console directly.** The adb client parses the port out of the serial string (`emulator-%d`), connects to `127.0.0.1:<port>`, sends `auth <token>` read from `$HOME/.emulator_console_auth_token`, then the command, then `quit`. It does not go through the adb server when `-s` is given. [src] adb `client/console.cpp` (`adb_get_emulator_console_port`, `adb_construct_auth_command`, `adb_send_emulator_command`); [src] `client/commandline.cpp` routes `emu` to it; [doc] emulator-console page documents `adb -s emulator-serial emu command`.
   - The serial-to-port mapping is a string parse. If a port is reused by another emulator, the serial still resolves to whatever listens there now. The bridge must re-read provenance at every admission and never cache serial to identity.
   - The token must be readable in the adb client's `$HOME`. The emulator reads the same file in its own home directory each time a client connects, creating it if absent. [src] `console_auth.cpp` (`tokenGetPathDefault` uses the home directory; `tokenLoadOrCreate`). A bridge started with a different `HOME` than the emulator fails authentication.
2. **`adb emu` exits 0 on refusal.** It prints whatever follows the first two `OK\r\n` markers and returns 0 unless it could not connect or write. A normal reply is `<value>\r\nOK\r\n`. [src] `console.cpp`.
   - Wrong token, or no token on the adb client's side while the emulator requires one: the console replies `KO: authentication token does not match...` (or sends nothing for `auth`) and stays in pre-auth mode. `avd name` still works there, but its own `OK` is the second `OK` adb skips, so stdout is empty. `avd id` and `avd path` get `KO: unknown command, try 'help'`, which has no `OK`, so adb prints the `KO:` lines. [inf from `do_auth`, `vm_commands_preauth`, `control_client_do_command` and the adb skip loop]
   - Empty token file (auth disabled): only one banner `OK` is sent, so adb skips the command's own `OK` as the second marker and stdout is empty for every command. [inf from `control_global_accept` and the adb skip loop; unverified live]
   - Unreadable token file on the emulator's side: the console drops the client; stdout is empty. [src] `CONSOLE_AUTH_STATUS_ERROR` path in `control_global_accept`.
   - Therefore treat any stdout that is not exactly one value line followed by `OK` as failure. A success is `<value>\r\nOK\r\n` because a handler that returns 0 is followed by `OK\r\n`. [src] `control_client_do_command`.
3. **Only `avd name` works before authentication.** The source comment says it is special-cased "because it is needed by older versions of Android Studio". `avd id` and `avd path` need the token. [src] `console.cpp` `vm_commands_preauth`.
4. **`avd path` is lexical, not symlink-resolved.** It calls `PathUtils::canonicalPath`, which only removes `.` and `..`. [src] `PathUtils.cpp`; `console.cpp` `do_avd_path`. Replies: the path; `NO_AVD_INFO` when the emulator has no AVD (for example started inside an Android build, where name and id are the literal `<build>`); an empty line if the path cannot be queried. The bridge should `realpath` the result itself.
5. **The console is a host-side service started during emulator setup, not a guest service.** `android_emulation_setup` calls `android_ports_setup`, which starts the console and notifies the adb server; nothing in that path waits for the guest. [src] `qemu-setup.cpp` (android-emu). So `avd name/id/path` should answer while adb still shows the emulator as `offline`; the guest property cannot. [inf] How many seconds after process start the port listens is not measured here.
6. **Guest property timing.** `ro.boot.*` properties are set by init's `PropertyInit()` (kernel command line and bootconfig) before boot scripts load, so before adbd. [src] AOSP `init.cpp` `SecondStageMain`, `property_service.cpp` `ProcessKernelCmdline`/`ProcessBootconfig`. [doc] adb page: state `device` "does not imply that the Android system is fully booted". So the property is effectively readable whenever adb reports `device`. [inf]
7. **The property name depends on the host feature flag and the guest.** The host passes `androidboot.qemu.avd_name` (becomes `ro.boot.qemu.avd_name`) when `AndroidbootProps` or `AndroidbootProps2` is on, else `qemu.avd_name`. [src] `userspace-boot-properties.cpp`. [bin] The installed emulator's default `advancedFeatures.ini` sets both on. In Android 9 to 11, init also exported every kernel option as `ro.kernel.<key>`, so the legacy form surfaces as `ro.kernel.qemu.avd_name`; Android 12 removed that. [src] AOSP `init.cpp` tag `android-9.0.0_r1` (`import_kernel_nv`), `property_service.cpp` tag `android-11.0.0_r1` (`ProcessKernelCmdline`), absent at `android-12.0.0_r1`. The driver's `MIN_API_LEVEL = 31` keeps it on the `ro.boot` form, so the legacy names only matter if that floor is lowered.
8. **The discovery file is optional.** The gRPC service, and with it the advertisement, starts only when `-ports`/`-port` was not given or `-grpc` was. [src] `qemu-setup.cpp` (qemu2-glue) `qemu_android_emulation_setup`: "If you explicitly request adb & telnet port, you must explicitly set the grpc port." `-port N` is rewritten to `-android-ports N,N+1`. [src] `main.cpp`. An emulator started as `emulator -avd X -port 5604` (the form in [local] `emu-launch-params.txt`) writes no discovery file unless `-grpc` is also passed. Treat the file as a bonus, never a requirement.
   - Location: macOS `$HOME/Library/Caches/TemporaryItems/avd/running/`, Linux `$XDG_RUNTIME_DIR/avd/running/` (fallback `/run/user/<uid>`, then the emulator user directory), Windows `%LOCALAPPDATA%\Temp\avd\running\`. It follows the emulator's `HOME`, so a differently-homed reader misses it. [src] `ConfigDirs.cpp` `getDiscoveryDirectory`.
   - Filename is `pid_<pid>.ini`. The installed emulator's `-help-all` says `pid_%d_info.ini`; the source and the binary's format string both say `pid_%d.ini`. The help text is wrong. [bin] [src] `EmulatorAdvertisement.cpp` `location_format`.
   - It holds `grpc.token` and JWT key paths. A reader must parse named keys only and never log or store the file or any `grpc.*` value. [src] `qemu-setup.cpp` (`props["grpc.token"]`).
9. **Same AVD, several instances.** One instance per AVD content directory unless `-read-only` is used. [bin] `-help-virtual-device`: "Only one emulator process can run a given AVD at a time"; `-read-only`: "allow running multiple instances of emulators on the same AVD, but cannot save snapshot"; error string "Another emulator instance is running. Please close it or run all emulators with -read-only flag." So two live serials can share one AVD name, one content directory and one `avd id`. The current driver reports that as `DEVICE_AMBIGUOUS`. Only `-id`, the serial and the process distinguish them.
10. **The emulator and the tools disagree about the AVD root.** The developer page says `emulator -avd` searches `$ANDROID_AVD_HOME`, `$ANDROID_USER_HOME/avd/`, `$HOME/.android/avd/`. [doc] `command-line/variables`. The emulator source and the installed binary never read `ANDROID_USER_HOME` (string absent from `emulator` and `qemu-system-aarch64`); they read `ANDROID_AVD_HOME` (if it is a directory), then `ANDROID_PREFS_ROOT`/`ANDROID_SDK_HOME` (each used as `<value>/avd`, or `<value>/.android/avd`, when that directory exists), then `$TEST_TMPDIR`, `$USER_HOME`, `$HOME` (each `/.android` that contains `avd`), and only then `ANDROID_EMULATOR_HOME`/user directory plus `avd`. [src] `ConfigDirs.cpp` `getAvdRootDirectory` (same logic at `emu-31-release` and `emu-36-1-release`); [bin] strings. Studio and `avdmanager` read `ANDROID_AVD_HOME`, then `ANDROID_USER_HOME` (else `ANDROID_PREFS_ROOT`, `ANDROID_SDK_HOME`)`/avd`. [src] `tools/base` `AbstractAndroidLocations.kt`. The emulator's own comment says the orders "should match" so the two "find different AVDs" otherwise. With `ANDROID_USER_HOME` set, the tools can create an AVD in one place while `emulator -avd` looks in another or finds a same-named AVD elsewhere. This is not run live.
11. **Snapshots do not distinguish roots.** The snapshot compatibility check treats `avd.name` as significant but ignores `avd.id`, `android.avd.home` and `android.sdk.root`. [src] `Snapshot.cpp` (`sHwConfigSnapshotInsensitiveKeys`, `areHwConfigsEqual`). A same-named AVD copied to another root accepts the same snapshot, so snapshots cannot be used as provenance either. A differently-named copy fails the check and cold boots, so the guest property does not go stale from a restored snapshot. [inf]

## 4. Recommended identity-evidence recipe

Run once per candidate emulator at admission, before any effect, each command with a hard deadline (suggest 5 s) and no retries that hide a failure. Candidates are serials starting `emulator-`. All commands are read-only.

**Step 0. List.** `adb devices -l`. Take serial `S = emulator-<P>` and its state. Console steps below work in any state, including `offline`, which also lets the bridge identify an emulator it must report as not ready.

**Step 1. Console identity (primary).**

```
adb -s S emu avd name
adb -s S emu avd id
adb -s S emu avd path
```

Expected stdout, byte for byte: `<value>\r\nOK\r\n`. Examples: `Medium_Phone_API_36.1\r\nOK\r\n`, `/Users/me/.android/avd/Medium_Phone.avd\r\nOK\r\n`. Accept only a single value line followed by `OK`. Reject: empty stdout (auth failed, auth disabled or console dropped the client), `KO:` lines, `NO_AVD_INFO`, an empty value line, a non-absolute path, a name or id outside `[A-Za-z0-9_.-]+` (except an operator-chosen `-id`, which stays opaque). Run `avd path` last and, if the gap between the first and last reads matters, repeat `avd id` to catch a port reused mid-sequence. Note: `adb emu` is a read-only query, but it has no deadline of its own, so the runner needs one. The existing `adbRunner` never kills a child on abort ("a killed `adb` command's outcome would be unknown"), which is right for effects and wrong for a stuck query before the lease is held; the spec needs a separate probe runner that may kill.

**Step 2. Guest property (secondary, only in state `device`).**

```
adb -s S shell getprop ro.boot.qemu.avd_name
```

Expected: the same string as `avd name`. A mismatch is a conflict: refuse, do not pick one. An empty value on an emulator is "unknown", not "use the serial": the current `identity: avd || name` fallback in `resolveDevice` turns a missing property into an identity that changes with the serial.

**Step 3. Host corroboration (cheap, optional).**

```
lsof -nP -a -iTCP:<P> -sTCP:LISTEN -Fp          # pid of the console listener
ps -o pid=,lstart=,command= -p <pid>             # argv and start time
```

Both commands are standard macOS tools; `lsof` was only version-checked here and neither was run against an emulator.

Check argv shows `-avd <name>` or `@<name>` equal to Step 1, and `-port <P>` or `-ports <P>,..` if present. Pid plus start time is the process incarnation that the Phase 1 stop helper already verifies. Do not use `ps eww` or `/proc/<pid>/environ` as a provenance source; Linux can read the environment, macOS did not show it here. [local] [inf]

**Step 4. Discovery file (opportunistic).** If `<discovery dir>/pid_<pid>.ini` exists for the Step 3 pid, read only `port.serial` (must equal `P`), `avd.id` (must equal Step 1 `avd id`), `avd.dir` (must equal Step 1 `avd path`) and `emulator.version`. Ignore every other key, never copy the file. Absence is normal (finding 8), not a failure. Do not call `avd discoverypath`; the emulator creates the directory when asked. [src] `ConfigDirs.cpp`.

**Step 5. Normalise.** Resolve Step 1's path with the host's `realpath` (the emulator only simplifies `.`/`..`). Record `device identity = realpath(avd path)` plus attributes `avdName`, `avdId`, `serial` (transport only), `pid` and process start time (incarnation), `emulatorVersion` when known. On a case-insensitive volume also record the directory's device and inode as a tie-breaker. [inf: design suggestion, untested]

**Optional static check of the root ini.** With `android.avd.home` from the content directory's `hardware-qemu.ini` (only if present), confirm `<home>/<avd name>.ini` exists and that its `path.rel` (resolved as `<home>/../<path.rel>`) or `path` resolves to the same directory as Step 5. This ties name, root and content directory end to end without reading environment variables. It cannot be the primary source because `hardware-qemu.ini` is missing for read-only runs (section 7).

**Refusal rules.** Refuse, with zero effects, when: no console answer and no property answer; any two sources disagree on name or on path; Step 1 yields `NO_AVD_INFO`; two live serials resolve to the same content directory and the profile does not allow it; an emulator-looking serial has no AVD evidence at all. Phone serials (not `emulator-`) are out of scope here and keep their own category key.

### Version notes

| Emulator | `avd name` | `avd id`, `avd path`, `avd discoverypath` | Discovery file | Source |
|---|---|---|---|---|
| `emu-29.0-release` | yes (pre-auth) | no | not at the expected path | `console.cpp`, 404 for `EmulatorAdvertisement.cpp` |
| `emu-30-release`, `emu-31-release` | yes | yes | yes (`pid_%d.ini`) | `console.cpp`, `EmulatorAdvertisement.cpp` |
| `emu-33`, `34`, `35-6`, `36-1` release | yes | yes | read at `35-6` and `36-1` (same `pid_%d.ini`); not read at 33 and 34 | `console.cpp` at all four; `EmulatorAdvertisement.cpp` at `35-6` and `emu-master-dev` |
| Installed 36.6.1 [local] | yes | yes (help strings) | `pid_%d.ini`, keys as listed | `strings` on `qemu-system-aarch64` |

The emulator has also been marked deprecated for management tasks in favour of the Android CLI `android emulator list|start|stop` on the developer pages. [doc] That CLI was not evaluated; whether it exposes the content directory is unknown.

## 5. How the recipe handles each aliasing case

| Case | Name alone (`ro.boot.qemu.avd_name`) | Recommended key (realpath of `avd path`) |
|---|---|---|
| Same-named AVD under two roots (`ANDROID_AVD_HOME` differs, or `~/.android` vs a custom root) | Collides | Distinct directories |
| Two ini files naming one content directory | Two identities for one storage | One identity; Step 5 flags the duplicate names as a conflict to record |
| Same AVD run twice with `-read-only` | Collides (also `DEVICE_AMBIGUOUS` today) | Same key, so the authority serialises them; the second instance is told apart only by serial, pid and `-id` |
| Port or serial reused by another emulator | Silent if cached | Re-read per admission; Step 3 pid and start time catch reuse inside one admission |
| Emulator `offline` or not yet booted | Unreadable (driver cannot even tell unauthorized from absent) | Readable through the console |
| Path with symlink or different letter case | n/a | `realpath` plus device and inode |
| AVD directory moved or renamed between runs | Same name, looks continuous | New key; match on name finds an old record at another directory and flags a conflict for the owner rather than adopting it |
| Property missing on the guest | Driver falls back to the serial (identity flips) | Console still answers; refuse if neither does |

## 6. What stays unknown

- No emulator was run, so every console output shape above except the help text is from source. In particular the empty-stdout cases (auth disabled, wrong token) are inferred from `control_global_accept` and the adb skip loop. A single live trial on the pinned emulator should record the exact stdout bytes for: success, token file missing, token file empty, token mismatch, `offline` emulator, and `-read-only` second instance.
- Whether an emulator started with `-port`/`-ports` and no `-grpc` really writes no discovery file. This comes from reading `qemu_android_emulation_setup` and the `-port` rewrite; the `android_op_ports` assignment from `-android-ports` was not traced.
- The time between emulator process start and a listening console port, and the window where `adb devices -l` lists `offline`.
- Whether `emulator` 36.6.1 behaves as the 36.1 source for `ConfigDirs` (the 36.6 source is not public; the binary's strings match). Whether any launcher shim maps `ANDROID_USER_HOME`. A live check: start the same AVD with `ANDROID_USER_HOME` pointing at a different tree and read `avd path`.
- Whether `-id` values are validated against the AVD-name charset.
- Whether `ro.boot.qemu.avd_name` is set on every image the bridge accepts (floor is API 31). The two images here are API 24 and 36.1; neither was booted.
- Behaviour on Linux and Windows hosts (discovery paths, `lsof` availability, console binding). The Phase 2 target is macOS.
- Whether `hardware-qemu.ini` is written for ordinary (not read-only) runs on every version, and why it is absent for read-only ones; observed only.
- The `android emulator` CLI as an alternative source.
- Remote adb servers: a client pointed at another host can show `emulator-N` serials whose console is not on this host's loopback.

## 7. Local observations (this Mac, read-only)

- `emulator -version`: 36.6.1.0 (build 15071280). `emulator -list-avds`: `Medium_Phone_API_36.1`, `beta_api24_small`, `beta_small_phone_360`.
- `~/.android/avd/` has three ini files and three `.avd` directories. `Medium_Phone_API_36.1.ini` has `path=/Users/hugues_mini/.android/avd/Medium_Phone.avd` and `path.rel=avd/Medium_Phone.avd`: name and directory differ. Its `config.ini` has `AvdId=Medium_Phone_API_36.1` and `avd.ini.displayname=Medium Phone API 36.1`, so one AVD carries three different strings.
- `beta_api24_small.avd/config.ini` and `beta_small_phone_360.avd/config.ini` contain `avd.id = <build>` and `avd.name = <build>` (placeholders; `<build>` is the literal an emulator uses as name and id when run inside an Android build, but why these files hold it is unknown). Name fields in `config.ini` are not an identity source.
- `Medium_Phone.avd/hardware-qemu.ini` records `avd.name = Medium_Phone_API_36.1`, `avd.id = Medium_Phone_API_36.1`, `android.avd.home = /Users/hugues_mini/.android/avd` and data paths shaped `/Users/.../avd/../avd/Medium_Phone.avd/...`, which is the non-normalised form that `avd path` simplifies. The two beta AVDs have no `hardware-qemu.ini`; their `emu-launch-params.txt` shows `-avd <name> -port 56xx -read-only -no-window ...`.
- `multiinstance.lock` files are empty (a lock, not a pid record).
- No emulator process was running; the discovery directory did not exist; `ps eww -p $$` printed no environment variables for my own shell.
- Installed emulator `strings`: reads `ANDROID_AVD_HOME`, `ANDROID_EMULATOR_HOME`, `ANDROID_PREFS_ROOT`, `ANDROID_SDK_HOME`, `ANDROID_HOME`, `ANDROID_SDK_ROOT`, `ANDROID_EMULATOR_DISCOVERY_DIR` (not seen in the `ConfigDirs.cpp` I read, so its effect is unknown); `ANDROID_USER_HOME` appears in none of the three binaries checked. Default `advancedFeatures.ini` sets `AndroidbootProps = on` and `AndroidbootProps2 = on`.

## 8. Implications for ticket 03 (Canonical device identity)

Decision input, not a decision:

1. **Emulator identity should be the content directory, not the AVD name.** The AVD name stays an attribute and a lookup hint. This follows the Phase 2 text "Record enough AVD provenance to distinguish ambiguously named/custom-root emulators; refuse unknown or conflicting mappings rather than guess" (`phases/phase-2-ownership.md`, Identity and preflight).
2. **The key needs a category tag and a normalised path.** Suggested shape: `android-emulator:` plus `realpath(avd path)`; `android-phone:` plus the adb serial; existing iOS simulator keys untouched. The serial is never part of the emulator key, which satisfies "emulator transport serial changes cannot create a new device lease". Open for the owner: whether to add `avdId` to the key when `-id` is used, so deliberate clones are distinct devices (a policy choice; the evidence only shows `-id` exists).
3. **Fail closed.** Remove the `avd || name` serial fallback from the contract; "no provenance" is a refusal, not a new identity. A mismatch between sources is a refusal and a quarantine candidate, not a tie-break.
4. **Store fields to reserve (feeds ticket 05).** `category`, `identity` (the key), `avd_name`, `avd_id`, `content_dir_realpath`, `avd_home` (nullable), `emulator_version` (nullable), and, for the current admission only, `serial`, `pid`, `process_start`. Ephemeral transport fields belong to the attempt, not the device row.
5. **Existing Android lease files keyed by AVD name cannot be upgraded by name alone.** The import ("Not yet specified" in the map) must verify against a running emulator or leave the record unmatched. A name-only record can alias with any same-named AVD under another root.
6. **HOME dependence.** Console authentication reads `$HOME/.emulator_console_auth_token` in the bridge's `HOME`, and the discovery file lives under the emulator's `HOME`. The spec's "HOME/cwd/project/temp/path aliases: one production authority" rule applies to the store, but provenance reads are inherently HOME-sensitive. State that a provenance read that fails because the token or discovery directory is in another home is a refusal with a clear reason, not a reason to read another user's files or to copy the token.
7. **Secrets.** Never log, store or pass through `~/.emulator_console_auth_token`, the discovery file or any `grpc.*` value; the bridge should let `adb` do the token read and parse only whitelisted keys.

### Exact changes required in the Phase 2 specification

In `.scratch/appium-mcp-migration/phases/phase-2-ownership.md`, "Identity and preflight":

1. Replace "Resolve ... Android AVD/serial names by bounded read-only inspection" with the Steps 0 to 5 recipe above, naming the console commands, the strict stdout shape and the refusal rules. Say that `ro.boot.qemu.avd_name` is a cross-check, not the identity.
2. Replace "Record enough AVD provenance" with: the recorded provenance is `avd name`, `avd id`, the `realpath` of `avd path`, emulator pid and start time at admission; the canonical emulator key is derived from the path.
3. Add: the discovery file is optional evidence (absent for `-port`/`-ports` launches without `-grpc`), its contents beyond named keys are never read or stored, and `avd discoverypath` is not used.
4. Add: AVD-root environment variables are never used to compute identity (the emulator and the tools resolve them differently); the answer comes from the running emulator.
5. Add a minimum emulator version of 30 for emulator admission, refusing older ones with a named reason, or record explicitly that older emulators are name-only and therefore refused.
6. Add a read-only probe runner requirement: per-command deadline, killable, separate from the effect runner.
7. In "Offline migration contract", add tests that exercise: same-name different-root, two ini files to one directory, read-only second instance, serial reuse between two reads, empty/`KO`/`NO_AVD_INFO` console replies, empty property with a good console, property and console disagreeing, and an `offline` emulator. All can run against a fake adb and a fake console with no real device.
8. Add one live verification for the package that implements this: capture the exact console stdout bytes listed in section 6 on the pinned emulator and keep them as a fixture.

## Sources

Documentation
- Emulator console: https://developer.android.com/studio/run/emulator-console (documents `avd {stop|start|status|name}`, `auth`, `.emulator_console_auth_token`, `adb -s emulator-serial emu command`; does not list `avd path` or `avd id`)
- Emulator command line: https://developer.android.com/studio/run/emulator-commandline (`-avd`, `-list-avds`, `-port`/`-ports`, `-datadir`, `-read-only` not covered, deprecation note)
- Environment variables: https://developer.android.com/studio/command-line/variables (`ANDROID_AVD_HOME`, `ANDROID_USER_HOME`, `ANDROID_EMULATOR_HOME`, `ANDROID_SDK_HOME`; AVD lookup order)
- adb: https://developer.android.com/tools/adb (serial `emulator-5554`, console/adb port pairing, states `offline`/`device`, "does not imply fully booted")
- avdmanager: https://developer.android.com/tools/avdmanager (`-p` custom AVD path; no `.ini` description)

AOSP emulator source (`platform/external/qemu`, pinned to the branch heads read on 2026-10-19)
- `emu-36-1-release` = `9f0811e72acfc46edc39d3d0baedd796f7d03309`: https://android.googlesource.com/platform/external/qemu/+/9f0811e72acfc46edc39d3d0baedd796f7d03309/
  - `android/android-emu/android/console.cpp` (`do_avd_name`, `do_avd_id`, `do_avd_path`, `do_avd_discoverypath`, `vm_commands_preauth`, `do_auth`, `control_global_accept`)
  - `android/emu/avd/src/android/avd/info.c` (`_checkAvdName`, `avdInfo_new`, `_avdInfo_getRootIni`, `_avdInfo_getContentPath`, `avdInfo_getName`, `avdInfo_getId`)
  - `android/emu/files/src/android/emulation/ConfigDirs.cpp` (`getAvdRootDirectory`, `getUserDirectory`, `getDiscoveryDirectory`)
  - `android-qemu2-glue/qemu-setup.cpp` (`qemu_setup_grpc`, discovery properties, `qemu_android_emulation_setup`)
  - `android-qemu2-glue/main.cpp` (`-port` to `-android-ports`)
  - `android/android-emu/android/main-common.c` (`avdInfo_setAvdId` for `-id`)
  - `android/android-emu/android/userspace-boot-properties.cpp` (`avdNameProp`)
  - `android/emu/studio-config/src/android/emulation/control/EmulatorAdvertisement.cpp` (`pid_%d.ini`, liveness, write/remove)
  - `android/emu/telnet/auth/src/android/console_auth.cpp` (token path, disabled/required/error)
  - `android/android-emu/android/snapshot/Snapshot.cpp` (`areHwConfigsEqual`, `fixImport`)
  - `android/android-emu-base/android/base/files/PathUtils.cpp` (`canonicalPath`)
- `emu-31-release` = `a05113abb312051fd462350101097e5e1d542fe3`, `emu-30-release` = `e106d9eeab3c96db145bc5b59188283acdba3df8`, `emu-29.0-release` = `9e4088bf54f2a11dd7898b757c08e2c473315460`, same repository (version comparison of `console.cpp`, `EmulatorAdvertisement.cpp`, `ConfigDirs.cpp`)

AOSP adb (`platform/packages/modules/adb`, `main` at `1cf2f017d312f73b3dc53bda85ef2610e35a80e9`)
- https://android.googlesource.com/platform/packages/modules/adb/+/1cf2f017d312f73b3dc53bda85ef2610e35a80e9/client/console.cpp
- https://android.googlesource.com/platform/packages/modules/adb/+/1cf2f017d312f73b3dc53bda85ef2610e35a80e9/client/commandline.cpp (`emu COMMAND   run emulator console command`)

AOSP init (guest property import)
- https://android.googlesource.com/platform/system/core/+/refs/tags/android-9.0.0_r1/init/init.cpp
- https://android.googlesource.com/platform/system/core/+/refs/tags/android-11.0.0_r1/init/property_service.cpp
- https://android.googlesource.com/platform/system/core/+/refs/tags/android-12.0.0_r1/init/property_service.cpp
- https://android.googlesource.com/platform/system/core/+/refs/heads/main/init/init.cpp (`PropertyInit` before `LoadBootScripts`)

Android tools (Studio and avdmanager location logic)
- https://android.googlesource.com/platform/tools/base/+/refs/heads/mirror-goog-studio-main/common/src/main/java/com/android/prefs/AbstractAndroidLocations.kt

Repository
- Current code: `src/device/android/driver.ts` (`AVD_NAME_PROPERTY`, `resolveDevice`, `identity: avd || name`), `src/device/android/adb.ts` (`adbRunner` never kills on abort)
- Phase 2 text: `.scratch/appium-mcp-migration/phases/phase-2-ownership.md`
- Earlier note on the same property: `docs/research/mobilecli-dependency.md` (mobilecli keys emulators by it; "not unique when two emulators run the same AVD")
