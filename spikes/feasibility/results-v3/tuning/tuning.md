# Jev feasibility tuning

Selected D at Choice confidence 0.6.

| Config | Threshold | Accepted / 10 | Wrong accepted | Top-1 correct / 10 | Input tokens | Qualifies |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| A | 0.6 | 5 | 0 | 8 | 17873 | yes |
| A | 0.7 | 5 | 0 | 8 | 17873 | yes |
| A | 0.8 | 4 | 0 | 8 | 17873 | yes |
| A | 0.9 | 3 | 0 | 8 | 17873 | yes |
| B | 0.6 | 4 | 0 | 9 | 18004 | yes |
| B | 0.7 | 3 | 0 | 9 | 18004 | yes |
| B | 0.8 | 3 | 0 | 9 | 18004 | yes |
| B | 0.9 | 3 | 0 | 9 | 18004 | yes |
| C | 0.6 | 5 | 0 | 9 | 34148 | yes |
| C | 0.7 | 5 | 0 | 9 | 34148 | yes |
| C | 0.8 | 5 | 0 | 9 | 34148 | yes |
| C | 0.9 | 3 | 0 | 9 | 34148 | yes |
| D | 0.6 | 5 | 0 | 10 | 34279 | yes |
| D | 0.7 | 5 | 0 | 10 | 34279 | yes |
| D | 0.8 | 5 | 0 | 10 | 34279 | yes |
| D | 0.9 | 3 | 0 | 10 | 34279 | yes |

Positional phrasing on the same tuning captures (excluded from threshold selection):

| Config | Acceptable top-1 / paired variants |
| --- | ---: |
| A | 1/1 |
| B | 1/1 |
| C | 1/1 |
| D | 1/1 |

Held-out cases were not evaluated. See tuning.json for per-case answers and failures.
