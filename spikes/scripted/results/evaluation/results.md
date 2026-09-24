# Scripted assertion feasibility result

Confident correct true claims: 22/24 (requires 20).
Confident correct false claims: 23/24 (requires 20).
False passes: 0 (requires 0). Wrong decisive failures: 0 (requires 0).
Paired-screen decisive coverage: 21/24. Uncertain claim answers: 3/48.
Requested screens: 24/24. Observation failures: 0; request failures: 0; response failures: 0; unknown failures: 0.
Input tokens: 111957; accumulated Jev latency: 11366 ms.
Exploratory ticket 21 bar: met. Owner architecture review remains required.

| Workflow | Screens | True correct | False correct | Paired decisive | False passes | Wrong decisive failures | Failures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| contacts-nolan-email | 3 | 3 | 2 | 2 | 0 | 0 | 0 |
| contacts-search-contrast | 3 | 3 | 3 | 3 | 0 | 0 | 0 |
| contacts-tessa-duplicate | 3 | 3 | 3 | 3 | 0 | 0 | 0 |
| diagnostic-bread-first | 3 | 3 | 3 | 3 | 0 | 0 | 0 |
| reminders-charge-lantern-note | 3 | 2 | 3 | 2 | 0 | 0 | 0 |
| reminders-signal-kit-list | 3 | 2 | 3 | 2 | 0 | 0 | 0 |
| weather-berlin-search | 3 | 3 | 3 | 3 | 0 | 0 | 0 |
| weather-lisbon-distance | 3 | 3 | 3 | 3 | 0 | 0 | 0 |

| Case | True probability | False probability | Paired decisive | Error |
| --- | ---: | ---: | --- | --- |
| s01-weather-ber-query | 0.980 | 0.070 | yes | — |
| s02-weather-berlin-results | 0.990 | 0.020 | yes | — |
| s03-weather-berlin-main | 0.980 | 0.010 | yes | — |
| s04-weather-lisbon-main | 0.980 | 0.010 | yes | — |
| s05-weather-lisbon-distance-mi | 0.980 | 0.010 | yes | — |
| s06-weather-lisbon-distance-km | 0.990 | 0.020 | yes | — |
| s07-contacts-tessa-duplicate-list | 0.980 | 0.050 | yes | — |
| s08-contacts-tessa-email-offscreen | 0.940 | 0.020 | yes | — |
| s09-contacts-tessa-old-email-visible | 0.960 | 0.010 | yes | — |
| s10-contacts-nolan-old-email-edit | 0.980 | 0.010 | yes | — |
| s11-contacts-nolan-new-email-unsaved | 0.960 | 0.220 | no | — |
| s12-contacts-nolan-new-email-saved | 0.980 | 0.020 | yes | — |
| s13-contacts-nina-query | 0.980 | 0.040 | yes | — |
| s14-contacts-nina-calder-no-results | 0.970 | 0.030 | yes | — |
| s15-contacts-tessa-search-two-results | 0.950 | 0.030 | yes | — |
| s16-reminders-new-list-blank | 0.800 | 0.020 | no | — |
| s17-reminders-signal-kit-unsaved | 0.980 | 0.060 | yes | — |
| s18-reminders-signal-kit-saved | 0.980 | 0.010 | yes | — |
| s19-reminders-charge-lantern-note-empty | 0.780 | 0.050 | no | — |
| s20-reminders-charge-lantern-note-unsaved | 0.980 | 0.010 | yes | — |
| s21-reminders-charge-lantern-note-saved | 0.980 | 0.020 | yes | — |
| s22-diagnostic-bread-selected | 0.980 | 0.020 | yes | — |
| s23-diagnostic-bread-apple-selected | 0.980 | 0.070 | yes | — |
| s24-diagnostic-bread-first-total2 | 0.980 | 0.020 | yes | — |
