# `adb` outputs the Android driver's fakes replay (Issue 14)

Recorded on 2026-09-30 from `jev-actions-api31` (API 31, in `api31/`) and `Medium_Phone_API_36.1` (API 36, in `api36/`), one emulator at a time, headless with `-no-snapshot-save`, through a private adb server on port 5099 (`adb -P 5099 --one-device NO_SUCH_USB_DEVICE start-server`), with `adb -P 5099 devices` checked before every command. Both emulators started as `emulator-5554`. Each file is a command's stdout, unless its name ends in `.stderr.txt`. mobilecli was never run.

| File | Command (`adb -s <serial> shell …` unless noted) | Exit |
|---|---|---|
| `devices-l.txt` | `adb devices -l` | 0 |
| `getprop-<name>.txt` | `getprop <name>` | 0 |
| `ps-no-agent.txt`, `ps-own-agent.txt` | `ps -A -o PID,NAME,ARGS`, before and after starting the bridge's agent | 0 |
| `environ-own-agent.bin` | `cat /proc/<pid>/environ` of the bridge's agent (NUL-separated) | 0 |
| `environ-gone.stderr.txt` (API 36) | the same, once the agent is gone | 1 |
| `kill-gone.stderr.txt` (API 36) | `kill <pid>` of an agent already gone | 1 |
| `forward-list-empty.txt`, `forward-list-own.txt` | `adb forward --list`, without and with the bridge's forward | 0 |
| `forward-cannot-bind.stderr.txt` (API 36) | `adb -s <serial> forward tcp:<port> localabstract:mobilecli-server` on a port a local process holds | 1 |
| `forward-remove-gone.stderr.txt` (API 36) | `adb -s <serial> forward --remove tcp:<port>` of a forward already removed | 1 |
| `pm-path-settings.txt`, `pm-path-not-installed.txt` | `pm path <package>`, installed and not (empty) | 0, 1 |
| `resolve-launcher-*.txt` | `cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.LAUNCHER <package>`, for Settings, the actions probe app (API 31), and a package that isn't installed | 0 |
| `am-start-W-extras.txt` | `am start -W -n <component> --es note <value>`, every argument single-quoted, the value holding spaces, quotes, `&`, `;` and `%` | 0 |
| `am-start-W-no-activity.txt` | `am start -W -n com.android.settings/.NoSuchActivity` | **0 on API 31**, 1 on API 36 |
| `window-policy-on.txt`, `-off.txt`, `-woken.txt` | `dumpsys window policy`: screen on, after `input keyevent KEYCODE_SLEEP`, and after `input keyevent KEYCODE_WAKEUP` | 0 |

## Not recorded live

- **`window-policy-locked.derived.txt`** is `window-policy-on.txt` with `KeyguardServiceDelegate`'s `showing=` and `mIsShowing=` set to `true`. Both emulators have Screen lock set to None (`cmd lock_settings get-disabled` prints `true`), so no keyguard shows after sleep and wake, and setting a lock would change a device setting.
- **`ps-foreign-agent.txt`** and **`environ-foreign-agent.bin`** are the recorded no-agent listing and the bridge agent's environment, with mobilecli's own agent put in from the phase 4 tracer (`spikes/benchmarks/results/v1.2.0/tracer/*.jsonl`, step `agents.foreign`): pid 4984 (API 31) or 10252 (API 36), `app_process / com.mobilenext.mobilecli.DeviceServer`, `CLASSPATH=/data/local/tmp/mobilecli.dex`.
- **`forward-list-two-emulators.txt`** puts the two recorded forward lines together, the API 31 one on `emulator-5556`: the device rules allow one emulator at a time.

The agent's `device.dump.ui` of empty classic fields is in `../agent/`.
