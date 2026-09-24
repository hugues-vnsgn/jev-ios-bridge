# Driving a real iPhone: what a second device layer takes

Researched: 2026-09-24 · Sources:

- **WebDriverAgent (WDA)**, `github.com/appium/WebDriverAgent`, cloned at `00c3822` (release v16.12.10, 2026-09-21). npm `appium-webdriveragent` 16.12.10.
- **Appium XCUITest driver**, `github.com/appium/appium-xcuitest-driver`, cloned at `c63dedd` (release v12.13.2, 2026-09-23). Its `docs/` tree is the source of `appium.github.io/appium-xcuitest-driver/latest`. From npm on 2026-09-24: `appium` 3.7.0 (2026-09-19), `appium-ios-remotexpc` 5.22.0, `appium-ios-device` 3.1.23.
- **Appium issues**:
  - appium/appium #22636 (opened 2026-08-16, closed 08-20) and #22535 (2026-07-23);
  - appium-xcuitest-driver #2978 (2026-09-16), #2985 (2026-09-21) and #2850 (2026-05-25);
  - WebDriverAgent #1088, #1145 and #1147.
- **mobile-next**:
  - `mobilecli`, cloned at `06a4c08` (release 1.0.13, 2026-09-21), and its PR #432 (merged 2026-09-19);
  - `devicekit-ios` at `158bf7f` (2026-09-18; agent release 0.0.27, 2026-09-15);
  - `mobile-mcp` at `18d0e8c` (2026-09-23; npm `@mobilenext/mobile-mcp` 1.0.5; GitHub release 1.0.4, 2026-09-13);
  - the mobile-mcp wiki at `8ee4ac7` (2026-02-22).
- **Maestro**, `github.com/mobile-dev-inc/maestro`, cloned at `c436d39` (2026-09-18). The latest release is CLI 2.10.0 (2026-08-31). Also issues #686 and #3218, and PR #3609 (merged 2026-09-18).
- **idb**, `github.com/facebook/idb`, cloned at `2747f23` (release v1.6.2, 2026-09-23).
- **pymobiledevice3**, `github.com/doronz88/pymobiledevice3`, cloned at `f6c8cc5` (release v11.18.0, 2026-09-23).
- **Apple**:
  - local Xcode 26.4.1 (17E202) with `xcrun devicectl` 518.27 (its `-h` output for `device`, `device info`, `device process` and `manage`), `xcrun mcpbridge --help`, `/usr/bin/log help collect`, and `idevicesyslog` 1.4.0 from libimobiledevice (Homebrew). macOS 26.6.2 (`$ sw_vers`);
  - developer.apple.com pages fetched 2026-09-24: "Compare memberships" (`/support/compare-memberships/`), "Devices overview" (`/help/account/devices/devices-overview/`), "Register a single device", the Xcode 27 release notes (`/tutorials/data/documentation/xcode-release-notes/xcode-27-release-notes.json`), the releases feed (`/news/releases/rss/releases.rss`: Xcode 27 27A266a and iOS 27.0 on 2026-09-14, iOS 26.6.2 on 2026-09-08, Xcode 26.6 on 2026-06-25), "Enabling Developer Mode on a device", "Device Hub", "Interacting with your app in Device Hub", and the "XCUIAutomation" documentation JSON;
  - Apple Developer Forums thread 693273 (Apple engineer reply, November 2022);
  - support.apple.com/en-us/120421, "Use iPhone Mirroring" (published 2026-09-14).
- **GNU GPL FAQ**, "Mere aggregation" (gnu.org/licenses/gpl-faq.en.html), for the pymobiledevice3 license note.
- **context7**, tried first: `/websites/appium_github_io_appium-xcuitest-driver` for real-device setup, and `/mobile-dev-inc/maestro-docs` for physical iOS. Every context7 answer was then checked against the repo sources above, and the note cites those sources.
- **This repo**: `docs/research/mobilebuildmcp-simulator-and-device.md` (cited as `MBM:<line>`), `docs/research/human-watch-panel.md`, `docs/research/jev-model-and-api.md`, `CONTEXT.md`, and `docs/adr/0001` and `0002`.

Citation keys (paths are at the commits above):

| Key | Repository | Link form |
| --- | --- | --- |
| `WDA:` | WebDriverAgent | `https://github.com/appium/WebDriverAgent/blob/v16.12.10/<path>#L<line>` |
| `XD:` | appium-xcuitest-driver | `…/appium-xcuitest-driver/blob/v12.13.2/<path>` |
| `MC:` | mobilecli | `…/mobile-next/mobilecli/blob/06a4c08/<path>` |
| `MM:` | mobile-mcp | `…/mobile-next/mobile-mcp/blob/18d0e8c/<path>` |
| `DK:` | devicekit-ios | `…/mobile-next/devicekit-ios/blob/158bf7f/<path>` |
| `MA:` | maestro | `…/mobile-dev-inc/maestro/blob/c436d39/<path>` |
| `IDB:` | idb | `…/facebook/idb/blob/2747f23/<path>` |
| `PMD:` | pymobiledevice3 | `…/doronz88/pymobiledevice3/blob/f6c8cc5/<path>` |

A line starting `$` is a command run on this machine on 2026-09-24. No command was sent to either paired iPhone or to the booted simulator.

## Answer

1. **Most plausible option: WebDriverAgent run by Appium's XCUITest driver** (Appium 3.7.0, driver 12.13.2, WDA 16.12.10). A second device driver would talk to it over HTTP.
   - It is the only option with documented support for iOS 26.4+, signing paths for both free and paid teams, permissive licenses (BSD and Apache-2.0), and near-daily releases.
   - **mobilecli is the runner-up.** It needs a paid team with a wildcard profile, and its license is FSL.
   - Maestro and idb cannot drive a real iPhone. pymobiledevice3 has no usable tree, and Apple ships nothing scriptable.
2. **Setup for each developer:** pair over USB, turn on Developer Mode, turn on "Enable UI Automation" (it asks for the passcode about once a day), and sign WDA with their own team and a unique bundle ID. Free Apple IDs must re-sign every 7 days. Hosts on Xcode 27 need a sudo tunnel to start a preinstalled WDA.
3. **The observation can stay identical.** WDA's JSON source maps to `ref|action|role|label|value|id` rows if the driver assigns refs, derives actions from type and traits, and undoes WDA's placeholder-as-value. This holds only if one projection serves both device layers.
4. **Size: M.** Per-developer signing and the runner's lifecycle across Xcode versions dominate the cost. The mapping is small.

## Findings

The starting point is `docs/research/mobilebuildmcp-simulator-and-device.md`, §5 and Consequence 8 (`MBM:295-348`, `MBM:477-483`). MobileBuildMCP 2.7.1 builds, installs, launches, stops and tests on a paired iPhone. It has no device snapshot, tap, type, screenshot, video or log tool. Everything below is about the layer that would add those.

### 1. The options

#### WebDriverAgent, standalone or through Appium's XCUITest driver

**What it is.** An XCTest UI-test bundle (`WebDriverAgentRunner-Runner.app`, an `.xctrunner`) whose single test never returns and hosts an HTTP server on the device (`XD:docs/troubleshooting/wda-slowness.md:37-58`). Appium's XCUITest driver builds, signs, installs, launches and port-forwards it, then proxies WebDriver calls to it. WDA can also run without Appium: build it with `xcodebuild build-for-testing`, start it with `test-without-building`, forward port 8100 with `iproxy`, `go-ios` or `appium-ios-device`, and call it over HTTP (`XD:docs/guides/wda-custom-server.md:21-39`).

**Accessibility source.** `GET /source` takes `format=xml` (the default), `json` or `description`, plus `excluded_attributes` (`WDA:WebDriverAgentLib/Commands/FBDebugCommands.m:26-71`). `GET /wda/accessibleSource` returns only accessible elements with `value`, `label`, `type`, `rawIdentifier` and `name` (`WDA:WebDriverAgentLib/Categories/XCUIApplication+FBHelpers.m:314-349`).

- Both formats are **nested trees** built from one XCTest snapshot of the active application (`XCUIApplication+FBHelpers.m:190-196`).
- **XML attributes by default:** `type`, `value`, `name`, `label`, `enabled`, `visible`, `accessible`, `x`, `y`, `width`, `height`, `index` and `traits` (the expected string in `WDA:WebDriverAgentTests/UnitTests/FBXPathTests.m:67`).
- **Opt-in attributes:** `hittable`, `nativeFrame`, `minValue`/`maxValue` and `customActions` need a setting, because "The hittable attribute is expensive to calculate for each snapshot item" (`WDA:WebDriverAgentLib/Utilities/FBXPath.m:408-426`; setting names at `WDA:WebDriverAgentLib/Utilities/FBSettings.m:39-43`).
- **JSON keys:** `type`, `rawIdentifier`, `name`, `value`, `label`, `rect{x,y,width,height}`, `customActions`, `frame`, `isEnabled`, `isVisible`, `isAccessible`, `isNativeAccessibilityElement`, `isFocused`, `traits`, `placeholderValue` for text inputs, `minValue`/`maxValue` for sliders, and `children` (`XCUIApplication+FBHelpers.m:204-311`).
- **`name` is not the identifier.** It is the accessibility identifier when one is set, otherwise the label (`WDA:WebDriverAgentLib/Categories/XCUIElement+FBWebDriverAttributes.m:118-126`). Only the JSON form carries `rawIdentifier` separately.
- **The source has no element handle.** Nothing in either format identifies an element for a later action; see §3.
- **One app at a time.** WDA "only interacts with a single app hierarchy at a time". System alerts, Control Center and share sheets can belong to SpringBoard instead of the app under test (`XD:docs/troubleshooting/element-lookup.md:83-100`).
- **Depth and breadth** can be capped with the `snapshotMaxDepth` and `snapshotMaxChildren` settings (`FBSettings.m:20-21`; `wda-slowness.md:122-129`).

**Actions** (routes from `WDA:WebDriverAgentLib/Commands/*.m`):

| Action | Route | Addressed by |
| --- | --- | --- |
| Tap | `POST /wda/tap`, `POST /wda/element/:uuid/tap` (`FBElementCommands.m:115-116`), `POST /element/:uuid/click` (`:65`) | coordinates or element UUID |
| Type | `POST /element/:uuid/value` (`:64`), or `POST /wda/keys` into the focused element (`:120`, handler `:537-547`) | element UUID, or focus |
| Swipe | `POST /wda/swipe` and `/wda/element/:uuid/swipe` with `direction` up, down, left or right (`:78-79`, handler `:463-483`) | screen or element |
| Scroll, drag, long press | `/wda/scroll` (`:102`), `/wda/dragfromtoforduration` (`:107`), `/wda/touchAndHold` (`:99`) | screen or element |
| Arbitrary gestures | `POST /actions`, W3C pointer actions (`FBTouchActionCommands.m:24`) | coordinates |
| Buttons, Home, lock | `/wda/pressButton` (`FBCustomCommands.m:67`), `/wda/homescreen` (`:45`), `/wda/unlock` and `/wda/locked` (`:50-53`) | none |
| Apps and URLs | `/wda/apps/launch`, `/wda/apps/terminate` (`FBSessionCommands.m:45-47`), `/url` (`:43`) | bundle id or URL |
| Alerts | `/alert/accept`, `/alert/dismiss` (`FBAlertViewCommands.m:27-30`) | none |
| Pasteboard | `/wda/setPasteboard` (`FBCustomCommands.m:61`) | none |
| Find | `POST /elements` (`FBFindElementCommands.m:42`) with accessibility id, predicate, class chain or XPath | returns element UUIDs |

**Screenshots and video.**

- `GET /screenshot` returns a base64 PNG (`WDA:WebDriverAgentLib/Commands/FBScreenshotCommands.m:21-22`).
- An MJPEG broadcaster listens on port 9100. Its defaults are 10 frames per second, JPEG quality 25 and no downscaling (`WDA:WebDriverAgentLib/Utilities/FBConfiguration.m:27,64-66`; `XD:docs/guides/mjpeg.md:9-41`).
- `/wda/video/start|stop` records on the device (`FBVideoCommands.m:27-29`).

**Logs.** WDA itself has no app-log endpoint. The Appium driver captures the device syslog:

- On iOS 18 and later it uses a RemoteXPC syslog service when a tunnel exists. Otherwise it falls back to the lockdown `syslog_relay` service over usbmux (`XD:lib/device/log/ios-device-log.ts:36-72`).
- `mobile: startLogsBroadcast` streams those lines over a websocket (`XD:docs/reference/execute-methods.md:538-546`).
- appium/appium#22535 (2026-07-23) reports that on iOS 26.2 the stream is the whole system log, not the app's. It was closed for lack of a response.

**Latency.** Appium publishes no per-snapshot or per-action timings. Its slowness guide says:

- A page source means taking "a snapshot of the whole accessibility hierarchy with all element attributes resolved, which is a time-expensive operation". Hundreds of elements is "a known XCTest limitation" (`wda-slowness.md:112-117`).
- An app that keeps its main thread busy can block WDA with no bounded timeout (`wda-slowness.md`, "Unresponsive Application").
- The idle waits default to `waitForIdleTimeout` 10 s and `animationCoolOffTimeout` 2 s (`FBConfiguration.m:352-353`).

The closest published device figure uses the same XCTest snapshot mechanism in a different runner: mobilecli's `dump ui` took 0.49-0.68 s for a native app and 0.96-1.16 s for Settings on a real iPhone running iOS 26.5 (mobilecli PR #432, "Measurements").

**iOS 26.x and Xcode 26.4.1.**

- **Documented support.** The driver's compatibility table lists devices on iOS 26.4 or later as fully supported by driver 10.23.2 and later (WDA 11.1.5 and later), and iOS 26.0-26.3 by driver 9.5.0 and later (`XD:docs/getting-started/system-requirements.md:97-98`). Driver 11.1.2 and later fully supports Xcode 16.0 and later (`:125`). The driver "aims to fully support the latest two major Xcode/iOS" versions (`:12-14`).
- **iOS 26 and Xcode 26 issues, all closed:**
  - WDA#1088: WDA failed to build on Xcode 26.2 (closed 2025-12-18).
  - WDA#1145: a deprecated signing identity broke `CODE_SIGN_IDENTITY` on Xcode 26 (closed 2026-05-25).
  - xcuitest#2850: xcodebuild on Xcode 26 refused to create a WDA profile without `-allowProvisioningUpdates`. The maintainer's answer is the `appium:allowProvisioningDeviceRegistration` capability (closed 2026-05-29).
- **Xcode 27 changes how a preinstalled WDA starts:**
  - With an Xcode 27 host, a WDA launched by `xcrun devicectl device process launch` never starts its HTTP server: "Failed to background test runner within 30.0s … Code=10300" (appium/appium#22636). xcuitest#2985 (2026-09-21) reproduces this on an **iOS 26.7** device once the host has Xcode 27.
  - The driver now disables the `devicectl` fallback on iOS 27 and requires a RemoteXPC tunnel (`XD:docs/guides/run-preinstalled-wda.md:54-63`). Creating that tunnel "must be run as sudo/root" (`XD:docs/guides/remotexpc-tunnels-real-devices.md:83-89`).
  - The default path, where `xcodebuild` builds and launches WDA, is not named in these issues.
  - This machine runs Xcode 26.4.1, so none of this applies to it yet.

**License and maintenance.**

- WDA's `LICENSE` is BSD with the Facebook no-endorsement clause, though `package.json` says Apache-2.0. The driver and Appium are Apache-2.0 (`$ npm view … license`).
- WDA shipped 11 releases from 16.12.0 (2026-09-01) to 16.12.10 (2026-09-21) (`WDA:CHANGELOG.md:1-61`).
- The driver's latest is 12.13.2 (2026-09-23), and Appium's is 3.7.0 (2026-09-19).

#### A custom XCUITest runner bundle

This is the pattern WDA, Maestro's iOS driver and mobilecli's devicekit-ios agent all use. The pieces are known and small:

1. **An HTTP server inside a test method that never returns.** Maestro uses FlyingFox in `testHttpServer` (`MA:maestro-ios-xctest-runner/maestro-driver-iosUITests/maestro_driver_iosUITests.swift:26-30`) and binds `127.0.0.1:22087` (`MA:maestro-ios-xctest-runner/…/Routes/XCTestHTTPServer.swift:33-34`). devicekit-ios serves JSON-RPC on device port 12004 (`DK:README.md`, "Starting the Server").
2. **A tree from `XCUIElement.snapshot()`.** Maestro raises the depth limit to 60 by swizzling the private `XCAXClient_iOS.defaultParameters` (`MA:…/Routes/XCTest/AXClientSwizzler.swift:19-29`; `…/Handlers/ViewHierarchyHandler.swift:306-345`).
3. **Input through the private `XCTRunnerDaemonSession synthesizeEvent`** (`MA:…/TouchRouteHandler.swift:35-41`).
4. **Screenshots through `XCUIScreen.main.screenshot()`** (`MA:…/ScreenshotHandler.swift:15-16`).
5. **A launch** by `xcodebuild test-without-building`, or by `devicectl device process launch` of the `.xctrunner`, plus a usbmux port forward to reach the server.

idb's "XCTest mode" (`idb xctest run ui`) runs a UI test bundle to completion through a generated `.xctestrun` and `xcodebuild` (`IDB:FBDeviceControl/Commands/DeviceXCTestCommands.swift:77-103`). It gives no step-by-step control unless the bundle is itself a server, as WDA is.

MobileBuildMCP's `test_device` can already run prebuilt `.xctestrun` products (`MBM:308`). Whether it can host a runner that never finishes, instead of the bridge calling `xcodebuild` itself, is **unverified**.

The cost is not in these pieces but in the long tail:

- per-team signing, including bundle-ID collisions on free teams (Maestro #2697);
- breakage with each Xcode release. Maestro's device-driver build broke on Xcode 26.4 (#3218, open), and Xcode 27 broke `devicectl` launches for WDA (above);
- port forwarding and runner lifecycle;
- private-API drift.

Maestro has had "Support real iOS devices" open since 2023-01-26 (#686) without shipping it. Writing a runner would repeat WDA's work with no gain in capability.

#### mobile-next mobilecli and mobile-mcp

- **The agent.** mobilecli replaced WebDriverAgent with its own `devicekit-ios` XCUITest agent in 0.3.66, released 2026-04-16 (`MC:CHANGELOG.md:201`). The runner bundle is `com.mobilenext.devicekit-iosUITests.xctrunner` (`MC:devices/ios.go:41`).
  - It launches the agent through testmanagerd with go-ios, with no `xcodebuild` (`MC:devices/ios.go:663-673`).
  - For iOS 17 and later it uses a userspace tunnel that needs no sudo (`MC:devices/ios/tunnel-manager.go:44-45`; `MC:devices/ios.go:424-437`).
  - It needs Developer Mode (`MC:devices/ios_device_agent.go:211`).
- **Install and signing.** Setup is `mobilecli agent install --device <id> --provisioning-profile <path>` (`MC:commands/agent.go:135-136`).
  - It downloads a checksum-pinned `devicekit-ios-runner.ipa` (`MC:commands/agent.go:23,32,245`) and re-signs it without changing the bundle ID (`MC:utils/resign.go:51-96`).
  - It accepts only a profile with the exact bundle ID or `TEAM.*` (`MC:utils/resign.go:321-330`). The error text says "provisioning profiles require a paid Apple Developer Program membership ($99/year)" (`MC:utils/resign.go:397-404`).
  - In practice this means **a paid team with a wildcard profile.**
- **Accessibility source.** `mobilecli dump ui` calls RPC `device.dump.ui` (`MC:devices/devicekit/source.go:141-158`).
  - The raw fields are `type`, `label`, `name`, `value`, `placeholderValue`, `rawIdentifier`, `enabled`, `selected`, `hasFocus`, `rect` and `children` (`MC:devices/devicekit/source.go:21-33`).
  - mobilecli filters the tree. It keeps an allow-list of types plus anything with an identifier, drops off-screen, zero-size and unlabeled non-control elements, and moves children up to the nearest kept ancestor (`MC:devices/devicekit/source.go:47-120`).
  - The output is a nested `ScreenElement` with positional `@eN` refs that are "only valid against the dump that produced them" (`MC:types/screen.go:12-43`).
  - Tap-by-ref re-dumps the screen and taps the element's centre, "no staleness tracking" (`MC:commands/input.go:165-181`).
- **Actions** are coordinate-based: tap, long press, swipe, gesture, pinch, text into the focused field, buttons, launch and terminate, and URL (`DK:README.md:125-156`).
- **Screenshots** are PNG, which the CLI can convert to JPEG or scale (`MC:devices/devicekit/screenshot.go:10-33`; `MC:README.md:81-104`). **Streaming** is MJPEG, or H.264 through a ReplayKit broadcast extension (`MC:devices/ios.go:1150-1161,1272-1274`); real-device recording is flaky (devicekit-ios#59 and mobile-mcp#321, both open).
- **Logs.** `mobilecli device logs` streams `os_trace_relay` as JSON lines that can be filtered by process or subsystem (`MC:devices/ios.go:1764-1779`; `MC:README.md:374-400`).
- **mobile-mcp** exposes 32 MCP tools (`MM:src/server.ts`). For real iOS it calls mobilecli by default (`MM:src/server.ts:246-296`). It installs the agent automatically only on simulators (`:281-285`).
  - Its element list is one text row per element: `@ref Type text= label= name= value= id= at=x,y size=WxH [focused] [selected] [checked] [disabled]` (`MM:src/format-elements.ts:97`).
  - The real-device wiki page (2026-02-22) still describes the older WDA path.
  - PostHog telemetry is on by default (`MM:src/server.ts:160-167`).
- **iOS 26 support.**
  - "go-ios … v1.0.211 which fixes iOS 26 on OSX Tahoe" (`MC:CHANGELOG.md:187`).
  - PR #432 measured a real iPhone on iOS 26.5.
  - mobilecli#447, open, reports silent text-entry failures, on a simulator.
- **License and maintenance.**
  - mobilecli is under the **Functional Source License 1.1 with an Apache-2.0 future license** (`MC:LICENSE:1-3`). That is a non-compete source-available license, not open source, until each version converts.
  - mobile-mcp is Apache-2.0.
  - mobilecli released 1.0.10 through 1.0.13 between 2026-09-11 and 2026-09-21 (`$ gh release list -R mobile-next/mobilecli`).

#### Maestro

**Maestro has no real-iPhone support, and main now refuses physical iPhones.**

- `MA:maestro-cli/src/main/java/maestro/cli/session/MaestroSessionManager.kt:155-166` throws "Physical iOS devices are not yet supported. Maestro runs iOS flows on simulators only". This came in PR #3609, merged 2026-09-18 and not yet released.
- The device driver `ios.devicectl.DeviceControlIOSDevice` is "an unfinished spike: almost every method is `TODO("Not yet implemented")`". That includes `viewHierarchy`, `tap`, `input` and `takeScreenshot` (the comment at `:157-161`).
- The docs agree: "Executing tests on physical iOS devices is not supported yet" (context7 `/mobile-dev-inc/maestro-docs`, `introduction/get-started/supported-platform/ios/uikit.md`; `MA:README.md:16`).
- A maintainer wrote on #3218 (2026-04-24): "we expect to have physical iOS support later this year".

On simulators its runner returns a nested `AXElement` JSON with these fields: `identifier`, `frame`, `value`, `title`, `label`, `elementType`, `enabled`, `placeholderValue`, `selected`, `hasFocus`, `children`, `windowContextID` and `displayID` (`MA:…/MaestroDriverLib/Models/AXElement.swift:6-21`). It has no stable element id and no visible or hittable flag. A 1.3 MB tree on an iOS 26.1 simulator took 1,717 ms at the median (Maestro PR #3313 and #3364). Maestro is Apache-2.0 and released 2.7.0 through 2.10.0 between 2026-07-20 and 2026-08-31.

#### idb

- **The project has been revived.** v1.1.8 (2022-08-11) was followed by v1.5.0.b1 (2026-08-14) and then v1.6.0-v1.6.2 (2026-09-17 to 09-23). It is a Swift rewrite with 2,668 commits since 2026-06-01, 88% of them by one author (`$ gh api repos/facebook/idb/commits?since=2026-06-01`). It needs Xcode 26 or later (`IDB:website/docs/idb/installation.mdx:30`).
- **Accessibility and HID are simulator-only in source.**
  - `accessibility_describe` throws `simulatorOnlyOperation` for a device (`IDB:CompanionLib/IDBCommandExecutor.swift:202-205`), and HID resolves through `simulatorTarget()`, which throws `notASimulator` (`:546-548`, `:819-830`).
  - The docs claim that "a subset" of HID works on devices (`IDB:website/docs/idb/ui.mdx:18`); the source shows none.
- **What it does on a device:**
  - screenshots through lockdown `screenshotr` (`IDB:FBDeviceControl/Commands/DeviceScreenshotCommands.swift:51-52`);
  - logs through `syslog_relay` (`DeviceLogCommands.swift:11,72`);
  - launch through `devicectl` (`Management/AppleDevicectlCommandExecutor.swift:37-64`).
- MIT license.

#### pymobiledevice3

**Accessibility.** The brief's "no accessibility tree" is right in substance but needs one correction: pymobiledevice3 does have an accessibility command, and it is not usable as a tree.

- `developer accessibility list-items` walks the Accessibility Inspector focus order, VoiceOver-style. For each element it returns only `platform_identifier`, `estimated_uid`, `caption` and `spoken_description`. There is no frame, role, identifier or value (`PMD:pymobiledevice3/services/accessibilityaudit.py:21-78,627-680`).
- A `perform_press` API exists, but "Can only be used for processes that carry the `task_for_pid-allow` entitlement" (`:508-565`).
- For a real tree, pymobiledevice3 falls back on WebDriverAgent:
  - `developer wda list-items|tap|type|swipe|screenshot` is a WDA client (`PMD:pymobiledevice3/cli/developer/wda.py:219-335`).
  - With `--xctrunner <bundle>`, it launches an installed WDA through its own XCUITest service, with no `xcodebuild` (`wda.py:48-84`; default port 8100 at `PMD:pymobiledevice3/services/wda.py:21`).
  - The project's own agent skill says to "use … WDA for device UI automation" (`PMD:.codex/skills/pymobiledevice3-device-operator/references/task-map.md:67`).

**Actions.** `developer core-device universal-hid-service tap|drag|swipe|type` and `hid button home|lock|volume` (`PMD:docs/guides/cli-recipes.md:335-384`).

- Coordinates are normalized to UInt16, with no element addressing.
- Touches are dropped unless a screen-mirror media stream is running: "Authentication gate — an active media stream is required" (`PMD:pymobiledevice3/remote/core_device/hid_service.py:100-109`). The CLI opens that stream itself.
- Typing covers US-keyboard ASCII only (`hid_service.py:146-196`).
- The HID and mirror work was validated on an iOS 27 beta (PR #1764, merged 2026-07-12).

**Screenshots and screen.**

- Screenshots come from `developer core-device screen-capture screenshot`, a PNG through `com.apple.coredevice.screencaptureservice` (`PMD:pymobiledevice3/remote/core_device/screen_capture_service.py:12-35`). Other routes are `developer dvt screenshot` and the deprecated `screenshotr`. All of them need Developer Mode and a mounted developer disk image, and `mounter auto-mount` handles the mount (`cli-recipes.md:222-237`).
- `developer core-device display serve-web` and `serve-vnc` stream the live screen and accept input (`cli-recipes.md:387-428`).

**Logs.** `syslog live` streams `com.apple.os_trace_relay`, which needs no developer disk image (`PMD:pymobiledevice3/services/os_trace.py:264`). It filters by `--pid`, `--process-name`, `--subsystem`, `--category` and regex, and prints NDJSON with `--format json` (`PMD:pymobiledevice3/cli/syslog.py:316-460`).

**Other facts.**

- **Tunnel.** On iOS 17.4 and later the tunnel is automatic and needs no root on macOS. Only `tunneld` and `start-tunnel` need sudo (`PMD:docs/guides/ios17-tunnels.md:6,29-45,66-70,222`).
- **iOS 26.** Handled explicitly, for example "Required since iOS 26" (`PMD:pymobiledevice3/remote/core_device/app_service.py:37-47`).
- **Latency.** None published.
- **License.** `GPL-3.0-or-later` (`PMD:pyproject.toml:6`). By the GPL FAQ's "mere aggregation" answer, a bridge that runs the CLI as a separate process stays separate; one that imports the library does not.
- **Maintenance.** About 40 releases between 2026-09-02 and 09-23.

#### Apple: devicectl, Device Hub, XCTest, and agent-facing tools

**Local `devicectl` (Xcode 26.4.1).** `$ xcrun devicectl --version` prints 518.27. The subcommands:

- `$ xcrun devicectl device -h`: copy, info, install, notification, orientation, process, reboot, sysdiagnose, uninstall.
- `device info -h`: appIcon, apps, authListing, ddiServices, details, displays, files, lockState, processes.
- `device process -h`: launch, resume, sendMemoryWarning, signal, suspend, terminate.
- `manage -h`: ddis, loggingProfile, pair, unpair.

None of them captures a screenshot, sends input, or returns a UI tree. The one log path is `device process launch --console`, which "Attaches the application to the console and waits for it to exit". `$ /usr/bin/log help collect` offers `--device-udid` for an archive collected after the fact, and `log stream` has no device option.

**Xcode's agent tools.**

- *Xcode 26.4.1.* `$ xcrun mcpbridge --help` describes a "STDIO Bridge for Xcode MCP Tools", which needs a running Xcode. Its tool actions, read from `IDEKit.xcplugindata` without launching Xcode, are build, build log, console output, test list and runs, build settings, entitlements, Info.plist, and file tools. There are no device or UI tools.
- *Xcode 27.* It shipped on 2026-09-14 as build 27A266a, alongside iOS 27.0 (`$ curl https://developer.apple.com/news/releases/rss/releases.rss`). Its release notes say "Agents can now boot simulators, install and launch apps, synthesize touch events, and capture screenshots to verify UI behavior. (175179787)". Nothing in that item names physical devices.
- *Xcode 27 `devicectl`.* The notes add only JSON-to-stdout and flag fixes (63583278, 183766625, 183773087). There is no capture or input verb (`developer.apple.com/tutorials/data/documentation/xcode-release-notes/xcode-27-release-notes.json`, fetched 2026-09-24).

**Device Hub (Xcode 27).**

- A person can use a physical device through View Screen and by hand at the same time (Apple, "Interacting with your app in Device Hub").
- Screenshots are GUI-only. Video is documented for simulators only (`MBM:335`).
- Network pairing needs iOS 27 on the device (release note 179418483).

**XCTest.**

- XCUIAutomation gives the hierarchy only to code running inside a UI-test runner: `XCUIElementSnapshot` with `children` and `dictionaryRepresentation`. `XCUIElementAttributes` covers identifier, elementType, value, placeholderValue, title, label, hasFocus, isEnabled, isSelected and frame, and has no hittable attribute (Apple "XCUIAutomation" documentation JSON, fetched 2026-09-24).
- This is the API every runner above is built on.
- Apple ships no runner, no daemon, and nothing that serves this tree to an outside process.

**"Enable UI Automation".** An Apple Developer Tools Engineer, in forum thread 693273 (November 2022), explains the passcode prompt:

- It "was added as an extra layer of security".
- Users "input the passcode manually about once per day".
- "There is no officially supported way to automate the entry of this passcode".
- The only way around it is to remove the device passcode.

#### Options table

| Option | Accessibility tree | Actions | Screenshots | Logs | iOS 26 support | Setup burden per developer | License / maintenance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **WDA through Appium XCUITest driver** | nested XML or JSON: type, label, value, rawIdentifier, rect, enabled, visible, traits. No handle in the tree; UUIDs come from find | tap (coordinates or element), type, swipe, scroll, drag, long press, W3C actions, buttons, alerts, launch and terminate, pasteboard | PNG; MJPEG stream on port 9100; on-device video | device syslog (RemoteXPC or `syslog_relay`), websocket broadcast; not app-scoped | documented: iOS 26.4+ from driver 10.23.2. Xcode 27 hosts need a sudo tunnel for preinstalled WDA | Appium 3 and the driver; sign WDA with own team; unique bundle id; Developer Mode, Enable UI Automation, trust | BSD (WDA) and Apache-2.0; 11 WDA releases in September 2026; driver 12.13.2 (09-23) |
| **WDA standalone** | same | same | same | none from WDA; add `devicectl --console` or an os_trace reader | same WDA; the launch path is the caller's problem | the bridge owns build, sign, launch (`xcodebuild` or pymobiledevice3 `--xctrunner`) and port forwarding | BSD |
| **Custom XCUITest runner** | whatever is written, from `XCUIElement.snapshot()` | whatever is written, through private `synthesizeEvent` | `XCUIScreen` | none built in | the author's burden (Maestro's broke on Xcode 26.4, #3218) | same signing as WDA, plus maintaining the runner | own code |
| **mobilecli / mobile-mcp** | own devicekit-ios agent; nested JSON with positional `@eN` refs; mobile-mcp flattens it to text rows | coordinate tap, long press, swipe, gesture, text, buttons, launch and terminate, URL | PNG or JPEG; MJPEG and H.264 (flaky on devices) | `os_trace` JSON stream with filters; crash reports | yes (go-ios fix; measured on iOS 26.5) | **paid team plus wildcard profile**; `agent install`; no sudo, no `xcodebuild` | **FSL-1.1** (mobilecli, non-compete) and Apache-2.0 (mobile-mcp); releases every few days |
| **Maestro** | simulator only; device driver is a `TODO` spike | none on devices; CLI refuses iPhones since PR #3609 | none on devices | none on devices | device driver build broken on Xcode 26.4+ (#3218) | n/a | Apache-2.0; "later this year" |
| **idb 1.6** | simulator only in source | simulator only in source; device: install, launch, `xctest run` | device through `screenshotr` | device through `syslog_relay` | needs Xcode 26+; no device UI | companion plus client; nothing to sign | MIT; revived 2026-08, one main author |
| **pymobiledevice3** | focus-order captions only, no frame, role or id; full tree only by calling WDA | HID tap, drag and ASCII type by coordinates, gated on a mirror stream | PNG (CoreDevice, DVT); live screen over web or VNC | `syslog live`, filterable, NDJSON | services yes; HID validated only on an iOS 27 beta | Developer Mode, auto-mounted disk image, Python; no root on macOS | GPL-3.0-or-later; daily releases |
| **Apple devicectl / Device Hub / XCTest** | only inside a UI-test runner; nothing served to other processes | devicectl: launch, terminate, orientation; Device Hub input is GUI only | Device Hub GUI only; none in devicectl | `devicectl … launch --console`; `log collect --device-udid` after the fact | yes | pairing, Developer Mode, team, Enable UI Automation | proprietary; Xcode 27 GA 2026-09-14 |

### 2. Per-developer setup

These steps are for WDA, the most demanding case. mobilecli differs where noted.

| Step | How often | Free Apple ID | Paid team | Source |
| --- | --- | --- | --- | --- |
| Pair and trust the Mac over USB ("Trust This Computer") | once per Mac and device; again after each iOS upgrade | yes | yes | `XD:docs/getting-started/device-setup.md:42-46`; `MBM:345` |
| Developer Mode (restart, then confirm with the passcode) | once | yes | yes | `device-setup.md:58-64`; Apple, "Enabling Developer Mode on a device" |
| Settings → Developer → Enable UI Automation | once, then a passcode prompt "about once per day" unless the passcode is removed | yes | yes | `device-setup.md:66-68`; Apple forum 693273 |
| Passcode or Touch ID at session start (iOS 15+) | each session, unless the passcode is off | yes | yes | `XD:docs/troubleshooting/index.md:11-12` |
| Sign the WDA runner | once per Xcode or WDA upgrade | manual only: open the WDA project, pick the personal team, change the bundle id | automatic with `xcodeOrgId`/`xcodeSigningId` or an `.xcconfig`; a wildcard profile is recommended | `XD:docs/getting-started/provisioning-profile/index.md:21-32`; `auto-config.md:8-50`; `generic-device-config.md:42-49` |
| Trust the developer certificate on the phone (Settings → General → VPN & Device Management; needs internet) | after each fresh free-team install | yes | no | `provisioning-profile/index.md:85-95` |
| Profile and quota limits | ongoing | profiles and App IDs expire after 7 days; 3 apps per device; 10 App IDs and 3 devices per 7 days | 100 iPhones per membership year | Apple "Compare memberships"; Apple "Devices overview" |
| Developer disk image mounted | automatic when Xcode sees the device | yes | yes | `XD:docs/guides/run-preinstalled-wda.md:109-115` |
| Accessibility Zoom off | once | yes | yes | `device-setup.md:23-25` |

The driver also turns off Auto-Correction and Predictive Text on the phone and marks the keyboard tutorial done (`device-setup.md:14-17`). Those are the engineer's own phone settings.

**USB versus network.**

- **USB.** Appium forwards WDA's port over usbmux through `appium-ios-device`, with no extra tools (WDA `README.md`, "Features"; `appium:wdaLocalPort` at `XD:docs/reference/capabilities.md:61`).
- **Network.** WDA also listens on the phone's own address, and `appium:wdaBaseUrl` (for example `http://192.168.1.100`) points the driver there (`capabilities.md:64`). The iPhone 17,2 paired here already shows `transport localNetwork` (`MBM:320`).
- **Pairing over the network.** Device Hub's network pairing needs iOS 27 (Xcode 27 release note 179418483). Before that, pairing starts on a cable.
- **iOS 18+ services.** Several features, log retrieval among them, want a RemoteXPC tunnel, and creating it needs sudo (`XD:docs/guides/remotexpc-tunnels-real-devices.md:9-26,83-89`). Syslog falls back to `syslog_relay` without one (`XD:lib/device/log/ios-device-log.ts:41-60`).
- **mobilecli** uses a userspace tunnel with no sudo (`MC:devices/ios/tunnel-manager.go:44-45`). mobile-mcp documents only USB (`MM:README.md:67`).

**What breaks when each engineer uses their own phone and team ID.**

1. **The runner's bundle ID cannot be shared.**
   - WDA ships as `com.facebook.WebDriverAgentRunner`, and Xcode rejects it for most teams (`provisioning-profile/full-manual-config.md:25-32`). `xcodebuild` then appends `.xctrunner` (`auto-config.md:46-49`).
   - Engineers on free teams each need a bundle ID of their own. Maestro's hard-coded runner IDs collide on free teams (Maestro #2697).
   - So the team ID and the runner bundle ID are per-user settings, not repo settings.
2. **A signed runner belongs to one team.**
   - Appium's prebuilt WDA is unsigned (`CODE_SIGNING_ALLOWED=NO`), and "must be codesigned first" (`generic-device-config.md:34-38`). `sign-wda` re-signs it with a `.p12` and a profile (`XD:docs/reference/scripts.md:184-240`).
   - One engineer's signed runner will not install on another team's phone.
   - The same holds for the app under test, which MobileBuildMCP already builds per team (`MBM:347`).
3. **Free Apple IDs expire weekly.**
   - Every 7 days both the runner and the app under test must be re-signed and reinstalled. Together they take 2 of the 3 app slots on the phone (Apple "Compare memberships").
   - Automatic provisioning is paid-only (`provisioning-profile/index.md:21-24`). mobilecli needs a paid team with a wildcard profile (`MC:utils/resign.go:397-404`).
4. **A shared paid team spends device slots.**
   - Each new phone uses one of the team's 100 iPhone registrations for the membership year (Apple "Devices overview").
   - Registering in the portal needs the Account Holder or Admin role (Apple "Register a single device"). The alternative is to let `xcodebuild` register the device through `appium:allowProvisioningDeviceRegistration` (`auto-config.md:50`). The maintainer warns about the 100-device limit when enabling it by default (xcuitest#2850).
5. **Different Xcode versions behave differently.**
   - On Xcode 27, a preinstalled runner needs the sudo tunnel; on Xcode 26.x it does not (`run-preinstalled-wda.md:54-63`; xcuitest#2985).
   - On Xcode 26, `xcodebuild` needs provisioning updates allowed (xcuitest#2850).
   - Appium's rule is that Xcode must bundle the SDK for the phone's iOS version (`XD:docs/getting-started/system-requirements.md:62-65`). This Mac has Xcode 26.4.1, while one paired phone runs iOS 26.6.1 (`MBM:320`); Xcode 26.6 came out on 2026-06-25 (Apple releases RSS).
6. **Several phones on one Mac** need distinct local ports for WDA (8100) and MJPEG (9100) (`capabilities.md:61`; `XD:docs/guides/mjpeg.md:33`).

### 3. Mapping to the bridge's observation

**Yes: WDA's JSON source can produce the same `ref|action|role|label|value|id` rows.** The device driver has to supply the parts WDA does not.

| rs/1 compact column | WDA JSON source | What the driver must do |
| --- | --- | --- |
| `ref` | none | Assign refs per snapshot, for example `e1…eN` in traversal order as rs/1 does (`MBM:181`). The glossary already says a reference "never identifies an element across steps" (`CONTEXT.md:68-69`) |
| `action` | none | Derive it from `type` and `traits`: tap for buttons, cells, links, switches and tabs; typeText for text fields, secure fields, search fields and text views; swipeWithin for scroll views, tables and collection views. rs/1 computes this inside MobileBuildMCP, so parity needs its rules (`MBM:173`) |
| `role` | `type` (`XCUIElementType…` short name) | Map XCTest element types onto rs/1's 16 roles (`MBM:169`) |
| `label` | `label` | Direct. For text and secure fields an empty label is kept as `""` rather than null (`XCUIElement+FBWebDriverAttributes.m:133-140`) |
| `value` | `value` | **Not raw.** WDA falls back to the label for static text, reports `1` for a selected button, `0`/`1` for switches, and the placeholder for an empty text field (`XCUIElement+FBWebDriverAttributes.m:95-116`). The driver must undo the placeholder case by comparing with `placeholderValue`, or Jev will read placeholder text as typed text |
| `id` | `rawIdentifier` | Use JSON. XML `name` is the identifier, falling back to the label (`:118-126`) |
| frame, state (verbose rs/1 only) | `rect`, `isEnabled`, `isVisible`, `isFocused` | `selected` is not in the source. `hittable` is opt-in and expensive |

**Element identity across steps.**

- WDA's source carries no handle. Its element UUIDs come only from `POST /element(s)`. They are built from the accessibility element ID and the process ID (`WDA:WebDriverAgentLib/Routing/FBElementUtils.m:127-151`) and cached, up to 1,024 of them (`WDA:WebDriverAgentLib/Routing/FBElementCache.m:24`).
- That makes a WDA UUID longer-lived than an rs/1 ref: it survives while the underlying accessibility element does. But the bridge's model already refuses identity across steps, so this adds nothing the loop needs.
- **To act on a chosen row** the driver can take one of three routes:
  - tap the centre of its `rect` through `/wda/tap`, as mobilecli and mobile-mcp do (`MC:commands/input.go:165-181`);
  - re-find the element by identifier, or by label and type, and `POST /element/:uuid/click`;
  - take the snapshot with `POST /elements`, with `shouldUseCompactResponses=false` and `elementResponseAttributes` set, which returns UUIDs and chosen attributes as one flat list (`WDA:WebDriverAgentLib/Routing/FBResponsePayload.m:103-145`; defaults at `FBConfiguration.m:343-344`). Its cost on a large screen is **unverified**.

**Scope differences that change what Jev would see.**

- **One app at a time.** WDA snapshots the active application only. System alerts and share sheets may belong to SpringBoard (`element-lookup.md:83-100`).
- **The simulator snapshot is broader.** The rs/1 Home-screen sample is SpringBoard itself and includes the status-bar clock (`MBM:190`). Whether WDA's app snapshot includes the status bar is **unverified**.
- **The idle waits add delay.** They default to 10 s plus a 2 s animation cool-off (`FBConfiguration.m:352-353`). An app that never idles slows every snapshot.

**Token size.** No WDA sample could be taken without touching a device or the user's simulator. The first two rows below are therefore **estimates**. A scratch script (`/tmp/devlayer/scratch/size.js`) re-rendered the 219 elements of `docs/research/assets/snapshot-sample-verbose.json` with WDA's default attribute sets, assuming WDA would see the same 219 elements.

| Form | Characters | ≈ tokens (÷4) |
| --- | ---: | ---: |
| WDA XML source, default attributes (estimate) | 40,193 | 10,000 |
| WDA JSON source (estimate) | 69,659 | 17,400 |
| rs/1 verbose JSON, minified (measured, `MBM:253`) | 52,772 | 13,200 |
| The 17 candidate rows alone, `ref\|action\|role\|label\|value\|id` | 663 | 170 |
| MobileBuildMCP compact text with headers (measured, `MBM:248-249`) | 1,252-2,079 | 313-520 |

Jev allows 32k tokens for the state plus the longest question (`docs/research/jev-model-and-api.md:24`). A raw WDA JSON source would take over half of that. Only the projected rows are affordable, which the simulator path has to do anyway.

**Keeping the observation identical.** The rows can match only if one projection produces them for both device layers. Today the simulator path is set to use MobileBuildMCP's compact projection. Over MCP that is the only form available, with no frames or state (`MBM:262`). Its target rules and 64-target cap live inside MobileBuildMCP.

A second layer therefore forces a choice:

- The device drivers return device-neutral elements (role, label, value, identifier, frame, state, actions), and the bridge builds candidates from them with one set of rules. This needs MobileBuildMCP's CLI `--verbose` output on the simulator side (`MBM:262,465-466`).
- Or the WDA driver re-implements MobileBuildMCP's classifier.

**WDA also runs on simulators**, so observation parity can be measured on one simulator screen, with both layers side by side, before any iPhone is involved.

### 4. Screen and logs for a person watching

The watch view's text parts come from the run log and work the same on any device (`docs/research/human-watch-panel.md:162-177`). What changes on a phone is where the pictures and app logs come from.

**Per-step screenshots.** `devicectl` cannot take one. The available sources are:

- WDA's `GET /screenshot`, a PNG (`FBScreenshotCommands.m:21-22`);
- mobilecli's PNG or JPEG, with scaling (`MC:README.md:81-104`);
- pymobiledevice3's CoreDevice PNG (`PMD:pymobiledevice3/remote/core_device/screen_capture_service.py:12-35`).

On the simulator, MobileBuildMCP returns an 800-pixel JPEG (`MBM:229-235`). Device images from these tools are larger; their size and capture time are unmeasured.

**Live screen.**

| Source | Works during a run? | Notes |
| --- | --- | --- |
| WDA MJPEG, port 9100, over the same USB forward | yes | a browser can show it directly. The defaults are 10 fps and JPEG quality 25, adjustable through settings (`XD:docs/guides/mjpeg.md:9-41`) |
| mobilecli `screencapture` (MJPEG or H.264) | yes | H.264 recording on devices is flaky (devicekit-ios#59, mobile-mcp#321) |
| pymobiledevice3 `display serve-web` or `serve-vnc` | probably | will not start while the camera or microphone is in use (`PMD:pymobiledevice3/remote/core_device/display_service.py:15-31`) |
| Xcode 27 Device Hub, View Screen | yes, by Apple's docs | "you can interact with the view in Device Hub and the physical device simultaneously" (Apple, "Device Hub"). GUI only |
| QuickTime Player, New Movie Recording with the iPhone as camera | likely | manual (`human-watch-panel.md:201`) |
| iPhone Mirroring | **no** | the iPhone must be "locked and near your Mac", and unlocking it ends mirroring (support.apple.com/en-us/120421, published 2026-09-14). WDA needs an unlocked phone: its launch error names "the device might be locked" (xcuitest#2978), and sessions ask for the passcode (`XD:docs/troubleshooting/index.md:11-12`). This answers the open item at `human-watch-panel.md:352` from the documentation, but it is untested |

**App logs.**

- **stdout and stderr.** `xcrun devicectl device process launch --console` "Attaches the application to the console and waits for it to exit" (`$ xcrun devicectl device process launch --help`). MobileBuildMCP's `launch_app_device` does not pass `--console` (`MBM:307`). Using it means launching the app outside MobileBuildMCP, or asking upstream for the flag.
- **os_log and `Logger` output, filtered to the app:**
  - pymobiledevice3 `syslog live --process-name <app> --format json` (`PMD:pymobiledevice3/cli/syslog.py:316-460`);
  - mobilecli `device logs`, filtered by process or subsystem (`MC:README.md:376-400`);
  - libimobiledevice's `idevicesyslog -p PROCESS` (`$ idevicesyslog --version` prints 1.4.0, released 2025-10-10; `--help` lists `-p, --process`, `-m, --match`, `-n, --network` and `archive`).
  - Appium's syslog is device-wide (appium/appium#22535).
- **After the run.** `log collect --device-udid` pulls an archive (`$ /usr/bin/log help collect`).

### 5. Prior art

- **mobile-mcp and mobilecli** drive real iPhones today.
  - Until 0.3.66 (2026-04-16) mobilecli used WebDriverAgent; it now uses its own devicekit-ios runner (`MC:CHANGELOG.md:201`). The reason is not stated.
  - The older path is still in mobile-mcp behind `MOBILEMCP_LEGACY_ROBOT=1`: go-ios plus WDA on port 8100 (`MM:src/ios.ts:8,78-89`).
  - Perception: a fresh dump per step, positional `@eN` refs, and taps at the element's centre. mobile-mcp gives the model text rows that its changelog calls "~5x smaller than json" (`MM:CHANGELOG.md:28`).
  - Setup: a paid team with a wildcard profile, plus a manual `mobilecli agent install` on each phone.
- **Maestro** does not drive iPhones, and its CLI now refuses them (PR #3609). Real-device support has been requested since 2023 (#686), and the maintainers said "later this year" in April 2026. A community PR using `devicectl` and `iproxy` (#3100) is open.
- **Appium's XCUITest driver** is the reference implementation. pymobiledevice3's `developer wda` commands and mobile-mcp's legacy path are both WDA clients.
- **idb** 1.6 has no device UI automation.
- **The common pattern.** Every tool that drives a real iPhone step by step runs an XCUITest runner on the phone and talks to it over a forwarded port. None reads the accessibility tree another way, because Apple exposes it only to code running inside XCTest (§1, Apple).

### 6. Sizing

**The most plausible option is WebDriverAgent run by Appium's XCUITest driver.** The bridge's second device driver would be an HTTP client of an Appium server.

This keeps the glossary's rule that "The bridge contains no device automation of its own" (`CONTEXT.md:21-22`): Appium owns WDA's build, signing, launch, port forwarding, tunnels and syslog.

mobilecli is the runner-up. It is a single binary with JSON output, needs no sudo, and has faster published dumps. It is limited to paid teams with a wildcard profile and is FSL-licensed.

**Rough size: M.**

| Piece | Size | What drives it |
| --- | --- | --- |
| A device-neutral element and action contract at the driver seam, and fitting the MobileBuildMCP driver to it | S-M | the choice in §3; it touches the Observation schema and Device driver tickets |
| WDA JSON to elements: role map, action derivation, `value` clean-up, pruning, refs | S | the table in §3; a parity check on a simulator |
| Actions: tap by coordinates or by re-find, type, swipe, wait, launch and terminate | S | the routes exist |
| Appium lifecycle: install Appium 3 and the driver, start the server, one session per run, health checks, restart when WDA dies, cleanup | M | "Real devices require WebDriverAgent client to run for as long as possible without reinstall/restart" (`XD:docs/reference/capabilities.md:56`); Xcode 27 changed the launch path within weeks of shipping (#22636, #2985) |
| Per-developer setup: a preflight check (`appium driver doctor xcuitest`, `XD:docs/getting-started/system-requirements.md:51-58`), per-user team ID and runner bundle ID, docs for free and paid teams, weekly re-signing on free IDs | M | Apple's signing rules, not code |
| Logs and screen: an os_trace or `--console` reader into the run log, an MJPEG URL for the watch view, PNG screenshots | S | |
| Testing on real phones (here, iOS 26.6.1 and 26.2) and on Xcode 26.x and 27 hosts | M | cannot run in CI; each Xcode release can break the runner |

**What dominates the cost** is per-developer signing and keeping the runner alive across Xcode and iOS releases. The observation mapping is small.

**It becomes L if** the bridge writes its own runner, or if free Apple IDs must be a smooth path, with automated weekly re-signing and slot management.

## Consequences for the plan

These are flagged for a later effort to decide. None is decided here.

1. **Which device layer for phones needs its own ADR.** The candidates are Appium-managed WDA, mobilecli, or WDA managed by the bridge. The first two keep the glossary rule that the bridge has no device automation of its own (`CONTEXT.md:21-22`, ADR-0002). The third breaks it, because the bridge would build, launch and port-forward the runner itself.
2. **Licenses and telemetry.**
   - mobilecli's FSL-1.1 is a non-compete, source-available license, so it needs a review against how the bridge will be distributed.
   - mobile-mcp sends PostHog telemetry by default.
   - pymobiledevice3 is GPL, and can be used only as a separate process.
3. **The driver seam has to become device-neutral before a second driver exists.** It would carry elements with role, label, value, identifier, frame, state and actions; refs issued per snapshot; and a statement of whether coordinate taps are allowed.
   - If the simulator driver keeps MobileBuildMCP's compact MCP output, its target rules live upstream and a WDA driver cannot match them (`MBM:262`).
   - This feeds the Observation schema and Device driver tickets. The Device driver ticket is blocked on this one.
4. **Is a paid Apple team a prerequisite?**
   - Free Apple IDs work with WDA, but profiles expire every 7 days and the runner uses one of three app slots on the phone.
   - mobilecli needs a paid team.
5. **Is sudo acceptable?**
   - On Xcode 27, a preinstalled WDA needs a RemoteXPC tunnel, created as root.
   - Always launching through `xcodebuild` might avoid the tunnel. Whether it does on Xcode 27 is unverified.
   - Xcode 27 shipped on 2026-09-14. This Mac (macOS 26.6.2) can install it, and it "requires a Mac running macOS Tahoe 26.6 or later" (release notes).
6. **Personal phones or dedicated test phones.** Automation brings a passcode prompt about once a day, changes the phone's keyboard settings, and makes removing the passcode the only way to run unattended.
7. **Where device app logs come from.** One path is `devicectl … --console`, which means launching the app outside MobileBuildMCP (`MBM:307`). The other is an os_trace reader filtered to the app. Either one feeds the run log.
8. **The watch view on a phone.** WDA's MJPEG stream gives a live screen with no extra tool. iPhone Mirroring cannot show a run, because it requires a locked phone.
9. **Typing non-ASCII text on a device.**
   - Through WDA it is untested.
   - pymobiledevice3's HID typing is ASCII only.
   - On the simulator, AXe is US-keyboard only (`MBM:475`).
   - This matters for scenarios that type Vietnamese.
10. **The Xcode on this Mac is behind.** It is 26.4.1, while one paired phone runs iOS 26.6.1. Appium's rule is that Xcode must carry the phone's SDK (`XD:docs/getting-started/system-requirements.md:62-65`). A spike should first pick Xcode 26.6 or 27.
11. **Parity can be tested without a phone.** WDA runs on simulators, so the observation projection can be compared against MobileBuildMCP on the same simulator screen first.

## Unverified

- **No device was used.** No WDA, Appium, mobilecli or pymobiledevice3 command was run against a device. Everything about device behaviour comes from source, docs and issues.
- **WDA timings on a device.** Per-snapshot and per-action latency are not published. The 0.49-1.16 s figures are for mobilecli's own runner (PR #432).
- **WDA's source size.** The token sizes are estimates re-rendered from the simulator sample, which assumes WDA would see the same 219 elements. WDA snapshots the app, while the sample is SpringBoard.
- **What WDA's snapshot contains.** Whether it includes the status bar, and whether system alerts appear under `defaultActiveApplication`.
- **Snapshot through `POST /elements`.** Whether it is fast enough to replace `/source` as the snapshot on real app screens.
- **Launching WDA through `xcodebuild` on Xcode 27.** Whether it works without a RemoteXPC tunnel.
- **Xcode 26.4.1 with the iOS 26.6.1 phone.** Whether it can run WDA there.
- **WDA over Wi-Fi only** on iOS 26 with Xcode 26.4.1.
- **Typing through WDA.** Whether Unicode and Vietnamese text types correctly through `/element/:uuid/value` or `/wda/keys`.
- **What `--console` captures.** Whether `devicectl … --console` output includes os_log and `Logger` lines, or only stdout and stderr.
- **MobileBuildMCP hosting a runner.** Whether `test_device` can run a runner that never finishes, as WDA's does.
- **mobilecli's device requirements.** Whether devicekit-ios needs "Enable UI Automation", and whether a free Apple ID can work with mobilecli at all.
- **Why mobilecli dropped WebDriverAgent** in 0.3.66.
- **iPhone Mirroring during an automated run.** The docs say the phone must be locked; this was not tested.
- **pymobiledevice3 on iOS 26.x.** HID touch and the mirror stream were validated only on an iOS 27 beta.
- **Xcode 27's agent tools on physical devices.** The release note names only simulators.
- **"Enable UI Automation" on iOS 26 and 27.** Whether its behaviour has changed. Apple's last public statement is from November 2022.
- **idb's "a subset works on Devices"** for HID (`IDB:website/docs/idb/ui.mdx:18`). The source shows none.
- **Maestro's timeline.** It is unverified that real-device support will ship "later this year".
