# Check 1: `npm run check` and CI

`npm run check` is the typecheck, the full test suite and the build. CI runs the same on Linux, where the tests that need the Mac's mobilecli program are skipped.

| Branch (PR) | Commit | Local `npm run check` | CI |
|---|---|---|---|
| phase 5 (#29) | `ef65410` | 502/502 | [pass](https://github.com/hugues-vnsgn/jev-ios-bridge/actions/runs/36806120075), [pass](https://github.com/hugues-vnsgn/jev-ios-bridge/actions/runs/36806124451) |
| phase 6 (#30) | `1244aaf` | 532/532 | [pass](https://github.com/hugues-vnsgn/jev-ios-bridge/actions/runs/36806122653), [pass](https://github.com/hugues-vnsgn/jev-ios-bridge/actions/runs/36806128714) |
| phase 7 (#31) | `ab3b722` | 564/564 | [pass](https://github.com/hugues-vnsgn/jev-ios-bridge/actions/runs/36806125452), [pass](https://github.com/hugues-vnsgn/jev-ios-bridge/actions/runs/36806129856) |
| phase 8 (#32) | `e181f2e` | 564/564 | [pass](https://github.com/hugues-vnsgn/jev-ios-bridge/actions/runs/36806130753), [pass](https://github.com/hugues-vnsgn/jev-ios-bridge/actions/runs/36806134724) |

Earlier, before Issues 30 and 31, the candidate `93c6ac7` passed 540/540 locally. None skipped in any local run.

**On `main`:** CI passed on the merge commit `ef3daa2` (#32, the last of the four), and on `d0bc224` after PR #33's fixes, which brought the local count to 566/566.
