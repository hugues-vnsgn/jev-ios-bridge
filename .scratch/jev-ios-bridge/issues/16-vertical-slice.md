# Vertical slice: one scenario end to end from Claude Code

Type: prototype
Status: open
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
