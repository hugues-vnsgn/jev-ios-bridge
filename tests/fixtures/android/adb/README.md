# `adb` outputs the Android fakes replay (Issue 14)

Recorded on 2026-09-30 from `jev-actions-api31` (API 31, in `api31/`) and `Medium_Phone_API_36.1` (API 36, in `api36/`), one emulator at a time, headless with `-no-snapshot-save`, through a private adb server on port 5099 (`adb -P 5099 --one-device NO_SUCH_USB_DEVICE start-server`), with `adb -P 5099 devices` checked before every command. Both emulators started as `emulator-5554`. Each file is a command's stdout, unless its name ends in `.stderr.txt`. mobilecli was never run.

`FakeAdb` (`tests/fixtures/android-device.ts`) replays these for the recovery of a recorded pre-Appium owner's components. `ps-adb-sleep-*.txt` is read by `tests/android-adb.test.ts`.

| File | Command (`adb -s <serial> shell …` unless noted) | Exit |
|---|---|---|
| `ps-no-agent.txt` | `ps -A -o PID,NAME,ARGS`, before starting the bridge's agent | 0 |
| `environ-own-agent.bin` | `cat /proc/<pid>/environ` of the bridge's agent (NUL-separated) | 0 |
| `environ-gone.stderr.txt` (API 36) | the same, once the agent is gone | 1 |
| `kill-gone.stderr.txt` (API 36) | `kill <pid>` of an agent already gone | 1 |
| `ps-adb-sleep-running.txt`, `ps-adb-sleep-stopped.txt` (API 36, captured later in P2.8) | `ps -A -o PID,NAME,ARGS` while `sleep 11` runs on the device, and after it stopped | 0 |

## Not recorded live

- **`environ-foreign-agent.bin`** is the bridge agent's recorded environment with mobilecli's own agent put in from the phase 4 tracer (`spikes/benchmarks/results/v1.2.0/tracer/*.jsonl`, step `agents.foreign`): `CLASSPATH=/data/local/tmp/mobilecli.dex`.
