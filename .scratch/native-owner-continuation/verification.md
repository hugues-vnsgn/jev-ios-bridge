# Continuation verification

Status: SHIP for the three scoped offline repairs; production acceptance remains blocked

| Behavior | Oracle | Verification | Result |
| --- | --- | --- | --- |
| Raw false validity cannot become true from a nonnil dictionary | Native lane spec | Real ObservationStudy regression red/green | PASS |
| Missing/malformed/error validity stays explicit | Native lane spec | Native policy tests | PASS |
| Independent app-root equality, mismatch and bounded termination | Native lane spec | Native policy tests; actual encoder records | PASS; full 32-edge traces independently parsed |
| Temp guard/evidence loss cannot admit a successor | Host lane spec | run_study red/green, both study profiles | PASS |
| Partial/changed persistent claim retains authority | Host lane spec | Filesystem failure/ownership tests | PASS |
| Metadata settled cleanup releases both claims in order | Existing cleanup contract and host lane spec | Host integration tests | PASS |
| Open stdin handles TERM/INT and original deadline | AXe lane spec | Actual CLI child regressions with bounded exit observation | PASS |
| Existing study behavior remains valid | Existing standalone spec | Affected host/native suites and generic iOS builds | PASS |
| Integration follows specification and repository standards | Lane specs and repository rules | Independent two-axis review | PASS; both native review findings fixed |

Live native guarantees and production acceptance remain unverified. No new simulator admission follows from local test results. All 23 production tickets retain their existing acceptance criteria.

## Verified results

- Native: 56 macOS policy tests, zero failures or skips. These exercise the real observation module through controlled native collaborators.
- Host: 125 tests passed in both author and independent supervisor runs with ResourceWarning treated as an error.
- Native/host integration: ordinary and pending streams pass. The full-boundary root32 and over32 streams have 1,144 and 1,208 records respectively, each with 32 sequential edges. Class completion remains synthetic test framing, not a native exit fact.
- AXe: `c40fe4c43110c322c46f9fac833086ceecfb784f`. 154 executed offline cases passed; 122 simulator E2E declarations skipped. Supervisor independently reran the focused suite and matched six source hashes plus the executable to its manifest. Structural skill checks pass; their security runner is missing and that scan is unverified.

The AXe candidate is at `/Users/hugues_mini/Codes/AgentTools/axe-reachability-upstream/.worktrees/fix/checked-input-cancellation`; its `.scratch/checked-input-cancellation/verification.md` preserves red/green evidence and exact commands. Local framework/header links are retained for rebuilds and excluded from its commit.

Both generic iOS profiles built successfully. Supervisor verification matched all 23 source hashes per receipt and all 22 native evidence artifacts. Receipts record the pre-commit base plus exact working-source hashes; those hashes, rather than the base commit alone, identify the built implementation. No simulator execution occurred.

## Remaining production gate

All 23 production tickets remain open. The installed private interfaces still lack accepted evidence for complete native ancestry, backend association/lifetime, operation-owned stopping and correlated input consumption/contact release. The inspected input handler can report success after notification timeout. A callback, a process exit or a locally tested refusal cannot satisfy those requirements.

Historical reference ownership remains unresolved. Its missing temporary guard and receipts are not native-settlement evidence, and the new persistent mechanism does not retroactively adopt that run. No live study, shared-service reset, cleanup, publication or external request was performed. The next production acceptance remains IDB 01's ordinary complete native ownership case, followed by the recorded dependency graph. The local repairs are complete; further acceptance requires applicable provider evidence/interface access, not another approval of these changes.
