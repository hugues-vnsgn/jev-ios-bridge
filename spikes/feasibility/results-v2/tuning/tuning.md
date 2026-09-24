# Jev feasibility tuning

Selected D at Choice confidence 0.6.

| Config | Threshold | Accepted / 10 | Wrong accepted | Top-1 correct / 10 | Input tokens | Qualifies |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| A | 0.6 | 3 | 0 | 8 | 18858 | yes |
| A | 0.7 | 3 | 0 | 8 | 18858 | yes |
| A | 0.8 | 3 | 0 | 8 | 18858 | yes |
| A | 0.9 | 3 | 0 | 8 | 18858 | yes |
| B | 0.6 | 4 | 0 | 8 | 18989 | yes |
| B | 0.7 | 4 | 0 | 8 | 18989 | yes |
| B | 0.8 | 4 | 0 | 8 | 18989 | yes |
| B | 0.9 | 4 | 0 | 8 | 18989 | yes |
| C | 0.6 | 4 | 0 | 8 | 34998 | yes |
| C | 0.7 | 4 | 0 | 8 | 34998 | yes |
| C | 0.8 | 2 | 0 | 8 | 34998 | yes |
| C | 0.9 | 2 | 0 | 8 | 34998 | yes |
| D | 0.6 | 6 | 0 | 9 | 35129 | yes |
| D | 0.7 | 6 | 0 | 9 | 35129 | yes |
| D | 0.8 | 5 | 0 | 9 | 35129 | yes |
| D | 0.9 | 3 | 0 | 9 | 35129 | yes |

Positional phrasing on the same tuning captures (excluded from threshold selection):

| Config | Acceptable top-1 / paired variants |
| --- | ---: |
| A | 1/1 |
| B | 1/1 |
| C | 1/1 |
| D | 0/1 |

Held-out cases were not evaluated. See tuning.json for per-case answers and failures.
