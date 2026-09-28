# The Claude Code plugin

`plugin.json` here is the plugin's manifest, without its version. `npm run build:plugin` (from `scripts/build-plugin.mjs`) turns it into a plugin that Claude Code installs from a GitHub release:

- `build/plugin/jev-ios-bridge/`: the plugin root, with `dist/`, the guide, the `/test-ios` skill, and a runtime-only `package.json` and lockfile;
- `build/plugin/jev-ios-bridge-plugin-<version>.zip`: that folder, zipped;
- `build/plugin/marketplace.json`: an `archive` source for the zip's release URL, pinned by its SHA-256.

## What the plugin does on a developer's machine

- **On install,** Claude Code downloads the zip, checks its SHA-256, and runs `npm ci --ignore-scripts` from the lockfile. Dependencies aren't in the zip, so MobileBuildMCP's bundled AXe binary keeps its executable bit.
- **It asks for two values:** the TypeSafe key, stored in the system's secure storage, and the simulator's UDID. A missing key stops the MCP server with a message that names the setting.
- **The MCP server** runs `node dist/cli.js mcp` with `JEV_PROJECT_DIR` set to the project, so evidence lands in the project's `.jev-runs/`, not in the plugin's folder.
- **The skill** is `/jev-ios-bridge:test-ios`. The build points its guide and MobileBuildMCP paths at the plugin; the copy in `skills/` keeps the `node_modules` paths that npm installs use.

## Release

1. Bump the version in `package.json`, then run `npm run build:plugin`.
2. Attach the zip to the GitHub release `v<version>`, beside the npm tarball.
3. Copy `build/plugin/marketplace.json` to `.claude-plugin/marketplace.json` and merge it. Claude Code doesn't auto-update third-party marketplaces by default, so users update from `/plugin`, or turn on auto-update for this marketplace there.

## Try a build locally

```sh
cd build/plugin/jev-ios-bridge && npm ci --ignore-scripts && cd -
claude --plugin-dir build/plugin/jev-ios-bridge
```

`claude plugin validate build/plugin/jev-ios-bridge` checks the manifest.
