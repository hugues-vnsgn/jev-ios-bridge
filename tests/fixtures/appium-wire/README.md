# Appium wire fixtures

Each JSONL file starts with a `jev-appium-wire` version 1 header. The header records the platform, stack lock hash, WDA tree hash, extension version, fixture app hash and frozen SDK protocol versions. `recording.ts` checks the lock and WDA hashes against `stack/freeze.json` and `stack/wda/provenance.json`. It also checks the lock bytes and extension version. A changed identity refuses the recording.

Every following line contains `direction`, either `client` or `server`, and the complete JSON-RPC `message`. The fake compares requests, remaps request IDs, and returns the recorded replies over stdio. Capability JSON is compared as an object. Tool requests and session results use the bridge's shared schemas.

The two `minimal.jsonl` files are hand-authored protocol examples. Their fixture app hash is SHA-256 of `hand-authored-no-app`. They contain no live device evidence. The `provenance` header distinguishes these examples from recordings.

The fake accepts a recording path, fault name and optional request-trace and environment-output paths. Fault names are `late`, `lost`, `malformed`, `dead-child`, `disconnect`, `protocol`, `settings-error`, `settings-unequal`, `settings-missing`, `foreign-session`, `foreign-version`, `create-unowned` and `create-duplicate`. The request trace has a companion `.replies` file when tracing is enabled.

## Record a named case

Only the root's scheduled device worker runs live cases. Run the recorder with `node scripts/record-appium-wire.mjs --case /absolute/case.json --output tests/fixtures/appium-wire/ios/case.jsonl`. The output must not exist.

The case JSON has these fields:

- `platform`, either `ios` or `android`.
- `fixtureAppSha256`, the hash of the fixture app used for that case.
- `homeRoot`, an absolute private directory owned by the current account.
- `entrypoint`, the absolute path of the frozen-stack private server entrypoint.
- `args`, an optional array of entrypoint arguments.
- `requests`, the complete ordered JSON-RPC messages for the case, including initialization and its notification.
- `timeoutMs`, an optional total deadline, up to 900000 ms.

The recorder creates a private child HOME, strips the environment, and discards child stderr. It buffers wire in memory, masks value-bearing request arguments and their echoes, then writes a mode-600 recording. Pass `--mask VALUE` for any additional secret or secure-field value in the fixture. `--input existing.jsonl` masks and validates an existing recording without starting a provider.

## Live cases for the root to schedule

- Create, settings apply and readback, and delete on each platform through the final private entrypoint.
- The first Android server installation and a verified installed-server session, with the Settings helper absent.
- An iOS session with the frozen preinstalled WDA and the simulator's current presentation.
- A driven pause and fresh resume, plus a vanished session followed by a fresh handback.
- Stdin EOF and parent loss, with child and session identities available to the fence.

These cases require the final extension and the fixture app. Fault injection and the recorder round trip in this PR run on the host.

## Observation replays

`observe/` retains P05 XML captured on the observation-mapping prototype at `ed4a17729`. The `observe-1.jsonl` and `observe-2.jsonl` envelopes are hand-authored host fixtures around those sources and a generated one-pixel PNG. They make no new live-device claim. The original captured XML files remain separate for inspection.

Observation faults add `source-late-first`, `source-late-second`, `source-lost` and `screen-late-second`. A late reply normally waits 250 ms. Appending `-held` waits for the test to create `<trace>.release`, so a manual clock can reach the settle deadline without depending on host speed. `source-slow-screen-held` returns the first source after 1 s and holds the first screenshot. `source-invalid` replaces each source with malformed XML, and `screen-invalid` truncates each PNG to its header. `delete-late-first` answers the first delete after 250 ms, and `actions-lost` never answers `appium_perform_actions` (`ios/actions.jsonl`). Cleanup may skip the remaining recorded steps to the owned delete request, and a repeated delete replays that request. No skipped input is dispatched.

`observe/ios-fields.xml` is the P19 fixture-app Fields screen (`P19-evidence/ios-feature-proof/fields.xml`), where WDA reports each empty field's hint as both `placeholderValue` and `value`. `observe/android-number-picker.xml` is a hand-authored source for a `$` class, whose tag UiAutomator2 sanitizes.

The corpus oracle converts the existing Android agent captures to equivalent XML in the test, then compares normalized elements, printed capture output and assertion text with the committed bytes. These are derived host fixtures, not newly recorded Appium wire. The three Android goldens stay unchanged.

## Operation replays

`android/replace-text-lost.jsonl` is hand-authored. It records the session create, the settings readback and one `jev_replace_text` request with no reply, then the owned delete. It makes no live-device claim. The operations test runs it through the real client with a short call timeout, so the lost acknowledgement closes dispatch and the trace shows the request sent once.

## World provider

`world-mcp.ts` is the controllable provider behind the preservation matrix (`tests/appium-matrix-*.test.ts`). It replays no recording. A test builds a world with `world.ts`: named page sources, built with `iosScreen` or `androidScreen`, and rules that act on each tool call. A rule names a tool. It can narrow to the nth call, the current screen (`when`) or a subset of the arguments (`match`). It can then move to another screen (`to`) or apply a fault: `lost`, `late`, `held`, an extension `error` code, `exit`, `disconnect`, `malformed` or `schema`. `{{typed}}` in a source is replaced by the last replaced text. A `.goto` file beside the trace moves the screen from the test, and a `.release` file answers a held reply.

Every request passes the shared request schemas and every answer passes `checkedToolReply`, so a world cannot reply with what the real extension could not. The provider writes the request trace, a `.replies` file and a `.env` file listing the child's environment names. It records no live device evidence.
