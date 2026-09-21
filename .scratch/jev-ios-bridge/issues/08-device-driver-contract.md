# DeviceDriver contract and run lifecycle

Type: grilling
Status: open
Blocked by: 01

## Question

What does the `DeviceDriver` interface expose, and how does a run acquire and release a device? Decide: device selection rules (explicit UDID, else the single booted simulator, else boot a named default), whether the bridge installs a `.app` path or only launches an installed bundle id in v1, app state reset between runs (uninstall, `simctl privacy`, `simctl erase`), what SIGINT/SIGTERM and timeouts do to the app under test, and how concurrent runs on one simulator are prevented.
