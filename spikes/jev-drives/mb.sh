#!/bin/bash
# Run the bridge's pinned MobileBuildMCP CLI (Jev key removed from the environment, telemetry off).
# Usage: spikes/jev-drives/mb.sh ui-automation tap --simulator-id <udid> --element-ref e3
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec env -u TYPESAFE_API_KEY MOBILEBUILDMCP_SENTRY_DISABLED=true node "$ROOT/node_modules/mobilebuildmcp/build/cli.js" "$@"
