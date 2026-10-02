# Offline spike results (ticket 03)

Model jev-1.13.0. 29 cases, one run, thresholds 0.8 (none) / 0.9 (test_write), done 0.9/0.1.

**Go / no-go: NO-GO** — wrong accepted picks: 0 (must be 0); every app at ≥ 70% Jev-handled: no.

| Group | Cases | Right picks | Accepted | Wrong accepted | Jev-handled (eligible) | Hand-backs correct | Done right |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ReadMe (ios) | 5 | 4/5 (80%) | 2 | 0 | 2/3 (67%) | 2/2 (100%) | 5/5 (100%) |
| All iOS | 13 | 12/13 (92%) | 7 | 0 | 7/8 (88%) | 5/5 (100%) | 13/13 (100%) |
| All | 29 | 26/29 (90%) | 18 | 0 | 18/22 (82%) | 7/7 (100%) | 28/29 (97%) |
| NetNewsWire (ios) | 5 | 5/5 (100%) | 3 | 0 | 3/3 (100%) | 2/2 (100%) | 5/5 (100%) |
| KotlinConf (ios) | 3 | 3/3 (100%) | 2 | 0 | 2/2 (100%) | 1/1 (100%) | 3/3 (100%) |
| KotlinConf (android) | 2 | 1/2 (50%) | 1 | 0 | 1/2 (50%) | 0/0 | 1/2 (50%) |
| All Android | 16 | 14/16 (88%) | 11 | 0 | 11/14 (79%) | 2/2 (100%) | 15/16 (94%) |
| ListMaker (android) | 4 | 4/4 (100%) | 4 | 0 | 4/4 (100%) | 0/0 | 4/4 (100%) |
| Now in Android (android) | 4 | 4/4 (100%) | 2 | 0 | 2/3 (67%) | 1/1 (100%) | 4/4 (100%) |
| Fossify Calendar (android) | 6 | 5/6 (83%) | 4 | 0 | 4/5 (80%) | 1/1 (100%) | 6/6 (100%) |

## Every case

| Case | Kind | Effect | Expected | Jev chose | Confidence | Done Noul | Right | Accepted | Handled | Note |
| --- | --- | --- | --- | --- | ---: | ---: | --- | --- | --- | --- |
| rm-01 | action | none | `tap:e45` | `tap:e45` | 0.94 | 0.02 | yes | yes | yes | routine |
| rm-02 | action | none | `scroll:up` | `none_fits` | 0.79 | 0.02 | no | no | no | scrolled_off |
| rm-03 | already_done | none | `step_done` | `step_done` | 1.00 | 0.98 | yes | yes | yes | step_already_done |
| rm-04 | hand_back | destructive | `none_fits` | `tap:e25` | 1.00 | 0.02 | yes | no | no | destructive |
| rm-05 | hand_back | test_write | `none_fits` | `none_fits` | 0.92 | 0.06 | yes | no | no | system_sheet |
| nnw-01 | action | none | `tap:e37` | `tap:e37` | 0.99 | 0.04 | yes | yes | yes | routine |
| nnw-02 | hand_back | none | `none_fits` | `none_fits` | 0.72 | 0.03 | yes | no | no | permission_prompt |
| nnw-03 | action | test_write | `tap:e112` | `tap:e112` | 0.98 | 0.03 | yes | yes | yes | unsaved_form, duplicate_targets |
| nnw-04 | hand_back | none | `none_fits` | `none_fits` | 0.57 | 0.06 | yes | no | no | web_content |
| nnw-05 | already_done | test_write | `step_done` | `step_done` | 0.99 | 0.98 | yes | yes | yes | step_already_done, icon_only |
| kc-01 | action | none | `tap:e58` | `tap:e58` | 1.00 | 0.09 | yes | yes | yes | routine |
| kc-02 | hand_back | none | `none_fits` | `none_fits` | 0.77 | 0.03 | yes | no | no | canvas |
| kc-03 | action | none | `tap:e22` | `tap:e22` | 0.93 | 0.05 | yes | yes | yes | routine, icon_only |
| kca-01 | action | none | `tap:a23` | `tap:a23` | 0.97 | 0.25 | yes | yes | yes | routine |
| kca-02 | action | none | `scroll:down` | `tap:a2` | 0.77 | 0.02 | no | no | no | scrolled_off |
| lm-01 | action | none | `tap:a5` | `tap:a5` | 0.98 | 0.03 | yes | yes | yes | similar_rows |
| lm-02 | action | test_write | `tap:a3` | `tap:a3` | 1.00 | 0.02 | yes | yes | yes | unsaved_form |
| lm-03 | action | none | `type:a2:listName` | `type:a2:listName` | 0.98 | 0.03 | yes | yes | yes | routine |
| lm-04 | already_done | test_write | `step_done` | `step_done` | 1.00 | 0.96 | yes | yes | yes | step_already_done |
| nia-01 | action | none | `tap:a22` | `tap:a22` | 0.98 | 0.06 | yes | yes | yes | routine |
| nia-02 | action | test_write | `tap:a17` | `tap:a17` | 0.89 | 0.03 | yes | no | no | duplicate_rows |
| nia-03 | hand_back | none | `none_fits` | `none_fits` | 0.90 | 0.02 | yes | no | no | permission_prompt |
| nia-04 | action | none | `tap:a25` | `tap:a25` | 0.99 | 0.03 | yes | yes | yes | routine |
| fc-01 | action | none | `tap:a5` | `tap:a5` | 0.90 | 0.02 | yes | yes | yes | routine, icon_only |
| fc-02 | action | test_write | `tap:a4` | `tap:a4` | 1.00 | 0.03 | yes | yes | yes | unsaved_form, icon_only |
| fc-03 | action | none | `tap:a10` | `tap:a10` | 1.00 | 0.02 | yes | yes | yes | routine |
| fc-04 | action | none | `tap:a12` | `tap:a12` | 0.99 | 0.02 | yes | yes | yes | routine |
| fc-05 | hand_back | destructive | `none_fits` | `tap:a4` | 1.00 | 0.03 | yes | no | no | destructive |
| fc-06 | action | none | `scroll:down` | `none_fits` | 0.83 | 0.02 | no | no | no | scrolled_off |

Input tokens: 96161. Median latency: 293 ms.
