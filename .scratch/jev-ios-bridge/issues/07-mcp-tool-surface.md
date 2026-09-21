# MCP tool surface and report format

Type: grilling
Status: open
Blocked by: 02, 04, 05, 06

## Question

What are the exact tools, their input schemas, and their outputs? Starting set: `jev_run_mobile_test`, `jev_inspect_device_state`, `jev_get_test_report`. Decide whether a run is synchronous inside one tool call or started and polled (given Claude Code's tool timeout), whether the report is the tool result or a resource, and the Markdown report layout: verdict first, failing step, the Jev judgment that led there, artifact paths, and a token ceiling.
