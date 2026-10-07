# Parent phase accounting review fix

Verdict: host regression SHIP; actual native encoder boundary trace pending
supervisor integration check. No live/native ownership guarantee is inferred.

The host counted every observed `parent` record as an edge. The expanded native
format adds root provenance, factory results and equality observations, so valid
walks exhausted the 32-edge allowance early. `study.py` now validates the six
explicit parent phases and counts only `edge`. Exact field sets prevent metadata
from carrying disguised edge fields; source, Boolean, reference, bounds and
unestablished-scope fields are checked. Unknown or malformed phase records refuse.
Historical observed records remain supported only with the actual unphased edge
shape emitted at b0bdd34. Historical unphased failure records remain diagnostic.

The existing legacy test previously used only two synthetic fields; it now uses
the historical emitter's exact shape. Its 32-pass/33-fail assertions are unchanged.

| Case | Evidence | Result |
| --- | --- | --- |
| 32 edge observations plus 64 provenance/comparison observations | host-parent-red.log then host-parent-green.log | Failed before, accepted after |
| 33 genuine edges with metadata | host-parent-green.log | PARENT_EDGE_LIMIT |
| Unknown/null phase, missing fields, disguised edge, malformed comparison Boolean | host-parent-red.log then host-parent-green.log | PARENT_RECORD_INVALID after fix |
| Legacy exact unphased 32/33 edge records | host-parent-green.log | Accept32, reject33 |
| Full host suite | host-parent-suite.log | 125 passed, zero skips |

Commands:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s spikes/native-owner/host -p test_study.py -k parent_phase -v
JEV_NATIVE_OWNER_TSX_LOADER=/Users/hugues_mini/Codes/AgentTools/jev-ios-bridge/node_modules/tsx/dist/loader.mjs PYTHONDONTWRITEBYTECODE=1 python3 -W error::ResourceWarning -m unittest discover -s spikes/native-owner/host -p 'test_*.py' -v
```

This follow-up changed only `host/study.py`, `host/test_study.py` and these review
fix artifacts. Authored-file diff check passed. Tests used isolated ownership
roots; no device commands, default claim installation, or commits were performed.
Native worker will emit actual 32-edge/root and 33-attempt/limit traces for the
real parser, including normal completion framing separately from native facts.
