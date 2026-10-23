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
