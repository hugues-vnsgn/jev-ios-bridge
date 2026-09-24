# Jev feasibility tuning

Selected D at Choice confidence 0.9.

| Config | Threshold | Accepted / 10 | Wrong accepted | Top-1 correct / 10 | Input tokens | Qualifies |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| A | 0.6 | 8 | 2 | 7 | 17092 | no |
| A | 0.7 | 7 | 2 | 7 | 17092 | no |
| A | 0.8 | 6 | 1 | 7 | 17092 | no |
| A | 0.9 | 6 | 1 | 7 | 17092 | no |
| B | 0.6 | 8 | 2 | 7 | 17223 | no |
| B | 0.7 | 8 | 2 | 7 | 17223 | no |
| B | 0.8 | 6 | 1 | 7 | 17223 | no |
| B | 0.9 | 6 | 1 | 7 | 17223 | no |
| C | 0.6 | 7 | 1 | 8 | 39978 | no |
| C | 0.7 | 6 | 1 | 8 | 39978 | no |
| C | 0.8 | 5 | 1 | 8 | 39978 | no |
| C | 0.9 | 3 | 0 | 8 | 39978 | yes |
| D | 0.6 | 7 | 1 | 8 | 40109 | no |
| D | 0.7 | 7 | 1 | 8 | 40109 | no |
| D | 0.8 | 5 | 1 | 8 | 40109 | no |
| D | 0.9 | 4 | 0 | 8 | 40109 | yes |

Positional phrasing on the same tuning captures (excluded from threshold selection):

| Config | Acceptable top-1 / paired variants |
| --- | ---: |
| A | 1/1 |
| B | 1/1 |
| C | 0/1 |
| D | 0/1 |

Held-out cases were not evaluated. See tuning.json for per-case answers and failures.
