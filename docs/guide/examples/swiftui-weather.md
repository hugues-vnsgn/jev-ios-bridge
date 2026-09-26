# Worked example: SwiftUI (Weather)

A real check from the project's benchmarks (excerpts abridged; see the full script): change four unit settings and three switches in a SwiftUI weather app, search for London, and verify what its screens show. The script is [`weather-scripted.json`](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/v1.0.0/spikes/benchmarks/scenarios/weather-scripted.json). The app is MobileBuildMCP's MIT-licensed example, vendored at [`spikes/benchmarks/vendor/weather`](https://github.com/hugues-vnsgn/jev-ios-bridge/tree/v1.0.0/spikes/benchmarks/vendor/weather), and you can build it from the repository:

```sh
npx mobilebuildmcp simulator build-and-run \
  --project-path jev-ios-bridge-src/spikes/benchmarks/vendor/weather/Weather.xcodeproj \
  --scheme Weather --simulator-id <UUID>
```

## Anchoring the start

```json
{ "id": "openSettings", "kind": "action",
  "guard": { "present": [
      { "role": "button", "identifier": "weather.locationButton" },
      { "role": "button", "identifier": "weather.settingsButton" }] },
  "action": { "kind": "tap", "selector": { "role": "button", "identifier": "weather.settingsButton" } } }
```

Two identifiers that only the main screen has prove where the run starts. The app sets them with `.accessibilityIdentifier`.

## Selecting by state

SwiftUI exposes a picker segment's state as `value`, so the script can say which segment to tap and prove the previous tap worked:

```json
{ "id": "selectMetersPerSecond", "kind": "action",
  "guard": { "present": [
      { "role": "text", "label": "Settings" },
      { "role": "button", "label": "°C", "value": "selected" },
      { "role": "button", "label": "m/s", "value": "not selected" }] },
  "action": { "kind": "tap", "selector": { "role": "button", "label": "m/s", "value": "not selected" } } }
```

The guard requires `°C` to be selected, so the previous step's result is checked before this one acts. Toggles work the same way: a `switch` with value `1` or `0`.

## Typing, then waiting for the result

```json
{ "id": "searchLondon", "kind": "action",
  "guard": { "present": [{ "role": "text", "label": "Locations" }, { "role": "text-field", "identifier": "weather.locationsSheet" }] },
  "action": { "kind": "replaceText", "selector": { "role": "text-field", "identifier": "weather.locationsSheet" }, "valueKey": "city" } },
{ "id": "settleLondonResult", "kind": "wait",
  "guard": { "present": [{ "role": "text", "label": "Locations" },
                         { "role": "text-field", "identifier": "weather.locationsSheet", "value": "London" }] },
  "until": { "present": [{ "role": "text", "label": "1 RESULT" }, { "role": "button", "value": "not saved" }] },
  "timeoutMs": 10000 }
```

"London" lives in `values.city`, so it's masked in the evidence. The wait's guard proves the field now holds London, and `until` waits for the app's own result count, "1 RESULT".

## Claims that name printed text

```json
{ "id": "verifyPrecipitation", "kind": "checkpoint",
  "guard": { "present": [{ "identifier": "weather.precipitationDetail" }, { "role": "text", "label": "PRECIPITATION" }] },
  "assertions": [
    { "id": "chance", "claim": "The London precipitation detail shows 78% chance over the next 24 hours." },
    { "id": "total", "claim": "The detail shows 10.7 mm total expected." },
    { "id": "hours", "claim": "The detail shows 6 hrs of rain." },
    { "id": "storm", "claim": "The detail shows storm distance 14 km." },
    { "id": "lightning", "claim": "The detail shows lightning None." }] }
```

Each claim names one value the screen prints, and each scored 0.97–0.98 in the benchmark runs.

## Scrolling

```json
{ "id": "revealConditions", "kind": "action",
  "guard": { "present": [{ "role": "text", "identifier": "weather.heroLocation", "label": "London" },
                         { "role": "scroll-view", "identifier": "weather.mainScrollView" }] },
  "action": { "kind": "swipe", "selector": { "role": "scroll-view", "identifier": "weather.mainScrollView" }, "direction": "up" } }
```

Swipe within the scroll view, then guard on what should now be visible.
