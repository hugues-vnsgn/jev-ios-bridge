# Jev feasibility held-out result

Frozen configuration: D; Choice threshold: 0.9.

Top-1 acceptable: 15/20 (requires 18).
Accepted: 7/20 (requires 16); wrong accepted: 0 (requires 0).
Known failing assertions: 15; false passes: 0 (requires 0).
Completion labels matched at the frozen Noul bounds: 15/20; assertion labels matched: 19/21.
Request failures: 0; observation failures: 0; response failures: 0. Coverage: 35.0%; accepted accuracy: 100.0%.
Input tokens: 70574; accumulated Jev latency: 10938 ms.

Exploratory ticket 07 bar: not met. The owner makes the architecture go/no-go decision.

| Case | Choice | Confidence | Top-1 correct | Gate | False passes | Error |
| --- | --- | ---: | --- | --- | ---: | --- |
| h01-settings-about-general | tap:e32 | 0.660 | yes | choice-confidence | 0 | — |
| h02-settings-about-version-row | tap:e32 | 0.740 | yes | choice-confidence | 0 | — |
| h03-settings-about-build-detail | tap:e24 | 0.510 | no | choice-confidence | 0 | — |
| h04-settings-region-check | stop-goal | 0.990 | yes | accepted | 0 | — |
| h05-settings-keyboard-top | swipe:e22:down | 0.320 | no | choice-confidence | 0 | — |
| h06-settings-dictation-languages-row | tap:e54 | 0.880 | yes | choice-confidence | 0 | — |
| h07-settings-dictation-languages-open | stop-goal | 0.980 | yes | accepted | 0 | — |
| h08-contacts-find-list | tap:e55 | 0.920 | yes | accepted | 0 | — |
| h09-contacts-find-results | tap:e88 | 0.500 | yes | choice-confidence | 0 | — |
| h10-contacts-find-opened | stop-goal | 0.990 | yes | accepted | 0 | — |
| h11-contacts-edit-detail | tap:e11 | 0.990 | yes | accepted | 0 | — |
| h12-contacts-edit-form | tap:e30 | 0.560 | no | choice-confidence | 0 | — |
| h13-contacts-edit-saved | stop-goal | 0.890 | yes | choice-confidence | 0 | — |
| h14-reminders-complete-list | tap:e26 | 0.930 | yes | accepted | 0 | — |
| h15-reminders-complete-call-mira | stop-goal | 0.700 | no | choice-confidence | 0 | — |
| h16-reminders-complete-menu | tap:e67 | 0.380 | yes | choice-confidence | 0 | — |
| h17-reminders-complete-confirmed | stop-goal | 0.960 | yes | accepted | 0 | — |
| h18-reminders-missing-lists | tap:e10 | 0.810 | yes | choice-confidence | 0 | — |
| h19-reminders-missing-search | type:e66:query | 0.610 | yes | choice-confidence | 0 | — |
| h20-reminders-missing-no-results | swipe:e66:up | 0.260 | no | choice-confidence | 0 | — |
