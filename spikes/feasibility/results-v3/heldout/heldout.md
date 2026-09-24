# Jev feasibility held-out result

Frozen configuration: D; Choice threshold: 0.6.

Top-1 acceptable: 17/20 (requires 18).
Accepted: 10/20 (requires 16); wrong accepted: 0 (requires 0).
Known failing assertions: 20; false passes: 0 (requires 0).
Completion labels matched at the frozen Noul bounds: 12/20; assertion labels matched: 19/25.
Request failures: 0; observation failures: 0; response failures: 0. Coverage: 50.0%; accepted accuracy: 100.0%.
Input tokens: 95295; accumulated Jev latency: 6726 ms.

Exploratory ticket 07 bar: not met. The owner makes the architecture go/no-go decision.

| Case | Choice | Confidence | Top-1 correct | Gate | False passes | Error |
| --- | --- | ---: | --- | --- | ---: | --- |
| v3-w01-location-picker | type:e103:query | 0.970 | yes | accepted | 0 | — |
| v3-w02-oslo-search-result | tap:e108 | 0.960 | yes | accepted | 0 | — |
| v3-w03-oslo-main | tap:e89 | 0.850 | yes | completion-not-no | 0 | — |
| v3-w04-wind-mph-settings | tap:e110 | 1.000 | yes | accepted | 0 | — |
| v3-w05-wind-ms-selected | stop-goal | 0.990 | yes | accepted | 0 | — |
| v3-c01-two-iris-rows | tap:e79 | 0.340 | yes | choice-confidence | 0 | — |
| v3-c02-iris-old-card | tap:e11 | 0.560 | yes | choice-confidence | 0 | — |
| v3-c03-iris-email-offscreen | swipe:e25:down | 0.330 | no | choice-confidence | 0 | — |
| v3-c04-iris-old-email-visible | type:e108:email | 0.770 | yes | completion-not-no | 0 | — |
| v3-c05-iris-new-email-unsaved | stop-goal | 0.880 | no | completion-not-yes | 0 | — |
| v3-c06-iris-new-saved-card | stop-goal | 1.000 | yes | accepted | 0 | — |
| v3-c07-ada-search-ready | type:e116:query | 0.830 | yes | accepted | 0 | — |
| v3-c08-ada-no-results | stop-blocked | 0.580 | yes | choice-confidence | 0 | — |
| v3-r01-pack-batteries-notes-empty | type:e92:note | 0.830 | yes | completion-not-no | 0 | — |
| v3-r02-pack-batteries-notes-unsaved | stop-goal | 0.900 | no | completion-not-yes | 0 | — |
| v3-r03-pack-batteries-saved-note | stop-goal | 1.000 | yes | accepted | 0 | — |
| v3-d01-shop-empty | tap:e16 | 0.990 | yes | accepted | 0 | — |
| v3-d02-apple-selected | tap:e19 | 1.000 | yes | accepted | 0 | — |
| v3-d03-both-selected | tap:e22 | 0.360 | yes | choice-confidence | 0 | — |
| v3-d04-order-complete-total3 | stop-goal | 0.990 | yes | accepted | 0 | — |
