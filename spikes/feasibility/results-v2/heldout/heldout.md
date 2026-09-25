# Jev feasibility held-out result

Frozen configuration: D; Choice threshold: 0.6.

Top-1 acceptable: 16/20 (requires 18).
Accepted: 14/20 (requires 16); wrong accepted: 2 (requires 0).
Known failing assertions: 27; false passes: 0 (requires 0).
Completion labels matched at the frozen Noul bounds: 16/20; assertion labels matched: 34/38.
Request failures: 0; observation failures: 0; response failures: 0. Coverage: 70.0%; accepted accuracy: 85.7%.
Input tokens: 99089; accumulated Jev latency: 8389 ms.

Exploratory ticket 07 bar: not met. The owner makes the architecture go/no-go decision.

| Case | Choice | Confidence | Top-1 correct | Gate | False passes | Error |
| --- | --- | ---: | --- | --- | ---: | --- |
| v2-w01-celsius-main | tap:e89 | 0.990 | yes | accepted | 0 | — |
| v2-w02-celsius-settings | tap:e105 | 0.950 | yes | accepted | 0 | — |
| v2-w03-fahrenheit-selected | stop-goal | 0.920 | yes | accepted | 0 | — |
| v2-w04-fahrenheit-main | tap:e89 | 0.990 | yes | accepted | 0 | — |
| v2-w05-wind-pressure-defaults | tap:e109 | 0.970 | yes | accepted | 0 | — |
| v2-w06-wind-only-changed | tap:e113 | 0.980 | yes | accepted | 0 | — |
| v2-w07-wind-pressure-selected | stop-goal | 0.920 | yes | completion-not-yes | 0 | — |
| v2-c01-two-noah-rows | tap:e34 | 0.670 | no | accepted | 0 | — |
| v2-c02-northstar-card-old-email | tap:e11 | 0.960 | yes | accepted | 0 | — |
| v2-c03-email-offscreen | stop-blocked | 0.400 | no | choice-confidence | 0 | — |
| v2-c04-old-email-visible | type:e96:email | 0.880 | yes | accepted | 0 | — |
| v2-c05-new-email-unsaved | tap:e11 | 0.530 | yes | choice-confidence | 0 | — |
| v2-c06-northstar-card-new-email | stop-goal | 0.960 | yes | accepted | 0 | — |
| v2-c07-lena-search-ready | tap:e31 | 0.600 | no | accepted | 0 | — |
| v2-c08-lena-no-results | tap:e31 | 0.400 | no | choice-confidence | 0 | — |
| v2-r01-weekend-list | tap:e11 | 0.790 | yes | accepted | 0 | — |
| v2-r02-more-menu | tap:e56 | 0.750 | yes | accepted | 0 | — |
| v2-r03-list-info-old-name | type:e71:newName | 0.990 | yes | accepted | 0 | — |
| v2-r04-list-info-new-name | tap:e57 | 0.920 | yes | completion-not-no | 0 | — |
| v2-r05-renamed-list-saved | stop-goal | 0.920 | yes | completion-not-yes | 0 | — |
