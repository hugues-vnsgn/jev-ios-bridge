# Local environment evidence

Checked 2026-09-24 in the `feat/v0.1-release` worktree.

## Toolchain and key

- Node `v26.8.1`, npm `11.19.0`, Xcode `26.4.1` (`17E202`). The iOS 26.4 simulator runtime is installed.
- The root `.env` contains a nonempty `TYPESAFE_API_KEY`. This was checked as a Boolean with Node's `--env-file`; the value was never displayed or copied. The main release agent authenticated a `GET /v1/models` request and received HTTP 200. Live Jev inference remains untested pending corpus review.
- `mobilebuildmcp@2.7.1` is available from npm and the local npx cache. `MOBILEBUILDMCP_SENTRY_DISABLED=true npx -y mobilebuildmcp@2.7.1 --version` returned `2.7.1`.
- The older Homebrew `xcodebuildmcp` binary is version `2.6.2`; it was not used for setup.

## Dedicated simulator

- Name: `jev-ios-bridge`; UDID: `0E42FDE2-5E09-42D3-9876-9EF0037FCBE7`; device type: iPhone 17 Pro Max; runtime: iOS 26.4.
- `.mobilebuildmcp/config.yaml` pins `sessionDefaults.simulatorId` to this UDID and sets `sentryDisabled: true`.
- The pinned MobileBuildMCP `simulator boot` command succeeded. Its `simulator list --output json` reports this device as `Booted` and available.
- The exact snapshot command is `MOBILEBUILDMCP_SENTRY_DISABLED=true npx -y mobilebuildmcp@2.7.1 ui-automation snapshot-ui --simulator-id 0E42FDE2-5E09-42D3-9876-9EF0037FCBE7 --output json`. Add `--verbose` for the full element list. Run it from this worktree so the project config applies.
- Settings produced a compact snapshot with 142 total elements, 14 targets, one scroll area, and 12 text rows. The full verbose JSON contained 142 elements. Both captures returned `didError: false`.

## Built-in apps

Each successful app was launched using `MOBILEBUILDMCP_SENTRY_DISABLED=true npx -y mobilebuildmcp@2.7.1 simulator launch-app --simulator-id 0E42FDE2-5E09-42D3-9876-9EF0037FCBE7 --bundle-id <bundle-id> --output json`. Captures used the snapshot command above.

| App | Bundle ID tested | Launch | Compact capture |
| --- | --- | --- | --- |
| Settings | `com.apple.Preferences` | Succeeded | 142 elements, 14 targets |
| Contacts | `com.apple.MobileAddressBook` | Succeeded | 94 elements, 11 targets |
| Reminders | `com.apple.reminders` | Succeeded | 97 elements, 4 targets |
| Files | `com.apple.DocumentsApp` | Succeeded | 92 elements, 7 targets |
| Weather | `com.apple.weather` | Failed: MobileBuildMCP reports app not installed | Not captured |

Weather is unavailable under the tested bundle ID on this simulator. The four verified apps are ready for scenarios; a Weather scenario needs an installed app and a verified bundle ID first. No personal apps or physical devices were used.
