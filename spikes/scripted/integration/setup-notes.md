# Dedicated-simulator setup for the 12 scripted runs

The scripts in [scenarios](scenarios/) are integration evidence after the 24-screen assertion experiment. They revisit synthetic screens and do not create a new held-out trial. [expected-oracles.json](expected-oracles.json) records six expected passes and six expected assertion failures outside the submitted scripts. The three [fault probes](faults/) have separate inconclusive oracles in [fault-oracles.json](fault-oracles.json).

Use only MobileBuildMCP 2.7.1 on the dedicated simulator `0E42FDE2-5E09-42D3-9876-9EF0037FCBE7`. The helper `node spikes/scripted/corpus/device.mjs` wraps pinned MobileBuildMCP commands and prints selectors without secrets. Do not use the booted OPS simulator or a physical device. The runner launches the app but does not reset its navigation or persistent data. Its cleanup stops the app after each attempt; prepare and inspect the required starting screen before invoking it again.

Run the twelve scripts in this order. Each starting screen was checked against a full MobileBuildMCP capture, and [validate-scenarios.ts](validate-scenarios.ts) checks all 33 guarded steps against those captures without Jev. Before each run, save its actual setup snapshot and screenshot with `node spikes/scripted/integration/record-setup.mjs <scenario-id>`. If the expected guard does not match, stop and repair the setup; do not relax the scenario or silently skip a run.

| Scripts | Setup before the runner starts | Initial guard |
| --- | --- | --- |
| `w01` | Stop and launch `com.sentry.weather.Weather`; close any open sheet. Leave Weather main visible. | Unique `weather.locationButton` and `weather.settingsButton`; no Locations or Settings sheet title. |
| `w02`, `w03` | Stop and launch Weather. Open `weather.settingsButton`; select `mi` under Distance if `km` is selected. Repeat this setup for each script. | Settings title; `mi` selected and `km` not selected. |
| `c01`, `c02` | Launch `com.apple.MobileAddressBook`. Close an edit form or return from a card if needed; dismiss an active Search overlay with its `close` control. Repeat before each script. | Contacts list with a single text field whose value is `Search`. |
| `c03` | From Contacts list, search `Nolan Ames`, open its unique result, and leave the saved card in front. | Nolan Ames card header, Edit button, and visible `nolan.final@example.test` email row. |
| `r01`, `r02` | Launch `com.apple.reminders`. If inside Signal Kit, tap Back. Open My Lists and verify its Signal Kit row reads `1 reminder`. Repeat before each script. | My Lists title and unique `Signal Kit, 1 reminder` row. |
| `r03` | Launch Reminders and open Signal Kit. Leave its Charge lantern row visible. | Signal Kit title and unique `Charge lantern, Incomplete, Use green cable` row. |
| `d01`, `d02`, `d03` | Stop and relaunch `dev.jevbridge.diagnostic` before each script. | `selection.summary` reads `Selected: None`, with Apple and Bread choices enabled. |

The Weather `km` selector is an exact button label, distinct from `km/h`. Contacts Search is selected by its text-field role and exact value. The Reminders Signal Kit target is the list row with `1 reminder`, not the separate title text. Diagnostic targets use the app's accessibility identifiers. The terminal guards identify the foreground screen and relevant controls; an explicit wait or next-step guard checks transitions where needed. The planted checkout total appears only in the assertion, not the terminal guard.

Run command, after the setup capture and root review:

```sh
node --env-file=/Users/hugues_mini/Codes/AgentTools/jev-ios-bridge/.env --import tsx spikes/scripted/integration/run.ts spikes/scripted/integration/scenarios/<scenario-id>.json --device-udid 0E42FDE2-5E09-42D3-9876-9EF0037FCBE7 --out spikes/scripted/integration/results
```

Keep every attempt's private run directory, including inconclusive outcomes. Compare the runner report with the separate oracle. Stop the batch after a cleanup failure, unconfirmed action, or retained device lock; never remove a lock by force. A setup or backend failure is evidence, not an assertion failure.

Run fault probes separately after the twelve reviewed scripts. `f01` starts at Diagnostic `Selected: None` and deliberately selects a nonexistent button, expecting `TARGET_MISSING`. `f02` starts on the Contacts list after a real upward scroll puts both Tessa Vale rows fully above Search; selecting their shared photo label must produce `TARGET_AMBIGUOUS`. `f03` starts at Diagnostic `Selected: None`, waits for an impossible marker, and receives one SIGINT after the first poll; the runner should record `CANCELLED` and clean up. None of these probes should reach Jev. Do not send a second signal or remove the device lock unless root diagnoses a failed cleanup.
