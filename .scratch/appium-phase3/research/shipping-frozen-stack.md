# Shipping the frozen Appium stack, and the private MCP client

Researched 2026-10-22 on `research/shipping-frozen-stack`, branched from `feat/appium-phase3` at `e40ff9763`. Ticket: [01 Shipping the frozen Appium stack](../issues/01-shipping-the-frozen-stack.md). Reading and throwaway experiments only: nothing was installed into the repo, no device or simulator was run, no `xcodebuild`, no Jev call, no `.env` read, and `~/Library/Application Support/jev-ios-bridge` was not touched. Every experiment ran under `/tmp` (listed in [Reproduction notes](#reproduction-notes)).

## Answer

The frozen stack cannot reach users through a lockfile. Claude Code's automatic plugin install refuses the Phase 1 lock for three independent reasons, and the npm tarball channel ignores a shipped lockfile for transitive versions. The delivery that satisfies Spec Decision 8 and needs no runtime download is to ship the stack as two archives built at release time and inside both the npm tarball and the plugin zip, outside `node_modules`:

1. a **stack archive**: the installed tree produced by `npm ci --ignore-scripts` from the byte-identical Phase 1 lock (about 88 to 91 MB gzipped, 368 MB extracted), with a per-file hash manifest;
2. a **WDA archive**: the exact Phase 1 runner (tree hash `5d1fc1c9…`, 47 files, x86_64 and arm64, 7.5 MB gzipped).

The bridge verifies each archive hash, extracts once into a content-addressed directory under its own private location, re-verifies on use, and passes the verified runner to XCUITest as `appium:usePreinstalledWDA=true` plus an absolute `appium:prebuiltWDAPath`. The UiAutomator2 server, test and settings APKs ride inside the stack archive; the driver finds them by package path. The private MCP client should be **`@modelcontextprotocol/sdk` pinned at exactly 1.32.1**, a direct bridge dependency whose version and integrity equal the SDK frozen inside the stack. Section 9 has the exact spec text; section 10 lists what only the owner can decide.

## Evidence level

- **Source fact**: read from an installed package, package metadata, a registry or release record, a vendor document, or observed in a probe I ran. Each carries its source.
- **Inference**: my reading of the facts. Labelled "Inference".
- **Not verified**: needs a device, a published release or an install I was not allowed to make. Collected in [section 11](#11-not-verified-and-suggested-spikes).

Citation keys. `C:` is the read-only candidate install `/Users/hugues_mini/Codes/AgentTools/jev-ios-bridge/.worktrees/feat/appium-mcp-migration/.scratch/appium-mcp-migration/candidate-stack/` (its `node_modules` is the Phase 1 tree). `R:` is `…/feat/appium-mcp-migration/.scratch/appium-mcp-migration/runtime/` (Phase 1's locally built WDA). `F:` is the committed [freeze manifest](../../appium-mcp-migration/evidence/phase1-freeze-20261018.json). `X:`, `U:`, `W:`, `M:` are `node_modules/appium-xcuitest-driver/`, `appium-uiautomator2-driver/`, `appium-xcuitest-driver/node_modules/appium-webdriveragent/` and `appium-mcp/` inside `C:`. Upstream links are the same paths at the pinned tags.

## 1. What the frozen graph is

### 1.1 Shape and size (source facts)

| Fact | Value | Source |
| --- | --- | --- |
| Lock | lockfileVersion 3, sha256 `f7732565…`; root dependencies `appium-mcp` 1.97.0 and `@modelcontextprotocol/sdk` 1.32.1 | `C:package-lock.json`, `F` `locks` |
| Entries | 1,221 lock entries; 706 distinct name@version; 566 distinct names | computed from `C:package-lock.json` |
| Bundled | 514 entries are `inBundle`: 258 inside xcuitest 12.17.1, 256 inside uiautomator2 8.7.0. Both drivers publish `bundleDependencies` (22 and 9 names), so their copies of appium-webdriveragent 16.14.2, appium-adb, appium-android-driver, appium-uiautomator2-server, io.appium.settings and others come from the driver tarballs, not from separate registry fetches | `C:package-lock.json`, `X:package.json`, `U:package.json` |
| Optional / peer | 245 optional entries, 61 peer entries | same lock |
| Two WDA copies | `appium-webdriveragent` 16.15.0 hoisted (a dependency of appium-mcp) and 16.14.2 inside xcuitest. The runner artifact comes from 16.14.2 | `F` `versions`, `C:package-lock.json` |
| Two MCP SDK generations | `@modelcontextprotocol/sdk` 1.32.1 (appium-mcp, fastmcp) and `@modelcontextprotocol/server`, `client`, `core` 2.3.1 (via fastmcp 4.22.4 → mcp-proxy 6.7.19) | `C:package-lock.json`, `C:node_modules/mcp-proxy/package.json` |
| Installed on macOS arm64 | 1,170 package copies, 36,488 files and symlinks, 368 MB (`du`) | `C:node_modules` |
| Largest parts | xcuitest driver 75.9 MB, uiautomator2 driver 72.4 MB (of which the three APKs are 21.2 MB), `@opentelemetry` 35.8 MB (optional), `@img` 18.2 MB, `@modelcontextprotocol` 21 MB, `@zip.js` 8.7 MB, `zod` 8.3 MB | `du -sk` on `C:node_modules` |
| Archive size | `tar` piped to `gzip -6` of the Phase 1 tree: 87.6 MB. Of a fresh `npm ci` tree (two extra optional packages, below): 91.3 MB | measured in `/tmp` |
| Fresh install time | `npm ci --ignore-scripts` from this lock, cold registry cache: 6.3 s (Node 22.22.2, npm 10.9.7); warm cache 3.5 s (Node 25.4.0, npm 11.8.0) | measured |
| Public seam | `appium-mcp` exports `./core` (`createAppiumMcpServer`, plugin API). `createAppiumMcpServer` imports `fastmcp` for its value; fastmcp statically imports `mcp-proxy`, which statically imports `@modelcontextprotocol/server` and `client` | `M:package.json#exports`, `M:src/core.ts`, `M:src/create-server.ts:16`, `C:node_modules/fastmcp/dist/chunk-TFX7BV4K.js:31`, `C:node_modules/mcp-proxy/dist/startStdioServer-DHm0KcPu.mjs:3,12-13` |

Inference: the private child that Phase 1 ran (`protocol-server.mjs` importing `appium-mcp/core`) therefore loads both SDK generations in one process: 1.32.1 for fastmcp's protocol layer and 2.3.1 through mcp-proxy. Phase 1's recorded `loaded` list (523 files) filters to the ten selected packages (`C:experiments/stack-probe.mjs`, the `names.has(pkg.name)` hook), so fastmcp, mcp-proxy, `@modelcontextprotocol/server|client|core` and zod are loaded but not recorded. Ticket 13 (provenance) should know.

### 1.2 Install scripts and what `--ignore-scripts` skips (source facts)

`hasInstallScript` is set on eight lock entries. None of them changes the tree on macOS arm64.

| Package | Script | What skipping does |
| --- | --- | --- |
| `appium` 3.8.0 | `postinstall: node ./scripts/autoinstall-extensions.js` | Nothing. It only installs drivers when `--drivers` or `--plugins` is passed to `npm install` (`C:node_modules/appium/scripts/autoinstall-extensions.js`). |
| `@appium/coresim` 1.11.1 (inside xcuitest) | `install: node scripts/install.mjs`, which runs `node-gyp-build` | The package ships `prebuilds/darwin-arm64` only, so the native addon loads at runtime on Apple silicon. On Intel there is no prebuild and the compile step is the skipped script. `appium-ios-simulator` 10.7.1 uses this addon for `listSimulators`, `createSimulator` and other simulator calls, with no `simctl` fallback in those paths (`X:node_modules/appium-ios-simulator/lib/utils/list-simulators.ts`, `lib/native/native-simctl.ts`). |
| `appium-ios-tuntap` 2.2.6 (inside xcuitest) | `install: node-gyp-build` | Prebuilds exist for darwin-arm64, linux-arm64, linux-x64, win32-x64. Used for real-device tunnels; I did not trace whether it loads on the simulator path. |
| `edgedriver` 6.3.1, `geckodriver` 6.1.1 | postinstall runs `dist/install.js` | Downloads a browser driver only when `EDGEDRIVER_AUTO_INSTALL` or `GECKODRIVER_AUTO_INSTALL` is set (`dist/install.js`). They arrive through `@wdio/utils`; nothing in the bridge path uses them. |
| `protobufjs` 7.6.6, `tldjs` 2.3.2 | postinstall | Version-scheme warning; rule-list update only with an npm config flag. |
| `fsevents` 2.3.3 | implicit | Prebuilt `.node` is in the package. |

Source fact, measured: a fresh `npm ci --ignore-scripts` from the Phase 1 lock reproduces the Phase 1 `node_modules` byte for byte. Of 36,488 files and symlinks, the only differences are `.package-lock.json` and 24 extra files from two optional packages (`@emnapi/runtime`, `@img/sharp-wasm32`) that npm 10.9.7 and npm 11.8.0 install and the Phase 1 tree does not have. No content difference, no executable-bit difference. So the scripts add nothing on arm64, and a tree-hash identity check must not depend on the npm version that built the tree.

### 1.3 Node and licences (source facts)

- Node 24: every engine range in the lock accepts 24.0.0 and 26.0.0 except `@img/sharp-win32-ia32` (Windows-only, optional). Node 22.12 would fail two swagger packages (`>=22.19`). Computed from the lock with npm's bundled `semver`. The Phase 1 live matrix ran on Node v26.8.1 (`F` `node`); CI runs host regressions on 24.0.0, 24 and 26 (`.github/workflows/check.yml`). Live proof on Node 24 does not exist.
- Licences of the 1,170 installed copies: MIT 858, Apache-2.0 136, ISC 80, BSD-3-Clause 24, BlueOak-1.0.0 22, BSD-2-Clause 9, then single digits of Unlicense, CC0, CC-BY-3.0 (`spdx-exceptions`, data), WTFPL, `MIT or GPL-2.0` (`unorm`, dual), CC-BY-4.0 (`@promptbook/utils`). One LGPL-3.0-or-later binary is installed: `@img/sharp-libvips-darwin-arm64` (28 lock entries across platforms). Three packages carry no `license` field but ship an MIT licence file or a `licenses` array (`pipenet`, `ftp-response-parser`, `parse-listing`). `appium-webdriveragent` declares Apache-2.0 in `package.json` but its `LICENSE` file is Facebook's BSD text (`W:package.json`, `W:LICENSE`). `io.appium.settings` ships a `NOTICE.txt`. Source: `C:package-lock.json`, `C:node_modules/*/package.json`.
- Inference: shipping these inside our own artifact makes the project a redistributor of all of them, including the LGPL dylib and the licence texts; an install from a lockfile would not.

## 2. What the plugin installer accepts

Source facts from the [Claude Code plugin loading reference](https://code.claude.com/docs/en/plugins/loading#node-js-package-dependencies):

- The install runs only when the plugin root has a `package.json` and an npm or Bun lockfile, with no lifecycle scripts. Every dependency must be a registry package pinned to an exact version in the lockfile; "A plugin with a git, GitHub, folder, workspace, or linked dependency gets no install." npm runs in a separate folder, so the plugin's `.npmrc` is not read. A plugin whose `package.json` sets npm `overrides` gets no install. 60-second timeout.
- Archive sources: 256 MiB download, 120 s response, and extraction limits of 100,000 entries, 512 MiB per file, 1 GiB total, 50x compression ratio ([host a marketplace](https://code.claude.com/docs/en/plugins/host-marketplace#stay-within-the-download-limits-for-hosted-files), [archive source](https://code.claude.com/docs/en/plugins/marketplace-reference#archive-plugin-source)). The docs say nothing about file modes or symlinks in archives. This repo's own notes say the zip carries no dependencies so that MobileBuildMCP's AXe binary keeps its executable bit (`scripts/build-plugin.mjs` header, `plugin/README.md`).

Source facts, observed with Claude Code 2.1.307. I installed throwaway plugins from local git repositories into an isolated config (`CLAUDE_CONFIG_DIR` and `CLAUDE_CODE_PLUGIN_CACHE_DIR` under `/tmp/cc-test`; nothing in `~/.claude` changed). The installer logged its exact command, `npm ci --ignore-scripts --workspaces=false --no-audit --no-fund`. This is a git `url` source, not an `archive`, but the docs describe one dependency-install step for every copied plugin. The first probes ran with `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` set in my shell; the decisive ones were repeated with it unset and gave the same results.

| Probe (lock source) | Result |
| --- | --- |
| This repo's current lock (212 entries) | Installed. |
| One-package lock; `express`; `jest`; `appium` alone (321 entries); `webdriverio`; `@modelcontextprotocol/sdk` 1.32.1 + `zod` 4.6.6 | Installed. |
| Each uiautomator2 dependency alone (`appium-adb`, `appium-android-driver`, `sharp`, settings, server) | Installed. |
| `applesign` 5.0.1 alone (appium-mcp's optional dependency) | **Refused**: "its package-lock.json entry node_modules/applesign has a dependency that is not a registry package and version range: fs-walk". `applesign` depends on `github:trufae/fs-walk#patch-1` and `github:TooTallNate/plist.js#e17373ef…`. |
| Phase 1 lock, merged with the bridge's dependencies (1,247 entries) | **Refused**: "Skipped installing this plugin's dependencies: its package-lock.json entry node_modules/appium-uiautomator2-driver/node_modules/@appium/base-driver is a folder link or a bundled copy." |
| `appium-uiautomator2-driver` or `appium-xcuitest-driver` with a fresh lock (no `inBundle` flags) | **Failed in npm**: `EUSAGE … Missing: @appium/css-locator-to-native@1.0.7 from lock file, appium-adb@16.0.5, appium-android-driver@14.2.0, appium-uiautomator2-server…`. The listed names are exactly the driver's `bundleDependencies`. The same `npm ci` command run by me on the same files succeeded. |

Inference from the last row: Claude Code drops the lock entries of packages a parent bundles from its working copy, which npm then rejects as out of sync. Removing `bundleDependencies`, `peer`, `optional`, `os`/`cpu` or `hasInstallScript` fields from the lock did not help.

Consequence: the Phase 1 stack cannot be a root dependency of the plugin. The frozen lock contains two git-hosted optional dependencies (via `applesign`), 514 bundled copies, and drivers that bundle. Removing `applesign` needs npm `overrides`, which the installer also refuses. This is a property of the vendor packages, not a fixable detail of our lock.

## 3. What the npm tarball channel does

Source facts:

- The bridge is not on the registry. `package.json` has `"private": true`; users install a tarball attached to the GitHub release with `npm install ./jev-ios-bridge-X.tgz` (`docs/guide/01-quickstart.md`, `plugin/README.md` Release step 2). The packaging proof installs it with `npm install --ignore-scripts` and installs the plugin copy with `npm ci --ignore-scripts` (`tests/fixtures/observed-packaging/proof.mjs:135,153`).
- Measured, npm 10.9.7: a `npm-shrinkwrap.json` inside a locally installed tarball is **ignored**. I packed a package whose shrinkwrap pinned `ms` 2.0.0 against `^2.0.0`; installing the tarball into an empty project gave `ms` 2.1.3. The [npm shrinkwrap doc](https://docs.npmjs.com/cli/v11/configuring-npm/npm-shrinkwrap-json) says only that the file "may be included when publishing" and that it is preferred over `package-lock.json` in a package root; it does not say what happens for a dependency. Inference: Arborist applies a dependency's shrinkwrap only where the manifest carries `_hasShrinkwrap` (`@npmcli/arborist/lib/node.js:162`, `build-ideal-tree.js:776-784`), which registry metadata supplies and a tarball spec does not. So today's tarball channel does not freeze transitive versions, for the existing dependencies too.
- Measured: `bundleDependencies` in a tarball are unpacked exactly as packed, with no resolution and no fetch (`bundle-probe`, `ms` 2.0.0).
- Measured: `npm ci --os=… --cpu=…` selects platform-specific optional packages regardless of the host (a darwin-arm64 host produced the linux-x64 `sharp` set), so a darwin-arm64 tree can be built on a Linux CI runner.

## 4. WebDriverAgent

### 4.1 How the XCUITest driver chooses its runner (source facts)

`X:lib/commands/wda/startup.ts`, `W:lib/wda-strategies.ts`, `W:lib/webdriveragent.ts`, `X:lib/commands/wda/constants.ts`:

| Capabilities | What happens |
| --- | --- |
| `appium:webDriverAgentUrl` set | Attach to whatever WDA answers at that URL. Nothing installed or launched. |
| `appium:usePreinstalledWDA=true` (needs iOS or tvOS 17+) | No xcodebuild object is created. With `appium:prebuiltWDAPath`, the driver reads the bundle id from that `.app`, removes other WDA runner apps from the simulator (same `CFBundleName`), reinstalls the given one, and launches it through `appium-ios-simulator`'s `launchApp` with `terminateExisting` and `activateSuspended` (`X:lib/device/wda-host-ops.ts`, `createSimulatorHostOps`). Without `prebuiltWDAPath` it launches whatever WDA runner is already on the simulator. |
| Neither (vendor default) | `xcodebuild build-for-testing` then `test-without-building` from the WDA Xcode project inside the npm package, into Xcode's default DerivedData (`~/Library/Developer/Xcode/DerivedData/WebDriverAgent-<hash>`) or `derivedDataPath`. `usePrebuiltWDA` skips the build; `useNewWDA` forces uninstall and rebuild; `setupCaching` reuses an already running WDA on the same port when bundle id and `upgradedAt` match. |

Phase 1 used the second row with `prebuiltWDAPath` pointing at the frozen runner (`C:experiments/live-protocol-client.mjs:79`, `phase-1-live.md` "WDA artifact"). Cold start took 27.76 s to HTTP 200, so `wdaLaunchTimeout` is 120000 (`F` `wdaDiagnosis`).

### 4.2 What performs "latest release" and "newest cache" selection (source facts)

- appium-mcp 1.97.0 default iOS simulator capabilities are `appium:usePrebuiltWDA=true` (the xcodebuild row), `wdaStartupRetries` 4, `wdaStartupRetryInterval` 20000 (`M:src/tools/session/create-session.ts`, `buildIOSCapabilities`).
- The upstream tool `appium_prepare_ios_simulator` (`M:src/tools/ios/prepare-ios-simulator.ts`) resolves the **latest** GitHub release by following `https://github.com/appium/WebDriverAgent/releases/latest`, downloads `WebDriverAgentRunner-Build-Sim-<arch>.zip`, caches it at `~/.cache/appium-mcp/wda/<version>/` (`M:src/utils/paths.ts`, `os.homedir()`), and when not forced picks the **newest cached version directory** by numeric sort. It then launches that WDA and returns `appium:webDriverAgentUrl` for the session. `prepare-ios-real-device.ts` downloads and re-signs likewise.
- The driver ships two download scripts, `download-wda` and `download-wda-sim` (`X:scripts/download-wda.mjs`, a GitHub release URL built from the bundled WDA version), and the WDA package ships `fetch-prebuilt-wda` (`W:Scripts/fetch-prebuilt-wda.mjs`). Upstream's newest WDA release today is v16.15.3 (2026-10-16), so "latest" is not 16.14.2.

Settings and rules that stop all of it:

1. Always send `appium:usePreinstalledWDA=true` with an absolute `appium:prebuiltWDAPath` to the verified runner. The driver then never reaches xcodebuild or any download code (`isXcodebuildNeeded` is false) and replaces any other WDA runner on the simulator.
2. Refuse every capability that selects another runner or build: `webDriverAgentUrl`, `usePrebuiltWDA`, `prebuildWDA`, `useNewWDA`, `derivedDataPath`, `bootstrapPath`, `agentPath`, `useXctestrunFile`, `updatedWDABundleId`, `updatedWDABundleIdSuffix`, `xcodeOrgId`, `xcodeSigningId`, `xcodeConfigFile`, `keychainPath`. Phase 1's public-extension probe already refuses two alternates (`C:experiments/public-extension-probe.mjs`).
3. Never register or allow `appium_prepare_ios_simulator` or `prepare_ios_real_device`, and never run the driver or WDA download scripts. Phase 1's server allowlists five `appium_*` tools (`C:experiments/protocol-server.mjs`).
4. Check the version WDA reports at `/status` (`build.version`) against 16.14.2. The driver logs it (`startup.ts`, `finalizeSuccessfulStartup`).

Inference: the only reader of `~/.cache/appium-mcp/wda` is the prepare tool, so rule 3 is enough; pointing the child's `HOME` elsewhere would also hide the cache but would stop `simctl` finding the default device set. Ticket 02 should decide `HOME`.

### 4.3 The frozen artifact (source facts)

`F` `wda`, `R:wda-16.14.2/…/WebDriverAgentRunner-Runner.app`, and read-only `vtool`/`plutil` on the build:

- Built from the xcuitest-bundled `appium-webdriveragent` 16.14.2 with `xcodebuild -project … -scheme WebDriverAgentRunner -configuration Debug -destination "generic/platform=iOS Simulator" -derivedDataPath runtime/wda-16.14.2 CODE_SIGNING_ALLOWED=NO build-for-testing`, Xcode 27.0, SDK `iphonesimulator27.0` (`.audit/phase1-finish-20261018/1C-wda-build.log` in that worktree).
- 47 files, 25,296,604 bytes, tree hash `5d1fc1c99908e253303f6de35bf26ed4a74a75817f704e7a3646b72b5271ba04`, architectures x86_64 and arm64. The tree hash is `sha256` of the concatenation, over files sorted by path bytes, of `path + NUL + file sha256 bytes` (`C:experiments/stack-probe.mjs`). Runner bundle id `com.facebook.WebDriverAgentRunner.xctrunner`, `MinimumOSVersion` 17.0, runner and Xcode frameworks `minos` 17.0, `WebDriverAgentLib` `minos` 15.0 and version 16.14.2.
- The runner is Apple's `XCTRunner` (`Identifier=com.apple.XCTRunner`, "Software Signing"); the test bundle is ad hoc. `codesign --verify --strict` fails on it, and the simulator runs it regardless (`F` `wda.signing`). It embeds copies of Xcode 27's XCTest, Testing, XCUIAutomation and related frameworks.
- Plist `DTXcodeBuild` is `27A252a` while `F` `toolchain` says Xcode 27.0 (27A266a). Not reconciled; low weight.
- It exists on one machine. `.scratch/appium-mcp-migration/runtime/` is **untracked** in the `feat/appium-mcp-migration` worktree (`git status` shows `??`), and `.gitignore` also ignores `*.tgz`. Phase 1's twelve-case evidence depends on these exact bytes.

### 4.4 Upstream's prebuilt asset is not the same artifact (source facts)

I downloaded the v16.14.2 release assets into an empty temp directory and read them without running anything ([release](https://github.com/appium/WebDriverAgent/releases/tag/v16.14.2), published 2026-10-08):

| | Phase 1 frozen build | Upstream `…-Build-Sim-arm64.zip` |
| --- | --- | --- |
| Size | 25.3 MB, 47 files, one universal binary | 5,662,846 B zip, 18 MB unpacked, one architecture per zip (x86_64 is a separate zip) |
| Toolchain | Xcode 27.0, SDK 27.0, runner `minos` 17.0 | Xcode 16.4 (`DTXcode` 1640), SDK 18.4 (lib built against 18.5), runner `MinimumOSVersion` 13.0, lib `minos` 15.0 |
| `WebDriverAgentLib` version | 16.14.2 | **16.14.1** |
| Digest | tree `5d1fc1c9…` | GitHub digest `sha256:fbfc258e…` (arm64), `sha256:b0dbede8…` (x86_64) |

Inference: upstream's asset would report 16.14.1 at `/status` under a "16.14.2" tag, so the Phase 1 stack identity ("loaded WDA 16.14.2") would not hold, and none of the twelve live cases ran on it. Adopting it means re-running the six iOS cases.

### 4.5 Cost of building it on the user's machine

- Phase 1's build: the DerivedData directory was created at 21:58:52 and the log last written at 21:59:09, so about 17 s on this Apple-silicon Mac with Xcode 27 for a universal Debug build (inference from timestamps, one observation). The DerivedData tree is 216 MB (178 MB `Build`, 21 MB module cache, 16 MB index).
- The vendor default flow builds per project path. Inference: Xcode names DerivedData by a hash of the project path, and the project lives inside the installed package, so each plugin version directory (the path changes at every plugin update, see the [loading reference](https://code.claude.com/docs/en/plugins/loading#find-plugins-on-disk)) would trigger a fresh build and leave an orphaned 200 MB directory in `~/Library/Developer/Xcode/DerivedData`.
- A built runner's hash depends on the user's Xcode, so a hash can only be recorded after the fact, not frozen. It also adds an `xcodebuild` child process that Phase 2's ownership controls must track, plus failure modes (licence not accepted, missing components).

### 4.6 Where a frozen artifact could live

- Inside the installed package: `node_modules/jev-ios-bridge/…` (npm) or `${CLAUDE_PLUGIN_ROOT}/…` (plugin, replaced at every update). `prebuiltWDAPath` only needs read access; `simctl install` copies the app into the simulator.
- A bridge-owned content-addressed directory, extracted once from an archive in the package, for example `…/jev-ios-bridge/wda/<treeSha256>/`, or `${CLAUDE_PLUGIN_DATA}` for the plugin (kept across updates, deleted on uninstall; [manifest reference](https://code.claude.com/docs/en/plugins/manifest-reference#environment-variables)). Inference: shipping it as one archive avoids the zip's unknown executable-bit handling (the runner binary needs `+x`) and gives one hash to check.

## 5. UiAutomator2 server and settings APKs (source facts)

- Three APKs ship inside the driver tarball, with these hashes in `F` `androidAutomationApks`: `appium-uiautomator2-server-v10.6.6.apk` (17,968,807 B, `8ff760a2…`), `appium-uiautomator2-server-debug-androidTest.apk` (197,183 B, `e6f72928…`) and `io.appium.settings` `settings_apk-debug.apk` (3,076,274 B, `bcfc5e6c…`).
- Paths come from code, not capabilities: `SERVER_APK_PATH` and `TEST_APK_PATH` in `appium-uiautomator2-server/index.mjs`, `getSettingsApkPath()` in `io.appium.settings/lib/utils.ts`. The only controls are `skipServerInstallation` and `skipSettingsAppReinstall`.
- Check and reinstall (`U:lib/uiautomator2-server/core.ts` `installServerApk`): `adb.getApplicationInstallState` compares the server package against the APK. Not installed or older: install with replace. Newer on device, or one of the two packages missing while the other is present: uninstall both, then install both. The test package has no version, so presence counts as "same". The settings app goes through `adb.installOrUpgrade` (`appium-android-driver/lib/commands/device/utils.ts` `pushSettingsApp`). All of this writes to the device; ticket 02 owns it. Phase 1 ran with a process-local Temurin 21 `JAVA_HOME` (`F` `toolchain`), and Spec Decision 9 already requires documenting SDK, Java and Xcode prerequisites.
- No download is involved. The APKs are covered by the integrity of the driver tarball, and the freeze manifest already records their hashes.

## 6. MCP client package and protocol negotiation

### 6.1 Source facts

- Spec 2025-11-25: the client sends the latest version it supports in `initialize`; a server that supports it "MUST respond with the same version", otherwise with another version it supports, "SHOULD be the latest"; a client that does not support the answer "SHOULD disconnect" ([lifecycle, version negotiation](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#version-negotiation)).
- Spec 2026-07-28 removes the handshake: every request carries its version. Its compatibility matrix says a modern-only client against a legacy server **fails**, and a dual-era client on stdio probes with `server/discover` and falls back to `initialize` ([versioning and compatibility](https://modelcontextprotocol.io/specification/2026-07-28/basic/lifecycle)).
- appium-mcp 1.97.0 serves through `@modelcontextprotocol/sdk` 1.32.1: `LATEST_PROTOCOL_VERSION` `2025-11-25`, `SUPPORTED_PROTOCOL_VERSIONS` `[2025-11-25, 2025-06-18, 2025-03-26, 2024-11-05, 2024-10-07]`; its `_oninitialize` answers with the requested version when supported, else the latest (`C:node_modules/@modelcontextprotocol/sdk/dist/esm/server/index.js:259-270`, `types.js`).
- The 2.x client (`@modelcontextprotocol/client` 2.1.0 and 2.3.1) has the same `LATEST_PROTOCOL_VERSION` and legacy list in `@modelcontextprotocol/core`. Its `DEFAULT_VERSION_NEGOTIATION_MODE` is `"legacy"`: a plain `initialize` offering `2025-11-25`, failing if the reply is outside its list (`dist/index.mjs` in the 2.1.0 tarball line 2512 and `_legacyHandshake`; same in 2.3.1 at lines 2559 and 3347-3370). Its `"auto"` mode, and `{ pin }`, probe with `server/discover`; on the SDK's stdio transport the probe runs "on a disposable sibling process" (`negotiateStdioViaSibling`), i.e. a second child. `{ pin }` is for 2026-07-28 and later only.
- Both generations' `StdioClientTransport` spawn with `cross-spawn` and expose `pid`; neither creates a process group (`dist/esm/client/stdio.js`, 2.1.0 `dist/stdio.mjs`). Phase 1's live clients wrapped `python3 owned-launcher.py` in the 1.x transport (`C:experiments/live-protocol-client.mjs:85`).
- Both generations already share lockfiles. The bridge's lock holds `@modelcontextprotocol/sdk` 1.30.1 (through `mobilebuildmcp` `^1.27.1`) and `server`/`core` 2.1.0 (`package-lock.json`); the Phase 1 lock holds sdk 1.32.1 and server/client/core 2.3.1. They are different package names. The coupling is `zod` (sdk: `^3.25 || ^4`; 2.x: `^4.2.0`) and the exact pin from each 2.x package to the same-version `core`.
- Support: the SDK README says v2 is "the stable release line" and v1.x "continues to receive bug fixes and security updates for at least six months after the v2 release (2026-07-27)"; v1.x last released 1.32.1 on 2026-10-05 ([repo README](https://github.com/modelcontextprotocol/typescript-sdk)). `npm view` shows `latest` 1.32.1 for `sdk` and 2.3.1 for `server`. Licence: sdk MIT, client/server 2.1.0 MIT, 2.3.1 Apache-2.0.
- `client.close()` in the 1.x SDK closes stdin, then SIGTERM, then SIGKILL; a transport can be replaced by any object implementing the `Transport` interface in either generation. The bridge's ownership rules (Phase 2) will likely want its own spawn.
- Merge test (lock-only, in `/tmp`): starting from the Phase 1 lock and adding the bridge's current dependencies changes exactly two frozen entries, `@modelcontextprotocol/server` 2.3.1 to 2.1.0 and `zod` 4.6.6 to 4.6.5, because the bridge pins both exactly. Pinning the bridge to 2.3.1 and 4.6.6 leaves all 1,221 frozen entries identical (path, version, integrity) and adds 26 of the bridge's own. This only matters if the stack ever sits in a product lock (section 7, option 1).

### 6.2 Recommendation and reasoning

Use `@modelcontextprotocol/sdk` `Client` at exactly **1.32.1**.

- It is the client every Phase 1 wire fixture and live case used, so the recorded `initialize` payload, capability set and result validation are the qualified ones.
- It is the same SDK generation and exact version that serves inside the frozen appium-mcp, so negotiation is same-version on both ends (`2025-11-25`).
- Its version and sha512 integrity (`sha512-2DdE+SJDtzLEEWzY1ZjY7Q+VcPhcV1KisD3zI4u0XZyktsjHum1mwbMI+JaulUBi2OZk+KJAi2uPXzxichPkdw==`) are already part of the frozen record, so a startup check can compare the bridge's copy with the stack manifest.
- As a root dependency it installs through the plugin installer (probe: sdk 1.32.1 + zod 4.6.6 installed).
- The bridge's own server stays on `@modelcontextprotocol/server` 2.1.0. Two generations coexisting is already the case in the current lock and inside the stack. A 2.x client would have to match the server's `core` pin (2.1.0) or add a second copy of `core`, and would need its wire fixtures re-recorded.

Inference, the rule behind it: the private connection's client should be the same package family and exact version as the protocol layer inside the frozen server. When a future stack moves appium-mcp to SDK 2.x, the client changes with it in the same re-freeze. If a 2.x client is ever used here, pin legacy negotiation explicitly; `auto` would start a second appium-mcp child that the ownership layer does not know about, and a modern-only client cannot talk to this server at all.

Risk: v1.x is the maintenance line with a stated floor of January 2027. Nothing in the bridge's public server depends on it.

## 7. Delivery options compared

| # | Option | Plugin | npm tarball | Frozen graph kept exactly | Runtime download | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Stack as dependencies of the product lock | **Refused** by Claude Code (git optional deps, bundled copies, EUSAGE; sections 2) | Works, but transitive versions are not frozen without bundling (section 3) | Lock merge can embed the frozen entries if two pins move; the installers cannot | None | Small packages, fails where it matters |
| 2 | `bundleDependencies` in the tarball; vendored `node_modules` in the zip | Not tested; collides with the installer's own `node_modules` move; zip mode handling unknown | Works (probe) | Yes, by construction | None | About 90 MB per artifact; two mechanisms |
| 3 | **Stack archive plus WDA archive, extracted on first use** | Works (archive is a plain file outside `node_modules`; root lock holds only bridge dependencies, which installs) | Works | Yes: archive hash, per-file manifest | None (extraction is local: 3.3 s for the stack, 0.03 s for the runner on this Mac) | About 95 to 99 MB added to each artifact; about 375 MB disk per extracted stack |
| 4 | Bridge or a hook runs `npm ci` at first use or session start | Works technically | Works | Lock integrity | **Yes** (registry, at run time) | Small packages; breaks the requirement |
| 5 | Option 3 with optional parts pruned (`@opentelemetry` 35.8 MB, libvips 17.8 MB, mocha and the `applesign` subtree) | as 3 | as 3 | **No**: untested tree | None | Maybe 50 to 60 MB less; needs re-qualification, so later |

WDA, orthogonal to the above:

| # | WDA option | Fits Phase 1 evidence | Runtime download | Needs Xcode build on user machine | Notes |
| --- | --- | --- | --- | --- | --- |
| A | **Ship the exact Phase 1 runner** (7.5 MB gz) | Yes, same bytes as 12/12 GO | None | No | Redistributes Apple's XCTRunner and Xcode framework copies; runtime range proven only on iOS 26.5 |
| B | Build on first use with Phase 1's recipe into a bridge-owned directory | No (hash differs per Xcode) | None | Yes (about 17 s observed, 216 MB DerivedData, an owned `xcodebuild` process) | No redistribution; hash recorded after the fact |
| C | Vendor upstream's v16.14.2 sim zips (5.7 MB per architecture) | No: Xcode 16.4 build, reports 16.14.1 | None at runtime (fetched at release) | No | Requires re-running the six iOS cases |
| D | Download pinned upstream asset at first use | No | **Yes** | No | Rejected by the requirement |
| E | Vendor default (xcodebuild into DerivedData, or appium-mcp's prepare tool) | No | Prepare tool downloads latest | Yes, per plugin version | Rejected by Spec Decision 8 |

## 8. Recommendation

**Delivery option 3 with WDA option A, client `@modelcontextprotocol/sdk` 1.32.1.**

Why:

- It is the only option that works in both channels, keeps the Phase 1 evidence chain (same lock hash, same tree, same runner bytes) and has no runtime download.
- It avoids all three installer refusals because the stack is not in the plugin's lock. The root lock stays a normal registry-only lock of the bridge's own dependencies plus the exact MCP client, which the installer accepts.
- It makes Testing Decision 7 straightforward: the stack manifest holds package integrities and file hashes, the runner record holds architecture, tree hash and signing observations, and a different cache or upstream artifact has no path to the session because the bridge always supplies its own verified path.
- First-use extraction is local, atomic and cheap.

Release inputs (inference, to be refined in the build plan):

- `stack/package.json` and `stack/package-lock.json`, byte-identical to the candidate files (lock sha256 `f7732565…`, `package.json` sha256 `e7fb906b…` in `F`), replacing the `.scratch` path in CI (`npm ci --prefix stack`).
- A release script builds the archive on any runner with `npm ci --ignore-scripts --os=darwin --cpu=arm64` under a pinned Node and npm, then writes the file manifest. Because npm 10 and 11 install two extra optional wasm packages that the Phase 1 tree lacks, the manifest, not the lock, is the identity of the archive. It is not committed (about 90 MB); the build reproduces it, and the bridge's constants carry its hash.
- The WDA archive is committed (7.5 MB), named `.tar.gz` to avoid the repo's `*.tgz` ignore, with a provenance JSON. It should be copied out of the untracked `runtime/` directory before that worktree is removed.
- A third-party notices file for the redistributed packages and the runner.

Child entry (inference): the bridge's extension script cannot resolve `appium-mcp/core` by bare specifier from `dist/`, and `exports` has no `require` condition. It should import the extracted tree by absolute file URL, and take `zod` from the same tree so the plugin API sees one zod copy.

## 9. Proposed changes to "Entry and composition" in `.scratch/appium-mcp-migration/phases/phase-3-adapter.md`

Keep the first three paragraphs as they are ("Require Phase 1 GO…", "Implement one Appium device-driver composition…", "Use a private bounded MCP connection…"). Replace the last paragraph (from "Before importing/starting automation" to "…replaced by one range.") with the following.

> Before importing or starting automation, verify the selected runtime and restrict the child environment. Pin resolved versions and runtime artifacts, not an npm wrapper, and refuse any mismatch before session creation.
>
> **Frozen stack delivery.** The Phase 1 stack ships as bridge-owned release inputs and is never installed, built or downloaded when the bridge runs:
>
> - `stack/package.json` and `stack/package-lock.json` hold the Phase 1 candidate files byte for byte. CI and host tests install them with `npm ci --prefix stack`. They are not root dependencies of the product: the product's `package.json` and lockfile list only the bridge's own dependencies and the exact MCP client below, because Claude Code's automatic plugin install refuses the stack lock (git-hosted optional dependencies, bundled copies).
> - The release builds one stack archive from that lock (`npm ci --ignore-scripts` for darwin-arm64 under a pinned Node and npm) plus a manifest of every file hash, package integrity and the three Android automation APK hashes. The archive is a plain file in the npm tarball's `files` and in the plugin zip, outside `node_modules`.
> - The release also ships the exact Phase 1 WebDriverAgent runner (tree hash `5d1fc1c99908e253303f6de35bf26ed4a74a75817f704e7a3646b72b5271ba04`, x86_64 and arm64) as a second archive with a provenance record: source package and integrity, Xcode and SDK versions, build command, signing observations. The archive hashes and the stack identity are constants of the built bridge.
> - On first use the bridge verifies each archive hash, extracts to a temporary directory under its private per-account location, verifies the manifest, and renames into a content-addressed directory without overwriting. It uses no network, install scripts, npm or xcodebuild. Every start re-checks the extraction marker and the Phase 1 loaded-file hashes and refuses on mismatch.
> - iOS sessions always set `appium:usePreinstalledWDA=true` and the absolute `appium:prebuiltWDAPath` of the verified runner, plus the Phase 1 `wdaLaunchTimeout`. They refuse `webDriverAgentUrl`, `usePrebuiltWDA`, `prebuildWDA`, `useNewWDA`, `derivedDataPath`, `bootstrapPath`, `agentPath`, `useXctestrunFile`, `updatedWDABundleId`, `updatedWDABundleIdSuffix` and the Xcode signing capabilities. The composition never exposes or calls `appium_prepare_ios_simulator` or `prepare_ios_real_device`, never runs the driver's or WDA package's download or build scripts, and refuses a WDA whose reported version is not 16.14.2.
> - Android sessions use only the driver's packaged server, test and settings APKs, whose hashes must match the manifest. Capabilities that skip server installation or settings reinstall are not accepted.
> - The supported host is macOS on Apple silicon with Node 24 or later. Any other host refuses before effects.
>
> **Private MCP client.** The private connection uses the `Client` of `@modelcontextprotocol/sdk`, a direct dependency pinned at exactly 1.32.1, the version and integrity frozen inside the stack. Startup compares them with the stack manifest. The client offers the SDK's latest protocol version through the plain `initialize` handshake and refuses any negotiated version outside the stack's recorded list. The public server keeps `@modelcontextprotocol/server`; the two SDK generations are different packages and stay separate. The client generation follows the frozen server's: a future stack on SDK 2.x changes the client in the same re-freeze, with legacy negotiation pinned explicitly, never `auto`, which would start an unowned second child.

Consequential edits elsewhere in the same file (optional, for the spec owner):

- "Verification and exit": add that the packaged-install proof (tarball and plugin zip) contains both archives, that first-use extraction works offline, that a tampered archive, extraction marker or runner is refused before any session, and that Claude Code's install of the plugin completes.
- "Diagnostics and allowed native helpers" and ticket 02: the WDA reinstall onto the simulator at every session start (`preparePreinstalled` removes other WDA runners) and the Android APK install, upgrade or uninstall are device side effects to decide.

## 10. Choices left for the owner

These become grilling tickets.

1. **Redistributing Apple-derived binaries.** The frozen runner contains Apple's signed `XCTRunner` and copies of Xcode 27's XCTest, Testing and XCUIAutomation frameworks. Appium publishes the same kind of asset, but I could not read Apple's agreement here, so whether we may ship it in our release is unverified. The alternative is WDA option B (build on first use).
2. **Size.** Each npm tarball and plugin zip grows from about 0.2 MB to about 95 to 99 MB, and each installed stack takes about 375 MB on disk, doubled for two channels and for the 14 days a replaced plugin version stays cached. Accept, or pay for pruning plus re-qualification (option 5)?
3. **Platforms.** The archive is a darwin-arm64 tree, the Phase 1 hosts were Apple silicon, and the current guide already says Android runs were "tried only on Apple silicon". Declare Apple silicon the only supported host for the Appium era, or build and qualify an Intel tree?
4. **Supported iOS runtime range.** The runner is proven live only on iOS 26.5 with Xcode 27.0; the driver's own floor for this mode is iOS 17. What do the docs claim?
5. **Node range.** Live evidence is Node 26.8.1 only. Keep "Node 24 or later" with host-only evidence for 24, or add a live case on 24 in Phase 4?
6. **Keep the npm tarball as a supported channel.** It works with option 3 and is how CI proves packaging, but it is a second install path to maintain. Keep, or make the plugin the only supported install and the tarball a development artifact?
7. **Where the extracted stack lives.** One shared directory under the bridge's per-account location, or `${CLAUDE_PLUGIN_DATA}` for the plugin (clean uninstall, not shared with the CLI)?
8. **Licence posture.** Ship a notices file; decide how to handle the LGPL libvips copy, the CC-BY packages, the fields with no licence metadata, and WDA's BSD text under an Apache label.
9. **Relaxing "no runtime download" for the npm graph only.** Option 4 would make packages small but breaks the requirement and the offline story. Not recommended; listed so the answer is explicit.
10. **Re-freeze policy.** Who re-qualifies when Xcode changes: the runner embeds Xcode 27 frameworks, and an upstream bump needs a new lock, a new runner and the six iOS cases again.

## 11. Not verified, and suggested spikes

- The plugin install of a roughly 100 MB `archive` zip: extraction of the nested archives, symlink and mode handling, the 120 s download. My probes used git `url` sources because archive URLs must be https and cannot be loopback. A draft release on a throwaway repo settles it.
- Whether the bridge's lock plus the MCP client installs unchanged through Claude Code's installer in the real plugin zip (the pieces did in probes: the current 212-entry lock, sdk 1.32.1 with zod 4.6.6).
- Behaviour of the frozen runner on other Xcode versions and iOS runtimes, and on Intel. Not testable without devices.
- The path under `~/Library/Application Support` contains a space. `simctl install` and Node imports should cope; untested.
- Extraction crash safety and concurrent first use by two processes (the Phase 2 admission store is the natural lock).
- Claude Code behaviour is from 2.1.307; the dependency-install rules may change.
- An `.mcpb` bundle is a documented way to vendor `node_modules` for a plugin MCP server ([marketplace reference, `mcpServers`](https://code.claude.com/docs/en/plugins/manifest-reference#mcpservers)); not evaluated, and the CLI channel would still need its own copy.

## Reproduction notes

All under `/tmp`; none of it is retained or referenced by the product.

- `npm ci --ignore-scripts --no-audit --no-fund --cache /tmp/…` from a copy of `C:package.json` and `C:package-lock.json` (sha256 verified), then a SHA-256 walk comparing the tree with `C:node_modules`.
- `npm install --package-lock-only` merge tests: the Phase 1 lock with the bridge's `package.json` dependencies, with and without the `server` 2.3.1 and `zod` 4.6.6 pins; frozen entries compared by path, version and integrity.
- Shrinkwrap and `bundleDependencies` probes with a two-file package depending on `ms`.
- `npm view`, `npm pack` of `@modelcontextprotocol/client|server|core@2.1.0`, `gh release download` of the two v16.14.2 simulator zips into an empty directory, read with `unzip -l`, `plutil`, `lipo`, `vtool`, `codesign -dv`; nothing executed.
- Claude Code probes: `claude plugin marketplace add`, `install`, `list`, and `claude --debug-file … plugin install` against `/tmp/cc-test/market` with `CLAUDE_CONFIG_DIR` and `CLAUDE_CODE_PLUGIN_CACHE_DIR` pointed at `/tmp/cc-test`.
- Read-only inspection of `C:`, `R:` and the Phase 1 build log in the other worktree.
