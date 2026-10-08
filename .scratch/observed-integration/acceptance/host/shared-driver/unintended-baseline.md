# Unintended baseline backend invocation

The initial ownership red harness passed the planned fakeBackend field before the old constructor implemented it, without the existing runner field. The old constructor therefore invoked Node with the installed pinned MobileBuildMCP CLI.

Selected identity: `ABCDEF00-0000-4000-8000-000000000001`, a synthetic fixture UUID. App bundle: `dev.fixture`.

Launch arguments: `simulator launch-app --simulator-id ABCDEF00-0000-4000-8000-000000000001 --bundle-id dev.fixture --output json`. The old error path subsequently invokes `simulator list --output json`.

Observed result: DeviceCliError `Failed to launch app.`; the test exited 1. Original raw harness output is preserved in ownership-red.log. The old parse path did not retain raw vendor stdout or backend commands, so side effects cannot be certified. No cleanup or diagnostic device operation was issued afterward. Root was informed immediately.

Corrected baseline and subsequent fixtures explicitly supply the existing runner and fake opener plus the new fake backend dependencies. Corrected baseline output is ownership-red-fake.log.
