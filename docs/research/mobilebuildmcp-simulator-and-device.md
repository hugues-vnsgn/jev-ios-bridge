# MobileBuildMCP (formerly XcodeBuildMCP): driving a simulator and a real iPhone

> Written 2026-09-24 against the first draft of the docs, dated 2026-09-21. "Where the repo docs are wrong or stale" cites line numbers in that draft; the rewrite of the same day addresses each row. Ticket references use the names in the [re-charted map](../../.scratch/jev-ios-bridge/map.md).

Researched: 2026-09-24 · Sources:

- **Source code**, `github.com/getsentry/MobileBuildMCP` (the repo was renamed from XcodeBuildMCP on 2026-09-23; the old URL redirects). I cloned HEAD `d13ff0c7` ("Release v2.7.1", 2026-09-23) and read tag `v2.7.0` (`c79f4eb9`, 2026-07-23). `CHANGELOG.md` was read at HEAD.
- **Docs source**, `github.com/getsentry/xcodebuildmcp.com` at `78e43ff` (2026-09-23), under `app/docs/_content/*.mdx`. The site itself is gone: on 2026-09-24, `curl https://www.xcodebuildmcp.com` returned "Could not resolve host".
- **npm registry**, queried 2026-09-24. `xcodebuildmcp` has `latest` 2.7.0, published 2026-07-23, with no deprecation flag. `mobilebuildmcp` has `latest` 2.7.1, published 2026-09-23T20:21Z.
- **Local CLIs**, all run from `/tmp/xbmcp-probe`:
  - `/opt/homebrew/bin/xcodebuildmcp` reports **2.6.2**. It is the Homebrew formula from the `getsentry/xcodebuildmcp` tap.
  - `npx -y xcodebuildmcp@2.7.0`, cached at `~/.npm/_npx/99336612077b7094`. Every live run below used this binary.
  - `npx -y mobilebuildmcp@2.7.1`, used for `tools` and `--version` only.
- **Local Apple tools**: Xcode 26.4.1 (17E202), `xcrun devicectl` 518.27 (its `--help` output), and `xcrun simctl`.
- **AXe**, `github.com/cameroncooke/AXe` at `30f4bfa` (2026-07-20). This is release v1.8.0.
- **Apple Developer Documentation**, fetched 2026-09-24 through the JSON endpoints under `developer.apple.com/tutorials/data/documentation/…`. The pages are undated, but they describe Xcode 27's Device Hub. I used these pages:
  - "Enabling Developer Mode on a device"
  - "Device Hub"
  - "Managing your simulated and physical devices in Device Hub"
  - "Interacting with your app in Device Hub"
  - "Capturing screenshots and videos from devices"
  - "XCUIAutomation"
  - "XCUIScreen"
- **Appium**, fetched 2026-09-24:
  - The XCUITest driver docs pages `getting-started/device-setup` and `getting-started/provisioning-profile/generic-device-config`. The driver is at v12.13.2 (2026-09-23).
  - The `appium/WebDriverAgent` README. WebDriverAgent is at v16.12.10 (2026-09-21).
- **GitHub issue** getsentry/MobileBuildMCP#519, opened 2026-08-26. It is still open and has no maintainer reply.
- **context7**: I tried it first. `/getsentry/xcodebuildmcp` returned nothing for the device question. `/websites/xcodebuildmcp` returned one-line tool stubs from the retired site. Wherever context7 and the source differ, this note follows the source.

Citation keys:

- `src:<path>:<line>` is a line at tag v2.7.0: `https://github.com/getsentry/MobileBuildMCP/blob/v2.7.0/<path>#L<line>`.
- `src@2.7.1:` is the same form at tag v2.7.1.
- `CL:<line>` is a line in `CHANGELOG.md` at v2.7.1.
- `docs:<file>:<line>` is a line in `getsentry/xcodebuildmcp.com@78e43ff/app/docs/_content/<file>`.
- `axe:<file>:<line>` is a line in AXe at `30f4bfa`.
- `$ …` is a command I ran on this machine on 2026-09-24.

## Answer

1. **The project is now MobileBuildMCP.** Version 2.7.1 came out on 2026-09-23. The rename changes the package, the binary, the config directory, the environment variable prefix, and the JSON schema IDs, with no compatibility shim. The old `xcodebuildmcp` package is frozen at 2.7.0. The binary on this machine is 2.6.2, not 2.7.0. MIT license. Maintained under Sentry by Cameron Cooke and, lately, Itay Brenner. **The rename did not change the scope: there is still no Android support.**
2. **Simulator automation matches the planned loop.** `snapshot-ui` returns rs/1, a flat list of elements. Each element has `ref`, `role`, `label`, `value`, `identifier`, `frame`, `state` and `actions`. You then `tap`, `type-text`, `long-press`, `touch` or `drag` an element by `ref`, `swipe` a scroll area by `withinElementRef`, or `wait-for-ui` on a selector. `gesture`, `button`, `key-press` and `key-sequence` take presets or key codes, not refs.
3. **Element refs are short-lived.** Each ref is positional (`e1`, `e2`, … in traversal order) and dies 60 s after capture. It is only valid in the process that took the snapshot: the per-workspace daemon for the CLI, the server process for MCP. Every action takes a fresh snapshot, which replaces the old refs.
4. **The CLI emits JSON.** Every tool accepts `--output json|jsonl`. One Home-screen snapshot costs about 520 tokens as text, about 600 as compact JSON, and about 29,300 as full `--verbose` JSON. Over MCP, `snapshot_ui` never returns the full element list.
5. **AXe comes bundled.** Version 2.7.0 ships AXe 1.8.0, which supports Xcode 26 and 27. AXe drives simulators only.
6. **Verdict on real iPhones: XcodeBuildMCP cannot automate a physical iPhone's UI.** It can build, install, launch, stop and run `xcodebuild test` on a paired device. It has no UI snapshot, tap, type, screenshot, video or runtime-log tool for devices. Driving a real iPhone step by step would need a second device layer, such as WebDriverAgent, Appium, or a custom XCUITest runner.

## Findings

### 1. Version and project health

**The version is not what the brief assumed.**

- `$ /opt/homebrew/bin/xcodebuildmcp --version` prints `2.6.2`. The binary links into `/opt/homebrew/Cellar/xcodebuildmcp/2.6.2/`.
- `$ npm view xcodebuildmcp dist-tags` shows `latest: 2.7.0`.
- `$ npm view mobilebuildmcp version` shows `2.7.1`.
- `$ gh release list -R getsentry/XcodeBuildMCP` lists "Release v2.7.1 Latest 2026-09-23T20:18:31Z". Its release URL is `github.com/getsentry/MobileBuildMCP/releases/tag/v2.7.1`.

**Release cadence**, from the `time` field of `$ npm view xcodebuildmcp time --json`:

| Version | Date |
| --- | --- |
| 2.0.0 | 2026-02-08 |
| 2.1.0 | 02-23 |
| 2.2.0 | 03-07 |
| 2.3.0 | 03-16 (2.3.1 on 03-27, 2.3.2 on 03-31) |
| 2.5.0 | 05-07 (there was no 2.4) |
| 2.6.0 | 06-01 (2.6.1 and 2.6.2 on 06-02) |
| 2.7.0 | 07-23 |
| 2.7.1 | 09-23, as `mobilebuildmcp` |

A minor release came every 2 to 7 weeks until July. `$ git log --since=2026-08-03 --until=2026-09-22` on main is empty: no commits for seven weeks before the rename.

**License and maintainers.**

- The license is MIT (`gh repo view`: `licenseInfo.key = mit`, and `npm view` agrees).
- The npm maintainer is `camsoft <web@cameroncooke.com>`.
- Cameron Cooke is the main committer (185 commits since 2026-03-01, `$ git shortlog -sne`). He also commits as `cameron.cooke@sentry.io`, and his last commit is dated 2026-08-02.
- Itay Brenner (`itay.brenner@sentry.io`) wrote and released 2.7.1.
- The repo has 6,416 stars and 23 open issues.

**Changelog since 2.7.0.**

*2.7.0 (2026-07-23):*

- Xcode 27 Device Hub support for the simulator UI automation tools (`CL:12`).
- Build and test structured results move to schema version 3. This is breaking (`CL:18`).
- An omitted `configuration` now follows the scheme instead of defaulting to Debug. This is breaking (`CL:38`).
- New `purge` command (`CL:61`).
- `extraArgs` can be a session default (`CL:62`).
- Reusable test products: `.xctestproducts` and `.xctestrun` can run without a rebuild (`CL:63`).
- The MCP startup delay of 10 to 17 s is fixed (`CL:67`).
- Fixes for concurrent operations and physical-device name lookup (`CL:71`).
- The bundled AXe moves to 1.8.0 (`.axe-version`, commit `7cd7d5af`).

*2.7.1 (2026-09-23), the rename (`CL:7`):*

- npm package: `mobilebuildmcp`.
- Binaries: `mobilebuildmcp` and `mobilebuildmcp-doctor`.
- Homebrew formula: `mobilebuildmcp`, still served from the `getsentry/xcodebuildmcp` tap.
- Environment variables: `MOBILEBUILDMCP_*`.
- Resource URIs: `mobilebuildmcp://`.
- Schema IDs: `mobilebuildmcp.output.*`.
- Project config: `.mobilebuildmcp/config.yaml` (`src@2.7.1:src/utils/project-config.ts:13`; it was `.xcodebuildmcp` at `src:…:13`).
- State directory: `~/Library/Developer/MobileBuildMCP`.
- Daemon socket directory: `$TMPDIR/mobilebuildmcp-<hash>/` (`src@2.7.1:src/daemon/socket-path.ts:30`).
- MCP registry name: `io.github.getsentry/mobilebuildmcp`.
- The `xcodebuildmcp.com` domain is retired.
- One more change in 2.7.1: dictionary inputs over MCP (`env`, `testRunnerEnv`) become arrays of `{key, value}` (`CL:8`).

**What the rename did not change:**

- **Tool names are unchanged.** `$ diff` of `xcodebuildmcp@2.7.0 tools` against `mobilebuildmcp@2.7.1 tools` shows only four reworded descriptions. `git diff v2.7.0 v2.7.1 -- manifests` changes only `schema:` IDs and descriptions; no `names:` line changes.
- **There is no backward compatibility.** At v2.7.1, `src/` contains no reader for `.xcodebuildmcp/` or `XCODEBUILDMCP_*`: a grep for `xcodebuildmcp` hits only a docs link in `src/server/server.ts` and `src/utils/template-manager.ts`. PR #538 says "Existing users must update their install and configuration, so this is a breaking change."
- **The scope did not grow.** No workflow manifest lists Android. The only "android" strings in the tree are Xcode's `AVAILABLE_PLATFORMS` inside snapshot-test fixtures. The repo description still reads "tools for agent use when working on iOS and macOS projects". PR #538 gives no reason for the "Mobile" name.
- **Nothing changed for snapshot-ui, element refs, AXe or physical devices.** `git diff v2.7.0 v2.7.1 -- src/mcp/tools/ui-automation src/types/ui-snapshot.ts .axe-version` changes only the schema ID constants (`shared/domain-result.ts`) and the runtime env var name (`screenshot.ts`). The device diff adds only the MCP `env` wire format to `build_run_device`, `launch_app_device` and `test_device`.

### 2. Tool inventory

Commands run:

- `$ xcodebuildmcp tools` (2.6.2) and `$ npx -y xcodebuildmcp@2.7.0 tools` both print "Available tools (72 canonical, 100 total)" across 12 CLI workflows. 2.7.1 prints the same.
- `$ … tools --json` gives the same data with a `stateful` flag per tool.
- The `manifests/tools/` directory holds 82 tool manifests. That is the 72 CLI tools plus 10 MCP-only tools.
- The "100 total" counts tools once per workflow, and shared tools such as `clean` appear in several workflows.
- There is no longer a `logging` workflow: 2.5.0 removed it (`CL:145`).

Key: **S** = simulator only. **D** = physical device only. **H** = host-side (project files, xcresult bundles, macOS). The `[stateful]` tag comes from the CLI output: those tools run in the daemon.

| Workflow (CLI) | CLI tool → MCP name | Target |
| --- | --- | --- |
| simulator | `list`→`list_sims`, `boot`→`boot_sim`, `open`→`open_sim`, `build`→`build_sim`, `build-and-run`→`build_run_sim`, `test`→`test_sim`, `get-app-path`→`get_sim_app_path`, `install`→`install_app_sim`, `launch-app`→`launch_app_sim`, `stop`→`stop_app_sim`, `record-video [stateful]`→`record_sim_video`, `screenshot`, `snapshot-ui [stateful]` | S |
| simulator (shared) | `clean`, `discover-projects`, `list-schemes`, `show-build-settings`, `get-app-bundle-id`, `get-coverage-report`, `get-file-coverage` | H |
| simulator-management | `boot`, `list`, `open`, `erase`, `set-location`, `reset-location`, `set-appearance`, `statusbar`, `toggle-software-keyboard`, `toggle-connect-hardware-keyboard` | S |
| device | `list`→`list_devices`, `build`→`build_device`, `build-and-run`→`build_run_device`, `test`→`test_device`, `install`→`install_app_device`, `launch`→`launch_app_device`, `stop`→`stop_app_device`, `get-app-path`→`get_device_app_path` | D |
| device (shared) | `clean`, `discover-projects`, `list-schemes`, `show-build-settings`, `get-app-bundle-id`, coverage ×2 | H |
| ui-automation | `snapshot-ui`, `wait-for-ui`, `batch`, `tap`, `touch`, `long-press`, `swipe`, `drag`, `gesture`, `button`, `key-press`, `key-sequence`, `type-text` (all `[stateful]`), plus `screenshot` | S |
| debugging | `attach`→`debug_attach_sim`, plus `add-breakpoint`, `remove-breakpoint`, `continue`, `detach`, `lldb-command`, `stack`, `variables` (all `[stateful]`) | S |
| macos | build, build-and-run, test, launch, stop, get-app-path, get-macos-bundle-id, and shared tools (13) | H (Mac) |
| swift-package | build, test, clean, `run [stateful]`, `stop [stateful]`, `list [stateful]`, coverage ×2 | H |
| project-discovery / project-scaffolding / utilities / coverage | discover, schemes, build settings, bundle ids / `scaffold-ios`, `scaffold-macos` / `clean` / coverage ×2 | H |
| xcode-ide | `list-tools`, `call-tool` (both `[stateful]`), which proxy Xcode's own MCP bridge | H |
| *MCP only* | `session_show_defaults`, `session_set_defaults`, `session_clear_defaults`, `session_use_defaults_profile`, `sync_xcode_defaults`, `manage_workflows` (experimental), `doctor` (debug only), `xcode_tools_bridge_status`, `xcode_tools_bridge_sync`, `xcode_tools_bridge_disconnect` | H |

**Evidence that ui-automation is simulator-only.**

- The workflow's own description reads "UI automation and accessibility testing tools for iOS simulators" (`manifests/workflows/ui-automation.yaml:3`), with `targetPlatforms: [iOS]`.
- Every ui-automation tool schema requires `simulatorId: z.uuid(...)`. See `src:src/mcp/tools/ui-automation/tap.ts:40` and `snapshot_ui.ts:36`.
- `$ … ui-automation <tool> --help` lists `--simulator-id` and no device flag for every tool.

**MCP defaults.** Out of the box, the MCP server exposes only the `simulator` workflow plus session management.

- `docs:workflows.mdx:14` says so.
- My probe confirmed it. An MCP stdio session against 2.7.0 returned 24 tools with no `XCODEBUILDMCP_ENABLED_WORKFLOWS` set. With `simulator,ui-automation,device` set, it returned 44 tools, `tap` and `type_text` among them.
- The CLI never gates tools by workflow (`docs:workflows.mdx`, the "The CLI is different" callout).

### 3. UI automation

**Snapshot format (rs/1).** The public payload is defined at `src:src/types/ui-snapshot.ts:51`. Its fields:

- `type: "runtime-snapshot"`, `protocol: "rs/1"`.
- `simulatorId`, `screenHash`, `seq`.
- `capturedAtMs`, `expiresAtMs`.
- `elements[]` and `actions[]`.

Each element (`ui-snapshot.ts:34`) has these fields:

- `ref`, such as `"e117"`.
- `role`, one of `application`, `window`, `button`, `cell`, `image`, `keyboard-key`, `list`, `menu`, `other`, `scroll-view`, `slider`, `switch`, `tab`, `text`, `text-field`.
- `label`, `value` and `identifier`, each optional.
- `frame`: `{x, y, width, height}` in points.
- `state`: `{enabled, visible, focused?, selected?}`.
- `actions`: a subset of `tap`, `typeText`, `longPress`, `touch` and `swipeWithin`.

`actions[]` at the top level repeats `{action, elementRef, label?}` for each element action. There is **no `hittable` field**.

**There is no nesting.** The builder flattens the AX tree depth-first (`runtime-snapshot.ts:589`). Tree position (`path`, `depth`, `childCount`) stays in private metadata and is never published (`ui-snapshot.ts:71`). The docs confirm this: "Do not include raw AX nodes in public output, even in verbose mode" (`docs:architecture-ui-automation.mdx`, "Render public output").

**Element reference lifetime.**

- *How refs are assigned.* The code is `` const ref = `e${index + 1}` `` in traversal order (`runtime-snapshot.ts:269`). So a ref is positional: the same element gets a different ref whenever anything before it in the tree appears or disappears.
- *Time to live.* It is 60 s: `RUNTIME_SNAPSHOT_TTL_MS = 60_000` (`runtime-snapshot.ts:14`). An expired lookup deletes the snapshot and returns `SNAPSHOT_EXPIRED` (`snapshot-ui-state.ts:108`).
  - I tested this locally: snapshot, `sleep 62`, then `wait-for-ui --element-ref e117`. The result was `{"code":"SNAPSHOT_EXPIRED", …, "snapshotAgeMs":62963}`.
- *Process scope.* The source comment reads "Runtime element refs are process/session-scoped handles, not durable cross-process IDs … separate MCP, daemon, and CLI runtimes cannot consume each other's refs" (`snapshot-ui-state.ts:10`). I tested this locally too:
  - After a `snapshot-ui` in workspace `/tmp/xbmcp-probe`, a second CLI process in the same workspace resolved `e117` → `Settings` through the daemon.
  - The same call from `/tmp/xbmcp-probe2` returned `SNAPSHOT_MISSING`.
- *Across taps.* Every successful action clears the stored snapshot (`tap.ts:138`). The action then polls `describe-ui` for up to 2.5 s until the screen settles (`post-action-snapshot.ts:16`). It records that capture as the new current snapshot with a new `seq`, and returns it in the action result (`tap.ts:161`).
  - Refs from before the tap are therefore gone. If the screen didn't change, the same `eN` happens to point at the same element again. That is why the `tap` description says "Other same-screen refs may remain usable after success" (`manifests/tools/tap.yaml`).
  - The docs rule is "Refs are only stable within the current snapshot sequence" (`docs:architecture-ui-automation.mdx:163`). The 2.6.0 changelog's "stable element references" (`CL:103`) means deterministic numbering, not durable identity.
- *Screen hash.* `screenHash` hashes all elements, including the status-bar clock. Two snapshots of the unchanged Home screen one minute apart hashed to `0p6c8jd` and then `03gp7qo`, and the only difference was `e210`, whose label went from "9:43 AM" to "9:44 AM". So `sinceScreenHash` can only skip a snapshot within the same minute.
- *Serialization.* Actions on one simulator are queued inside a single process (`withSimulatorUiAutomationTransaction`, `snapshot-ui-state.ts:16`). Nothing serializes across processes.

**How each action is addressed.** The flags below are from `$ npx -y xcodebuildmcp@2.7.0 ui-automation <tool> --help`.

| Tool | Addressed by | Other arguments |
| --- | --- | --- |
| `tap` | `--element-ref` (the ref must list `tap`) | `--pre-delay`, `--post-delay` in seconds, max 10 |
| `type-text` | `--element-ref`, which it taps to focus first | `--text`, `--replace-existing`. Only US-keyboard characters are allowed: "AXe type supports US keyboard characters only" (`type_text.ts:45`) |
| `long-press` | `--element-ref` | `--duration` |
| `touch` | `--element-ref` | down/up events |
| `swipe` | `--within-element-ref`, which must list `swipeWithin` | `--direction up\|down\|left\|right`, `--distance` (0-1 of the safe stroke), `--duration` |
| `drag` | `--element-ref` | `--direction`, `--distance`, `--steps` |
| `batch` | a `steps` array, such as `[{"action":"tap","elementRef":"e1"},…]` | for several taps on the same screen |
| `gesture` | `--preset`, one of `scroll-up\|down\|left\|right` or `swipe-from-left\|right\|top\|bottom-edge` | optional screen size, duration, delta. Takes no ref |
| `button` | `--button-type`, one of `apple-pay\|home\|lock\|side-button\|siri` | takes no ref |
| `key-press` / `key-sequence` | `--key-code`, an AXe HID key code (40 is Return, 42 is Backspace) | takes no ref |

A `tap` goes through an AXe selector when the element's `identifier`, `label` or `value` is unique on screen. Otherwise it taps the element's activation point, which is inside the viewport and on the trailing edge for switches (`shared/semantic-tap.ts`; `docs:architecture-ui-automation.mdx`, "Visibility and activation points").

**`wait-for-ui` selector syntax** (`wait_for_ui.ts:50-110`, `shared/wait-predicate.ts`). The flags are:

- `--predicate`, one of `exists`, `gone`, `enabled`, `focused`, `textContains`, `settled`.
- Selector fields: `--element-ref`, `--identifier`, `--label`, `--role`, `--value`.
- `--text`.
- `--timeout-ms` (default 5000), `--poll-interval-ms` (default 250), `--settled-duration-ms` (default 500).

The rules:

- **Exact match.** Selector fields match exact strings and combine with AND (`matchSelector`, `wait-predicate.ts:202`).
- **Refs resolve to selectors.** An `--element-ref` is turned into a selector from the stored snapshot: `identifier` if it has one, otherwise `label`+`role`, otherwise `value`+`role` (`wait-predicate.ts:170`).
- **Text search.** `textContains` needs `--text` and no selector. It lowercases and normalizes whitespace, then searches `label` and `value` (`wait-predicate.ts:81`). It does **not** check `state.visible`, so it cannot tell visible text from off-screen text.
- **Ambiguity.** If two elements match with different text, the result is `TARGET_AMBIGUOUS`.
- **Negative waits.** `gone` accepts `--text`.
- **Settling.** `settled` waits until the element signatures stop changing.
- **Can it express "a label containing X is visible"?** Partly: `--predicate textContains --text X` covers "containing". Nothing covers "visible".

Tested: `$ … wait-for-ui --predicate textContains --text settin` matched `e117|tap|button|Settings||Settings`.

**Screenshot** (`screenshot.ts`). The tool works in these steps:

1. It checks that the simulator is `Booted`.
2. It runs `xcrun simctl io <udid> screenshot <png>` (`:241`).
3. It rotates the image if the Simulator window is landscape.
4. It re-encodes with `sips -Z 800 -s format jpeg -s formatOptions 75` (`:270`), which caps the longest side at 800 px, and deletes the PNG.
5. The CLI returns a file path, while MCP defaults to inline base64 (`:234`).

On failure it falls back to the original PNG. It takes `--simulator-id` and `--return-format path|base64`.

**Live sample.** This was read-only: one booted simulator "OPS iPhone", iOS 18.6, UDID `83BA9271-…`, on the Home screen, captured with `xcodebuildmcp@2.7.0` from `/tmp/xbmcp-probe`. The screen holds only Apple's stock apps and no personal text, so I saved it raw.

- Default text: `$ … ui-automation snapshot-ui --simulator-id 83BA9271-FC57-4D5B-81CF-DD1385DD99B7`. Saved verbatim to `docs/research/assets/snapshot-sample.txt`.
- Full JSON: the same command with `--output json --verbose`. Saved verbatim to `docs/research/assets/snapshot-sample-verbose.json`.

Snapshot sizes:

| Form | Characters | ≈ tokens (÷4) | Contents |
| --- | ---: | ---: | --- |
| CLI text (default) | 2,079 | 520 | 17 target rows and 3 scroll rows (`ref\|action\|role\|label\|value\|id`), tips, 5 next-step commands. Text rows are omitted |
| CLI text `--style minimal` | 1,252 | 313 | the same without the next steps |
| CLI `--output json` (compact) | 2,407 | 600 | envelope; `capture` has `type`, `rs`, `screenHash`, `seq`, `count: 219`, `targets[17]`, `scroll[3]`, `text[2]`, `udid`; `nextSteps[5]` |
| MCP `snapshot_ui` text content / `structuredContent` | 1,897 / 1,900 | 475 each | same compact projection; next steps as MCP call hints |
| CLI `--output json --verbose`, pretty | 117,250 | 29,300 | all 219 elements plus 368 action hints |
| … the same, minified | 52,772 | 13,200 | elements alone are 34,976 chars (≈ 160 per element) |

Composition of the 219 elements:

- By role: 164 `other`, 22 `image`, 21 `button`, 6 `slider`, 2 `scroll-view`, 2 `text`, 1 `text-field`, 1 `application`.
- 199 are visible.
- 50 carry a label, value or identifier.
- 17 advertise `tap` or `typeText`.

The compact projection caps output at 64 targets, 32 scroll areas and 64 text rows (`ui-snapshot.ts:6`, `structured-output-envelope.ts:51`). It drops frames, state and the `longPress`/`touch` actions (`toRuntimeSnapshotCompactCapture`, `:230`). **The MCP `snapshot_ui` schema has no verbose option (`snapshot_ui.ts:36`), so an MCP client never receives frames or full state. Only the CLI can return them, with `--output json --verbose`.**

Timings, on warm runs unless noted:

- CLI `snapshot-ui`: 1.38-1.41 s, or 2.08 s when it also auto-starts the daemon.
- CLI `screenshot`: 1.9-2.7 s.
- CLI startup alone (`--version`): 0.45 s.
- MCP `snapshot_ui` over stdio: 0.71-0.75 s.

The screenshot (`$ … ui-automation screenshot --simulator-id … --output json`) came back as `{"format":"image/jpeg","width":369,"height":800}` with the file in `$TMPDIR` at 52,460 bytes, about 70,000 characters in base64. I deleted it afterwards, because the Maps widget in it shows a map region.

### 4. The automation backend (AXe)

**It is bundled; there is no separate install.**

- The Homebrew 2.6.2 install has `libexec/bundled/axe` with `FBControlCore`, `FBDeviceControl` and `FBSimulatorControl` frameworks beside it. `$ DYLD_FRAMEWORK_PATH=… bundled/axe --version` prints `1.7.1`.
- The npm 2.7.0 package's `bundled/axe --version` prints `1.8.0`. The pin is in `.axe-version`, `1.8.0` at both v2.7.0 and v2.7.1.
- Lookup order (`src/utils/axe-helpers.ts:107`):
  1. an explicit path (`axePath`, `XCODEBUILDMCP_AXE_PATH`);
  2. an `axeSourcePath` checkout;
  3. the bundled binary;
  4. `PATH`.
- `$ which axe` finds nothing, and that is expected.
- `$ node …/xcodebuildmcp/build/doctor-cli.js` reports "axe: 1.8.0 … UI Automation Supported: Yes".

**It supports Xcode 26 and iOS 26.**

- The README says "AXe supports Xcode 26 and Xcode 27" and "Compatibility was validated with Xcode 26.5 (build `17F42`) and iOS 26.5 … and with Xcode 27 Beta 3 … iOS 27" (`axe:README.md:30,32`).
- Under Xcode 27 it uses Device Hub instead of Simulator.app (v1.8.0 changelog, `axe:CHANGELOG.md:8`).
- On this machine, Xcode 26.4.1 with an iOS 18.6 runtime, `describe-ui` worked.
- AXe drives simulators only. The README calls it "a comprehensive CLI tool for interacting with iOS Simulators" (`axe:README.md:3`).
- AXe is built on IDB, compiled from a pinned fork (`axe:README.md:34`).

### 5. Physical iPhones

**Tool coverage** (source: `manifests/workflows/device.yaml`, `src/utils/device-steps.ts`, `src/mcp/tools/device/*`):

| Capability | Simulator | Physical device | How XcodeBuildMCP does it |
| --- | --- | --- | --- |
| List | `list_sims` | `list_devices` | `simctl list` / `devicectl list devices --json-output` (`list_devices.ts:148`), with an `xctrace` fallback |
| Build | `build_sim` | `build_device` | `xcodebuild` |
| Build + install + launch | `build_run_sim` | `build_run_device` | `xcodebuild` + simctl / devicectl |
| Install | `install_app_sim` | `install_app_device` | `devicectl device install app --device <id> <app>` (`device-steps.ts:25`) |
| Launch | `launch_app_sim` (bundle id) | `launch_app_device` (bundle id; returns pid) | `devicectl device process launch --json-output … --terminate-existing` (`device-steps.ts:48-58`) |
| Stop | `stop_app_sim` (bundle id) | `stop_app_device` (**pid**) | `simctl terminate` / `devicectl device process terminate --pid` |
| Runtime logs | automatic on launch | **none** | the device launch has no `--console`; results carry `buildLogPath` and `processId` only (`build_run_device.ts`) |
| `xcodebuild test`, xcresult | `test_sim` | `test_device` | `xcodebuild test`; accepts `--test-products-path` / `--xctestrun-path` |
| Screenshot | `screenshot` | **none** | `simctl io` |
| UI snapshot | `snapshot_ui` | **none** | AXe `describe-ui` |
| Tap, type, swipe, gestures | yes | **none** | AXe |
| Video | `record_sim_video` | **none** | AXe `record-video` |
| LLDB | `debug_attach_sim` | **none** | |
| Boot, erase, location, appearance, status bar | yes | n/a | simctl |

The docs page for devices states the same limits: "Build, install, launch, test on paired devices once signing is configured ✓" (`docs:device-signing.mdx:25`). Issue #519 (2026-08-26, open) says the same: "`ui-automation` is simulator-only by design … has no input or capture tools".

**The paired devices here**, from a read-only `$ … device list --output json` with identifiers redacted:

- An `iPhone17,2` on iOS 26.6.1 is reported `state: connected, isAvailable: true`. `devicectl` reports it as `transport localNetwork`, `tunnelState disconnected`, `developerModeStatus enabled`.
- An `iPhone14,3` on iOS 26.2 is `unavailable`.

I sent no commands to either device.

**Documented alternatives for device UI automation:**

- **XCUITest through `test_device`.** Apple's XCUIAutomation framework is how UI tests "control your app's user interface and inspect its state" (Apple, "XCUIAutomation"), and `XCUIScreen.main.screenshot()` captures the screen (Apple, "XCUIScreen"). XcodeBuildMCP runs UI test targets on a device through `xcodebuild test`, and since 2.7.0 it can reuse prebuilt test products (`CL:63`). This runs written tests end to end. It does not give per-step outside control.
- **WebDriverAgent / Appium XCUITest driver.** "WebDriverAgent is a WebDriver server implementation for iOS that can be used to remote control iOS devices … tap & scroll views or confirm view presence … by linking `XCTest.framework`" (appium/WebDriverAgent README). It is a long-running runner on the device that answers HTTP. Appium's device setup requires:
  - "Developer Mode enabled (iOS/iPadOS 16+ only)";
  - "UI Automation must be enabled: Settings -> Developer -> Turn Enable UI Automation ON";
  - "The WDA application must have a valid provisioning profile".
  
  Signing a wildcard profile "require[s] a paid Apple Developer account". With a free account, "you may need to update the bundle id". I did not test WDA on iOS 26.6 with Xcode 26.4.1.
- **`devicectl` in Xcode 26.4.1.** `$ xcrun devicectl device --help` lists `copy`, `info`, `install`, `notification`, `orientation`, `process`, `reboot`, `sysdiagnose` and `uninstall`. There is no screenshot, input or UI-tree verb. `device process launch` has `--console` (stdout/stderr), and `device info` has `displays` and `lockState`.
- **Xcode 27 Device Hub.** It shows a physical device's screen for interactive use ("For physical devices, you can interact with the view in Device Hub and the physical device simultaneously"; Apple, "Device Hub"). It also takes full-resolution screenshots from the GUI (Apple, "Capturing screenshots and videos from devices"). Video recording is documented for simulators only. None of this is scriptable in the docs I read.
- **pymobiledevice3 CoreDevice HID** (issue #519, third party). Its claims:
  - Taps and swipes would go through `pymobiledevice3 developer core-device universal-hid-service tap`, with coordinates normalized to UInt16.
  - `devicectl device capture screenshot` works in the Xcode 27 beta.
  - "There's no device equivalent of `snapshot_ui`, so device automation would be screenshot-driven only".
  
  No maintainer has replied. I could not verify any of it, and Xcode 26.4.1's `devicectl` has no `capture` verb.

**Setup a real device needs:**

- **Pairing.** Pair and trust the Mac: plug in by cable, tap "Trust", then pair. In Xcode 26 this is Window → Devices and Simulators (`docs:device-signing.mdx`); Xcode 27 uses Device Hub. After the first cable pairing, runs can go over Wi-Fi. Wireless-only pairing needs iOS 27 (Apple, "Managing your simulated and physical devices in Device Hub"). "If you upgrade the operating system later, you'll need to pair the device again" (same page).
- **Developer Mode.** Turn it on under Settings → Privacy & Security → Developer Mode, then restart and confirm with the passcode. Without it, "you can't run apps from Xcode on the device" (Apple, "Enabling Developer Mode on a device").
- **Signing.** In Xcode, set automatic signing, a development team and a valid provisioning profile, once per project. XcodeBuildMCP "cannot configure code signing automatically", and it cannot create profiles or enroll a team (`docs:device-signing.mdx:12-28`).
- **Any XCUITest or WDA runner**, in addition: a signed runner app and "Enable UI Automation" in Settings → Developer (Appium docs above).

### 6. Running modes

**MCP stdio server versus CLI.** `xcodebuildmcp mcp` (`mobilebuildmcp mcp` in 2.7.1) keeps all state in its own process: session defaults, the snapshot store, video and debug sessions (`docs:cli.mdx`, "CLI vs MCP mode"). The CLI runs stateless tools directly. It routes every `[stateful]` tool, which includes all of `ui-automation` except `screenshot`, to a daemon for the current workspace.

A catch for MCP clients: session defaults are on by default, and in that mode the MCP tool schemas **leave out `simulatorId`**. I passed `{simulatorId}` straight to `snapshot_ui` over MCP and got "Missing required session defaults: simulatorId is required". It worked only after `session_set_defaults {simulatorId}`, which is in-memory unless `persist: true`. Setting `disableSessionDefaults` restores explicit arguments (`docs:session-defaults.mdx`, "Opting out").

**The daemon** (`docs:architecture-daemon.mdx`; source files cited below):

- *State it holds:* the runtime snapshot store and per-simulator UI queue, video recordings, LLDB sessions, background SwiftPM runs, and the Xcode IDE bridge.
- *Scope:* one daemon per workspace. The workspace root is the location of `.xcodebuildmcp/config.yaml` if one exists, otherwise the current directory.
- *Where its files live* (from `$ … daemon status` on 2.7.0):
  - Socket: `$TMPDIR/xcodebuildmcp-<hash>/d.sock` (`src/daemon/socket-path.ts:30`).
  - Registry: `~/Library/Developer/XcodeBuildMCP/workspaces/<name>-<hash>/state/daemon/daemon.json`.
  - Log: `…/logs/daemon.log`.
- *Lifecycle:*
  - It starts automatically on the first stateful call and must come up within 5 s (`src/cli/daemon-control.ts:18,201`).
  - It shuts down after 10 minutes idle (`src/daemon/idle-shutdown.ts:5`, `XCODEBUILDMCP_DAEMON_IDLE_TIMEOUT_MS`), and only when no request is in flight and no session is active.
  - If the CLI and daemon versions differ, the CLI force-stops the daemon and restarts it (`daemon-control.ts:201-216`).
- *Crash recovery:* the next stateful call gets ECONNREFUSED or ENOENT, starts a new daemon, and that daemon removes the stale socket (`src/daemon.ts:211`). Everything in memory is lost: refs, recordings and debug sessions. Manual commands are `daemon status|start|stop|restart|list [--json]|logs [--tail N]` and `daemon start --foreground`.
- *Cleanup of this research:* after the probes I stopped the two daemons I had started. `$ … daemon list` then printed "No daemons found".

**Config.** Project config lives in `.xcodebuildmcp/config.yaml` (`.mobilebuildmcp/config.yaml` from 2.7.1), with `schemaVersion: 1` (`config.example.yaml`). It holds:

- `enabledWorkflows` and `customWorkflows`;
- `sessionDefaults`: `projectPath` or `workspacePath`, `scheme`, `configuration`, `simulatorName` or `simulatorId`, `deviceId`, `platform`, `bundleId`, `derivedDataPath`, `extraArgs`, `useLatestOS`, `arch`;
- `sessionDefaultsProfiles` with `activeSessionDefaultsProfile`;
- `sentryDisabled` and `debug`.

To pin a simulator and bundle id per repo, set `sessionDefaults.simulatorId` and `sessionDefaults.bundleId`. The CLI fills matching flags from them, and `--profile` overrides for one call (`docs:session-defaults.mdx`). Precedence runs `session_set_defaults` > `config.yaml` > environment (`docs:env-vars.mdx`, "Precedence").

**Environment variables.**

- `XCODEBUILDMCP_ENABLED_WORKFLOWS` (comma-separated) controls workflow enablement for MCP.
- Session defaults can be seeded with `XCODEBUILDMCP_SIMULATOR_ID`, `…_BUNDLE_ID`, `…_DEVICE_ID`, `…_SCHEME` and so on.
- `XCODEBUILDMCP_CWD` sets the workspace root when the host cannot choose the spawn directory.
- `XCODEBUILDMCP_HEADLESS_LAUNCH=1` keeps the Simulator window from taking focus (`CL:111`).
- `XCODEBUILDMCP_SENTRY_DISABLED=true` turns off Sentry error telemetry, which is on by default (`docs:privacy.mdx`).

In 2.7.1 every one of these becomes `MOBILEBUILDMCP_*` (for example `src@2.7.1:src/utils/config-store.ts:193`).

**Output formats.**

- Every CLI tool takes `--output text|json|jsonl|raw` (since 2.5.0, `CL:252`; `docs:output-formats.mdx`).
  - `json` returns one envelope: `{schema, schemaVersion, didError, error, data, nextSteps?}`.
  - `jsonl` streams progress events and has no final envelope.
- `--style minimal` removes `data.request` and the header text.
- `--verbose` returns full snapshot elements (`docs:output-formats.mdx:158`).
- `tools --json` and `daemon list --json` also emit JSON.
- The schema IDs are `xcodebuildmcp.output.<name>` up to 2.7.0 and `mobilebuildmcp.output.<name>` in 2.7.1. JSON Schemas are in `schemas/structured-output/`.
- So nothing needs text parsing. Verified live: `simulator list`, `device list`, `snapshot-ui`, `wait-for-ui` and `screenshot` all returned valid JSON envelopes.

### 7. Logs and observability inventory (facts for the watch panel)

| What | Tool | Form | Where / notes |
| --- | --- | --- | --- |
| Build log | every build, build-and-run and test tool | file path `data.artifacts.buildLogPath`; live progress over `--output jsonl` (events such as `build-result.build-stage`) | `~/Library/Developer/XcodeBuildMCP/workspaces/<key>/logs/` (2.7.0) |
| App stdout/stderr, simulator | automatic in `launch_app_sim` and `build_run_sim` | file path `runtimeLogPath` | `simctl launch --console-pty --terminate-running-process`, run detached, writing to the file (`src/utils/simulator-steps.ts:220`) |
| App OSLog, simulator | automatic, as above | file path `osLogPath` | `simctl spawn <udid> log stream --level=debug --predicate 'subsystem == "<bundleId>"'` (`simulator-steps.ts:387`); only exact-subsystem `Logger` output. It stops when the app stops or the server shuts down (`CL:309`) |
| Device app logs | none | none | the start/stop log-capture tools were removed in 2.5.0 (`CL:145`); `devicectl device process launch --console` exists outside XcodeBuildMCP |
| Video, simulator | `record_sim_video` / `simulator record-video --start` … `--stop --output-file x.mp4`, with `--fps` (default 30) | MP4 file; the recording session lives in the daemon | AXe `record-video --udid` (`src/utils/video_capture.ts:186`) |
| Screenshot, simulator | `screenshot` | JPEG, longest side 800 px, quality 75; path (CLI) or base64 (MCP) | see §3 |
| UI state | `snapshot_ui`, `wait_for_ui`, and every UI action result | rs/1 JSON, compact or verbose | see §3 |
| Tests | `test_sim` / `test_device` | `test-result` v3: `data.summary` (status, counts, durationMs), `data.testCases[]` (`suite`, `test`, `status`, `durationMs`), failures, `artifacts.xcresultPath`; live `jsonl` progress | default result bundles since 2.5.0 (`CL:299`); coverage from the xcresult through `get-coverage-report` and `get-file-coverage` |
| Daemon | `daemon logs`, `daemon status` | text | `…/logs/daemon.log` |
| MCP resources | `xcodebuildmcp://simulators`, `…://devices`, `…://session-status`, `…://doctor` | text / JSON | subscriptions are advertised, but "Current source does not emit runtime resource update … notifications" (`docs:mcp-protocol-support.mdx`, "Resources") |

### 8. Intended use with coding agents

- **Agent skills.** `xcodebuildmcp init` installs a skill for Claude Code, Cursor or Codex, choosing the directory for each. `--skill cli` is the default and `--skill mcp` is the alternative. `--print` writes the skill to stdout (`docs:skills.mdx:9-20`).
  - The skill sources are `skills/mobilebuildmcp-cli/SKILL.md` (64 lines) and `skills/mobilebuildmcp/SKILL.md` (41 lines).
  - The CLI skill says: prefer the tool over raw `xcodebuild`, `simctl` or `xcrun`; discover commands with `--help` and `tools`; prefer `build-and-run`; check session defaults before a first build.
- **MCP server instructions.** Claude Code receives these instead of the MCP skill. They say to call `session_show_defaults` before the first build, then `build_run_sim`, and never to boot or open the simulator as a separate step (`src/server/server.ts:33-54`).
- **Client setup.** The docs give:
  - Claude Code: `claude mcp add XcodeBuildMCP -- npx -y xcodebuildmcp@latest mcp` (`docs:clients.mdx:102`).
  - Codex: `codex mcp add …` or `~/.codex/config.toml` with `tool_timeout_sec = 600` inside the server table (`docs:clients.mdx:147-167`).
  - Xcode's in-IDE Codex and Claude agents.
  
  The v2.7.1 release notes replace `xcodebuildmcp` with `mobilebuildmcp` in these commands. Codex schema compatibility was fixed after 2.7.0 (commits `95b89f24`, `9e848ebc`) and shipped in 2.7.1.
- **What the project does not ship:** no CLAUDE.md snippet for consuming projects, and no guidance on driving the UI with an outside decision model. The repo's own `CLAUDE.md` and `AGENTS.md` are for its contributors.

## Where the repo docs are wrong or stale

| File:line | What it says | What is true | Source |
| --- | --- | --- | --- |
| task brief (not a file) | "xcodebuildmcp 2.7.0 at `/opt/homebrew/bin/xcodebuildmcp` (npm latest is 2.7.0)" | the Homebrew binary is 2.6.2; npm `xcodebuildmcp` is 2.7.0 but frozen; the project continues as `mobilebuildmcp` 2.7.1 | `$ xcodebuildmcp --version`; `$ npm view mobilebuildmcp version` |
| `docs/adr/0002-xcodebuildmcp-as-device-layer.md:8` | "tap, swipe, long-press, type-text, key-press, gesture, and wait-for-ui addressed by those references" | `gesture`, `key-press`, `key-sequence` and `button` take presets or key codes; `swipe` takes `withinElementRef`; `wait-for-ui` takes selectors or a ref. `batch`, `drag` and `touch` are missing from the list | §3; `ui-automation <tool> --help` |
| `docs/adr/0002…:8` | "It also covers physical devices and macOS. … actively maintained under Sentry" | devices: build, install, launch, stop and test only. The project was renamed on 2026-09-23 with breaking changes, after a seven-week gap in commits | §1, §5 |
| `docs/adr/0002…:19` | "Physical devices become cheap to add later since XcodeBuildMCP already supports them" | there are no device tools for snapshots, taps, typing, screenshots or logs, so the step loop cannot run on a device through XcodeBuildMCP | §5; `manifests/workflows/ui-automation.yaml:3`; issue #519 |
| `docs/adr/0002…:20` | "its UI automation backend (AXe). Version pinning is required." | true, but AXe is bundled and pinned by each XcodeBuildMCP release (2.6.2 → 1.7.1, 2.7.0 → 1.8.0). Pinning XcodeBuildMCP also pins AXe | §4 |
| `CONTEXT.md:14` | "Screenshot: a PNG" | XcodeBuildMCP's `screenshot` returns a JPEG no larger than 800 px at quality 75 and deletes the PNG; a full-resolution PNG needs `simctl io` directly | `screenshot.ts:241,270`; live 369×800 JPEG |
| `CONTEXT.md:24` | "Element reference … A candidate's identity" | a ref is a positional handle (`eN`) that lasts 60 s, lives in one process, and is replaced after every action. It identifies an element only within one snapshot | §3; `runtime-snapshot.ts:14,269`; live expiry test |
| `CONTEXT.md:21` | "Physical devices are out of scope" | still the decision on record; the user has reopened it (see Consequences) | brief |
| `docs/architecture.md:114` | "simulator and bundle defaults in `.xcodebuildmcp/config.yaml`" | from 2.7.1 the file is `.mobilebuildmcp/config.yaml`, and the old path is ignored | `src@2.7.1:src/utils/project-config.ts:13` |
| `docs/architecture.md:40,43,50` | `xcodebuildmcp simulator …`, `xcodebuildmcp ui-automation …` | the binary is `mobilebuildmcp` from 2.7.1; workflow and tool names are unchanged | `CL:7`; `tools` diff |
| `.scratch/…/01-xcodebuildmcp-device-layer.md:9` | "verified 2.7.0 locally" | 2.7.0 exists only as an npx cache; the installed binary is 2.6.2 | §1 |
| `…/01…:13` | fields "(element reference, role, label, value, frame, enabled, hittable)" | there is no `hittable`; the fields are `ref`, `role`, `label`, `value`, `identifier`, `frame`, `state{enabled, visible, focused, selected}` and `actions[]`, and the list is flat | `ui-snapshot.ts:34` |
| `…/01…:15` | "whether any tool supports JSON output on the CLI, or whether `--style minimal` text must be parsed" | answered: `--output json\|jsonl` on every tool since 2.5.0 | `CL:252` |
| `…/01…:16` | AXe "not present at `/opt/axe/bin/axe`" | AXe is bundled at `<install>/bundled/axe`; no separate install is needed | §4 |
| `…/01…:17-18` | `.xcodebuildmcp/config.yaml`; "spawn `xcodebuildmcp mcp`" | renamed in 2.7.1 | `CL:7` |
| `…/08-integration-mode-and-driver-contract.md:11-12` | `xcodebuildmcp <workflow> <tool>`, `xcodebuildmcp mcp` | renamed in 2.7.1; the MCP option also returns less snapshot data (compact only) than the CLI | §3, §6 |
| upstream `docs:device-signing.mdx:26` | "Capture runtime logs and pids from device apps ✓" | only the pid; no device runtime logs since 2.5.0 | `device-steps.ts:48-93`; `CL:145` |
| upstream `docs:cli.mdx:221` | socket at `~/.xcodebuildmcp/daemons/<key>/daemon.sock` | `$TMPDIR/xcodebuildmcp-<hash>/d.sock` | `socket-path.ts:30`; `$ daemon status` |
| upstream `docs:cli.mdx:164` | `record-video --output-path ./session.mp4` | the flags are `--start` / `--stop --output-file` | `$ simulator record-video --help` |
| upstream `src/server/server.ts:43` | "Log capture: Stream and capture logs from simulators and devices" | simulator logs only, and only captured automatically at launch | §7 |

## Consequences for the plan

These are flagged for decision; none is decided here.

1. **Package choice after the rename.** ADR-0002 and the Device driver ticket need to pin one of two names.
   - `xcodebuildmcp@2.7.0` is frozen and keeps the old names.
   - `mobilebuildmcp@2.7.1` has new names everywhere, with no compatibility layer.
   
   Whichever is chosen, the binary name, config directory, env prefix and schema-ID prefix belong in one place in the device driver. The planning docs use the old names throughout. **Open question:** will the old npm package be deprecated? Will the tap keep serving `xcodebuildmcp`?
2. **Device driver: CLI or MCP client.**
   - The CLI can return full element data (`--output json --verbose`) and has a JSON envelope, but costs about 1.4 s per snapshot and depends on the workspace daemon.
   - MCP answers in about 0.7 s but only ever returns the compact projection, and it needs session defaults set before `simulatorId` is accepted.
   
   **Open question:** does the observation for Jev need frames and `state.visible`, which only the CLI provides?
3. **Refs across a step.** A step runs observe → Jev → act. If that takes more than 60 s, the tap fails with `SNAPSHOT_EXPIRED`. A long Jev call would do it, and a vision fallback in the host agent almost certainly would. The driver then has to re-snapshot and match the chosen candidate by `identifier`, or by `role`+`label`. Reports and step logs should name elements by those fields, not by `eN`.
4. **Two processes on one simulator.** Suppose the host agent also has XcodeBuildMCP installed (the host-agent loop, since ruled out), or a developer runs it alongside the bridge. The two processes neither share refs nor queue actions against each other. This is a new input to the concurrent-run rule in the Device driver ticket.
5. **Observation design (Observation schema).**
   - The compact projection keeps up to 64 targets as `ref|action|role|label|value|id` rows, at about 600 tokens for the Home screen. That fits the "candidate" concept directly.
   - The status-bar clock changes `screenHash` every minute, so screen-changed checks and progress checks need to ignore the status bar.
   - `wait-for-ui textContains` ignores visibility.
6. **Text entry.** `type-text` accepts US-keyboard characters only. Scenarios that type Vietnamese or other accented text cannot run through it. **Open question:** is there another input path, such as pasteboard or `simctl`?
7. **Screenshots for the report and the watch panel.** XcodeBuildMCP's 369×800 JPEG may be too small for human review. Full resolution means calling `simctl io` directly, which is outside the "no device code in the bridge" rule of ADR-0002.
8. **Real iPhones.** Bringing them into scope means a second device layer next to XcodeBuildMCP, not an extension of it. Candidates are WDA/Appium, a custom signed XCUITest runner, or screenshot-only HID control through pymobiledevice3, which also has no accessibility tree. That needs its own ADR. Open questions:
   - Signing a runner per developer team.
   - The "Enable UI Automation" setting.
   - Whether WDA's page source can be mapped to an rs/1-like observation.
   - Whether WDA works on iOS 26.6 with Xcode 26.4.1.
   - Device logs, which XcodeBuildMCP does not capture.
   - Whether screenshot-only perception is acceptable for Jev, which is text-only.
9. **Xcode 27.** Apple's docs now describe Device Hub. XcodeBuildMCP 2.7.0 and AXe 1.8.0 support it; 2.6.2, installed here, does not. An Xcode upgrade forces the XcodeBuildMCP upgrade question.
10. **Telemetry.** Sentry error reporting is on by default. Should the bridge set `*_SENTRY_DISABLED`?

## Unverified

- **Why the project is now called "Mobile", and whether Android is planned.** Nothing in the 2.7.1 source, changelog or PR #538 says so.
- **The future of the `xcodebuildmcp` npm package**: whether it gets another release or a deprecation notice. Also whether 2.7.1's snapshot and smoke suites pass. PR #538: "The snapshot and smoke suites have not been run yet."
- **Everything in issue #519**: CoreDevice HID features, `devicectl device capture screenshot` in the Xcode 27 beta, and HID sitting behind "Enable UI Automation" on iOS 26+. `devicectl` in Xcode 26.4.1 has no `capture` verb.
- **WDA / Appium XCUITest driver on iOS 26.6.1 with Xcode 26.4.1**, and whether it needs a paid account for this project's signing setup. Not tested.
- **Whether `devicectl device process launch` needs the device unlocked**, and how `launch_app_device` fails when it is locked.
- **Whether Xcode 27 is generally available today.** Apple's pages describe it; this machine runs 26.4.1.
- **Snapshot size on a real app screen.** The only sample is the SpringBoard Home screen: 219 elements, 17 targets.
- **Image-token cost of the 369×800 screenshot for a vision model.** Not measured.
- **The daemon startup-timeout variable.** The docs name `XCODEBUILDMCP_STARTUP_TIMEOUT_MS` (`docs:cli.mdx`), but I found no read of it in `src/`.
