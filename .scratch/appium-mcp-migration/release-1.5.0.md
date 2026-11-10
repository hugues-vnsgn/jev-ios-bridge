# Release 1.5.0 checklist

Prepared overnight on 2026-11-04 by worker C, on `release/v1.5.0` (PR #91, draft, stacked on #89). Head when the artifact proof ran: 37e7b4526 (merge of `feat/p4-cutover` 6b6b2d403). The version is 1.5.0 by default: spec Decision 29 keeps every frozen contract, so there is no major bump. A different number is the owner's call.

State key: **done here** (finished in this PR), **waits on live gates** (needs a device, the Jev key, or the real admission store), **owner publishes** (tag, upload, publish).

## Version and metadata

| Step | State | Notes |
| --- | --- | --- |
| `package.json` and `package-lock.json` root at 1.5.0 | done here | `npm version 1.5.0 --no-git-tag-version`. `--version`, the MCP `serverInfo`, the plugin manifest and the zip's `package.json` all print 1.5.0 in the built artifact. |
| Plugin manifest version | done here | `scripts/build-plugin.mjs` writes `.claude-plugin/plugin.json` from `package.json`, so there is no second source to edit. |
| Package/tag consistency check | done here | `tests/docs.test.ts` requires every blob/tree link in the README and guide to use `v<package version>` and the linked path to exist. All links now read `v1.5.0`; `docs/releases/v1.5.0.md` exists for them to resolve. |
| `.claude-plugin/marketplace.json` | owner publishes | Left on the published v1.4.0 zip on purpose: the 1.5.0 zip has no release URL or final hash yet, and pointing main at a missing asset breaks installs. Past releases changed it in a separate "point plugin marketplace at vX" commit after publishing (for example dadd63a65). Do that after upload, with the hash of the uploaded zip. |
| CHANGELOG 1.5.0 entry | done here, date at release | Heading reads `## 1.5.0 - UNRELEASED`. Replace `UNRELEASED` with the publish date. The entry names what users see from the fix PRs #101 to #108. |
| Release notes `docs/releases/v1.5.0.md` | filled 2026-11-11, edit at release | "Validation and limits" states what passed, failed and was not tested, from `phase4/evidence-results.md`. "Known limits" lists the owner's accepted limits. Each line that waits on an open gate carries `PENDING-GATE:`; fill or remove each before tagging. |
| README header | done here | Evergreen wording; the release notes carry the live results. |

## Docs

| Step | State | Notes |
| --- | --- | --- |
| iOS "see the element tree" advice | done here, owner call | `docs/guide/03-identifiers.md` and `skills/test-ios/SKILL.md` no longer run `npx mobilebuildmcp`. The bridge has no iOS capture command (`capture` is Android only), so both now say so and point to Xcode's Accessibility Inspector, with the screenshot a stopped run leaves. Alternative: build an iOS `capture` (a src change, not part of a release PR). |
| Sweep for MobileBuildMCP, mobilecli, AXe advice | done here | Remaining mentions are historical (CHANGELOG, ADRs, benchmark and example provenance, `.scratch`), the glossary, the foreign-tool list in `12-android-setup.md` and `08-troubleshooting.md` (other tools that can hold a device), and the `.mobilebuildmcp/config.yaml` reader, now worded as an older project's file the bridge still reads. |
| Guard against the advice returning | done here | `tests/plugin.test.ts` fails when a shipped skill, guide page or the README gives `npx mobilebuildmcp`/`mobilecli`, `snapshot-ui`, `mobilebuildmcp@`, or names `mobilebuildmcp` outside `.mobilebuildmcp/config.yaml`. |
| ADR-0009 text | done here | Points at ADR-0010, ADR-0014 and the retired AXe tap; the 2026-10-08 decision text is kept as written. |
| `docs/guide/reference/reason-codes.md` `ANDROID_TOOLS_UNAVAILABLE` row | left as is | Still mentions mobilecli as history. `tests/docs.test.ts` ties the wording to `src/scripted/vocabulary.ts`, a frozen contract; changing both is a src change for after the release. |

## Cutover step 4 (phases/phase-4-acceptance.md) and the matrix rows 4a to 4h

Node 26.8.1, `PATH=/opt/homebrew/bin:$PATH`. Logs are in `/Users/hugues_mini/.codex/reports/jev-ios-bridge/phase4-build/overnight/C-logs/`.

| Row | State | Result tonight |
| --- | --- | --- |
| 4a full checks | done here | `tsc --noEmit` passes (`typecheck-after-merge.log`). `npm run check` ran twice on Node 26. Run 1 (before the merge of #89's fix): 2935 tests, 2930 pass, 5 cancelled by 15 s timeouts in `tests/observed-cli.test.ts` and `tests/observed-public-races.test.ts` while the host load average was 20 to 34 (`check-node26-run1-before-merge.log`); the isolated rerun on a quieter host passed 87 of 87 (`rerun-observed-cli-quiet.log`). Run 2 (merged head): 2937 tests, 2909 pass, 16 fail and 12 cancelled, all subprocess timeouts or SIGKILL in 8 observed/admission race files, again under shared load (`check-node26.log`); rerunning exactly those files one at a time passed 321 of 321 (`rerun-failed-files-after-merge.log`). So no single clean `npm run check` exit 0 was recorded locally. CI is the clean record: Node 24.0.0, 24 and 26 passed on 592cd0947 and on 37e7b4526 (one `check (24.0.0)` job on 37e7b4526 hit the known Android identity flake at `tests/android-device.test.ts:316`, worker D's subject, and was rerun; see the PR for its final state). |
| 4b clean install of package and plugin | done here | Packaging proof `tests/fixtures/observed-packaging/proof.mjs` returned PASS on the merged head: 2 clean installs, 40 commands, 0 forbidden effects, 0 skips, plugin install with the offline stack extraction and 3 tampered archives refused (`packaging-proof.log`, `packaging-proof/summary.json`, `packaging-proof/commands.jsonl`). Its first three attempts failed only with `EIDLETIMEOUT` from registry.npmjs.org inside `npm ci --prefix stack` (the proof allows 45 s and no retry) while other workers were installing; they are kept as `packaging-proof-attempt1..3-network-timeout.log`. The fourth passed after I warmed the proof's own npm cache with the same `npm ci --prefix stack` and a longer timeout, without changing the proof. |
| 4c shipped docs and links | done here | `tests/docs.test.ts` and `tests/plugin.test.ts` pass in the full runs. The installed package carries every guide page, `reference/` and `examples/`; no MobileBuildMCP or mobilecli advice in the installed README, guide or skills; no mobilebuildmcp, mobilecli or axe package in the installed `node_modules` (`clean-install-quickstart-steps.log`). |
| 4d prerequisites and public entry points | done here for entry points that need no device; the rest waits on live gates | Installed CLI: `--version`, `--help`, `report` (exit 3 with a clear message), `run` of a missing script (exit 3), `capture` with no device named (exit 3, `NO_DEVICE`). Installed MCP: `initialize` returns `jev-ios-bridge` 1.5.0 and `tools/list` returns start_scenario, get_report, cancel_run and the five observed read, cancel and retire tools. The observed prepare/start tools and driven `resolve_step` are not in the list; they are gated by `JEV_EXPERIMENTAL_OBSERVED` and `JEV_EXPERIMENTAL_DRIVEN`, which these steps leave unset. Pinned stack archives (`stack.tar.gz` 86,373,976 bytes, `wda.tar.gz` 7,530,743, `manifest.json`) ship in the package and verify and unpack offline (proof: `loaded` 3499 files, `offline: true`, `sharedReuse: true`). Running a script on a device waits on the live gates. |
| 4e Node minimum | done here | CI `check (24.0.0)` runs the full suite and the packaging proof on Node 24.0.0 (`engines.node` is `>=24`). Local runs used Node 26.8.1. |
| 4f documented quickstart on the built artifact | done here for the steps that need no device; waits on live gates for the rest | Done: install the tarball into an empty project with a private HOME and a PATH holding only node, npm, npx and sh (no adb, xcrun, simctl, no key), then the commands in 4d. Waits on live gates: create and boot a simulator, build and install the diagnostic app, run the shipped diagnostic script (expect `failed` on the planted $3 total), the Android section, and the first-run stack unpack under `~/Library/Application Support/jev-ios-bridge/` (the private HOME stays empty until a run). |
| 4g artifact hash record | done here | See "Artifacts" below. |
| 4h provenance matches metadata | done here | The built tarball's `package.json` says 1.5.0; the installed CLI `--version` and MCP `serverInfo.version` say 1.5.0; the plugin zip's `.claude-plugin/plugin.json` and `package.json` say 1.5.0; the proof asserts the built `marketplace.json` hash equals the zip's hash. Report-level runtime provenance (`prepared.stack` in `report.json`: `lockSha256`, `wdaTreeSha256` or `uiautomator2ServerSha256`) appears only in a real run, so its comparison with the shipped `manifest.json` waits on the first live run. |

## Artifacts (built on Node 26.8.1 from merged head 37e7b4526)

| File | Bytes | sha256 |
| --- | ---: | --- |
| `jev-ios-bridge-1.5.0.tgz` | 95,861,003 | `62ab24bde86c23ba4fd63fea290e81a43a836fa1c82093a2f6cc5c5bf185c50a` |
| `jev-ios-bridge-plugin-1.5.0.zip` | 95,973,391 | `c1e3f46215a5ebefef96acc3e75fb2bb16833fc88e00d6f299c0aa4f6ee3def1` |

These hashes are stale, because every fix PR since then changed the packaged files. Paths: `C-logs/packaging-proof/` (tarball) and `C-logs/packaging-proof/build-source/build/plugin/` (zip, `marketplace.json`). An earlier build on 592cd0947 produced different hashes (`old-proof/`, `artifact-sha256.txt` holds the current pair). Any later change to a packaged file, the merge of other branches, or a rebuild changes the hashes, so rebuild on the exact release commit and record those pairs instead. The marketplace entry takes the hash of the zip that is actually uploaded.

## Remaining steps in order

| # | Step | State |
| --- | --- | --- |
| 1 | Merge #89 (cutover) once the live gates and the evidence index close; keep it a draft until then | waits on live gates |
| 2 | Corpus gate through the Appium path: iOS 24 screens and 48 claims with zero confidently wrong and at most 3 uncertain; Android 10 screens and 31 claims with zero confidently wrong (needs the Jev key and the owner's corpus records) | correspondence decided 2026-11-10 (35 approve, 3 recapture); recaptures and the judging pass wait on an owner assignment for `Medium_Phone_API_36.1` |
| 3 | Live matrix: iOS simulator, Android emulator, assigned Android phone; 20 independent cleanup cycles per device category; the five unfinished v1.4.0 simulator cases; activation of the real admission store | 37 passed, 2 failed, 9 untested of 48 rows; store activated 2026-11-05 |
| 4 | Record each requirement's state and evidence, and fill the release notes' "Validation and limits" | done 2026-11-11 in `phase4/evidence-results.md`; `evidence-index.md` stays generated, so its Status column keeps reading `untested` |
| 5 | Review the iOS identifier docs choice above; confirm 1.5.0 or pick another number | owner call |
| 6 | Merge #91 into the cutover branch (or retarget after #89 lands), pull the final head | owner |
| 7 | Rebuild on the release commit: `npm run check`, then `npm run build:plugin`, then the packaging proof; record tarball and zip hashes | owner (about 15 minutes) |
| 8 | Date the CHANGELOG heading; resolve every `PENDING-GATE:` line in the release notes, the CHANGELOG and `evidence-results.md` | owner |
| 9 | Tag `v1.5.0`, create the GitHub release, upload the tarball and the zip | owner publishes |
| 10 | Commit "release: point plugin marketplace at v1.5.0" with the uploaded zip's URL and sha256 | owner publishes |
| 11 | After publishing: `gh release download` the tarball and repeat the 4b to 4f install steps once; update the v1.5.0 records | owner |

Not done and not claimed: no live acceptance of any row, no corpus judgment, no device, simulator, emulator or Appium session, no Jev call, and no use of the real admission store happened tonight.
