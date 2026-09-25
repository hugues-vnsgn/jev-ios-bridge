# Launch-state probe

The first live `w02` attempt ended `GUARD_MISSING` before an action or Jev request. Its setup capture showed Weather Settings with `mi` selected, but the runner's `prepare` called MobileBuildMCP `launch-app` and observed Weather main. The preserved [run report](../results/befc90e6-4e3c-4ec9-a12a-1a7153f4be54/report.md) and [metrics](../results/befc90e6-4e3c-4ec9-a12a-1a7153f4be54/metrics.json) record the inconclusive attempt.

Pinned MobileBuildMCP 2.7.1 launch-state probes on the dedicated simulator showed:

| App | Before `launch-app` | After `launch-app` | Captures |
| --- | --- | --- | --- |
| Weather | Settings sheet, Distance `mi` selected | San Francisco main; Settings sheet gone | [before](launch-weather-before.full.json) · [after](launch-weather-after.full.json) |
| Contacts | Search dismissed, field value `Search` | Prior Tessa Vale Search query restored in this probe | [before](launch-contacts-before-list.full.json) · [after](launch-contacts-after-list.full.json) |
| Contacts | Saved Nolan Ames card | Prior Tessa Vale Search query restored | [before](launch-contacts-before-card.full.json) · [after](launch-contacts-after-card.full.json) |
| Reminders | Signal Kit list with Charge lantern | My Lists with Signal Kit, one reminder | [before](launch-reminders-before-list.full.json) · [after](launch-reminders-after-list.full.json) |
| Diagnostic App | `Selected: Bread` | `Selected: None` | [before](launch-diagnostic-before.full.json) · [after](launch-diagnostic-after.full.json) |

An additional [Contacts launch capture](launch-contacts-plain.full.json) showed the plain list and placeholder `Search` after a later session; typing Tessa Vale and launching again still returned that plain list. The revised scripts accept either post-launch Contacts state and replace its one actionable Search text field. Weather opens Settings inside the script. Reminders starts from My Lists. Diagnostic App starts with no selection. [Nolan's search result](nolan-duplicate-result.full.json) also exposed two identical no-identifier photo-button refs at the same frame; the pinned tap-alias rule is opt-in and leaves the default strict selector behavior unchanged. These probes used only MobileBuildMCP and did not query Jev.
