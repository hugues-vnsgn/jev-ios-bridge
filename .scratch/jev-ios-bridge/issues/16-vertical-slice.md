# Vertical slice: one scenario end to end from Claude Code

Type: prototype
Status: resolved
Blocked by: 11, 12, 15

## Question

Does the loop work end to end, as the resolved tickets specify it?

Build a throwaway slice that:

1. exposes the run tool over stdio;
2. launches a test app on the dedicated simulator;
3. observes it through MobileBuildMCP;
4. asks Jev at each step and acts on the answer;
5. checks one assertion;
6. writes the run log and returns the report.

Run it from Claude Code with `/test-ios`, on the Reminders or Contacts suite from MobileBuildMCP's `benchmarks/claude-ui`.

Resolve with:

- what worked;
- what the tickets got wrong;
- any decision that needs reopening.

Link the branch as an asset.


## Answer, 2026-09-25

The installed scripted path passed Contacts c01 in run `dc601a4a-f31c-4156-8524-90523e58949b`. Claude Opus 4.7 loaded the installed `/test-ios` skill, submitted a script deeply equal to the reviewed input through `start_scenario`, and read `get_report`. The bridge replaced the search text, observed the expected empty-results screen, and returned `passed / ALL_CHECKPOINTS_PASSED`. The assertion probability was 0.98, with 6,228 Jev input tokens. Cleanup completed and the device lock was absent.

The [measured summary](../../../spikes/benchmarks/results/c01-nina-no-results-bridge-1790302865475.json) records 36.709 seconds from the wrapper's external process timer, two MCP calls, and a client cost estimate of $0.2523095. This is a prepared-app installed-host smoke test, not the complete upstream Contacts benchmark. Whole-process comparison timing and benchmark equivalence belong to ticket 17.

Two earlier attempts remain preserved: keyboard modifier behavior produced a lowercase query and stopped at its value guard; a restored empty-results screen exposed two Search images and stopped at an ambiguous icon guard. The corrected guard accepts that valid startup state while rejecting saved cards and editors. No model threshold or assertion claim changed. The integration notes record keyboard recovery and the unresolved cause.

The original question's "Jev chooses each step" requirement is superseded by ADR-0003. The accepted bridge executes explicit actions and asks Jev only at checkpoints. Full-suite comparison, final production hardening, and release-package checks remain separate gates.
