# Log pane (release check 8)

Checked on 2026-09-26 in the owner's logged-in desktop session, where Terminal is the handler for `.command` files. Full-screen captures were viewed but not committed, because they show the owner's desktop.

| Behaviour | Result |
| --- | --- |
| **Opens on a run** | Yes. `Log pane: opened in the default terminal.`, and the window shows the header, both log paths, and the app's `[app]` lines. |
| **Masks a supplied value** | Yes. A script value `probe = "UIAccessibilityLoaderWebShared"` shows in the simulator's own console line as `Class [value:probe] is implemented in both …` (window, and the `logs` attach output below). |
| **Stays open after a failure** | Yes. The quickstart's failed runs left their windows open with "This window stays open. Close it or press Ctrl-C." |
| **Closes after a pass** | **No, the window stays.** The pane printed "run finished: passed" and "This window closes in 3 s." and exited 3 s later, as designed. Terminal then showed `[Process completed]` and kept the window, because its profile setting is "When the shell exits: Don't close the window". The bridge can't close a Terminal window without macOS Automation permission, which the log pane decision avoided on purpose. Taken to the owner. |
| **`JEV_LOG_PANE=off`** | No window. `Log pane: no window (turned off with JEV_LOG_PANE=off). Follow the app's output with: … logs <run-id>` |
| **SSH** (`SSH_CONNECTION` set) | No window. `Log pane: no window (running over SSH). Follow …` |
| **`logs <run-id>` in a plain terminal** | Shows the same masked pane, ends with the passed line, and exits 3 s later. |
