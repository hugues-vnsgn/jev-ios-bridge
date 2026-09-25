# Release gates and the spec's assembly

Type: grilling
Status: resolved
Claimed by: Claude Code (owner session)
Blocked by: none

## Question

What exactly must Codex pass before tagging v1.0.0, and how is the release spec put together for it? Every input is now decided (see the map's Decisions so far). This ticket settles:

- **The gate list and its order.** Candidates:
  - the five go conditions from "Product assessment";
  - the golden-file contract tests (ADR-0005);
  - the ADR-0004 corpus gate, where applicable;
  - the speed target (three benchmark scripts, one run each);
  - the Compose checks, BFSOne or the `cmp` fallback;
  - a clean install from the tarball;
  - a walkthrough of the guide's quickstart;
  - the bridge changes collected from the tickets: `launchArgs`, rejecting `value: ''`, the lock fix, the dead-code removal, the key-free child environment, per-run watch tokens, the evidence `.gitignore`, the log pane, and the MIT license.
- **Which gates are measured once, and which are pass/fail checks.** State who decides when a gate fails for a reason outside the bridge.
- **Cost per run:** folded in from the map's fog. Should Codex record a measured cost per run from the benchmark re-runs for guide page 10, and in what form?
- **The spec's shape:** one file or several, where it lives, how it points at tickets and ADRs instead of restating them, and what Codex reports back.
- **Release notes and CHANGELOG contents**, and the upgrade notes from 0.1.0.

## Answer

Decided with the owner on 2026-09-25. The owner accepted every recommendation.

1. **Order of work:**
   1. the contract;
   2. correctness and data-handling fixes;
   3. the observation-shape experiment;
   4. tuning A, B, and C;
   5. new features (`launchArgs`, the log pane, and `logs`);
   6. docs, license, and CHANGELOG;
   7. final checks on the release candidate;
   8. tag and publish.

   The experiment comes before tuning and the final measurements because it can change what Jev sees.
2. **The speed target is report-only, and this resolves a conflict.** "Product assessment" listed "meet the speed target" as a go condition, while "Performance target and tuning plan" said a miss is reported. The owner chose report-only. What blocks: each benchmark script must not get slower than v0.1.0, and its verdict must not change except where ADR-0004's precedence legitimately changes it. A script under 30% faster is recorded, and the guide states the measured numbers.
3. **Blocking final checks:**
   - `npm run check` and CI;
   - the golden-file contract tests;
   - the three benchmark scripts keep their verdicts;
   - the six BFSOne scripts, or the five `cmp` fallback scripts, get their expected verdicts with no request to `api.beelogistics.com`;
   - a clean install from the packed tarball;
   - the quickstart walked for real through `/test-ios` on the diagnostic app, returning the expected **failed** report.

   **Report-only:** the speed numbers and the cost per run. **If a check fails for a cause outside the bridge** (MobileBuildMCP, TypeSafe, Xcode, BFSOne), Codex stops and asks the owner.
4. **Cost per run:** from the three benchmark runs and the Compose runs, Codex records Jev cost per checkpoint and per run, with the date and the pricing source, in guide page 10. Host-model cost is excluded because it depends on the developer's plan.
5. **Spec shape:** one file, [`release-spec.md`](../release-spec.md), shaped like the v0.1.0 release plan. It links tickets and ADRs instead of restating them, and has a checks table that Codex fills in with evidence.
6. **Merging:** one PR per work phase, merged to `main` after CI passes. The tag is made from the last merge commit, after the final checks pass on it.
7. **Release notes:**
   - `CHANGELOG.md` starts at 1.0.0 (Added, Changed, Removed, Fixed) and has "Upgrading from 0.1.0".
   - `docs/releases/v1.0.0.md` is the GitHub release text, shaped like the v0.1.0 notes.
   - It's a regular release, not a prerelease, with the tarball and its SHA-256, verified by a fresh download.
8. **Spec review:** a fresh agent with no conversation context checks the spec against every ticket and ADR for gaps and contradictions. Then the owner reads it and hands it to Codex.
