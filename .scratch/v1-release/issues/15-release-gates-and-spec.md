# Release gates and the spec's assembly

Type: grilling
Status: open
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
