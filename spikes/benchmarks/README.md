# Ticket 17 benchmarks

The scripted assertion and real-execution gates passed. The installed Claude Code path and blind report-and-source diagnosis also passed. The three full-suite comparisons are in progress. Preserved inconclusive host attempts remain in `results/`; an installed Contacts search smoke test is not the full Contacts benchmark.

## Pinned source and local readiness

The direct-Claude baseline is [Sentry's Claude UI harness](https://github.com/getsentry/MobileBuildMCP/blob/d13ff0c707b0681769cf31da0eb42c4f94ceafff/benchmarks/claude-ui/README.md) at MobileBuildMCP `v2.7.1`, commit `d13ff0c707b0681769cf31da0eb42c4f94ceafff`. [provenance.json](provenance.json) records hashes of its suites, prompts, runner, and the vendored Weather app. The upstream project is [MIT licensed](https://github.com/getsentry/MobileBuildMCP/blob/d13ff0c707b0681769cf31da0eb42c4f94ceafff/LICENSE). Its benchmark files are linked, not copied. The Weather project under [vendor/weather](vendor/weather/README.md) is copied from the same commit with the upstream MIT license; its local `AGENTS.md` and `.mobilebuildmcp/config.yaml` were excluded. The latter would select a generic simulator and enable Sentry telemetry.

The local `claude` binary is `2.1.280`; `claude auth status` reports a logged-in first-party Claude Max session. The official suite YAML requests `claude-opus-4-7`, an [Anthropic model ID](https://platform.claude.com/docs/en/models/opus-4-7/overview). Claude Code's [CLI reference](https://code.claude.com/docs/en/cli-reference) accepts a full model ID through `--model`. One permitted `Reply READY` call from an empty temporary directory used that full ID with tools, MCP, and slash commands disabled. It succeeded and reported `claude-opus-4-7`, 506 input tokens, six output tokens, and no cache tokens. [host-availability.json](host-availability.json) holds only these sanitized usage facts; the raw response was not saved. The probe establishes account access, while each later benchmark must still record its observed model.

The failed `com.apple.weather` launch was for Apple's built-in app. Sentry's [Weather suite](https://github.com/getsentry/MobileBuildMCP/blob/d13ff0c707b0681769cf31da0eb42c4f94ceafff/benchmarks/claude-ui/suites/weather.yml) instead builds `example_projects/Weather/Weather.xcodeproj`, scheme `Weather`, bundle `com.sentry.weather.Weather`. Its [WeatherApp](https://github.com/getsentry/MobileBuildMCP/blob/d13ff0c707b0681769cf31da0eb42c4f94ceafff/example_projects/Weather/Weather/WeatherApp.swift) uses a mock service with bundled data. A pinned MobileBuildMCP compile-only build for the dedicated simulator succeeded; [build-evidence.json](build-evidence.json) records the command and resulting app path. The app was later installed and launched on that simulator for the revised feasibility corpus, without a Claude or Jev benchmark run.

To rebuild the fixture from this repo, run from the release worktree:

```sh
MOBILEBUILDMCP_SENTRY_DISABLED=true npx -y mobilebuildmcp@2.7.1 simulator build \
  --project-path spikes/benchmarks/vendor/weather/Weather.xcodeproj \
  --scheme Weather --configuration Debug \
  --simulator-id 0E42FDE2-5E09-42D3-9876-9EF0037FCBE7 \
  --derived-data-path /tmp/jev-weather-dd-v2.7.1 --output json
```

If a later prepared-app bridge run starts from a fresh simulator, install the built app only on that benchmark simulator. This command was used on the dedicated simulator during corpus preparation:

```sh
MOBILEBUILDMCP_SENTRY_DISABLED=true npx -y mobilebuildmcp@2.7.1 simulator install \
  --simulator-id 0E42FDE2-5E09-42D3-9876-9EF0037FCBE7 \
  --app-path /tmp/jev-weather-dd-v2.7.1/Build/Products/Debug-iphonesimulator/Weather.app \
  --output json
```

## Reproduce the direct-Claude baseline after the gate

The [Weather](https://github.com/getsentry/MobileBuildMCP/blob/d13ff0c707b0681769cf31da0eb42c4f94ceafff/benchmarks/claude-ui/prompts/weather.md), [Reminders](https://github.com/getsentry/MobileBuildMCP/blob/d13ff0c707b0681769cf31da0eb42c4f94ceafff/benchmarks/claude-ui/prompts/reminders.md), and [Contacts](https://github.com/getsentry/MobileBuildMCP/blob/d13ff0c707b0681769cf31da0eb42c4f94ceafff/benchmarks/claude-ui/prompts/contacts.md) prompts are the task definitions. Each official suite creates and later deletes its own temporary simulator; none targets `OPS iPhone`. The harness excludes simulator creation and first-run prompt dismissal from `wallClockSeconds`. Weather's app build is inside Claude's measured task, while Reminders and Contacts launch stock apps. The suite YAML also gives Claude a suggested tool sequence, so tool-count differences are not an unconstrained model comparison.

| Suite | Published wall clock | Published total tool calls | Published host tokens |
| --- | ---: | ---: | --- |
| Weather | 100.03 s | 14 | not reported |
| Reminders | 92.79 s | 17 | not reported |
| Contacts | 102.94 s | 19 | not reported |

Reclone if the checked upstream copy has been removed, then run each suite separately. These commands are prepared for later execution; they have not been run here:

```sh
if [ ! -d /tmp/jev-mobilebuildmcp-benchmark-v2.7.1 ]; then
  git clone --depth 1 --branch v2.7.1 https://github.com/getsentry/MobileBuildMCP.git /tmp/jev-mobilebuildmcp-benchmark-v2.7.1
fi
cd /tmp/jev-mobilebuildmcp-benchmark-v2.7.1
test "$(git rev-parse HEAD)" = d13ff0c707b0681769cf31da0eb42c4f94ceafff
npm ci
MOBILEBUILDMCP_SENTRY_DISABLED=true npm run bench:claude-ui -- --suite weather --model claude-opus-4-7
MOBILEBUILDMCP_SENTRY_DISABLED=true npm run bench:claude-ui -- --suite reminders --model claude-opus-4-7
MOBILEBUILDMCP_SENTRY_DISABLED=true npm run bench:claude-ui -- --suite contacts --model claude-opus-4-7
```

For each run, keep the upstream `result.json`, `claude.jsonl`, lifecycle log, prompt, and exact model/version metadata. Run [extract-claude-usage.mjs](extract-claude-usage.mjs) on `result.json` to add uncached input, cache creation, cache read, output, and total processed input tokens to the upstream call and time metrics. The script also accepts a raw Claude Code stream JSONL file for the later bridge host run. It reads the terminal `modelUsage` breakdown so subagent usage is included and assistant messages are not double-counted, following [Anthropic's cost-tracking guidance](https://code.claude.com/docs/en/agent-sdk/cost-tracking). `total_cost_usd` is a client-side API price estimate, not the amount billed to this Max subscription. Require a zero Claude exit code, zero parser errors, a completed task, and manual verification of the saved UI state. The upstream harness recommends up to three attempts when establishing a clean baseline and records no baseline if none succeeds.

[run-baseline.mjs](run-baseline.mjs) wraps one pinned upstream suite, checks the source commit, and writes a numeric summary after completion. It is dry by default: `node spikes/benchmarks/run-baseline.mjs weather` prints the planned command. Add `--execute` only after the gate. Prepare the upstream clone with `npm ci` first. A source checkout lacks the bundled AXe binary: set the supported `MOBILEBUILDMCP_AXE_PATH` override to the AXe 1.8.0 binary shipped with `mobilebuildmcp@2.7.1`. The wrapper verifies its recorded SHA-256 before executing and passes the path through to the upstream MCP process. Its runner creates and deletes temporary simulators, never the dedicated or `OPS iPhone` simulator.

## Compare the bridge on the same tasks

Use the same iOS 26.4 runtime and device type, synthetic values, model request, and final-state checks. Reset app data or use a fresh benchmark simulator between variants. Preinstall the Weather fixture before timing the prepared-app bridge loop, since v0.1 only launches installed apps. Report both the official end-to-end Weather number, which includes building the app, and a matched prepared-app UI-loop number. Keep simulator preparation time as a separate row. Do not use `OPS iPhone` or a physical device.

| Suite | Bridge task and evidence to match | Preparation outside the measured loop |
| --- | --- | --- |
| Weather | Set the seven options in the pinned [Weather prompt](https://github.com/getsentry/MobileBuildMCP/blob/d13ff0c707b0681769cf31da0eb42c4f94ceafff/benchmarks/claude-ui/prompts/weather.md), find London, verify its main-screen values, then verify the precipitation detail values. Preserve evidence from each screen. | Build and install the copied mock app with bundle `com.sentry.weather.Weather`. |
| Reminders | Create `MCP Benchmark List` with the three exact prompt titles. Complete the first and third; show two completed and one incomplete in saved UI evidence. | Start with no list of that name and dismiss only the first-run prompts that the upstream suite dismisses. |
| Contacts | Create one `MCP Contact Benchmark` contact with the supplied organization, phone, and email. Verify the saved card without entering edit mode. | Start without that synthetic contact and dismiss only the first-run prompts that the upstream suite dismisses. |

Run the bridge through Claude Code's `/test-ios` skill and MCP server so host tool calls and tokens include scenario submission and report polling. Capture Claude Code stream JSONL with `--verbose --output-format stream-json --model claude-opus-4-7`, and use the same token extractor. Read the bridge's `run.jsonl` for Jev `inputTokens`, total duration, action decisions, and verdict. At measurement time, verify Jev's price in the [official model docs](https://docs.typesafe.ai/models.md); the checked 2026-09-24 rate is $0.042 per million input tokens, with free output tokens. Report Jev cost as input tokens times that rate, separate from Claude's API price estimate.

[run-bridge.mjs](run-bridge.mjs) creates a private temporary consumer, copies `/test-ios` from the selected installed package, and registers that package's CLI. Its MCP child loads the original private `.env` by reference and pins the dedicated simulator. The host environment excludes the API key. Raw host transcripts and run evidence stay in the private temporary directory; sanitized summaries go to `results/`.

The supported scripts are `weather-scripted.json`, `contacts-scripted.json`, and `reminders-scripted.json` under [scenarios](scenarios). Each contains explicit guarded actions and assertion checkpoints. Older goal/checkpoint files are historical inputs and are rejected by the production parser. Benchmark limits are 100 steps and 900 seconds, with the same assertion thresholds as production.

Run a dry check, then execute against a clean-installed package:

```sh
node spikes/benchmarks/run-bridge.mjs spikes/benchmarks/scenarios/weather-scripted.json \
  --bridge-cli /absolute/consumer/node_modules/jev-ios-bridge/dist/cli.js
node spikes/benchmarks/run-bridge.mjs spikes/benchmarks/scenarios/weather-scripted.json \
  --bridge-cli /absolute/consumer/node_modules/jev-ios-bridge/dist/cli.js --execute
```

The wrapper records external host-process elapsed time as well as bridge phase timing. Review the final screen, script equivalence, and submitted JSON; a successful host process alone is not a successful UI verification.

Use a clean, dedicated iPhone 17 Pro Max simulator on iOS 26.4 for each task. Restore Weather defaults and ensure the synthetic benchmark list and contact do not already exist. Dismiss only the first-run prompts dismissed by the upstream baseline. Record build, install, and reset time separately from the bridge's prepared-app loop. The official Weather baseline includes its build inside the measured task, so that total alone is not a matched UI-loop speed comparison.

Run each official baseline separately through `run-baseline.mjs <suite> --execute`, followed by the corresponding installed-package bridge measurement when setup is ready. Keep timed runs free of other GUI/build activity. The diagnostic scenario is bridge-only; it is not an upstream comparison suite.

[scripted-authoring-evidence.json](scripted-authoring-evidence.json) records script hashes and preflight assumptions. Initial draft time and tokens were not metered. Record subsequent maintenance time, selector edits, and all failed attempts. This missing initial cost prevents total-savings and break-even claims, even if prepared execution is cheaper.

The baseline wrapper and generated upstream MCP config both disable Sentry telemetry. The upstream host uses `bypassPermissions` and a suggested action sequence; the bridge host uses an explicit MCP/Skill allowlist without that permission mode. Disclose this difference alongside measurements. Bridge logs now record monotonic prepare, observe, decide, act, and cleanup durations plus reference refresh/expiry counts. Current result summaries retain these fields; the final comparison must distinguish prepared execution, setup/build, and authoring costs.

The first Weather baseline attempt lacked AXe and could not capture the UI. Its process completed, but the task did not; it is excluded from successful comparisons and retained in the attempt/cost record. `results/host-timing-annotation-correction.json` also corrects the timing-source labels of the three installed Contacts smoke summaries: their numeric wall times came from the wrapper’s monotonic process timer, not Claude’s shorter terminal-result duration. Original summaries remain unchanged.
