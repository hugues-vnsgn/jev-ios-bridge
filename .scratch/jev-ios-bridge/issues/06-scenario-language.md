# Scenario and assertion language

Type: grilling
Status: open
Blocked by: 03

## Question

How does a developer (or Claude Code on their behalf) express a scenario? Free text only, or free text plus a structured list of assertions and optional preconditions (test account, seeded state)? Where do scenarios live when reused (a `scenarios/` dir in the app repo, or inline per call)?

Decide the minimal schema the MCP tool accepts, how an assertion is phrased so it becomes a clean Noul question, and whether ordering ("after login, the home tab is visible") is supported in v1.
