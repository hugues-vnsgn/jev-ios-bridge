# Quickstart

Your first run, in about 15 minutes. You'll run the bundled diagnostic app, a two-screen SwiftUI shop with a planted bug: its order total is wrong. The run should come back **failed**, and the report should point at the wrong total.

## What you need

- A Mac with Xcode and an iOS simulator runtime.
- Node 24 or later.
- A TypeSafe API key (for Jev).
- Claude Code, if you want Claude to run the checks for you (step 6).

## 1. Install the bridge into your project

jev-ios-bridge ships as a GitHub release, not on npm. Download the tarball and install it:

```sh
cd /path/to/your-project
gh release download v1.0.0 -R hugues-vnsgn/jev-ios-bridge -p 'jev-ios-bridge-1.0.0.tgz'
npm install ./jev-ios-bridge-1.0.0.tgz
npx jev-ios-bridge --version     # 1.0.0
```

This also installs the device layer the bridge uses, `mobilebuildmcp@2.7.1`.

## 2. Keep your TypeSafe key private

```sh
umask 077
echo 'TYPESAFE_API_KEY=your-key-here' > .env
echo '.env' >> .gitignore
```

Load it by path when you run the bridge (`node --env-file=.env …`). Don't commit it or paste it into scripts.

## 3. Set a simulator aside for the bridge

Use a simulator that nothing else drives while a run is going:

```sh
xcrun simctl create jev-bridge "iPhone 17 Pro"     # prints its UUID
xcrun simctl boot <UUID>
```

Tell the bridge about it, in `.mobilebuildmcp/config.yaml`:

```yaml
schemaVersion: 1
sentryDisabled: true
sessionDefaults:
  simulatorId: <UUID>
```

You can also set `JEV_DEVICE_UDID=<UUID>`, or put `device.udid` in a script. The bridge refuses aliases like `booted`.

## 4. Build and install the diagnostic app

The diagnostic app's source isn't in the package. Get it from the release tag, then build and install it with MobileBuildMCP:

```sh
git clone --depth 1 --branch v1.0.0 https://github.com/hugues-vnsgn/jev-ios-bridge.git jev-ios-bridge-src
npx mobilebuildmcp simulator build-and-run \
  --project-path jev-ios-bridge-src/examples/diagnostic-app/DiagnosticApp.xcodeproj \
  --scheme DiagnosticApp --simulator-id <UUID>
```

The bridge never builds or installs apps. You do that, and the bridge restarts the installed app at the start of each run.

## 5. Run the script

```sh
node --env-file=.env node_modules/jev-ios-bridge/dist/cli.js run \
  jev-ios-bridge-src/examples/diagnostic-app/scenario.json
echo "exit code: $?"
```

What happens:

- A terminal window opens: the **log pane**, showing the app's own output. It stays open because this run fails; close it when you're done.
- The bridge taps Apple, then Bread, then Complete order, and checks the confirmation screen.
- The report prints: `failed`, reason `ASSERTION_FALSE`. The claim that the total is $5 scores near 0, and the observed screen text shows `Total: $3`.
- The exit code is `1`, for failed.

Evidence is in `.jev-runs/<run-id>/`: `report.json`, `run.jsonl`, and a screenshot per step. [Reports and evidence](07-reports-and-evidence.md) explains them.

## 6. Let Claude Code run it

Register the MCP server in your project's `.mcp.json`, using absolute paths:

```json
{
  "mcpServers": {
    "jev-ios-bridge": {
      "command": "node",
      "args": [
        "--env-file=/absolute/path/to/your-project/.env",
        "/absolute/path/to/your-project/node_modules/jev-ios-bridge/dist/cli.js",
        "mcp"
      ],
      "env": { "JEV_DEVICE_UDID": "<UUID>" }
    }
  }
}
```

Copy the skill into your project:

```sh
mkdir -p .claude/skills/test-ios
cp node_modules/jev-ios-bridge/skills/test-ios/SKILL.md .claude/skills/test-ios/
```

Restart Claude Code in the project, then ask:

```text
/test-ios run jev-ios-bridge-src/examples/diagnostic-app/scenario.json and tell me what the report says
```

Claude submits the script once, waits for the result, and reports the **failed** verdict with the $3 total as the evidence.

## Next

Point it at your own app: [prepare your app](02-prepare-your-app.md), then [make elements selectable](03-identifiers.md).
