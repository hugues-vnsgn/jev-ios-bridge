# Static installed-proof diagnosis

**Current fresh Node26 installed acceptance remains BLOCKED at npm installation command003. Root's exact24 fresh proof passes; original accepted author proofs remain valid historical PASS.** Static reads only: no source changes, tests, builds, installations, network calls, config/environment/secret reads, production stores or devices.

## Distinct unfinished operations

| Run | npm log lines | Tarballs requested / body-end logs | Observed unfinished operation |
| --- | --- | --- | --- |
| First Node26 | 115 | 0 / 0 | `chokidar` packument fetch has cache-miss/manifest intent but no GET200 body-end record; idealTree dependency construction not completed |
| Node26 recheck | 1380 | 155 / 154 | `mobilebuildmcp@2.7.1` tarball stream/extraction not completed before wrapper SIGKILL |
| Exact24 | 1545 | 155 / 155 | Complete install: exit0, added156 packages in15s; full37-command proof PASS |

Both failed command003 records have `exit:null,signal:SIGKILL`, empty stdout/stderr, and no completed clean lockfile. They are the unchanged harness's90s external kill, not recorded npm error exits. Do not label the recheck a115-line metadata stall: its last body-end receipts are Sentry conventions37867ms and OpenTelemetry semantic conventions38274ms. It made substantial progress into extraction.

For the recheck, the sole tarball request without a matching200 body-end record is `https://registry.npmjs.org/mobilebuildmcp/-/mobilebuildmcp-2.7.1.tgz`. Its install directory contains6 files /8,248,812 bytes, including the bundled AXe and partial framework content; `package.json` and `build/cli.js` are absent. Root24's matching package has1061 files /44,531,099 bytes, complete manifest/CLI, and a tarball body-end receipt at7532ms. These are retained filesystem observations after termination, not reconstructed install success.

The installed npm11.19.0 implementation `npm-registry-fetch/lib/check-response.js` attaches the success HTTP log to `res.body.on('end',...)`. Therefore absence of that line does not imply no HTTP response or zero bytes received. The partial extracted files show a response body was consumed in part. The logs cannot separate remaining network body delivery from local stream/backpressure/cache/integrity/untar work. No HTTP failure, integrity error, npm exception or causal Node26 regression is proven. The concrete unfinished unit is the mobilebuild tarball body/extraction chain; its lower-level reason remains UNVERIFIED.

## Pinned and resolved dependencies

All five direct pins remain exact: `@modelcontextprotocol/server@2.1.0`, `@typesafe-ai/sdk@0.6.0`, `mobilebuildmcp@2.7.1`, `mobilecli@1.0.14`, `zod@4.6.5`. The original author26/24 and Root fresh build snapshots share the identical repository lock hash `7982b0a2fc02a088ab03761b8332e6c15ad3d0d841f1134e9a4dd50b94364479`. The frozen proof hash remains `6aaf75a214d3dc89ddc2957b2be082ccf9eba7d93ade7511dd3bd652ae850635`; unchanged npm fetch retries0, fetch timeout45000 and outer kill90000 apply.

Root26 recheck and Root24 request exactly the same155 tarball multiset, including duplicate nested resolutions, not merely the same direct package names. Thus the successful Root24 comparator eliminates a differing selected dependency graph between these two Root runs. It does not establish that Node version caused the transfer stall: run timing/network scheduling also differs.

The author selected evidence preserves plugin/build lockfiles and5s/4s clean-install stdout, but not author clean lockfiles or registry debug logs. Exact author *clean* transitive resolutions cannot be recovered from this selected preservation. Do not equate its plugin lock with its earlier registry-resolved clean install. Root's fresh npm graph differs from the preserved author plugin lock in17 package rows:

| Dependency | Preserved author plugin | Root fresh registry |
| --- | --- | --- |
| `@hono/node-server` | 2.1.1 | 2.1.4 |
| `@modelcontextprotocol/sdk` | 1.30.1 | 1.32.1 |
| `@opentelemetry/core` | 2.11.0 | 2.12.0 |
| `@opentelemetry/resources` | 2.11.0 | 2.12.0 |
| `@opentelemetry/sdk-trace` | 2.11.0 | 2.12.0 |
| `@opentelemetry/sdk-trace-base` | 2.11.0 | 2.12.0 |
| `@sentry/core` | 10.75.3 | 10.76.1 |
| `@sentry/node` | 10.75.3 | 10.76.1 |
| `@sentry/node-core` | 10.75.3 | 10.76.1 |
| `@sentry/opentelemetry` | 10.75.3 | 10.76.1 |
| `@sentry/server-utils` | 10.75.3 | 10.76.1 |
| `cjs-module-lexer` | 2.2.1 | 2.3.0 |
| `es-module-lexer` | 3.0.2 | 3.0.3 |
| `express-rate-limit` | 8.7.0 | 8.7.1 |
| `hono` | 4.13.9 | 4.13.13 |
| `import-in-the-middle` | 3.5.1 | 3.5.2 |
| `ip-address` | 10.7.2 | 10.7.3 |

These version differences illustrate registry resolution outside the shipped lockfile; they are not evidence that author clean installs necessarily used those older versions. The unchanged source lock and direct pins remain confirmed. Neither Root failure reached installed CLI/MCP smoke, so no startup/SQLite/adapter defect follows from these records.

## Minimal follow-up after heavy window release

Root may run one focused diagnostic for the sole unfinished tarball, sequentially under Node26 and exact24, each in a distinct empty private directory/cache. Keep retries0,45000ms fetch timeout and an external90s bound; remove the same key/options/warning-suppression variables. Use actual npm11.19.0 with `npm pack mobilebuildmcp@2.7.1 --ignore-scripts --pack-destination <private-dir> --cache <fresh-cache> --fetch-retries=0 --fetch-timeout=45000 --loglevel=silly --timing`. This avoids bridge/device invocation and isolates metadata/body/cache/integrity/archive work. Record exact executable/PATH, runtime/npm, exit/signal, raw stdout/stderr/debug/timing files and produced archive hash. Sample only read-only child CPU/RSS/process state and partial output file counts/bytes at bounded times if it stalls; do not dump environment, npm config, HTTP headers or credentials.

Those diagnostics use separate caches and never warm an acceptance proof. If targeted retrieval succeeds, run the original unchanged Node26 proof once in another fresh project/cache when Root authorizes its heavy window. Diagnostic pack success alone never supplies clean-installed acceptance. If it fails, preserve the negative and use its body progress/timing to choose the next inquiry. Do not increase the proof timeout, use existing dependency links, pin replacement versions, suppress assertions, relabel SIGKILL as success or rewrite the original failures.

[Machine findings and input hashes](findings.json) identify the exact raw records and source inspected. Source/guide/fixture bytes remain frozen.
